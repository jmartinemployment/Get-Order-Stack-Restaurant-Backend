import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { deliveryService } from '../services/delivery.service';
import { deliveryCredentialsService } from '../services/delivery-credentials.service';
import { requireAuth, requireRestaurantManager } from '../middleware/auth.middleware';

const router = Router({ mergeParams: true });

const QuoteRequestSchema = z.object({
  orderId: z.string().uuid(),
  provider: z.enum(['doordash', 'uber']),
});

const AcceptRequestSchema = z.object({
  orderId: z.string().uuid(),
  quoteId: z.string().min(1),
});

const CancelRequestSchema = z.object({
  orderId: z.string().uuid(),
});

const DoorDashCredentialSchema = z.object({
  apiKey: z.string().trim().min(1).optional(),
  signingSecret: z.string().trim().min(1).optional(),
  mode: z.enum(['production', 'test']).optional(),
}).refine(
  (data) => data.apiKey !== undefined || data.signingSecret !== undefined || data.mode !== undefined,
  { message: 'At least one field is required to update DoorDash credentials' },
);

const UberCredentialSchema = z.object({
  clientId: z.string().trim().min(1).optional(),
  clientSecret: z.string().trim().min(1).optional(),
  customerId: z.string().trim().min(1).optional(),
  webhookSigningKey: z.string().trim().min(1).optional(),
}).refine(
  (data) => data.clientId !== undefined
    || data.clientSecret !== undefined
    || data.customerId !== undefined
    || data.webhookSigningKey !== undefined,
  { message: 'At least one field is required to update Uber credentials' },
);

const CredentialSecurityProfileSchema = z.object({
  mode: z.enum(['free', 'most_secure']),
});

function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

// GET /:restaurantId/delivery/config-status
router.get('/config-status', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const status = await deliveryService.getConfigStatus(restaurantId);
    res.json(status);
  } catch (error: unknown) {
    console.error('[Delivery] Config status error:', error);
    res.status(500).json({ error: 'Failed to get config status' });
  }
});

// --- Credential management (admin roles only) ---

router.get('/credentials', requireAuth, requireRestaurantManager, async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const summary = await deliveryCredentialsService.getSummary(restaurantId);
    res.json(summary);
  } catch (error: unknown) {
    console.error('[Delivery] Credentials status error:', error);
    res.status(500).json({ error: 'Failed to load delivery credentials' });
  }
});

router.get('/credentials/security-profile', requireAuth, requireRestaurantManager, async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const profile = await deliveryCredentialsService.getSecurityProfile(restaurantId);
    res.json(profile);
  } catch (error: unknown) {
    console.error('[Delivery] Security profile load error:', error);
    res.status(500).json({ error: 'Failed to load credential security profile' });
  }
});

router.put('/credentials/security-profile', requireAuth, requireRestaurantManager, async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = CredentialSecurityProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: toFieldErrors(parsed.error) });
      return;
    }

    const profile = await deliveryCredentialsService.setSecurityProfile(
      restaurantId,
      parsed.data.mode,
      req.user?.userId ?? null,
    );
    res.json(profile);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update credential security profile';
    console.error('[Delivery] Security profile update error:', message);
    if (message.includes('not configured')) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

router.put('/credentials/doordash', requireAuth, requireRestaurantManager, async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = DoorDashCredentialSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: toFieldErrors(parsed.error) });
      return;
    }

    const summary = await deliveryCredentialsService.upsertDoorDash(
      restaurantId,
      parsed.data,
      req.user?.userId ?? null,
    );
    res.json(summary);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save DoorDash credentials';
    console.error('[Delivery] Save DoorDash credentials error:', message);
    if (message.includes('require') || message.includes('not configured')) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

router.delete('/credentials/doordash', requireAuth, requireRestaurantManager, async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const summary = await deliveryCredentialsService.clearDoorDash(
      restaurantId,
      req.user?.userId ?? null,
    );
    res.json(summary);
  } catch (error: unknown) {
    console.error('[Delivery] Delete DoorDash credentials error:', error);
    res.status(500).json({ error: 'Failed to delete DoorDash credentials' });
  }
});

router.put('/credentials/uber', requireAuth, requireRestaurantManager, async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = UberCredentialSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: toFieldErrors(parsed.error) });
      return;
    }

    const summary = await deliveryCredentialsService.upsertUber(
      restaurantId,
      parsed.data,
      req.user?.userId ?? null,
    );
    res.json(summary);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save Uber credentials';
    console.error('[Delivery] Save Uber credentials error:', message);
    if (message.includes('require') || message.includes('not configured')) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

router.delete('/credentials/uber', requireAuth, requireRestaurantManager, async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const summary = await deliveryCredentialsService.clearUber(
      restaurantId,
      req.user?.userId ?? null,
    );
    res.json(summary);
  } catch (error: unknown) {
    console.error('[Delivery] Delete Uber credentials error:', error);
    res.status(500).json({ error: 'Failed to delete Uber credentials' });
  }
});

// POST /:restaurantId/delivery/quote
router.post('/quote', async (req: Request, res: Response) => {
  try {
    const parsed = QuoteRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { orderId, provider } = parsed.data;
    const quote = await deliveryService.requestQuote(orderId, provider);
    res.json(quote);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get delivery quote';
    console.error('[Delivery] Quote error:', message);

    if (message.includes('not configured')) {
      res.status(503).json({ error: message });
    } else if (message.includes('not found')) {
      res.status(404).json({ error: message });
    } else {
      res.status(502).json({ error: message });
    }
  }
});

// POST /:restaurantId/delivery/dispatch
router.post('/dispatch', async (req: Request, res: Response) => {
  try {
    const parsed = AcceptRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { orderId, quoteId } = parsed.data;
    const result = await deliveryService.acceptQuote(orderId, quoteId);
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to dispatch delivery';
    console.error('[Delivery] Dispatch error:', message);

    if (message.includes('not found')) {
      res.status(404).json({ error: message });
    } else if (message.includes('expired') || message.includes('410')) {
      res.status(410).json({ error: 'Quote expired — request a new quote' });
    } else {
      res.status(502).json({ error: message });
    }
  }
});

// GET /:restaurantId/delivery/:orderId/status
router.get('/:orderId/status', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const status = await deliveryService.getStatus(orderId);

    if (!status) {
      res.status(404).json({ error: 'Delivery not found or not dispatched' });
      return;
    }

    res.json(status);
  } catch (error: unknown) {
    console.error('[Delivery] Status error:', error);
    res.status(500).json({ error: 'Failed to get delivery status' });
  }
});

// POST /:restaurantId/delivery/:orderId/cancel
router.post('/:orderId/cancel', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const cancelled = await deliveryService.cancelDelivery(orderId);

    if (!cancelled) {
      res.status(409).json({ error: 'Could not cancel delivery — may already be picked up' });
      return;
    }

    res.json({ success: true });
  } catch (error: unknown) {
    console.error('[Delivery] Cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel delivery' });
  }
});

// ============ Delivery Assignments ============

/**
 * GET /:restaurantId/delivery/assignments
 * Returns active delivery assignments for the restaurant.
 * Derived from orders with delivery status set.
 */
router.get('/assignments', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const assignments = await deliveryService.getActiveAssignments(restaurantId);
    res.json(assignments);
  } catch (error: unknown) {
    // Service may not implement this yet — return empty array
    console.error('[Delivery] Assignments error:', error instanceof Error ? error.message : String(error));
    res.json([]);
  }
});

// ============ Delivery Drivers ============

/**
 * GET /:restaurantId/delivery/drivers
 * Returns delivery drivers associated with the restaurant.
 */
router.get('/drivers', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const drivers = await deliveryService.getDrivers(restaurantId);
    res.json(drivers);
  } catch (error: unknown) {
    // Service may not implement this yet — return empty array
    console.error('[Delivery] Drivers error:', error instanceof Error ? error.message : String(error));
    res.json([]);
  }
});

export default router;
