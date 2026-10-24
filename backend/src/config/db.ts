import mongoose from 'mongoose';
import { env } from './env';

let mongoMemoryServer: any = null;

export async function connectDB(): Promise<typeof mongoose> {
  // If already connected, reuse
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const isTest = env.NODE_ENV === 'test' || process.env.NODE_ENV === 'test';
  const isProduction = env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';

  // 1. Isolated in-memory database for automated tests to protect dev and staging data
  if (isTest) {
    if (process.env.TEST_MONGODB_URI) {
      const conn = await mongoose.connect(process.env.TEST_MONGODB_URI);
      return conn;
    }
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    if (!mongoMemoryServer) {
      mongoMemoryServer = await MongoMemoryServer.create();
    }
    const testUri = mongoMemoryServer.getUri();
    const conn = await mongoose.connect(testUri);
    return conn;
  }

  // 2. Production or Development MongoDB Connection
  let connectionUri = env.MONGODB_URI;

  if (!connectionUri || connectionUri.trim() === '') {
    if (isProduction) {
      throw new Error('FATAL: MONGODB_URI is strictly required in production mode. In-memory temporary database fallback is prohibited.');
    }
    
    console.log('ℹ️ No MONGODB_URI provided. Initializing local in-memory MongoDB instance for development...');
    try {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      mongoMemoryServer = await MongoMemoryServer.create();
      connectionUri = mongoMemoryServer.getUri();
      console.log('✅ In-memory MongoDB running at:', connectionUri);
    } catch (err: any) {
      console.error('Failed to start MongoMemoryServer:', err.message);
      throw err;
    }
  }

  try {
    const conn = await mongoose.connect(connectionUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`✅ MongoDB connected successfully to: ${conn.connection.host || 'local-memory'} (db: ${conn.connection.name})`);
    return conn;
  } catch (error: any) {
    console.error('❌ MongoDB connection error:', error.message);
    if (!isProduction) {
      console.log('⚠️ Failed to connect to configured MONGODB_URI in development. Initializing fallback in-memory MongoDB...');
      try {
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        mongoMemoryServer = await MongoMemoryServer.create();
        const fallbackUri = mongoMemoryServer.getUri();
        console.log('✅ Fallback In-memory MongoDB running at:', fallbackUri);
        const conn = await mongoose.connect(fallbackUri);
        return conn;
      } catch (innerErr: any) {
        console.error('Failed to initialize in-memory fallback:', innerErr.message);
      }
    }
    throw error;
  }
}

export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoMemoryServer) {
    await mongoMemoryServer.stop();
    mongoMemoryServer = null;
  }
}
