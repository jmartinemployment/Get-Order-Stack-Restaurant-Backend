import { marketplaceService } from '../services/marketplace.service';

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_BATCH_SIZE = 25;

let inFlight = false;

function parseIntervalMs(): number {
  const raw = Number.parseInt(String(process.env.MARKETPLACE_STATUS_SYNC_INTERVAL_MS ?? DEFAULT_INTERVAL_MS), 10);
  if (!Number.isFinite(raw)) return DEFAULT_INTERVAL_MS;
  return Math.min(Math.max(raw, 5_000), 300_000);
}

function parseBatchSize(): number {
  const raw = Number.parseInt(String(process.env.MARKETPLACE_STATUS_SYNC_BATCH_SIZE ?? DEFAULT_BATCH_SIZE), 10);
  if (!Number.isFinite(raw)) return DEFAULT_BATCH_SIZE;
  return Math.min(Math.max(raw, 1), 100);
}

function isEnabled(): boolean {
  const value = String(process.env.MARKETPLACE_STATUS_SYNC_JOB_ENABLED ?? 'true').trim().toLowerCase();
  return value !== 'false' && value !== '0' && value !== 'off' && value !== 'no';
}

export function startMarketplaceStatusSyncJob(): void {
  if (!isEnabled()) {
    console.log('[MarketplaceStatusSync] Job disabled by MARKETPLACE_STATUS_SYNC_JOB_ENABLED');
    return;
  }

  const intervalMs = parseIntervalMs();
  const batchSize = parseBatchSize();

  const run = async () => {
    if (inFlight) return;
    inFlight = true;

    try {
      const result = await marketplaceService.processDueStatusSyncJobs({ limit: batchSize });
      if (result.processed > 0 || result.scanned > 0) {
        console.log('[MarketplaceStatusSync] Run complete', result);
      }
    } catch (error: unknown) {
      console.error('[MarketplaceStatusSync] Scheduled run failed:', error);
    } finally {
      inFlight = false;
    }
  };

  console.log(
    `[MarketplaceStatusSync] Starting worker interval=${intervalMs}ms batch=${batchSize}`,
  );

  void run();

  const timer = setInterval(() => {
    void run();
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}
