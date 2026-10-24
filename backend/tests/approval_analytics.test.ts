import request from 'supertest';
import app from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { Organisation } from '../src/models/Organisation';
import { User } from '../src/models/User';
import { KnowledgeSource } from '../src/models/KnowledgeSource';
import { Content } from '../src/models/Content';
import { ContentVersion } from '../src/models/ContentVersion';
import { AuditEvent } from '../src/models/AuditEvent';
import { AuthService } from '../src/services/auth.service';

describe('Phase 7: Human Approval Workflow, Audit Trail & Real Analytics', () => {
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
      orgName: 'Governance Testing Corp',
      orgSlug: 'gov-test',
      adminName: 'Admin Person',
      adminEmail: 'admin@govtest.com',
      adminPassword: 'Password123!',
    });
    orgId = admin.organisationId.toString();

    // 2. Setup Creator & Reviewer
    const creator = await AuthService.createUserInOrg({
      organisationId: orgId,
      name: 'Content Creator',
      email: 'creator@govtest.com',
      password: 'Password123!',
      role: 'creator',
      creatorUserId: admin._id.toString(),
    });
    creatorToken = AuthService.generateToken(creator);

    const reviewer = await AuthService.createUserInOrg({
      organisationId: orgId,
      name: 'Legal Reviewer',
      email: 'reviewer@govtest.com',
      password: 'Password123!',
      role: 'reviewer',
      creatorUserId: admin._id.toString(),
    });
    reviewerToken = AuthService.generateToken(reviewer);

    // 3. Create content draft
    const contentRes = await request(app)
      .post('/api/content')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        title: 'Executive Summary',
        contentType: 'website',
        body: 'Approved text with documented 94% accuracy figure.',
      });
    contentId = contentRes.body.data.content._id;

    // Submit for review
    await request(app)
      .post(`/api/content/${contentId}/submit`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('Reviewer views queue and approves exact version 1', async () => {
    // 1. Check queue
    const queueRes = await request(app)
      .get('/api/approvals/queue')
      .set('Authorization', `Bearer ${reviewerToken}`);
    expect(queueRes.status).toBe(200);
    expect(queueRes.body.data.items.length).toBe(1);

    // 2. Reviewer approves version 1
    const approveRes = await request(app)
      .post(`/api/approvals/${contentId}/approve`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ versionNumber: 1, reason: 'Claims verified against Q3 tests' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.decision.decision).toBe('approved');
    expect(approveRes.body.data.decision.versionNumber).toBe(1);

    // 3. Verify content status is APPROVED
    const contentCheck = await request(app)
      .get(`/api/content/${contentId}`)
      .set('Authorization', `Bearer ${creatorToken}`);
    expect(contentCheck.body.data.content.status).toBe('APPROVED');
  });

  it('Creator editing approved content creates Version 2 and invalidates approval', async () => {
    const editRes = await request(app)
      .put(`/api/content/${contentId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ body: 'Subtle text modification post-approval.' });

    expect(editRes.status).toBe(200);
    expect(editRes.body.data.content.currentVersion).toBe(2);
    // Crucial governance test: must invalidate prior approval!
    expect(editRes.body.data.content.status).toBe('DRAFT');
  });

  it('Analytics endpoint calculates real KPI metrics from stored documents', async () => {
    const analyticsRes = await request(app)
      .get('/api/analytics/dashboard')
      .set('Authorization', `Bearer ${reviewerToken}`);

    expect(analyticsRes.status).toBe(200);
    const data = analyticsRes.body.data;
    expect(data.totalReviews).toBe(1);
    expect(data).toHaveProperty('findingsBySeverity');
    expect(data).toHaveProperty('revisionRate');
    expect(data).toHaveProperty('mostFrequentCategories');
  });
});
