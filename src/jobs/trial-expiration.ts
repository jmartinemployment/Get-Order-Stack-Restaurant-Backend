import { prisma } from '../lib/prisma';
import { auditLog } from '../utils/audit';
import { logger } from '../utils/logger';


const CHECK_INTERVAL_MS = 60 * 60 * 1000; // every hour

/**
 * Find restaurants whose trial has ended but haven't been suspended yet.
 * Sets subscription status to 'suspended' and records trialExpiredAt.
 */
export async function expireTrials(): Promise<number> {
  const now = new Date();

  const expired = await prisma.restaurant.findMany({
    where: {
      trialEndsAt: { lt: now },
      trialExpiredAt: null,
      hasUsedTrial: true,
    },
    select: { id: true, name: true },
  });

  if (expired.length === 0) return 0;

  for (const restaurant of expired) {
    await prisma.$transaction([
      prisma.restaurant.update({
        where: { id: restaurant.id },
        data: { trialExpiredAt: now },
      }),
      prisma.subscription.updateMany({
        where: { restaurantId: restaurant.id, status: 'trialing' },
        data: { status: 'suspended' },
      }),
    ]);

    await auditLog('trial_expired', { metadata: { restaurantId: restaurant.id } });
    logger.info('[Trial] Expired', { restaurantId: restaurant.id, name: restaurant.name });
  }

  return expired.length;
}

export function startTrialExpirationJob(): void {
  setInterval(() => {
    expireTrials().catch(err => {
      logger.error('[Trial] Expiration job failed:', { error: err });
    });
  }, CHECK_INTERVAL_MS);
  logger.info('[Trial] Expiration job started (every 1h)');
}
