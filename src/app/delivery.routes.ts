import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { deliveryService } from '../services/delivery.service';

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

export default router;
