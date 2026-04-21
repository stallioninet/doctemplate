import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { MissingVariableError } from '../utils/templateEngine';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
  }

  if (err instanceof MissingVariableError) {
    return res.status(400).json({
      error: {
        code: 'MISSING_VARIABLE',
        message: err.message,
        variable: err.variable,
      },
    });
  }

  console.error('[error]', err);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
};
