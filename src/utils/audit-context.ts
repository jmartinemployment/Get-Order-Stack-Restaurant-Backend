import { Request } from 'express';

/**
 * Extract audit context from an Express request.
 * Use with `auditLog()` to automatically capture userId, IP, and User-Agent.
 *
 * Example:
 *   auditLog('check_created', { ...auditCtx(req), metadata: { checkId } });
 */
export function auditCtx(req: Request): { userId?: string; ip?: string; userAgent?: string } {
  return {
    userId: req.user?.teamMemberId,
    ip: req.ip ?? undefined,
    userAgent: req.headers['user-agent'],
  };
}
