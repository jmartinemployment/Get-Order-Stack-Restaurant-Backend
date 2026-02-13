import { cloudPrntService } from '../services/cloudprnt.service';

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export function startPrintJobCleanup(): void {
  console.log('[PrintJobCleanup] Starting stale job cleanup (every 10 minutes)');

  // Run immediately on startup
  cloudPrntService.cleanupStaleJobs().catch((error: unknown) => {
    console.error('[PrintJobCleanup] Initial cleanup failed:', error);
  });

  // Then every 10 minutes
  setInterval(() => {
    cloudPrntService.cleanupStaleJobs().catch((error: unknown) => {
      console.error('[PrintJobCleanup] Scheduled cleanup failed:', error);
    });
  }, CLEANUP_INTERVAL_MS);
}
