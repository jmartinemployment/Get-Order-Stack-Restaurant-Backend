import { createServer } from 'http';
import app from './app/app';
import { config } from './app/app.config';
import { initializeSocketServer } from './services/socket.service';
import { startPrintJobCleanup } from './jobs/print-job-cleanup';
import { startMarketplaceStatusSyncJob } from './jobs/marketplace-status-sync';

function ensureCredentialBackendReadiness(): void {
  const requireMostSecure = (process.env.DELIVERY_REQUIRE_MOST_SECURE ?? '').toLowerCase() === 'true';
  if (!requireMostSecure) return;

  if (!process.env.DELIVERY_MANAGED_KMS_WRAPPING_KEY) {
    throw new Error('DELIVERY_REQUIRE_MOST_SECURE is true but DELIVERY_MANAGED_KMS_WRAPPING_KEY is missing');
  }
}

// Create HTTP server from Express app
const httpServer = createServer(app);

// Initialize Socket.io
initializeSocketServer(httpServer, config.corsOrigins);

ensureCredentialBackendReadiness();

httpServer.listen(config.port, () => {
  console.log(`🚀 GetOrderStack Restaurant API running on port ${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
  console.log(`   WebSocket: Enabled`);

  // Start background cleanup job for stale print jobs
  startPrintJobCleanup();

  // Start outbound marketplace status sync worker
  startMarketplaceStatusSyncJob();
});
