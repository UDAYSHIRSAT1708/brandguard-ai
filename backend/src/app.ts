import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env';
import healthRouter from './routes/health.routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

/**
 * Resolves the list of permitted CORS origins.
 * Normalizes origins by trimming whitespace and removing trailing slashes.
 */
export function resolveAllowedOrigins(): string[] {
  const allowed = new Set<string>();

  // 1. Explicitly permit production frontend deployment & current preview deployment
  allowed.add('https://brandguard-ai-dafa.vercel.app');
  allowed.add('https://brandguard-ai-dafa-nhsqi3kpp-temp-7e59.vercel.app');

  // 2. Local development origins
  allowed.add('http://localhost:3000');
  allowed.add('http://127.0.0.1:3000');
  allowed.add('http://localhost:5173');
  allowed.add('http://127.0.0.1:5173');

  // 3. FRONTEND_URL from environment (supports single or comma-separated list)
  const frontendEnv = process.env.FRONTEND_URL || env.FRONTEND_URL;
  if (frontendEnv) {
    frontendEnv.split(',').forEach((url) => {
      const clean = url.trim().replace(/\/+$/, '');
      if (clean) allowed.add(clean);
    });
  }

  // 4. ALLOWED_ORIGINS from environment (supports comma-separated list)
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || env.ALLOWED_ORIGINS;
  if (allowedOriginsEnv) {
    allowedOriginsEnv.split(',').forEach((url) => {
      const clean = url.trim().replace(/\/+$/, '');
      if (clean) allowed.add(clean);
    });
  }

  return Array.from(allowed);
}

export const corsOptions: cors.CorsOptions = {
  origin: (requestOrigin, callback) => {
    // Non-browser or server-to-server requests (e.g. curl, health checks)
    if (!requestOrigin) {
      return callback(null, true);
    }

    const cleanOrigin = requestOrigin.trim().replace(/\/+$/, '');
    const allowed = resolveAllowedOrigins();
    if (allowed.includes(cleanOrigin)) {
      return callback(null, true);
    }

    // Permit all genuine BrandGuard AI Vercel frontend deployments (production, branch, and preview deployments)
    if (/^https:\/\/brandguard-ai[a-z0-9-]*\.vercel\.app$/i.test(cleanOrigin)) {
      return callback(null, true);
    }

    // Origin not allowed: pass false so cors does not attach Allow-Origin headers
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Internal-API-Key',
    'Accept',
    'Origin',
    'X-Requested-With',
  ],
  optionsSuccessStatus: 204,
  maxAge: 86400, // 24 hours preflight cache
};

// Security Headers via Helmet - explicitly allow cross-origin resource consumption for web app
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS configuration - strict origin matching with preflight handling
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Request parsing with bounded body limits to prevent resource exhaustion attacks
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

import mongoose from 'mongoose';
import { connectDB } from './config/db';

// Database connection middleware for all incoming requests (crucial for Serverless / Vercel execution)
app.use(async (req, res, next) => {
  // Preflight OPTIONS requests and health checks do not depend on MongoDB query evaluation
  if (req.method === 'OPTIONS' || req.path.startsWith('/api/health') || req.path === '/health') {
    return next();
  }

  if (mongoose.connection.readyState === 1) {
    return next();
  }

  try {
    await connectDB();
    next();
  } catch {
    // Database-dependent routes fail fast with 503 rather than hanging or crashing
    res.status(503).json({
      success: false,
      error: {
        message: 'Database service is currently unavailable. Please retry in a few moments.',
        code: 'DATABASE_UNAVAILABLE',
      },
    });
  }
});

// Health Check Route
app.use('/api/health', healthRouter);
app.use('/health', healthRouter);

// Domain Routes
import authRouter from './routes/auth.routes';
import knowledgeRouter from './routes/knowledge.routes';
import contentRouter from './routes/content.routes';
import approvalRouter from './routes/approval.routes';
import auditRouter from './routes/audit.routes';
import analyticsRouter from './routes/analytics.routes';

app.use('/api/auth', authRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/content', contentRouter);
app.use('/api/approvals', approvalRouter);
app.use('/api/audit-log', auditRouter);
app.use('/api/analytics', analyticsRouter);

// 404 Handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { message: `Route not found: ${req.method} ${req.originalUrl}` }
  });
});

// Centralized error handler
app.use(errorHandler);

export default app;
