import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { PLATFORM_FEE_TIERS, PlatformFeeTier } from '../config/platform-fees';

const prisma = new PrismaClient();
const router = Router();

const VALID_TIERS = ['free', 'plus', 'premium'] as const;

const changePlanSchema = z.object({
  planTier: z.enum(VALID_TIERS),
});

const TIER_NAMES: Record<string, string> = {
  free: 'Free',
  plus: 'Plus',
  premium: 'Premium',
};

// GET /:restaurantId/subscription — current subscription info
router.get('/:restaurantId/subscription', requireAuth, async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, planTier: true, platformFeePercent: true, platformFeeFixed: true },
    });

    if (!restaurant) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    const tier = restaurant.planTier as PlatformFeeTier;
    const tierConfig = PLATFORM_FEE_TIERS[tier] ?? PLATFORM_FEE_TIERS.free;

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    res.json({
      id: `sub_${restaurant.id}`,
      restaurantId: restaurant.id,
      planName: TIER_NAMES[tier] ?? 'Free',
      status: 'active',
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      cancelAtPeriodEnd: false,
      amountCents: tier === 'plus' ? 2500 : tier === 'premium' ? 6900 : 0,
      interval: 'month',
      processingRates: {
        percent: tierConfig.percent,
        fixedCents: tierConfig.fixedCents,
      },
    });
  } catch (error: unknown) {
    console.error('[Subscription] Error loading subscription:', error);
    res.status(500).json({ error: 'Failed to load subscription' });
  }
});

// POST /:restaurantId/subscription/change-plan — change plan tier
router.post('/:restaurantId/subscription/change-plan', requireAuth, async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = changePlanSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid plan tier', details: parsed.error.issues });
      return;
    }

    const { planTier } = parsed.data;
    const fees = PLATFORM_FEE_TIERS[planTier];

    const restaurant = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        planTier,
        platformFeePercent: fees.percent,
        platformFeeFixed: fees.fixedCents,
      },
      select: { id: true, planTier: true, platformFeePercent: true, platformFeeFixed: true },
    });

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    res.json({
      id: `sub_${restaurant.id}`,
      restaurantId: restaurant.id,
      planName: TIER_NAMES[planTier] ?? 'Free',
      status: 'active',
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      cancelAtPeriodEnd: false,
      amountCents: planTier === 'plus' ? 2500 : planTier === 'premium' ? 6900 : 0,
      interval: 'month',
    });
  } catch (error: unknown) {
    console.error('[Subscription] Error changing plan:', error);
    res.status(500).json({ error: 'Failed to change plan' });
  }
});

// POST /:restaurantId/subscription/cancel — cancel subscription (downgrade to free)
router.post('/:restaurantId/subscription/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const fees = PLATFORM_FEE_TIERS.free;

    const restaurant = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        planTier: 'free',
        platformFeePercent: fees.percent,
        platformFeeFixed: fees.fixedCents,
      },
      select: { id: true },
    });

    const now = new Date();

    res.json({
      id: `sub_${restaurant.id}`,
      restaurantId: restaurant.id,
      planName: 'Free',
      status: 'canceled',
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: now.toISOString(),
      cancelAtPeriodEnd: true,
      canceledAt: now.toISOString(),
      amountCents: 0,
      interval: 'month',
    });
  } catch (error: unknown) {
    console.error('[Subscription] Error canceling subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

export default router;
