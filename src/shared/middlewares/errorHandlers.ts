import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { AppError } from '../../shared/utils/AppError';
import { logger } from '../../logger/index';
import { config } from '../../config/index';

export const errorHandler = (
  err:   Error,
  req:   Request,
  res:   Response,
  _next: NextFunction,
): void => {
  logger.error('Error caught by global handler', {
    message:  err.message,
    stack:    config.isDev ? err.stack : undefined,
    url:      req.url,
    method:   req.method,
    vendorId: (req as Request & { vendor?: { id: string } }).vendor?.id,
  });

  // ── AppError (operational / expected) ─────────────────
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code:    err.code,
      requestId: (req as any).requestId,
    });
    return;
  }

  // ── Zod validation error ───────────────────────────────
  if (err instanceof ZodError) {
    const errors = err.issues.map((e) => ({
      field:   e.path.join('.'),
      message: e.message,
    }));
    res.status(422).json({
      success: false,
      message: 'Validation failed',
      code:    'VALIDATION_ERROR',
      errors,
    });
    return;
  }

  // ── MongoDB duplicate key ──────────────────────────────
  if (
    err instanceof mongoose.mongo.MongoServerError &&
    (err as mongoose.mongo.MongoServerError).code === 11000
  ) {
    const mongoErr = err as mongoose.mongo.MongoServerError;
    const field    = Object.keys(mongoErr.keyPattern ?? {})[0] ?? 'field';
    res.status(409).json({
      success: false,
      message: `${field} already exists`,
      code:    'DUPLICATE_KEY',
    });
    return;
  }

  // ── JWT errors ─────────────────────────────────────────
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
      code:    'UNAUTHORIZED',
    });
    return;
  }

  // ── Unknown / programming errors ───────────────────────
  res.status(500).json({
    success: false,
    message: config.isProd ? 'Something went wrong' : err.message,
    code:    'INTERNAL_ERROR',
    ...(config.isDev && { stack: err.stack }),
  });
};

// ── 404 handler ───────────────────────────────────────────
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.url} not found`,
    code:    'ROUTE_NOT_FOUND',
  });
};
