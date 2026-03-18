import { Request, Response, NextFunction } from 'express';
import { doubleCsrf } from 'csrf-csrf';
import { logger } from '../utils/logger';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Paths that are exempt from CSRF validation.
// These are either unauthenticated (no session to hijack) or use their own
// signature verification (webhooks).
const CSRF_EXEMPT_PATHS = [
  '/api/webhooks/',       // HMAC-signed webhooks
  '/api/auth/login',      // Unauthenticated — rate-limited instead
  '/api/auth/signup',     // Unauthenticated — rate-limited instead
  '/api/auth/forgot-password', // Unauthenticated — rate-limited instead
  '/api/auth/reset-password',  // Token-based verification, no session
  '/api/auth/mfa/challenge',   // MFA token-based, not session-based
  '/api/csrf-token',      // Token generation endpoint itself
];

// Only initialize csrf-csrf if CSRF_SECRET is available.
// In development without the secret, CSRF protection is skipped with a warning.
const CSRF_SECRET = process.env.CSRF_SECRET;

const csrfUtils = CSRF_SECRET
  ? doubleCsrf({
    getSecret: () => CSRF_SECRET,
    getSessionIdentifier: (req) => (req as Request).cookies?.os_auth ?? 'anonymous',
    cookieName: 'os_csrf',
    cookieOptions: {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: IS_PRODUCTION ? 'none' : 'lax',
      path: '/api',
    },
    getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'] as string | undefined,
  })
  : null;

if (!CSRF_SECRET) {
  logger.warn('[CSRF] CSRF_SECRET not set — CSRF protection is disabled. Set it before going to production.');
}

/**
 * CSRF double-submit cookie middleware.
 * Skips exempt paths (webhooks, unauthenticated auth endpoints).
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Skip CSRF for exempt paths
  if (CSRF_EXEMPT_PATHS.some(p => req.path.startsWith(p))) {
    next();
    return;
  }

  // Skip if CSRF not configured (development without secret)
  if (!csrfUtils) {
    next();
    return;
  }

  try {
    csrfUtils.doubleCsrfProtection(req, res, (err?: unknown) => {
      if (err) {
        logger.warn('[CSRF] Token validation failed', { path: req.path, method: req.method });
        res.status(403).json({ error: 'Invalid or missing CSRF token' });
        return;
      }
      next();
    });
  } catch (error: unknown) {
    logger.error('[CSRF] Middleware error', { path: req.path, error });
    res.status(403).json({ error: 'CSRF validation error' });
  }
}

/**
 * Generate a CSRF token for the current session and set the cookie.
 */
export function csrfGenerateToken(req: Request, res: Response): string {
  if (!csrfUtils) {
    return 'csrf-disabled';
  }
  return csrfUtils.generateCsrfToken(req, res);
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
  // Allow application/json (API calls) and multipart/form-data (file uploads)
  if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
    logger.warn('[CSRF] Rejected non-JSON content type', { path: req.path, method: req.method, contentType });
    res.status(403).json({ error: 'Content-Type application/json or multipart/form-data required' });
    return;
  }

  next();
}
