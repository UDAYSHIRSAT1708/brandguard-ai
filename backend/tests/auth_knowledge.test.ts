import request from 'supertest';
import app from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { Organisation } from '../src/models/Organisation';
import { User } from '../src/models/User';
import { KnowledgeSource } from '../src/models/KnowledgeSource';
import { Content } from '../src/models/Content';
import { ContentVersion } from '../src/models/ContentVersion';
import { AuditEvent } from '../src/models/AuditEvent';

describe('Phase 3: Auth, RBAC, Multi-Tenancy & Knowledge Management', () => {
  let orgAAdminToken: string;
  let orgACreatorToken: string;
  let orgAReviewerToken: string;
  let orgBAdminToken: string;

  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    await connectDB();
    await Organisation.deleteMany({});
    await User.deleteMany({});
    await KnowledgeSource.deleteMany({});
    await Content.deleteMany({});
    await ContentVersion.deleteMany({});
    await AuditEvent.deleteMany({});

    // Register Organisation A
    const resOrgA = await request(app).post('/api/auth/register').send({
      orgName: 'Alpha Corp',
      orgSlug: 'alpha-corp',
      adminName: 'Alice Admin',
      adminEmail: 'alice@alpha.com',
      adminPassword: 'Password123!',
    });
    expect(resOrgA.status).toBe(201);
    orgAAdminToken = resOrgA.body.data.token;
    orgAId = resOrgA.body.data.user.organisationId;

    // Register Organisation B (for tenant isolation tests)
    const resOrgB = await request(app).post('/api/auth/register').send({
      orgName: 'Beta Inc',
      orgSlug: 'beta-inc',
      adminName: 'Bob Admin',
      adminEmail: 'bob@beta.com',
      adminPassword: 'Password123!',
    });
    expect(resOrgB.status).toBe(201);
    orgBAdminToken = resOrgB.body.data.token;
    orgBId = resOrgB.body.data.user.organisationId;

    // Login Alice to verify login endpoint
    const resLogin = await request(app).post('/api/auth/login').send({
      email: 'alice@alpha.com',
      password: 'Password123!',
    });
    expect(resLogin.status).toBe(200);
    expect(resLogin.body.data).toHaveProperty('token');

    // Create Creator and Reviewer in Org A via direct AuthService or mock
    const { AuthService } = await import('../src/services/auth.service');
    const creatorUser = await AuthService.createUserInOrg({
      organisationId: orgAId,
      name: 'Charlie Creator',
      email: 'charlie@alpha.com',
      password: 'Password123!',
      role: 'creator',
      creatorUserId: resOrgA.body.data.user.id,
    });
    orgACreatorToken = AuthService.generateToken(creatorUser);

    const reviewerUser = await AuthService.createUserInOrg({
      organisationId: orgAId,
      name: 'Rachel Reviewer',
      email: 'rachel@alpha.com',
      password: 'Password123!',
      role: 'reviewer',
      creatorUserId: resOrgA.body.data.user.id,
    });
    orgAReviewerToken = AuthService.generateToken(reviewerUser);
  });

  afterAll(async () => {
    await disconnectDB();
  });

  describe('Multi-Tenant Data Isolation', () => {
    let orgASourceId: string;

    it('Admin in Org A creates an approved guideline', async () => {
      const res = await request(app)
        .post('/api/knowledge')
        .set('Authorization', `Bearer ${orgAAdminToken}`)
        .send({
          title: 'Alpha Secret Brand Rule',
          sourceType: 'guideline',
          content: 'Alpha Corp never uses lowercase letters in product names.',
          productScope: 'Global',
        });
      expect(res.status).toBe(201);
      orgASourceId = res.body.data.source._id;
    });

    it('Admin in Org B CANNOT view or access Org A knowledge source', async () => {
      const res = await request(app)
        .get('/api/knowledge')
        .set('Authorization', `Bearer ${orgBAdminToken}`);

      expect(res.status).toBe(200);
      const sources = res.body.data.sources;
      const found = sources.find((s: any) => s._id === orgASourceId);
      expect(found).toBeUndefined();
    });
  });

  describe('Role Enforcement & Permissions', () => {
    it('Creator CANNOT approve knowledge sources (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/knowledge/fake_id/approve')
        .set('Authorization', `Bearer ${orgACreatorToken}`)
        .send();
      expect(res.status).toBe(403);
    });

    it('Creator creates content draft and submits it', async () => {
      const res = await request(app)
        .post('/api/content')
        .set('Authorization', `Bearer ${orgACreatorToken}`)
        .send({
          title: 'Social Launch Teaser',
          contentType: 'social',
          body: 'Check out our new solution today.',
        });
      expect(res.status).toBe(201);
      expect(res.body.data.content.currentVersion).toBe(1);
      expect(res.body.data.version.versionNumber).toBe(1);

      const contentId = res.body.data.content._id;

      // Submit for review
      const subRes = await request(app)
        .post(`/api/content/${contentId}/submit`)
        .set('Authorization', `Bearer ${orgACreatorToken}`)
        .send();
      expect(subRes.status).toBe(200);
      expect(subRes.body.data.content.status).toBe('PENDING_APPROVAL');

      // Creator attempts to approve own content -> must fail with 403 (unauthorized role)
      const approveRes = await request(app)
        .post(`/api/approvals/${contentId}/approve`)
        .set('Authorization', `Bearer ${orgACreatorToken}`)
        .send({ versionNumber: 1 });
      expect(approveRes.status).toBe(403);

      // Reviewer approves version 1 -> succeeds
      const reviewerApproveRes = await request(app)
        .post(`/api/approvals/${contentId}/approve`)
        .set('Authorization', `Bearer ${orgAReviewerToken}`)
        .send({ versionNumber: 1, reason: 'Tone aligns with social standards' });
      expect(reviewerApproveRes.status).toBe(200);

      // Verify content is now APPROVED
      const getRes = await request(app)
        .get(`/api/content/${contentId}`)
        .set('Authorization', `Bearer ${orgACreatorToken}`);
      expect(getRes.body.data.content.status).toBe('APPROVED');

      // Creator edits approved content -> creates Version 2 and reverts status from APPROVED to DRAFT!
      const editRes = await request(app)
        .put(`/api/content/${contentId}`)
        .set('Authorization', `Bearer ${orgACreatorToken}`)
        .send({
          body: 'Check out our newly updated solution today!',
        });
      expect(editRes.status).toBe(200);
      expect(editRes.body.data.content.currentVersion).toBe(2);
      expect(editRes.body.data.content.status).toBe('DRAFT'); // Invalidation verified!
    });
  });

  describe('Immutable Audit Logging', () => {
    it('Audit log records actions and is accessible to Admin', async () => {
      const res = await request(app)
        .get('/api/audit-log')
        .set('Authorization', `Bearer ${orgAAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.events.length).toBeGreaterThan(0);
      const actions = res.body.data.events.map((e: any) => e.action);
      expect(actions).toContain('ORGANISATION_REGISTERED');
    });

    it('Audit log rejects unauthorized Creator access (403)', async () => {
      const res = await request(app)
        .get('/api/audit-log')
        .set('Authorization', `Bearer ${orgACreatorToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('User Management and Finding Resolution Endpoints', () => {
    it('Admin can list tenant users via GET /api/auth/users', async () => {
      const res = await request(app)
        .get('/api/auth/users')
        .set('Authorization', `Bearer ${orgAAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.users.length).toBeGreaterThanOrEqual(3); // Admin, Creator, Reviewer
      const emails = res.body.data.users.map((u: any) => u.email);
      expect(emails).toContain('alice@alpha.com');
      expect(emails).toContain('charlie@alpha.com');
      expect(emails).toContain('rachel@alpha.com');
    });

    it('Admin can add a new user to the organization via POST /api/auth/users', async () => {
      const res = await request(app)
        .post('/api/auth/users')
        .set('Authorization', `Bearer ${orgAAdminToken}`)
        .send({
          name: 'Dana Editor',
          email: 'dana@alpha.com',
          password: 'Password123!',
          role: 'creator',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user.email).toBe('dana@alpha.com');
      expect(res.body.data.user.role).toBe('creator');
    });

    it('Non-admin cannot add users (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/auth/users')
        .set('Authorization', `Bearer ${orgACreatorToken}`)
        .send({
          name: 'Hacker',
          email: 'hacker@alpha.com',
          password: 'Password123!',
          role: 'admin',
        });

      expect(res.status).toBe(403);
    });

    it('Creator resolves a finding with recorded justification via PATCH /api/content/:id/findings/:findingId', async () => {
      // 1. Create a draft with a finding
      const draftRes = await request(app)
        .post('/api/content')
        .set('Authorization', `Bearer ${orgACreatorToken}`)
        .send({
          title: 'Draft with Flagged Item',
          contentType: 'website',
          body: 'This draft contains content to test resolution.',
        });
      const contentId = draftRes.body.data.content._id;

      // Manually attach finding to verify resolution endpoint
      const { Content } = await import('../src/models/Content');
      await Content.findByIdAndUpdate(contentId, {
        findings: [
          {
            id: 'finding_test_123',
            category: 'terminology',
            severity: 'low',
            flaggedText: 'test terminology',
            explanation: 'Recommendation',
            guideline: 'Terminology Guideline',
            confidence: 0.9,
            requiresHumanReview: false,
          },
        ],
      });

      // 2. Resolve the finding
      const resolveRes = await request(app)
        .patch(`/api/content/${contentId}/findings/finding_test_123`)
        .set('Authorization', `Bearer ${orgACreatorToken}`)
        .send({
          resolution: 'resolved',
          resolutionReason: 'Approved by Legal counsel under exception #412',
        });

      expect(resolveRes.status).toBe(200);
      const updatedFinding = resolveRes.body.data.content.findings.find(
        (f: any) => f.id === 'finding_test_123'
      );
      expect(updatedFinding).toBeDefined();
      expect(updatedFinding.resolution).toBe('resolved');
      expect(updatedFinding.resolutionReason).toBe('Approved by Legal counsel under exception #412');
    });
  });
});
