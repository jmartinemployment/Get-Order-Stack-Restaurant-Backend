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

// Mock external analytics services
vi.mock('../services/menu-engineering.service', () => ({
  menuEngineeringService: {
    generateReport: vi.fn().mockResolvedValue({ items: [], summary: {} }),
    getUpsellSuggestions: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../services/sales-insights.service', () => ({
  salesInsightsService: {
    getDailyInsights: vi.fn().mockResolvedValue({ revenue: 1000, orders: 50 }),
    getWeeklyInsights: vi.fn().mockResolvedValue({ revenue: 7000, orders: 350 }),
    getSalesSummary: vi.fn().mockResolvedValue({ totalRevenue: 30000, totalOrders: 1500 }),
  },
}));

vi.mock('../services/inventory.service', () => ({
  inventoryService: {
    getInventory: vi.fn().mockResolvedValue([]),
    createInventoryItem: vi.fn().mockResolvedValue({ id: 'inv-1', name: 'Flour' }),
    updateStock: vi.fn().mockResolvedValue({ id: 'inv-1', currentStock: 50 }),
    recordUsage: vi.fn().mockResolvedValue({ id: 'inv-1', currentStock: 45 }),
    recordRestock: vi.fn().mockResolvedValue({ id: 'inv-1', currentStock: 100 }),
    getAlerts: vi.fn().mockResolvedValue([]),
    getStockPredictions: vi.fn().mockResolvedValue([]),
    generateReport: vi.fn().mockResolvedValue({ items: [], totalValue: 0 }),
    getInventoryItem: vi.fn().mockResolvedValue({ id: 'inv-1', name: 'Flour' }),
    predictItemRunout: vi.fn().mockResolvedValue('Estimated 14 days'),
  },
}));

vi.mock('../services/order-profit.service', () => ({
  orderProfitService: {
    getOrderProfitInsight: vi.fn().mockResolvedValue({ orderId: 'o1', profit: 12.50 }),
    getRecentOrdersProfit: vi.fn().mockResolvedValue({ orders: [], avgProfit: 0 }),
  },
}));

const prisma = getPrismaMock();

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
});

const BASE_URL = `/api/merchant/${RESTAURANT_ID}`;

// ============ GET /analytics/today-stats ============

describe('GET /analytics/today-stats', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(`${BASE_URL}/analytics/today-stats`);
    expect(res.status).toBe(401);
  });

  it('returns today stats', async () => {
    prisma.order.findMany
      .mockResolvedValueOnce([{ total: 100, tax: 7, tip: 5, discount: 0 }])
      .mockResolvedValueOnce([{ total: 80, tax: 5.6, tip: 4, discount: 0 }]);

    const res = await api.owner.get(`${BASE_URL}/analytics/today-stats`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('netSales');
    expect(res.body).toHaveProperty('orderCount');
    expect(res.body).toHaveProperty('priorDayNetSales');
    expect(res.body.netSales).toBe(88); // 100 - 7 - 5
    expect(res.body.orderCount).toBe(1);
  });

  it('returns zeroes when no orders', async () => {
    prisma.order.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const res = await api.owner.get(`${BASE_URL}/analytics/today-stats`);
    expect(res.status).toBe(200);
    expect(res.body.netSales).toBe(0);
    expect(res.body.orderCount).toBe(0);
  });

  it('returns 500 on database error', async () => {
    prisma.order.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${BASE_URL}/analytics/today-stats`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to get today stats');
  });
});

// ============ GET /analytics/menu-engineering ============

describe('GET /analytics/menu-engineering', () => {
  it('returns menu engineering report', async () => {
    const res = await api.owner.get(`${BASE_URL}/analytics/menu-engineering`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
  });

  it('returns 500 when report is null', async () => {
    const { menuEngineeringService } = await import('../services/menu-engineering.service');
    vi.mocked(menuEngineeringService.generateReport).mockResolvedValueOnce(null);

    const res = await api.owner.get(`${BASE_URL}/analytics/menu-engineering`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to generate menu engineering report');
  });

  it('supports days query parameter', async () => {
    const res = await api.owner.get(`${BASE_URL}/analytics/menu-engineering?days=7`);
    expect(res.status).toBe(200);
  });
});

// ============ GET /analytics/upsell-suggestions ============

describe('GET /analytics/upsell-suggestions', () => {
  it('returns upsell suggestions', async () => {
    const res = await api.owner.get(`${BASE_URL}/analytics/upsell-suggestions`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('accepts cart items query', async () => {
    const res = await api.owner.get(`${BASE_URL}/analytics/upsell-suggestions?cartItems=item1,item2`);
    expect(res.status).toBe(200);
  });
});

// ============ GET /analytics/sales/daily ============

describe('GET /analytics/sales/daily', () => {
  it('returns daily insights', async () => {
    const res = await api.owner.get(`${BASE_URL}/analytics/sales/daily`);
    expect(res.status).toBe(200);
    expect(res.body.revenue).toBe(1000);
  });

  it('returns 500 when report is null', async () => {
    const { salesInsightsService } = await import('../services/sales-insights.service');
    vi.mocked(salesInsightsService.getDailyInsights).mockResolvedValueOnce(null);

    const res = await api.owner.get(`${BASE_URL}/analytics/sales/daily`);
    expect(res.status).toBe(500);
  });
});

// ============ GET /analytics/sales/weekly ============

describe('GET /analytics/sales/weekly', () => {
  it('returns weekly insights', async () => {
    const res = await api.owner.get(`${BASE_URL}/analytics/sales/weekly`);
    expect(res.status).toBe(200);
    expect(res.body.revenue).toBe(7000);
  });
});

// ============ GET /analytics/sales/summary ============

describe('GET /analytics/sales/summary', () => {
  it('returns sales summary for date range', async () => {
    const res = await api.owner.get(`${BASE_URL}/analytics/sales/summary?startDate=2026-01-01&endDate=2026-01-31`);
    expect(res.status).toBe(200);
    expect(res.body.totalRevenue).toBe(30000);
  });

  it('returns 400 when dates are missing', async () => {
    const res = await api.owner.get(`${BASE_URL}/analytics/sales/summary`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('startDate and endDate are required');
  });
});

// ============ GET /inventory ============

describe('GET /inventory', () => {
  it('returns inventory list', async () => {
    const res = await api.owner.get(`${BASE_URL}/inventory`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ============ POST /inventory ============

describe('POST /inventory', () => {
  it('creates an inventory item', async () => {
    const res = await api.owner.post(`${BASE_URL}/inventory`).send({ name: 'Flour' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Flour');
  });
});

// ============ PATCH /inventory/:itemId/stock ============

describe('PATCH /inventory/:itemId/stock', () => {
  it('updates stock level', async () => {
    const res = await api.owner.patch(`${BASE_URL}/inventory/inv-1/stock`).send({ stock: 50 });
    expect(res.status).toBe(200);
    expect(res.body.currentStock).toBe(50);
  });

  it('returns 400 when stock is missing', async () => {
    const res = await api.owner.patch(`${BASE_URL}/inventory/inv-1/stock`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('stock is required');
  });
});

// ============ POST /inventory/:itemId/usage ============

describe('POST /inventory/:itemId/usage', () => {
  it('records usage', async () => {
    const res = await api.owner.post(`${BASE_URL}/inventory/inv-1/usage`).send({ quantity: 5, reason: 'cooking' });
    expect(res.status).toBe(200);
  });

  it('returns 400 for non-positive quantity', async () => {
    const res = await api.owner.post(`${BASE_URL}/inventory/inv-1/usage`).send({ quantity: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('quantity must be a positive number');
  });
});

// ============ POST /inventory/:itemId/restock ============

describe('POST /inventory/:itemId/restock', () => {
  it('records restock', async () => {
    const res = await api.owner.post(`${BASE_URL}/inventory/inv-1/restock`).send({ quantity: 50 });
    expect(res.status).toBe(200);
  });

  it('returns 400 for non-positive quantity', async () => {
    const res = await api.owner.post(`${BASE_URL}/inventory/inv-1/restock`).send({ quantity: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('quantity must be a positive number');
  });
});

// ============ GET /inventory/alerts ============

describe('GET /inventory/alerts', () => {
  it('returns alerts', async () => {
    const res = await api.owner.get(`${BASE_URL}/inventory/alerts`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ============ GET /inventory/predictions ============

describe('GET /inventory/predictions', () => {
  it('returns predictions', async () => {
    const res = await api.owner.get(`${BASE_URL}/inventory/predictions`);
    expect(res.status).toBe(200);
  });
});

// ============ GET /inventory/report ============

describe('GET /inventory/report', () => {
  it('returns inventory report', async () => {
    const res = await api.owner.get(`${BASE_URL}/inventory/report`);
    expect(res.status).toBe(200);
    expect(res.body.totalValue).toBe(0);
  });
});

// ============ GET /inventory/expiring ============

describe('GET /inventory/expiring', () => {
  it('returns expiring items (below minimum stock)', async () => {
    prisma.inventoryItem.findMany.mockResolvedValue([
      { id: 'inv-1', name: 'Flour', currentStock: 2, minStock: 10, active: true, updatedAt: new Date() },
    ]);

    const res = await api.owner.get(`${BASE_URL}/inventory/expiring`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('returns empty array on error (graceful)', async () => {
    prisma.inventoryItem.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${BASE_URL}/inventory/expiring`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ============ GET /inventory/:itemId ============

describe('GET /inventory/:itemId', () => {
  it('returns single inventory item', async () => {
    const res = await api.owner.get(`${BASE_URL}/inventory/inv-1`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Flour');
  });

  it('returns 404 when item not found', async () => {
    const { inventoryService } = await import('../services/inventory.service');
    vi.mocked(inventoryService.getInventoryItem).mockResolvedValueOnce(null);

    const res = await api.owner.get(`${BASE_URL}/inventory/inv-999`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Inventory item not found');
  });
});

// ============ GET /inventory/:itemId/predict ============

describe('GET /inventory/:itemId/predict', () => {
  it('returns runout prediction', async () => {
    const res = await api.owner.get(`${BASE_URL}/inventory/inv-1/predict`);
    expect(res.status).toBe(200);
    expect(res.body.prediction).toBe('Estimated 14 days');
  });
});

// ============ GET /orders/:orderId/profit-insight ============

describe('GET /orders/:orderId/profit-insight', () => {
  it('returns profit insight', async () => {
    const res = await api.owner.get(`${BASE_URL}/orders/o1/profit-insight`);
    expect(res.status).toBe(200);
    expect(res.body.profit).toBe(12.50);
  });

  it('returns 404 when order not found', async () => {
    const { orderProfitService } = await import('../services/order-profit.service');
    vi.mocked(orderProfitService.getOrderProfitInsight).mockResolvedValueOnce(null);

    const res = await api.owner.get(`${BASE_URL}/orders/o1/profit-insight`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Order not found');
  });
});

// ============ GET /orders/recent-profit ============

describe('GET /orders/recent-profit', () => {
  it('returns recent orders profit', async () => {
    const res = await api.owner.get(`${BASE_URL}/orders/recent-profit`);
    expect(res.status).toBe(200);
    expect(res.body.avgProfit).toBe(0);
  });
});

// ============ GET /customers ============

describe('GET /customers', () => {
  it('returns customers list', async () => {
    prisma.customer.findMany.mockResolvedValue([{ id: 'c1', firstName: 'John' }]);

    const res = await api.owner.get(`${BASE_URL}/customers`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('supports search query', async () => {
    prisma.customer.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${BASE_URL}/customers?search=john`);
    expect(res.status).toBe(200);
  });

  it('returns 500 on database error', async () => {
    prisma.customer.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${BASE_URL}/customers`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to get customers');
  });
});

// ============ PATCH /customers/:customerId ============

describe('PATCH /customers/:customerId', () => {
  it('updates customer tags', async () => {
    prisma.customer.update.mockResolvedValue({ id: 'c1', tags: ['vip'] });

    const res = await api.owner.patch(`${BASE_URL}/customers/c1`).send({ tags: ['vip'] });
    expect(res.status).toBe(200);
    expect(res.body.tags).toEqual(['vip']);
  });

  it('returns 500 on database error', async () => {
    prisma.customer.update.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.patch(`${BASE_URL}/customers/c1`).send({ tags: [] });
    expect(res.status).toBe(500);
  });
});

// ============ GET /analytics/goals ============

describe('GET /analytics/goals', () => {
  it('returns sales goals from merchant profile', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      merchantProfile: { salesGoals: [{ name: 'Daily Revenue', target: 1000 }] },
    });

    const res = await api.owner.get(`${BASE_URL}/analytics/goals`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('returns empty array when no goals set', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ merchantProfile: null });

    const res = await api.owner.get(`${BASE_URL}/analytics/goals`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 404 when restaurant not found', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);

    const res = await api.owner.get(`${BASE_URL}/analytics/goals`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Restaurant not found');
  });
});

// ============ GET /analytics/sales-alerts ============

describe('GET /analytics/sales-alerts', () => {
  it('returns empty array (placeholder)', async () => {
    const res = await api.owner.get(`${BASE_URL}/analytics/sales-alerts`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ============ GET /reporting-categories ============

describe('GET /reporting-categories', () => {
  it('returns reporting categories', async () => {
    prisma.primaryCategory.findMany.mockResolvedValue([{ id: 'pc-1', name: 'Entrees' }]);

    const res = await api.owner.get(`${BASE_URL}/reporting-categories`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('returns 500 on database error', async () => {
    prisma.primaryCategory.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${BASE_URL}/reporting-categories`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to get reporting categories');
  });
});

// ============ GET /reports/realtime-kpis ============

describe('GET /reports/realtime-kpis', () => {
  it('returns realtime KPIs', async () => {
    prisma.order.findMany
      .mockResolvedValueOnce([{ total: 200, tax: 14, tip: 10 }])
      .mockResolvedValueOnce([{ total: 150 }])
      .mockResolvedValueOnce([{ total: 180 }]);

    const res = await api.owner.get(`${BASE_URL}/reports/realtime-kpis`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('todayRevenue');
    expect(res.body).toHaveProperty('todayOrderCount');
    expect(res.body).toHaveProperty('avgOrderValue');
    expect(res.body).toHaveProperty('vsYesterdayPercent');
    expect(res.body).toHaveProperty('vsLastWeekPercent');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('returns 500 on database error', async () => {
    prisma.order.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${BASE_URL}/reports/realtime-kpis`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to get realtime KPIs');
  });
});

// ============ GET /reservations/turn-time-stats ============

describe('GET /reservations/turn-time-stats', () => {
  it('returns turn time stats', async () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    prisma.reservation.findMany.mockResolvedValue([
      { reservationTime: twoHoursAgo, updatedAt: now, partySize: 4 },
    ]);

    const res = await api.owner.get(`${BASE_URL}/reservations/turn-time-stats`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('overall');
    expect(res.body).toHaveProperty('sampleSize');
    expect(res.body.sampleSize).toBe(1);
  });

  it('returns defaults when no completed reservations', async () => {
    prisma.reservation.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${BASE_URL}/reservations/turn-time-stats`);
    expect(res.status).toBe(200);
    expect(res.body.overall).toBe(45);
    expect(res.body.sampleSize).toBe(0);
  });

  it('returns defaults on error (graceful)', async () => {
    prisma.reservation.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${BASE_URL}/reservations/turn-time-stats`);
    expect(res.status).toBe(200);
    expect(res.body.overall).toBe(45);
  });
});

// ============ GET /waitlist ============

describe('GET /waitlist', () => {
  it('returns waitlist entries', async () => {
    prisma.reservation.findMany.mockResolvedValue([{ id: 'r1', status: 'waitlisted' }]);

    const res = await api.owner.get(`${BASE_URL}/waitlist`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('returns empty array on error (graceful)', async () => {
    prisma.reservation.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${BASE_URL}/waitlist`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ============ GET /purchase-orders ============

describe('GET /purchase-orders', () => {
  it('returns purchase orders', async () => {
    prisma.purchaseInvoice.findMany.mockResolvedValue([{ id: 'po-1', totalAmount: 500 }]);

    const res = await api.owner.get(`${BASE_URL}/purchase-orders`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('returns empty array on error (graceful)', async () => {
    prisma.purchaseInvoice.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${BASE_URL}/purchase-orders`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
