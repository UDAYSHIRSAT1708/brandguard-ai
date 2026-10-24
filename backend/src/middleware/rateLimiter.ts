import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  timestamps: number[];
}

const ipStore = new Map<string, RateLimitRecord>();

// Clean up expired IP records periodically every 10 minutes (unreferenced so tests exit cleanly)
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipStore.entries()) {
    record.timestamps = record.timestamps.filter((ts) => now - ts < 15 * 60 * 1000);
    if (record.timestamps.length === 0) {
      ipStore.delete(ip);
    }
  }
}, 10 * 60 * 1000);
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  message: string;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // In test environment, do not throttle automated test runners
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown-ip';
    const key = `${req.path}_${clientIp.split(',')[0].trim()}`;
    const now = Date.now();

    const record = ipStore.get(key) || { timestamps: [] };
    record.timestamps = record.timestamps.filter((ts) => now - ts < options.windowMs);

    if (record.timestamps.length >= options.maxRequests) {
      const oldest = record.timestamps[0];
      const retryAfterSeconds = Math.ceil((options.windowMs - (now - oldest)) / 1000);

      res.setHeader('Retry-After', retryAfterSeconds);
      res.status(429).json({
        success: false,
        error: {
          message: options.message,
          retryAfterSeconds,
        },
      });
      return;
    }

    record.timestamps.push(now);
    ipStore.set(key, record);
    next();
  };
}

export const registerRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  message: 'Too many registration requests from this IP. Please wait before attempting again.',
});

export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 20,
  message: 'Too many authentication attempts from this IP. Please try again later.',
});
