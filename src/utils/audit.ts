/**
 * Audit log utility — PCI DSS 10.2 / 10.3.2 / 10.5.1
 *
 * IMMUTABILITY WARNING: Do NOT add UPDATE or DELETE operations to this file.
 * Audit log rows are write-once. The app DB user should have INSERT+SELECT only
 * on the audit_logs table (revoke UPDATE/DELETE at the Supabase DB role level
 * before going live — PCI DSS 10.3.2).
 *
 * RETENTION: Rows must be retained for 12 months minimum, 3 months immediately
 * queryable (PCI DSS 10.5.1). Do NOT add any cleanup job for this table.
 */
import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

const prisma = new PrismaClient();

export async function auditLog(
  action: string,
  opts: { userId?: string; ip?: string; userAgent?: string; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        userId: opts.userId,
        ipAddress: opts.ip,
        userAgent: opts.userAgent,
        metadata: opts.metadata ? (opts.metadata as object) : undefined,
      },
    });
  } catch (error: unknown) {
    logger.error('Failed to write audit log', { action, error });
  }
}
