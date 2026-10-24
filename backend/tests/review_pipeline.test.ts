import request from 'supertest';
import axios from 'axios';
import app from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { Organisation } from '../src/models/Organisation';
import { User } from '../src/models/User';
import { KnowledgeSource } from '../src/models/KnowledgeSource';
import { Content } from '../src/models/Content';
import { ContentVersion } from '../src/models/ContentVersion';
import { AuditEvent } from '../src/models/AuditEvent';
import { AuthService } from '../src/services/auth.service';

describe('Phase 6: End-to-End Content Review & Versioning Pipeline', () => {
  let creatorToken: string;
  let reviewerToken: string;
  let orgId: string;
  let contentId: string;

  beforeAll(async () => {
    await connectDB();
    await Organisation.deleteMany({});
    await User.deleteMany({});
    await KnowledgeSource.deleteMany({});
    await Content.deleteMany({});
    await ContentVersion.deleteMany({});
    await AuditEvent.deleteMany({});

    // 1. Setup Organisation
    const { user: admin } = await AuthService.registerOrgAndAdmin({
      orgName: 'Acme Test Corp',
      orgSlug: 'acme-test',
      adminName: 'Admin User',
      adminEmail: 'admin@acmetest.com',
      adminPassword: 'Password123!',
    });
    orgId = admin.organisationId.toString();

    // 2. Setup Creator & Reviewer
    const creator = await AuthService.createUserInOrg({
      organisationId: orgId,
      name: 'Creator One',
      email: 'creator@acmetest.com',
      password: 'Password123!',
      role: 'creator',
      creatorUserId: admin._id.toString(),
    });
    creatorToken = AuthService.generateToken(creator);

    const reviewer = await AuthService.createUserInOrg({
      organisationId: orgId,
      name: 'Reviewer One',
      email: 'reviewer@acmetest.com',
      password: 'Password123!',
      role: 'reviewer',
      creatorUserId: admin._id.toString(),
    });
    reviewerToken = AuthService.generateToken(reviewer);

    // 3. Seed an approved guideline
    await KnowledgeSource.create({
      organisationId: orgId,
      title: 'Prohibition of Absolute Guarantees',
      sourceType: 'guideline',
      status: 'approved',
      content: 'Absolute performance guarantees are strictly prohibited across all marketing and product copy.',
      productScope: 'Global',
      version: 1,
      uploadedBy: admin._id,
      approvedBy: admin._id,
      approvedAt: new Date(),
    });

    // Mock external Python AI service response for deterministic integration testing
    jest.spyOn(axios, 'post').mockImplementation(async (url: string, data: any) => {
      const isFailover = Boolean(data?.force_failover);
      return {
        data: {
          review_id: `rev_mock_${Date.now()}`,
          status: 'completed',
          provider: isFailover ? 'OpenAI GPT-4o-mini (Failover)' : 'Google Gemini 2.0 (Primary)',
          model: isFailover ? 'gpt-4o-mini' : 'gemini-2.0-flash',
          latency_ms: 85,
          retry_count: isFailover ? 1 : 0,
          is_demo_mode: false,
          findings: [
            {
              category: 'guarantee',
              severity: 'critical',
              flagged_text: 'guarantees 100% accuracy',
              explanation: 'Absolute performance guarantees are prohibited without documented legal exception.',
              guideline: 'Prohibition of Absolute Guarantees',
              source_ids: ['src_test_01'],
              source_excerpts: ['Absolute performance guarantees are strictly prohibited.'],
              confidence: 0.98,
              suggested_correction: 'achieved 94% accuracy in benchmark testing',
              requires_human_review: true,
            },
          ],
          summary: { total_findings: 1, critical: 1, high: 0, medium: 0, low: 0, info: 0 },
        },
      } as any;
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await disconnectDB();
  });

  it('Step 1: Creator creates content draft with non-compliant copy (Version 1)', async () => {
    const res = await request(app)
      .post('/api/content')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        title: 'Q4 Product Launch Announcement',
        contentType: 'website',
        body: 'Our product guarantees 100% accuracy for every customer. It never fails.',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.content.currentVersion).toBe(1);
    expect(res.body.data.content.status).toBe('DRAFT');
    contentId = res.body.data.content._id;
  });

  it('Step 2: Trigger AI Governance Review -> flags critical findings and sets NEEDS_REVISION', async () => {
    const res = await request(app)
      .post(`/api/content/${contentId}/review`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ simulateFailover: false });

    expect(res.status).toBe(200);
    expect(res.body.data.content.findings.length).toBeGreaterThan(0);
    expect(res.body.data.content.status).toBe('NEEDS_REVISION');

    const findings = res.body.data.content.findings;
    const critical = findings.find((f: any) => f.severity === 'critical');
    expect(critical).toBeDefined();
    expect(critical.flaggedText).toContain('guarantees 100% accuracy');
  });

  it('Step 3: Trigger review with failover flag -> engages secondary fallback without corrupting state', async () => {
    const res = await request(app)
      .post(`/api/content/${contentId}/review`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ simulateFailover: true });

    expect(res.status).toBe(200);
    expect(res.body.data.reviewResult.retry_count).toBe(1);
  });

  it('Step 4: Creator accepts suggestion & revises content -> creates Version 2 snapshot', async () => {
    const res = await request(app)
      .put(`/api/content/${contentId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        body: 'Our product achieved 94% accuracy in benchmark testing under documented test conditions.',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.content.currentVersion).toBe(2);
    expect(res.body.data.version.versionNumber).toBe(2);

    // Verify history endpoint retrieves both versions
    const histRes = await request(app)
      .get(`/api/content/${contentId}`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(histRes.status).toBe(200);
    expect(histRes.body.data.versions.length).toBe(2);
  });

  it('Step 5: Creator submits Version 2 for human approval', async () => {
    const res = await request(app)
      .post(`/api/content/${contentId}/submit`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.data.content.status).toBe('PENDING_APPROVAL');
  });
});
