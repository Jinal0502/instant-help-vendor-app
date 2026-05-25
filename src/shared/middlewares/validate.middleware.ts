import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

type RequestPart = 'body' | 'query' | 'params';

// Factory — returns middleware that validates a specific part of the request
export const validate = (schema: ZodSchema, part: RequestPart = 'body') => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      next(result.error); // ZodError caught by global error handler
      return;
    }
    // Replace with parsed + coerced values
    (req as any)[part] = result.data;
    next();
  };
};
