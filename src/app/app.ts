import express from 'express';
import crypto from 'node:crypto';
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
import loyaltyRoutes from './loyalty.routes';
import deliveryRoutes from './delivery.routes';
import laborRoutes from './labor.routes';
import { stripeService } from '../services/stripe.service';
import { paypalService } from '../services/paypal.service';
import { deliveryService } from '../services/delivery.service';

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

// DoorDash webhook - MUST be before express.json() to get raw body for HMAC verification
app.post('/api/webhooks/doordash', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signingSecret = process.env.DOORDASH_SIGNING_SECRET;
    if (signingSecret) {
      const signature = req.headers['x-doordash-signature'] as string;
      if (!signature) {
        res.status(400).json({ error: 'Missing signature' });
        return;
      }

      const expected = crypto
        .createHmac('sha256', signingSecret)
        .update(req.body)
        .digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        console.error('[DoorDash Webhook] Signature verification failed');
        res.status(400).json({ error: 'Invalid signature' });
        return;
      }
    }

    const event = JSON.parse(req.body.toString()) as Record<string, any>;
    const externalId = event.external_delivery_id as string;
    const ddStatus = event.delivery_status as string;

    if (externalId && ddStatus) {
      const statusMap: Record<string, string> = {
        'dasher_confirmed': 'DRIVER_ASSIGNED',
        'dasher_confirmed_store_arrival': 'DRIVER_ASSIGNED',
        'enroute_to_pickup': 'DRIVER_EN_ROUTE_TO_PICKUP',
        'arrived_at_store': 'DRIVER_AT_PICKUP',
        'picked_up': 'PICKED_UP',
        'enroute_to_dropoff': 'DRIVER_EN_ROUTE_TO_DROPOFF',
        'arrived_at_consumer': 'DRIVER_AT_DROPOFF',
        'delivered': 'DELIVERED',
        'cancelled': 'CANCELLED',
      };

      const mappedStatus = statusMap[ddStatus];
      if (mappedStatus) {
        await deliveryService.handleWebhookUpdate(externalId, mappedStatus as any, {
          name: event.dasher_name ?? undefined,
          phone: event.dasher_phone_number ?? undefined,
          location: event.dasher_location ? {
            lat: event.dasher_location.lat,
            lng: event.dasher_location.lng,
          } : undefined,
          estimatedDeliveryAt: event.dropoff_time_estimated ?? undefined,
        });
      }
    }

    res.json({ received: true });
  } catch (error: unknown) {
    console.error('[DoorDash Webhook] Error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Uber Direct webhook - MUST be before express.json() to get raw body
app.post('/api/webhooks/uber', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signingKey = process.env.UBER_WEBHOOK_SIGNING_KEY;
    if (signingKey) {
      const signature = req.headers['x-uber-signature'] as string;
      if (!signature) {
        res.status(400).json({ error: 'Missing signature' });
        return;
      }

      const expected = crypto
        .createHmac('sha256', signingKey)
        .update(req.body)
        .digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        console.error('[Uber Webhook] Signature verification failed');
        res.status(400).json({ error: 'Invalid signature' });
        return;
      }
    }

    const event = JSON.parse(req.body.toString()) as Record<string, any>;
    const deliveryId = event.data?.id as string;
    const uberStatus = event.data?.status as string;

    if (deliveryId && uberStatus) {
      const statusMap: Record<string, string> = {
        'pending': 'DISPATCH_REQUESTED',
        'pickup': 'DRIVER_EN_ROUTE_TO_PICKUP',
        'pickup_complete': 'PICKED_UP',
        'dropoff': 'DRIVER_EN_ROUTE_TO_DROPOFF',
        'delivered': 'DELIVERED',
        'canceled': 'CANCELLED',
        'returned': 'FAILED',
      };

      const mappedStatus = statusMap[uberStatus];
      if (mappedStatus) {
        await deliveryService.handleWebhookUpdate(deliveryId, mappedStatus as any, {
          name: event.data?.courier?.name ?? undefined,
          phone: event.data?.courier?.phone_number ?? undefined,
          photoUrl: event.data?.courier?.img_href ?? undefined,
          location: event.data?.courier?.location ? {
            lat: event.data.courier.location.lat,
            lng: event.data.courier.location.lng,
          } : undefined,
          estimatedDeliveryAt: event.data?.dropoff_eta ?? undefined,
        });
      }
    }

    res.json({ received: true });
  } catch (error: unknown) {
    console.error('[Uber Webhook] Error:', error);
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
app.use('/api/restaurant', laborRoutes);  // Labor/scheduling endpoints
app.use('/api/restaurant', loyaltyRoutes);  // Loyalty program endpoints
app.use('/api/restaurant', printerRoutes);  // Printer management API
app.use('/api/restaurant/:restaurantId/orders', orderActionRoutes);  // Dining option action endpoints
app.use('/api/restaurant/:restaurantId/delivery', deliveryRoutes);  // Third-party delivery endpoints
app.use('/api/restaurant', analyticsRoutes);  // Must be before menuRoutes for /orders/recent-profit
app.use('/api/restaurant', primaryCategoryRoutes);
app.use('/api/restaurant', deviceRoutes);  // Device registration routes
app.use('/api/restaurant', menuRoutes);

export default app;
