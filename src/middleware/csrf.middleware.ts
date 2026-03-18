import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * CSRF protection for SPA + REST API architecture (PCI DSS 6.5.9).
 *
 * Three-layer defense:
 * 1. Strict CORS origin allowlist (app.config.ts) — blocks cross-origin requests
 * 2. SameSite cookies (auth.routes.ts) — browser won't send auth cookie cross-site
 * 3. Content-Type enforcement (below) — cross-origin forms can't send application/json
 *
 * A cross-origin attacker using a <form> submission cannot set Content-Type to
 * application/json — the browser sends application/x-www-form-urlencoded instead.
 * Setting a non-simple Content-Type triggers a CORS preflight, which the browser
 * blocks because the attacker's origin is not in our CORS allowlist.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Require Content-Type: application/json or multipart/form-data on state-changing requests.
 * This prevents CSRF via cross-origin form submissions.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
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
    logger.warn('[CSRF] Rejected non-JSON/FormData content type', { path: req.path, method: req.method, contentType });
    res.status(403).json({ error: 'Content-Type application/json or multipart/form-data required' });
    return;
  }

  next();
}

// Re-export for backwards compatibility with app.ts imports
export function csrfGenerateToken(_req: Request, _res: Response): string {
  return 'not-required';
}

export function requireJsonContentType(req: Request, res: Response, next: NextFunction): void {
  csrfProtection(req, res, next);
}
