import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps any async route handler — eliminates try/catch boilerplate
 * in every controller. Errors are forwarded to the global error handler.
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
