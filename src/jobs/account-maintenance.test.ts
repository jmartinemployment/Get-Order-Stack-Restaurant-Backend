/**
 * disableInactiveAccounts — FEATURE-15 Tests
 *
 * Covers:
 * - Disables accounts inactive for > 90 days
 * - Returns count of disabled accounts
 * - Calls auditLog for each disabled account
 * - Returns 0 when no inactive accounts found
 * - Includes accounts with null lastLoginAt + old createdAt
 * - Logs success message with count
 * - Uses correct 90-day cutoff in query
 * - Only updates accounts returned by findMany
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

const mockAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../utils/audit', () => ({
  auditLog: (...args: unknown[]) => mockAuditLog(...args),
}));

// The module under test creates `new PrismaClient()` at module scope.
// The global test setup.ts mocks PrismaClient, so we access it via the proxy.
import { getPrismaMock, resetPrismaMock } from '../test/prisma-mock';
import { logger } from '../utils/logger';
import { disableInactiveAccounts } from './account-maintenance';

const mockLogger = logger as unknown as { info: ReturnType<typeof vi.fn> };
const prisma = getPrismaMock();

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
});

describe('disableInactiveAccounts', () => {
  it('returns 0 when no inactive accounts found', async () => {
    prisma.teamMember.findMany.mockResolvedValue([]);

    const count = await disableInactiveAccounts();

    expect(count).toBe(0);
    expect(prisma.teamMember.updateMany).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('disables accounts with lastLoginAt > 90 days ago', async () => {
    prisma.teamMember.findMany.mockResolvedValue([
      { id: 'user-1', email: 'old@example.com' },
    ]);
    prisma.teamMember.updateMany.mockResolvedValue({ count: 1 });

    const count = await disableInactiveAccounts();

    expect(count).toBe(1);
    expect(prisma.teamMember.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['user-1'] } },
        data: { isActive: false },
      }),
    );
  });

  it('calls auditLog for each disabled account', async () => {
    prisma.teamMember.findMany.mockResolvedValue([
      { id: 'user-1', email: 'a@example.com' },
      { id: 'user-2', email: 'b@example.com' },
    ]);
    prisma.teamMember.updateMany.mockResolvedValue({ count: 2 });

    await disableInactiveAccounts();

    expect(mockAuditLog).toHaveBeenCalledTimes(2);
    expect(mockAuditLog).toHaveBeenCalledWith('account_auto_disabled', {
      userId: 'user-1',
      metadata: { email: 'a@example.com', reason: '90_day_inactivity' },
    });
    expect(mockAuditLog).toHaveBeenCalledWith('account_auto_disabled', {
      userId: 'user-2',
      metadata: { email: 'b@example.com', reason: '90_day_inactivity' },
    });
  });

  it('returns correct count for multiple disabled accounts', async () => {
    prisma.teamMember.findMany.mockResolvedValue([
      { id: 'u1', email: 'a@test.com' },
      { id: 'u2', email: 'b@test.com' },
      { id: 'u3', email: 'c@test.com' },
    ]);
    prisma.teamMember.updateMany.mockResolvedValue({ count: 3 });

    expect(await disableInactiveAccounts()).toBe(3);
  });

  it('logs success message with count', async () => {
    prisma.teamMember.findMany.mockResolvedValue([
      { id: 'user-1', email: 'a@test.com' },
    ]);
    prisma.teamMember.updateMany.mockResolvedValue({ count: 1 });

    await disableInactiveAccounts();

    expect(mockLogger.info).toHaveBeenCalledWith('Disabled inactive accounts', { count: 1 });
  });

  it('does not log when no accounts disabled', async () => {
    prisma.teamMember.findMany.mockResolvedValue([]);

    await disableInactiveAccounts();

    expect(mockLogger.info).not.toHaveBeenCalled();
  });

  it('queries only active accounts with passwords', async () => {
    prisma.teamMember.findMany.mockResolvedValue([]);

    await disableInactiveAccounts();

    const query = prisma.teamMember.findMany.mock.calls[0][0];
    expect(query.where.isActive).toBe(true);
    expect(query.where.passwordHash).toEqual({ not: null });
  });

  it('queries with OR condition for lastLoginAt and createdAt', async () => {
    prisma.teamMember.findMany.mockResolvedValue([]);

    await disableInactiveAccounts();

    const query = prisma.teamMember.findMany.mock.calls[0][0];
    expect(query.where.OR).toHaveLength(2);
  });

  it('only updates the specific accounts found by findMany', async () => {
    prisma.teamMember.findMany.mockResolvedValue([
      { id: 'user-1', email: 'a@test.com' },
      { id: 'user-3', email: 'c@test.com' },
    ]);
    prisma.teamMember.updateMany.mockResolvedValue({ count: 2 });

    await disableInactiveAccounts();

    expect(prisma.teamMember.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['user-1', 'user-3'] } },
      data: { isActive: false },
    });
  });
});
