/**
 * AI Analytics Routes
 * Routes for Menu Engineering, Sales Insights, and Inventory Management
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { menuEngineeringService } from '../services/menu-engineering.service';
import { salesInsightsService } from '../services/sales-insights.service';
import { inventoryService } from '../services/inventory.service';
import { orderProfitService } from '../services/order-profit.service';

const router = Router();
const prisma = new PrismaClient();

// ============ Today's Sales Stats (Home Dashboard) ============

/**
 * GET /:restaurantId/analytics/today-stats
 * Returns net sales and order count for today vs yesterday
 */
router.get('/:restaurantId/analytics/today-stats', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const completedStatuses = ['completed', 'delivered', 'ready', 'preparing'];

    const [todayOrders, yesterdayOrders] = await Promise.all([
      prisma.order.findMany({
        where: {
          restaurantId,
          status: { in: completedStatuses },
          createdAt: { gte: todayStart },
        },
        select: { total: true, tax: true, tip: true, discount: true },
      }),
      prisma.order.findMany({
        where: {
          restaurantId,
          status: { in: completedStatuses },
          createdAt: { gte: yesterdayStart, lt: todayStart },
        },
        select: { total: true, tax: true, tip: true, discount: true },
      }),
    ]);

    const sumNetSales = (orders: { total: unknown; tax: unknown; tip: unknown; discount: unknown }[]): number =>
      orders.reduce((sum, o) => {
        const total = Number(o.total) || 0;
        const tax = Number(o.tax) || 0;
        const tip = Number(o.tip) || 0;
        return sum + (total - tax - tip);
      }, 0);

    res.json({
      netSales: Math.round(sumNetSales(todayOrders) * 100) / 100,
      orderCount: todayOrders.length,
      priorDayNetSales: Math.round(sumNetSales(yesterdayOrders) * 100) / 100,
      priorDayOrderCount: yesterdayOrders.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error getting today stats:', message);
    res.status(500).json({ error: 'Failed to get today stats' });
  }
});

// ============ Menu Engineering ============

/**
 * GET /:restaurantId/analytics/menu-engineering
 * Generate a complete menu engineering report
 */
router.get('/:restaurantId/analytics/menu-engineering', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { days = '30' } = req.query;

    const report = await menuEngineeringService.generateReport(
      restaurantId,
      Number.parseInt(days as string, 10)
    );

    if (!report) {
      res.status(500).json({ error: 'Failed to generate menu engineering report' });
      return;
    }

    res.json(report);
  } catch (error) {
    console.error('Error generating menu engineering report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

/**
 * GET /:restaurantId/analytics/upsell-suggestions
 * Get real-time upsell suggestions for POS
 */
router.get('/:restaurantId/analytics/upsell-suggestions', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { cartItems } = req.query;

    const cartItemIds = cartItems 
      ? (cartItems as string).split(',').filter(Boolean)
      : [];

    const suggestions = await menuEngineeringService.getUpsellSuggestions(
      restaurantId,
      cartItemIds
    );

    res.json(suggestions);
  } catch (error) {
    console.error('Error getting upsell suggestions:', error);
    res.status(500).json({ error: 'Failed to get upsell suggestions' });
  }
});

// ============ Sales Insights ============

/**
 * GET /:restaurantId/analytics/sales/daily
 * Get daily sales insights with AI analysis
 */
router.get('/:restaurantId/analytics/sales/daily', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { date } = req.query;

    const targetDate = date ? new Date(date as string) : new Date();
    const report = await salesInsightsService.getDailyInsights(restaurantId, targetDate);

    if (!report) {
      res.status(500).json({ error: 'Failed to generate daily insights' });
      return;
    }

    res.json(report);
  } catch (error) {
    console.error('Error getting daily insights:', error);
    res.status(500).json({ error: 'Failed to get daily insights' });
  }
});

/**
 * GET /:restaurantId/analytics/sales/weekly
 * Get weekly sales insights with AI analysis
 */
router.get('/:restaurantId/analytics/sales/weekly', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { weeksAgo = '0' } = req.query;

    const report = await salesInsightsService.getWeeklyInsights(
      restaurantId,
      Number.parseInt(weeksAgo as string, 10)
    );

    if (!report) {
      res.status(500).json({ error: 'Failed to generate weekly insights' });
      return;
    }

    res.json(report);
  } catch (error) {
    console.error('Error getting weekly insights:', error);
    res.status(500).json({ error: 'Failed to get weekly insights' });
  }
});

/**
 * GET /:restaurantId/analytics/sales/summary
 * Get sales summary for a custom date range
 */
router.get('/:restaurantId/analytics/sales/summary', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate are required' });
      return;
    }

    const summary = await salesInsightsService.getSalesSummary(
      restaurantId,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json(summary);
  } catch (error) {
    console.error('Error getting sales summary:', error);
    res.status(500).json({ error: 'Failed to get sales summary' });
  }
});

// ============ Inventory Management ============

/**
 * GET /:restaurantId/inventory
 * Get all inventory items
 */
router.get('/:restaurantId/inventory', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const items = await inventoryService.getInventory(restaurantId);
    res.json(items);
  } catch (error) {
    console.error('Error getting inventory:', error);
    res.status(500).json({ error: 'Failed to get inventory' });
  }
});

/**
 * POST /:restaurantId/inventory
 * Create a new inventory item
 */
router.post('/:restaurantId/inventory', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const {
      name, nameEn, unit, currentStock, minStock, maxStock,
      costPerUnit, supplier, category
    } = req.body;

    const item = await inventoryService.createInventoryItem({
      restaurantId,
      name,
      nameEn,
      unit: unit || 'units',
      currentStock: currentStock || 0,
      minStock: minStock || 0,
      maxStock,
      costPerUnit: costPerUnit || 0,
      supplier,
      category: category || 'general'
    });

    res.status(201).json(item);
  } catch (error) {
    console.error('Error creating inventory item:', error);
    res.status(500).json({ error: 'Failed to create inventory item' });
  }
});

/**
 * PATCH /:restaurantId/inventory/:itemId/stock
 * Update stock level (manual count)
 */
router.patch('/:restaurantId/inventory/:itemId/stock', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { stock, reason } = req.body;

    if (stock === undefined) {
      res.status(400).json({ error: 'stock is required' });
      return;
    }

    const item = await inventoryService.updateStock(itemId, stock, reason);
    res.json(item);
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({ error: 'Failed to update stock' });
  }
});

/**
 * POST /:restaurantId/inventory/:itemId/usage
 * Record stock usage (deduct from inventory)
 */
router.post('/:restaurantId/inventory/:itemId/usage', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { quantity, reason } = req.body;

    if (!quantity || quantity <= 0) {
      res.status(400).json({ error: 'quantity must be a positive number' });
      return;
    }

    const item = await inventoryService.recordUsage(itemId, quantity, reason);
    res.json(item);
  } catch (error) {
    console.error('Error recording usage:', error);
    res.status(500).json({ error: 'Failed to record usage' });
  }
});

/**
 * POST /:restaurantId/inventory/:itemId/restock
 * Record restocking (add to inventory)
 */
router.post('/:restaurantId/inventory/:itemId/restock', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { quantity, invoiceNumber } = req.body;

    if (!quantity || quantity <= 0) {
      res.status(400).json({ error: 'quantity must be a positive number' });
      return;
    }

    const item = await inventoryService.recordRestock(itemId, quantity, invoiceNumber);
    res.json(item);
  } catch (error) {
    console.error('Error recording restock:', error);
    res.status(500).json({ error: 'Failed to record restock' });
  }
});

/**
 * GET /:restaurantId/inventory/alerts
 * Get all inventory alerts (low stock, out of stock, etc.)
 */
router.get('/:restaurantId/inventory/alerts', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const alerts = await inventoryService.getAlerts(restaurantId);
    res.json(alerts);
  } catch (error) {
    console.error('Error getting inventory alerts:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

/**
 * GET /:restaurantId/inventory/predictions
 * Get stock predictions (when will we run out?)
 */
router.get('/:restaurantId/inventory/predictions', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const predictions = await inventoryService.getStockPredictions(restaurantId);
    res.json(predictions);
  } catch (error) {
    console.error('Error getting predictions:', error);
    res.status(500).json({ error: 'Failed to get predictions' });
  }
});

/**
 * GET /:restaurantId/inventory/report
 * Generate comprehensive inventory report
 */
router.get('/:restaurantId/inventory/report', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const report = await inventoryService.generateReport(restaurantId);
    res.json(report);
  } catch (error) {
    console.error('Error generating inventory report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

/**
 * GET /:restaurantId/inventory/expiring
 * Returns inventory items near or below minimum stock.
 */
router.get('/:restaurantId/inventory/expiring', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

    const items = await prisma.inventoryItem.findMany({
      where: {
        restaurantId,
        active: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    const expiring = items.filter(item =>
      Number(item.currentStock) <= Number(item.minStock) && Number(item.minStock) > 0
    );

    res.json(expiring);
  } catch (error: unknown) {
    console.error('Error getting expiring items:', error instanceof Error ? error.message : String(error));
    res.json([]);
  }
});

/**
 * GET /:restaurantId/inventory/:itemId
 * Get a single inventory item (must be after /alerts, /predictions, /report, /expiring)
 */
router.get('/:restaurantId/inventory/:itemId', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const item = await inventoryService.getInventoryItem(itemId);

    if (!item) {
      res.status(404).json({ error: 'Inventory item not found' });
      return;
    }

    res.json(item);
  } catch (error) {
    console.error('Error getting inventory item:', error);
    res.status(500).json({ error: 'Failed to get inventory item' });
  }
});

/**
 * GET /:restaurantId/inventory/:itemId/predict
 * AI prediction: When will we run out of this item?
 */
router.get('/:restaurantId/inventory/:itemId/predict', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const prediction = await inventoryService.predictItemRunout(itemId);
    res.json({ prediction });
  } catch (error) {
    console.error('Error predicting runout:', error);
    res.status(500).json({ error: 'Failed to predict runout' });
  }
});

// ============ Order Profit Insights ============

/**
 * GET /:restaurantId/orders/:orderId/profit-insight
 * Get profit insight for a specific order (for checkout confirmation)
 */
router.get('/:restaurantId/orders/:orderId/profit-insight', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const insight = await orderProfitService.getOrderProfitInsight(orderId);

    if (!insight) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    res.json(insight);
  } catch (error) {
    console.error('Error getting order profit insight:', error);
    res.status(500).json({ error: 'Failed to get profit insight' });
  }
});

/**
 * GET /:restaurantId/orders/recent-profit
 * Get profit insights for recent orders (for dashboard)
 */
router.get('/:restaurantId/orders/recent-profit', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { limit = '10' } = req.query;

    const result = await orderProfitService.getRecentOrdersProfit(
      restaurantId,
      Number.parseInt(limit as string, 10)
    );

    res.json(result);
  } catch (error) {
    console.error('Error getting recent orders profit:', error);
    res.status(500).json({ error: 'Failed to get recent orders profit' });
  }
});

// ============ Customers ============

/**
 * GET /:restaurantId/customers
 * Get all customers for a restaurant
 */
router.get('/:restaurantId/customers', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { search } = req.query;

    const where: Record<string, unknown> = { restaurantId };

    if (search) {
      const term = String(search);
      where.OR = [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } },
      ];
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { lastOrderDate: 'desc' },
    });

    res.json(customers);
  } catch (error) {
    console.error('Error getting customers:', error);
    res.status(500).json({ error: 'Failed to get customers' });
  }
});

/**
 * PATCH /:restaurantId/customers/:customerId
 * Update customer tags
 */
router.patch('/:restaurantId/customers/:customerId', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const { tags } = req.body;

    const customer = await prisma.customer.update({
      where: { id: customerId },
      data: { tags },
    });

    res.json(customer);
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// ============ Sales Goals ============

/**
 * GET /:restaurantId/analytics/goals
 * Returns sales goals for the restaurant.
 * Goals are stored as JSON in restaurant settings — no separate table yet.
 */
router.get('/:restaurantId/analytics/goals', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { merchantProfile: true },
    });

    if (!restaurant) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    const profile = restaurant.merchantProfile as Record<string, unknown> | null;
    const goals = (profile?.salesGoals as unknown[]) ?? [];
    res.json(goals);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error getting sales goals:', message);
    res.status(500).json({ error: 'Failed to get sales goals' });
  }
});

// ============ Sales Alerts ============

/**
 * GET /:restaurantId/analytics/sales-alerts
 * Returns active sales alerts (anomaly detection).
 * Currently returns empty — will populate when anomaly detection is wired.
 */
router.get('/:restaurantId/analytics/sales-alerts', async (_req: Request, res: Response) => {
  res.json([]);
});

// ============ Reporting Categories ============

/**
 * GET /:restaurantId/reporting-categories
 * Returns reporting categories used for menu item classification.
 */
router.get('/:restaurantId/reporting-categories', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

    const categories = await prisma.primaryCategory.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });

    res.json(categories);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error getting reporting categories:', message);
    res.status(500).json({ error: 'Failed to get reporting categories' });
  }
});

// ============ Realtime KPIs ============

/**
 * GET /:restaurantId/reports/realtime-kpis
 * Returns live KPIs computed from today's orders.
 */
router.get('/:restaurantId/reports/realtime-kpis', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastWeekStart = new Date(todayStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(lastWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() + 1);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const completedStatuses = ['completed', 'delivered', 'ready', 'preparing'];

    const [todayOrders, yesterdayOrders, lastWeekSameDayOrders] = await Promise.all([
      prisma.order.findMany({
        where: { restaurantId, status: { in: completedStatuses }, createdAt: { gte: todayStart } },
        select: { total: true, tax: true, tip: true },
      }),
      prisma.order.findMany({
        where: { restaurantId, status: { in: completedStatuses }, createdAt: { gte: yesterdayStart, lt: todayStart } },
        select: { total: true },
      }),
      prisma.order.findMany({
        where: { restaurantId, status: { in: completedStatuses }, createdAt: { gte: lastWeekStart, lt: lastWeekEnd } },
        select: { total: true },
      }),
    ]);

    const calcNet = (orders: { total: unknown; tax?: unknown; tip?: unknown }[]): number =>
      orders.reduce((sum, o) => sum + (Number(o.total) || 0) - (Number(o.tax) || 0) - (Number(o.tip) || 0), 0);

    const todayRevenue = Math.round(calcNet(todayOrders) * 100) / 100;
    const todayOrderCount = todayOrders.length;
    const yesterdayRevenue = Math.round(calcNet(yesterdayOrders.map(o => ({ ...o, tax: 0, tip: 0 }))) * 100) / 100;
    const lastWeekRevenue = Math.round(calcNet(lastWeekSameDayOrders.map(o => ({ ...o, tax: 0, tip: 0 }))) * 100) / 100;
    const avgOrderValue = todayOrderCount > 0 ? Math.round((todayRevenue / todayOrderCount) * 100) / 100 : 0;

    const vsYesterdayPercent = yesterdayRevenue > 0
      ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 1000) / 10
      : 0;
    const vsLastWeekPercent = lastWeekRevenue > 0
      ? Math.round(((todayRevenue - lastWeekRevenue) / lastWeekRevenue) * 1000) / 10
      : 0;

    res.json({
      todayRevenue,
      todayOrderCount,
      avgOrderValue,
      vsYesterdayPercent,
      vsLastWeekPercent,
      timestamp: now.toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error getting realtime KPIs:', message);
    res.status(500).json({ error: 'Failed to get realtime KPIs' });
  }
});

// ============ Reservations: Turn Time Stats ============

/**
 * GET /:restaurantId/reservations/turn-time-stats
 * Computes average table turn time from completed reservations.
 */
router.get('/:restaurantId/reservations/turn-time-stats', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

    // seatedAt/completedAt not in schema yet — use reservationTime + updatedAt as proxy
    const completedReservations = await prisma.reservation.findMany({
      where: {
        restaurantId,
        status: 'completed',
      },
      select: { reservationTime: true, updatedAt: true, partySize: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    if (completedReservations.length === 0) {
      res.json({
        overall: 45,
        byPartySize: [],
        byMealPeriod: [],
        byDayOfWeek: [],
        sampleSize: 0,
      });
      return;
    }

    const durations = completedReservations
      .filter(r => r.reservationTime && r.updatedAt)
      .map(r => ({
        minutes: Math.round((r.updatedAt.getTime() - r.reservationTime.getTime()) / 60000),
        partySize: r.partySize,
      }))
      .filter(d => d.minutes > 0 && d.minutes < 480);

    const overall = durations.length > 0
      ? Math.round(durations.reduce((sum, d) => sum + d.minutes, 0) / durations.length)
      : 45;

    // Group by party size
    const byPartySizeMap = new Map<number, number[]>();
    for (const d of durations) {
      const arr = byPartySizeMap.get(d.partySize) ?? [];
      arr.push(d.minutes);
      byPartySizeMap.set(d.partySize, arr);
    }
    const byPartySize = [...byPartySizeMap.entries()].map(([size, mins]) => ({
      partySize: size,
      avgMinutes: Math.round(mins.reduce((a, b) => a + b, 0) / mins.length),
    }));

    res.json({
      overall,
      byPartySize,
      byMealPeriod: [],
      byDayOfWeek: [],
      sampleSize: durations.length,
    });
  } catch (error: unknown) {
    // If seatedAt/completedAt columns don't exist yet, return defaults
    console.error('Error getting turn time stats:', error instanceof Error ? error.message : String(error));
    res.json({ overall: 45, byPartySize: [], byMealPeriod: [], byDayOfWeek: [], sampleSize: 0 });
  }
});

// ============ Waitlist ============

/**
 * GET /:restaurantId/waitlist
 * Returns active waitlist entries (reservations with status='waitlisted').
 */
router.get('/:restaurantId/waitlist', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

    const entries = await prisma.reservation.findMany({
      where: {
        restaurantId,
        status: 'waitlisted',
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(entries);
  } catch (error: unknown) {
    // If 'waitlisted' status isn't used yet, return empty array
    console.error('Error getting waitlist:', error instanceof Error ? error.message : String(error));
    res.json([]);
  }
});

// ============ Purchase Orders ============

/**
 * GET /:restaurantId/purchase-orders
 * Returns purchase orders (using PurchaseInvoice with type='purchase_order').
 */
router.get('/:restaurantId/purchase-orders', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

    // PurchaseInvoice has no 'type' field — return all as purchase orders
    const orders = await prisma.purchaseInvoice.findMany({
      where: {
        restaurantId,
      },
      include: { lineItems: true, vendor: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json(orders);
  } catch (error: unknown) {
    // If 'type' field doesn't exist yet, return empty array
    console.error('Error getting purchase orders:', error instanceof Error ? error.message : String(error));
    res.json([]);
  }
});

// ============ Order Templates ============

const createOrderTemplateSchema = z.object({
  name: z.string().min(1),
  items: z.array(z.object({
    menuItemId: z.string(),
    quantity: z.number().int().min(1),
    modifiers: z.array(z.string()),
  })),
});

router.get('/:restaurantId/order-templates', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const templates = await prisma.orderTemplate.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(templates);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error getting order templates:', message);
    res.status(500).json({ error: 'Failed to get order templates' });
  }
});

router.post('/:restaurantId/order-templates', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = createOrderTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { name, items } = parsed.data;
    const createdBy = (req as unknown as { user?: { id?: string } }).user?.id ?? 'system';
    const template = await prisma.orderTemplate.create({
      data: { restaurantId, name, items, createdBy },
    });
    res.status(201).json(template);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error creating order template:', message);
    res.status(500).json({ error: 'Failed to create order template' });
  }
});

router.delete('/:restaurantId/order-templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.orderTemplate.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error deleting order template:', message);
    res.status(500).json({ error: 'Failed to delete order template' });
  }
});

// ============ Saved Reports ============

const createSavedReportSchema = z.object({
  name: z.string().min(1),
  blocks: z.array(z.object({
    type: z.string(),
    label: z.string(),
    displayOrder: z.number(),
    columns: z.array(z.string()).optional(),
  })),
});

const updateSavedReportSchema = z.object({
  name: z.string().min(1).optional(),
  blocks: z.array(z.object({
    type: z.string(),
    label: z.string(),
    displayOrder: z.number(),
    columns: z.array(z.string()).optional(),
  })).optional(),
});

router.get('/:restaurantId/reports/saved', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const reports = await prisma.savedReport.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(reports);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error getting saved reports:', message);
    res.status(500).json({ error: 'Failed to get saved reports' });
  }
});

router.post('/:restaurantId/reports/saved', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = createSavedReportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { name, blocks } = parsed.data;
    const createdBy = (req as unknown as { user?: { id?: string } }).user?.id ?? 'system';
    const report = await prisma.savedReport.create({
      data: { restaurantId, name, blocks, createdBy },
    });
    res.status(201).json(report);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error creating saved report:', message);
    res.status(500).json({ error: 'Failed to create saved report' });
  }
});

router.patch('/:restaurantId/reports/saved/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = updateSavedReportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const report = await prisma.savedReport.update({
      where: { id },
      data: parsed.data,
    });
    res.json(report);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error updating saved report:', message);
    res.status(500).json({ error: 'Failed to update saved report' });
  }
});

router.delete('/:restaurantId/reports/saved/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.savedReport.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error deleting saved report:', message);
    res.status(500).json({ error: 'Failed to delete saved report' });
  }
});

// ============ Report Schedules ============

const createScheduleSchema = z.object({
  savedReportId: z.string().uuid(),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  timeOfDay: z.string().min(1),
  recipientEmails: z.array(z.string().email()).min(1),
});

const updateScheduleSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  timeOfDay: z.string().min(1).optional(),
  recipientEmails: z.array(z.string().email()).min(1).optional(),
  isActive: z.boolean().optional(),
});

router.get('/:restaurantId/reports/schedules', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const schedules = await prisma.reportSchedule.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(schedules);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error getting report schedules:', message);
    res.status(500).json({ error: 'Failed to get report schedules' });
  }
});

router.post('/:restaurantId/reports/schedules', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = createScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { savedReportId, frequency, dayOfWeek, dayOfMonth, timeOfDay, recipientEmails } = parsed.data;
    const schedule = await prisma.reportSchedule.create({
      data: { restaurantId, savedReportId, frequency, dayOfWeek, dayOfMonth, timeOfDay, recipientEmails },
    });
    res.status(201).json(schedule);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error creating report schedule:', message);
    res.status(500).json({ error: 'Failed to create report schedule' });
  }
});

router.patch('/:restaurantId/reports/schedules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = updateScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const schedule = await prisma.reportSchedule.update({
      where: { id },
      data: parsed.data,
    });
    res.json(schedule);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error updating report schedule:', message);
    res.status(500).json({ error: 'Failed to update report schedule' });
  }
});

router.delete('/:restaurantId/reports/schedules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.reportSchedule.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error deleting report schedule:', message);
    res.status(500).json({ error: 'Failed to delete report schedule' });
  }
});

export default router;
