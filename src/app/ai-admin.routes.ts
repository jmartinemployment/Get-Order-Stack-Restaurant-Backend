import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { aiCredentialsService } from '../services/ai-credentials.service';
import { aiConfigService, isValidFeatureKey } from '../services/ai-config.service';
import { aiUsageService } from '../services/ai-usage.service';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

const putApiKeySchema = z.object({
  apiKey: z.string().min(10),
});

const patchFeaturesSchema = z.object({
  aiCostEstimation: z.boolean().optional(),
  menuEngineering: z.boolean().optional(),
  salesInsights: z.boolean().optional(),
  laborOptimization: z.boolean().optional(),
  inventoryPredictions: z.boolean().optional(),
  taxEstimation: z.boolean().optional(),
}).strict();

// GET /:merchantId/ai-admin/config
router.get('/:merchantId/ai-admin/config', async (req, res) => {
  try {
    const restaurantId = req.params.merchantId;

    const [keyStatus, features, usage] = await Promise.all([
      aiCredentialsService.getKeyStatus(restaurantId),
      aiConfigService.getAiFeatures(restaurantId),
      aiUsageService.getCurrentMonthUsage(restaurantId),
    ]);

    res.json({
      apiKeyConfigured: keyStatus.configured,
      apiKeyLastFour: keyStatus.keyLastFour,
      apiKeyValid: keyStatus.isValid,
      features,
      usage,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load AI admin config';
    res.status(500).json({ error: message });
  }
});

// PUT /:merchantId/ai-admin/api-key
router.put('/:merchantId/ai-admin/api-key', async (req, res) => {
  try {
    const restaurantId = req.params.merchantId;
    const parsed = putApiKeySchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      return;
    }

    const status = await aiCredentialsService.saveApiKey(restaurantId, parsed.data.apiKey);
    res.json(status);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save API key';
    res.status(500).json({ error: message });
  }
});

// DELETE /:merchantId/ai-admin/api-key
router.delete('/:merchantId/ai-admin/api-key', async (req, res) => {
  try {
    const restaurantId = req.params.merchantId;
    await aiCredentialsService.deleteApiKey(restaurantId);
    res.json({ configured: false, keyLastFour: null, isValid: false });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete API key';
    res.status(500).json({ error: message });
  }
});

// PATCH /:merchantId/ai-admin/features
router.patch('/:merchantId/ai-admin/features', async (req, res) => {
  try {
    const restaurantId = req.params.merchantId;
    const parsed = patchFeaturesSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid features', details: parsed.error.issues });
      return;
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { aiSettings: true },
    });

    const existingAiSettings = (restaurant?.aiSettings ?? {}) as Record<string, unknown>;
    const existingFeatures = (existingAiSettings.aiFeatures ?? aiConfigService.defaultAiFeatures()) as Record<string, unknown>;

    const updatedFeatures = { ...existingFeatures };
    for (const [key, value] of Object.entries(parsed.data)) {
      if (isValidFeatureKey(key) && typeof value === 'boolean') {
        updatedFeatures[key] = value;
      }
    }

    const updatedAiSettings = {
      ...existingAiSettings,
      aiFeatures: updatedFeatures,
    };

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { aiSettings: updatedAiSettings as Record<string, unknown> as import('@prisma/client').Prisma.InputJsonValue },
    });

    res.json({ features: updatedFeatures });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update features';
    res.status(500).json({ error: message });
  }
});

// GET /:merchantId/ai-admin/usage
router.get('/:merchantId/ai-admin/usage', async (req, res) => {
  try {
    const restaurantId = req.params.merchantId;
    const { startDate, endDate } = req.query;

    let start: Date;
    let end: Date;

    if (typeof startDate === 'string' && typeof endDate === 'string') {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      const now = new Date();
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    const usage = await aiUsageService.getUsageSummary(restaurantId, start, end);
    res.json(usage);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load usage';
    res.status(500).json({ error: message });
  }
});

export default router;
