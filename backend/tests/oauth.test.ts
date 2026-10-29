import request from 'supertest';
import crypto from 'crypto';
import app from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { Organisation } from '../src/models/Organisation';
import { User } from '../src/models/User';
import { OAuthNonce } from '../src/models/OAuthNonce';
import { AuditEvent } from '../src/models/AuditEvent';
import { AuthService } from '../src/services/auth.service';
import { OAuthService } from '../src/services/oauth.service';
import { redactEmail } from '../src/utils/redact';

describe('Phase 1: Google OAuth 2.0 PKCE, Serverless Nonce Protection & Session Hardening', () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    await Organisation.deleteMany({});
    await User.deleteMany({});
    await OAuthNonce.deleteMany({});
    await AuditEvent.deleteMany({});
    OAuthService.oauth2ClientOverride = null;
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  // Helper to generate compliant PKCE verifier (43-128 chars) and challenge
  function generateTestPKCE() {
    const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk-test-pkce-verifier-long-enough-43';
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    return { codeVerifier, codeChallenge };
  }

  // ---------------------------------------------------------------------------
  // 1. Email Redaction Utility
  // ---------------------------------------------------------------------------
  describe('PII Redaction Utilities', () => {
    it('properly redacts email addresses for compliance and audit logging', () => {
      expect(redactEmail('sarah.chen@acme.com')).toBe('s***n@acme.com');
      expect(redactEmail('alice@company.org')).toBe('a***e@company.org');
      expect(redactEmail('ab@domain.com')).toBe('a***@domain.com');
      expect(redactEmail('a@domain.com')).toBe('a***@domain.com');
      expect(redactEmail('')).toBe('[REDACTED]');
      expect(redactEmail(null as any)).toBe('[REDACTED]');
      expect(redactEmail('invalid-email')).toBe('[REDACTED]');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. OAuth State Token & PKCE Initialization
  // ---------------------------------------------------------------------------
  describe('OAuth State Token & PKCE Initialization', () => {
    it('GET /api/auth/oauth/google/init generates a signed state token bound to PKCE challenge', async () => {
      const { codeChallenge } = generateTestPKCE();

      const res = await request(app)
        .get('/api/auth/oauth/google/init')
        .query({
          intent: 'login',
          codeChallenge,
          redirectUri: 'http://localhost:5173/login',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.state).toBeDefined();
      expect(res.body.data.authUrl).toContain('accounts.google.com');
      expect(res.body.data.authUrl).toContain(`code_challenge=${codeChallenge}`);
      expect(res.body.data.authUrl).toContain('code_challenge_method=S256');

      // Validate state token has codeChallenge bound
      const statePayload = await OAuthService.validateStateToken(res.body.data.state);
      expect(statePayload.intent).toBe('login');
      expect(statePayload.codeChallenge).toBe(codeChallenge);
      expect(statePayload.nonce).toBeDefined();
    });

    it('rejects replayed state tokens atomically across serverless instances via MongoDB OAuthNonce', async () => {
      const { codeChallenge } = generateTestPKCE();
      const stateToken = OAuthService.generateStateToken({
        intent: 'login',
        codeChallenge,
      });

      // 1. First validation succeeds and writes nonce to MongoDB
      const decoded = await OAuthService.validateStateToken(stateToken);
      expect(decoded.nonce).toBeDefined();

      const savedNonce = await OAuthNonce.findOne({ nonce: decoded.nonce });
      expect(savedNonce).not.toBeNull();

      // 2. Second validation with identical nonce triggers duplicate key error and throws 400 replay error
      await expect(OAuthService.validateStateToken(stateToken)).rejects.toThrow(
        /replay detected/i
      );
    });

    it('rejects tampered or malformed state tokens', async () => {
      await expect(OAuthService.validateStateToken('invalid.state.signature')).rejects.toThrow(
        /invalid or expired oauth state/i
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Mandatory Callback Validation (Rejecting Missing / Invalid Parameters)
  // ---------------------------------------------------------------------------
  describe('Mandatory OAuth Callback Validation', () => {
    it('rejects callback when state parameter is missing', async () => {
      const { codeVerifier } = generateTestPKCE();
      const res = await request(app)
        .post('/api/auth/oauth/google/callback')
        .send({
          code: 'valid-google-code',
          codeVerifier,
          redirectUri: 'http://localhost:5173/login',
          // state omitted!
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(res.body.error)).toMatch(/state/i);
    });

    it('rejects callback when PKCE codeVerifier is missing', async () => {
      const { codeChallenge } = generateTestPKCE();
      const state = OAuthService.generateStateToken({ codeChallenge });

      const res = await request(app)
        .post('/api/auth/oauth/google/callback')
        .send({
          code: 'valid-google-code',
          state,
          redirectUri: 'http://localhost:5173/login',
          // codeVerifier omitted!
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(res.body.error)).toMatch(/codeVerifier/i);
    });

    it('rejects callback when codeVerifier is too short (< 43 characters)', async () => {
      const { codeChallenge } = generateTestPKCE();
      const state = OAuthService.generateStateToken({ codeChallenge });

      const res = await request(app)
        .post('/api/auth/oauth/google/callback')
        .send({
          code: 'valid-google-code',
          codeVerifier: 'too-short-verifier',
          state,
          redirectUri: 'http://localhost:5173/login',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(res.body.error)).toMatch(/43 characters/i);
    });

    it('rejects callback when codeVerifier does not match the challenge bound to state', async () => {
      const { codeChallenge } = generateTestPKCE();
      const state = OAuthService.generateStateToken({ codeChallenge });

      const mismatchedVerifier = 'completely-different-verifier-that-does-not-hash-to-challenge-1234567890';

      const res = await request(app)
        .post('/api/auth/oauth/google/callback')
        .send({
          code: 'valid-google-code',
          codeVerifier: mismatchedVerifier,
          state,
          redirectUri: 'http://localhost:5173/login',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/does not match the challenge bound to this OAuth state/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Google OAuth Login & HttpOnly Cookie Issuance
  // ---------------------------------------------------------------------------
  describe('Google OAuth Login & HttpOnly Cookie Issuance', () => {
    it('allows an existing Google user to log in and sets HttpOnly refresh cookie', async () => {
      const org = await Organisation.create({ name: 'Acme Corp', slug: 'acme-corp' });
      const user = await User.create({
        organisationId: org._id,
        name: 'Google User',
        email: 'user@google-test.com',
        googleId: 'google-sub-12345',
        authProvider: 'google',
        role: 'creator',
        active: true,
      });

      const { codeVerifier, codeChallenge } = generateTestPKCE();
      const state = OAuthService.generateStateToken({ codeChallenge });

      jest.spyOn(OAuthService, 'exchangeCodeForGoogleProfile').mockResolvedValueOnce({
        googleId: 'google-sub-12345',
        email: 'user@google-test.com',
        name: 'Google User',
        emailVerified: true,
      });

      const res = await request(app)
        .post('/api/auth/oauth/google/callback')
        .send({
          code: 'mock-code-123',
          codeVerifier,
          state,
          redirectUri: 'http://localhost:5173/login',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.id).toBe(user._id.toString());
      expect(res.body.data.user.isGoogleLinked).toBe(true);

      // Verify HttpOnly cookie header was attached
      const cookies = (res.headers['set-cookie'] || []) as string[];
      expect(cookies.some((c: string) => c.includes('brandguard_refresh_token=') && c.includes('HttpOnly'))).toBe(true);

      // Verify audit event
      const audit = await AuditEvent.findOne({ action: 'USER_LOGIN_GOOGLE', userId: user._id });
      expect(audit).not.toBeNull();
    });

    it('blocks unauthenticated automatic merging when email belongs to existing password user', async () => {
      const { user } = await AuthService.registerOrgAndAdmin({
        orgName: 'Existing Org',
        orgSlug: 'existing-org',
        adminName: 'Alice Admin',
        adminEmail: 'alice@existing.com',
        adminPassword: 'Password123!',
      });

      const { codeVerifier, codeChallenge } = generateTestPKCE();
      const state = OAuthService.generateStateToken({ codeChallenge });

      jest.spyOn(OAuthService, 'exchangeCodeForGoogleProfile').mockResolvedValueOnce({
        googleId: 'google-sub-attacker-or-alice',
        email: 'alice@existing.com',
        name: 'Alice Admin',
        emailVerified: true,
      });

      const res = await request(app)
        .post('/api/auth/oauth/google/callback')
        .send({
          code: 'mock-code-456',
          codeVerifier,
          state,
          redirectUri: 'http://localhost:5173/login',
        });

      // Must be blocked with 409 ACCOUNT_EXISTS_PASSWORD
      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ACCOUNT_EXISTS_PASSWORD');

      const unlinkedUser = await User.findById(user._id);
      expect(unlinkedUser?.googleId).toBeFalsy();
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Account Linking & Strict Email Policy
  // ---------------------------------------------------------------------------
  describe('Account Linking & Strict Email Policy', () => {
    it('allows an authenticated user to link their Google account when verified email matches', async () => {
      const { user, token } = await AuthService.registerOrgAndAdmin({
        orgName: 'Link Org',
        orgSlug: 'link-org',
        adminName: 'Bob Admin',
        adminEmail: 'bob@linkorg.com',
        adminPassword: 'Password123!',
      });

      const { codeVerifier, codeChallenge } = generateTestPKCE();
      const state = OAuthService.generateStateToken({ codeChallenge });

      jest.spyOn(OAuthService, 'exchangeCodeForGoogleProfile').mockResolvedValueOnce({
        googleId: 'google-sub-bob-123',
        email: 'bob@linkorg.com', // Matching email!
        name: 'Bob Admin',
        emailVerified: true,
      });

      const res = await request(app)
        .post('/api/auth/oauth/google/link')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: 'mock-link-code',
          codeVerifier,
          state,
          redirectUri: 'http://localhost:5173/login',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.isGoogleLinked).toBe(true);

      const linkedUser = await User.findById(user._id);
      expect(linkedUser?.googleId).toBe('google-sub-bob-123');
      expect(linkedUser?.role).toBe('admin'); // Role preserved
      expect(linkedUser?.organisationId.toString()).toBe(user.organisationId.toString()); // Tenant preserved
    });

    it('rejects account linking when Google account email does NOT match BrandGuard user email', async () => {
      const { token } = await AuthService.registerOrgAndAdmin({
        orgName: 'Mismatch Org',
        orgSlug: 'mismatch-org',
        adminName: 'Charlie Admin',
        adminEmail: 'charlie@company.com',
        adminPassword: 'Password123!',
      });

      const { codeVerifier, codeChallenge } = generateTestPKCE();
      const state = OAuthService.generateStateToken({ codeChallenge });

      jest.spyOn(OAuthService, 'exchangeCodeForGoogleProfile').mockResolvedValueOnce({
        googleId: 'google-sub-different',
        email: 'charlie-personal@gmail.com', // Different email!
        name: 'Charlie Personal',
        emailVerified: true,
      });

      const res = await request(app)
        .post('/api/auth/oauth/google/link')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: 'mock-link-code',
          codeVerifier,
          state,
          redirectUri: 'http://localhost:5173/login',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/does not match your BrandGuard account email/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Refresh Token Concurrency & Session Hardening
  // ---------------------------------------------------------------------------
  describe('Refresh Token Concurrency & Session Hardening', () => {
    it('handles concurrent multi-tab refresh requests without invalidating sessions', async () => {
      const { user, refreshToken } = await AuthService.registerOrgAndAdmin({
        orgName: 'Multi Tab Org',
        orgSlug: 'multi-tab-org',
        adminName: 'Tab User',
        adminEmail: 'tab@user.com',
        adminPassword: 'Password123!',
      });

      // Simulate 2 tabs firing refresh concurrently with the same refresh token (version 1)
      const [tab1Res, tab2Res] = await Promise.all([
        request(app).post('/api/auth/refresh').send({ refreshToken }),
        request(app).post('/api/auth/refresh').send({ refreshToken }),
      ]);

      expect(tab1Res.status).toBe(200);
      expect(tab2Res.status).toBe(200);

      expect(tab1Res.body.data.token).toBeDefined();
      expect(tab2Res.body.data.token).toBeDefined();

      // Check DB: user version was bumped cleanly
      const updatedUser = await User.findById(user._id);
      expect(updatedUser?.refreshTokenVersion).toBe(2);
      expect(updatedUser?.previousRefreshTokenVersion).toBe(1);
    });

    it('supports refresh via HttpOnly cookie and updates cookie on response', async () => {
      const { refreshToken } = await AuthService.registerOrgAndAdmin({
        orgName: 'Cookie Org',
        orgSlug: 'cookie-org',
        adminName: 'Cookie User',
        adminEmail: 'cookie@user.com',
        adminPassword: 'Password123!',
      });

      // Send refresh request with Cookie header instead of JSON body
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`brandguard_refresh_token=${refreshToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();

      const newCookies = (res.headers['set-cookie'] || []) as string[];
      expect(newCookies.some((c: string) => c.includes('brandguard_refresh_token=') && c.includes('HttpOnly'))).toBe(true);
    });

    it('detects token replay / theft outside the grace period and revokes all user sessions', async () => {
      const { user, refreshToken } = await AuthService.registerOrgAndAdmin({
        orgName: 'Replay Org',
        orgSlug: 'replay-org',
        adminName: 'Replay User',
        adminEmail: 'replay@user.com',
        adminPassword: 'Password123!',
      });

      // 1. Initial valid rotation -> version becomes 2
      const firstRefresh = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });
      expect(firstRefresh.status).toBe(200);

      // 2. Simulate expiry of grace window by adjusting DB timestamp
      await User.findByIdAndUpdate(user._id, {
        previousVersionExpiresAt: new Date(Date.now() - 1000), // Expired!
      });

      // 3. Attacker presents the old refreshToken (version 1)
      const attackerRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(attackerRes.status).toBe(401);
      expect(attackerRes.body.error.message).toMatch(/compromise or replay detected/i);

      // Verify all active sessions were revoked (version incremented forward)
      const revokedUser = await User.findById(user._id);
      expect(revokedUser?.refreshTokenVersion).toBeGreaterThan(5);
    });

    it('clears HttpOnly cookie and revokes session on logout', async () => {
      const { user, token, refreshToken } = await AuthService.registerOrgAndAdmin({
        orgName: 'Logout Hardening Org',
        orgSlug: 'logout-hardening',
        adminName: 'Logout User',
        adminEmail: 'logout@hardening.com',
        adminPassword: 'Password123!',
      });

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .set('Cookie', [`brandguard_refresh_token=${refreshToken}`]);

      expect(logoutRes.status).toBe(200);

      // Verify clear cookie header was sent
      const cookies = (logoutRes.headers['set-cookie'] || []) as string[];
      expect(cookies.some((c: string) => c.includes('brandguard_refresh_token=;') || c.includes('Expires='))).toBe(true);

      // Subsequent refresh must fail
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(refreshRes.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Organization Self-Registration & Stranger Rejection
  // ---------------------------------------------------------------------------
  describe('Organization Registration & Stranger Rejection', () => {
    it('provisions a new tenant organisation and root admin via Google OAuth', async () => {
      const { codeVerifier, codeChallenge } = generateTestPKCE();
      const state = OAuthService.generateStateToken({ codeChallenge });

      jest.spyOn(OAuthService, 'exchangeCodeForGoogleProfile').mockResolvedValueOnce({
        googleId: 'google-sub-founder-999',
        email: 'founder@newcorp.com',
        name: 'Founder Person',
        picture: 'https://lh3.googleusercontent.com/avatar.jpg',
        emailVerified: true,
      });

      const res = await request(app)
        .post('/api/auth/oauth/google/callback')
        .send({
          code: 'mock-founder-code',
          codeVerifier,
          state,
          redirectUri: 'http://localhost:5173/login',
          orgName: 'New Corp International',
          orgSlug: 'new-corp',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isNewAccount).toBe(true);
      expect(res.body.data.user.role).toBe('admin');
      expect(res.body.data.user.organisationSlug).toBe('new-corp');

      const org = await Organisation.findOne({ slug: 'new-corp' });
      expect(org).not.toBeNull();
      const user = await User.findOne({ googleId: 'google-sub-founder-999' });
      expect(user).not.toBeNull();
      expect(user?.role).toBe('admin');
    });

    it('rejects unauthorized stranger sign-in when no account or registration payload exists', async () => {
      const { codeVerifier, codeChallenge } = generateTestPKCE();
      const state = OAuthService.generateStateToken({ codeChallenge });

      jest.spyOn(OAuthService, 'exchangeCodeForGoogleProfile').mockResolvedValueOnce({
        googleId: 'google-sub-stranger-000',
        email: 'stranger@nowhere.com',
        name: 'Random Stranger',
        emailVerified: true,
      });

      const res = await request(app)
        .post('/api/auth/oauth/google/callback')
        .send({
          code: 'mock-stranger-code',
          codeVerifier,
          state,
          redirectUri: 'http://localhost:5173/login',
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NO_ACCOUNT_FOUND');

      const createdUser = await User.findOne({ email: 'stranger@nowhere.com' });
      expect(createdUser).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Password Login Backward Compatibility
  // ---------------------------------------------------------------------------
  describe('Password Login Backward Compatibility', () => {
    it('preserves email/password login and registration without regression', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          orgName: 'Regression Org',
          orgSlug: 'regression-org',
          adminName: 'Reg Admin',
          adminEmail: 'regadmin@test.com',
          adminPassword: 'Password123!',
        });

      expect(regRes.status).toBe(201);

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'regadmin@test.com',
          password: 'Password123!',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.token).toBeDefined();
      expect(loginRes.body.data.refreshToken).toBeDefined();
    });

    it('informs Google OAuth users who attempt password login without a password', async () => {
      const org = await Organisation.create({ name: 'OAuth Only', slug: 'oauth-only-2' });
      await User.create({
        organisationId: org._id,
        name: 'OAuth Only User',
        email: 'oauthonly@test.com',
        googleId: 'sub-oauth-only-2',
        authProvider: 'google',
        role: 'creator',
        active: true,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'oauthonly@test.com',
          password: 'SomePassword!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toMatch(/created using Google Sign-In/i);
    });
  });
});
