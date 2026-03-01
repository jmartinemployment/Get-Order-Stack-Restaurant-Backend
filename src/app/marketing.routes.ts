import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

// --- Zod schemas ---

const createCampaignSchema = z.object({
  name: z.string().min(1),
  channel: z.enum(['email', 'sms', 'both']),
  type: z.enum(['promotion', 'announcement', 'loyalty', 're-engagement', 'event']),
  subject: z.string().optional(),
  body: z.string().min(1),
  audienceSegment: z.string().optional(),
  audienceLoyaltyTier: z.string().optional(),
});

const updateCampaignSchema = z.object({
  name: z.string().min(1).optional(),
  channel: z.enum(['email', 'sms', 'both']).optional(),
  type: z.enum(['promotion', 'announcement', 'loyalty', 're-engagement', 'event']).optional(),
  subject: z.string().optional(),
  body: z.string().min(1).optional(),
  audienceSegment: z.string().optional(),
  audienceLoyaltyTier: z.string().optional(),
});

const scheduleSchema = z.object({
  scheduledAt: z.string().refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid datetime'),
});

const audienceEstimateSchema = z.object({
  audienceSegment: z.string().optional(),
  audienceLoyaltyTier: z.string().optional(),
});

// --- Helpers ---

function buildSegmentCondition(segment: string): string | undefined {
  const thresholds: Record<string, { minOrders?: number; maxOrders?: number; daysSinceOrder?: number }> = {
    vip: { minOrders: 10 },
    regular: { minOrders: 3, maxOrders: 9 },
    new: { maxOrders: 1 },
    at_risk: { minOrders: 3, daysSinceOrder: 30 },
    dormant: { daysSinceOrder: 90 },
  };
  return thresholds[segment] !== undefined ? segment : undefined;
}

// --- Routes ---

// GET /:merchantId/campaigns
router.get('/:merchantId/campaigns', async (req: Request, res: Response) => {
  const restaurantId = req.params.merchantId;
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { restaurantId },
      include: { performance: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(campaigns);
  } catch (error: unknown) {
    console.error('[Marketing] List error:', error);
    res.status(500).json({ error: 'Failed to list campaigns' });
  }
});

// POST /:merchantId/campaigns
router.post('/:merchantId/campaigns', async (req: Request, res: Response) => {
  const restaurantId = req.params.merchantId;
  const parsed = createCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const campaign = await prisma.campaign.create({
      data: {
        restaurantId,
        ...parsed.data,
      },
    });
    res.status(201).json(campaign);
  } catch (error: unknown) {
    console.error('[Marketing] Create error:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// PATCH /:merchantId/campaigns/:campaignId
router.patch('/:merchantId/campaigns/:campaignId', async (req: Request, res: Response) => {
  const { restaurantId, campaignId } = req.params;
  const parsed = updateCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const campaign = await prisma.campaign.update({
      where: { id: campaignId, restaurantId },
      data: parsed.data,
    });
    res.json(campaign);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    console.error('[Marketing] Update error:', error);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

// DELETE /:merchantId/campaigns/:campaignId
router.delete('/:merchantId/campaigns/:campaignId', async (req: Request, res: Response) => {
  const { restaurantId, campaignId } = req.params;
  try {
    const campaign = await prisma.campaign.update({
      where: { id: campaignId, restaurantId },
      data: { status: 'cancelled' },
    });
    res.json(campaign);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    console.error('[Marketing] Cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel campaign' });
  }
});

// POST /:merchantId/campaigns/:campaignId/send
router.post('/:merchantId/campaigns/:campaignId/send', async (req: Request, res: Response) => {
  const { restaurantId, campaignId } = req.params;
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, restaurantId },
    });
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const sent = await tx.campaign.update({
        where: { id: campaignId },
        data: {
          status: 'sent',
          sentAt: new Date(),
        },
      });

      await tx.campaignPerformance.create({
        data: {
          campaignId,
          sent: campaign.estimatedRecipients ?? 0,
        },
      });

      return sent;
    });

    res.json(updated);
  } catch (error: unknown) {
    console.error('[Marketing] Send error:', error);
    res.status(500).json({ error: 'Failed to send campaign' });
  }
});

// POST /:merchantId/campaigns/:campaignId/schedule
router.post('/:merchantId/campaigns/:campaignId/schedule', async (req: Request, res: Response) => {
  const { restaurantId, campaignId } = req.params;
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const campaign = await prisma.campaign.update({
      where: { id: campaignId, restaurantId },
      data: {
        status: 'scheduled',
        scheduledAt: new Date(parsed.data.scheduledAt),
      },
    });
    res.json(campaign);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    console.error('[Marketing] Schedule error:', error);
    res.status(500).json({ error: 'Failed to schedule campaign' });
  }
});

// GET /:merchantId/campaigns/:campaignId/performance
router.get('/:merchantId/campaigns/:campaignId/performance', async (req: Request, res: Response) => {
  const { campaignId } = req.params;
  try {
    const performance = await prisma.campaignPerformance.findUnique({
      where: { campaignId },
    });
    if (!performance) {
      res.status(404).json({ error: 'Performance data not found' });
      return;
    }
    res.json(performance);
  } catch (error: unknown) {
    console.error('[Marketing] Performance error:', error);
    res.status(500).json({ error: 'Failed to get performance data' });
  }
});

// POST /:merchantId/campaigns/audience-estimate
router.post('/:merchantId/campaigns/audience-estimate', async (req: Request, res: Response) => {
  const restaurantId = req.params.merchantId;
  const parsed = audienceEstimateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const where: Record<string, unknown> = { restaurantId };

    const segment = parsed.data.audienceSegment;
    if (segment && segment !== 'all') {
      const validSegment = buildSegmentCondition(segment);
      if (validSegment) {
        const now = new Date();
        switch (validSegment) {
          case 'vip':
            where.totalOrders = { gte: 10 };
            break;
          case 'regular':
            where.totalOrders = { gte: 3, lte: 9 };
            break;
          case 'new':
            where.totalOrders = { lte: 1 };
            break;
          case 'at_risk':
            where.totalOrders = { gte: 3 };
            where.lastOrderDate = { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
            break;
          case 'dormant':
            where.lastOrderDate = { lt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
            break;
        }
      }
    }

    if (parsed.data.audienceLoyaltyTier) {
      where.loyaltyTier = parsed.data.audienceLoyaltyTier;
    }

    const count = await prisma.customer.count({ where });
    res.json({ estimatedRecipients: count });
  } catch (error: unknown) {
    console.error('[Marketing] Audience estimate error:', error);
    res.status(500).json({ error: 'Failed to estimate audience' });
  }
});

// ============ Marketing Automations ============

const createAutomationSchema = z.object({
  name: z.string().min(1),
  trigger: z.string().min(1),
  action: z.object({
    type: z.string().min(1),
    templateId: z.string().uuid().optional(),
    points: z.number().int().optional(),
  }).optional(),
  isActive: z.boolean().optional(),
});

const updateAutomationSchema = z.object({
  name: z.string().min(1).optional(),
  trigger: z.string().min(1).optional(),
  action: z.object({
    type: z.string().min(1),
    templateId: z.string().uuid().optional(),
    points: z.number().int().optional(),
  }).optional(),
  isActive: z.boolean().optional(),
});

// GET /:merchantId/marketing/automations
router.get('/:merchantId/marketing/automations', async (req: Request, res: Response) => {
  const restaurantId = req.params.merchantId;
  try {
    const automations = await prisma.marketingAutomation.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });
    res.json(automations);
  } catch (error: unknown) {
    console.error('[Marketing] Automations list error:', error);
    res.status(500).json({ error: 'Failed to list automations' });
  }
});

// POST /:merchantId/marketing/automations
router.post('/:merchantId/marketing/automations', async (req: Request, res: Response) => {
  const restaurantId = req.params.merchantId;
  const parsed = createAutomationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const automation = await prisma.marketingAutomation.create({
      data: {
        restaurantId,
        name: parsed.data.name,
        trigger: parsed.data.trigger,
        action: parsed.data.action ?? {},
        isActive: parsed.data.isActive ?? true,
      },
    });
    res.status(201).json(automation);
  } catch (error: unknown) {
    console.error('[Marketing] Create automation error:', error);
    res.status(500).json({ error: 'Failed to create automation' });
  }
});

// PATCH /:merchantId/marketing/automations/:automationId
router.patch('/:merchantId/marketing/automations/:automationId', async (req: Request, res: Response) => {
  const { restaurantId, automationId } = req.params;
  const parsed = updateAutomationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const automation = await prisma.marketingAutomation.update({
      where: { id: automationId, restaurantId },
      data: parsed.data,
    });
    res.json(automation);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Automation not found' });
      return;
    }
    console.error('[Marketing] Update automation error:', error);
    res.status(500).json({ error: 'Failed to update automation' });
  }
});

// DELETE /:merchantId/marketing/automations/:automationId
router.delete('/:merchantId/marketing/automations/:automationId', async (req: Request, res: Response) => {
  const { restaurantId, automationId } = req.params;
  try {
    await prisma.marketingAutomation.delete({
      where: { id: automationId, restaurantId },
    });
    res.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Automation not found' });
      return;
    }
    console.error('[Marketing] Delete automation error:', error);
    res.status(500).json({ error: 'Failed to delete automation' });
  }
});

export default router;
