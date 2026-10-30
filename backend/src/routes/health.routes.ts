import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { connectDB, getDatabaseStatus, getDatabaseDiagnostics } from '../config/db';
import { ReviewJob } from '../models/ReviewJob';
import { UserPayload } from '../middleware/auth';

const router = Router();

/**
 * Access control middleware for deep production diagnostics.
 * Accepts either:
 * 1. Admin/Owner session Bearer JWT
 * 2. Shared secret header X-Internal-API-Key
 */
function authenticateDiagnosticAccess(req: Request, res: Response, next: NextFunction): void {
  const internalKey = req.headers['x-internal-api-key'];
  if (internalKey && typeof internalKey === 'string' && internalKey === env.AI_SERVICE_API_KEY) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as UserPayload;
      if (['admin', 'owner'].includes(decoded.role)) {
        req.user = decoded;
        return next();
      }
      res.status(403).json({
        success: false,
        error: { message: 'Forbidden: Deep diagnostics requires an administrative session.' }
      });
      return;
    } catch {
      // Invalid JWT -> fall through to 401
    }
  }

  res.status(401).json({
    success: false,
    error: { message: 'Authentication required. Provide valid admin credentials or X-Internal-API-Key.' }
  });
}

// -----------------------------------------------------------------------------
// Inexpensive public health check (Liveness / Readiness probe)
// -----------------------------------------------------------------------------
router.get('/', async (req: Request, res: Response) => {
  // Ensure connection attempt has been evaluated for this request
  let dbStatus = getDatabaseStatus();
  if (dbStatus.status === 'disconnected') {
    try {
      await connectDB();
    } catch {
      // Connect error is captured in internal cache
    }
    dbStatus = getDatabaseStatus();
  }

  const dbConnected = dbStatus.status === 'connected';

  // Keep sanitized diagnostic details strictly in server logs, never exposed to public API
  if (!dbConnected) {
    const diag = getDatabaseDiagnostics();
    console.warn('[HEALTH CHECK] Database is not connected:', {
      status: diag.status,
      readyState: diag.readyState,
      errorName: diag.lastError?.name,
      errorCode: diag.lastError?.code,
      errorMessage: diag.lastError?.message,
    });
  }

  let aiServiceStatus = 'unreachable';
  let aiServiceDetails = null;

  try {
    const probeQuery = req.query.probe === 'true' ? '?probe=true' : '';
    const aiResponse = await axios.get(`${env.AI_SERVICE_URL}/health${probeQuery}`, {
      timeout: 4000,
    });
    aiServiceStatus = aiResponse.data.status || 'healthy';
    aiServiceDetails = aiResponse.data;
  } catch {
    aiServiceStatus = 'offline';
  }

  const isFullyHealthy = dbConnected && aiServiceStatus === 'healthy';
  const isOperational = dbConnected;

  res.status(isOperational ? 200 : 503).json({
    status: isFullyHealthy ? 'healthy' : isOperational ? 'degraded' : 'unhealthy',
    service: 'BrandGuard Application Backend',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    checks: {
      database: {
        status: dbStatus.status,
        readyState: dbStatus.readyState,
      },
      aiService: {
        status: aiServiceStatus,
        url: env.AI_SERVICE_URL,
        details: aiServiceDetails,
      },
    },
  });
});

// -----------------------------------------------------------------------------
// Authenticated Deep Production Diagnostic Suite (Phase 1)
// -----------------------------------------------------------------------------
const runDiagnosticsHandler = async (req: Request, res: Response, next: NextFunction) => {
  const startTotal = Date.now();
  const timestamp = new Date().toISOString();

  try {
    // 1. Database Connectivity & Ping
    let dbStatus = getDatabaseStatus();
    if (dbStatus.status === 'disconnected') {
      try {
        await connectDB();
      } catch {
        // Handled below
      }
      dbStatus = getDatabaseStatus();
    }

    let dbPingMs: number | null = null;
    let dbPingOk = false;
    if (mongoose.connection?.db) {
      const dbStart = Date.now();
      try {
        await mongoose.connection.db.admin().ping();
        dbPingMs = Date.now() - dbStart;
        dbPingOk = true;
      } catch (err: any) {
        console.error('[DIAGNOSTICS] Database ping failed:', err.message);
      }
    }

    // 2. Upstream AI Service Deep Diagnostic Probe
    let aiDiagnosticData: any = null;
    let aiDiagnosticStatus = 'unreachable';
    try {
      const aiRes = await axios.post(
        `${env.AI_SERVICE_URL}/api/v1/diagnostics/run`,
        {},
        {
          headers: { 'X-Internal-API-Key': env.AI_SERVICE_API_KEY },
          timeout: 15000,
        }
      );
      aiDiagnosticData = aiRes.data;
      aiDiagnosticStatus = aiRes.data?.overall_status || 'healthy';
    } catch (err: any) {
      aiDiagnosticStatus = 'failed';
      aiDiagnosticData = {
        error: `AI Service diagnostic probe failed: ${err.message}`,
        reachable: false,
      };
    }

    // 3. Async Review Job & Recovery Pipeline Verification
    let jobRecoveryVerified = false;
    let pendingJobsCount = 0;
    try {
      pendingJobsCount = await ReviewJob.countDocuments({
        status: { $in: ['QUEUED', 'RUNNING'] },
      });
      jobRecoveryVerified = true;
    } catch {
      jobRecoveryVerified = false;
    }

    // 4. Compute 5 Tier Posture Levels
    const serviceReachable = dbPingOk && aiDiagnosticStatus !== 'unreachable';
    const credentialsConfigured = Boolean(aiDiagnosticData?.tiers?.configured);
    const providerAuthVerified = Boolean(aiDiagnosticData?.tiers?.authenticated);
    const modelGenerationVerified = Boolean(aiDiagnosticData?.tiers?.generation_verified);
    const endToEndVerified = Boolean(
      serviceReachable &&
      jobRecoveryVerified &&
      aiDiagnosticData?.tiers?.end_to_end_verified
    );

    let overallStatus = 'unhealthy';
    if (endToEndVerified) {
      overallStatus = 'healthy';
    } else if (serviceReachable && (credentialsConfigured || providerAuthVerified)) {
      overallStatus = 'degraded';
    } else if (!serviceReachable) {
      overallStatus = 'unhealthy';
    }

    const elapsedMs = Date.now() - startTotal;

    // Sanitized Logging (Zero credentials)
    console.info(
      `[DIAGNOSTICS] Deep check completed in ${elapsedMs}ms: overallStatus=${overallStatus}, ` +
      `db=${dbPingOk ? 'connected' : 'failed'}, ai=${aiDiagnosticStatus}`
    );

    res.json({
      success: true,
      data: {
        timestamp,
        environment: env.NODE_ENV,
        overallStatus,
        tiers: {
          serviceReachable,
          credentialsConfigured,
          providerAuthVerified,
          modelGenerationVerified,
          endToEndVerified,
        },
        components: {
          database: {
            status: dbStatus.status,
            readyState: dbStatus.readyState,
            pingLatencyMs: dbPingMs,
            connected: dbPingOk,
          },
          aiService: aiDiagnosticData,
          reviewJobPipeline: {
            verified: jobRecoveryVerified,
            activeJobsInFlight: pendingJobsCount,
          },
          network: {
            frontendUrl: env.FRONTEND_URL,
            allowedOriginsConfigured: Boolean(env.ALLOWED_ORIGINS),
          },
        },
        elapsedMs,
      },
    });
  } catch (err) {
    next(err);
  }
};

router.post('/diagnostics', authenticateDiagnosticAccess, runDiagnosticsHandler);
router.get('/diagnostics', authenticateDiagnosticAccess, runDiagnosticsHandler);

export default router;
