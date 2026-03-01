import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supplierCredentialsService } from '../services/supplier-credentials.service';
import { requireAuth, requireMerchantManager } from '../middleware/auth.middleware';

const router = Router({ mergeParams: true });

const SyscoCredentialSchema = z.object({
  clientId: z.string().trim().min(1).optional(),
  clientSecret: z.string().trim().min(1).optional(),
  customerId: z.string().trim().min(1).optional(),
  mode: z.enum(['production', 'test']).optional(),
}).refine(
  (data) => data.clientId !== undefined || data.clientSecret !== undefined || data.customerId !== undefined || data.mode !== undefined,
  { message: 'At least one field is required to update Sysco credentials' },
);

const GfsCredentialSchema = z.object({
  clientId: z.string().trim().min(1).optional(),
  clientSecret: z.string().trim().min(1).optional(),
  customerId: z.string().trim().min(1).optional(),
  mode: z.enum(['production', 'test']).optional(),
}).refine(
  (data) => data.clientId !== undefined || data.clientSecret !== undefined || data.customerId !== undefined || data.mode !== undefined,
  { message: 'At least one field is required to update GFS credentials' },
);

const TestConnectionSchema = z.object({
  provider: z.enum(['sysco', 'gfs']),
});

function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

// GET /supplier-credentials — credential summary (no secrets)
router.get('/supplier-credentials', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const summary = await supplierCredentialsService.getSummary(restaurantId);
    res.json(summary);
  } catch (error: unknown) {
    console.error('[Supplier Ordering] Credentials summary error:', error);
    res.status(500).json({ error: 'Failed to load supplier credentials' });
  }
});

// PUT /supplier-credentials/sysco — upsert Sysco credentials
router.put('/supplier-credentials/sysco', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const parsed = SyscoCredentialSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', fields: toFieldErrors(parsed.error) });
      return;
    }
    const summary = await supplierCredentialsService.upsertSysco(restaurantId, parsed.data);
    res.json(summary);
  } catch (error: unknown) {
    console.error('[Supplier Ordering] Upsert Sysco error:', error);
    res.status(500).json({ error: 'Failed to save Sysco credentials' });
  }
});

// PUT /supplier-credentials/gfs — upsert GFS credentials
router.put('/supplier-credentials/gfs', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const parsed = GfsCredentialSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', fields: toFieldErrors(parsed.error) });
      return;
    }
    const summary = await supplierCredentialsService.upsertGfs(restaurantId, parsed.data);
    res.json(summary);
  } catch (error: unknown) {
    console.error('[Supplier Ordering] Upsert GFS error:', error);
    res.status(500).json({ error: 'Failed to save GFS credentials' });
  }
});

// DELETE /supplier-credentials/sysco — clear Sysco credentials
router.delete('/supplier-credentials/sysco', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const summary = await supplierCredentialsService.clearSysco(restaurantId);
    res.json(summary);
  } catch (error: unknown) {
    console.error('[Supplier Ordering] Clear Sysco error:', error);
    res.status(500).json({ error: 'Failed to clear Sysco credentials' });
  }
});

// DELETE /supplier-credentials/gfs — clear GFS credentials
router.delete('/supplier-credentials/gfs', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const summary = await supplierCredentialsService.clearGfs(restaurantId);
    res.json(summary);
  } catch (error: unknown) {
    console.error('[Supplier Ordering] Clear GFS error:', error);
    res.status(500).json({ error: 'Failed to clear GFS credentials' });
  }
});

// POST /supplier-credentials/test — test connection to supplier API
router.post('/supplier-credentials/test', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const parsed = TestConnectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', fields: toFieldErrors(parsed.error) });
      return;
    }
    const result = await supplierCredentialsService.testConnection(restaurantId, parsed.data.provider);
    res.json(result);
  } catch (error: unknown) {
    console.error('[Supplier Ordering] Test connection error:', error);
    res.status(500).json({ error: 'Failed to test supplier connection' });
  }
});

export default router;
