import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../test/request-helper';
import { getPrismaMock, resetPrismaMock } from '../test/prisma-mock';
import { RESTAURANT_ID, COMBO } from '../test/fixtures';
import { tokens } from '../test/auth-helper';

// Mock authService.validateSession to return true for all test tokens
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
  // Default: findMany returns empty, create/update/delete return fixture
  prisma.combo.findMany.mockResolvedValue([]);
  prisma.combo.create.mockResolvedValue(COMBO);
  prisma.combo.update.mockResolvedValue(COMBO);
  prisma.combo.delete.mockResolvedValue(COMBO);
});

// ============ GET /:merchantId/combos ============

describe('GET /api/merchant/:merchantId/combos', () => {
  const url = `/api/merchant/${RESTAURANT_ID}/combos`;

  it('returns 401 without auth token', async () => {
    const res = await api.anonymous().get(url);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('returns combos for authenticated user', async () => {
    prisma.combo.findMany.mockResolvedValue([COMBO]);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(COMBO.id);
    expect(res.body[0].name).toBe(COMBO.name);
    expect(prisma.combo.findMany).toHaveBeenCalledWith({
      where: { restaurantId: RESTAURANT_ID },
      orderBy: { name: 'asc' },
    });
  });

  it('returns empty array when no combos exist', async () => {
    prisma.combo.findMany.mockResolvedValue([]);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 on database error', async () => {
    prisma.combo.findMany.mockRejectedValue(new Error('DB connection failed'));

    const res = await api.owner.get(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to list combos');
  });
});

// ============ POST /:merchantId/combos ============

describe('POST /api/merchant/:merchantId/combos', () => {
  const url = `/api/merchant/${RESTAURANT_ID}/combos`;

  const validBody = {
    name: 'Lunch Special',
    description: 'Burger + Fries + Drink',
    comboPrice: 12.99,
    items: [
      { menuItemId: '11111111-1111-1111-8111-111111111111', menuItemName: 'Burger', quantity: 1, required: true },
      { menuItemId: '22222222-2222-2222-8222-222222222222', menuItemName: 'Fries', quantity: 1, required: true },
    ],
  };

  it('returns 401 without auth token', async () => {
    const res = await api.anonymous().post(url).send(validBody);
    expect(res.status).toBe(401);
  });

  it('creates a combo with valid data', async () => {
    const res = await api.owner.post(url).send(validBody);
    expect(res.status).toBe(201);
    expect(prisma.combo.create).toHaveBeenCalledWith({
      data: {
        restaurantId: RESTAURANT_ID,
        name: validBody.name,
        description: validBody.description,
        comboPrice: validBody.comboPrice,
        items: validBody.items,
      },
    });
  });

  it('returns 400 for missing name', async () => {
    const res = await api.owner.post(url).send({
      comboPrice: 12.99,
      items: [{ menuItemId: 'item-1', menuItemName: 'Burger', quantity: 1, required: true }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 for empty items array', async () => {
    const res = await api.owner.post(url).send({
      name: 'Lunch Special',
      comboPrice: 12.99,
      items: [],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 for negative price', async () => {
    const res = await api.owner.post(url).send({
      name: 'Lunch Special',
      comboPrice: -5,
      items: [{ menuItemId: 'item-1', menuItemName: 'Burger', quantity: 1, required: true }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 500 on database error', async () => {
    prisma.combo.create.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(url).send(validBody);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to create combo');
  });
});

// ============ PATCH /:merchantId/combos/:comboId ============

describe('PATCH /api/merchant/:merchantId/combos/:comboId', () => {
  const url = `/api/merchant/${RESTAURANT_ID}/combos/${COMBO.id}`;

  it('returns 401 without auth token', async () => {
    const res = await api.anonymous().patch(url).send({ name: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('updates a combo with valid data', async () => {
    const updated = { ...COMBO, name: 'Dinner Special' };
    prisma.combo.update.mockResolvedValue(updated);

    const res = await api.owner.patch(url).send({ name: 'Dinner Special' });
    expect(res.status).toBe(200);
    expect(prisma.combo.update).toHaveBeenCalledWith({
      where: { id: COMBO.id, restaurantId: RESTAURANT_ID },
      data: { name: 'Dinner Special' },
    });
  });

  it('returns 404 when combo does not exist', async () => {
    prisma.combo.update.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.patch(url).send({ name: 'Updated' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Combo not found');
  });

  it('returns 400 for invalid data', async () => {
    const res = await api.owner.patch(url).send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 500 on database error', async () => {
    prisma.combo.update.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.patch(url).send({ name: 'Updated' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to update combo');
  });
});

// ============ DELETE /:merchantId/combos/:comboId ============

describe('DELETE /api/merchant/:merchantId/combos/:comboId', () => {
  const url = `/api/merchant/${RESTAURANT_ID}/combos/${COMBO.id}`;

  it('returns 401 without auth token', async () => {
    const res = await api.anonymous().delete(url);
    expect(res.status).toBe(401);
  });

  it('deletes a combo', async () => {
    const res = await api.owner.delete(url);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(prisma.combo.delete).toHaveBeenCalledWith({
      where: { id: COMBO.id, restaurantId: RESTAURANT_ID },
    });
  });

  it('returns 404 when combo does not exist', async () => {
    prisma.combo.delete.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.delete(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Combo not found');
  });

  it('returns 500 on database error', async () => {
    prisma.combo.delete.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.delete(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to delete combo');
  });
});
