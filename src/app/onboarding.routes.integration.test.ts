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
      hashPassword: vi.fn().mockResolvedValue('hashed-password'),
      loginUser: vi.fn().mockResolvedValue({ success: true, token: 'test-jwt-token' }),
    },
  };
});

vi.mock('../data/menu-templates', () => ({
  MENU_TEMPLATES: [
    {
      id: 'fast-casual',
      vertical: 'food_and_drink',
      name: 'Fast Casual',
      itemCount: 5,
      categories: [
        {
          name: 'Burgers',
          sortOrder: 1,
          items: [
            { name: 'Classic Burger', description: 'Beef patty', price: 12.99, sortOrder: 1, prepTimeMinutes: 10 },
          ],
        },
      ],
      modifierGroups: [],
    },
    {
      id: 'coffee-shop',
      vertical: 'food_and_drink',
      name: 'Coffee Shop',
      itemCount: 3,
      categories: [],
      modifierGroups: [],
    },
  ],
}));

const prisma = getPrismaMock();

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
});

// ============ GET /merchant-profile ============

describe('GET /api/merchant/:merchantId/merchant-profile', () => {
  it('returns merchant profile', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      merchantProfile: { businessName: 'Test Restaurant', verticals: ['food_and_drink'] },
    });

    const res = await api.owner.get(`/api/merchant/${RESTAURANT_ID}/merchant-profile`);
    expect(res.status).toBe(200);
    expect(res.body.businessName).toBe('Test Restaurant');
  });

  it('returns null when no profile', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ merchantProfile: null });

    const res = await api.owner.get(`/api/merchant/${RESTAURANT_ID}/merchant-profile`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('returns 404 when restaurant not found', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);

    const res = await api.owner.get(`/api/merchant/${RESTAURANT_ID}/merchant-profile`);
    expect(res.status).toBe(404);
  });
});

// ============ PATCH /merchant-profile ============

describe('PATCH /api/merchant/:merchantId/merchant-profile', () => {
  it('merges profile updates', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      merchantProfile: { businessName: 'Old Name', complexity: 'full' },
    });
    prisma.restaurant.update.mockResolvedValue({
      merchantProfile: { businessName: 'New Name', complexity: 'full' },
    });

    const res = await api.owner
      .patch(`/api/merchant/${RESTAURANT_ID}/merchant-profile`)
      .send({ businessName: 'New Name' });
    expect(res.status).toBe(200);
  });

  it('returns 404 when restaurant not found', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);

    const res = await api.owner
      .patch(`/api/merchant/${RESTAURANT_ID}/merchant-profile`)
      .send({ businessName: 'Test' });
    expect(res.status).toBe(404);
  });
});

// ============ GET /menu-templates ============

describe('GET /api/platform/menu-templates', () => {
  it('returns all templates', async () => {
    const res = await api.anonymous().get('/api/platform/menu-templates');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('filters by vertical', async () => {
    const res = await api.anonymous().get('/api/platform/menu-templates?vertical=food_and_drink');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('returns empty for unknown vertical', async () => {
    const res = await api.anonymous().get('/api/platform/menu-templates?vertical=unknown');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

// ============ POST /apply-menu-template ============

describe('POST /api/merchant/:merchantId/apply-menu-template', () => {
  it('applies a menu template', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ id: RESTAURANT_ID });
    // $transaction passes through to callback
    prisma.menuCategory.create.mockResolvedValue({ id: 'cat-1' });
    prisma.menuItem.create.mockResolvedValue({ id: 'item-1' });

    const res = await api.owner
      .post(`/api/merchant/${RESTAURANT_ID}/apply-menu-template`)
      .send({ templateId: 'fast-casual' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.categoriesCreated).toBe(1);
  });

  it('returns 404 for unknown template', async () => {
    const res = await api.owner
      .post(`/api/merchant/${RESTAURANT_ID}/apply-menu-template`)
      .send({ templateId: 'nonexistent' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Template not found');
  });

  it('returns 404 when restaurant not found', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);

    const res = await api.owner
      .post(`/api/merchant/${RESTAURANT_ID}/apply-menu-template`)
      .send({ templateId: 'fast-casual' });
    expect(res.status).toBe(404);
  });
});

// ============ GET /tax-rate ============

describe('GET /api/platform/tax-rate', () => {
  it('returns tax rate for Florida', async () => {
    const res = await api.anonymous().get('/api/platform/tax-rate?state=FL');
    expect(res.status).toBe(200);
    expect(res.body.taxRate).toBe(7.02);
    expect(res.body.source).toBe('state_average');
    expect(res.body.state).toBe('FL');
  });

  it('returns 0 for unknown state', async () => {
    const res = await api.anonymous().get('/api/platform/tax-rate?state=XX');
    expect(res.status).toBe(200);
    expect(res.body.taxRate).toBe(0);
    expect(res.body.source).toBe('unknown');
  });

  it('handles case-insensitive state codes', async () => {
    const res = await api.anonymous().get('/api/platform/tax-rate?state=ca');
    expect(res.status).toBe(200);
    expect(res.body.taxRate).toBe(8.68);
  });
});

// ============ POST /business-hours ============

describe('POST /api/merchant/:merchantId/business-hours', () => {
  it('saves business hours', async () => {
    prisma.restaurant.update.mockResolvedValue({});

    const hours = [
      { day: 'monday', open: '09:00', close: '21:00' },
      { day: 'tuesday', open: '09:00', close: '21:00' },
    ];

    const res = await api.owner
      .post(`/api/merchant/${RESTAURANT_ID}/business-hours`)
      .send(hours);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ============ POST /onboarding/create ============

describe('POST /api/onboarding/create', () => {
  it('returns 400 without business name', async () => {
    const res = await api.anonymous().post('/api/onboarding/create').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Business name is required');
  });

  it('returns 400 without email/password when unauthenticated', async () => {
    const res = await api.anonymous().post('/api/onboarding/create').send({
      businessName: 'Test Restaurant',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('owner email');
  });

  it('creates restaurant with inline user (legacy flow)', async () => {
    prisma.restaurant.create.mockResolvedValue({
      id: RESTAURANT_ID,
      name: 'New Restaurant',
      slug: 'new-restaurant-abc123',
    });
    prisma.teamMember.create.mockResolvedValue({ id: 'user-1' });
    prisma.userRestaurantAccess.create.mockResolvedValue({});
    prisma.device.create.mockResolvedValue({ id: 'device-1' });

    const res = await api.anonymous().post('/api/onboarding/create').send({
      businessName: 'New Restaurant',
      ownerEmail: 'newowner@test.com',
      ownerPassword: 'password123',
    });
    expect(res.status).toBe(201);
    expect(res.body.restaurantId).toBe(RESTAURANT_ID);
    expect(res.body.token).toBe('test-jwt-token');
  });

  it('creates restaurant for authenticated user', async () => {
    prisma.teamMember.findUnique.mockResolvedValue({
      id: 'existing-user',
      email: 'owner@test.com',
      firstName: 'Test',
      lastName: 'Owner',
    });
    prisma.teamMember.update.mockResolvedValue({ id: 'existing-user' });
    prisma.restaurant.create.mockResolvedValue({
      id: RESTAURANT_ID,
      name: 'Auth Restaurant',
      slug: 'auth-restaurant-abc123',
    });
    prisma.userRestaurantAccess.create.mockResolvedValue({});
    prisma.permissionSet.create.mockResolvedValue({ id: 'ps-1', name: 'Full Access' });
    prisma.device.create.mockResolvedValue({ id: 'device-1' });

    const res = await api.owner.post('/api/onboarding/create').send({
      businessName: 'Auth Restaurant',
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeNull(); // Authenticated flow doesn't return new token
  });

  it('returns 409 for duplicate email', async () => {
    prisma.restaurant.create.mockRejectedValue(new Error('Unique constraint'));

    const res = await api.anonymous().post('/api/onboarding/create').send({
      businessName: 'Test',
      ownerEmail: 'existing@test.com',
      ownerPassword: 'password123',
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already exists');
  });
});
