import { PrismaClient } from '@prisma/client';
import { auditLog } from '../utils/audit';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

const MFA_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
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

/**
 * Purge abandoned signups: accounts where onboarding was never completed
 * and MFA was never verified, older than the 10-minute OTP window.
 * Deletes TeamMember (cascades to MfaSecret, UserRestaurantAccess)
 * and the associated Restaurant.
 */
export async function purgeAbandonedSignups(): Promise<number> {
  const cutoff = new Date(Date.now() - MFA_WINDOW_MS);

  const abandoned = await prisma.teamMember.findMany({
    where: {
      mfaEnabled: false,
      createdAt: { lt: cutoff },
      restaurantAccess: {
        every: {
          restaurant: {
            merchantProfile: { path: ['onboardingComplete'], equals: false },
          },
        },
      },
    },
    select: {
      id: true,
      email: true,
      restaurantAccess: { select: { restaurantId: true } },
    },
  });

  if (abandoned.length === 0) return 0;

  const restaurantIds = abandoned.flatMap(m =>
    m.restaurantAccess.map(a => a.restaurantId)
  );

  // Delete TeamMembers first (cascades to MfaSecret + UserRestaurantAccess)
  await prisma.teamMember.deleteMany({
    where: { id: { in: abandoned.map(m => m.id) } },
  });

  // Delete orphaned restaurants (only if no other users have access)
  for (const rid of restaurantIds) {
    const remaining = await prisma.userRestaurantAccess.count({
      where: { restaurantId: rid },
    });
    if (remaining === 0) {
      await prisma.restaurant.delete({ where: { id: rid } });
    }
  }

  for (const member of abandoned) {
    logger.info('[Cleanup] Purged abandoned signup', { email: member.email });
  }

  logger.info('[Cleanup] Purged abandoned signups', { count: abandoned.length });
  return abandoned.length;
}

export function startSignupCleanupJob(): void {
  setInterval(() => {
    purgeAbandonedSignups().catch(err => {
      logger.error('[Cleanup] Abandoned signup purge failed:', { error: err });
    });
  }, CLEANUP_INTERVAL_MS);
  logger.info('[Cleanup] Abandoned signup purge job started (every 5m)');
}
