import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/health') {
    next();
    return;
  }

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const userId = (req as Request & { user?: { teamMemberId?: string } }).user?.teamMemberId;

    const logFn = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    logger[logFn]('HTTP request', {
      method: req.method,
      path: req.path,
      status,
      duration,
      userId,
      ip: req.ip,
    });
  });

  next();
}
