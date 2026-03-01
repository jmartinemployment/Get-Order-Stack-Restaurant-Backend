import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../test/request-helper';
import { getPrismaMock, resetPrismaMock } from '../test/prisma-mock';
import { RESTAURANT_ID } from '../test/fixtures';

vi.mock('../services/auth.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/auth.service')>();
  return {
    ...actual,
    authService: {
      ...actual.authService,
      validateSession: vi.fn().mockResolvedValue(true),
      verifyToken: actual.authService.verifyToken,
      checkRestaurantAccess: vi.fn().mockResolvedValue({ hasAccess: true, role: 'owner' }),
    },
  };
});

vi.mock('../services/marketplace.service', () => ({
  marketplaceService: {
    listIntegrations: vi.fn().mockResolvedValue([]),
    updateIntegration: vi.fn().mockResolvedValue({ provider: 'doordash_marketplace', enabled: true }),
    clearIntegrationSecret: vi.fn().mockResolvedValue({ provider: 'doordash_marketplace', configured: false }),
    listMenuMappings: vi.fn().mockResolvedValue([]),
    upsertMenuMapping: vi.fn().mockResolvedValue({ id: 'm1', provider: 'ubereats', externalItemId: 'ext-1' }),
    deleteMenuMapping: vi.fn().mockResolvedValue(true),
    listStatusSyncJobs: vi.fn().mockResolvedValue([]),
    retryStatusSyncJob: vi.fn().mockResolvedValue({ id: 'j1', status: 'QUEUED' }),
    processDueStatusSyncJobs: vi.fn().mockResolvedValue({ processed: 5, succeeded: 4, failed: 1 }),
    getPilotRolloutSummary: vi.fn().mockResolvedValue({ totalOrders: 100, successRate: 0.95 }),
  },
}));

const prisma = getPrismaMock();

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
});

const BASE_URL = `/api/merchant/${RESTAURANT_ID}/marketplace`;
const MAPPING_ID = '11111111-1111-4111-a111-111111111111';
const MENU_ITEM_ID = '22222222-2222-4222-a222-222222222222';

// ============ GET /integrations ============

describe('GET /marketplace/integrations', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(`${BASE_URL}/integrations`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for staff role', async () => {
    const { authService } = await import('../services/auth.service');
    vi.mocked(authService.checkRestaurantAccess).mockResolvedValueOnce({ hasAccess: true, role: 'staff' });

    const res = await api.staff.get(`${BASE_URL}/integrations`);
    expect(res.status).toBe(403);
  });

  it('returns integrations list', async () => {
    const res = await api.owner.get(`${BASE_URL}/integrations`);
    expect(res.status).toBe(200);
    expect(res.body.integrations).toEqual([]);
  });
});

// ============ PUT /integrations/:provider ============

describe('PUT /marketplace/integrations/:provider', () => {
  it('updates integration settings', async () => {
    const res = await api.owner.put(`${BASE_URL}/integrations/doordash_marketplace`).send({
      enabled: true,
      externalStoreId: 'store-123',
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid provider', async () => {
    const res = await api.owner.put(`${BASE_URL}/integrations/grubhub_invalid`).send({ enabled: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid marketplace provider');
  });

  it('returns 400 when no fields provided', async () => {
    const res = await api.owner.put(`${BASE_URL}/integrations/doordash_marketplace`).send({});
    expect(res.status).toBe(400);
  });
});

// ============ DELETE /integrations/:provider/secret ============

describe('DELETE /marketplace/integrations/:provider/secret', () => {
  it('clears integration secret', async () => {
    const res = await api.owner.delete(`${BASE_URL}/integrations/ubereats/secret`);
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid provider', async () => {
    const res = await api.owner.delete(`${BASE_URL}/integrations/invalid/secret`);
    expect(res.status).toBe(400);
  });
});

// ============ GET /menu-mappings ============

describe('GET /marketplace/menu-mappings', () => {
  it('returns menu mappings', async () => {
    const res = await api.owner.get(`${BASE_URL}/menu-mappings`);
    expect(res.status).toBe(200);
    expect(res.body.mappings).toEqual([]);
  });

  it('filters by provider', async () => {
    const res = await api.owner.get(`${BASE_URL}/menu-mappings?provider=ubereats`);
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid provider filter', async () => {
    const res = await api.owner.get(`${BASE_URL}/menu-mappings?provider=invalid`);
    expect(res.status).toBe(400);
  });
});

// ============ POST /menu-mappings ============

describe('POST /marketplace/menu-mappings', () => {
  it('creates a menu mapping', async () => {
    const res = await api.owner.post(`${BASE_URL}/menu-mappings`).send({
      provider: 'ubereats',
      externalItemId: 'ext-1',
      menuItemId: MENU_ITEM_ID,
    });
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('ubereats');
  });

  it('returns 400 for missing externalItemId', async () => {
    const res = await api.owner.post(`${BASE_URL}/menu-mappings`).send({
      provider: 'ubereats',
      menuItemId: MENU_ITEM_ID,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid provider', async () => {
    const res = await api.owner.post(`${BASE_URL}/menu-mappings`).send({
      provider: 'invalid',
      externalItemId: 'ext-1',
      menuItemId: MENU_ITEM_ID,
    });
    expect(res.status).toBe(400);
  });
});

// ============ DELETE /menu-mappings/:mappingId ============

describe('DELETE /marketplace/menu-mappings/:mappingId', () => {
  it('deletes a menu mapping', async () => {
    const res = await api.owner.delete(`${BASE_URL}/menu-mappings/${MAPPING_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
  });

  it('returns 404 when mapping not found', async () => {
    const { marketplaceService } = await import('../services/marketplace.service');
    vi.mocked(marketplaceService.deleteMenuMapping).mockResolvedValueOnce(false);

    const res = await api.owner.delete(`${BASE_URL}/menu-mappings/${MAPPING_ID}`);
    expect(res.status).toBe(404);
  });
});

// ============ GET /status-sync/jobs ============

describe('GET /marketplace/status-sync/jobs', () => {
  it('returns sync jobs', async () => {
    const res = await api.owner.get(`${BASE_URL}/status-sync/jobs`);
    expect(res.status).toBe(200);
    expect(res.body.jobs).toEqual([]);
  });

  it('filters by status', async () => {
    const res = await api.owner.get(`${BASE_URL}/status-sync/jobs?status=QUEUED`);
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid status filter', async () => {
    const res = await api.owner.get(`${BASE_URL}/status-sync/jobs?status=INVALID`);
    expect(res.status).toBe(400);
  });
});

// ============ POST /status-sync/jobs/:jobId/retry ============

describe('POST /marketplace/status-sync/jobs/:jobId/retry', () => {
  it('retries a sync job', async () => {
    const res = await api.owner.post(`${BASE_URL}/status-sync/jobs/j1/retry`);
    expect(res.status).toBe(200);
  });

  it('returns 404 when job not found', async () => {
    const { marketplaceService } = await import('../services/marketplace.service');
    vi.mocked(marketplaceService.retryStatusSyncJob).mockResolvedValueOnce(null);

    const res = await api.owner.post(`${BASE_URL}/status-sync/jobs/j1/retry`);
    expect(res.status).toBe(404);
  });
});

// ============ POST /status-sync/process ============

describe('POST /marketplace/status-sync/process', () => {
  it('processes due sync jobs', async () => {
    const res = await api.owner.post(`${BASE_URL}/status-sync/process`).send({});
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(5);
  });
});

// ============ GET /pilot/summary ============

describe('GET /marketplace/pilot/summary', () => {
  it('returns pilot summary', async () => {
    const res = await api.owner.get(`${BASE_URL}/pilot/summary`);
    expect(res.status).toBe(200);
    expect(res.body.totalOrders).toBe(100);
  });

  it('accepts provider and windowHours params', async () => {
    const res = await api.owner.get(`${BASE_URL}/pilot/summary?provider=ubereats&windowHours=48`);
    expect(res.status).toBe(200);
  });
});
