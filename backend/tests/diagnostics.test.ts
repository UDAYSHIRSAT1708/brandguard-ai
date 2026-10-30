import request from 'supertest';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { connectDB, disconnectDB } from '../src/config/db';
import { env } from '../src/config/env';

describe('Phase 1: Production Health and AI Diagnostics Suite', () => {
  let adminToken: string;
  let creatorToken: string;

  beforeAll(async () => {
    await connectDB();

    // Create signed test tokens for RBAC verification
    adminToken = jwt.sign(
      {
        userId: 'diag_admin_id',
        organisationId: 'diag_org_id',
        role: 'admin',
        email: 'admin@diag.test',
      },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    creatorToken = jwt.sign(
      {
        userId: 'diag_creator_id',
        organisationId: 'diag_org_id',
        role: 'creator',
        email: 'creator@diag.test',
      },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await disconnectDB();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Inexpensive Public Health Probe', () => {
    it('GET /api/health returns 200 or 503 without executing expensive diagnostics', async () => {
      const res = await request(app).get('/api/health');
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('checks');
      expect(res.body.checks).toHaveProperty('database');
      expect(res.body.checks).toHaveProperty('aiService');
      // Must not leak internals
      expect(JSON.stringify(res.body).toLowerCase()).not.toContain('api_key');
      expect(JSON.stringify(res.body).toLowerCase()).not.toContain('secret');
    });
  });

  describe('Authenticated Deep Diagnostics Access Control', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).post('/api/health/diagnostics');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Authentication required');
    });

    it('rejects non-admin users with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/health/diagnostics')
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('administrative session');
    });

    it('permits internal service calls via X-Internal-API-Key', async () => {
      // Mock AI service diagnostic endpoint
      jest.spyOn(axios, 'post').mockResolvedValueOnce({
        data: {
          timestamp: new Date().toISOString(),
          overall_status: 'healthy',
          tiers: {
            reachable: true,
            configured: true,
            authenticated: true,
            generation_verified: true,
            end_to_end_verified: true,
          },
          providers: {
            primary: {
              provider: 'gemini',
              model: 'gemini-flash-lite-latest',
              configured: true,
              reachable: true,
              authenticated: true,
              generation_verified: true,
              latency_ms: 150,
            },
            fallback: {
              provider: 'groq',
              model: 'llama-3.3-70b-versatile',
              configured: true,
              reachable: true,
              authenticated: true,
              generation_verified: true,
              latency_ms: 110,
            },
          },
          rag_retrieval: {
            tenant_isolation_verified: true,
            approval_status_filter_verified: true,
            chunking_verified: true,
            retrieval_scoring_verified: true,
            latency_ms: 12,
            notes: 'Test verified',
          },
          failover_simulation: {
            failover_verified: true,
            primary_failed_as_expected: true,
            fallback_activated: true,
            fallback_provider: 'groq',
            latency_ms: 220,
          },
          elapsed_total_ms: 500,
        },
      });

      const res = await request(app)
        .post('/api/health/diagnostics')
        .set('X-Internal-API-Key', env.AI_SERVICE_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('overallStatus');
      expect(res.body.data).toHaveProperty('tiers');
      expect(res.body.data.tiers.serviceReachable).toBe(true);
      expect(res.body.data.tiers.credentialsConfigured).toBe(true);
      expect(res.body.data.tiers.providerAuthVerified).toBe(true);
      expect(res.body.data.tiers.modelGenerationVerified).toBe(true);
      expect(res.body.data.tiers.endToEndVerified).toBe(true);
      expect(res.body.data.components.database.connected).toBe(true);
      expect(res.body.data.components.reviewJobPipeline.verified).toBe(true);
    });

    it('permits authenticated admins and reports five distinct verification tiers', async () => {
      // Mock AI service diagnostic probe
      jest.spyOn(axios, 'post').mockResolvedValueOnce({
        data: {
          timestamp: new Date().toISOString(),
          overall_status: 'degraded',
          tiers: {
            reachable: true,
            configured: true,
            authenticated: true,
            generation_verified: false,
            end_to_end_verified: false,
          },
          providers: {
            primary: {
              provider: 'gemini',
              model: 'gemini-flash-lite-latest',
              configured: true,
              reachable: true,
              authenticated: true,
              generation_verified: false,
              error_category: 'RATE_LIMIT_429',
              error_message: 'Quota exceeded',
            },
            fallback: {
              provider: 'groq',
              model: 'llama-3.3-70b-versatile',
              configured: false,
              reachable: false,
              authenticated: false,
              generation_verified: false,
            },
          },
          rag_retrieval: {
            tenant_isolation_verified: true,
            approval_status_filter_verified: true,
            chunking_verified: true,
            retrieval_scoring_verified: true,
            latency_ms: 15,
            notes: 'Verified',
          },
          failover_simulation: {
            failover_verified: false,
            primary_failed_as_expected: true,
            fallback_activated: false,
            fallback_provider: 'groq',
            latency_ms: 10,
          },
          elapsed_total_ms: 300,
        },
      });

      const res = await request(app)
        .post('/api/health/diagnostics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.overallStatus).toBe('degraded');
      expect(res.body.data.tiers.serviceReachable).toBe(true);
      expect(res.body.data.tiers.credentialsConfigured).toBe(true);
      expect(res.body.data.tiers.modelGenerationVerified).toBe(false);
      expect(res.body.data.tiers.endToEndVerified).toBe(false);

      // Verify zero sensitive data is in response
      const strRes = JSON.stringify(res.body).toLowerCase();
      expect(strRes).not.toContain('password');
      expect(strRes).not.toContain('ai_service_api_key');
      expect(strRes).not.toContain('groq_api_key');
      expect(strRes).not.toContain('google_api_key');
    });
  });
});
