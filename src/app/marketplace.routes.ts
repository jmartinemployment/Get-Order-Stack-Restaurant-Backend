import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRestaurantManager } from '../middleware/auth.middleware';
import { marketplaceService } from '../services/marketplace.service';

const router = Router();

const MarketplaceProviderSchema = z.enum(['doordash_marketplace', 'ubereats', 'grubhub']);

const MarketplaceIntegrationUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  externalStoreId: z.string().trim().min(1).optional(),
  webhookSigningSecret: z.string().trim().min(1).optional(),
}).refine(
  (value) => value.enabled !== undefined
    || value.externalStoreId !== undefined
    || value.webhookSigningSecret !== undefined,
  { message: 'At least one field is required to update integration settings' },
);

const MarketplaceMenuMappingUpsertSchema = z.object({
  provider: MarketplaceProviderSchema,
  externalItemId: z.string().trim().min(1),
  externalItemName: z.string().trim().min(1).optional(),
  menuItemId: z.string().trim().min(1),
});

router.get('/:restaurantId/marketplace/integrations', requireAuth, requireRestaurantManager, async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const integrations = await marketplaceService.listIntegrations(restaurantId);
    res.json({ integrations });
  } catch (error: unknown) {
    console.error('[Marketplace] Failed to load integrations:', error);
    res.status(500).json({ error: 'Failed to load marketplace integrations' });
  }
});

router.put('/:restaurantId/marketplace/integrations/:provider', requireAuth, requireRestaurantManager, async (req: Request, res: Response) => {
  const providerParse = MarketplaceProviderSchema.safeParse(req.params.provider);
  if (!providerParse.success) {
    res.status(400).json({ error: 'Invalid marketplace provider' });
    return;
  }

  const payloadParse = MarketplaceIntegrationUpdateSchema.safeParse(req.body);
  if (!payloadParse.success) {
    res.status(400).json({
      error: 'Invalid marketplace integration payload',
      details: payloadParse.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const { restaurantId } = req.params;
    const summary = await marketplaceService.updateIntegration(
      restaurantId,
      providerParse.data,
      payloadParse.data,
    );
    res.json(summary);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update marketplace integration';
    console.error('[Marketplace] Failed to update integration:', message);
    res.status(500).json({ error: message });
  }
});

router.delete('/:restaurantId/marketplace/integrations/:provider/secret', requireAuth, requireRestaurantManager, async (req: Request, res: Response) => {
  const providerParse = MarketplaceProviderSchema.safeParse(req.params.provider);
  if (!providerParse.success) {
    res.status(400).json({ error: 'Invalid marketplace provider' });
    return;
  }

  try {
    const { restaurantId } = req.params;
    const summary = await marketplaceService.clearIntegrationSecret(restaurantId, providerParse.data);
    res.json(summary);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to clear marketplace integration secret';
    console.error('[Marketplace] Failed to clear integration secret:', message);
    res.status(500).json({ error: message });
  }
});

router.get('/:restaurantId/marketplace/menu-mappings', requireAuth, requireRestaurantManager, async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const providerRaw = typeof req.query.provider === 'string' ? req.query.provider : undefined;
    if (providerRaw) {
      const providerParse = MarketplaceProviderSchema.safeParse(providerRaw);
      if (!providerParse.success) {
        res.status(400).json({ error: 'Invalid marketplace provider' });
        return;
      }
    }

    const mappings = await marketplaceService.listMenuMappings(restaurantId, providerRaw);
    res.json({ mappings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load marketplace menu mappings';
    console.error('[Marketplace] Failed to load menu mappings:', message);
    res.status(500).json({ error: message });
  }
});

router.post('/:restaurantId/marketplace/menu-mappings', requireAuth, requireRestaurantManager, async (req: Request, res: Response) => {
  const payloadParse = MarketplaceMenuMappingUpsertSchema.safeParse(req.body);
  if (!payloadParse.success) {
    res.status(400).json({
      error: 'Invalid marketplace menu mapping payload',
      details: payloadParse.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const { restaurantId } = req.params;
    const mapping = await marketplaceService.upsertMenuMapping(restaurantId, payloadParse.data);
    res.json(mapping);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save marketplace menu mapping';
    console.error('[Marketplace] Failed to save menu mapping:', message);
    res.status(500).json({ error: message });
  }
});

router.delete('/:restaurantId/marketplace/menu-mappings/:mappingId', requireAuth, requireRestaurantManager, async (req: Request, res: Response) => {
  try {
    const { restaurantId, mappingId } = req.params;
    const deleted = await marketplaceService.deleteMenuMapping(restaurantId, mappingId);
    if (!deleted) {
      res.status(404).json({ error: 'Marketplace menu mapping not found' });
      return;
    }
    res.json({ deleted: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete marketplace menu mapping';
    console.error('[Marketplace] Failed to delete menu mapping:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
