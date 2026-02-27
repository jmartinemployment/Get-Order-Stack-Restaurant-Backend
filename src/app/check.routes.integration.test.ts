import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../test/request-helper';
import { getPrismaMock, resetPrismaMock } from '../test/prisma-mock';
import { RESTAURANT_ID, ORDER, CHECK, CHECK_ITEM, RESTAURANT } from '../test/fixtures';

vi.mock('../services/auth.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/auth.service')>();
  return {
    ...actual,
    authService: {
      ...actual.authService,
      validateSession: vi.fn().mockResolvedValue(true),
      verifyToken: actual.authService.verifyToken,
      // verifyStaffPin is used by validateManagerPin
      verifyStaffPin: vi.fn().mockResolvedValue({ success: false }),
    },
  };
});

const prisma = getPrismaMock();

beforeEach(() => {
  resetPrismaMock();
  // Default: restaurant with taxRate for recalculations
  prisma.restaurant.findUnique.mockResolvedValue(RESTAURANT);
});

const BASE_URL = `/api/restaurant/${RESTAURANT_ID}/orders/${ORDER.id}`;

// Order with includes for fetchAndBroadcast
const ORDER_WITH_INCLUDES = {
  ...ORDER,
  restaurantId: RESTAURANT_ID,
  sourceDeviceId: null,
  orderItems: [],
  checks: [],
  customer: null,
  table: null,
  marketplaceOrder: null,
};

const CHECK_WITH_INCLUDES = {
  ...CHECK,
  items: [],
  discounts: [],
  voidedItems: [],
};

// ============ POST /:orderId/checks — Create check ============

describe('POST /checks', () => {
  const url = `${BASE_URL}/checks`;

  it('returns 401 without auth', async () => {
    const res = await api.anonymous().post(url);
    expect(res.status).toBe(401);
  });

  it('creates an empty check', async () => {
    prisma.order.findFirst.mockResolvedValue(ORDER);
    prisma.orderCheck.count.mockResolvedValue(0);
    prisma.orderCheck.create.mockResolvedValue(CHECK_WITH_INCLUDES);
    prisma.order.findUnique.mockResolvedValue(ORDER_WITH_INCLUDES);

    const res = await api.owner.post(url);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(CHECK.id);
  });

  it('returns 404 when order does not exist', async () => {
    prisma.order.findFirst.mockResolvedValue(null);

    const res = await api.owner.post(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Order not found');
  });

  it('returns 500 on database error', async () => {
    prisma.order.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to create check');
  });
});

// ============ POST /:orderId/checks/:checkGuid/items — Add item ============

describe('POST /checks/:checkGuid/items', () => {
  const url = `${BASE_URL}/checks/${CHECK.id}/items`;

  const validItem = {
    menuItemName: 'Burger',
    quantity: 1,
    unitPrice: 12.99,
    modifiers: [],
  };

  beforeEach(() => {
    prisma.orderCheck.findFirst.mockResolvedValue(CHECK);
    prisma.checkItem.create.mockResolvedValue({
      ...CHECK_ITEM,
      modifiers: [],
    });
    prisma.orderItem.create.mockResolvedValue({});
    // For recalculateCheck
    prisma.orderCheck.findUnique.mockResolvedValue({ ...CHECK, items: [], discounts: [] });
    prisma.orderCheck.update.mockResolvedValue(CHECK);
    // For recalculateOrderTotals
    prisma.orderCheck.findMany.mockResolvedValue([CHECK]);
    prisma.order.update.mockResolvedValue(ORDER);
    // For fetchAndBroadcast
    prisma.order.findUnique.mockResolvedValue(ORDER_WITH_INCLUDES);
  });

  it('returns 401 without auth', async () => {
    const res = await api.anonymous().post(url).send(validItem);
    expect(res.status).toBe(401);
  });

  it('adds an item to a check', async () => {
    const res = await api.owner.post(url).send(validItem);
    expect(res.status).toBe(201);
  });

  it('adds an item with modifiers', async () => {
    const res = await api.owner.post(url).send({
      ...validItem,
      modifiers: [
        { modifierName: 'Extra Cheese', priceAdjustment: 1.50 },
      ],
    });
    expect(res.status).toBe(201);
  });

  it('returns 400 for missing menuItemName', async () => {
    const res = await api.owner.post(url).send({ quantity: 1, unitPrice: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid item data');
  });

  it('returns 400 for zero quantity', async () => {
    const res = await api.owner.post(url).send({ menuItemName: 'Burger', quantity: 0, unitPrice: 10 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for negative unitPrice', async () => {
    const res = await api.owner.post(url).send({ menuItemName: 'Burger', quantity: 1, unitPrice: -5 });
    expect(res.status).toBe(400);
  });

  it('returns 404 when check does not exist', async () => {
    prisma.orderCheck.findFirst.mockResolvedValue(null);

    const res = await api.owner.post(url).send(validItem);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Check not found');
  });

  it('returns 500 on database error', async () => {
    prisma.orderCheck.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(url).send(validItem);
    expect(res.status).toBe(500);
  });
});

// ============ PATCH /:orderId/checks/:checkGuid/split — Split check ============

describe('PATCH /checks/:checkGuid/split', () => {
  const url = `${BASE_URL}/checks/${CHECK.id}/split`;

  beforeEach(() => {
    prisma.orderCheck.findFirst.mockResolvedValue({
      ...CHECK,
      items: [
        { ...CHECK_ITEM, id: 'item-1', seatNumber: 1 },
        { ...CHECK_ITEM, id: 'item-2', seatNumber: 2, menuItemName: 'Fries' },
      ],
    });
    prisma.orderCheck.count.mockResolvedValue(1);
    prisma.orderCheck.create.mockResolvedValue({ ...CHECK, id: 'check-2', displayNumber: 2 });
    prisma.checkItem.updateMany.mockResolvedValue({ count: 1 });
    // For recalculations
    prisma.orderCheck.findMany.mockResolvedValue([CHECK]);
    prisma.orderCheck.findUnique.mockResolvedValue({ ...CHECK, items: [], discounts: [] });
    prisma.orderCheck.update.mockResolvedValue(CHECK);
    prisma.order.update.mockResolvedValue(ORDER);
    prisma.order.findUnique.mockResolvedValue(ORDER_WITH_INCLUDES);
  });

  it('splits by item', async () => {
    const res = await api.owner.patch(url).send({
      mode: 'by_item',
      itemGuids: ['item-1'],
    });
    expect(res.status).toBe(200);
  });

  it('splits by equal', async () => {
    const res = await api.owner.patch(url).send({
      mode: 'by_equal',
      numberOfWays: 2,
    });
    expect(res.status).toBe(200);
  });

  it('splits by seat', async () => {
    const res = await api.owner.patch(url).send({
      mode: 'by_seat',
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid split mode', async () => {
    const res = await api.owner.patch(url).send({
      mode: 'by_weight',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for by_item with no itemGuids', async () => {
    const res = await api.owner.patch(url).send({
      mode: 'by_item',
      itemGuids: [],
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for by_equal with less than 2', async () => {
    const res = await api.owner.patch(url).send({
      mode: 'by_equal',
      numberOfWays: 1,
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when check does not exist', async () => {
    prisma.orderCheck.findFirst.mockResolvedValue(null);

    const res = await api.owner.patch(url).send({
      mode: 'by_item',
      itemGuids: ['item-1'],
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Check not found');
  });

  it('returns 500 on database error', async () => {
    prisma.orderCheck.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.patch(url).send({ mode: 'by_seat' });
    expect(res.status).toBe(500);
  });
});

// ============ POST /:orderId/checks/:checkGuid/merge — Merge checks ============

describe('POST /checks/:checkGuid/merge', () => {
  const url = `${BASE_URL}/checks/${CHECK.id}/merge`;

  beforeEach(() => {
    prisma.checkItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.checkDiscount.updateMany.mockResolvedValue({ count: 0 });
    prisma.checkVoidedItem.updateMany.mockResolvedValue({ count: 0 });
    prisma.orderCheck.deleteMany.mockResolvedValue({ count: 1 });
    // For recalculations
    prisma.orderCheck.findUnique.mockResolvedValue({ ...CHECK, items: [], discounts: [] });
    prisma.orderCheck.update.mockResolvedValue(CHECK);
    prisma.orderCheck.findMany.mockResolvedValue([CHECK]);
    prisma.order.update.mockResolvedValue(ORDER);
    prisma.order.findUnique.mockResolvedValue(ORDER_WITH_INCLUDES);
  });

  it('merges checks', async () => {
    const res = await api.owner.post(url).send({
      checkGuids: [CHECK.id, 'check-2'],
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 for less than 2 checkGuids', async () => {
    const res = await api.owner.post(url).send({
      checkGuids: [CHECK.id],
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when all checkGuids are the target', async () => {
    const res = await api.owner.post(url).send({
      checkGuids: [CHECK.id, CHECK.id],
    });
    // The filter removes duplicates of the target, leaving 0 source IDs
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Must include at least one check');
  });

  it('returns 500 on database error', async () => {
    prisma.checkItem.updateMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(url).send({
      checkGuids: [CHECK.id, 'check-2'],
    });
    expect(res.status).toBe(500);
  });
});

// ============ POST /:orderId/checks/:checkGuid/transfer — Transfer check ============

describe('POST /checks/:checkGuid/transfer', () => {
  const url = `${BASE_URL}/checks/${CHECK.id}/transfer`;
  const targetTableId = '11111111-1111-1111-8111-111111111111';

  beforeEach(() => {
    prisma.restaurantTable.findFirst.mockResolvedValue({
      id: targetTableId,
      restaurantId: RESTAURANT_ID,
      name: 'Table 5',
    });
    prisma.order.findFirst.mockResolvedValue(null); // No existing order on target table
    prisma.order.findUnique.mockResolvedValue(ORDER_WITH_INCLUDES);
    prisma.order.create.mockResolvedValue({ ...ORDER, id: 'new-order-id', tableId: targetTableId });
    prisma.orderCheck.update.mockResolvedValue(CHECK);
    prisma.checkItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.checkDiscount.updateMany.mockResolvedValue({ count: 0 });
    prisma.checkVoidedItem.updateMany.mockResolvedValue({ count: 0 });
    // For recalculations
    prisma.orderCheck.findUnique.mockResolvedValue({ ...CHECK, items: [], discounts: [] });
    prisma.orderCheck.findMany.mockResolvedValue([CHECK]);
    prisma.order.update.mockResolvedValue(ORDER);
  });

  it('transfers a check to another table', async () => {
    const res = await api.owner.post(url).send({ targetTableId });
    expect(res.status).toBe(200);
    expect(res.body.sourceOrderId).toBe(ORDER.id);
  });

  it('returns 400 for missing targetTableId', async () => {
    const res = await api.owner.post(url).send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when target table does not exist', async () => {
    prisma.restaurantTable.findFirst.mockResolvedValue(null);

    const res = await api.owner.post(url).send({ targetTableId });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Target table not found');
  });

  it('returns 500 on database error', async () => {
    prisma.restaurantTable.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(url).send({ targetTableId });
    expect(res.status).toBe(500);
  });
});

// ============ PATCH /:orderId/checks/:checkGuid/items/:itemGuid/void — Void item ============

describe('PATCH /checks/:checkGuid/items/:itemGuid/void', () => {
  const url = `${BASE_URL}/checks/${CHECK.id}/items/${CHECK_ITEM.id}/void`;

  const validBody = {
    reason: 'Customer changed mind',
    voidedBy: 'Staff User',
  };

  beforeEach(() => {
    prisma.checkItem.findFirst.mockResolvedValue(CHECK_ITEM);
    prisma.checkVoidedItem.create.mockResolvedValue({});
    prisma.checkItemModifier.deleteMany.mockResolvedValue({ count: 0 });
    prisma.checkItem.delete.mockResolvedValue(CHECK_ITEM);
    // For recalculations
    prisma.orderCheck.findUnique.mockResolvedValue({ ...CHECK, items: [], discounts: [] });
    prisma.orderCheck.update.mockResolvedValue(CHECK);
    prisma.orderCheck.findMany.mockResolvedValue([CHECK]);
    prisma.order.update.mockResolvedValue(ORDER);
    prisma.order.findUnique.mockResolvedValue(ORDER_WITH_INCLUDES);
  });

  it('voids an item', async () => {
    const res = await api.owner.patch(url).send(validBody);
    expect(res.status).toBe(200);
  });

  it('returns 400 for missing reason', async () => {
    const res = await api.owner.patch(url).send({ voidedBy: 'Staff' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing voidedBy', async () => {
    const res = await api.owner.patch(url).send({ reason: 'No reason' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when item does not exist', async () => {
    prisma.checkItem.findFirst.mockResolvedValue(null);

    const res = await api.owner.patch(url).send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Item not found');
  });

  it('returns 403 for invalid manager PIN', async () => {
    // authService.verifyStaffPin already returns { success: false } by default
    const res = await api.owner.patch(url).send({
      ...validBody,
      managerPin: '9999',
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Invalid manager PIN');
  });

  it('returns 500 on database error', async () => {
    prisma.checkItem.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.patch(url).send(validBody);
    expect(res.status).toBe(500);
  });
});

// ============ PATCH /:orderId/checks/:checkGuid/items/:itemGuid/comp — Comp item ============

describe('PATCH /checks/:checkGuid/items/:itemGuid/comp', () => {
  const url = `${BASE_URL}/checks/${CHECK.id}/items/${CHECK_ITEM.id}/comp`;

  const validBody = {
    reason: 'VIP customer',
    compBy: 'Manager User',
  };

  beforeEach(() => {
    prisma.checkItem.findFirst.mockResolvedValue(CHECK_ITEM);
    prisma.checkItem.update.mockResolvedValue({ ...CHECK_ITEM, isComped: true });
    // For recalculations
    prisma.orderCheck.findUnique.mockResolvedValue({ ...CHECK, items: [], discounts: [] });
    prisma.orderCheck.update.mockResolvedValue(CHECK);
    prisma.orderCheck.findMany.mockResolvedValue([CHECK]);
    prisma.order.update.mockResolvedValue(ORDER);
    prisma.order.findUnique.mockResolvedValue(ORDER_WITH_INCLUDES);
  });

  it('comps an item', async () => {
    const res = await api.owner.patch(url).send(validBody);
    expect(res.status).toBe(200);
  });

  it('returns 400 for missing reason', async () => {
    const res = await api.owner.patch(url).send({ compBy: 'Manager' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing compBy', async () => {
    const res = await api.owner.patch(url).send({ reason: 'VIP' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when item does not exist', async () => {
    prisma.checkItem.findFirst.mockResolvedValue(null);

    const res = await api.owner.patch(url).send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Item not found');
  });

  it('returns 403 for invalid manager PIN', async () => {
    const res = await api.owner.patch(url).send({
      ...validBody,
      managerPin: '9999',
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Invalid manager PIN');
  });

  it('returns 500 on database error', async () => {
    prisma.checkItem.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.patch(url).send(validBody);
    expect(res.status).toBe(500);
  });
});

// ============ POST /:orderId/checks/:checkGuid/discount — Apply discount ============

describe('POST /checks/:checkGuid/discount', () => {
  const url = `${BASE_URL}/checks/${CHECK.id}/discount`;

  const validBody = {
    type: 'percentage',
    value: 10,
    reason: 'Loyalty discount',
    appliedBy: 'Staff User',
  };

  beforeEach(() => {
    prisma.orderCheck.findFirst.mockResolvedValue(CHECK);
    prisma.checkDiscount.create.mockResolvedValue({});
    // For recalculations
    prisma.orderCheck.findUnique.mockResolvedValue({ ...CHECK, items: [], discounts: [] });
    prisma.orderCheck.update.mockResolvedValue(CHECK);
    prisma.orderCheck.findMany.mockResolvedValue([CHECK]);
    prisma.order.update.mockResolvedValue(ORDER);
    prisma.order.findUnique.mockResolvedValue(ORDER_WITH_INCLUDES);
  });

  it('applies a percentage discount', async () => {
    const res = await api.owner.post(url).send(validBody);
    expect(res.status).toBe(200);
  });

  it('applies a flat discount', async () => {
    const res = await api.owner.post(url).send({
      ...validBody,
      type: 'flat',
      value: 5,
    });
    expect(res.status).toBe(200);
  });

  it('applies a comp discount', async () => {
    const res = await api.owner.post(url).send({
      ...validBody,
      type: 'comp',
      value: 25.98,
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid discount type', async () => {
    const res = await api.owner.post(url).send({
      ...validBody,
      type: 'bogo',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing reason', async () => {
    const res = await api.owner.post(url).send({
      type: 'percentage',
      value: 10,
      appliedBy: 'Staff',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing appliedBy', async () => {
    const res = await api.owner.post(url).send({
      type: 'percentage',
      value: 10,
      reason: 'Test',
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when check does not exist', async () => {
    prisma.orderCheck.findFirst.mockResolvedValue(null);

    const res = await api.owner.post(url).send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Check not found');
  });

  it('returns 403 for invalid manager PIN', async () => {
    const res = await api.owner.post(url).send({
      ...validBody,
      managerPin: '9999',
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Invalid manager PIN');
  });

  it('returns 500 on database error', async () => {
    prisma.orderCheck.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(url).send(validBody);
    expect(res.status).toBe(500);
  });
});

// ============ POST /:orderId/preauth — Open tab ============

describe('POST /preauth', () => {
  const url = `${BASE_URL}/preauth`;

  const validBody = {
    checkGuid: CHECK.id,
    tabName: 'John Tab',
  };

  beforeEach(() => {
    prisma.orderCheck.findFirst.mockResolvedValue(CHECK);
    prisma.orderCheck.update.mockResolvedValue({ ...CHECK, tabName: 'John Tab' });
    prisma.order.findUnique.mockResolvedValue(ORDER_WITH_INCLUDES);
  });

  it('opens a tab', async () => {
    const res = await api.owner.post(url).send(validBody);
    expect(res.status).toBe(200);
  });

  it('opens a tab with preauth ID', async () => {
    const res = await api.owner.post(url).send({
      ...validBody,
      preauthId: 'preauth-123',
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 for missing checkGuid', async () => {
    const res = await api.owner.post(url).send({ tabName: 'Test' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing tabName', async () => {
    const res = await api.owner.post(url).send({ checkGuid: CHECK.id });
    expect(res.status).toBe(400);
  });

  it('returns 404 when check does not exist', async () => {
    prisma.orderCheck.findFirst.mockResolvedValue(null);

    const res = await api.owner.post(url).send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Check not found');
  });

  it('returns 500 on database error', async () => {
    prisma.orderCheck.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(url).send(validBody);
    expect(res.status).toBe(500);
  });
});

// ============ POST /:orderId/close-tab — Close tab ============

describe('POST /close-tab', () => {
  const url = `${BASE_URL}/close-tab`;

  const validBody = {
    checkGuid: CHECK.id,
  };

  beforeEach(() => {
    prisma.orderCheck.findFirst.mockResolvedValue({ ...CHECK, tabName: 'John Tab' });
    prisma.orderCheck.update.mockResolvedValue({ ...CHECK, tabClosedAt: new Date(), paymentStatus: 'CLOSED' });
    prisma.order.findUnique.mockResolvedValue(ORDER_WITH_INCLUDES);
  });

  it('closes a tab', async () => {
    const res = await api.owner.post(url).send(validBody);
    expect(res.status).toBe(200);
  });

  it('returns 400 for missing checkGuid', async () => {
    const res = await api.owner.post(url).send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when check does not exist', async () => {
    prisma.orderCheck.findFirst.mockResolvedValue(null);

    const res = await api.owner.post(url).send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Check not found');
  });

  it('returns 500 on database error', async () => {
    prisma.orderCheck.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(url).send(validBody);
    expect(res.status).toBe(500);
  });
});
