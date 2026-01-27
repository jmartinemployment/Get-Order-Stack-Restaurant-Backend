import express from 'express';
import cors from 'cors';
import { config } from './app.config';
import menuRoutes from './app.routes';
import primaryCategoryRoutes from './primary-category.routes';
import analyticsRoutes from './analytics.routes';
import deviceRoutes from './device.routes';
import authRoutes from './auth.routes';
import { stripeService } from '../services/stripe.service';

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

// JSON body parser for all other routes
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes - ORDER MATTERS! More specific routes first
app.use('/api/auth', authRoutes);  // Authentication routes
app.use('/api/restaurant', analyticsRoutes);  // Must be before menuRoutes for /orders/recent-profit
app.use('/api/restaurant', primaryCategoryRoutes);
app.use('/api/restaurant', deviceRoutes);  // Device registration routes
app.use('/api/restaurant', menuRoutes);

export default app;
