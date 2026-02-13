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

// GET /:restaurantId/loyalty/config
router.get('/:restaurantId/loyalty/config', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const config = await loyaltyService.getConfig(restaurantId);
    res.json(config);
  } catch (error: unknown) {
    console.error('[Loyalty] Error fetching config:', error);
    res.status(500).json({ error: 'Failed to fetch loyalty config' });
  }
});

// PATCH /:restaurantId/loyalty/config
router.patch('/:restaurantId/loyalty/config', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
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

// GET /:restaurantId/loyalty/rewards
router.get('/:restaurantId/loyalty/rewards', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
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

// POST /:restaurantId/loyalty/rewards
router.post('/:restaurantId/loyalty/rewards', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
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

// PATCH /:restaurantId/loyalty/rewards/:rewardId
router.patch('/:restaurantId/loyalty/rewards/:rewardId', async (req: Request, res: Response) => {
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

// DELETE /:restaurantId/loyalty/rewards/:rewardId (soft-delete)
router.delete('/:restaurantId/loyalty/rewards/:rewardId', async (req: Request, res: Response) => {
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

// GET /:restaurantId/customers/:customerId/loyalty
router.get('/:restaurantId/customers/:customerId/loyalty', async (req: Request, res: Response) => {
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

// GET /:restaurantId/customers/:customerId/loyalty/history
router.get('/:restaurantId/customers/:customerId/loyalty/history', async (req: Request, res: Response) => {
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

// POST /:restaurantId/customers/:customerId/loyalty/adjust
router.post('/:restaurantId/customers/:customerId/loyalty/adjust', async (req: Request, res: Response) => {
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

// GET /:restaurantId/customers/lookup?phone=
router.get('/:restaurantId/customers/lookup', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
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

export default router;
