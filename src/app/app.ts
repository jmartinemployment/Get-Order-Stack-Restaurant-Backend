import express from 'express';
import crypto from 'node:crypto';
import cors from 'cors';
import { config } from './app.config';
import menuRoutes from './app.routes';
import primaryCategoryRoutes from './primary-category.routes';
import analyticsRoutes from './analytics.routes';
import deviceRoutes from './device.routes';
import devicePairingRoutes from './device-pairing.routes';
import deviceModeRoutes from './device-mode.routes';
import printerProfileRoutes from './printer-profile.routes';
import peripheralRoutes from './peripheral.routes';
import kioskProfileRoutes from './kiosk-profile.routes';
import authRoutes from './auth.routes';
import cloudprntRoutes from './cloudprnt.routes';
import printerRoutes from './printer.routes';
import orderActionRoutes from './order-actions.routes';
import loyaltyRoutes from './loyalty.routes';
import deliveryRoutes from './delivery.routes';
import laborRoutes from './labor.routes';
import marketplaceRoutes from './marketplace.routes';
import stationRoutes, { stationCategoryMappingRouter } from './station.routes';
import checkRoutes from './check.routes';
import giftCardRoutes from './gift-card.routes';
import invoiceRoutes from './invoice.routes';
import marketingCampaignRoutes from './marketing.routes';
import comboRoutes from './combo.routes';
import aiAdminRoutes from './ai-admin.routes';
import foodCostRoutes from './food-cost.routes';
import supplierOrderingRoutes from './supplier-ordering.routes';
import multiLocationRoutes from './multi-location.routes';
import onboardingRoutes from './onboarding.routes';
import paymentConnectRoutes from './payment-connect.routes';
import subscriptionRoutes from './subscription.routes';
import analyticsStandaloneRoutes from './analytics-standalone.routes';
import teamManagementRoutes from './team-management.routes';
import retailRoutes from './retail.routes';
import { stripeService } from '../services/stripe.service';
import { paypalService } from '../services/paypal.service';
import { deliveryService } from '../services/delivery.service';
import { marketplaceService } from '../services/marketplace.service';
import { requireAuth } from '../middleware/auth.middleware';

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
      console.error('[PayPal Webhook] Webhook ID not configured — rejecting unverified event');
      res.status(503).json({ error: 'PayPal webhook verification not configured' });
      return;
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
    const event = JSON.parse(req.body.toString()) as Record<string, any>;
    const externalId = event.external_delivery_id as string | undefined;
    const ddStatus = event.delivery_status as string | undefined;

    const signingSecret = externalId
      ? await deliveryService.getWebhookVerificationSecret('doordash', externalId)
      : null;

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
    } else {
      console.error('[DoorDash Webhook] No signing secret configured for delivery — rejecting unverified event');
      res.status(503).json({ error: 'DoorDash webhook signing secret not configured' });
      return;
    }

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
    const event = JSON.parse(req.body.toString()) as Record<string, any>;
    const deliveryId = event.data?.id as string | undefined;
    const uberStatus = event.data?.status as string | undefined;

    const signingKey = deliveryId
      ? await deliveryService.getWebhookVerificationSecret('uber', deliveryId)
      : null;

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
    } else {
      console.error('[Uber Webhook] No webhook signing key configured for delivery — rejecting unverified event');
      res.status(503).json({ error: 'Uber webhook signing key not configured' });
      return;
    }

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

// DoorDash Marketplace webhook - MUST be before express.json() to preserve raw body
app.post('/api/webhooks/doordash-marketplace', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const result = await marketplaceService.handleWebhook(
      'doordash_marketplace',
      req.body as Buffer,
      req.headers as Record<string, unknown>,
    );
    res.json({ received: true, ...result });
  } catch (error: unknown) {
    console.error('[DoorDash Marketplace Webhook] Error:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Webhook processing failed' });
  }
});

// Uber Eats webhook - MUST be before express.json() to preserve raw body
app.post('/api/webhooks/ubereats', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const result = await marketplaceService.handleWebhook(
      'ubereats',
      req.body as Buffer,
      req.headers as Record<string, unknown>,
    );
    res.json({ received: true, ...result });
  } catch (error: unknown) {
    console.error('[Uber Eats Webhook] Error:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Webhook processing failed' });
  }
});

// Grubhub webhook (conditional integration)
app.post('/api/webhooks/grubhub', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const result = await marketplaceService.handleWebhook(
      'grubhub',
      req.body as Buffer,
      req.headers as Record<string, unknown>,
    );
    res.json({ received: true, ...result });
  } catch (error: unknown) {
    console.error('[Grubhub Webhook] Error:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Webhook processing failed' });
  }
});

// JSON body parser for all other routes
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: 'bcryptjs-v4-debug' });
});

// Routes - ORDER MATTERS! More specific routes first
// --- Public routes (no auth required) ---
app.use('/api/auth', authRoutes);  // Authentication routes
app.use('/api/cloudprnt', cloudprntRoutes);  // CloudPRNT protocol endpoints (no auth - uses token)
app.use('/api/devices', devicePairingRoutes);  // Device pairing (POST /pair) + lookup (GET /:id)
app.use('/api/platform', onboardingRoutes);    // Menu templates + tax rate lookup (public)
app.use('/api/onboarding', onboardingRoutes);  // Create new merchant (public)

// --- Authenticated routes (requireAuth) ---
app.use('/api/merchant', requireAuth, laborRoutes);  // Labor/scheduling endpoints
app.use('/api/merchant', requireAuth, loyaltyRoutes);  // Loyalty program endpoints
app.use('/api/merchant', requireAuth, printerRoutes);  // Printer management API
app.use('/api/merchant/:merchantId/orders', requireAuth, checkRoutes);  // Check management (POS) endpoints
app.use('/api/merchant/:merchantId/orders', requireAuth, orderActionRoutes);  // Dining option action endpoints
app.use('/api/merchant/:merchantId/delivery', requireAuth, deliveryRoutes);  // Third-party delivery endpoints
app.use('/api/merchant', requireAuth, marketplaceRoutes);  // Marketplace integration config endpoints
app.use('/api/merchant/:merchantId/stations', requireAuth, stationRoutes);  // Station CRUD + category assignment
app.use('/api/merchant/:merchantId/station-category-mappings', requireAuth, stationCategoryMappingRouter);  // Flat mapping list
app.use('/api/merchant', requireAuth, giftCardRoutes);  // Gift card CRUD + redemption
app.use('/api/merchant', requireAuth, invoiceRoutes);  // Invoice + house account CRUD
app.use('/api/merchant', requireAuth, marketingCampaignRoutes);  // Marketing campaign CRUD
app.use('/api/merchant', requireAuth, comboRoutes);  // Combo/bundle CRUD
app.use('/api/merchant', requireAuth, aiAdminRoutes);  // AI admin config, credentials, usage
app.use('/api/merchant', requireAuth, foodCostRoutes);  // Food cost: vendors, invoices, recipes, reports
app.use('/api/merchant', requireAuth, teamManagementRoutes);  // Team members + permission sets CRUD
app.use('/api/merchant/:merchantId', requireAuth, supplierOrderingRoutes);  // Supplier ordering: credentials, connection test
app.use('/api/merchant-groups', requireAuth, multiLocationRoutes);  // Multi-location: groups, sync, settings propagation
app.use('/api/analytics', requireAuth, analyticsStandaloneRoutes);  // Standalone analytics (pinned-widgets, proactive-insights)
app.use('/api/merchant', requireAuth, retailRoutes);  // Retail module CRUD
app.use('/api/merchant', requireAuth, analyticsRoutes);  // Must be before menuRoutes for /orders/recent-profit
app.use('/api/merchant', requireAuth, primaryCategoryRoutes);
app.use('/api/merchant', requireAuth, deviceRoutes);  // Device registration routes
app.use('/api/merchant', requireAuth, deviceModeRoutes);  // Device mode CRUD
app.use('/api/merchant', requireAuth, printerProfileRoutes);  // Printer profile CRUD
app.use('/api/merchant', requireAuth, peripheralRoutes);  // Peripheral device CRUD
app.use('/api/merchant', requireAuth, kioskProfileRoutes);  // Kiosk profile CRUD
app.use('/api/merchant', requireAuth, menuRoutes);
app.use('/api/merchant', requireAuth, paymentConnectRoutes);  // Stripe Connect + PayPal Partner Referrals
app.use('/api/merchant', requireAuth, subscriptionRoutes);  // Subscription plan tier CRUD
app.use('/api/merchant', requireAuth, onboardingRoutes);  // Merchant profile + business hours

export default app;
