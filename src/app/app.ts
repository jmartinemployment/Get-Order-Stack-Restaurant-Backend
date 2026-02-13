import express from 'express';
import cors from 'cors';
import { config } from './app.config';
import menuRoutes from './app.routes';
import primaryCategoryRoutes from './primary-category.routes';
import analyticsRoutes from './analytics.routes';
import deviceRoutes from './device.routes';
import authRoutes from './auth.routes';
import cloudprntRoutes from './cloudprnt.routes';
import printerRoutes from './printer.routes';
import orderActionRoutes from './order-actions.routes';
import { stripeService } from '../services/stripe.service';
import { paypalService } from '../services/paypal.service';

const app = express();

// Middleware
app.use(cors({ origin: config.corsOrigins }));

// Stripe webhook - MUST be before express.json() to get raw body
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'] as string;

  if (!signature) {
    console.error('[Stripe Webhook] Missing stripe-signature header');
    res.status(400).json({ error: 'Missing signature' });
    return;
  }

  const event = stripeService.constructWebhookEvent(req.body, signature);

  if (!event) {
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  const result = await stripeService.handleWebhookEvent(event);

  if (!result.success) {
    res.status(500).json({ error: result.error });
    return;
  }

  res.json({ received: true });
});

// PayPal webhook - MUST be before express.json() to get raw body
app.post('/api/webhooks/paypal', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId || webhookId === 'placeholder') {
      console.warn('[PayPal Webhook] Webhook ID not configured, processing without verification');
    } else {
      const token = await paypalService.getAccessToken();
      const verifyResponse = await fetch(
        `${process.env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'}/v1/notifications/verify-webhook-signature`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            auth_algo: req.headers['paypal-auth-algo'],
            cert_url: req.headers['paypal-cert-url'],
            transmission_id: req.headers['paypal-transmission-id'],
            transmission_sig: req.headers['paypal-transmission-sig'],
            transmission_time: req.headers['paypal-transmission-time'],
            webhook_id: webhookId,
            webhook_event: JSON.parse(req.body.toString()),
          }),
        },
      );

      if (!verifyResponse.ok) {
        console.error('[PayPal Webhook] Signature verification request failed');
        res.status(400).json({ error: 'Verification request failed' });
        return;
      }

      const verifyData = await verifyResponse.json() as { verification_status: string };
      if (verifyData.verification_status !== 'SUCCESS') {
        console.error('[PayPal Webhook] Signature verification failed');
        res.status(400).json({ error: 'Invalid signature' });
        return;
      }
    }

    const event = JSON.parse(req.body.toString()) as { event_type: string; resource: Record<string, unknown> };
    const result = await paypalService.handleWebhookEvent(event.event_type, event.resource);

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({ received: true });
  } catch (error: unknown) {
    console.error('[PayPal Webhook] Error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// JSON body parser for all other routes
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes - ORDER MATTERS! More specific routes first
app.use('/api/auth', authRoutes);  // Authentication routes
app.use('/api/cloudprnt', cloudprntRoutes);  // CloudPRNT protocol endpoints (no auth - uses token)
app.use('/api/restaurant', printerRoutes);  // Printer management API
app.use('/api/restaurant/:restaurantId/orders', orderActionRoutes);  // Dining option action endpoints
app.use('/api/restaurant', analyticsRoutes);  // Must be before menuRoutes for /orders/recent-profit
app.use('/api/restaurant', primaryCategoryRoutes);
app.use('/api/restaurant', deviceRoutes);  // Device registration routes
app.use('/api/restaurant', menuRoutes);

export default app;
