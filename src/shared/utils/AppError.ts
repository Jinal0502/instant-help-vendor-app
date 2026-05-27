import { AuthVendorPayload } from '../../types/index';
import { AuthRequest } from '../../types/index';

export class AppError extends Error {
  public readonly statusCode:    number;
  public readonly isOperational: boolean;
  public readonly code?:         string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode    = statusCode;
    this.isOperational = true;
    this.code          = code;
    Error.captureStackTrace(this, this.constructor);
    Object.setPrototypeOf(this, AppError.prototype);
  }

  // ── Common factory methods ──────────────────────────────
  static badRequest(message: string, code?: string): AppError {
    return new AppError(message, 400, code);
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static notFound(resource = 'Resource'): AppError {
    return new AppError(`${resource} not found`, 404, 'NOT_FOUND');
  }

  static conflict(message: string, code?: string): AppError {
    return new AppError(message, 409, code);
  }

  static tooManyRequests(message = 'Too many requests'): AppError {
    return new AppError(message, 429, 'RATE_LIMITED');
  }

  static internal(message = 'Internal server error'): AppError {
    return new AppError(message, 500, 'INTERNAL_ERROR');
  }
}

/**
 * Safe accessor for the authenticated vendor on a request.
 * Throws 401 if the middleware was somehow skipped.
 */
export const getAuthVendor = (req: AuthRequest): AuthVendorPayload => {
  if (!req.vendor) throw AppError.unauthorized();
  return req.vendor;
};
