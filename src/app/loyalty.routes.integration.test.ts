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

// Mock loyalty service
vi.mock('../services/loyalty.service', () => ({
  loyaltyService: {
    getConfig: vi.fn().mockResolvedValue({ enabled: true, pointsPerDollar: 10 }),
    updateConfig: vi.fn().mockResolvedValue({ enabled: true, pointsPerDollar: 15 }),
    getCustomerLoyalty: vi.fn().mockResolvedValue({ points: 500, tier: 'silver' }),
    getPointsHistory: vi.fn().mockResolvedValue([{ id: 'h1', points: 100, reason: 'purchase' }]),
    adjustPoints: vi.fn().mockResolvedValue({ points: 600, tier: 'silver' }),
  },
}));

const prisma = getPrismaMock();

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
});

const BASE_URL = `/api/restaurant/${RESTAURANT_ID}`;
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000010';

const REWARD = {
  id: 'reward-00000000-0000-0000-0000-000000000001',
  restaurantId: RESTAURANT_ID,
  name: 'Free Drink',
  description: 'Get a free drink',
  pointsCost: 100,
  discountType: 'fixed',
  discountValue: 5,
  minTier: 'bronze',
  isActive: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

// ============ GET /loyalty/config ============

describe('GET /loyalty/config', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(`${BASE_URL}/loyalty/config`);
    expect(res.status).toBe(401);
  });

  it('returns loyalty config', async () => {
    const res = await api.owner.get(`${BASE_URL}/loyalty/config`);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
  });
});

// ============ PATCH /loyalty/config ============

describe('PATCH /loyalty/config', () => {
  it('updates loyalty config', async () => {
    const res = await api.owner.patch(`${BASE_URL}/loyalty/config`).send({ pointsPerDollar: 15 });
    expect(res.status).toBe(200);
    expect(res.body.pointsPerDollar).toBe(15);
  });

  it('returns 400 for invalid tier thresholds (silver >= gold)', async () => {
    const res = await api.owner.patch(`${BASE_URL}/loyalty/config`).send({
      tierSilverMin: 500,
      tierGoldMin: 200,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid loyalty config data');
  });

  it('returns 400 for pointsPerDollar < 1', async () => {
    const res = await api.owner.patch(`${BASE_URL}/loyalty/config`).send({ pointsPerDollar: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for multiplier > 5', async () => {
    const res = await api.owner.patch(`${BASE_URL}/loyalty/config`).send({ silverMultiplier: 6 });
    expect(res.status).toBe(400);
  });
});

// ============ GET /loyalty/rewards ============

describe('GET /loyalty/rewards', () => {
  it('returns rewards list', async () => {
    prisma.loyaltyReward.findMany.mockResolvedValue([REWARD]);

    const res = await api.owner.get(`${BASE_URL}/loyalty/rewards`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Free Drink');
  });

  it('returns empty array when no rewards', async () => {
    prisma.loyaltyReward.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${BASE_URL}/loyalty/rewards`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 on database error', async () => {
    prisma.loyaltyReward.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${BASE_URL}/loyalty/rewards`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch loyalty rewards');
  });
});

// ============ POST /loyalty/rewards ============

describe('POST /loyalty/rewards', () => {
  const validBody = {
    name: 'Free Drink',
    pointsCost: 100,
    discountType: 'fixed',
    discountValue: 5,
  };

  it('creates a reward', async () => {
    prisma.loyaltyReward.create.mockResolvedValue(REWARD);

    const res = await api.owner.post(`${BASE_URL}/loyalty/rewards`).send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Free Drink');
  });

  it('returns 400 for missing name', async () => {
    const res = await api.owner.post(`${BASE_URL}/loyalty/rewards`).send({
      pointsCost: 100,
      discountType: 'fixed',
      discountValue: 5,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid reward data');
  });

  it('returns 400 for percentage > 100', async () => {
    const res = await api.owner.post(`${BASE_URL}/loyalty/rewards`).send({
      name: 'Bad Discount',
      pointsCost: 100,
      discountType: 'percentage',
      discountValue: 150,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for pointsCost < 1', async () => {
    const res = await api.owner.post(`${BASE_URL}/loyalty/rewards`).send({
      name: 'Free',
      pointsCost: 0,
      discountType: 'fixed',
      discountValue: 5,
    });
    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    prisma.loyaltyReward.create.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(`${BASE_URL}/loyalty/rewards`).send(validBody);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to create loyalty reward');
  });
});

// ============ PATCH /loyalty/rewards/:rewardId ============

describe('PATCH /loyalty/rewards/:rewardId', () => {
  const url = `${BASE_URL}/loyalty/rewards/${REWARD.id}`;

  it('updates a reward', async () => {
    prisma.loyaltyReward.update.mockResolvedValue({ ...REWARD, name: 'Free Dessert' });

    const res = await api.owner.patch(url).send({ name: 'Free Dessert' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Free Dessert');
  });

  it('returns 500 on database error', async () => {
    prisma.loyaltyReward.update.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.patch(url).send({ name: 'Updated' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to update loyalty reward');
  });
});

// ============ DELETE /loyalty/rewards/:rewardId ============

describe('DELETE /loyalty/rewards/:rewardId', () => {
  const url = `${BASE_URL}/loyalty/rewards/${REWARD.id}`;

  it('soft-deletes a reward', async () => {
    prisma.loyaltyReward.update.mockResolvedValue({ ...REWARD, isActive: false });

    const res = await api.owner.delete(url);
    expect(res.status).toBe(204);
  });

  it('returns 500 on database error', async () => {
    prisma.loyaltyReward.update.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.delete(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to delete loyalty reward');
  });
});

// ============ GET /customers/:customerId/loyalty ============

describe('GET /customers/:customerId/loyalty', () => {
  const url = `${BASE_URL}/customers/${CUSTOMER_ID}/loyalty`;

  it('returns customer loyalty profile', async () => {
    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body.points).toBe(500);
  });

  it('returns 404 when customer not found', async () => {
    const { loyaltyService } = await import('../services/loyalty.service');
    vi.mocked(loyaltyService.getCustomerLoyalty).mockRejectedValueOnce(new Error('Customer not found'));

    const res = await api.owner.get(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Customer not found');
  });
});

// ============ GET /customers/:customerId/loyalty/history ============

describe('GET /customers/:customerId/loyalty/history', () => {
  const url = `${BASE_URL}/customers/${CUSTOMER_ID}/loyalty/history`;

  it('returns points history', async () => {
    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('supports limit query parameter', async () => {
    const res = await api.owner.get(`${url}?limit=5`);
    expect(res.status).toBe(200);
  });
});

// ============ POST /customers/:customerId/loyalty/adjust ============

describe('POST /customers/:customerId/loyalty/adjust', () => {
  const url = `${BASE_URL}/customers/${CUSTOMER_ID}/loyalty/adjust`;

  it('adjusts customer points', async () => {
    const res = await api.owner.post(url).send({ points: 100, reason: 'Bonus points' });
    expect(res.status).toBe(200);
    expect(res.body.points).toBe(600);
  });

  it('returns 400 for zero points', async () => {
    const res = await api.owner.post(url).send({ points: 0, reason: 'No change' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid adjustment data');
  });

  it('returns 400 for missing reason', async () => {
    const res = await api.owner.post(url).send({ points: 100 });
    expect(res.status).toBe(400);
  });
});

// ============ GET /customers/lookup ============

describe('GET /customers/lookup', () => {
  const url = `${BASE_URL}/customers/lookup`;

  it('returns customer by phone', async () => {
    const customer = { id: CUSTOMER_ID, restaurantId: RESTAURANT_ID, phone: '555-1234', firstName: 'John' };
    prisma.customer.findFirst.mockResolvedValue(customer);

    const res = await api.owner.get(`${url}?phone=555-1234`);
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('John');
  });

  it('returns 400 when phone is missing', async () => {
    const res = await api.owner.get(url);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Phone query parameter is required');
  });

  it('returns 404 when customer not found', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);

    const res = await api.owner.get(`${url}?phone=000-0000`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Customer not found');
  });

  it('returns 500 on database error', async () => {
    prisma.customer.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${url}?phone=555-1234`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to lookup customer');
  });
});
