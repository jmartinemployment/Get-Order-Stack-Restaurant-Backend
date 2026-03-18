import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { logger } from '../utils/logger';

const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'x-xsrf-token';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Safe HTTP methods that don't need CSRF validation
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection via double-submit cookie pattern (PCI DSS 6.5.9).
 *
 * 1. On every response, set a non-HttpOnly XSRF-TOKEN cookie (JS-readable).
 * 2. Angular's HttpClient reads this cookie and sends it as X-XSRF-TOKEN header.
 * 3. On state-changing requests (POST/PUT/PATCH/DELETE), verify header matches cookie.
 *
 * An attacker on a different origin cannot read our cookie, so they cannot forge the header.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Generate or read existing CSRF token
  let csrfToken = req.cookies?.[CSRF_COOKIE] as string | undefined;

  if (!csrfToken) {
    csrfToken = crypto.randomBytes(32).toString('hex');
  }

  // Always set/refresh the cookie so the frontend can read it
  res.cookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false, // Must be readable by JS (Angular reads it)
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? 'none' : 'lax',
    path: '/',
  });

  // Skip validation for safe methods
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  // Skip CSRF for webhook endpoints (they use their own signature verification)
  if (req.path.startsWith('/api/webhooks/')) {
    next();
    return;
  }

  // Validate: header must match cookie
  const headerToken = req.headers[CSRF_HEADER] as string | undefined;

  if (!headerToken || headerToken !== csrfToken) {
    logger.warn('[CSRF] Token mismatch', { path: req.path, method: req.method });
    res.status(403).json({ error: 'CSRF token validation failed' });
    return;
  }

  next();
}
