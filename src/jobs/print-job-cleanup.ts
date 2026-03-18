import { cloudPrntService } from '../services/cloudprnt.service';
import { logger } from '../utils/logger';

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export function startPrintJobCleanup(): void {
  logger.info('[PrintJobCleanup] Starting stale job cleanup (every 10 minutes)');

  // Run immediately on startup
  cloudPrntService.cleanupStaleJobs().catch((error: unknown) => {
    logger.error('[PrintJobCleanup] Initial cleanup failed:', error);
  });

  // Then every 10 minutes
  setInterval(() => {
    cloudPrntService.cleanupStaleJobs().catch((error: unknown) => {
      logger.error('[PrintJobCleanup] Scheduled cleanup failed:', error);
    });
  }, CLEANUP_INTERVAL_MS);
}
