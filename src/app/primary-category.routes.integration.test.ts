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

const BASE_URL = `/api/merchant/${RESTAURANT_ID}/primary-categories`;
const CATEGORY_ID = '11111111-1111-4111-a111-111111111111';
const SUBCATEGORY_ID = '22222222-2222-4222-a222-222222222222';

// ============ GET /primary-categories ============

describe('GET /primary-categories', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(BASE_URL);
    expect(res.status).toBe(401);
  });

  it('returns primary categories with subcategories', async () => {
    prisma.primaryCategory.findMany.mockResolvedValue([
      {
        id: CATEGORY_ID,
        slug: 'beverages',
        name: 'Bebidas',
        nameEn: 'Beverages',
        icon: '🥤',
        displayOrder: 1,
        menuCategories: [
          { id: SUBCATEGORY_ID, name: 'Cerveza', nameEn: 'Beer', displayOrder: 1 },
        ],
      },
    ]);

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(200);
    expect(res.body[0].slug).toBe('beverages');
    expect(res.body[0].subcategoryCount).toBe(1);
    expect(res.body[0].subcategories).toHaveLength(1);
  });

  it('returns English names with lang=en', async () => {
    prisma.primaryCategory.findMany.mockResolvedValue([
      {
        id: CATEGORY_ID,
        slug: 'beverages',
        name: 'Bebidas',
        nameEn: 'Beverages',
        icon: '🥤',
        displayOrder: 1,
        menuCategories: [],
      },
    ]);

    const res = await api.owner.get(`${BASE_URL}?lang=en`);
    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe('Beverages');
  });
});

// ============ POST /primary-categories ============

describe('POST /primary-categories', () => {
  it('creates a primary category', async () => {
    prisma.primaryCategory.aggregate.mockResolvedValue({ _max: { displayOrder: 2 } });
    prisma.primaryCategory.create.mockResolvedValue({
      id: CATEGORY_ID,
      slug: 'appetizers',
      name: 'Entradas',
      nameEn: 'Appetizers',
      displayOrder: 3,
    });

    const res = await api.owner.post(BASE_URL).send({
      slug: 'Appetizers',
      name: 'Entradas',
      nameEn: 'Appetizers',
    });
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe('appetizers');
  });

  it('returns 400 for missing slug', async () => {
    const res = await api.owner.post(BASE_URL).send({ name: 'Entradas' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('slug and name are required');
  });

  it('returns 400 for missing name', async () => {
    const res = await api.owner.post(BASE_URL).send({ slug: 'appetizers' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for duplicate slug', async () => {
    prisma.primaryCategory.aggregate.mockResolvedValue({ _max: { displayOrder: 0 } });
    prisma.primaryCategory.create.mockRejectedValue({ code: 'P2002' });

    const res = await api.owner.post(BASE_URL).send({ slug: 'beverages', name: 'Bebidas' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('slug already exists');
  });
});

// ============ PATCH /primary-categories/:categoryId ============

describe('PATCH /primary-categories/:categoryId', () => {
  it('updates a primary category', async () => {
    prisma.primaryCategory.update.mockResolvedValue({
      id: CATEGORY_ID,
      name: 'Updated Name',
    });

    const res = await api.owner.patch(`${BASE_URL}/${CATEGORY_ID}`).send({ name: 'Updated Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Name');
  });

  it('returns 400 for duplicate slug on update', async () => {
    prisma.primaryCategory.update.mockRejectedValue({ code: 'P2002' });

    const res = await api.owner.patch(`${BASE_URL}/${CATEGORY_ID}`).send({ slug: 'existing-slug' });
    expect(res.status).toBe(400);
  });
});

// ============ DELETE /primary-categories/:categoryId ============

describe('DELETE /primary-categories/:categoryId', () => {
  it('deletes a primary category and unlinks subcategories', async () => {
    prisma.menuCategory.updateMany.mockResolvedValue({ count: 2 });
    prisma.primaryCategory.delete.mockResolvedValue({ id: CATEGORY_ID });

    const res = await api.owner.delete(`${BASE_URL}/${CATEGORY_ID}`);
    expect(res.status).toBe(204);
  });
});

// ============ POST /primary-categories/reorder ============

describe('POST /primary-categories/reorder', () => {
  it('reorders categories', async () => {
    prisma.primaryCategory.update.mockResolvedValue({});

    const res = await api.owner.post(`${BASE_URL}/reorder`).send({
      order: [
        { id: CATEGORY_ID, displayOrder: 0 },
        { id: '33333333-3333-4333-a333-333333333333', displayOrder: 1 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.updated).toBe(2);
  });

  it('returns 400 when order is not an array', async () => {
    const res = await api.owner.post(`${BASE_URL}/reorder`).send({ order: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('order must be an array');
  });
});

// ============ PATCH /menu/categories/:categoryId/assign ============

describe('PATCH /menu/categories/:categoryId/assign', () => {
  it('assigns subcategory to primary category', async () => {
    prisma.menuCategory.update.mockResolvedValue({ id: SUBCATEGORY_ID, primaryCategoryId: CATEGORY_ID });

    const res = await api.owner
      .patch(`/api/merchant/${RESTAURANT_ID}/menu/categories/${SUBCATEGORY_ID}/assign`)
      .send({ primaryCategoryId: CATEGORY_ID });
    expect(res.status).toBe(200);
    expect(res.body.primaryCategoryId).toBe(CATEGORY_ID);
  });

  it('unassigns subcategory by sending null', async () => {
    prisma.menuCategory.update.mockResolvedValue({ id: SUBCATEGORY_ID, primaryCategoryId: null });

    const res = await api.owner
      .patch(`/api/merchant/${RESTAURANT_ID}/menu/categories/${SUBCATEGORY_ID}/assign`)
      .send({ primaryCategoryId: null });
    expect(res.status).toBe(200);
    expect(res.body.primaryCategoryId).toBeNull();
  });
});

// ============ POST /primary-categories/:id/assign-bulk ============

describe('POST /primary-categories/:primaryCategoryId/assign-bulk', () => {
  it('bulk assigns subcategories', async () => {
    prisma.menuCategory.updateMany.mockResolvedValue({ count: 3 });

    const res = await api.owner.post(`${BASE_URL}/${CATEGORY_ID}/assign-bulk`).send({
      categoryIds: [SUBCATEGORY_ID, '33333333-3333-4333-a333-333333333333'],
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when categoryIds is not an array', async () => {
    const res = await api.owner.post(`${BASE_URL}/${CATEGORY_ID}/assign-bulk`).send({
      categoryIds: 'not-array',
    });
    expect(res.status).toBe(400);
  });
});

// ============ GET /menu/grouped ============

describe('GET /menu/grouped', () => {
  it('returns grouped menu structure', async () => {
    prisma.primaryCategory.findMany.mockResolvedValue([
      {
        id: CATEGORY_ID,
        slug: 'food',
        name: 'Comida',
        nameEn: 'Food',
        icon: '🍔',
        displayOrder: 1,
        menuCategories: [
          {
            id: SUBCATEGORY_ID,
            name: 'Burgers',
            nameEn: 'Burgers',
            description: null,
            descriptionEn: null,
            image: null,
            displayOrder: 1,
            active: true,
            menuItems: [],
          },
        ],
      },
    ]);
    prisma.menuCategory.findMany.mockResolvedValue([]); // no orphans

    const res = await api.owner.get(`/api/merchant/${RESTAURANT_ID}/menu/grouped`);
    expect(res.status).toBe(200);
    expect(res.body[0].slug).toBe('food');
    expect(res.body[0].subcategories).toHaveLength(1);
  });

  it('returns orphan categories as flat structure when no primary categories', async () => {
    prisma.primaryCategory.findMany.mockResolvedValue([]);
    prisma.menuCategory.findMany.mockResolvedValue([
      {
        id: SUBCATEGORY_ID,
        name: 'Appetizers',
        nameEn: null,
        description: null,
        descriptionEn: null,
        image: null,
        displayOrder: 1,
        active: true,
        menuItems: [],
      },
    ]);

    const res = await api.owner.get(`/api/merchant/${RESTAURANT_ID}/menu/grouped`);
    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe('Appetizers');
  });
});
