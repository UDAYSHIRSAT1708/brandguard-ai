import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app';
import { 
  connectDB, 
  disconnectDB, 
  getDatabaseStatus, 
  getDatabaseDiagnostics,
  sanitizeErrorMessage,
  parseMongoDbName,
  resolveTargetDatabaseName,
  resetConnectionCacheForTesting 
} from '../src/config/db';

describe('Database Connection & Serverless Lifecycle Verification', () => {
  beforeEach(async () => {
    // Start clean for each test
    await disconnectDB();
    resetConnectionCacheForTesting();
  });

  afterAll(async () => {
    await disconnectDB();
    resetConnectionCacheForTesting();
  });

  // ============================================================================
  // 1. SUCCESSFUL CONNECTION & REUSE
  // ============================================================================
  describe('Successful Connection & Cache Reuse', () => {
    it('establishes a valid connection and reports connected status with readyState 1', async () => {
      const conn = await connectDB();
      expect(conn).toBeDefined();
      expect(mongoose.connection.readyState).toBe(1);

      const status = getDatabaseStatus();
      expect(status.status).toBe('connected');
      expect(status.readyState).toBe(1);

      const diag = getDatabaseDiagnostics();
      expect(diag.lastError).toBeNull();
    });

    it('reuses existing connection across multiple invocations without reconnecting', async () => {
      const conn1 = await connectDB();
      const spyConnect = jest.spyOn(mongoose, 'connect');

      const conn2 = await connectDB();
      expect(conn1).toBe(conn2);
      expect(mongoose.connection.readyState).toBe(1);
      // Because already connected, mongoose.connect must NOT be called again
      expect(spyConnect).not.toHaveBeenCalled();
      spyConnect.mockRestore();
    });

    it('deduplicates concurrent connection attempts via shared promise', async () => {
      // Trigger multiple connectDB calls concurrently
      const [c1, c2, c3] = await Promise.all([
        connectDB(),
        connectDB(),
        connectDB(),
      ]);

      expect(c1).toBe(c2);
      expect(c2).toBe(c3);
      expect(mongoose.connection.readyState).toBe(1);
    });
  });

  // ============================================================================
  // 2. FAILED CONNECTION & ERROR SANITIZATION
  // ============================================================================
  describe('Failed Connection Handling & Sanitization', () => {
    it('catches failed connections, sanitizes secrets, and records diagnostic details', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        // Attempt connection to unreachable host with sensitive credentials in URI
        const badUri = 'mongodb+srv://adminUser:SuperSecretPassword123@invalid-cluster-fail-test.xltw3ig.mongodb.net/test';
        await expect(connectDB(badUri)).rejects.toThrow();

        expect(mongoose.connection.readyState).not.toBe(1);
        const status = getDatabaseStatus();
        expect(status.status).toBe('connection_failed');

        const diag = getDatabaseDiagnostics();
        expect(diag.lastError).toBeDefined();
        expect(diag.lastError?.name).toBeDefined();

        // Verification: Secret password must NEVER appear in the error message or logs
        expect(diag.lastError?.message).not.toContain('SuperSecretPassword123');
        expect(diag.lastError?.message).not.toContain('adminUser:SuperSecretPassword123');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('sanitizes connection error messages effectively', () => {
      const rawMsg = 'connection to mongodb+srv://myUser:SecretPass999@cluster0.abc.mongodb.net:27017 failed';
      const sanitized = sanitizeErrorMessage(rawMsg);
      expect(sanitized).not.toContain('SecretPass999');
      expect(sanitized).toContain('mongodb+srv://***:***@');
    });

    it('GET /api/health returns 503 with connection_failed status without leaking host, db name, or raw error', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        // Trigger failed state with bad URI
        await connectDB('mongodb://127.0.0.1:54321/nonexistent?serverSelectionTimeoutMS=500').catch(() => {});

        const res = await request(app).get('/api/health');
        expect(res.status).toBe(503);
        expect(res.body.checks.database.status).toBe('connection_failed');
        expect(res.body.checks.database.readyState).toBe(0);

        // Security check: No internal infrastructure details exposed in public endpoint
        expect(res.body.checks.database.host).toBeUndefined();
        expect(res.body.checks.database.name).toBeUndefined();
        expect(res.body.checks.database.lastError).toBeUndefined();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  // ============================================================================
  // 3. MISSING CONFIGURATION IN PRODUCTION
  // ============================================================================
  describe('Missing Configuration Enforcement in Production', () => {
    it('strictly prohibits in-memory database fallback in production mode when URI is missing', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalUri = process.env.MONGODB_URI;

      try {
        process.env.NODE_ENV = 'production';
        process.env.MONGODB_URI = '';

        await expect(connectDB('')).rejects.toThrow('FATAL: MONGODB_URI is strictly required in production mode');

        const status = getDatabaseStatus();
        expect(status.status).toBe('missing_configuration');
        expect(status.readyState).toBe(0);
      } finally {
        process.env.NODE_ENV = originalEnv;
        process.env.MONGODB_URI = originalUri;
      }
    });

    it('GET /api/health reports missing_configuration with HTTP 503 when MONGODB_URI is absent', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalUri = process.env.MONGODB_URI;

      try {
        process.env.NODE_ENV = 'production';
        process.env.MONGODB_URI = '';

        const res = await request(app).get('/api/health');
        expect(res.status).toBe(503);
        expect(res.body.checks.database.status).toBe('missing_configuration');
        expect(res.body.checks.database.readyState).toBe(0);
        expect(res.body.checks.database.host).toBeUndefined();
        expect(res.body.checks.database.name).toBeUndefined();
        expect(res.body.checks.database.lastError).toBeUndefined();
      } finally {
        process.env.NODE_ENV = originalEnv;
        process.env.MONGODB_URI = originalUri;
      }
    });
  });

  // ============================================================================
  // 4. SERVERLESS REQUEST INITIALIZATION
  // ============================================================================
  describe('Serverless Request Path Database Initialization', () => {
    it('automatically initializes database on incoming HTTP request without server.listen()', async () => {
      // Ensure database is disconnected prior to incoming request
      expect(mongoose.connection.readyState).toBe(0);

      // Send request directly to Express app (simulating Vercel serverless request path)
      const res = await request(app).get('/api/health');

      // The middleware or health handler must have initialized the connection
      expect(res.status).toBe(200);
      expect(res.body.checks.database.status).toBe('connected');
      expect(res.body.checks.database.readyState).toBe(1);
      expect(mongoose.connection.readyState).toBe(1);
    });

    it('database-dependent endpoints await connection before executing query', async () => {
      // Disconnect first
      await disconnectDB();
      resetConnectionCacheForTesting();
      expect(mongoose.connection.readyState).toBe(0);

      // Hit login route without pre-connecting
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'unknown@example.com',
          password: 'Password123!',
        });

      // The request should have connected and queried MongoDB, returning 401 (not 500 or timeout)
      expect(res.status).toBe(401);
      expect(mongoose.connection.readyState).toBe(1);
    });
  });

  // ============================================================================
  // 5. DATABASE NAME RESOLUTION & 'BRANDGUARD' ENFORCEMENT
  // ============================================================================
  describe('Database Name Resolution & Production BrandGuard Enforcement', () => {
    it('parses database names correctly from various MongoDB URI formats', () => {
      expect(parseMongoDbName('mongodb+srv://user:pass@cluster.mongodb.net/brandguard?retryWrites=true')).toBe('brandguard');
      expect(parseMongoDbName('mongodb://localhost:27017/brandguard')).toBe('brandguard');
      expect(parseMongoDbName('mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true')).toBe('');
      expect(parseMongoDbName('mongodb+srv://user:pass@cluster.mongodb.net')).toBe('');
      expect(parseMongoDbName('mongodb://host1:27017,host2:27017/custom_db?replicaSet=rs0')).toBe('custom_db');
    });

    it('enforces brandguard database when URI has no database specified', () => {
      const resolved = resolveTargetDatabaseName('mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true', true, false);
      expect(resolved).toBe('brandguard');
    });

    it('enforces brandguard database in production when URI defaults to unintentional test', () => {
      const resolved = resolveTargetDatabaseName('mongodb+srv://user:pass@cluster.mongodb.net/test?retryWrites=true', true, false);
      expect(resolved).toBe('brandguard');
    });

    it('preserves test database in test environment or when ALLOW_TEST_DB is enabled', () => {
      // In test mode:
      const testResolved = resolveTargetDatabaseName('mongodb://localhost:27017/test', false, true);
      expect(testResolved).toBe('test');

      // With ALLOW_TEST_DB flag:
      const originalFlag = process.env.ALLOW_TEST_DB;
      try {
        process.env.ALLOW_TEST_DB = 'true';
        const allowedResolved = resolveTargetDatabaseName('mongodb://localhost:27017/test', true, false);
        expect(allowedResolved).toBe('test');
      } finally {
        process.env.ALLOW_TEST_DB = originalFlag;
      }
    });

    it('respects custom database name when explicitly specified and not test', () => {
      const resolved = resolveTargetDatabaseName('mongodb+srv://user:pass@cluster.mongodb.net/brandguard_staging?retryWrites=true', true, false);
      expect(resolved).toBe('brandguard_staging');
    });

    it('respects MONGODB_DB_NAME environment variable override', () => {
      const resolved = resolveTargetDatabaseName('mongodb+srv://user:pass@cluster.mongodb.net/other_db', true, false, 'brandguard_override');
      expect(resolved).toBe('brandguard_override');
    });
  });
});
