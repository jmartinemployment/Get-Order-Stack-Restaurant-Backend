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

const prisma = getPrismaMock();

beforeEach(() => {
  resetPrismaMock();
});

const BASE_URL = `/api/merchant/${RESTAURANT_ID}/subscription`;

// ============ GET /subscription ============

describe('GET /subscription', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(BASE_URL);
    expect(res.status).toBe(401);
  });

  it('returns subscription info for free tier', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: RESTAURANT_ID,
      name: 'Test Restaurant',
      planTier: 'free',
      platformFeePercent: 2.6,
      platformFeeFixed: 10,
    });

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(200);
    expect(res.body.planName).toBe('Free');
    expect(res.body.status).toBe('active');
    expect(res.body.amountCents).toBe(0);
    expect(res.body.processingRates).toBeDefined();
  });

  it('returns subscription info for plus tier', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: RESTAURANT_ID,
      name: 'Test Restaurant',
      planTier: 'plus',
      platformFeePercent: 2.5,
      platformFeeFixed: 10,
    });

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(200);
    expect(res.body.planName).toBe('Plus');
    expect(res.body.amountCents).toBe(2500);
  });

  it('returns 404 when restaurant not found', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Restaurant not found');
  });
});

// ============ POST /subscription/change-plan ============

describe('POST /subscription/change-plan', () => {
  it('changes plan tier', async () => {
    prisma.restaurant.update.mockResolvedValue({
      id: RESTAURANT_ID,
      planTier: 'plus',
      platformFeePercent: 2.5,
      platformFeeFixed: 10,
    });

    const res = await api.owner.post(`${BASE_URL}/change-plan`).send({ planTier: 'plus' });
    expect(res.status).toBe(200);
    expect(res.body.planName).toBe('Plus');
    expect(res.body.amountCents).toBe(2500);
  });

  it('returns 400 for invalid tier', async () => {
    const res = await api.owner.post(`${BASE_URL}/change-plan`).send({ planTier: 'enterprise' });
    expect(res.status).toBe(400);
  });

  it('changes to premium tier', async () => {
    prisma.restaurant.update.mockResolvedValue({
      id: RESTAURANT_ID,
      planTier: 'premium',
      platformFeePercent: 2.4,
      platformFeeFixed: 10,
    });

    const res = await api.owner.post(`${BASE_URL}/change-plan`).send({ planTier: 'premium' });
    expect(res.status).toBe(200);
    expect(res.body.planName).toBe('Premium');
    expect(res.body.amountCents).toBe(6900);
  });
});

// ============ POST /subscription/cancel ============

describe('POST /subscription/cancel', () => {
  it('cancels subscription (downgrades to free)', async () => {
    prisma.restaurant.update.mockResolvedValue({ id: RESTAURANT_ID });

    const res = await api.owner.post(`${BASE_URL}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.planName).toBe('Free');
    expect(res.body.status).toBe('canceled');
    expect(res.body.cancelAtPeriodEnd).toBe(true);
    expect(res.body.amountCents).toBe(0);
  });
});
