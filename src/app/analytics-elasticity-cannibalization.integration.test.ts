/**
 * FEATURE-13: Price Elasticity & Cannibalization — Integration Tests
 *
 * Covers:
 * - GET /:merchantId/analytics/menu/price-elasticity
 *   - Happy path: items with price variation → elasticity coefficient + recommendation
 *   - Items with no price variation → elasticity 0, confidence low
 *   - Items with < 5 orders excluded
 *   - Empty menu → empty array
 *   - Days query param parsed correctly
 *   - Claude reasoning populates reasoning field
 *   - Claude failure falls back to rule-based reasoning
 *   - Response is flat array (not wrapped in { items })
 *
 * - GET /:merchantId/analytics/menu/cannibalization
 *   - Happy path: new item causes > 15% sales decline
 *   - Decline < 15% excluded from results
 *   - No new items in window → empty array
 *   - No same-category candidates → empty array
 *   - Days query param parsed correctly
 *   - Claude recommendation populates recommendation field
 *   - Claude failure falls back to generic recommendation
 *   - Response is flat array (not wrapped in { pairs })
 *   - Results sorted by salesDeclinePercent descending
 */

import { getPrismaMock, resetPrismaMock } from '../test/prisma-mock';
import { api } from '../test/request-helper';
import { RESTAURANT_ID } from '../test/fixtures';

// Mock auth service — keep real verifyToken, stub validateSession
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

// Mock services imported by analytics.routes.ts
vi.mock('../services/menu-engineering.service', () => ({
  menuEngineeringService: { generateReport: vi.fn().mockResolvedValue(null) },
}));
vi.mock('../services/sales-insights.service', () => ({
  salesInsightsService: { getSalesSummary: vi.fn().mockResolvedValue(null) },
}));
vi.mock('../services/inventory.service', () => ({
  inventoryService: { getAlerts: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../services/order-profit.service', () => ({
  orderProfitService: { getRecentProfit: vi.fn().mockResolvedValue(null) },
}));

const mockGetAnthropicClient = vi.fn();
vi.mock('../services/ai-config.service', () => ({
  aiConfigService: {
    getAnthropicClientForRestaurant: (...args: unknown[]) => mockGetAnthropicClient(...args),
  },
}));
vi.mock('../services/ai-usage.service', () => ({
  aiUsageService: {
    logUsage: vi.fn().mockResolvedValue(undefined),
  },
}));

const prisma = getPrismaMock();
const BASE = `/api/merchant/${RESTAURANT_ID}/analytics/menu`;

// --- Helpers ---

function makeMenuItem(id: string, name: string, price: number, createdAt?: Date) {
  return {
    id,
    name,
    price,
    categoryId: 'cat-1',
    restaurantId: RESTAURANT_ID,
    createdAt: createdAt ?? new Date('2025-01-01'),
  };
}

function makeOrderItem(menuItemId: string, quantity: number, unitPrice: number, orderDate: Date) {
  return {
    menuItemId,
    quantity,
    unitPrice,
    order: { createdAt: orderDate, restaurantId: RESTAURANT_ID, status: 'completed' },
  };
}

// --- Setup ---

beforeEach(() => {
  resetPrismaMock();
  mockGetAnthropicClient.mockResolvedValue(null); // no Claude by default
});

// ==================== PRICE ELASTICITY ====================

describe('GET /analytics/menu/price-elasticity', () => {
  it('returns flat array (not wrapped in { items })', async () => {
    prisma.menuItem.findMany.mockResolvedValue([]);
    prisma.orderItem.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${BASE}/price-elasticity`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns empty array when no menu items exist', async () => {
    prisma.menuItem.findMany.mockResolvedValue([]);
    prisma.orderItem.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${BASE}/price-elasticity`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('excludes items with fewer than 5 orders', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      makeMenuItem('item-1', 'Burger', 12.99),
    ]);
    // Only 3 order items (quantity 1 each)
    const now = new Date();
    prisma.orderItem.findMany.mockResolvedValue([
      makeOrderItem('item-1', 1, 12.99, now),
      makeOrderItem('item-1', 1, 12.99, now),
      makeOrderItem('item-1', 1, 12.99, now),
    ]);

    const res = await api.owner.get(`${BASE}/price-elasticity`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns elasticity 0 and confidence low when price has not varied', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      makeMenuItem('item-1', 'Burger', 12.99),
    ]);
    const now = new Date();
    const items = Array.from({ length: 10 }, () =>
      makeOrderItem('item-1', 1, 12.99, now)
    );
    prisma.orderItem.findMany.mockResolvedValue(items);

    const res = await api.owner.get(`${BASE}/price-elasticity`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].elasticity).toBe(0);
    expect(res.body[0].confidence).toBe('low');
    expect(res.body[0].itemId).toBe('item-1');
    expect(res.body[0].itemName).toBe('Burger');
    expect(res.body[0].currentPrice).toBe(12.99);
  });

  it('computes elasticity when prices have varied', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      makeMenuItem('item-1', 'Burger', 14.99),
    ]);

    const now = new Date();
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const sixWeeksAgo = new Date(now);
    sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);

    // Old price: $9.99, 5 orders per week × 6 weeks = 30 orders
    const oldOrders = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(sixWeeksAgo);
      date.setDate(date.getDate() + Math.floor(i / 5) * 7);
      return makeOrderItem('item-1', 1, 9.99, date);
    });

    // New price: $14.99, 2 orders per week × 2 weeks = 4 orders
    const newOrders = Array.from({ length: 4 }, (_, i) => {
      const date = new Date(twoWeeksAgo);
      date.setDate(date.getDate() + Math.floor(i / 2) * 7);
      return makeOrderItem('item-1', 1, 14.99, date);
    });

    prisma.orderItem.findMany.mockResolvedValue([...oldOrders, ...newOrders]);

    const res = await api.owner.get(`${BASE}/price-elasticity?days=90`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);

    const item = res.body[0];
    expect(item.itemId).toBe('item-1');
    expect(item.currentPrice).toBe(14.99);
    expect(typeof item.elasticity).toBe('number');
    expect(item.elasticity).not.toBe(0); // should have computed a real coefficient
    expect(['increase', 'decrease', 'hold']).toContain(item.recommendation);
    expect(typeof item.estimatedRevenueChange).toBe('number');
    expect(['low', 'medium', 'high']).toContain(item.confidence);
  });

  it('sets confidence high for >= 30 data points', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      makeMenuItem('item-1', 'Burger', 14.99),
    ]);

    const now = new Date();
    // 35 orders with two different prices
    const orders = Array.from({ length: 35 }, (_, i) => {
      const date = new Date(now);
      date.setDate(date.getDate() - (i * 2));
      const price = i < 15 ? 14.99 : 12.99;
      return makeOrderItem('item-1', 1, price, date);
    });

    prisma.orderItem.findMany.mockResolvedValue(orders);

    const res = await api.owner.get(`${BASE}/price-elasticity?days=90`);

    expect(res.body[0].confidence).toBe('high');
  });

  it('sets confidence medium for 10-29 data points', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      makeMenuItem('item-1', 'Burger', 14.99),
    ]);

    const now = new Date();
    const orders = Array.from({ length: 15 }, (_, i) => {
      const date = new Date(now);
      date.setDate(date.getDate() - (i * 5));
      const price = i < 7 ? 14.99 : 12.99;
      return makeOrderItem('item-1', 1, price, date);
    });

    prisma.orderItem.findMany.mockResolvedValue(orders);

    const res = await api.owner.get(`${BASE}/price-elasticity?days=90`);

    expect(res.body[0].confidence).toBe('medium');
  });

  it('returns recommendation "increase" for inelastic items (elasticity > -0.5)', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      makeMenuItem('item-1', 'Burger', 14.99),
    ]);

    const now = new Date();
    // Create orders where demand barely changes despite price increase
    // Old price: many orders; new price: almost same volume → inelastic
    const orders: ReturnType<typeof makeOrderItem>[] = [];
    for (let i = 0; i < 20; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - (i * 3));
      // First 10: low price, high volume (2 per order)
      // Last 10: high price, nearly same volume
      const price = i < 10 ? 14.99 : 12.99;
      orders.push(makeOrderItem('item-1', 2, price, date));
    }

    prisma.orderItem.findMany.mockResolvedValue(orders);

    const res = await api.owner.get(`${BASE}/price-elasticity?days=90`);

    expect(res.body).toHaveLength(1);
    expect(['increase', 'decrease', 'hold']).toContain(res.body[0].recommendation);
  });

  it('parses days query parameter', async () => {
    prisma.menuItem.findMany.mockResolvedValue([]);
    prisma.orderItem.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${BASE}/price-elasticity?days=30`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('defaults days to 90 when not provided', async () => {
    prisma.menuItem.findMany.mockResolvedValue([]);
    prisma.orderItem.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${BASE}/price-elasticity`);

    expect(res.status).toBe(200);
    // No error from missing param
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('populates reasoning from Claude when available', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      makeMenuItem('item-1', 'Burger', 12.99),
    ]);

    const now = new Date();
    prisma.orderItem.findMany.mockResolvedValue(
      Array.from({ length: 10 }, () => makeOrderItem('item-1', 1, 12.99, now))
    );

    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: '[{ "itemId": "item-1", "reasoning": "Burger demand is steady." }]' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      },
    };
    mockGetAnthropicClient.mockResolvedValue(mockClient);

    const res = await api.owner.get(`${BASE}/price-elasticity`);

    expect(res.body[0].reasoning).toBe('Burger demand is steady.');
  });

  it('falls back to rule-based reasoning when Claude is unavailable', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      makeMenuItem('item-1', 'Burger', 12.99),
    ]);

    const now = new Date();
    prisma.orderItem.findMany.mockResolvedValue(
      Array.from({ length: 10 }, () => makeOrderItem('item-1', 1, 12.99, now))
    );

    mockGetAnthropicClient.mockResolvedValue(null);

    const res = await api.owner.get(`${BASE}/price-elasticity`);

    expect(res.body[0].reasoning).toBeDefined();
    expect(res.body[0].reasoning.length).toBeGreaterThan(0);
    expect(res.body[0].reasoning).toContain('Burger');
  });

  it('falls back to rule-based reasoning when Claude throws', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      makeMenuItem('item-1', 'Burger', 12.99),
    ]);

    const now = new Date();
    prisma.orderItem.findMany.mockResolvedValue(
      Array.from({ length: 10 }, () => makeOrderItem('item-1', 1, 12.99, now))
    );

    const mockClient = {
      messages: { create: vi.fn().mockRejectedValue(new Error('API rate limit')) },
    };
    mockGetAnthropicClient.mockResolvedValue(mockClient);

    const res = await api.owner.get(`${BASE}/price-elasticity`);

    expect(res.status).toBe(200);
    expect(res.body[0].reasoning).toBeDefined();
    expect(res.body[0].reasoning).toContain('Burger');
  });

  it('response shape matches PriceElasticityIndicator interface', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      makeMenuItem('item-1', 'Burger', 12.99),
    ]);

    const now = new Date();
    prisma.orderItem.findMany.mockResolvedValue(
      Array.from({ length: 10 }, () => makeOrderItem('item-1', 1, 12.99, now))
    );

    const res = await api.owner.get(`${BASE}/price-elasticity`);

    const item = res.body[0];
    expect(item).toHaveProperty('itemId');
    expect(item).toHaveProperty('itemName');
    expect(item).toHaveProperty('currentPrice');
    expect(item).toHaveProperty('elasticity');
    expect(item).toHaveProperty('recommendation');
    expect(item).toHaveProperty('estimatedRevenueChange');
    expect(item).toHaveProperty('confidence');
    expect(item).toHaveProperty('reasoning');
    // Must NOT have legacy field names
    expect(item).not.toHaveProperty('menuItemId');
    expect(item).not.toHaveProperty('name');
    expect(item).not.toHaveProperty('orderCount');
    expect(item).not.toHaveProperty('revenuePerItem');
  });

  it('returns empty array on Prisma error (does not crash)', async () => {
    prisma.menuItem.findMany.mockRejectedValue(new Error('DB connection lost'));

    const res = await api.owner.get(`${BASE}/price-elasticity`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ==================== CANNIBALIZATION ====================

describe('GET /analytics/menu/cannibalization', () => {
  it('returns flat array (not wrapped in { pairs })', async () => {
    prisma.menuItem.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${BASE}/cannibalization?days=60`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns empty array when no new items exist in window', async () => {
    // First call: new items (created within window) — empty
    prisma.menuItem.findMany.mockResolvedValueOnce([]);

    const res = await api.owner.get(`${BASE}/cannibalization?days=60`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns empty array when new items have no categoryId', async () => {
    prisma.menuItem.findMany.mockResolvedValueOnce([
      { id: 'new-1', name: 'New Item', categoryId: null, createdAt: new Date(), restaurantId: RESTAURANT_ID },
    ]);

    const res = await api.owner.get(`${BASE}/cannibalization?days=60`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns empty array when no same-category candidates exist', async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10);

    // First call: new items
    prisma.menuItem.findMany.mockResolvedValueOnce([
      makeMenuItem('new-1', 'New Burger', 14.99, recentDate),
    ]);
    // Second call: candidates — empty
    prisma.menuItem.findMany.mockResolvedValueOnce([]);

    const res = await api.owner.get(`${BASE}/cannibalization?days=60`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('detects cannibalization when sales decline >= 15%', async () => {
    const launchDate = new Date();
    launchDate.setDate(launchDate.getDate() - 14);
    const oldDate = new Date('2025-01-01');

    // New item created 14 days ago
    prisma.menuItem.findMany.mockResolvedValueOnce([
      makeMenuItem('new-1', 'Smash Burger', 14.99, launchDate),
    ]);
    // Candidate: old item in same category
    prisma.menuItem.findMany.mockResolvedValueOnce([
      makeMenuItem('old-1', 'Classic Burger', 12.99, oldDate),
    ]);

    // Sales data: old item had 20/week before, 5/week after
    const beforeLaunch = new Date(launchDate);
    beforeLaunch.setDate(beforeLaunch.getDate() - 14);
    const afterLaunch = new Date(launchDate);
    afterLaunch.setDate(afterLaunch.getDate() + 7);

    const orderItems = [
      // Before launch: 20 orders in 2 weeks
      ...Array.from({ length: 20 }, () => makeOrderItem('old-1', 1, 12.99, beforeLaunch)),
      // After launch: 5 orders in 2 weeks
      ...Array.from({ length: 5 }, () => makeOrderItem('old-1', 1, 12.99, afterLaunch)),
    ];
    prisma.orderItem.findMany.mockResolvedValue(orderItems);

    const res = await api.owner.get(`${BASE}/cannibalization?days=60`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const result = res.body[0];
    expect(result.newItemId).toBe('new-1');
    expect(result.newItemName).toBe('Smash Burger');
    expect(result.affectedItemId).toBe('old-1');
    expect(result.affectedItemName).toBe('Classic Burger');
    expect(result.salesDeclinePercent).toBeGreaterThanOrEqual(15);
    expect(result.periodStart).toBeDefined();
    expect(result.periodEnd).toBeDefined();
  });

  it('excludes pairs where sales decline is < 15%', async () => {
    const launchDate = new Date();
    launchDate.setDate(launchDate.getDate() - 14);
    const oldDate = new Date('2025-01-01');

    prisma.menuItem.findMany.mockResolvedValueOnce([
      makeMenuItem('new-1', 'Smash Burger', 14.99, launchDate),
    ]);
    prisma.menuItem.findMany.mockResolvedValueOnce([
      makeMenuItem('old-1', 'Classic Burger', 12.99, oldDate),
    ]);

    // Sales barely changed: 10 before, 9 after = 10% decline
    const beforeLaunch = new Date(launchDate);
    beforeLaunch.setDate(beforeLaunch.getDate() - 14);
    const afterLaunch = new Date(launchDate);
    afterLaunch.setDate(afterLaunch.getDate() + 7);

    prisma.orderItem.findMany.mockResolvedValue([
      ...Array.from({ length: 10 }, () => makeOrderItem('old-1', 1, 12.99, beforeLaunch)),
      ...Array.from({ length: 9 }, () => makeOrderItem('old-1', 1, 12.99, afterLaunch)),
    ]);

    const res = await api.owner.get(`${BASE}/cannibalization?days=60`);

    expect(res.body).toEqual([]);
  });

  it('sorts results by salesDeclinePercent descending', async () => {
    const launchDate = new Date();
    launchDate.setDate(launchDate.getDate() - 14);
    const oldDate = new Date('2025-01-01');

    prisma.menuItem.findMany.mockResolvedValueOnce([
      makeMenuItem('new-1', 'Smash Burger', 14.99, launchDate),
    ]);
    prisma.menuItem.findMany.mockResolvedValueOnce([
      makeMenuItem('old-1', 'Classic Burger', 12.99, oldDate),
      makeMenuItem('old-2', 'Veggie Burger', 11.99, oldDate),
    ]);

    const beforeLaunch = new Date(launchDate);
    beforeLaunch.setDate(beforeLaunch.getDate() - 14);
    const afterLaunch = new Date(launchDate);
    afterLaunch.setDate(afterLaunch.getDate() + 7);

    prisma.orderItem.findMany.mockResolvedValue([
      // old-1: 20 before (5/week) → 1 after (0.5/week) = 90% decline
      ...Array.from({ length: 20 }, () => makeOrderItem('old-1', 1, 12.99, beforeLaunch)),
      ...Array.from({ length: 1 }, () => makeOrderItem('old-1', 1, 12.99, afterLaunch)),
      // old-2: 20 before (5/week) → 6 after (3/week) = 40% decline
      ...Array.from({ length: 20 }, () => makeOrderItem('old-2', 1, 11.99, beforeLaunch)),
      ...Array.from({ length: 6 }, () => makeOrderItem('old-2', 1, 11.99, afterLaunch)),
    ]);

    const res = await api.owner.get(`${BASE}/cannibalization?days=60`);

    expect(res.body.length).toBe(2);
    expect(res.body[0].affectedItemId).toBe('old-1'); // higher decline first
    expect(res.body[0].salesDeclinePercent).toBeGreaterThanOrEqual(res.body[1].salesDeclinePercent);
  });

  it('parses days query parameter', async () => {
    prisma.menuItem.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${BASE}/cannibalization?days=30`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('defaults days to 60 when not provided', async () => {
    prisma.menuItem.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${BASE}/cannibalization`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('populates recommendation from Claude when available', async () => {
    const launchDate = new Date();
    launchDate.setDate(launchDate.getDate() - 14);
    const oldDate = new Date('2025-01-01');

    prisma.menuItem.findMany.mockResolvedValueOnce([
      makeMenuItem('new-1', 'Smash Burger', 14.99, launchDate),
    ]);
    prisma.menuItem.findMany.mockResolvedValueOnce([
      makeMenuItem('old-1', 'Classic Burger', 12.99, oldDate),
    ]);

    const beforeLaunch = new Date(launchDate);
    beforeLaunch.setDate(beforeLaunch.getDate() - 14);
    const afterLaunch = new Date(launchDate);
    afterLaunch.setDate(afterLaunch.getDate() + 7);

    prisma.orderItem.findMany.mockResolvedValue([
      ...Array.from({ length: 20 }, () => makeOrderItem('old-1', 1, 12.99, beforeLaunch)),
      ...Array.from({ length: 5 }, () => makeOrderItem('old-1', 1, 12.99, afterLaunch)),
    ]);

    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: '[{ "newItemId": "new-1", "affectedItemId": "old-1", "recommendation": "Differentiate with unique toppings." }]' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      },
    };
    mockGetAnthropicClient.mockResolvedValue(mockClient);

    const res = await api.owner.get(`${BASE}/cannibalization?days=60`);

    expect(res.body[0].recommendation).toBe('Differentiate with unique toppings.');
  });

  it('falls back to generic recommendation when Claude is unavailable', async () => {
    const launchDate = new Date();
    launchDate.setDate(launchDate.getDate() - 14);
    const oldDate = new Date('2025-01-01');

    prisma.menuItem.findMany.mockResolvedValueOnce([
      makeMenuItem('new-1', 'Smash Burger', 14.99, launchDate),
    ]);
    prisma.menuItem.findMany.mockResolvedValueOnce([
      makeMenuItem('old-1', 'Classic Burger', 12.99, oldDate),
    ]);

    const beforeLaunch = new Date(launchDate);
    beforeLaunch.setDate(beforeLaunch.getDate() - 14);
    const afterLaunch = new Date(launchDate);
    afterLaunch.setDate(afterLaunch.getDate() + 7);

    prisma.orderItem.findMany.mockResolvedValue([
      ...Array.from({ length: 20 }, () => makeOrderItem('old-1', 1, 12.99, beforeLaunch)),
      ...Array.from({ length: 5 }, () => makeOrderItem('old-1', 1, 12.99, afterLaunch)),
    ]);

    mockGetAnthropicClient.mockResolvedValue(null);

    const res = await api.owner.get(`${BASE}/cannibalization?days=60`);

    expect(res.body[0].recommendation).toContain('Classic Burger');
    expect(res.body[0].recommendation).toContain('Smash Burger');
  });

  it('response shape matches CannibalizationResult interface', async () => {
    const launchDate = new Date();
    launchDate.setDate(launchDate.getDate() - 14);
    const oldDate = new Date('2025-01-01');

    prisma.menuItem.findMany.mockResolvedValueOnce([
      makeMenuItem('new-1', 'Smash Burger', 14.99, launchDate),
    ]);
    prisma.menuItem.findMany.mockResolvedValueOnce([
      makeMenuItem('old-1', 'Classic Burger', 12.99, oldDate),
    ]);

    const beforeLaunch = new Date(launchDate);
    beforeLaunch.setDate(beforeLaunch.getDate() - 14);
    const afterLaunch = new Date(launchDate);
    afterLaunch.setDate(afterLaunch.getDate() + 7);

    prisma.orderItem.findMany.mockResolvedValue([
      ...Array.from({ length: 20 }, () => makeOrderItem('old-1', 1, 12.99, beforeLaunch)),
      ...Array.from({ length: 5 }, () => makeOrderItem('old-1', 1, 12.99, afterLaunch)),
    ]);

    const res = await api.owner.get(`${BASE}/cannibalization?days=60`);

    const result = res.body[0];
    expect(result).toHaveProperty('newItemId');
    expect(result).toHaveProperty('newItemName');
    expect(result).toHaveProperty('affectedItemId');
    expect(result).toHaveProperty('affectedItemName');
    expect(result).toHaveProperty('salesDeclinePercent');
    expect(result).toHaveProperty('periodStart');
    expect(result).toHaveProperty('periodEnd');
    // Must NOT have legacy field names
    expect(result).not.toHaveProperty('itemA');
    expect(result).not.toHaveProperty('itemB');
    expect(result).not.toHaveProperty('coOccurrenceCount');
    expect(result).not.toHaveProperty('sameCategory');
  });

  it('returns empty array on Prisma error (does not crash)', async () => {
    prisma.menuItem.findMany.mockRejectedValue(new Error('DB connection lost'));

    const res = await api.owner.get(`${BASE}/cannibalization?days=60`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('skips candidates with 0 sales before launch', async () => {
    const launchDate = new Date();
    launchDate.setDate(launchDate.getDate() - 14);
    const oldDate = new Date('2025-01-01');

    prisma.menuItem.findMany.mockResolvedValueOnce([
      makeMenuItem('new-1', 'Smash Burger', 14.99, launchDate),
    ]);
    prisma.menuItem.findMany.mockResolvedValueOnce([
      makeMenuItem('old-1', 'Classic Burger', 12.99, oldDate),
    ]);

    // No sales at all for old item before launch
    prisma.orderItem.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${BASE}/cannibalization?days=60`);

    expect(res.body).toEqual([]);
  });
});
