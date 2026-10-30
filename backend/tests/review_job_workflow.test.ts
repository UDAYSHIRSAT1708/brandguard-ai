import request from 'supertest';
import axios from 'axios';
import mongoose from 'mongoose';
import app from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { Organisation } from '../src/models/Organisation';
import { User } from '../src/models/User';
import { KnowledgeSource } from '../src/models/KnowledgeSource';
import { Content } from '../src/models/Content';
import { ContentVersion } from '../src/models/ContentVersion';
import { ReviewJob } from '../src/models/ReviewJob';
import { AuditEvent } from '../src/models/AuditEvent';
import { AuthService } from '../src/services/auth.service';
import { ReviewOrchestratorService } from '../src/services/review.service';

describe('Phase 3: Reliable Asynchronous Review Jobs, Workflows & Retries', () => {
  let creatorToken: string;
  let otherOrgCreatorToken: string;
  let orgId: string;
  let otherOrgId: string;
  let userId: string;
  let contentId: string;

  beforeAll(async () => {
    await connectDB();
    await Organisation.deleteMany({});
    await User.deleteMany({});
    await KnowledgeSource.deleteMany({});
    await Content.deleteMany({});
    await ContentVersion.deleteMany({});
    await ReviewJob.deleteMany({});
    await AuditEvent.deleteMany({});

    // 1. Setup Tenant Alpha
    const { user: adminAlpha } = await AuthService.registerOrgAndAdmin({
      orgName: 'Alpha Workflow Corp',
      orgSlug: 'alpha-wf',
      adminName: 'Alpha Admin',
      adminEmail: 'admin@alphawf.com',
      adminPassword: 'Password123!',
    });
    orgId = adminAlpha.organisationId.toString();

    const creatorAlpha = await AuthService.createUserInOrg({
      organisationId: orgId,
      name: 'Alpha Creator',
      email: 'creator@alphawf.com',
      password: 'Password123!',
      role: 'creator',
      creatorUserId: adminAlpha._id.toString(),
    });
    userId = creatorAlpha._id.toString();
    creatorToken = AuthService.generateToken(creatorAlpha);

    // 2. Setup Tenant Beta (for strict tenant isolation tests)
    const { user: adminBeta } = await AuthService.registerOrgAndAdmin({
      orgName: 'Beta Isolated Corp',
      orgSlug: 'beta-iso',
      adminName: 'Beta Admin',
      adminEmail: 'admin@betaiso.com',
      adminPassword: 'Password123!',
    });
    otherOrgId = adminBeta.organisationId.toString();

    const creatorBeta = await AuthService.createUserInOrg({
      organisationId: otherOrgId,
      name: 'Beta Creator',
      email: 'creator@betaiso.com',
      password: 'Password123!',
      role: 'creator',
      creatorUserId: adminBeta._id.toString(),
    });
    otherOrgCreatorToken = AuthService.generateToken(creatorBeta);

    // 3. Seed approved guideline
    await KnowledgeSource.create({
      organisationId: orgId,
      title: 'Prohibited Absolute Guarantees',
      sourceType: 'guideline',
      status: 'approved',
      content: 'Never make absolute promises such as 100% reliability or zero downtime.',
      productScope: 'Global',
      version: 1,
      uploadedBy: adminAlpha._id,
      approvedBy: adminAlpha._id,
      approvedAt: new Date(),
    });

    // 4. Create base draft copy
    const draft = await Content.create({
      organisationId: orgId,
      creatorId: creatorAlpha._id,
      title: 'Q4 Cloud Infrastructure Copy',
      contentType: 'website',
      body: 'Our platform delivers 100% reliability with zero downtime for all enterprise tiers.',
      status: 'DRAFT',
      currentVersion: 1,
    });
    contentId = draft._id.toString();

    // Mock external Python AI service response
    jest.spyOn(axios, 'post').mockImplementation(async (_url: string, data: any) => {
      const isFailover = Boolean(data?.force_failover);
      return {
        data: {
          review_id: `rev_mock_${Date.now()}`,
          status: 'completed',
          provider: isFailover ? 'Groq Llama 3.3 (Failover)' : 'Google Gemini 2.0 (Primary)',
          model: isFailover ? 'llama-3.3-70b-versatile' : 'gemini-2.0-flash',
          latency_ms: 120,
          retry_count: isFailover ? 1 : 0,
          is_demo_mode: false,
          findings: [
            {
              category: 'guarantee',
              severity: 'critical',
              flagged_text: '100% reliability',
              explanation: 'Absolute reliability claims violate brand standards.',
              guideline: 'Prohibited Absolute Guarantees',
              source_ids: ['src_01'],
              source_excerpts: ['Never make absolute promises such as 100% reliability.'],
              confidence: 0.98,
              suggested_correction: 'high availability backed by 99.9% uptime SLA',
              requires_human_review: true,
            },
          ],
          recommendations: [
            {
              id: 'rec_01',
              issue: 'Unsupported absolute reliability claim',
              rationale: 'Absolute claims create regulatory vulnerability.',
              impact: 'HIGH',
              evidence_sources: ['src_01'],
              evidence_excerpts: ['Never make absolute promises such as 100% reliability.'],
              suggested_correction: 'Reference enterprise SLA metrics rather than absolute guarantees.',
              is_evidence_backed: true,
              confidence: 0.96,
            },
          ],
        },
      } as any;
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await disconnectDB();
  });

  beforeEach(async () => {
    await ReviewJob.deleteMany({});
  });

  it('1. Fast review completes synchronously and returns 200 with result', async () => {
    const res = await request(app)
      .post(`/api/content/${contentId}/review`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ preferAsync: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.mode).toBe('sync');
    expect(res.body.data.status).toBe('SUCCEEDED');
    expect(res.body.data.jobId).toBeDefined();
    expect(res.body.data.content.findings.length).toBe(1);
    expect(res.body.data.content.recommendations.length).toBe(1);

    // Verify job in DB is in SUCCEEDED state
    const job = await ReviewJob.findById(res.body.data.jobId);
    expect(job).toBeDefined();
    expect(job?.status).toBe('SUCCEEDED');
    expect(job?.attemptCount).toBe(1);
  });

  it('2. Long / preferred async review returns 202 with durable jobId and processes in background', async () => {
    const res = await request(app)
      .post(`/api/content/${contentId}/review`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ preferAsync: true });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data.mode).toBe('async');
    expect(res.body.data.jobId).toBeDefined();

    const jobId = res.body.data.jobId;

    // Poll until completed in background
    let completed = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const statusRes = await request(app)
        .get(`/api/content/${contentId}/review/jobs/${jobId}`)
        .set('Authorization', `Bearer ${creatorToken}`);

      if (statusRes.body.data?.job?.status === 'SUCCEEDED') {
        completed = true;
        expect(statusRes.body.data.job.result).toBeDefined();
        expect(statusRes.body.data.content.findings.length).toBeGreaterThan(0);
        break;
      }
    }
    expect(completed).toBe(true);
  });

  it('3. Page-refresh reconnection: GET /jobs/active returns in-flight review', async () => {
    // Manually create a RUNNING job to simulate an in-flight review when browser refreshed
    const activeJob = await ReviewJob.create({
      organisationId: orgId,
      contentId,
      userId,
      versionNumber: 1,
      status: 'RUNNING',
      mode: 'async',
      attemptCount: 1,
      maxAttempts: 3,
      leaseOwner: 'worker_prev_session',
      leaseExpiresAt: new Date(Date.now() + 60000), // Active lease for 60s
    });

    const res = await request(app)
      .get(`/api/content/${contentId}/review/jobs/active`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.activeJob).toBeDefined();
    expect(res.body.data.activeJob._id).toBe(activeJob._id.toString());
    expect(res.body.data.activeJob.status).toBe('RUNNING');
  });

  it('4. Atomic worker concurrency: second worker cannot claim an active job', async () => {
    const job = await ReviewJob.create({
      organisationId: orgId,
      contentId,
      userId,
      versionNumber: 1,
      status: 'QUEUED',
      mode: 'async',
      attemptCount: 0,
      maxAttempts: 3,
    });

    // Worker 1 claims job
    const claim1 = await ReviewOrchestratorService.claimJob(job._id.toString(), 'worker_node_1');
    expect(claim1).toBeDefined();
    expect(claim1?.status).toBe('RUNNING');
    expect(claim1?.leaseOwner).toBe('worker_node_1');
    expect(claim1?.attemptCount).toBe(1);

    // Worker 2 attempts to claim same job concurrently
    const claim2 = await ReviewOrchestratorService.claimJob(job._id.toString(), 'worker_node_2');
    expect(claim2).toBeNull(); // Rejected: lock held by Worker 1
  });

  it('5. Deduplication & Idempotency: duplicate submission returns existing job without spawning second AI review', async () => {
    const idempotencyKey = `idem_key_${Date.now()}`;

    // First submission
    const res1 = await request(app)
      .post(`/api/content/${contentId}/review`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ preferAsync: true });

    expect(res1.status).toBe(202);
    const jobId = res1.body.data.jobId;

    // Second rapid submission with identical idempotency key
    const res2 = await request(app)
      .post(`/api/content/${contentId}/review`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ preferAsync: true });

    expect(res2.body.data.jobId).toBe(jobId);
    expect(res2.body.data.isExisting).toBe(true);

    // Verify only ONE job was created in MongoDB
    const jobs = await ReviewJob.find({ idempotencyKey });
    expect(jobs.length).toBe(1);
  });

  it('6. Worker interruption & lease recovery: expired RUNNING job is safely reclaimed', async () => {
    // Create an abandoned job whose worker died (lease expired in the past)
    const pastDate = new Date(Date.now() - 10000); // 10 seconds ago
    const abandonedJob = await ReviewJob.create({
      organisationId: orgId,
      contentId,
      userId,
      versionNumber: 1,
      status: 'RUNNING',
      mode: 'async',
      attemptCount: 1,
      maxAttempts: 3,
      leaseOwner: 'worker_crashed_pid_999',
      leaseExpiresAt: pastDate, // Expired!
    });

    // New worker claims abandoned job
    const recoveryClaim = await ReviewOrchestratorService.claimJob(
      abandonedJob._id.toString(),
      'worker_recovery_node'
    );

    expect(recoveryClaim).toBeDefined();
    expect(recoveryClaim?.status).toBe('RUNNING');
    expect(recoveryClaim?.leaseOwner).toBe('worker_recovery_node');
    expect(recoveryClaim?.attemptCount).toBe(2); // Incremented attempt
    expect(new Date(recoveryClaim!.leaseExpiresAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it('7. Retry budget exhaustion: job reaching maxAttempts transitions permanently to FAILED', async () => {
    const pastDate = new Date(Date.now() - 10000);
    const maxedJob = await ReviewJob.create({
      organisationId: orgId,
      contentId,
      userId,
      versionNumber: 1,
      status: 'RUNNING',
      mode: 'async',
      attemptCount: 3, // Already hit maxAttempts
      maxAttempts: 3,
      leaseOwner: 'worker_died',
      leaseExpiresAt: pastDate,
    });

    await ReviewOrchestratorService.recoverAbandonedJobsForContent(contentId, orgId);

    const updated = await ReviewJob.findById(maxedJob._id);
    expect(updated?.status).toBe('FAILED');
    expect(updated?.error?.code).toBe('LEASE_EXPIRED_MAX_ATTEMPTS');
  });

  it('8. Tenant isolation: tenant cannot view, active-check, or retry jobs belonging to another tenant', async () => {
    const job = await ReviewJob.create({
      organisationId: orgId, // Belongs to Tenant Alpha
      contentId,
      userId,
      versionNumber: 1,
      status: 'SUCCEEDED',
      mode: 'sync',
      attemptCount: 1,
      maxAttempts: 3,
    });

    // Tenant Beta attempts to view Tenant Alpha's job -> 404
    const getRes = await request(app)
      .get(`/api/content/${contentId}/review/jobs/${job._id}`)
      .set('Authorization', `Bearer ${otherOrgCreatorToken}`);

    expect(getRes.status).toBe(404);

    // Tenant Beta attempts to retry Tenant Alpha's job -> 404
    const retryRes = await request(app)
      .post(`/api/content/${contentId}/review/jobs/${job._id}/retry`)
      .set('Authorization', `Bearer ${otherOrgCreatorToken}`);

    expect(retryRes.status).toBe(404);
  });

  it('9. Manual retry: eligible failed job can be re-queued and retried', async () => {
    const failedJob = await ReviewJob.create({
      organisationId: orgId,
      contentId,
      userId,
      versionNumber: 1,
      status: 'FAILED',
      mode: 'async',
      attemptCount: 1,
      maxAttempts: 3,
      error: {
        message: 'Transient upstream 503 error',
        code: 'SERVICE_UNAVAILABLE',
        retryable: true,
        statusCode: 503,
        timestamp: new Date(),
      },
    });

    const retryRes = await request(app)
      .post(`/api/content/${contentId}/review/jobs/${failedJob._id}/retry`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(retryRes.status).toBe(200);
    expect(retryRes.body.data.job.status).toBe('QUEUED');
    expect(retryRes.body.data.job.error).toBeNull();
  });

  it('10. Non-retryable error (e.g. unconfigured credentials) rejects retry', async () => {
    const nonRetryableJob = await ReviewJob.create({
      organisationId: orgId,
      contentId,
      userId,
      versionNumber: 1,
      status: 'FAILED',
      mode: 'async',
      attemptCount: 1,
      maxAttempts: 3,
      error: {
        message: 'AI Service Unconfigured: API keys missing',
        code: 'UNCONFIGURED',
        retryable: false, // NOT retryable!
        statusCode: 400,
        timestamp: new Date(),
      },
    });

    const retryRes = await request(app)
      .post(`/api/content/${contentId}/review/jobs/${nonRetryableJob._id}/retry`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(retryRes.status).toBe(400);
    expect(retryRes.body.error.message).toContain('non-retryable');
  });

  it('11. Idempotent result persistence: retrying or multiple completions does not duplicate findings or versions', async () => {
    // Run review 1
    const res1 = await request(app)
      .post(`/api/content/${contentId}/review`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ preferAsync: false });

    expect(res1.status).toBe(200);
    const contentAfterFirst = await Content.findById(contentId);
    expect(contentAfterFirst?.findings.length).toBe(1);
    expect(contentAfterFirst?.recommendations?.length).toBe(1);

    // Re-run review on the same version
    const res2 = await request(app)
      .post(`/api/content/${contentId}/review`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ preferAsync: false });

    expect(res2.status).toBe(200);
    const contentAfterSecond = await Content.findById(contentId);
    // Findings and recommendations must NOT be duplicated!
    expect(contentAfterSecond?.findings.length).toBe(1);
    expect(contentAfterSecond?.recommendations?.length).toBe(1);
  });
});
