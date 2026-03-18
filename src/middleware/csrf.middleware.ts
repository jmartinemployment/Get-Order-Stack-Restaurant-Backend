import { Request, Response, NextFunction } from 'express';
import { doubleCsrf } from 'csrf-csrf';
import { logger } from '../utils/logger';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Double-submit cookie CSRF protection (PCI DSS 6.5.9).
// The csrf-csrf library sets a signed cookie and validates the x-csrf-token header
// against it on every state-changing request.
const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => {
    const secret = process.env.CSRF_SECRET;
    if (!secret) throw new Error('CSRF_SECRET environment variable is not set');
    return secret;
  },
  getSessionIdentifier: (req) => (req as Request).cookies?.os_auth ?? 'anonymous',
  cookieName: 'os_csrf',
  cookieOptions: {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? 'none' : 'lax',
    path: '/api',
  },
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'] as string | undefined,
});

/**
 * CSRF double-submit cookie middleware.
 * Skips webhook paths (they use their own signature verification).
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Webhooks verify authenticity via HMAC signatures — CSRF tokens are inapplicable
  if (req.path.startsWith('/api/webhooks/')) {
    next();
    return;
  }

  doubleCsrfProtection(req, res, (err?: unknown) => {
    if (err) {
      logger.warn('[CSRF] Token validation failed', { path: req.path, method: req.method });
      res.status(403).json({ error: 'Invalid or missing CSRF token' });
      return;
    }
    next();
  });
}

/**
 * Generate a CSRF token for the current session and set the cookie.
 */
export function csrfGenerateToken(req: Request, res: Response): string {
  return generateCsrfToken(req, res);
}

/**
 * Defense-in-depth: require Content-Type: application/json on state-changing requests.
 * This prevents CSRF via cross-origin form submissions even if the CSRF token is bypassed.
 */
export function requireJsonContentType(req: Request, res: Response, next: NextFunction): void {
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  if (req.path.startsWith('/api/webhooks/')) {
    next();
    return;
  }

  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('application/json')) {
    logger.warn('[CSRF] Rejected non-JSON content type', { path: req.path, method: req.method, contentType });
    res.status(403).json({ error: 'Content-Type application/json required' });
    return;
  }

  next();
}
