import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../test/request-helper';
import { getPrismaMock, resetPrismaMock } from '../test/prisma-mock';
import { RESTAURANT_ID, STATION } from '../test/fixtures';

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

const BASE_URL = `/api/merchant/${RESTAURANT_ID}/stations`;

// ============ GET /api/merchant/:merchantId/stations ============

describe('GET /stations', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(BASE_URL);
    expect(res.status).toBe(401);
  });

  it('returns stations with category IDs', async () => {
    prisma.station.findMany.mockResolvedValue([
      {
        ...STATION,
        categoryMappings: [
          { categoryId: 'cat-1' },
          { categoryId: 'cat-2' },
        ],
      },
    ]);

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].categoryIds).toEqual(['cat-1', 'cat-2']);
    expect(res.body[0].categoryMappings).toBeUndefined();
  });

  it('returns empty array when no stations exist', async () => {
    prisma.station.findMany.mockResolvedValue([]);
    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 on database error', async () => {
    prisma.station.findMany.mockRejectedValue(new Error('DB error'));
    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(500);
  });
});

// ============ POST /api/merchant/:merchantId/stations ============

describe('POST /stations', () => {
  const validBody = { name: 'Grill Station' };

  it('returns 401 without auth', async () => {
    const res = await api.anonymous().post(BASE_URL).send(validBody);
    expect(res.status).toBe(401);
  });

  it('creates a station', async () => {
    prisma.station.create.mockResolvedValue({ ...STATION });

    const res = await api.owner.post(BASE_URL).send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.categoryIds).toEqual([]);
  });

  it('returns 400 for missing name', async () => {
    const res = await api.owner.post(BASE_URL).send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty name', async () => {
    const res = await api.owner.post(BASE_URL).send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('returns 409 for duplicate name', async () => {
    prisma.station.create.mockRejectedValue({ code: 'P2002' });

    const res = await api.owner.post(BASE_URL).send(validBody);
    expect(res.status).toBe(409);
  });

  it('returns 500 on database error', async () => {
    prisma.station.create.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(BASE_URL).send(validBody);
    expect(res.status).toBe(500);
  });
});

// ============ PATCH /api/merchant/:merchantId/stations/:stationId ============

describe('PATCH /stations/:stationId', () => {
  const url = `${BASE_URL}/${STATION.id}`;

  it('updates a station', async () => {
    prisma.station.update.mockResolvedValue({
      ...STATION,
      name: 'Updated Grill',
      categoryMappings: [{ categoryId: 'cat-1' }],
    });

    const res = await api.owner.patch(url).send({ name: 'Updated Grill' });
    expect(res.status).toBe(200);
    expect(res.body.categoryIds).toEqual(['cat-1']);
  });

  it('returns 404 when station does not exist', async () => {
    prisma.station.update.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.patch(url).send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('returns 409 for duplicate name', async () => {
    prisma.station.update.mockRejectedValue({ code: 'P2002' });

    const res = await api.owner.patch(url).send({ name: 'Existing Name' });
    expect(res.status).toBe(409);
  });

  it('returns 400 for invalid data', async () => {
    const res = await api.owner.patch(url).send({ name: '' });
    expect(res.status).toBe(400);
  });
});

// ============ DELETE /api/merchant/:merchantId/stations/:stationId ============

describe('DELETE /stations/:stationId', () => {
  const url = `${BASE_URL}/${STATION.id}`;

  it('deletes a station', async () => {
    const res = await api.owner.delete(url);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 when station does not exist', async () => {
    prisma.station.delete.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.delete(url);
    expect(res.status).toBe(404);
  });

  it('returns 500 on database error', async () => {
    prisma.station.delete.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.delete(url);
    expect(res.status).toBe(500);
  });
});

// ============ PUT /api/merchant/:merchantId/stations/:stationId/categories ============

describe('PUT /stations/:stationId/categories', () => {
  const url = `${BASE_URL}/${STATION.id}/categories`;

  it('sets categories for a station', async () => {
    prisma.station.findFirst.mockResolvedValue(STATION);

    const res = await api.owner.put(url).send({
      categoryIds: ['11111111-1111-1111-8111-111111111111'],
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 when station does not exist', async () => {
    prisma.station.findFirst.mockResolvedValue(null);

    const res = await api.owner.put(url).send({
      categoryIds: ['11111111-1111-1111-8111-111111111111'],
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for non-UUID category IDs', async () => {
    const res = await api.owner.put(url).send({
      categoryIds: ['not-a-uuid'],
    });
    expect(res.status).toBe(400);
  });

  it('clears all categories with empty array', async () => {
    prisma.station.findFirst.mockResolvedValue(STATION);

    const res = await api.owner.put(url).send({ categoryIds: [] });
    expect(res.status).toBe(200);
  });
});

// ============ GET /api/merchant/:merchantId/station-category-mappings ============

describe('GET /station-category-mappings', () => {
  const url = `/api/merchant/${RESTAURANT_ID}/station-category-mappings`;

  it('returns flat mapping list', async () => {
    prisma.stationCategoryMapping.findMany.mockResolvedValue([
      { stationId: STATION.id, categoryId: 'cat-1' },
    ]);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].stationId).toBe(STATION.id);
  });
});
