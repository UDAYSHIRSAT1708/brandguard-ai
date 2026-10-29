import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';

export interface AppError extends Error {
  statusCode?: number;
  details?: any;
}

export function errorHandler(
  err: AppError | ZodError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  let statusCode = 500;
  let message = err.message;
  let code = (err as any).code;
  let details: any = undefined;

  if (err instanceof ZodError || err.name === 'ZodError') {
    statusCode = 400;
    message = 'Validation error: invalid request payload.';
    code = 'VALIDATION_ERROR';
    details = (err as any).issues || (err as any).errors;
  } else if ('statusCode' in err && typeof (err as any).statusCode === 'number') {
    statusCode = (err as any).statusCode;
    details = (err as AppError).details;
  }

  const isProduction = env.NODE_ENV === 'production';

  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, {
    message,
    statusCode,
    code,
    stack: isProduction ? undefined : err.stack,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      message: statusCode === 500 && isProduction ? 'Internal Server Error' : message,
      ...(code ? { code } : {}),
      ...(details ? { details } : {}),
      ...(isProduction ? {} : { stack: err.stack }),
    },
  });
}
