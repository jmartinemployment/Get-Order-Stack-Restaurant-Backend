import { createServer } from 'http';
import app from './app/app';
import { config } from './app/app.config';
import { initializeSocketServer } from './services/socket.service';
import { startPrintJobCleanup } from './jobs/print-job-cleanup';

// Create HTTP server from Express app
const httpServer = createServer(app);

// Initialize Socket.io
initializeSocketServer(httpServer, config.corsOrigins);

httpServer.listen(config.port, () => {
  console.log(`🚀 GetOrderStack Restaurant API running on port ${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
  console.log(`   WebSocket: Enabled`);

  // Start background cleanup job for stale print jobs
  startPrintJobCleanup();
});
