import { Response } from 'express';
import { ApiResponse, PaginationMeta } from "../../types/index"

/** 
 * Utility functions to standardize API responses across the application.
 * Provides methods for sending success, error, created, and no-content responses,
 * as well as a helper to build pagination metadata.
*/
export const sendSuccess = <T>(
  res:        Response,
  data:       T,
  message   = 'Success',
  statusCode = 200,
  meta?:      PaginationMeta,
): void => {
  const payload: ApiResponse<T> = { success: true, message, data, ...(meta && { meta }) };
  res.status(statusCode).json(payload);
};

/**
 * Utility function to send standardized error responses.
 * Accepts an optional status code and error code for more specific error handling.
 * Defaults to a 500 Internal Server Error if no status code is provided.
 * @param res - Express Response object
 * @param message - Error message to send in the response
 * @param statusCode - HTTP status code for the error response (default: 500)
 * @param code - Optional application-specific error code
 */

export const sendError = (
  res: Response,
  message = 'Something went wrong',
  statusCode = 500,
  code?: string,
): void => {
  res.status(statusCode).json({
    success: false,
    message,
    ...(code && { code }),
  });
};

export const sendCreated = <T>(res: Response, data: T, message = 'Created successfully'): void => {
  sendSuccess(res, data, message, 201);
};

export const sendNoContent = (res: Response): void => {
  res.status(204).send();
};

export const buildPaginationMeta = (
  page:  number,
  limit: number,
  total: number,
): PaginationMeta => {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
};

/**
 * Parses pagination parameters from the request.
 * @param page - The page number (optional)
 * @param limit - The number of items per page (optional)
 * @returns An object containing the parsed page and limit values
 */

export const parsePagination = (
  page?: string,
  limit?: string,
) => {
  return {
    page: Math.max(Number(page) || 1, 1),
    limit: Math.min(
      Math.max(Number(limit) || 10, 1),
      100
    ),
  };
};
