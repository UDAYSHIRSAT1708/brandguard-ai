import { Router, Request, Response } from 'express';
import axios from 'axios';
import { env } from '../config/env';
import { connectDB, getDatabaseStatus, getDatabaseDiagnostics } from '../config/db';

const router = Router();

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

export default router;
