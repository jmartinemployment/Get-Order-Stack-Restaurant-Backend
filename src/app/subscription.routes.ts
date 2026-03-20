import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.middleware';
import { auditLog } from '../utils/audit';
import { auditCtx } from '../utils/audit-context';
import { logger } from '../utils/logger';
import { PLAN_PRICE_CENTS } from '../config/platform-fees';

const prisma = new PrismaClient();
const router = Router();

// GET /:merchantId/subscription — current subscription + trial status
router.get('/:merchantId/subscription', requireAuth, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        trialStartedAt: true,
        trialEndsAt: true,
        hasUsedTrial: true,
        trialExpiredAt: true,
        subscription: true,
      },
    });

    if (!restaurant) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    const sub = restaurant.subscription;
    const now = new Date();
    const inTrial = restaurant.trialEndsAt !== null
      && restaurant.trialEndsAt > now
      && restaurant.trialExpiredAt === null;

    const status = sub?.status ?? (inTrial ? 'trialing' : 'suspended');
    const trialDaysRemaining = inTrial
      ? Math.max(0, Math.ceil((restaurant.trialEndsAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
      : 0;

    res.json({
      id: sub?.id ?? null,
      restaurantId: restaurant.id,
      status,
      planPrice: PLAN_PRICE_CENTS,
      planName: 'OrderStack',
      interval: 'month',
      currentPeriodStart: sub?.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      canceledAt: sub?.canceledAt?.toISOString() ?? null,
      paypalSubscriptionId: sub?.paypalSubscriptionId ?? null,
      trialStart: restaurant.trialStartedAt?.toISOString() ?? null,
      trialEnd: restaurant.trialEndsAt?.toISOString() ?? null,
      trialDaysRemaining,
      isTrial: inTrial,
    });
  } catch (error: unknown) {
    logger.error('[Subscription] Error loading subscription:', error);
    res.status(500).json({ error: 'Failed to load subscription' });
  }
});

// POST /:merchantId/subscription/subscribe — activate paid subscription
router.post('/:merchantId/subscription/subscribe', requireAuth, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { paypalSubscriptionId } = req.body;

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const sub = await prisma.subscription.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        status: 'active',
        planPrice: PLAN_PRICE_CENTS,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        paypalSubscriptionId: paypalSubscriptionId ?? null,
      },
      update: {
        status: 'active',
        planPrice: PLAN_PRICE_CENTS,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        canceledAt: null,
        cancelAtPeriodEnd: false,
        paypalSubscriptionId: paypalSubscriptionId ?? null,
      },
    });

    // End trial early if active
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        trialEndsAt: now,
        trialExpiredAt: null, // not expired — converted
      },
    });

    await auditLog('subscription_activated', { ...auditCtx(req), metadata: { restaurantId, paypalSubscriptionId } });
    logger.info('[Subscription] Activated', { restaurantId });

    res.json({
      id: sub.id,
      restaurantId,
      status: 'active',
      planPrice: PLAN_PRICE_CENTS,
      currentPeriodStart: sub.currentPeriodStart?.toISOString(),
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString(),
    });
  } catch (error: unknown) {
    logger.error('[Subscription] Error subscribing:', error);
    res.status(500).json({ error: 'Failed to activate subscription' });
  }
});

// POST /:merchantId/subscription/cancel — cancel subscription
router.post('/:merchantId/subscription/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { trialEndsAt: true, trialExpiredAt: true, subscription: true },
    });

    if (!restaurant) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    const now = new Date();
    const inTrial = restaurant.trialEndsAt !== null
      && restaurant.trialEndsAt > now
      && restaurant.trialExpiredAt === null;

    if (inTrial) {
      // Cancel during trial — suspend immediately
      await prisma.$transaction([
        prisma.restaurant.update({
          where: { id: restaurantId },
          data: { trialEndsAt: now, trialExpiredAt: now },
        }),
        prisma.subscription.updateMany({
          where: { restaurantId },
          data: { status: 'suspended', canceledAt: now },
        }),
      ]);
    } else if (restaurant.subscription) {
      // Cancel paid — mark to cancel at period end
      await prisma.subscription.update({
        where: { restaurantId },
        data: { cancelAtPeriodEnd: true, canceledAt: now },
      });
    }

    await auditLog('subscription_canceled', { ...auditCtx(req), metadata: { restaurantId, wasTrial: inTrial } });
    logger.info('[Subscription] Canceled', { restaurantId, wasTrial: inTrial });

    res.json({ status: inTrial ? 'suspended' : 'canceled', canceledAt: now.toISOString() });
  } catch (error: unknown) {
    logger.error('[Subscription] Error canceling:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// POST /:merchantId/subscription/extend-trial — admin retention tool
router.post('/:merchantId/subscription/extend-trial', requireAuth, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { days } = req.body;
    const extensionDays = Number.parseInt(days ?? '30', 10);

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { trialEndsAt: true },
    });

    if (!restaurant?.trialEndsAt) {
      res.status(400).json({ error: 'No trial to extend' });
      return;
    }

    const newEnd = new Date(Math.max(restaurant.trialEndsAt.getTime(), Date.now()));
    newEnd.setDate(newEnd.getDate() + extensionDays);

    await prisma.$transaction([
      prisma.restaurant.update({
        where: { id: restaurantId },
        data: { trialEndsAt: newEnd, trialExpiredAt: null },
      }),
      prisma.subscription.updateMany({
        where: { restaurantId },
        data: { status: 'trialing' },
      }),
    ]);

    await auditLog('trial_extended', { ...auditCtx(req), metadata: { restaurantId, extensionDays, newEnd: newEnd.toISOString() } });
    logger.info('[Subscription] Trial extended', { restaurantId, newEnd });

    res.json({ trialEnd: newEnd.toISOString(), daysAdded: extensionDays });
  } catch (error: unknown) {
    logger.error('[Subscription] Error extending trial:', error);
    res.status(500).json({ error: 'Failed to extend trial' });
  }
});

export default router;
