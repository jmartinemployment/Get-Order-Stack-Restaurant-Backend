import { createServer } from 'http';
import app from './app/app';
import { config } from './app/app.config';
import { initializeSocketServer } from './services/socket.service';
import { startPrintJobCleanup } from './jobs/print-job-cleanup';
import { startMarketplaceStatusSyncJob } from './jobs/marketplace-status-sync';

function validateRequiredEnvVars(): void {
  // --- Hard requirements (crash if missing) ---
  const required = ['JWT_SECRET', 'DATABASE_URL'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
  }

  // --- Soft warnings (app starts but features are degraded) ---
  const recommended: Array<[string, string]> = [
    ['STRIPE_SECRET_KEY', 'Stripe payments will not work'],
    ['STRIPE_WEBHOOK_SECRET', 'Stripe webhooks will reject all events'],
    ['DELIVERY_CREDENTIALS_ENCRYPTION_KEY', 'Delivery credential encryption will fail'],
    ['PAYPAL_CLIENT_ID', 'PayPal payments will not work'],
    ['PAYPAL_CLIENT_SECRET', 'PayPal payments will not work'],
    ['PAYPAL_BN_CODE', 'PayPal revenue attribution will not track'],
  ];

  for (const [key, warning] of recommended) {
    if (!process.env[key]) {
      console.warn(`[Startup] WARNING: ${key} is not set — ${warning}`);
    }
  }

  // --- Credential backend readiness ---
  const requireMostSecure = (process.env.DELIVERY_REQUIRE_MOST_SECURE ?? '').toLowerCase() === 'true';
  if (requireMostSecure && !process.env.DELIVERY_MANAGED_KMS_WRAPPING_KEY) {
    throw new Error('DELIVERY_REQUIRE_MOST_SECURE is true but DELIVERY_MANAGED_KMS_WRAPPING_KEY is missing');
  }
}

// Create HTTP server from Express app
const httpServer = createServer(app);

// Initialize Socket.io
initializeSocketServer(httpServer, config.corsOrigins);

validateRequiredEnvVars();

httpServer.listen(config.port, () => {
  console.log(`🚀 GetOrderStack Restaurant API running on port ${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
  console.log(`   WebSocket: Enabled`);

  // Start background cleanup job for stale print jobs
  startPrintJobCleanup();

  // Start outbound marketplace status sync worker
  startMarketplaceStatusSyncJob();
});
