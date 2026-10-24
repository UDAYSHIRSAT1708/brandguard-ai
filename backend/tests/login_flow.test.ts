import request from 'supertest';
import app from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { Organisation } from '../src/models/Organisation';
import { User } from '../src/models/User';
import { KnowledgeSource } from '../src/models/KnowledgeSource';
import { AuthService } from '../src/services/auth.service';
import { seedDatabase } from '../src/utils/seed';

describe('Mandatory Authentication, Registration & Demo Data Verification', () => {
  let adminToken: string;

  beforeAll(async () => {
    // Tests always run against an isolated test database (e.g. MongoMemoryServer)
    await connectDB();
    await Organisation.deleteMany({});
    await User.deleteMany({});
  });

  afterAll(async () => {
    await disconnectDB();
  });

  // ========================================================
  // 1. ORGANIZATION REGISTRATION & VALIDATION
  // ========================================================
  describe('Organization Registration Flow', () => {
    it('creates a new organization and initial administrator with complete user metadata', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          orgName: 'Acme Test Corp',
          orgSlug: 'acme-test-corp',
          adminName: 'Sarah Chen',
          adminEmail: 'sarah.chen@acme-test.com',
          adminPassword: 'SuperSecure2026!',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('sarah.chen@acme-test.com');
      expect(res.body.data.user.role).toBe('admin');
      expect(res.body.data.user.organisationName).toBe('Acme Test Corp');
      expect(res.body.data.user.organisationSlug).toBe('acme-test-corp');

      adminToken = res.body.data.token;
    });

    it('allows the newly registered administrator to immediately log in', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'sarah.chen@acme-test.com',
          password: 'SuperSecure2026!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('sarah.chen@acme-test.com');
      expect(res.body.data.user.organisationName).toBe('Acme Test Corp');
    });

    it('rejects duplicate organization slug with 409 conflict', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          orgName: 'Duplicate Corp',
          orgSlug: 'acme-test-corp',
          adminName: 'Other Person',
          adminEmail: 'other.person@other.com',
          adminPassword: 'Password2026!',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already in use');
    });

    it('rejects duplicate email across organizations with 409 conflict', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          orgName: 'New Org With Same Email',
          orgSlug: 'new-org-unique-slug',
          adminName: 'Sarah Clone',
          adminEmail: 'sarah.chen@acme-test.com',
          adminPassword: 'Password2026!',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already exists');
    });

    it('rejects weak password shorter than 8 characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          orgName: 'Weak Pass Corp',
          orgSlug: 'weak-pass-corp',
          adminName: 'Weak User',
          adminEmail: 'weak@example.com',
          adminPassword: 'short',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects invalid email formats', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          orgName: 'Bad Email Corp',
          orgSlug: 'bad-email-corp',
          adminName: 'Bad Email User',
          adminEmail: 'not-an-email',
          adminPassword: 'ValidPassword123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ========================================================
  // 2. LOGIN & SESSION REVALIDATION
  // ========================================================
  describe('Login & Session Management', () => {
    it('normalizes email casing and trims whitespace seamlessly', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: '  SARAH.CHEN@ACME-TEST.COM  ',
          password: 'SuperSecure2026!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('sarah.chen@acme-test.com');
    });

    it('rejects incorrect password with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'sarah.chen@acme-test.com',
          password: 'WrongPassword!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Invalid email or password');
    });

    it('rejects unknown email with safe 401 message', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'unregistered.ghost@example.com',
          password: 'Password2026!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Invalid email or password');
    });

    it('GET /api/auth/me validates session and populates tenant details', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.name).toBe('Sarah Chen');
      expect(res.body.data.user.organisationName).toBe('Acme Test Corp');
      expect(res.body.data.user.organisationSlug).toBe('acme-test-corp');
    });

    it('unauthenticated request to /api/auth/me returns 401', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('malformed token to /api/auth/me returns 401', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer corrupt.token.string');

      expect(res.status).toBe(401);
    });
  });

  // ========================================================
  // 3. SAFE DEMO DATA SEEDING & REPEATABILITY
  // ========================================================
  describe('Safe Demo Data & Repeated Execution', () => {
    it('executes safe idempotent demo seed and creates 3 documented roles', async () => {
      await seedDatabase();

      // Verify all 3 documented accounts can log in
      const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@acme-demo.com', password: 'DemoAdmin2026!' });
      expect(adminLogin.status).toBe(200);
      expect(adminLogin.body.data.user.role).toBe('admin');

      const creatorLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'creator@acme-demo.com', password: 'DemoCreator2026!' });
      expect(creatorLogin.status).toBe(200);
      expect(creatorLogin.body.data.user.role).toBe('creator');

      const reviewerLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'reviewer@acme-demo.com', password: 'DemoReviewer2026!' });
      expect(reviewerLogin.status).toBe(200);
      expect(reviewerLogin.body.data.user.role).toBe('reviewer');
    });

    it('re-running demo seed is safe, idempotent, and does NOT erase existing users', async () => {
      const usersBefore = await User.countDocuments();
      expect(usersBefore).toBeGreaterThanOrEqual(4); // sarah.chen + 3 demo users

      // Re-run seed
      await seedDatabase();

      const usersAfter = await User.countDocuments();
      expect(usersAfter).toBe(usersBefore);

      // Verify sarah.chen is still intact
      const checkUser = await User.findOne({ email: 'sarah.chen@acme-test.com' });
      expect(checkUser).not.toBeNull();
    });

    it('strictly forbids demo seeding if NODE_ENV is set to production', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        await expect(seedDatabase()).rejects.toThrow('Demo seeding prohibited in production');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  // ========================================================
  // 4. CROSS-TENANT ISOLATION & DATA SEGREGATION
  // ========================================================
  describe('Multi-Tenant Isolation Between Organizations', () => {
    let starkToken: string;
    let wayneToken: string;

    beforeAll(async () => {
      // Register Stark Industries
      const starkRes = await request(app)
        .post('/api/auth/register')
        .send({
          orgName: 'Stark Industries',
          orgSlug: 'stark-ind-test',
          adminName: 'Tony Stark',
          adminEmail: 'tony@stark-ind-test.com',
          adminPassword: 'IronManPassword2026!',
        });
      expect(starkRes.status).toBe(201);
      starkToken = starkRes.body.data.token;

      // Register Wayne Enterprises
      const wayneRes = await request(app)
        .post('/api/auth/register')
        .send({
          orgName: 'Wayne Enterprises',
          orgSlug: 'wayne-ent-test',
          adminName: 'Bruce Wayne',
          adminEmail: 'bruce@wayne-ent-test.com',
          adminPassword: 'BatmanPassword2026!',
        });
      expect(wayneRes.status).toBe(201);
      wayneToken = wayneRes.body.data.token;
    });

    it('validates distinct organization identities via /api/auth/me', async () => {
      const starkMe = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${starkToken}`);
      expect(starkMe.status).toBe(200);
      expect(starkMe.body.data.user.organisationSlug).toBe('stark-ind-test');
      expect(starkMe.body.data.user.email).toBe('tony@stark-ind-test.com');

      const wayneMe = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${wayneToken}`);
      expect(wayneMe.status).toBe(200);
      expect(wayneMe.body.data.user.organisationSlug).toBe('wayne-ent-test');
      expect(wayneMe.body.data.user.email).toBe('bruce@wayne-ent-test.com');
    });

    it('enforces content isolation: Wayne Enterprises cannot access Stark Industries content', async () => {
      // Stark creates a draft
      const contentRes = await request(app)
        .post('/api/content')
        .set('Authorization', `Bearer ${starkToken}`)
        .send({
          title: 'Mark 85 Clean Energy Protocol',
          contentType: 'website',
          body: 'Stark Industries clean energy distribution guidelines.',
        });
      expect(contentRes.status).toBe(201);

      // Wayne queries content
      const wayneContents = await request(app)
        .get('/api/content')
        .set('Authorization', `Bearer ${wayneToken}`);
      expect(wayneContents.status).toBe(200);
      const wayneTitles = wayneContents.body.data.contents.map((c: any) => c.title);
      expect(wayneTitles).not.toContain('Mark 85 Clean Energy Protocol');

      // Stark queries content
      const starkContents = await request(app)
        .get('/api/content')
        .set('Authorization', `Bearer ${starkToken}`);
      expect(starkContents.status).toBe(200);
      const starkTitles = starkContents.body.data.contents.map((c: any) => c.title);
      expect(starkTitles).toContain('Mark 85 Clean Energy Protocol');
    });

    it('enforces knowledge source isolation: Stark cannot view Wayne guidelines', async () => {
      // Wayne adds guideline
      const wayneKb = await request(app)
        .post('/api/knowledge')
        .set('Authorization', `Bearer ${wayneToken}`)
        .send({
          title: 'Batmobile Stealth Doctrine',
          sourceType: 'guideline',
          content: 'Classified acoustic dampening standards.',
          productScope: 'Vehicles',
        });
      expect(wayneKb.status).toBe(201);

      // Stark queries knowledge sources
      const starkSources = await request(app)
        .get('/api/knowledge')
        .set('Authorization', `Bearer ${starkToken}`);
      expect(starkSources.status).toBe(200);
      const starkKbTitles = starkSources.body.data.sources.map((s: any) => s.title);
      expect(starkKbTitles).not.toContain('Batmobile Stealth Doctrine');
    });
  });
});
