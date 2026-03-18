/**
 * Coverage scope: src/utils/audit-context.ts
 *
 * Tests:
 *   - Happy path: all three fields extracted from req.user + req headers
 *   - Missing req.user: userId is undefined
 *   - Missing req.ip: ip is undefined
 *   - Missing user-agent header: userAgent is undefined
 *   - All fields missing: returns object with all undefined values
 */

import { describe, it, expect } from 'vitest';
import { Request } from 'express';
import { auditCtx } from './audit-context';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Express-like Request object for testing. */
function fakeReq(overrides: {
  user?: { teamMemberId: string };
  ip?: string;
  userAgent?: string;
} = {}): Request {
  const headers: Record<string, string> = {};
  if (overrides.userAgent !== undefined) {
    headers['user-agent'] = overrides.userAgent;
  }
  return {
    user: overrides.user,
    ip: overrides.ip,
    headers,
  } as unknown as Request;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('auditCtx', () => {
  describe('Happy Path', () => {
    it('returns userId from req.user.teamMemberId', () => {
      const req = fakeReq({ user: { teamMemberId: 'tm-abc-123' } });
      const ctx = auditCtx(req);

      expect(ctx.userId).toBe('tm-abc-123');
    });

    it('returns ip from req.ip', () => {
      const req = fakeReq({ ip: '192.168.1.42' });
      const ctx = auditCtx(req);

      expect(ctx.ip).toBe('192.168.1.42');
    });

    it('returns userAgent from req.headers["user-agent"]', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
      const req = fakeReq({ userAgent: ua });
      const ctx = auditCtx(req);

      expect(ctx.userAgent).toBe(ua);
    });

    it('returns all three fields when req has user, ip, and user-agent', () => {
      const req = fakeReq({
        user: { teamMemberId: 'u-full' },
        ip: '10.0.0.1',
        userAgent: 'TestAgent/2.0',
      });
      const ctx = auditCtx(req);

      expect(ctx).toEqual({
        userId: 'u-full',
        ip: '10.0.0.1',
        userAgent: 'TestAgent/2.0',
      });
    });
  });

  describe('Missing req.user', () => {
    it('returns undefined userId when req.user is undefined', () => {
      const req = fakeReq({ ip: '127.0.0.1', userAgent: 'Agent/1.0' });
      const ctx = auditCtx(req);

      expect(ctx.userId).toBeUndefined();
    });

    it('returns undefined userId when req.user is null', () => {
      const req = { user: null, ip: '127.0.0.1', headers: {} } as unknown as Request;
      const ctx = auditCtx(req);

      expect(ctx.userId).toBeUndefined();
    });
  });

  describe('Missing req.ip', () => {
    it('returns undefined ip when req.ip is undefined', () => {
      const req = fakeReq({ user: { teamMemberId: 'u-1' }, userAgent: 'Agent/1.0' });
      const ctx = auditCtx(req);

      expect(ctx.ip).toBeUndefined();
    });

    it('returns undefined ip when req.ip is null (nullish coalescing)', () => {
      const req = {
        user: { teamMemberId: 'u-2' },
        ip: null,
        headers: {},
      } as unknown as Request;
      const ctx = auditCtx(req);

      // req.ip ?? undefined — null coalesces to undefined
      expect(ctx.ip).toBeUndefined();
    });
  });

  describe('Missing user-agent header', () => {
    it('returns undefined userAgent when user-agent header is absent', () => {
      const req = fakeReq({ user: { teamMemberId: 'u-3' }, ip: '10.0.0.1' });
      const ctx = auditCtx(req);

      expect(ctx.userAgent).toBeUndefined();
    });
  });

  describe('All fields missing', () => {
    it('returns object with all undefined values for a bare request', () => {
      const req = fakeReq();
      const ctx = auditCtx(req);

      expect(ctx).toEqual({
        userId: undefined,
        ip: undefined,
        userAgent: undefined,
      });
    });
  });
});
