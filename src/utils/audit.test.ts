/**
 * Coverage scope: src/utils/audit.ts
 *
 * Tests:
 *   - Happy path: all 10 action types, full field shapes
 *   - Edge cases: missing userId, missing metadata, empty metadata, long userAgent
 *   - Error handling: Prisma throws → logger.error called, never rethrows
 *
 * Mocking:
 *   - @prisma/client → PrismaClient with auditLog.create as vi.fn()
 *   - ./logger → logger.error / logger.info as vi.fn()
 *   - Real database is never called
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock PrismaClient (must be declared before vi.mock) ---

const mockAuditLogCreate = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    auditLog = { create: mockAuditLogCreate };
  },
}));

// --- Mock logger (must be declared before vi.mock) ---

vi.mock('./logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Import after mocks are registered
const { auditLog } = await import('./audit');
const { logger } = await import('./logger');

beforeEach(() => {
  vi.clearAllMocks();
  mockAuditLogCreate.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// Happy Path
// ---------------------------------------------------------------------------

describe('auditLog', () => {
  describe('Happy Path', () => {
    it('stores login event with userId and IP — correct Prisma create shape', async () => {
      await auditLog('login', { userId: 'u-1', ip: '127.0.0.1' });

      expect(mockAuditLogCreate).toHaveBeenCalledWith({
        data: {
          action: 'login',
          userId: 'u-1',
          ipAddress: '127.0.0.1',
          userAgent: undefined,
          metadata: undefined,
        },
      });
    });

    it('stores login_failed event with metadata as JSON', async () => {
      await auditLog('login_failed', {
        metadata: { email: 'x@y.com', reason: 'bad_password' },
      });

      expect(mockAuditLogCreate).toHaveBeenCalledWith({
        data: {
          action: 'login_failed',
          userId: undefined,
          ipAddress: undefined,
          userAgent: undefined,
          metadata: { email: 'x@y.com', reason: 'bad_password' },
        },
      });
    });

    it('stores logout event with minimal args — no opts argument', async () => {
      await auditLog('logout');

      expect(mockAuditLogCreate).toHaveBeenCalledWith({
        data: {
          action: 'logout',
          userId: undefined,
          ipAddress: undefined,
          userAgent: undefined,
          metadata: undefined,
        },
      });
    });

    it('stores userAgent when provided', async () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
      await auditLog('login', { userId: 'u-2', userAgent: ua });

      expect(mockAuditLogCreate).toHaveBeenCalledWith({
        data: {
          action: 'login',
          userId: 'u-2',
          ipAddress: undefined,
          userAgent: ua,
          metadata: undefined,
        },
      });
    });

    it('stores all four opts fields when provided together', async () => {
      await auditLog('signup', {
        userId: 'u-new',
        ip: '10.0.0.1',
        userAgent: 'TestAgent/1.0',
        metadata: { plan: 'free' },
      });

      expect(mockAuditLogCreate).toHaveBeenCalledWith({
        data: {
          action: 'signup',
          userId: 'u-new',
          ipAddress: '10.0.0.1',
          userAgent: 'TestAgent/1.0',
          metadata: { plan: 'free' },
        },
      });
    });

    // All 10 action types from FEATURE-15 spec
    it.each([
      'login',
      'login_failed',
      'logout',
      'password_change',
      'password_reset_requested',
      'session_expired',
      'account_deactivated',
      'pin_verify',
      'pin_failed',
      'signup',
    ])('accepts action type "%s" and calls prisma.auditLog.create', async (action) => {
      await auditLog(action, { userId: 'u-test' });

      expect(mockAuditLogCreate).toHaveBeenCalledOnce();
      expect(mockAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases
  // ---------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('creates record with null-equivalent userId when userId is omitted', async () => {
      await auditLog('login', { ip: '192.168.1.1' });

      const call = mockAuditLogCreate.mock.calls[0][0];
      expect(call.data.userId).toBeUndefined();
    });

    it('stores undefined metadata when opts.metadata is not provided', async () => {
      await auditLog('login');

      const call = mockAuditLogCreate.mock.calls[0][0];
      // Spec guard: must not store {} when no metadata is given
      expect(call.data.metadata).toBeUndefined();
    });

    it('passes empty metadata object through as-is (truthy check in source)', async () => {
      await auditLog('login', { metadata: {} });

      const call = mockAuditLogCreate.mock.calls[0][0];
      // {} is truthy — the ternary `opts.metadata ? opts.metadata : undefined`
      // stores {} rather than undefined. This test documents that behavior.
      expect(call.data.metadata).toEqual({});
    });

    it('does not truncate very long userAgent strings — Prisma handles length', async () => {
      const longUserAgent = 'X'.repeat(2000);
      await auditLog('login', { userAgent: longUserAgent });

      const call = mockAuditLogCreate.mock.calls[0][0];
      expect(call.data.userAgent).toBe(longUserAgent);
      expect(call.data.userAgent.length).toBe(2000);
    });

    it('stores nested metadata objects without modification', async () => {
      const meta = { device: { type: 'mobile', os: 'iOS' }, attempts: 3 };
      await auditLog('pin_failed', { userId: 'u-5', metadata: meta });

      const call = mockAuditLogCreate.mock.calls[0][0];
      expect(call.data.metadata).toEqual(meta);
    });
  });

  // ---------------------------------------------------------------------------
  // Error Handling — audit logging must never crash the auth flow
  // ---------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('does not rethrow when prisma.auditLog.create throws', async () => {
      mockAuditLogCreate.mockRejectedValue(new Error('DB write failed'));

      await expect(auditLog('login', { userId: 'u-1' })).resolves.toBeUndefined();
    });

    it('calls logger.error with action and error when Prisma throws', async () => {
      const dbError = new Error('connection refused');
      mockAuditLogCreate.mockRejectedValue(dbError);

      await auditLog('login', { userId: 'u-1' });

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to write audit log',
        { action: 'login', error: dbError },
      );
    });

    it('does not rethrow on Prisma connection failure', async () => {
      mockAuditLogCreate.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        auditLog('session_expired', { userId: 'u-timeout' }),
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledOnce();
    });

    it('calls logger.error exactly once per failed write, not multiple times', async () => {
      mockAuditLogCreate.mockRejectedValue(new Error('timeout'));

      await auditLog('logout', { userId: 'u-3' });

      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it('does not call logger.error on successful write', async () => {
      await auditLog('login', { userId: 'u-success' });

      expect(logger.error).not.toHaveBeenCalled();
    });
  });
});
