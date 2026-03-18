/**
 * Coverage scope: src/app/app.config.ts — CORS origin checker
 *
 * Tests:
 *   - Allowed origins: localhost:4200, localhost:4201, getorderstack.com, etc.
 *   - Rejected origins: evil.com, random.vercel.app, etc.
 *   - No origin in production: rejected
 *   - No origin in development: allowed
 *   - Exact Vercel URLs: allowed
 *   - Wildcard .exp.direct: rejected (was removed)
 *   - Wildcard .vercel.app: rejected (was removed)
 *
 * Pattern: vi.resetModules() + dynamic import so process.env.NODE_ENV changes
 * take effect on each fresh module evaluation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Import a fresh copy of config (re-evaluates IS_PRODUCTION and allowedOrigins). */
async function loadConfig() {
  const mod = await import('./app.config');
  return mod.config;
}

/** Wrap the callback-based corsOrigins into a Promise for easier testing. */
function checkOrigin(
  corsOrigins: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void,
  origin: string | undefined,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    corsOrigins(origin, (err, allow) => {
      if (err) return reject(err);
      resolve(allow ?? false);
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CORS origin checker', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NODE_ENV;
    delete process.env.CORS_ORIGINS;
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    delete process.env.CORS_ORIGINS;
  });

  // -------------------------------------------------------------------------
  // Allowed Origins
  // -------------------------------------------------------------------------

  describe('Allowed Origins', () => {
    it('allows http://localhost:4200', async () => {
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'http://localhost:4200');

      expect(allowed).toBe(true);
    });

    it('allows http://localhost:4201', async () => {
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'http://localhost:4201');

      expect(allowed).toBe(true);
    });

    it('allows http://localhost:8081', async () => {
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'http://localhost:8081');

      expect(allowed).toBe(true);
    });

    it('allows http://localhost:8082', async () => {
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'http://localhost:8082');

      expect(allowed).toBe(true);
    });

    it('allows http://127.0.0.1:8081', async () => {
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'http://127.0.0.1:8081');

      expect(allowed).toBe(true);
    });

    it('allows http://127.0.0.1:8082', async () => {
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'http://127.0.0.1:8082');

      expect(allowed).toBe(true);
    });

    it('allows https://getorderstack.com', async () => {
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'https://getorderstack.com');

      expect(allowed).toBe(true);
    });

    it('allows https://www.getorderstack.com', async () => {
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'https://www.getorderstack.com');

      expect(allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Exact Vercel URLs
  // -------------------------------------------------------------------------

  describe('Exact Vercel URLs', () => {
    it('allows https://get-order-stack-restaurant-mobile-j.vercel.app', async () => {
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'https://get-order-stack-restaurant-mobile-j.vercel.app');

      expect(allowed).toBe(true);
    });

    it('allows https://get-order-stack-restaurant-mobile.vercel.app', async () => {
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'https://get-order-stack-restaurant-mobile.vercel.app');

      expect(allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Rejected Origins
  // -------------------------------------------------------------------------

  describe('Rejected Origins', () => {
    it('rejects https://evil.com', async () => {
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'https://evil.com');

      expect(allowed).toBe(false);
    });

    it('rejects https://random.vercel.app (not in exact list)', async () => {
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'https://random.vercel.app');

      expect(allowed).toBe(false);
    });

    it('rejects https://phishing-getorderstack.com', async () => {
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'https://phishing-getorderstack.com');

      expect(allowed).toBe(false);
    });

    it('rejects http://localhost:3000 (not in allowed list)', async () => {
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'http://localhost:3000');

      expect(allowed).toBe(false);
    });

    it('treats empty string origin same as no origin (falsy in JS)', async () => {
      // '' is falsy — falls into the !origin branch, allowed in dev
      process.env.NODE_ENV = 'production';
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, '');

      expect(allowed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Wildcard .vercel.app rejected (exact match only)
  // -------------------------------------------------------------------------

  describe('Wildcard .vercel.app rejected', () => {
    it('rejects arbitrary subdomain.vercel.app', async () => {
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'https://some-other-app.vercel.app');

      expect(allowed).toBe(false);
    });

    it('rejects preview deployment URL on vercel.app', async () => {
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'https://orderstack-abc123.vercel.app');

      expect(allowed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Wildcard .exp.direct rejected (was removed)
  // -------------------------------------------------------------------------

  describe('Wildcard .exp.direct rejected', () => {
    it('rejects Expo Go dev URLs (*.exp.direct)', async () => {
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'https://u.expo.dev.exp.direct');

      expect(allowed).toBe(false);
    });

    it('rejects arbitrary .exp.direct domain', async () => {
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'https://abc123.exp.direct');

      expect(allowed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // No Origin — Production vs Development
  // -------------------------------------------------------------------------

  describe('No origin in production', () => {
    it('rejects undefined origin when NODE_ENV=production', async () => {
      process.env.NODE_ENV = 'production';
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, undefined);

      expect(allowed).toBe(false);
    });
  });

  describe('No origin in development', () => {
    it('allows undefined origin when NODE_ENV is not production', async () => {
      process.env.NODE_ENV = 'development';
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, undefined);

      expect(allowed).toBe(true);
    });

    it('allows undefined origin when NODE_ENV is unset', async () => {
      delete process.env.NODE_ENV;
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, undefined);

      expect(allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // CORS_ORIGINS env var override
  // -------------------------------------------------------------------------

  describe('CORS_ORIGINS env var override', () => {
    it('uses CORS_ORIGINS env var when set, allowing listed origin', async () => {
      process.env.CORS_ORIGINS = 'https://custom-app.example.com, https://other.example.com';
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'https://custom-app.example.com');

      expect(allowed).toBe(true);
    });

    it('rejects default origins when CORS_ORIGINS env var overrides them', async () => {
      process.env.CORS_ORIGINS = 'https://custom-app.example.com';
      const cfg = await loadConfig();
      const allowed = await checkOrigin(cfg.corsOrigins, 'http://localhost:4200');

      expect(allowed).toBe(false);
    });
  });
});
