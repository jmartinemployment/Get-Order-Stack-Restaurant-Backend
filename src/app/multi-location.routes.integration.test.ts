import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../test/request-helper';
import { getPrismaMock, resetPrismaMock } from '../test/prisma-mock';
import { RESTAURANT_GROUP_ID, RESTAURANT_ID } from '../test/fixtures';

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

const BASE_URL = `/api/merchant-groups/${RESTAURANT_GROUP_ID}`;

const LOCATION_GROUP = {
  id: 'lg-00000000-0000-0000-0000-000000000001',
  restaurantGroupId: RESTAURANT_GROUP_ID,
  name: 'Florida Locations',
  description: 'All FL stores',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  _count: { members: 2 },
  members: [
    {
      id: 'lgm-1',
      restaurantId: RESTAURANT_ID,
      locationGroupId: 'lg-00000000-0000-0000-0000-000000000001',
      restaurant: { id: RESTAURANT_ID, name: 'Taipa Restaurant', slug: 'taipa' },
      createdAt: new Date('2025-01-01'),
    },
  ],
};

const MEMBER = {
  id: 'lgm-new',
  locationGroupId: LOCATION_GROUP.id,
  restaurantId: RESTAURANT_ID,
  restaurant: { id: RESTAURANT_ID, name: 'Taipa Restaurant', slug: 'taipa' },
  createdAt: new Date('2025-01-01'),
};

// ============ LOCATION GROUP CRUD ============

describe('GET /location-groups', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(`${BASE_URL}/location-groups`);
    expect(res.status).toBe(401);
  });

  it('returns location groups', async () => {
    prisma.locationGroup.findMany.mockResolvedValue([LOCATION_GROUP]);

    const res = await api.owner.get(`${BASE_URL}/location-groups`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Florida Locations');
    expect(res.body[0].memberCount).toBe(2);
  });

  it('returns empty array when no groups', async () => {
    prisma.locationGroup.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${BASE_URL}/location-groups`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 on database error', async () => {
    prisma.locationGroup.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${BASE_URL}/location-groups`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to list location groups');
  });
});

describe('POST /location-groups', () => {
  it('creates a location group', async () => {
    prisma.locationGroup.create.mockResolvedValue({ id: 'lg-new' });
    prisma.locationGroup.findUnique.mockResolvedValue(LOCATION_GROUP);

    const res = await api.owner.post(`${BASE_URL}/location-groups`).send({
      name: 'Florida Locations',
      description: 'All FL stores',
    });
    expect(res.status).toBe(201);
  });

  it('creates with restaurant IDs', async () => {
    prisma.locationGroup.create.mockResolvedValue({ id: 'lg-new' });
    prisma.locationGroupMember.createMany.mockResolvedValue({ count: 1 });
    prisma.locationGroup.findUnique.mockResolvedValue(LOCATION_GROUP);

    const res = await api.owner.post(`${BASE_URL}/location-groups`).send({
      name: 'Florida Locations',
      restaurantIds: [RESTAURANT_ID],
    });
    expect(res.status).toBe(201);
  });

  it('returns 400 for missing name', async () => {
    const res = await api.owner.post(`${BASE_URL}/location-groups`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 for invalid restaurantIds', async () => {
    const res = await api.owner.post(`${BASE_URL}/location-groups`).send({
      name: 'Test',
      restaurantIds: ['not-a-uuid'],
    });
    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    prisma.locationGroup.create.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(`${BASE_URL}/location-groups`).send({ name: 'Test' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to create location group');
  });
});

describe('PATCH /location-groups/:locationGroupId', () => {
  const url = `${BASE_URL}/location-groups/${LOCATION_GROUP.id}`;

  it('updates a location group', async () => {
    prisma.locationGroup.update.mockResolvedValue({});
    prisma.locationGroup.findUnique.mockResolvedValue({ ...LOCATION_GROUP, name: 'Updated' });

    const res = await api.owner.patch(url).send({ name: 'Updated' });
    expect(res.status).toBe(200);
  });

  it('syncs members when restaurantIds provided', async () => {
    prisma.locationGroup.update.mockResolvedValue({});
    prisma.locationGroupMember.deleteMany.mockResolvedValue({ count: 1 });
    prisma.locationGroupMember.createMany.mockResolvedValue({ count: 1 });
    prisma.locationGroup.findUnique.mockResolvedValue(LOCATION_GROUP);

    const res = await api.owner.patch(url).send({ restaurantIds: [RESTAURANT_ID] });
    expect(res.status).toBe(200);
  });

  it('returns 404 when group does not exist', async () => {
    prisma.locationGroup.update.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.patch(url).send({ name: 'Updated' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Location group not found');
  });

  it('returns 500 on database error', async () => {
    prisma.locationGroup.update.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.patch(url).send({ name: 'Updated' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to update location group');
  });
});

describe('DELETE /location-groups/:locationGroupId', () => {
  const url = `${BASE_URL}/location-groups/${LOCATION_GROUP.id}`;

  it('deletes a location group', async () => {
    prisma.locationGroup.delete.mockResolvedValue(LOCATION_GROUP);

    const res = await api.owner.delete(url);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 when group does not exist', async () => {
    prisma.locationGroup.delete.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.delete(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Location group not found');
  });

  it('returns 500 on database error', async () => {
    prisma.locationGroup.delete.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.delete(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to delete location group');
  });
});

// ============ GROUP MEMBERS ============

describe('GET /location-groups/:locationGroupId/members', () => {
  const url = `${BASE_URL}/location-groups/${LOCATION_GROUP.id}/members`;

  it('returns members list', async () => {
    prisma.locationGroupMember.findMany.mockResolvedValue([MEMBER]);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('returns 500 on database error', async () => {
    prisma.locationGroupMember.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to list members');
  });
});

describe('POST /location-groups/:locationGroupId/members', () => {
  const url = `${BASE_URL}/location-groups/${LOCATION_GROUP.id}/members`;

  it('adds a member', async () => {
    prisma.locationGroupMember.create.mockResolvedValue(MEMBER);

    const res = await api.owner.post(url).send({ restaurantId: RESTAURANT_ID });
    expect(res.status).toBe(201);
  });

  it('returns 400 for invalid restaurantId', async () => {
    const res = await api.owner.post(url).send({ restaurantId: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 409 for duplicate member', async () => {
    prisma.locationGroupMember.create.mockRejectedValue({ code: 'P2002' });

    const res = await api.owner.post(url).send({ restaurantId: RESTAURANT_ID });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already a member');
  });

  it('returns 500 on database error', async () => {
    prisma.locationGroupMember.create.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(url).send({ restaurantId: RESTAURANT_ID });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to add member');
  });
});

describe('DELETE /location-groups/:locationGroupId/members/:memberId', () => {
  const url = `${BASE_URL}/location-groups/${LOCATION_GROUP.id}/members/${MEMBER.id}`;

  it('removes a member', async () => {
    prisma.locationGroupMember.delete.mockResolvedValue(MEMBER);

    const res = await api.owner.delete(url);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 when member does not exist', async () => {
    prisma.locationGroupMember.delete.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.delete(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Member not found');
  });

  it('returns 500 on database error', async () => {
    prisma.locationGroupMember.delete.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.delete(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to remove member');
  });
});

// ============ CROSS-LOCATION REPORT ============

describe('GET /cross-location-report', () => {
  it('returns cross-location report', async () => {
    prisma.restaurant.findMany.mockResolvedValue([
      { id: RESTAURANT_ID, name: 'Taipa Restaurant', slug: 'taipa' },
    ]);
    prisma.order.findMany.mockResolvedValue([
      { restaurantId: RESTAURANT_ID, total: 500, customerId: 'cust-1' },
      { restaurantId: RESTAURANT_ID, total: 300, customerId: 'cust-2' },
    ]);

    const res = await api.owner.get(`${BASE_URL}/cross-location-report`);
    expect(res.status).toBe(200);
    expect(res.body.locations).toHaveLength(1);
    expect(res.body.locations[0].revenue).toBe(800);
    expect(res.body.locations[0].orderCount).toBe(2);
    expect(res.body.locations[0].customerCount).toBe(2);
  });

  it('returns empty locations when no restaurants in group', async () => {
    prisma.restaurant.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${BASE_URL}/cross-location-report`);
    expect(res.status).toBe(200);
    expect(res.body.locations).toEqual([]);
  });

  it('supports days query parameter', async () => {
    prisma.restaurant.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${BASE_URL}/cross-location-report?days=7`);
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(7);
  });

  it('returns 500 on database error', async () => {
    prisma.restaurant.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${BASE_URL}/cross-location-report`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to generate cross-location report');
  });
});

// ============ MENU SYNC ============

describe('POST /sync-menu/preview', () => {
  const validBody = {
    sourceRestaurantId: RESTAURANT_ID,
    targetRestaurantIds: ['22222222-2222-4222-a222-222222222222'],
  };

  it('returns sync preview', async () => {
    prisma.menuItem.findMany
      .mockResolvedValueOnce([
        { id: 'item-1', name: 'Burger', price: 12.99, categoryId: 'cat-1', description: '' },
      ])
      .mockResolvedValueOnce([]);

    prisma.menuCategory.findMany.mockResolvedValue([{ id: 'cat-1', name: 'Entrees' }]);

    const res = await api.owner.post(`${BASE_URL}/sync-menu/preview`).send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.sourceItemCount).toBe(1);
    expect(res.body.targets).toHaveLength(1);
    expect(res.body.targets[0].toAdd).toBe(1);
  });

  it('returns 400 for missing sourceRestaurantId', async () => {
    const res = await api.owner.post(`${BASE_URL}/sync-menu/preview`).send({
      targetRestaurantIds: ['22222222-2222-4222-a222-222222222222'],
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty targetRestaurantIds', async () => {
    const res = await api.owner.post(`${BASE_URL}/sync-menu/preview`).send({
      sourceRestaurantId: RESTAURANT_ID,
      targetRestaurantIds: [],
    });
    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    prisma.menuItem.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(`${BASE_URL}/sync-menu/preview`).send(validBody);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to generate sync preview');
  });
});

describe('POST /sync-menu', () => {
  const validBody = {
    sourceRestaurantId: RESTAURANT_ID,
    targetRestaurantIds: ['22222222-2222-4222-a222-222222222222'],
  };

  it('executes menu sync', async () => {
    prisma.menuItem.findMany
      .mockResolvedValueOnce([
        { id: 'item-1', name: 'Burger', price: 12.99, categoryId: 'cat-1', category: { name: 'Entrees' } },
      ])
      .mockResolvedValueOnce([]);

    prisma.menuCategory.findMany
      .mockResolvedValueOnce([{ id: 'cat-1', name: 'Entrees' }])
      .mockResolvedValueOnce([]);

    prisma.menuCategory.create.mockResolvedValue({ id: 'new-cat-1', name: 'Entrees' });
    prisma.menuItem.create.mockResolvedValue({ id: 'new-item-1' });
    prisma.menuSyncLog.create.mockResolvedValue({});

    const res = await api.owner.post(`${BASE_URL}/sync-menu`).send(validBody);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('itemsAdded');
    expect(res.body).toHaveProperty('itemsSkipped');
    expect(res.body).toHaveProperty('conflicts');
  });

  it('returns 400 for missing fields', async () => {
    const res = await api.owner.post(`${BASE_URL}/sync-menu`).send({});
    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    prisma.menuItem.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(`${BASE_URL}/sync-menu`).send(validBody);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to sync menu');
  });
});

describe('GET /sync-menu/history', () => {
  it('returns sync history', async () => {
    prisma.menuSyncLog.findMany.mockResolvedValue([
      { id: 'log-1', itemsAdded: 5, itemsSkipped: 3, conflicts: 1 },
    ]);

    const res = await api.owner.get(`${BASE_URL}/sync-menu/history`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('returns 500 on database error', async () => {
    prisma.menuSyncLog.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${BASE_URL}/sync-menu/history`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to load sync history');
  });
});

// ============ SETTINGS PROPAGATION ============

describe('POST /propagate-settings', () => {
  const validBody = {
    settingsType: 'ai',
    sourceRestaurantId: RESTAURANT_ID,
    targetRestaurantIds: ['22222222-2222-4222-a222-222222222222'],
    overrideExisting: false,
  };

  it('propagates AI settings', async () => {
    prisma.restaurant.findUnique
      .mockResolvedValueOnce({ aiSettings: { model: 'gpt-4' }, taxRate: 0.07 })
      .mockResolvedValueOnce({ aiSettings: null });
    prisma.restaurant.update.mockResolvedValue({});

    const res = await api.owner.post(`${BASE_URL}/propagate-settings`).send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.settingsType).toBe('ai');
    expect(res.body.updatedCount).toBe(1);
  });

  it('skips targets with existing settings when overrideExisting=false', async () => {
    prisma.restaurant.findUnique
      .mockResolvedValueOnce({ aiSettings: { model: 'gpt-4' }, taxRate: 0.07 })
      .mockResolvedValueOnce({ aiSettings: { model: 'existing' } });

    const res = await api.owner.post(`${BASE_URL}/propagate-settings`).send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.updatedCount).toBe(0);
  });

  it('propagates loyalty config', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ aiSettings: null, taxRate: 0.07 });
    prisma.restaurantLoyaltyConfig.findUnique
      .mockResolvedValueOnce({
        enabled: true,
        pointsPerDollar: 10,
        pointsRedemptionRate: 0.01,
        tierSilverMin: 100,
        tierGoldMin: 500,
        tierPlatinumMin: 1000,
        silverMultiplier: 1.5,
        goldMultiplier: 2,
        platinumMultiplier: 3,
      })
      .mockResolvedValueOnce(null);
    prisma.restaurantLoyaltyConfig.upsert.mockResolvedValue({});

    const res = await api.owner.post(`${BASE_URL}/propagate-settings`).send({
      ...validBody,
      settingsType: 'loyalty',
    });
    expect(res.status).toBe(200);
    expect(res.body.updatedCount).toBe(1);
  });

  it('returns 404 when source restaurant not found', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);

    const res = await api.owner.post(`${BASE_URL}/propagate-settings`).send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Source restaurant not found');
  });

  it('returns 400 for invalid settingsType', async () => {
    const res = await api.owner.post(`${BASE_URL}/propagate-settings`).send({
      ...validBody,
      settingsType: 'invalid',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing targetRestaurantIds', async () => {
    const res = await api.owner.post(`${BASE_URL}/propagate-settings`).send({
      settingsType: 'ai',
      sourceRestaurantId: RESTAURANT_ID,
      targetRestaurantIds: [],
    });
    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    prisma.restaurant.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(`${BASE_URL}/propagate-settings`).send(validBody);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to propagate settings');
  });
});
