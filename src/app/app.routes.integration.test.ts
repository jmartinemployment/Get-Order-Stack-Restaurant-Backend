import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../test/request-helper';
import { getPrismaMock, resetPrismaMock } from '../test/prisma-mock';
import { RESTAURANT_ID, RESTAURANT, ORDER } from '../test/fixtures';

// Mock authService.validateSession to return true for all test tokens
vi.mock('../services/auth.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/auth.service')>();
  return {
    ...actual,
    authService: {
      ...actual.authService,
      validateSession: vi.fn().mockResolvedValue(true),
      verifyToken: actual.authService.verifyToken,
      verifyStaffPin: vi.fn().mockResolvedValue({
        success: true,
        staffPin: { name: 'John Manager', role: 'manager' },
      }),
    },
  };
});

vi.mock('../services/translation.service', () => ({
  translationService: { translate: vi.fn() },
}));
vi.mock('../services/ai-cost.service', () => ({
  aiCostService: {
    estimateCost: vi.fn().mockResolvedValue(null),
    generateEnglishDescription: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('../services/tax.service', () => ({
  taxService: { getTaxRateByZip: vi.fn().mockResolvedValue({ rate: 0.07, source: 'mock' }) },
}));
vi.mock('../services/order-status.service', () => ({
  updateOrderStatus: vi.fn().mockResolvedValue({ success: true }),
  getOrderStatusHistory: vi.fn().mockResolvedValue([]),
}));
vi.mock('../services/stripe.service', () => ({
  stripeService: {
    createPaymentIntent: vi.fn().mockResolvedValue({ success: true, clientSecret: 'pi_test_secret', paymentIntentId: 'pi_test' }),
    getPaymentIntent: vi.fn().mockResolvedValue({ success: true, paymentIntent: { status: 'succeeded', amount: 1000, currency: 'usd' } }),
    cancelPaymentIntent: vi.fn().mockResolvedValue({ success: true }),
    createRefund: vi.fn().mockResolvedValue({ success: true, refund: { id: 're_test', amount: 1000, status: 'succeeded' } }),
  },
}));
vi.mock('../services/paypal.service', () => ({
  paypalService: {
    createOrder: vi.fn().mockResolvedValue({ success: true, paypalOrderId: 'PP-ORDER-123' }),
    captureOrder: vi.fn().mockResolvedValue({ success: true }),
    getOrderStatus: vi.fn().mockResolvedValue({ success: true, status: 'COMPLETED', paypalOrderId: 'PP-ORDER-123' }),
    cancelOrder: vi.fn().mockResolvedValue({ success: true }),
    refundCapture: vi.fn().mockResolvedValue({ success: true, refundId: 'PP-REFUND-123', amount: 10, status: 'COMPLETED' }),
  },
}));
vi.mock('../services/socket.service', () => ({
  broadcastOrderEvent: vi.fn(),
  sendOrderEventToDevice: vi.fn(),
  broadcastToSourceAndKDS: vi.fn(),
}));
vi.mock('../services/cloudprnt.service', () => ({
  cloudPrntService: { queuePrintJob: vi.fn().mockResolvedValue('job-1') },
}));
vi.mock('../utils/order-enrichment', () => ({
  enrichOrderResponse: vi.fn((order) => order),
}));
vi.mock('../validators/dining.validator', () => ({
  validateDiningData: vi.fn().mockReturnValue({ valid: true }),
}));
vi.mock('../services/loyalty.service', () => ({
  loyaltyService: {
    getConfig: vi.fn().mockResolvedValue({ enabled: false }),
    calculateTier: vi.fn(),
    calculatePointsEarned: vi.fn(),
    redeemPoints: vi.fn(),
    awardPoints: vi.fn(),
    calculateDiscount: vi.fn(),
    reverseOrder: vi.fn(),
  },
}));
vi.mock('../services/course-pacing.service', () => ({
  coursePacingService: {
    getRestaurantMetrics: vi.fn().mockResolvedValue({ avgCourseDuration: 15 }),
  },
}));
vi.mock('../services/order-throttling.service', () => ({
  orderThrottlingService: {
    applyAutoThrottleForNewOrder: vi.fn().mockResolvedValue(undefined),
    evaluateAndRelease: vi.fn().mockResolvedValue({ releasedOrderIds: [] }),
    getStatus: vi.fn().mockResolvedValue({ enabled: false, heldCount: 0 }),
    holdOrderManually: vi.fn().mockResolvedValue(true),
    releaseOrderManually: vi.fn().mockResolvedValue(true),
  },
}));

const prisma = getPrismaMock();

const BASE_URL = `/api/restaurant`;
const R_URL = `${BASE_URL}/${RESTAURANT_ID}`;

// Reusable fixture data
const CATEGORY_ID = 'cat-00000000-0000-0000-0000-000000000001';
const ITEM_ID = 'item-00000000-0000-0000-0000-000000000001';
const GROUP_ID = 'group-00000000-0000-0000-0000-000000000001';
const MODIFIER_ID = 'mod-00000000-0000-0000-0000-000000000001';
const TABLE_ID = 'table-00000000-0000-0000-0000-000000000001';
const RESERVATION_ID = 'res-00000000-0000-0000-0000-000000000001';
const ORDER_ID = ORDER.id;
const ORDER_ITEM_ID = 'oi-00000000-0000-0000-0000-000000000001';

const MOCK_CATEGORY = {
  id: CATEGORY_ID,
  restaurantId: RESTAURANT_ID,
  name: 'Appetizers',
  nameEn: 'Appetizers',
  description: 'Starters',
  descriptionEn: null,
  image: null,
  active: true,
  displayOrder: 1,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const MOCK_ITEM = {
  id: ITEM_ID,
  restaurantId: RESTAURANT_ID,
  categoryId: CATEGORY_ID,
  name: 'Spring Rolls',
  nameEn: 'Spring Rolls',
  description: 'Crispy rolls',
  descriptionEn: null,
  price: 8.99,
  cost: null,
  image: null,
  available: true,
  eightySixed: false,
  eightySixReason: null,
  popular: false,
  dietary: [],
  displayOrder: 1,
  prepTimeMinutes: null,
  aiEstimatedCost: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const MOCK_MODIFIER_GROUP = {
  id: GROUP_ID,
  restaurantId: RESTAURANT_ID,
  name: 'Size',
  nameEn: null,
  description: null,
  descriptionEn: null,
  required: false,
  multiSelect: false,
  minSelections: 0,
  maxSelections: null,
  active: true,
  displayOrder: 1,
  modifiers: [],
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const MOCK_MODIFIER = {
  id: MODIFIER_ID,
  modifierGroupId: GROUP_ID,
  name: 'Large',
  nameEn: null,
  priceAdjustment: 2.00,
  isDefault: false,
  available: true,
  displayOrder: 1,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const MOCK_TABLE = {
  id: TABLE_ID,
  restaurantId: RESTAURANT_ID,
  tableNumber: '1',
  tableName: 'Table 1',
  capacity: 4,
  section: 'Main',
  status: 'available',
  active: true,
  posX: 0,
  posY: 0,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const MOCK_RESERVATION = {
  id: RESERVATION_ID,
  restaurantId: RESTAURANT_ID,
  customerName: 'Jane Doe',
  customerPhone: '555-1234',
  customerEmail: 'jane@example.com',
  partySize: 4,
  reservationTime: new Date('2026-03-01T19:00:00Z'),
  tableNumber: '1',
  specialRequests: null,
  status: 'confirmed',
  customer: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const MOCK_ORDER = {
  ...ORDER,
  orderItems: [],
  checks: [],
  customer: null,
  table: null,
  marketplaceOrder: null,
  paymentStatus: 'paid',
  paymentMethod: 'stripe',
  stripePaymentIntentId: 'pi_test_123',
  paypalOrderId: null,
  paypalCaptureId: null,
  sourceDeviceId: null,
};

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
});

// ============ Staff PIN Validation ============

describe('POST /api/restaurant/:restaurantId/auth/validate-pin', () => {
  const url = `${R_URL}/auth/validate-pin`;

  it('returns 401 without auth token', async () => {
    const res = await api.anonymous().post(url).send({ pin: '1234' });
    expect(res.status).toBe(401);
  });

  it('returns valid true for correct pin with sufficient role', async () => {
    const res = await api.owner.post(url).send({ pin: '1234', requiredRole: 'manager' });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.staffName).toBe('John Manager');
    expect(res.body.staffRole).toBe('manager');
  });

  it('returns 400 when pin is missing', async () => {
    const res = await api.owner.post(url).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('pin is required');
  });

  it('returns valid false when pin is invalid', async () => {
    const { authService } = await import('../services/auth.service');
    (authService.verifyStaffPin as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: false, staffPin: null });

    const res = await api.owner.post(url).send({ pin: '9999' });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
  });

  it('returns valid false when role is insufficient', async () => {
    const { authService } = await import('../services/auth.service');
    (authService.verifyStaffPin as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      staffPin: { name: 'Staff Member', role: 'staff' },
    });

    const res = await api.owner.post(url).send({ pin: '1234', requiredRole: 'owner' });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
  });
});

// ============ Restaurant CRUD ============

describe('POST /api/restaurant', () => {
  const url = BASE_URL;

  it('returns 401 without auth token', async () => {
    const res = await api.anonymous().post(url).send({ name: 'Test' });
    expect(res.status).toBe(401);
  });

  it('creates a restaurant with valid data', async () => {
    prisma.restaurant.create.mockResolvedValue({ ...RESTAURANT, id: 'new-id' });

    const res = await api.owner.post(url).send({
      slug: 'test-rest',
      name: 'Test Restaurant',
      state: 'FL',
      zip: '33301',
    });
    expect(res.status).toBe(201);
    expect(prisma.restaurant.create).toHaveBeenCalled();
  });

  it('auto-looks up tax rate when zip provided without taxRate', async () => {
    prisma.restaurant.create.mockResolvedValue(RESTAURANT);

    const res = await api.owner.post(url).send({
      name: 'Tax Test',
      zip: '33301',
      state: 'FL',
    });
    expect(res.status).toBe(201);
  });
});

describe('GET /api/restaurant/:restaurantId', () => {
  const url = `${R_URL}`;

  it('returns restaurant when found', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(RESTAURANT);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RESTAURANT_ID);
  });

  it('returns 404 when not found', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);

    const res = await api.owner.get(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Restaurant not found');
  });
});

describe('GET /api/restaurant/slug/:slug', () => {
  it('returns restaurant by slug', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(RESTAURANT);

    const res = await api.owner.get(`${BASE_URL}/slug/taipa`);
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('taipa');
  });

  it('returns 404 for unknown slug', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);

    const res = await api.owner.get(`${BASE_URL}/slug/nonexistent`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/restaurant/:restaurantId', () => {
  const url = `${R_URL}`;

  it('updates restaurant with valid data', async () => {
    const updated = { ...RESTAURANT, name: 'Updated Name' };
    prisma.restaurant.update.mockResolvedValue(updated);

    const res = await api.owner.patch(url).send({ name: 'Updated Name' });
    expect(res.status).toBe(200);
    expect(prisma.restaurant.update).toHaveBeenCalledWith({
      where: { id: RESTAURANT_ID },
      data: expect.objectContaining({ name: 'Updated Name' }),
    });
  });

  it('returns 400 for invalid aiSettings', async () => {
    const res = await api.owner.patch(url).send({
      aiSettings: { timeThresholdHours: -5 },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid aiSettings payload');
  });
});

// ============ Full Menu ============

describe('GET /api/restaurant/:restaurantId/menu', () => {
  const url = `${R_URL}/menu`;

  it('returns transformed menu structure', async () => {
    prisma.menuCategory.findMany.mockResolvedValue([{
      ...MOCK_CATEGORY,
      menuItems: [{
        ...MOCK_ITEM,
        modifierGroups: [],
      }],
    }]);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Appetizers');
    expect(res.body[0].items).toHaveLength(1);
    expect(res.body[0].items[0].name).toBe('Spring Rolls');
  });

  it('returns empty array when no categories', async () => {
    prisma.menuCategory.findMany.mockResolvedValue([]);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ============ Categories ============

describe('GET /api/restaurant/:restaurantId/menu/categories', () => {
  const url = `${R_URL}/menu/categories`;

  it('returns categories for restaurant', async () => {
    prisma.menuCategory.findMany.mockResolvedValue([MOCK_CATEGORY]);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Appetizers');
  });
});

describe('POST /api/restaurant/:restaurantId/menu/categories', () => {
  const url = `${R_URL}/menu/categories`;

  it('creates a category', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(RESTAURANT);
    prisma.menuCategory.aggregate.mockResolvedValue({ _max: { displayOrder: 0 } });
    prisma.menuCategory.create.mockResolvedValue(MOCK_CATEGORY);

    const res = await api.owner.post(url).send({ name: 'Appetizers' });
    expect(res.status).toBe(201);
    expect(prisma.menuCategory.create).toHaveBeenCalled();
  });
});

describe('PATCH /api/restaurant/:restaurantId/menu/categories/:categoryId', () => {
  const url = `${R_URL}/menu/categories/${CATEGORY_ID}`;

  it('updates a category', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(RESTAURANT);
    prisma.menuCategory.findUnique.mockResolvedValue(MOCK_CATEGORY);
    prisma.menuCategory.update.mockResolvedValue({ ...MOCK_CATEGORY, name: 'Entrees' });

    const res = await api.owner.patch(url).send({ name: 'Entrees' });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/restaurant/:restaurantId/menu/categories/:categoryId', () => {
  const url = `${R_URL}/menu/categories/${CATEGORY_ID}`;

  it('deletes a category and its items', async () => {
    prisma.menuItem.deleteMany.mockResolvedValue({ count: 2 });
    prisma.menuCategory.delete.mockResolvedValue(MOCK_CATEGORY);

    const res = await api.owner.delete(url);
    expect(res.status).toBe(204);
    expect(prisma.menuItem.deleteMany).toHaveBeenCalledWith({ where: { categoryId: CATEGORY_ID } });
    expect(prisma.menuCategory.delete).toHaveBeenCalledWith({ where: { id: CATEGORY_ID } });
  });
});

// ============ Menu Items ============

describe('GET /api/restaurant/:restaurantId/menu/items', () => {
  const url = `${R_URL}/menu/items`;

  it('returns all menu items', async () => {
    prisma.menuItem.findMany.mockResolvedValue([{ ...MOCK_ITEM, modifierGroups: [] }]);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('GET /api/restaurant/:restaurantId/menu/items/:itemId', () => {
  it('returns item when found', async () => {
    prisma.menuItem.findUnique.mockResolvedValue({ ...MOCK_ITEM, category: MOCK_CATEGORY, modifierGroups: [] });

    const res = await api.owner.get(`${R_URL}/menu/items/${ITEM_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Spring Rolls');
  });

  it('returns 404 when item not found', async () => {
    prisma.menuItem.findUnique.mockResolvedValue(null);

    const res = await api.owner.get(`${R_URL}/menu/items/${ITEM_ID}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Menu item not found');
  });
});

describe('POST /api/restaurant/:restaurantId/menu/items', () => {
  const url = `${R_URL}/menu/items`;

  it('creates a menu item', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(RESTAURANT);
    prisma.menuItem.aggregate.mockResolvedValue({ _max: { displayOrder: 0 } });
    prisma.menuItem.create.mockResolvedValue({ ...MOCK_ITEM, modifierGroups: [] });

    const res = await api.owner.post(url).send({
      categoryId: CATEGORY_ID,
      name: 'Spring Rolls',
      price: 8.99,
    });
    expect(res.status).toBe(201);
    expect(prisma.menuItem.create).toHaveBeenCalled();
  });
});

describe('PATCH /api/restaurant/:restaurantId/menu/items/:itemId', () => {
  const url = `${R_URL}/menu/items/${ITEM_ID}`;

  it('updates a menu item', async () => {
    prisma.menuItem.findUnique.mockResolvedValue(MOCK_ITEM);
    prisma.restaurant.findUnique.mockResolvedValue(RESTAURANT);
    prisma.menuItem.update.mockResolvedValue({ ...MOCK_ITEM, name: 'Egg Rolls', modifierGroups: [] });

    const res = await api.owner.patch(url).send({ name: 'Egg Rolls' });
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/restaurant/:restaurantId/menu/items/:itemId/86', () => {
  it('marks item as 86d', async () => {
    prisma.menuItem.update.mockResolvedValue({ ...MOCK_ITEM, eightySixed: true, eightySixReason: 'Out of stock' });

    const res = await api.owner.patch(`${R_URL}/menu/items/${ITEM_ID}/86`).send({
      eightySixed: true,
      reason: 'Out of stock',
    });
    expect(res.status).toBe(200);
    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { id: ITEM_ID },
      data: { eightySixed: true, eightySixReason: 'Out of stock' },
    });
  });

  it('clears 86 reason when un-86ing', async () => {
    prisma.menuItem.update.mockResolvedValue({ ...MOCK_ITEM, eightySixed: false, eightySixReason: null });

    const res = await api.owner.patch(`${R_URL}/menu/items/${ITEM_ID}/86`).send({
      eightySixed: false,
      reason: 'anything',
    });
    expect(res.status).toBe(200);
    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { id: ITEM_ID },
      data: { eightySixed: false, eightySixReason: null },
    });
  });
});

describe('DELETE /api/restaurant/:restaurantId/menu/items/:itemId', () => {
  it('deletes a menu item and its modifier links', async () => {
    prisma.menuItemModifierGroup.deleteMany.mockResolvedValue({ count: 1 });
    prisma.menuItem.delete.mockResolvedValue(MOCK_ITEM);

    const res = await api.owner.delete(`${R_URL}/menu/items/${ITEM_ID}`);
    expect(res.status).toBe(204);
    expect(prisma.menuItemModifierGroup.deleteMany).toHaveBeenCalledWith({ where: { menuItemId: ITEM_ID } });
  });
});

// ============ Modifier Groups ============

describe('GET /api/restaurant/:restaurantId/modifiers', () => {
  it('returns modifier groups with modifiers', async () => {
    prisma.modifierGroup.findMany.mockResolvedValue([{ ...MOCK_MODIFIER_GROUP, modifiers: [MOCK_MODIFIER] }]);

    const res = await api.owner.get(`${R_URL}/modifiers`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Size');
  });
});

describe('POST /api/restaurant/:restaurantId/modifiers', () => {
  it('creates a modifier group with inline modifiers', async () => {
    prisma.modifierGroup.aggregate.mockResolvedValue({ _max: { displayOrder: 0 } });
    prisma.modifierGroup.create.mockResolvedValue({ ...MOCK_MODIFIER_GROUP, modifiers: [MOCK_MODIFIER] });

    const res = await api.owner.post(`${R_URL}/modifiers`).send({
      name: 'Size',
      required: true,
      modifiers: [{ name: 'Large', priceAdjustment: 2.00 }],
    });
    expect(res.status).toBe(201);
    expect(prisma.modifierGroup.create).toHaveBeenCalled();
  });
});

describe('PATCH /api/restaurant/:restaurantId/modifiers/:groupId', () => {
  it('updates a modifier group', async () => {
    prisma.modifierGroup.update.mockResolvedValue({ ...MOCK_MODIFIER_GROUP, name: 'Temperature', modifiers: [] });

    const res = await api.owner.patch(`${R_URL}/modifiers/${GROUP_ID}`).send({ name: 'Temperature' });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/restaurant/:restaurantId/modifiers/:groupId', () => {
  it('deletes a modifier group and cleans up related records', async () => {
    prisma.modifier.deleteMany.mockResolvedValue({ count: 2 });
    prisma.menuItemModifierGroup.deleteMany.mockResolvedValue({ count: 1 });
    prisma.modifierGroup.delete.mockResolvedValue(MOCK_MODIFIER_GROUP);

    const res = await api.owner.delete(`${R_URL}/modifiers/${GROUP_ID}`);
    expect(res.status).toBe(204);
    expect(prisma.modifier.deleteMany).toHaveBeenCalledWith({ where: { modifierGroupId: GROUP_ID } });
    expect(prisma.menuItemModifierGroup.deleteMany).toHaveBeenCalledWith({ where: { modifierGroupId: GROUP_ID } });
  });
});

// ============ Individual Modifiers ============

describe('POST /api/restaurant/:restaurantId/modifiers/:groupId/options', () => {
  it('creates a modifier option', async () => {
    prisma.modifier.aggregate.mockResolvedValue({ _max: { displayOrder: 0 } });
    prisma.modifier.create.mockResolvedValue(MOCK_MODIFIER);

    const res = await api.owner.post(`${R_URL}/modifiers/${GROUP_ID}/options`).send({
      name: 'Large',
      priceAdjustment: 2.00,
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Large');
  });
});

describe('PATCH /api/restaurant/:restaurantId/modifiers/:groupId/options/:modifierId', () => {
  it('updates a modifier option', async () => {
    prisma.modifier.update.mockResolvedValue({ ...MOCK_MODIFIER, name: 'Extra Large' });

    const res = await api.owner.patch(`${R_URL}/modifiers/${GROUP_ID}/options/${MODIFIER_ID}`).send({
      name: 'Extra Large',
    });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/restaurant/:restaurantId/modifiers/:groupId/options/:modifierId', () => {
  it('deletes a modifier option', async () => {
    prisma.modifier.delete.mockResolvedValue(MOCK_MODIFIER);

    const res = await api.owner.delete(`${R_URL}/modifiers/${GROUP_ID}/options/${MODIFIER_ID}`);
    expect(res.status).toBe(204);
  });
});

// ============ Tables ============

describe('GET /api/restaurant/:restaurantId/tables', () => {
  it('returns active tables', async () => {
    prisma.restaurantTable.findMany.mockResolvedValue([MOCK_TABLE]);

    const res = await api.owner.get(`${R_URL}/tables`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].tableNumber).toBe('1');
  });
});

describe('POST /api/restaurant/:restaurantId/tables', () => {
  it('creates a table', async () => {
    prisma.restaurantTable.create.mockResolvedValue(MOCK_TABLE);

    const res = await api.owner.post(`${R_URL}/tables`).send({
      tableNumber: '1',
      tableName: 'Table 1',
      capacity: 4,
      section: 'Main',
    });
    expect(res.status).toBe(201);
    expect(prisma.restaurantTable.create).toHaveBeenCalled();
  });
});

describe('PATCH /api/restaurant/:restaurantId/tables/:tableId', () => {
  it('updates a table', async () => {
    prisma.restaurantTable.update.mockResolvedValue({ ...MOCK_TABLE, capacity: 6 });

    const res = await api.owner.patch(`${R_URL}/tables/${TABLE_ID}`).send({ capacity: 6 });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/restaurant/:restaurantId/tables/:tableId', () => {
  it('deletes a table', async () => {
    prisma.restaurantTable.delete.mockResolvedValue(MOCK_TABLE);

    const res = await api.owner.delete(`${R_URL}/tables/${TABLE_ID}`);
    expect(res.status).toBe(204);
  });
});

// ============ Reservations ============

describe('GET /api/restaurant/:restaurantId/reservations', () => {
  const url = `${R_URL}/reservations`;

  it('returns reservations', async () => {
    prisma.reservation.findMany.mockResolvedValue([MOCK_RESERVATION]);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('filters by status query param', async () => {
    prisma.reservation.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${url}?status=confirmed,seated`);
    expect(res.status).toBe(200);
    expect(prisma.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['confirmed', 'seated'] },
        }),
      }),
    );
  });

  it('filters by date query param', async () => {
    prisma.reservation.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${url}?date=2026-03-01`);
    expect(res.status).toBe(200);
    expect(prisma.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reservationTime: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
        }),
      }),
    );
  });
});

describe('POST /api/restaurant/:restaurantId/reservations', () => {
  const url = `${R_URL}/reservations`;

  it('creates a reservation with valid data', async () => {
    prisma.reservation.create.mockResolvedValue(MOCK_RESERVATION);

    const res = await api.owner.post(url).send({
      customerName: 'Jane Doe',
      customerPhone: '555-1234',
      partySize: 4,
      reservationTime: '2026-03-01T19:00:00Z',
    });
    expect(res.status).toBe(201);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await api.owner.post(url).send({ customerName: 'Jane' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('required');
  });
});

describe('GET /api/restaurant/:restaurantId/reservations/:reservationId', () => {
  it('returns reservation when found', async () => {
    prisma.reservation.findUnique.mockResolvedValue(MOCK_RESERVATION);

    const res = await api.owner.get(`${R_URL}/reservations/${RESERVATION_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.customerName).toBe('Jane Doe');
  });

  it('returns 404 when not found', async () => {
    prisma.reservation.findUnique.mockResolvedValue(null);

    const res = await api.owner.get(`${R_URL}/reservations/${RESERVATION_ID}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Reservation not found');
  });
});

describe('PATCH /api/restaurant/:restaurantId/reservations/:reservationId', () => {
  it('updates a reservation', async () => {
    prisma.reservation.update.mockResolvedValue({ ...MOCK_RESERVATION, status: 'seated' });

    const res = await api.owner.patch(`${R_URL}/reservations/${RESERVATION_ID}`).send({ status: 'seated' });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/restaurant/:restaurantId/reservations/:reservationId', () => {
  it('deletes a reservation', async () => {
    prisma.reservation.delete.mockResolvedValue(MOCK_RESERVATION);

    const res = await api.owner.delete(`${R_URL}/reservations/${RESERVATION_ID}`);
    expect(res.status).toBe(204);
  });
});

// ============ AI Endpoints ============

describe('POST /api/restaurant/:restaurantId/menu/items/:itemId/estimate-cost', () => {
  const url = `${R_URL}/menu/items/${ITEM_ID}/estimate-cost`;

  it('returns 404 when item not found', async () => {
    prisma.menuItem.findUnique.mockResolvedValue(null);
    prisma.restaurant.findUnique.mockResolvedValue(RESTAURANT);

    const res = await api.owner.post(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Menu item not found');
  });

  it('returns 500 when AI estimation fails', async () => {
    prisma.menuItem.findUnique.mockResolvedValue(MOCK_ITEM);
    prisma.restaurant.findUnique.mockResolvedValue(RESTAURANT);

    const res = await api.owner.post(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to estimate cost');
  });

  it('estimates cost and updates item', async () => {
    const { aiCostService } = await import('../services/ai-cost.service');
    (aiCostService.estimateCost as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      estimatedCost: 3.50,
      suggestedPrice: 9.99,
      profitMargin: 0.65,
      confidence: 0.8,
    });
    prisma.menuItem.findUnique.mockResolvedValue(MOCK_ITEM);
    prisma.restaurant.findUnique.mockResolvedValue(RESTAURANT);
    prisma.menuItem.update.mockResolvedValue({ ...MOCK_ITEM, aiEstimatedCost: 3.50 });

    const res = await api.owner.post(url);
    expect(res.status).toBe(200);
    expect(res.body.estimation.estimatedCost).toBe(3.50);
  });
});

describe('POST /api/restaurant/:restaurantId/menu/items/:itemId/generate-description', () => {
  const url = `${R_URL}/menu/items/${ITEM_ID}/generate-description`;

  it('returns 404 when item not found', async () => {
    prisma.menuItem.findUnique.mockResolvedValue(null);
    prisma.restaurant.findUnique.mockResolvedValue(RESTAURANT);

    const res = await api.owner.post(url);
    expect(res.status).toBe(404);
  });

  it('generates description and updates item', async () => {
    const { aiCostService } = await import('../services/ai-cost.service');
    (aiCostService.generateEnglishDescription as ReturnType<typeof vi.fn>).mockResolvedValueOnce('Delicious crispy spring rolls');
    prisma.menuItem.findUnique.mockResolvedValue(MOCK_ITEM);
    prisma.restaurant.findUnique.mockResolvedValue(RESTAURANT);
    prisma.menuItem.update.mockResolvedValue({ ...MOCK_ITEM, descriptionEn: 'Delicious crispy spring rolls' });

    const res = await api.owner.post(url);
    expect(res.status).toBe(200);
    expect(res.body.descriptionEn).toBe('Delicious crispy spring rolls');
  });
});

describe('POST /api/restaurant/:restaurantId/menu/estimate-all-costs', () => {
  it('returns count of processed and estimated items', async () => {
    prisma.menuItem.findMany.mockResolvedValue([]);
    prisma.restaurant.findUnique.mockResolvedValue(RESTAURANT);

    const res = await api.owner.post(`${R_URL}/menu/estimate-all-costs`);
    expect(res.status).toBe(200);
    expect(res.body.itemsProcessed).toBe(0);
    expect(res.body.itemsEstimated).toBe(0);
  });
});

describe('POST /api/restaurant/:restaurantId/menu/generate-all-descriptions', () => {
  it('returns count of processed and generated items', async () => {
    prisma.menuItem.findMany.mockResolvedValue([]);
    prisma.restaurant.findUnique.mockResolvedValue(RESTAURANT);

    const res = await api.owner.post(`${R_URL}/menu/generate-all-descriptions`);
    expect(res.status).toBe(200);
    expect(res.body.itemsProcessed).toBe(0);
    expect(res.body.itemsGenerated).toBe(0);
  });
});

// ============ Orders ============

describe('GET /api/restaurant/:restaurantId/orders', () => {
  const url = `${R_URL}/orders`;

  it('returns 401 without auth token', async () => {
    const res = await api.anonymous().get(url);
    expect(res.status).toBe(401);
  });

  it('returns orders for restaurant', async () => {
    prisma.order.findMany.mockResolvedValue([MOCK_ORDER]);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('filters by status query param', async () => {
    prisma.order.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${url}?status=pending,confirmed`);
    expect(res.status).toBe(200);
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['pending', 'confirmed'] },
        }),
      }),
    );
  });

  it('applies limit query param', async () => {
    prisma.order.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${url}?limit=10`);
    expect(res.status).toBe(200);
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });
});

describe('GET /api/restaurant/:restaurantId/orders/:orderId', () => {
  it('returns order when found', async () => {
    prisma.order.findUnique.mockResolvedValue(MOCK_ORDER);

    const res = await api.owner.get(`${R_URL}/orders/${ORDER_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ORDER_ID);
  });

  it('returns 404 when not found', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    const res = await api.owner.get(`${R_URL}/orders/${ORDER_ID}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Order not found');
  });
});

describe('POST /api/restaurant/:restaurantId/orders', () => {
  const url = `${R_URL}/orders`;

  const validOrderBody = {
    orderType: 'dine-in',
    orderSource: 'online',
    items: [{
      menuItemId: ITEM_ID,
      quantity: 2,
      modifiers: [],
    }],
  };

  it('returns 400 for POS order without sourceDeviceId', async () => {
    const res = await api.owner.post(url).send({
      ...validOrderBody,
      orderSource: 'pos',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('sourceDeviceId is required for POS orders');
  });

  it('returns 404 when restaurant not found', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);

    const res = await api.owner.post(url).send(validOrderBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Restaurant not found');
  });

  it('returns 400 when menu item not found', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(RESTAURANT);
    prisma.menuItem.findUnique.mockResolvedValue(null);

    const res = await api.owner.post(url).send(validOrderBody);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not found');
  });

  it('returns 400 when item is 86d', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(RESTAURANT);
    prisma.menuItem.findUnique.mockResolvedValue({ ...MOCK_ITEM, eightySixed: true });

    const res = await api.owner.post(url).send(validOrderBody);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('unavailable');
  });

  it('creates an order with valid data', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(RESTAURANT);
    prisma.menuItem.findUnique.mockResolvedValue(MOCK_ITEM);
    prisma.order.create.mockResolvedValue({
      ...MOCK_ORDER,
      id: 'new-order',
      orderNumber: 'ORD-TEST-002',
      sourceDeviceId: null,
    });
    prisma.order.findUnique.mockResolvedValue({
      ...MOCK_ORDER,
      id: 'new-order',
      orderNumber: 'ORD-TEST-002',
      sourceDeviceId: null,
    });

    const res = await api.owner.post(url).send(validOrderBody);
    expect(res.status).toBe(201);
    expect(prisma.order.create).toHaveBeenCalled();
  });
});

// ============ Order Status ============

describe('PATCH /api/restaurant/:restaurantId/orders/:orderId/status', () => {
  const url = `${R_URL}/orders/${ORDER_ID}/status`;

  it('updates order status', async () => {
    prisma.order.findUnique.mockResolvedValue(MOCK_ORDER);

    const res = await api.owner.patch(url).send({ status: 'confirmed' });
    expect(res.status).toBe(200);
  });

  it('returns 400 when status transition is invalid', async () => {
    const { updateOrderStatus } = await import('../services/order-status.service');
    (updateOrderStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: false, error: 'Invalid transition' });

    const res = await api.owner.patch(url).send({ status: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid transition');
  });
});

// ============ Fire Course ============

describe('PATCH /api/restaurant/:restaurantId/orders/:orderId/fire-course', () => {
  const url = `${R_URL}/orders/${ORDER_ID}/fire-course`;

  it('returns 400 when courseGuid is missing', async () => {
    const res = await api.owner.patch(url).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('courseGuid is required');
  });

  it('returns 404 when order not found', async () => {
    prisma.order.findFirst.mockResolvedValue(null);

    const res = await api.owner.patch(url).send({ courseGuid: 'course-1' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Order not found');
  });

  it('returns 404 when course not found on order', async () => {
    prisma.order.findFirst.mockResolvedValue(MOCK_ORDER);
    prisma.orderItem.updateMany.mockResolvedValue({ count: 0 });

    const res = await api.owner.patch(url).send({ courseGuid: 'nonexistent-course' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Course not found on order');
  });

  it('fires a course successfully', async () => {
    prisma.order.findFirst.mockResolvedValue(MOCK_ORDER);
    prisma.orderItem.updateMany.mockResolvedValue({ count: 2 });
    prisma.order.findUnique.mockResolvedValue(MOCK_ORDER);

    const res = await api.owner.patch(url).send({ courseGuid: 'course-1' });
    expect(res.status).toBe(200);
  });
});

// ============ Fire Item ============

describe('PATCH /api/restaurant/:restaurantId/orders/:orderId/fire-item', () => {
  const url = `${R_URL}/orders/${ORDER_ID}/fire-item`;

  it('returns 400 when selectionGuid is missing', async () => {
    const res = await api.owner.patch(url).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('selectionGuid is required');
  });

  it('returns 404 when order not found', async () => {
    prisma.order.findFirst.mockResolvedValue(null);

    const res = await api.owner.patch(url).send({ selectionGuid: 'item-1' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Order not found');
  });

  it('returns 404 when item not found on order', async () => {
    prisma.order.findFirst.mockResolvedValue(MOCK_ORDER);
    prisma.orderItem.findFirst.mockResolvedValue(null);

    const res = await api.owner.patch(url).send({ selectionGuid: 'nonexistent' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Order item not found');
  });

  it('fires an item successfully', async () => {
    prisma.order.findFirst.mockResolvedValue(MOCK_ORDER);
    prisma.orderItem.findFirst.mockResolvedValue({ id: ORDER_ITEM_ID, orderId: ORDER_ID, courseGuid: null });
    prisma.orderItem.update.mockResolvedValue({ id: ORDER_ITEM_ID, fulfillmentStatus: 'ON_THE_FLY' });
    prisma.order.findUnique.mockResolvedValue(MOCK_ORDER);

    const res = await api.owner.patch(url).send({ selectionGuid: ORDER_ITEM_ID });
    expect(res.status).toBe(200);
  });
});

// ============ Course Pacing Metrics ============

describe('GET /api/restaurant/:restaurantId/course-pacing/metrics', () => {
  it('returns pacing metrics', async () => {
    const res = await api.owner.get(`${R_URL}/course-pacing/metrics`);
    expect(res.status).toBe(200);
    expect(res.body.avgCourseDuration).toBe(15);
  });
});

// ============ Throttling ============

describe('GET /api/restaurant/:restaurantId/throttling/status', () => {
  it('returns throttling status', async () => {
    const res = await api.owner.get(`${R_URL}/throttling/status`);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
  });
});

describe('POST /api/restaurant/:restaurantId/orders/:orderId/throttle/hold', () => {
  it('holds an order', async () => {
    prisma.order.findUnique.mockResolvedValue(MOCK_ORDER);

    const res = await api.owner.post(`${R_URL}/orders/${ORDER_ID}/throttle/hold`);
    expect(res.status).toBe(200);
  });

  it('returns 404 when order cannot be held', async () => {
    const { orderThrottlingService } = await import('../services/order-throttling.service');
    (orderThrottlingService.holdOrderManually as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

    const res = await api.owner.post(`${R_URL}/orders/${ORDER_ID}/throttle/hold`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/restaurant/:restaurantId/orders/:orderId/throttle/release', () => {
  it('releases an order', async () => {
    prisma.order.findUnique.mockResolvedValue(MOCK_ORDER);

    const res = await api.owner.post(`${R_URL}/orders/${ORDER_ID}/throttle/release`);
    expect(res.status).toBe(200);
  });

  it('returns 404 when order not in held state', async () => {
    const { orderThrottlingService } = await import('../services/order-throttling.service');
    (orderThrottlingService.releaseOrderManually as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

    const res = await api.owner.post(`${R_URL}/orders/${ORDER_ID}/throttle/release`);
    expect(res.status).toBe(404);
  });
});

// ============ Order Status History ============

describe('GET /api/restaurant/:restaurantId/orders/:orderId/history', () => {
  it('returns order status history', async () => {
    const res = await api.owner.get(`${R_URL}/orders/${ORDER_ID}/history`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ============ Reprint ============

describe('POST /api/restaurant/:restaurantId/orders/:orderId/reprint', () => {
  it('queues a print job', async () => {
    const res = await api.owner.post(`${R_URL}/orders/${ORDER_ID}/reprint`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.jobId).toBe('job-1');
  });
});

// ============ KDS Item Status ============

describe('PATCH /api/restaurant/:restaurantId/orders/:orderId/items/:itemId/status', () => {
  const url = `${R_URL}/orders/${ORDER_ID}/items/${ORDER_ITEM_ID}/status`;

  it('updates item status to preparing', async () => {
    prisma.orderItem.update.mockResolvedValue({
      id: ORDER_ITEM_ID,
      status: 'preparing',
      courseGuid: null,
      modifiers: [],
    });
    prisma.order.findFirst.mockResolvedValue(MOCK_ORDER);

    const res = await api.owner.patch(url).send({ status: 'preparing' });
    expect(res.status).toBe(200);
    expect(prisma.orderItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'preparing',
          sentToKitchenAt: expect.any(Date),
          fulfillmentStatus: 'SENT',
        }),
      }),
    );
  });

  it('updates item status to completed', async () => {
    prisma.orderItem.update.mockResolvedValue({
      id: ORDER_ITEM_ID,
      status: 'completed',
      courseGuid: null,
      modifiers: [],
    });
    prisma.order.findFirst.mockResolvedValue(MOCK_ORDER);

    const res = await api.owner.patch(url).send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect(prisma.orderItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed',
          completedAt: expect.any(Date),
          fulfillmentStatus: 'SENT',
        }),
      }),
    );
  });
});

describe('PATCH /api/restaurant/:restaurantId/orders/:orderId/items/ready', () => {
  const url = `${R_URL}/orders/${ORDER_ID}/items/ready`;

  it('returns 400 when itemIds is missing', async () => {
    const res = await api.owner.patch(url).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('itemIds array is required');
  });

  it('returns 400 when itemIds is empty', async () => {
    const res = await api.owner.patch(url).send({ itemIds: [] });
    expect(res.status).toBe(400);
  });

  it('marks items ready and checks if all complete', async () => {
    prisma.orderItem.updateMany.mockResolvedValue({ count: 2 });
    prisma.orderItem.count.mockResolvedValue(0); // all completed
    prisma.order.update.mockResolvedValue({ ...MOCK_ORDER, status: 'ready' });
    prisma.orderItem.findMany.mockResolvedValue([
      { id: 'oi-1', menuItemName: 'Burger', status: 'completed' },
      { id: 'oi-2', menuItemName: 'Fries', status: 'completed' },
    ]);
    prisma.order.findFirst.mockResolvedValue(MOCK_ORDER);

    const res = await api.owner.patch(url).send({
      itemIds: ['oi-1', 'oi-2'],
      stationId: 'station-1',
      stationName: 'Grill',
    });
    expect(res.status).toBe(200);
    expect(res.body.allReady).toBe(true);
    expect(res.body.items).toHaveLength(2);
  });

  it('does not auto-transition when items remain', async () => {
    prisma.orderItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.orderItem.count.mockResolvedValue(2); // 2 remaining
    prisma.orderItem.findMany.mockResolvedValue([{ id: 'oi-1', menuItemName: 'Burger', status: 'completed' }]);
    prisma.order.findFirst.mockResolvedValue(MOCK_ORDER);

    const res = await api.owner.patch(url).send({ itemIds: ['oi-1'] });
    expect(res.status).toBe(200);
    expect(res.body.allReady).toBe(false);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });
});

// ============ Delete Order ============

describe('DELETE /api/restaurant/:restaurantId/orders/:orderId', () => {
  it('deletes an order and its items/modifiers', async () => {
    prisma.orderItem.findMany.mockResolvedValue([{ id: 'oi-1' }, { id: 'oi-2' }]);
    prisma.orderItemModifier.deleteMany.mockResolvedValue({ count: 1 });
    prisma.orderItem.deleteMany.mockResolvedValue({ count: 2 });
    prisma.order.delete.mockResolvedValue(MOCK_ORDER);

    const res = await api.owner.delete(`${R_URL}/orders/${ORDER_ID}`);
    expect(res.status).toBe(204);
    expect(prisma.orderItemModifier.deleteMany).toHaveBeenCalledTimes(2);
  });
});

// ============ Payments ============

describe('POST /api/restaurant/:restaurantId/orders/:orderId/payment-intent', () => {
  const url = `${R_URL}/orders/${ORDER_ID}/payment-intent`;

  it('returns 404 when order not found', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    const res = await api.owner.post(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Order not found');
  });

  it('creates a Stripe payment intent', async () => {
    prisma.order.findUnique.mockResolvedValue(MOCK_ORDER);

    const res = await api.owner.post(url);
    expect(res.status).toBe(200);
    expect(res.body.clientSecret).toBe('pi_test_secret');
    expect(res.body.paymentIntentId).toBe('pi_test');
  });
});

describe('POST /api/restaurant/:restaurantId/orders/:orderId/paypal-create', () => {
  const url = `${R_URL}/orders/${ORDER_ID}/paypal-create`;

  it('returns 404 when order not found', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    const res = await api.owner.post(url);
    expect(res.status).toBe(404);
  });

  it('creates a PayPal order', async () => {
    prisma.order.findUnique.mockResolvedValue(MOCK_ORDER);

    const res = await api.owner.post(url);
    expect(res.status).toBe(200);
    expect(res.body.paypalOrderId).toBe('PP-ORDER-123');
  });
});

describe('POST /api/restaurant/:restaurantId/orders/:orderId/paypal-capture', () => {
  const url = `${R_URL}/orders/${ORDER_ID}/paypal-capture`;

  it('returns 404 when order not found', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    const res = await api.owner.post(url);
    expect(res.status).toBe(404);
  });

  it('returns 400 when no PayPal order exists', async () => {
    prisma.order.findUnique.mockResolvedValue({ ...MOCK_ORDER, paypalOrderId: null });

    const res = await api.owner.post(url);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No PayPal order found for this order');
  });

  it('captures a PayPal order', async () => {
    prisma.order.findUnique
      .mockResolvedValueOnce({ ...MOCK_ORDER, paypalOrderId: 'PP-ORDER-123' })
      .mockResolvedValueOnce({ ...MOCK_ORDER, paypalOrderId: 'PP-ORDER-123' });

    const res = await api.owner.post(url);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/restaurant/:restaurantId/orders/:orderId/payment-status', () => {
  const url = `${R_URL}/orders/${ORDER_ID}/payment-status`;

  it('returns 404 when order not found', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    const res = await api.owner.get(url);
    expect(res.status).toBe(404);
  });

  it('returns Stripe payment status', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: ORDER_ID,
      orderNumber: 'ORD-TEST-001',
      paymentStatus: 'paid',
      paymentMethod: 'stripe',
      stripePaymentIntentId: 'pi_test_123',
      paypalOrderId: null,
      paypalCaptureId: null,
      total: 27.80,
    });

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body.paymentStatus).toBe('paid');
    expect(res.body.processorData.processor).toBe('stripe');
    expect(res.body.processorData.status).toBe('succeeded');
  });

  it('returns PayPal payment status', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: ORDER_ID,
      orderNumber: 'ORD-TEST-001',
      paymentStatus: 'paid',
      paymentMethod: 'paypal',
      stripePaymentIntentId: null,
      paypalOrderId: 'PP-ORDER-123',
      paypalCaptureId: null,
      total: 27.80,
    });

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body.processorData.processor).toBe('paypal');
    expect(res.body.processorData.status).toBe('COMPLETED');
  });
});

describe('POST /api/restaurant/:restaurantId/orders/:orderId/cancel-payment', () => {
  const url = `${R_URL}/orders/${ORDER_ID}/cancel-payment`;

  it('returns 404 when order not found', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    const res = await api.owner.post(url);
    expect(res.status).toBe(404);
  });

  it('returns 400 when no payment exists', async () => {
    prisma.order.findUnique.mockResolvedValue({
      ...MOCK_ORDER,
      stripePaymentIntentId: null,
      paypalOrderId: null,
    });

    const res = await api.owner.post(url);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No payment found for this order');
  });

  it('cancels a Stripe payment', async () => {
    prisma.order.findUnique.mockResolvedValue(MOCK_ORDER);
    prisma.order.update.mockResolvedValue({ ...MOCK_ORDER, paymentStatus: 'cancelled' });

    const res = await api.owner.post(url);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/restaurant/:restaurantId/orders/:orderId/refund', () => {
  const url = `${R_URL}/orders/${ORDER_ID}/refund`;

  it('returns 404 when order not found', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    const res = await api.owner.post(url).send({ amount: 10 });
    expect(res.status).toBe(404);
  });

  it('returns 400 when order has not been paid', async () => {
    prisma.order.findUnique.mockResolvedValue({ ...MOCK_ORDER, paymentStatus: 'pending' });

    const res = await api.owner.post(url).send({ amount: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Order has not been paid');
  });

  it('returns 400 when no refundable payment exists', async () => {
    prisma.order.findUnique.mockResolvedValue({
      ...MOCK_ORDER,
      stripePaymentIntentId: null,
      paypalCaptureId: null,
    });

    const res = await api.owner.post(url).send({ amount: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No refundable payment found for this order');
  });

  it('processes a Stripe full refund', async () => {
    prisma.order.findUnique.mockResolvedValue(MOCK_ORDER);
    prisma.order.update.mockResolvedValue({ ...MOCK_ORDER, paymentStatus: 'refunded' });

    const res = await api.owner.post(url).send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.refundId).toBe('re_test');
  });

  it('processes a PayPal refund', async () => {
    prisma.order.findUnique.mockResolvedValue({
      ...MOCK_ORDER,
      stripePaymentIntentId: null,
      paypalCaptureId: 'PP-CAPTURE-123',
    });
    prisma.order.update.mockResolvedValue({ ...MOCK_ORDER, paymentStatus: 'partial_refund' });

    const res = await api.owner.post(url).send({ amount: 10 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.refundId).toBe('PP-REFUND-123');
  });
});

// ============ Tax Lookup ============

describe('GET /api/restaurant/tax-rate/:zipCode', () => {
  it('returns tax rate for zip code', async () => {
    const res = await api.owner.get(`${BASE_URL}/tax-rate/33301`);
    expect(res.status).toBe(200);
    expect(res.body.rate).toBe(0.07);
    expect(res.body.source).toBe('mock');
  });

  it('accepts state query param', async () => {
    const res = await api.owner.get(`${BASE_URL}/tax-rate/33301?state=FL`);
    expect(res.status).toBe(200);
  });
});
