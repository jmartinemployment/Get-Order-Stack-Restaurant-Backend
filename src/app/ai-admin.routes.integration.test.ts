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
    },
  };
});

vi.mock('../services/ai-credentials.service', () => ({
  aiCredentialsService: {
    getKeyStatus: vi.fn().mockResolvedValue({ configured: false, keyLastFour: null, isValid: false }),
    saveApiKey: vi.fn().mockResolvedValue({ configured: true, keyLastFour: 'ab12', isValid: true }),
    deleteApiKey: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../services/ai-config.service', () => ({
  aiConfigService: {
    getAiFeatures: vi.fn().mockResolvedValue({
      aiCostEstimation: false,
      menuEngineering: false,
      salesInsights: false,
      laborOptimization: false,
      inventoryPredictions: false,
      taxEstimation: false,
    }),
    defaultAiFeatures: vi.fn().mockReturnValue({
      aiCostEstimation: false,
      menuEngineering: false,
      salesInsights: false,
      laborOptimization: false,
      inventoryPredictions: false,
      taxEstimation: false,
    }),
  },
  isValidFeatureKey: vi.fn().mockReturnValue(true),
}));

vi.mock('../services/ai-usage.service', () => ({
  aiUsageService: {
    getCurrentMonthUsage: vi.fn().mockResolvedValue({ totalRequests: 0, totalCost: 0 }),
    getUsageSummary: vi.fn().mockResolvedValue({ totalRequests: 10, totalCost: 0.50 }),
  },
}));

const prisma = getPrismaMock();

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
});

const BASE_URL = `/api/merchant/${RESTAURANT_ID}/ai-admin`;

// ============ GET /ai-admin/config ============

describe('GET /ai-admin/config', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(`${BASE_URL}/config`);
    expect(res.status).toBe(401);
  });

  it('returns AI admin config', async () => {
    const res = await api.owner.get(`${BASE_URL}/config`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('apiKeyConfigured');
    expect(res.body).toHaveProperty('features');
    expect(res.body).toHaveProperty('usage');
  });
});

// ============ PUT /ai-admin/api-key ============

describe('PUT /ai-admin/api-key', () => {
  it('saves API key', async () => {
    const res = await api.owner.put(`${BASE_URL}/api-key`).send({ apiKey: 'sk-test-1234567890' });
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
  });

  it('returns 400 for short API key', async () => {
    const res = await api.owner.put(`${BASE_URL}/api-key`).send({ apiKey: 'short' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing API key', async () => {
    const res = await api.owner.put(`${BASE_URL}/api-key`).send({});
    expect(res.status).toBe(400);
  });
});

// ============ DELETE /ai-admin/api-key ============

describe('DELETE /ai-admin/api-key', () => {
  it('deletes API key', async () => {
    const res = await api.owner.delete(`${BASE_URL}/api-key`);
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.keyLastFour).toBeNull();
  });
});

// ============ PATCH /ai-admin/features ============

describe('PATCH /ai-admin/features', () => {
  it('updates AI features', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: RESTAURANT_ID,
      aiSettings: { aiFeatures: { aiCostEstimation: false } },
    });
    prisma.restaurant.update.mockResolvedValue({ id: RESTAURANT_ID });

    const res = await api.owner.patch(`${BASE_URL}/features`).send({ aiCostEstimation: true });
    expect(res.status).toBe(200);
    expect(res.body.features).toBeDefined();
  });

  it('returns 400 for unknown feature key (strict schema)', async () => {
    const res = await api.owner.patch(`${BASE_URL}/features`).send({ unknownFeature: true });
    expect(res.status).toBe(400);
  });
});

// ============ GET /ai-admin/usage ============

describe('GET /ai-admin/usage', () => {
  it('returns usage data', async () => {
    const res = await api.owner.get(`${BASE_URL}/usage`);
    expect(res.status).toBe(200);
  });

  it('returns usage for custom date range', async () => {
    const res = await api.owner.get(`${BASE_URL}/usage?startDate=2026-01-01&endDate=2026-01-31`);
    expect(res.status).toBe(200);
  });
});
