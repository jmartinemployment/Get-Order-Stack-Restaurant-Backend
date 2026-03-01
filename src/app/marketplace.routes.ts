import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireMerchantManager } from '../middleware/auth.middleware';
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

const MarketplaceSyncJobStateSchema = z.enum(['QUEUED', 'PROCESSING', 'FAILED', 'SUCCESS', 'DEAD_LETTER']);

const MarketplacePilotSummaryQuerySchema = z.object({
  provider: MarketplaceProviderSchema.optional(),
  windowHours: z.coerce.number().int().min(1).max(24 * 14).optional(),
});

router.get('/:merchantId/marketplace/integrations', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const integrations = await marketplaceService.listIntegrations(restaurantId);
    res.json({ integrations });
  } catch (error: unknown) {
    console.error('[Marketplace] Failed to load integrations:', error);
    res.status(500).json({ error: 'Failed to load marketplace integrations' });
  }
});

router.put('/:merchantId/marketplace/integrations/:provider', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
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
    const restaurantId = req.params.merchantId;
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

router.delete('/:merchantId/marketplace/integrations/:provider/secret', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  const providerParse = MarketplaceProviderSchema.safeParse(req.params.provider);
  if (!providerParse.success) {
    res.status(400).json({ error: 'Invalid marketplace provider' });
    return;
  }

  try {
    const restaurantId = req.params.merchantId;
    const summary = await marketplaceService.clearIntegrationSecret(restaurantId, providerParse.data);
    res.json(summary);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to clear marketplace integration secret';
    console.error('[Marketplace] Failed to clear integration secret:', message);
    res.status(500).json({ error: message });
  }
});

router.get('/:merchantId/marketplace/menu-mappings', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

router.post('/:merchantId/marketplace/menu-mappings', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
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
    const restaurantId = req.params.merchantId;
    const mapping = await marketplaceService.upsertMenuMapping(restaurantId, payloadParse.data);
    res.json(mapping);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save marketplace menu mapping';
    console.error('[Marketplace] Failed to save menu mapping:', message);
    res.status(500).json({ error: message });
  }
});

router.delete('/:merchantId/marketplace/menu-mappings/:mappingId', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
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

router.get('/:merchantId/marketplace/status-sync/jobs', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const statusRaw = typeof req.query.status === 'string' ? req.query.status : undefined;
    const limitRaw = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;

    let status: z.infer<typeof MarketplaceSyncJobStateSchema> | undefined;
    if (statusRaw) {
      const parsed = MarketplaceSyncJobStateSchema.safeParse(statusRaw.toUpperCase());
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid sync job status filter' });
        return;
      }
      status = parsed.data;
    }

    const jobs = await marketplaceService.listStatusSyncJobs(restaurantId, {
      status,
      limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
    });
    res.json({ jobs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load marketplace sync jobs';
    console.error('[Marketplace] Failed to load status sync jobs:', message);
    res.status(500).json({ error: message });
  }
});

router.post('/:merchantId/marketplace/status-sync/jobs/:jobId/retry', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  try {
    const { restaurantId, jobId } = req.params;
    const retried = await marketplaceService.retryStatusSyncJob(restaurantId, jobId);
    if (!retried) {
      res.status(404).json({ error: 'Status sync job not found' });
      return;
    }
    res.json(retried);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to retry marketplace sync job';
    console.error('[Marketplace] Failed to retry status sync job:', message);
    res.status(500).json({ error: message });
  }
});

router.post('/:merchantId/marketplace/status-sync/process', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const limitRaw = Number.parseInt(String(req.body?.limit ?? '20'), 10);
    const result = await marketplaceService.processDueStatusSyncJobs({
      restaurantId,
      limit: Number.isFinite(limitRaw) ? limitRaw : 20,
    });
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to process marketplace sync jobs';
    console.error('[Marketplace] Failed to process status sync jobs:', message);
    res.status(500).json({ error: message });
  }
});

router.get('/:merchantId/marketplace/pilot/summary', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  const queryParse = MarketplacePilotSummaryQuerySchema.safeParse(req.query);
  if (!queryParse.success) {
    res.status(400).json({
      error: 'Invalid marketplace pilot summary query',
      details: queryParse.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const restaurantId = req.params.merchantId;
    const summary = await marketplaceService.getPilotRolloutSummary(restaurantId, queryParse.data);
    res.json(summary);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load marketplace pilot summary';
    console.error('[Marketplace] Failed to load pilot summary:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
