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

const BASE_URL = '/api/analytics';

// ============ GET /pinned-widgets ============

describe('GET /pinned-widgets', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(`${BASE_URL}/pinned-widgets?restaurantId=${RESTAURANT_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns 400 without restaurantId', async () => {
    const res = await api.owner.get(`${BASE_URL}/pinned-widgets`);
    expect(res.status).toBe(400);
  });

  it('returns pinned widgets', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      merchantProfile: { pinnedWidgets: [{ id: 'w1', type: 'sales' }] },
    });

    const res = await api.owner.get(`${BASE_URL}/pinned-widgets?restaurantId=${RESTAURANT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'w1', type: 'sales' }]);
  });

  it('returns empty array when no widgets', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ merchantProfile: {} });

    const res = await api.owner.get(`${BASE_URL}/pinned-widgets?restaurantId=${RESTAURANT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns empty array when restaurant not found (graceful)', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);

    const res = await api.owner.get(`${BASE_URL}/pinned-widgets?restaurantId=${RESTAURANT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ============ POST /pinned-widgets ============

describe('POST /pinned-widgets', () => {
  it('returns 400 without restaurantId', async () => {
    const res = await api.owner.post(`${BASE_URL}/pinned-widgets`).send({ type: 'sales' });
    expect(res.status).toBe(400);
  });

  it('saves a pinned widget', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ merchantProfile: { pinnedWidgets: [] } });
    prisma.restaurant.update.mockResolvedValue({});

    const res = await api.owner.post(`${BASE_URL}/pinned-widgets`).send({
      restaurantId: RESTAURANT_ID,
      id: 'w1',
      type: 'sales',
    });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('sales');
  });
});

// ============ DELETE /pinned-widgets/:widgetId ============

describe('DELETE /pinned-widgets/:widgetId', () => {
  it('returns 400 without restaurantId', async () => {
    const res = await api.owner.delete(`${BASE_URL}/pinned-widgets/w1`);
    expect(res.status).toBe(400);
  });

  it('deletes a pinned widget', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      merchantProfile: { pinnedWidgets: [{ id: 'w1', type: 'sales' }, { id: 'w2', type: 'orders' }] },
    });
    prisma.restaurant.update.mockResolvedValue({});

    const res = await api.owner.delete(`${BASE_URL}/pinned-widgets/w1?restaurantId=${RESTAURANT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ============ GET /proactive-insights ============

describe('GET /proactive-insights', () => {
  it('returns 400 without restaurantId', async () => {
    const res = await api.owner.get(`${BASE_URL}/proactive-insights`);
    expect(res.status).toBe(400);
  });

  it('returns insights when orders trending up', async () => {
    prisma.order.count
      .mockResolvedValueOnce(50)  // today
      .mockResolvedValueOnce(20); // yesterday

    const res = await api.owner.get(`${BASE_URL}/proactive-insights?restaurantId=${RESTAURANT_ID}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].type).toBe('trend');
    expect(res.body[0].title).toBe('Orders Trending Up');
  });

  it('returns insights when orders trending down', async () => {
    prisma.order.count
      .mockResolvedValueOnce(10)  // today
      .mockResolvedValueOnce(50); // yesterday

    const res = await api.owner.get(`${BASE_URL}/proactive-insights?restaurantId=${RESTAURANT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body[0].title).toBe('Orders Trending Down');
  });

  it('returns empty array when no significant change', async () => {
    prisma.order.count
      .mockResolvedValueOnce(50)  // today
      .mockResolvedValueOnce(50); // yesterday

    const res = await api.owner.get(`${BASE_URL}/proactive-insights?restaurantId=${RESTAURANT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns empty array when no orders', async () => {
    prisma.order.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const res = await api.owner.get(`${BASE_URL}/proactive-insights?restaurantId=${RESTAURANT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
