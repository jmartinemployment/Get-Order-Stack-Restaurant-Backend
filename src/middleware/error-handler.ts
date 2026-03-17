import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function globalErrorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error('Unhandled error', {
    message: error.message,
    stack: error.stack,
    method: req.method,
    path: req.path,
    ip: req.ip,
  });

  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ error: 'Internal server error' });
  } else {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
}
