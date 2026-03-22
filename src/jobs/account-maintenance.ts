import { prisma } from '../lib/prisma';
import { auditLog } from '../utils/audit';
import { logger } from '../utils/logger';

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

export async function disableInactiveAccounts(): Promise<number> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const affected = await prisma.teamMember.findMany({
    where: {
      isActive: true,
      passwordHash: { not: null },
      OR: [
        { lastLoginAt: { lt: cutoff } },
        { lastLoginAt: null, createdAt: { lt: cutoff } },
      ],
    },
    select: { id: true, email: true },
  });

  if (affected.length === 0) return 0;

  await prisma.teamMember.updateMany({
    where: { id: { in: affected.map(m => m.id) } },
    data: { isActive: false },
  });

  for (const member of affected) {
    await auditLog('account_auto_disabled', {
      userId: member.id,
      metadata: { email: member.email, reason: '90_day_inactivity' },
    });
  }

  logger.info('Disabled inactive accounts', { count: affected.length });
  return affected.length;
}

export async function purgeExpiredPendingVerifications(): Promise<number> {
  const { count } = await prisma.pendingVerification.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  if (count > 0) {
    logger.info('[Cleanup] Purged expired pending verifications', { count });
  }
  return count;
}

export async function purgeExpiredTrustedDevices(): Promise<number> {
  const { count } = await prisma.mfaTrustedDevice.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  if (count > 0) {
    logger.info('[Cleanup] Purged expired trusted devices', { count });
  }
  return count;
}

export function startSignupCleanupJob(): void {
  setInterval(() => {
    purgeExpiredPendingVerifications().catch(err => {
      logger.error('[Cleanup] Pending verification purge failed:', { error: err });
    });
    purgeExpiredTrustedDevices().catch(err => {
      logger.error('[Cleanup] Expired trusted device purge failed:', { error: err });
    });
  }, CLEANUP_INTERVAL_MS);
  logger.info('[Cleanup] Cleanup job started (every 5m)');
}
