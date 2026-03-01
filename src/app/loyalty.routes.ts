import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { loyaltyService } from '../services/loyalty.service';
import {
  LoyaltyConfigUpdateSchema,
  LoyaltyRewardCreateSchema,
  LoyaltyRewardUpdateSchema,
  PointsAdjustmentSchema,
} from '../validators/loyalty.validator';

const router = Router();
const prisma = new PrismaClient();

// ============ Loyalty Config ============

// GET /:merchantId/loyalty/config
router.get('/:merchantId/loyalty/config', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const config = await loyaltyService.getConfig(restaurantId);
    res.json(config);
  } catch (error: unknown) {
    console.error('[Loyalty] Error fetching config:', error);
    res.status(500).json({ error: 'Failed to fetch loyalty config' });
  }
});

// PATCH /:merchantId/loyalty/config
router.patch('/:merchantId/loyalty/config', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const parsed = LoyaltyConfigUpdateSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid loyalty config data',
        details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const config = await loyaltyService.updateConfig(restaurantId, parsed.data);
    res.json(config);
  } catch (error: unknown) {
    console.error('[Loyalty] Error updating config:', error);
    res.status(500).json({ error: 'Failed to update loyalty config' });
  }
});

// ============ Loyalty Rewards ============

// GET /:merchantId/loyalty/rewards
router.get('/:merchantId/loyalty/rewards', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const rewards = await prisma.loyaltyReward.findMany({
      where: { restaurantId, isActive: true },
      orderBy: { pointsCost: 'asc' },
    });
    res.json(rewards);
  } catch (error: unknown) {
    console.error('[Loyalty] Error fetching rewards:', error);
    res.status(500).json({ error: 'Failed to fetch loyalty rewards' });
  }
});

// POST /:merchantId/loyalty/rewards
router.post('/:merchantId/loyalty/rewards', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const parsed = LoyaltyRewardCreateSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid reward data',
        details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const reward = await prisma.loyaltyReward.create({
      data: {
        restaurantId,
        ...parsed.data,
      },
    });
    res.status(201).json(reward);
  } catch (error: unknown) {
    console.error('[Loyalty] Error creating reward:', error);
    res.status(500).json({ error: 'Failed to create loyalty reward' });
  }
});

// PATCH /:merchantId/loyalty/rewards/:rewardId
router.patch('/:merchantId/loyalty/rewards/:rewardId', async (req: Request, res: Response) => {
  try {
    const { rewardId } = req.params;
    const parsed = LoyaltyRewardUpdateSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid reward data',
        details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const reward = await prisma.loyaltyReward.update({
      where: { id: rewardId },
      data: parsed.data,
    });
    res.json(reward);
  } catch (error: unknown) {
    console.error('[Loyalty] Error updating reward:', error);
    res.status(500).json({ error: 'Failed to update loyalty reward' });
  }
});

// DELETE /:merchantId/loyalty/rewards/:rewardId (soft-delete)
router.delete('/:merchantId/loyalty/rewards/:rewardId', async (req: Request, res: Response) => {
  try {
    const { rewardId } = req.params;
    await prisma.loyaltyReward.update({
      where: { id: rewardId },
      data: { isActive: false },
    });
    res.status(204).send();
  } catch (error: unknown) {
    console.error('[Loyalty] Error deleting reward:', error);
    res.status(500).json({ error: 'Failed to delete loyalty reward' });
  }
});

// ============ Customer Loyalty ============

// GET /:merchantId/customers/:customerId/loyalty
router.get('/:merchantId/customers/:customerId/loyalty', async (req: Request, res: Response) => {
  try {
    const { restaurantId, customerId } = req.params;
    const profile = await loyaltyService.getCustomerLoyalty(customerId, restaurantId);
    res.json(profile);
  } catch (error: unknown) {
    console.error('[Loyalty] Error fetching customer loyalty:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch customer loyalty';
    res.status(error instanceof Error && error.message === 'Customer not found' ? 404 : 500).json({ error: message });
  }
});

// GET /:merchantId/customers/:customerId/loyalty/history
router.get('/:merchantId/customers/:customerId/loyalty/history', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const { limit } = req.query;
    const history = await loyaltyService.getPointsHistory(
      customerId,
      limit ? Number.parseInt(limit as string, 10) : undefined,
    );
    res.json(history);
  } catch (error: unknown) {
    console.error('[Loyalty] Error fetching points history:', error);
    res.status(500).json({ error: 'Failed to fetch points history' });
  }
});

// POST /:merchantId/customers/:customerId/loyalty/adjust
router.post('/:merchantId/customers/:customerId/loyalty/adjust', async (req: Request, res: Response) => {
  try {
    const { restaurantId, customerId } = req.params;
    const parsed = PointsAdjustmentSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid adjustment data',
        details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const customer = await loyaltyService.adjustPoints(
      customerId,
      parsed.data.points,
      parsed.data.reason,
      restaurantId,
    );
    res.json(customer);
  } catch (error: unknown) {
    console.error('[Loyalty] Error adjusting points:', error);
    res.status(500).json({ error: 'Failed to adjust points' });
  }
});

// ============ Customer Lookup ============

// GET /:merchantId/customers/lookup?phone=
router.get('/:merchantId/customers/lookup', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { phone } = req.query;

    if (!phone) {
      res.status(400).json({ error: 'Phone query parameter is required' });
      return;
    }

    const customer = await prisma.customer.findFirst({
      where: {
        restaurantId,
        phone: phone as string,
      },
    });

    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    res.json(customer);
  } catch (error: unknown) {
    console.error('[Loyalty] Error looking up customer:', error);
    res.status(500).json({ error: 'Failed to lookup customer' });
  }
});

// ============ Referral Config ============

router.get('/:merchantId/referrals/config', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const config = await prisma.referralConfig.findUnique({
      where: { restaurantId },
    });
    if (!config) {
      res.json({
        enabled: false,
        referrerReward: { type: 'points', value: 100, freeItemId: null },
        refereeReward: { type: 'discount_percentage', value: 10, freeItemId: null },
        maxReferrals: null,
      });
      return;
    }
    res.json({
      enabled: config.enabled,
      referrerReward: config.referrerReward,
      refereeReward: config.refereeReward,
      maxReferrals: config.maxReferrals,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error getting referral config:', message);
    res.status(500).json({ error: 'Failed to get referral config' });
  }
});

router.put('/:merchantId/referrals/config', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { enabled, referrerReward, refereeReward, maxReferrals } = req.body;
    const config = await prisma.referralConfig.upsert({
      where: { restaurantId },
      create: { restaurantId, enabled, referrerReward, refereeReward, maxReferrals },
      update: { enabled, referrerReward, refereeReward, maxReferrals },
    });
    res.json({
      enabled: config.enabled,
      referrerReward: config.referrerReward,
      refereeReward: config.refereeReward,
      maxReferrals: config.maxReferrals,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error saving referral config:', message);
    res.status(500).json({ error: 'Failed to save referral config' });
  }
});

export default router;
