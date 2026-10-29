import request from 'supertest';
import app, { resolveAllowedOrigins } from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';

describe('Production CORS & Preflight Verification', () => {
  const PRODUCTION_ORIGIN = 'https://brandguard-ai-dafa.vercel.app';

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  // ============================================================================
  // 1. PRODUCTION PREFLIGHT OPTIONS REQUESTS
  // ============================================================================
  describe('Preflight OPTIONS Handling for Production Frontend', () => {
    it('handles OPTIONS /api/auth/register preflight with 204 and correct CORS headers', async () => {
      const res = await request(app)
        .options('/api/auth/register')
        .set('Origin', PRODUCTION_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(PRODUCTION_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-methods']).toContain('POST');
      expect(res.headers['access-control-allow-methods']).toContain('OPTIONS');
      expect(res.headers['access-control-allow-headers']).toContain('Content-Type');
      expect(res.headers['vary']).toBe('Origin');
    });

    it('handles OPTIONS /api/auth/login preflight with 204 and correct CORS headers', async () => {
      const res = await request(app)
        .options('/api/auth/login')
        .set('Origin', PRODUCTION_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type, authorization');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(PRODUCTION_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-headers']).toContain('Authorization');
    });

    it('handles preflight for review submission with Idempotency-Key header', async () => {
      const res = await request(app)
        .options('/api/content/671000000000000000000001/review')
        .set('Origin', PRODUCTION_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type, authorization, idempotency-key');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(PRODUCTION_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      const allowHeaders = (res.headers['access-control-allow-headers'] || '').toLowerCase();
      expect(allowHeaders).toContain('idempotency-key');
    });

    it('handles preflight with mixed-case Idempotency-Key header', async () => {
      const res = await request(app)
        .options('/api/content/671000000000000000000001/review')
        .set('Origin', PRODUCTION_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type, Authorization, Idempotency-Key');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(PRODUCTION_ORIGIN);
      const allowHeaders = (res.headers['access-control-allow-headers'] || '').toLowerCase();
      expect(allowHeaders).toContain('idempotency-key');
    });

    it('handles preflight for content and health routes', async () => {
      const resContent = await request(app)
        .options('/api/content')
        .set('Origin', PRODUCTION_ORIGIN)
        .set('Access-Control-Request-Method', 'GET');
      expect(resContent.status).toBe(204);
      expect(resContent.headers['access-control-allow-origin']).toBe(PRODUCTION_ORIGIN);

      const resHealth = await request(app)
        .options('/api/health')
        .set('Origin', PRODUCTION_ORIGIN)
        .set('Access-Control-Request-Method', 'GET');
      expect(resHealth.status).toBe(204);
      expect(resHealth.headers['access-control-allow-origin']).toBe(PRODUCTION_ORIGIN);
    });
  });

  // ============================================================================
  // 2. ACTUAL POST /api/auth/register CORS HEADERS
  // ============================================================================
  describe('Actual Registration Request CORS Response', () => {
    it('returns Access-Control-Allow-Origin, credentials, and CORP on POST /api/auth/register', async () => {
      const uniqueSlug = `cors-test-${Date.now()}`;
      const res = await request(app)
        .post('/api/auth/register')
        .set('Origin', PRODUCTION_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          orgName: 'CORS Test Corp',
          orgSlug: uniqueSlug,
          adminName: 'CORS Admin',
          adminEmail: `admin@${uniqueSlug}.com`,
          adminPassword: 'Password123!',
        });

      expect(res.status).toBe(201);
      expect(res.headers['access-control-allow-origin']).toBe(PRODUCTION_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
      expect(res.headers['vary']).toBe('Origin');
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
    });

    it('handles preflight and POST requests from Vercel preview deployment URLs (e.g. from user screenshot)', async () => {
      const PREVIEW_ORIGIN = 'https://brandguard-ai-dafa-nhsqi3kpp-temp-7e59.vercel.app';
      const resOptions = await request(app)
        .options('/api/auth/register')
        .set('Origin', PREVIEW_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type');

      expect(resOptions.status).toBe(204);
      expect(resOptions.headers['access-control-allow-origin']).toBe(PREVIEW_ORIGIN);
      expect(resOptions.headers['access-control-allow-credentials']).toBe('true');

      const uniqueSlug = `preview-test-${Date.now()}`;
      const resPost = await request(app)
        .post('/api/auth/register')
        .set('Origin', PREVIEW_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          orgName: 'Preview Test Corp',
          orgSlug: uniqueSlug,
          adminName: 'Preview Admin',
          adminEmail: `admin@${uniqueSlug}.com`,
          adminPassword: 'Password123!',
        });

      expect(resPost.status).toBe(201);
      expect(resPost.headers['access-control-allow-origin']).toBe(PREVIEW_ORIGIN);
      expect(resPost.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  // ============================================================================
  // 3. ORIGIN RESOLUTION & NORMALIZATION (TRAILING SLASH & ALLOWED_ORIGINS)
  // ============================================================================
  describe('Origin Normalization & Multi-Origin Resolution', () => {
    it('normalizes trailing slashes in FRONTEND_URL and ALLOWED_ORIGINS', () => {
      const originalFrontend = process.env.FRONTEND_URL;
      const originalAllowed = process.env.ALLOWED_ORIGINS;

      try {
        process.env.FRONTEND_URL = 'https://custom-frontend.vercel.app/';
        process.env.ALLOWED_ORIGINS = 'https://preview-1.vercel.app/, https://preview-2.vercel.app';

        const resolved = resolveAllowedOrigins();
        expect(resolved).toContain(PRODUCTION_ORIGIN);
        expect(resolved).toContain('https://custom-frontend.vercel.app');
        expect(resolved).not.toContain('https://custom-frontend.vercel.app/');
        expect(resolved).toContain('https://preview-1.vercel.app');
        expect(resolved).toContain('https://preview-2.vercel.app');
      } finally {
        process.env.FRONTEND_URL = originalFrontend;
        process.env.ALLOWED_ORIGINS = originalAllowed;
      }
    });

    it('allows requests from origins configured via ALLOWED_ORIGINS', async () => {
      const originalAllowed = process.env.ALLOWED_ORIGINS;
      try {
        process.env.ALLOWED_ORIGINS = 'https://preview-test.vercel.app';

        const res = await request(app)
          .options('/api/auth/register')
          .set('Origin', 'https://preview-test.vercel.app')
          .set('Access-Control-Request-Method', 'POST');

        expect(res.status).toBe(204);
        expect(res.headers['access-control-allow-origin']).toBe('https://preview-test.vercel.app');
      } finally {
        process.env.ALLOWED_ORIGINS = originalAllowed;
      }
    });
  });

  // ============================================================================
  // 4. SECURITY & UNAUTHORIZED ORIGIN REJECTION
  // ============================================================================
  describe('Unauthorized Origin Rejection (Security & No Wildcard Leak)', () => {
    const DISALLOWED_ORIGIN = 'https://malicious-site.example.com';

    it('does NOT provide Access-Control-Allow-Origin on preflight for unauthorized origin', async () => {
      const res = await request(app)
        .options('/api/auth/register')
        .set('Origin', DISALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'POST');

      // The preflight should not include the disallowed origin or wildcard
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('does NOT provide Access-Control-Allow-Origin on preflight with Idempotency-Key for unauthorized origin', async () => {
      const res = await request(app)
        .options('/api/content/671000000000000000000001/review')
        .set('Origin', DISALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type, authorization, idempotency-key');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('does NOT provide Access-Control-Allow-Origin on POST for unauthorized origin', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Origin', DISALLOWED_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          orgName: 'Malicious Corp',
          orgSlug: 'malicious-corp',
          adminName: 'Hacker',
          adminEmail: 'hacker@malicious.com',
          adminPassword: 'Password123!',
        });

      // Browser will block response consumption because header is omitted
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });
  });
});
