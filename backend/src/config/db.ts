import mongoose from 'mongoose';
import { env } from './env';

export interface DatabaseStatus {
  status: 'connected' | 'connecting' | 'disconnecting' | 'disconnected' | 'missing_configuration' | 'connection_failed';
  readyState: number;
}

export interface DatabaseDiagnostics {
  status: DatabaseStatus['status'];
  readyState: number;
  lastError: {
    name: string;
    code?: string | number;
    message: string;
    timestamp: string;
  } | null;
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  lastError: {
    name: string;
    code?: string | number;
    message: string;
    timestamp: string;
  } | null;
}

// Global cache across serverless warm invocations (Vercel / AWS Lambda)
declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

let cached: MongooseCache = global.mongooseCache || {
  conn: null,
  promise: null,
  lastError: null,
};

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

let mongoMemoryServer: any = null;

function getRuntimeEnvironment(): { isProduction: boolean; isTest: boolean } {
  const current = process.env.NODE_ENV || env.NODE_ENV;
  return {
    isProduction: current === 'production',
    isTest: current === 'test',
  };
}

/**
 * Sanitizes connection strings and error messages to ensure credentials,
 * passwords, and tokens are never printed in logs or exposed in API responses.
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return '';
  return message
    .replace(/mongodb(\+srv)?:\/\/[^@]+@/gi, 'mongodb$1://***:***@')
    .replace(/(password|secret|key|token|auth)=[^&]+/gi, '$1=***');
}

/**
 * Safely parses the database name from a MongoDB connection string.
 * Supports mongodb:// and mongodb+srv:// URIs without logging or exposing credentials.
 */
export function parseMongoDbName(uri: string): string {
  if (!uri) return '';
  try {
    const match = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/i);
    return (match && match[1]) ? decodeURIComponent(match[1].trim()) : '';
  } catch {
    return '';
  }
}

/**
 * Resolves the target database name to ensure the production connection connects
 * to the intended 'brandguard' database and never defaults to 'test' unintentionally.
 */
export function resolveTargetDatabaseName(
  uri: string,
  isProduction: boolean,
  isTest: boolean,
  envDbName?: string
): string {
  // 1. Explicit override via environment variable takes top precedence
  if (envDbName && envDbName.trim() !== '') {
    return envDbName.trim();
  }

  // 2. Parse database name from the connection URI
  const parsedName = parseMongoDbName(uri);

  // 3. If no database specified in URI (e.g. mongodb+srv://.../ or empty path), default to 'brandguard'
  if (!parsedName) {
    return 'brandguard';
  }

  // 4. If parsed name is 'test', check whether 'test' is explicitly intentional
  if (parsedName.toLowerCase() === 'test') {
    const isExplicitlyAllowed = isTest || process.env.ALLOW_TEST_DB === 'true';
    if (!isExplicitlyAllowed) {
      // In production and dev without ALLOW_TEST_DB, 'test' is an unintended default from URI templates
      return 'brandguard';
    }
    return 'test';
  }

  return parsedName;
}

/**
 * Returns the current live status of the database connection for public health checks.
 * Strips internal details like hostnames, database names, and raw error stacks.
 */
export function getDatabaseStatus(): DatabaseStatus {
  const readyState = mongoose.connection.readyState;
  const uri = process.env.MONGODB_URI !== undefined ? process.env.MONGODB_URI : env.MONGODB_URI;
  const isConfigured = Boolean(uri && uri.trim() !== '');

  let status: DatabaseStatus['status'];
  if (!isConfigured) {
    status = 'missing_configuration';
  } else if (readyState === 1) {
    status = 'connected';
  } else if (readyState === 2) {
    status = 'connecting';
  } else if (readyState === 3) {
    status = 'disconnecting';
  } else if (cached.lastError) {
    status = 'connection_failed';
  } else {
    status = 'disconnected';
  }

  return {
    status,
    readyState,
  };
}

/**
 * Returns diagnostic details strictly for server-side logging.
 * Never expose the result of this function through public HTTP endpoints.
 */
export function getDatabaseDiagnostics(): DatabaseDiagnostics {
  const { status, readyState } = getDatabaseStatus();
  return {
    status,
    readyState,
    lastError: cached.lastError,
  };
}

/**
 * Connects to MongoDB, reusing an existing active connection or in-flight promise.
 * Deduplicates concurrent connection attempts across serverless invocations.
 */
export async function connectDB(customUri?: string): Promise<typeof mongoose> {
  // 1. If customUri provided, disconnect any previous connection first
  if (customUri !== undefined && mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    cached.conn = null;
    cached.promise = null;
  }

  // 2. If already connected, reuse existing connection immediately
  if (mongoose.connection.readyState === 1) {
    cached.conn = mongoose;
    cached.lastError = null;
    return mongoose;
  }

  // 3. If connection is already in flight, reuse the pending promise to avoid concurrent duplicates
  if (cached.promise) {
    return await cached.promise;
  }

  const { isProduction, isTest } = getRuntimeEnvironment();

  // 4. Isolated in-memory database strictly for automated tests (when no customUri provided)
  if (isTest && customUri === undefined) {
    cached.promise = (async () => {
      if (process.env.TEST_MONGODB_URI) {
        const conn = await mongoose.connect(process.env.TEST_MONGODB_URI);
        cached.conn = conn;
        cached.lastError = null;
        return conn;
      }
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      if (!mongoMemoryServer) {
        mongoMemoryServer = await MongoMemoryServer.create();
      }
      const testUri = mongoMemoryServer.getUri();
      const conn = await mongoose.connect(testUri);
      cached.conn = conn;
      cached.lastError = null;
      return conn;
    })().finally(() => {
      cached.promise = null;
    });

    return await cached.promise;
  }

  // 5. Resolve connection URI
  const connectionUri = customUri !== undefined
    ? customUri
    : (process.env.MONGODB_URI !== undefined ? process.env.MONGODB_URI : env.MONGODB_URI);

  if (!connectionUri || connectionUri.trim() === '') {
    if (isProduction) {
      cached.lastError = {
        name: 'ConfigurationError',
        code: 'MISSING_MONGODB_URI',
        message: 'MONGODB_URI environment variable is missing or empty.',
        timestamp: new Date().toISOString(),
      };
      console.error('[DATABASE] Configuration error: MONGODB_URI is missing in production.');
      throw new Error('FATAL: MONGODB_URI is strictly required in production mode. In-memory temporary database fallback is prohibited.');
    }

    console.log('ℹ️ No MONGODB_URI provided. Initializing local in-memory MongoDB instance for development...');
    try {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      mongoMemoryServer = await MongoMemoryServer.create();
      const devUri = mongoMemoryServer.getUri();
      console.log('✅ In-memory MongoDB running at:', devUri);
      const conn = await mongoose.connect(devUri);
      cached.conn = conn;
      cached.lastError = null;
      return conn;
    } catch (err: any) {
      console.error('Failed to start MongoMemoryServer:', sanitizeErrorMessage(err.message));
      throw err;
    }
  }

  // 6. Resolve target database name to ensure brandguard database is used in production
  const targetDbName = resolveTargetDatabaseName(
    connectionUri,
    isProduction,
    isTest,
    process.env.MONGODB_DB_NAME
  );

  // 7. Connect with options suitable for serverless and container runtimes
  const opts: mongoose.ConnectOptions = {
    bufferCommands: false, // Fail fast if disconnected rather than buffering queries indefinitely
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    dbName: targetDbName,
  };

  cached.promise = mongoose
    .connect(connectionUri, opts)
    .then((conn) => {
      cached.conn = conn;
      cached.lastError = null;
      console.log(`[DATABASE] MongoDB connected successfully (database: ${targetDbName})`);
      return conn;
    })
    .catch((error: any) => {
      cached.conn = null;
      const sanitized = sanitizeErrorMessage(error.message);
      cached.lastError = {
        name: error.name || 'MongoError',
        code: error.code || (error as any).errorLabels || 'CONNECTION_FAILED',
        message: sanitized,
        timestamp: new Date().toISOString(),
      };

      console.error('[DATABASE] MongoDB connection error:', {
        name: cached.lastError.name,
        code: cached.lastError.code,
        message: cached.lastError.message,
      });

      if (!isProduction && !isTest) {
        console.log('⚠️ Failed to connect to configured MONGODB_URI in development. Initializing fallback in-memory MongoDB...');
        return (async () => {
          try {
            const { MongoMemoryServer } = await import('mongodb-memory-server');
            mongoMemoryServer = await MongoMemoryServer.create();
            const fallbackUri = mongoMemoryServer.getUri();
            console.log('✅ Fallback In-memory MongoDB running at:', fallbackUri);
            const fallbackConn = await mongoose.connect(fallbackUri);
            cached.conn = fallbackConn;
            cached.lastError = null;
            return fallbackConn;
          } catch (innerErr: any) {
            console.error('Failed to initialize in-memory fallback:', sanitizeErrorMessage(innerErr.message));
            throw error;
          }
        })();
      }

      throw error;
    })
    .finally(() => {
      cached.promise = null;
    });

  return await cached.promise;
}

export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  cached.conn = null;
  cached.promise = null;
  cached.lastError = null;
  if (mongoMemoryServer) {
    await mongoMemoryServer.stop();
    mongoMemoryServer = null;
  }
}

/**
 * Resets the connection cache. Specifically for test suites testing reconnection and failure states.
 */
export function resetConnectionCacheForTesting(): void {
  cached.conn = null;
  cached.promise = null;
  cached.lastError = null;
}
