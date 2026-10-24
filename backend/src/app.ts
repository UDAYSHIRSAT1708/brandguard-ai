import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env';
import healthRouter from './routes/health.routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Security Headers via Helmet
app.use(helmet());

// CORS configuration - strict origin matching
app.use(cors({
  origin: [env.FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Internal-API-Key'],
}));

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
  // Health check routes inspect connection status directly and format their own diagnostic response
  if (req.path.startsWith('/api/health') || req.path === '/health') {
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
