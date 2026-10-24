import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import { env } from '../config/env';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const dbConnected = mongoose.connection.readyState === 1;

  let aiServiceStatus = 'unreachable';
  let aiServiceDetails = null;

  try {
    const probeQuery = req.query.probe === 'true' ? '?probe=true' : '';
    const aiResponse = await axios.get(`${env.AI_SERVICE_URL}/health${probeQuery}`, {
      timeout: 4000,
    });
    aiServiceStatus = aiResponse.data.status || 'healthy';
    aiServiceDetails = aiResponse.data;
  } catch (err: any) {
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
        status: dbConnected ? 'connected' : 'disconnected',
        readyState: mongoose.connection.readyState,
        name: mongoose.connection.name,
        host: mongoose.connection.host,
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
