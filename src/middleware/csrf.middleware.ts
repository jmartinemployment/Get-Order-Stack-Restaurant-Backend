import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Content-Type enforcement for SPA + REST API architecture (PCI DSS 6.5.9).
 *
 * Three-layer defense:
 * 1. Strict CORS origin allowlist (app.config.ts) — blocks cross-origin requests
 * 2. Bearer-only auth (no cookies) — CSRF attacks require cookie-based auth
 * 3. Content-Type enforcement (below) — cross-origin forms can't send application/json
 *
 * A cross-origin attacker using a <form> submission cannot set Content-Type to
 * application/json — the browser sends application/x-www-form-urlencoded instead.
 * Setting a non-simple Content-Type triggers a CORS preflight, which the browser
 * blocks because the attacker's origin is not in our CORS allowlist.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'DELETE']);

/**
 * Require Content-Type: application/json or multipart/form-data on state-changing requests.
 */
export function requireJsonContentType(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  // Webhooks use their own HMAC signature verification
  if (req.path.startsWith('/webhooks/')) {
    next();
    return;
  }

  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
    logger.warn('[ContentType] Rejected non-JSON/FormData content type', { path: req.path, method: req.method, contentType });
    res.status(403).json({ error: 'Content-Type application/json or multipart/form-data required' });
    return;
  }

  next();
}
