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
 * GET /:merchantId/analytics/today-stats
 * Returns net sales and order count for today vs yesterday
 */
router.get('/:merchantId/analytics/today-stats', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

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
 * GET /:merchantId/analytics/menu-engineering
 * Generate a complete menu engineering report
 */
router.get('/:merchantId/analytics/menu-engineering', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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
 * GET /:merchantId/analytics/upsell-suggestions
 * Get real-time upsell suggestions for POS
 */
router.get('/:merchantId/analytics/upsell-suggestions', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

// ============ Menu Engineering — Advanced Analytics ============

/**
 * GET /:merchantId/analytics/menu/price-elasticity
 * Price vs demand data derived from OrderItem + MenuItem
 */
router.get('/:merchantId/analytics/menu/price-elasticity', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId },
      select: { id: true, name: true, price: true },
    });

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: { restaurantId, status: { in: ['completed', 'delivered', 'ready', 'preparing'] } },
      },
      select: { menuItemId: true, quantity: true, unitPrice: true },
    });

    const itemStats = new Map<string, { orderCount: number; totalRevenue: number }>();
    for (const oi of orderItems) {
      if (!oi.menuItemId) continue;
      const existing = itemStats.get(oi.menuItemId) ?? { orderCount: 0, totalRevenue: 0 };
      existing.orderCount += oi.quantity;
      existing.totalRevenue += Number(oi.unitPrice) * oi.quantity;
      itemStats.set(oi.menuItemId, existing);
    }

    const items = menuItems.map((mi) => {
      const stats = itemStats.get(mi.id) ?? { orderCount: 0, totalRevenue: 0 };
      return {
        menuItemId: mi.id,
        name: mi.name,
        currentPrice: Number(mi.price),
        orderCount: stats.orderCount,
        revenuePerItem: stats.orderCount > 0
          ? Math.round((stats.totalRevenue / stats.orderCount) * 100) / 100
          : 0,
      };
    });

    res.json({ items });
  } catch (error: unknown) {
    console.error('[Analytics] Error fetching price elasticity:', error);
    res.json({ items: [] });
  }
});

/**
 * GET /:merchantId/analytics/menu/cannibalization
 * Items frequently ordered together or competing in the same category
 */
router.get('/:merchantId/analytics/menu/cannibalization', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        status: { in: ['completed', 'delivered', 'ready', 'preparing'] },
      },
      select: {
        orderItems: {
          select: { menuItemId: true },
        },
      },
      take: 1000,
      orderBy: { createdAt: 'desc' },
    });

    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId },
      select: { id: true, name: true, categoryId: true },
    });

    const menuItemMap = new Map(menuItems.map((mi) => [mi.id, mi]));
    const pairCounts = new Map<string, number>();

    for (const order of orders) {
      const itemIds = order.orderItems
        .map((i) => i.menuItemId)
        .filter((id): id is string => id !== null);
      const unique = [...new Set(itemIds)];

      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          const key = [unique[i], unique[j]].sort().join('|');
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    }

    const pairs = [...pairCounts.entries()]
      .filter(([, count]) => count >= 2)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 50)
      .map(([key, count]) => {
        const [idA, idB] = key.split('|');
        const itemA = menuItemMap.get(idA);
        const itemB = menuItemMap.get(idB);
        return {
          itemA: { menuItemId: idA, name: itemA?.name ?? 'Unknown' },
          itemB: { menuItemId: idB, name: itemB?.name ?? 'Unknown' },
          coOccurrenceCount: count,
          sameCategory: itemA?.categoryId !== null
            && itemA?.categoryId === itemB?.categoryId,
        };
      });

    res.json({ pairs });
  } catch (error: unknown) {
    console.error('[Analytics] Error fetching cannibalization data:', error);
    res.json({ pairs: [] });
  }
});

/**
 * GET /:merchantId/analytics/prep-time-accuracy
 * Estimated vs actual prep time per menu item
 */
router.get('/:merchantId/analytics/prep-time-accuracy', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId },
      select: { id: true, name: true, prepTimeMinutes: true },
    });

    // Use OrderItem sentToKitchenAt -> completedAt as actual prep time
    const completedOrderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          restaurantId,
          status: { in: ['completed', 'delivered', 'ready'] },
        },
        sentToKitchenAt: { not: null },
        completedAt: { not: null },
        menuItemId: { not: null },
      },
      select: {
        menuItemId: true,
        sentToKitchenAt: true,
        completedAt: true,
      },
      take: 2000,
      orderBy: { createdAt: 'desc' },
    });

    const actualTimes = new Map<string, number[]>();
    for (const oi of completedOrderItems) {
      if (!oi.sentToKitchenAt || !oi.completedAt || !oi.menuItemId) continue;
      const minutes = (oi.completedAt.getTime() - oi.sentToKitchenAt.getTime()) / 60000;
      if (minutes <= 0 || minutes > 180) continue;

      const arr = actualTimes.get(oi.menuItemId) ?? [];
      arr.push(minutes);
      actualTimes.set(oi.menuItemId, arr);
    }

    const items = menuItems.map((mi) => {
      const times = actualTimes.get(mi.id) ?? [];
      const actualAvg = times.length > 0
        ? Math.round((times.reduce((sum, t) => sum + t, 0) / times.length) * 10) / 10
        : null;
      const estimated = mi.prepTimeMinutes ?? null;
      const accuracy = estimated !== null && actualAvg !== null
        ? Math.round((1 - Math.abs(actualAvg - estimated) / estimated) * 100)
        : null;

      return {
        menuItemId: mi.id,
        name: mi.name,
        estimatedMinutes: estimated,
        actualAvgMinutes: actualAvg,
        accuracy,
      };
    });

    res.json({ items });
  } catch (error: unknown) {
    console.error('[Analytics] Error fetching prep time accuracy:', error);
    res.json({ items: [] });
  }
});

// ============ Sales Insights ============

/**
 * GET /:merchantId/analytics/sales/daily
 * Get daily sales insights with AI analysis
 */
router.get('/:merchantId/analytics/sales/daily', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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
 * GET /:merchantId/analytics/sales/weekly
 * Get weekly sales insights with AI analysis
 */
router.get('/:merchantId/analytics/sales/weekly', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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
 * GET /:merchantId/analytics/sales/summary
 * Get sales summary for a custom date range
 */
router.get('/:merchantId/analytics/sales/summary', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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
 * GET /:merchantId/inventory
 * Get all inventory items
 */
router.get('/:merchantId/inventory', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const items = await inventoryService.getInventory(restaurantId);
    res.json(items);
  } catch (error) {
    console.error('Error getting inventory:', error);
    res.status(500).json({ error: 'Failed to get inventory' });
  }
});

/**
 * POST /:merchantId/inventory
 * Create a new inventory item
 */
router.post('/:merchantId/inventory', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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
 * PATCH /:merchantId/inventory/:itemId/stock
 * Update stock level (manual count)
 */
router.patch('/:merchantId/inventory/:itemId/stock', async (req: Request, res: Response) => {
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
 * POST /:merchantId/inventory/:itemId/usage
 * Record stock usage (deduct from inventory)
 */
router.post('/:merchantId/inventory/:itemId/usage', async (req: Request, res: Response) => {
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
 * POST /:merchantId/inventory/:itemId/restock
 * Record restocking (add to inventory)
 */
router.post('/:merchantId/inventory/:itemId/restock', async (req: Request, res: Response) => {
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
 * GET /:merchantId/inventory/alerts
 * Get all inventory alerts (low stock, out of stock, etc.)
 */
router.get('/:merchantId/inventory/alerts', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const alerts = await inventoryService.getAlerts(restaurantId);
    res.json(alerts);
  } catch (error) {
    console.error('Error getting inventory alerts:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

/**
 * GET /:merchantId/inventory/predictions
 * Get stock predictions (when will we run out?)
 */
router.get('/:merchantId/inventory/predictions', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const predictions = await inventoryService.getStockPredictions(restaurantId);
    res.json(predictions);
  } catch (error) {
    console.error('Error getting predictions:', error);
    res.status(500).json({ error: 'Failed to get predictions' });
  }
});

/**
 * GET /:merchantId/inventory/report
 * Generate comprehensive inventory report
 */
router.get('/:merchantId/inventory/report', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const report = await inventoryService.generateReport(restaurantId);
    res.json(report);
  } catch (error) {
    console.error('Error generating inventory report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

/**
 * GET /:merchantId/inventory/expiring
 * Returns inventory items near or below minimum stock.
 */
router.get('/:merchantId/inventory/expiring', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

    const items = await prisma.inventoryItem.findMany({
      where: {
        restaurantId,
        active: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    const expiring = items
      .filter(item =>
        Number(item.currentStock) <= Number(item.minStock) && Number(item.minStock) > 0
      )
      .map(item => ({
        inventoryItemId: item.id,
        itemName: item.name,
        unit: item.unit,
        currentStock: Number(item.currentStock),
        expirationDate: item.updatedAt.toISOString(),
        daysUntilExpiration: 0,
      }));

    res.json(expiring);
  } catch (error: unknown) {
    console.error('Error getting expiring items:', error instanceof Error ? error.message : String(error));
    res.json([]);
  }
});

// ============ Inventory Unit Conversions (must be before /:itemId catch-all) ============

router.get('/:merchantId/inventory/unit-conversions', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const conversions = await prisma.unitConversion.findMany({
      where: { restaurantId },
      orderBy: { fromUnit: 'asc' },
    });
    res.json(conversions);
  } catch (error: unknown) {
    console.error('[Inventory] Error fetching unit conversions:', error);
    res.status(500).json({ error: 'Failed to fetch unit conversions' });
  }
});

router.post('/:merchantId/inventory/unit-conversions', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { fromUnit, toUnit, factor } = req.body;

    if (!fromUnit || !toUnit || !factor) {
      res.status(400).json({ error: 'fromUnit, toUnit, and factor are required' });
      return;
    }

    const conversion = await prisma.unitConversion.create({
      data: { restaurantId, fromUnit, toUnit, factor },
    });
    res.status(201).json(conversion);
  } catch (error: unknown) {
    console.error('[Inventory] Error creating unit conversion:', error);
    res.status(500).json({ error: 'Failed to create unit conversion' });
  }
});

router.patch('/:merchantId/inventory/unit-conversions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data: Record<string, unknown> = {};
    if (req.body.fromUnit !== undefined) data.fromUnit = req.body.fromUnit;
    if (req.body.toUnit !== undefined) data.toUnit = req.body.toUnit;
    if (req.body.factor !== undefined) data.factor = req.body.factor;

    const conversion = await prisma.unitConversion.update({ where: { id }, data });
    res.json(conversion);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Unit conversion not found' });
      return;
    }
    console.error('[Inventory] Error updating unit conversion:', error);
    res.status(500).json({ error: 'Failed to update unit conversion' });
  }
});

// ============ Inventory Cycle Counts (must be before /:itemId catch-all) ============

router.get('/:merchantId/inventory/cycle-counts', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const counts = await prisma.cycleCount.findMany({
      where: { restaurantId },
      include: { items: true },
      orderBy: { date: 'desc' },
    });
    res.json(counts);
  } catch (error: unknown) {
    console.error('[Inventory] Error fetching cycle counts:', error);
    res.status(500).json({ error: 'Failed to fetch cycle counts' });
  }
});

router.post('/:merchantId/inventory/cycle-counts', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { date, items } = req.body;

    const createdBy = (req as unknown as { user?: { id?: string } }).user?.id ?? 'system';

    const count = await prisma.cycleCount.create({
      data: {
        restaurantId,
        date: date ? new Date(date) : new Date(),
        createdBy,
        items: items ? {
          create: (items as Array<{ inventoryItemId: string; expectedQty: number; actualQty?: number }>).map((i) => ({
            inventoryItemId: i.inventoryItemId,
            expectedQty: i.expectedQty,
            actualQty: i.actualQty ?? null,
            variance: i.actualQty !== undefined ? i.actualQty - i.expectedQty : null,
          })),
        } : undefined,
      },
      include: { items: true },
    });
    res.status(201).json(count);
  } catch (error: unknown) {
    console.error('[Inventory] Error creating cycle count:', error);
    res.status(500).json({ error: 'Failed to create cycle count' });
  }
});

router.patch('/:merchantId/inventory/cycle-counts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data: Record<string, unknown> = {};
    if (req.body.status !== undefined) {
      data.status = req.body.status;
      if (req.body.status === 'completed') data.completedAt = new Date();
    }

    const count = await prisma.cycleCount.update({
      where: { id },
      data,
      include: { items: true },
    });
    res.json(count);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Cycle count not found' });
      return;
    }
    console.error('[Inventory] Error updating cycle count:', error);
    res.status(500).json({ error: 'Failed to update cycle count' });
  }
});

/**
 * GET /:merchantId/inventory/:itemId
 * Get a single inventory item (must be after /alerts, /predictions, /report, /expiring, /unit-conversions, /cycle-counts)
 */
router.get('/:merchantId/inventory/:itemId', async (req: Request, res: Response) => {
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
 * GET /:merchantId/inventory/:itemId/predict
 * AI prediction: When will we run out of this item?
 */
router.get('/:merchantId/inventory/:itemId/predict', async (req: Request, res: Response) => {
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
 * GET /:merchantId/orders/:orderId/profit-insight
 * Get profit insight for a specific order (for checkout confirmation)
 */
router.get('/:merchantId/orders/:orderId/profit-insight', async (req: Request, res: Response) => {
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
 * GET /:merchantId/orders/recent-profit
 * Get profit insights for recent orders (for dashboard)
 */
router.get('/:merchantId/orders/recent-profit', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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
 * GET /:merchantId/customers
 * Get all customers for a restaurant
 */
router.get('/:merchantId/customers', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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
 * PATCH /:merchantId/customers/:customerId
 * Update customer tags
 */
router.patch('/:merchantId/customers/:customerId', async (req: Request, res: Response) => {
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
 * GET /:merchantId/analytics/goals
 * Returns sales goals for the restaurant.
 * Goals are stored as JSON in restaurant settings — no separate table yet.
 */
router.get('/:merchantId/analytics/goals', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

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
 * GET /:merchantId/analytics/sales-alerts
 * Returns active sales alerts (anomaly detection).
 * Currently returns empty — will populate when anomaly detection is wired.
 */
router.get('/:merchantId/analytics/sales-alerts', async (_req: Request, res: Response) => {
  res.json([]);
});

// ============ Reporting Categories ============

/**
 * GET /:merchantId/reporting-categories
 * Returns reporting categories used for menu item classification.
 */
router.get('/:merchantId/reporting-categories', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

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
 * GET /:merchantId/reports/realtime-kpis
 * Returns live KPIs computed from today's orders.
 */
router.get('/:merchantId/reports/realtime-kpis', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

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
 * GET /:merchantId/bookings/turn-time-stats
 * Computes average table turn time from completed reservations.
 */
router.get('/:merchantId/bookings/turn-time-stats', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

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
 * GET /:merchantId/waitlist
 * Returns active waitlist entries (reservations with status='waitlisted').
 */
router.get('/:merchantId/waitlist', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

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
 * GET /:merchantId/purchase-orders
 * Returns purchase orders (using PurchaseInvoice with type='purchase_order').
 */
router.get('/:merchantId/purchase-orders', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

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

router.get('/:merchantId/order-templates', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

router.post('/:merchantId/order-templates', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

router.delete('/:merchantId/order-templates/:id', async (req: Request, res: Response) => {
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

router.get('/:merchantId/reports/saved', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

router.post('/:merchantId/reports/saved', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

router.patch('/:merchantId/reports/saved/:id', async (req: Request, res: Response) => {
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

router.delete('/:merchantId/reports/saved/:id', async (req: Request, res: Response) => {
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

router.get('/:merchantId/reports/schedules', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

router.post('/:merchantId/reports/schedules', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

router.patch('/:merchantId/reports/schedules/:id', async (req: Request, res: Response) => {
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

router.delete('/:merchantId/reports/schedules/:id', async (req: Request, res: Response) => {
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

// ============ Recurring Reservations ============

router.get('/:merchantId/bookings/recurring', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const recurring = await prisma.recurringReservation.findMany({
      where: { restaurantId },
      orderBy: { dayOfWeek: 'asc' },
    });
    res.json(recurring);
  } catch (error: unknown) {
    console.error('[Reservations] Error fetching recurring:', error);
    res.status(500).json({ error: 'Failed to fetch recurring reservations' });
  }
});

router.post('/:merchantId/bookings/recurring', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { customerId, customerName, customerPhone, dayOfWeek, time, partySize, notes } = req.body;

    if (!customerName || dayOfWeek === undefined || !time || !partySize) {
      res.status(400).json({ error: 'customerName, dayOfWeek, time, and partySize are required' });
      return;
    }

    const recurring = await prisma.recurringReservation.create({
      data: { restaurantId, customerId, customerName, customerPhone, dayOfWeek, time, partySize, notes },
    });
    res.status(201).json(recurring);
  } catch (error: unknown) {
    console.error('[Reservations] Error creating recurring:', error);
    res.status(500).json({ error: 'Failed to create recurring reservation' });
  }
});

router.patch('/:merchantId/bookings/recurring/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data: Record<string, unknown> = {};
    if (req.body.dayOfWeek !== undefined) data.dayOfWeek = req.body.dayOfWeek;
    if (req.body.time !== undefined) data.time = req.body.time;
    if (req.body.partySize !== undefined) data.partySize = req.body.partySize;
    if (req.body.isActive !== undefined) data.isActive = req.body.isActive;
    if (req.body.notes !== undefined) data.notes = req.body.notes;

    const recurring = await prisma.recurringReservation.update({ where: { id }, data });
    res.json(recurring);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Recurring reservation not found' });
      return;
    }
    console.error('[Reservations] Error updating recurring:', error);
    res.status(500).json({ error: 'Failed to update recurring reservation' });
  }
});

router.delete('/:merchantId/bookings/recurring/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.recurringReservation.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Recurring reservation not found' });
      return;
    }
    console.error('[Reservations] Error deleting recurring:', error);
    res.status(500).json({ error: 'Failed to delete recurring reservation' });
  }
});

// ============ Waitlist Config (JSON on merchantProfile) ============

router.get('/:merchantId/waitlist/virtual-config', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { merchantProfile: true },
    });
    const profile = restaurant?.merchantProfile as Record<string, unknown> | null;
    res.json(profile?.virtualWaitlistConfig ?? { enabled: false, estimatedWaitDisplay: true, maxPartySize: 20 });
  } catch (error: unknown) {
    console.error('[Waitlist] Error getting virtual config:', error);
    res.status(500).json({ error: 'Failed to get virtual waitlist config' });
  }
});

router.put('/:merchantId/waitlist/virtual-config', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { merchantProfile: true },
    });
    const profile = (restaurant?.merchantProfile as Record<string, unknown>) ?? {};
    profile.virtualWaitlistConfig = req.body;
    await prisma.restaurant.update({ where: { id: restaurantId }, data: { merchantProfile: profile as object } });
    res.json(req.body);
  } catch (error: unknown) {
    console.error('[Waitlist] Error saving virtual config:', error);
    res.status(500).json({ error: 'Failed to save virtual waitlist config' });
  }
});

router.get('/:merchantId/waitlist/sms-config', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { merchantProfile: true },
    });
    const profile = restaurant?.merchantProfile as Record<string, unknown> | null;
    res.json(profile?.waitlistSmsConfig ?? { enabled: false, provider: null, notifyOnReady: true, notifyOnCancel: true });
  } catch (error: unknown) {
    console.error('[Waitlist] Error getting SMS config:', error);
    res.status(500).json({ error: 'Failed to get waitlist SMS config' });
  }
});

router.put('/:merchantId/waitlist/sms-config', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { merchantProfile: true },
    });
    const profile = (restaurant?.merchantProfile as Record<string, unknown>) ?? {};
    profile.waitlistSmsConfig = req.body;
    await prisma.restaurant.update({ where: { id: restaurantId }, data: { merchantProfile: profile as object } });
    res.json(req.body);
  } catch (error: unknown) {
    console.error('[Waitlist] Error saving SMS config:', error);
    res.status(500).json({ error: 'Failed to save waitlist SMS config' });
  }
});

// GET /:merchantId/waitlist/analytics
router.get('/:merchantId/waitlist/analytics', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

    // Derive from waitlisted reservations that were eventually seated (status = completed or confirmed)
    const seatedReservations = await prisma.reservation.findMany({
      where: {
        restaurantId,
        status: { in: ['completed', 'confirmed', 'seated'] },
      },
      select: { reservationTime: true, updatedAt: true, status: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    const noShows = await prisma.reservation.count({
      where: { restaurantId, status: 'no_show' },
    });

    const totalSeated = seatedReservations.length;

    // Compute avg wait (difference between creation and reservation time as proxy)
    const waitTimes = seatedReservations
      .map((r) => Math.round((r.updatedAt.getTime() - r.reservationTime.getTime()) / 60000))
      .filter((m) => m > 0 && m < 240);

    const avgWaitTime = waitTimes.length > 0
      ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length)
      : 0;

    const totalWithNoShows = totalSeated + noShows;
    const noShowRate = totalWithNoShows > 0 ? Math.round((noShows / totalWithNoShows) * 1000) / 10 : 0;

    res.json({ avgWaitTime, totalSeated, noShows, noShowRate });
  } catch (error: unknown) {
    console.error('[Waitlist] Error getting analytics:', error);
    res.status(500).json({ error: 'Failed to get waitlist analytics' });
  }
});

// ============ Calendar Connection (JSON on merchantProfile) ============

router.get('/:merchantId/calendar/connection', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { merchantProfile: true },
    });
    const profile = restaurant?.merchantProfile as Record<string, unknown> | null;
    res.json(profile?.calendarConnection ?? { provider: null, connected: false, syncEnabled: false });
  } catch (error: unknown) {
    console.error('[Calendar] Error getting connection:', error);
    res.status(500).json({ error: 'Failed to get calendar connection' });
  }
});

router.put('/:merchantId/calendar/connection', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { merchantProfile: true },
    });
    const profile = (restaurant?.merchantProfile as Record<string, unknown>) ?? {};
    profile.calendarConnection = req.body;
    await prisma.restaurant.update({ where: { id: restaurantId }, data: { merchantProfile: profile as object } });
    res.json(req.body);
  } catch (error: unknown) {
    console.error('[Calendar] Error saving connection:', error);
    res.status(500).json({ error: 'Failed to save calendar connection' });
  }
});

// ============ Events ============

router.get('/:merchantId/events', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const events = await prisma.event.findMany({
      where: { restaurantId },
      orderBy: { date: 'asc' },
    });
    res.json(events);
  } catch (error: unknown) {
    console.error('[Events] Error listing events:', error);
    res.status(500).json({ error: 'Failed to list events' });
  }
});

router.post('/:merchantId/events', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { name, description, date, startTime, endTime, maxCapacity } = req.body;

    if (!name || !date || !startTime || !endTime) {
      res.status(400).json({ error: 'name, date, startTime, and endTime are required' });
      return;
    }

    const event = await prisma.event.create({
      data: { restaurantId, name, description, date: new Date(date), startTime, endTime, maxCapacity },
    });
    res.status(201).json(event);
  } catch (error: unknown) {
    console.error('[Events] Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

router.patch('/:merchantId/events/:eventId', async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const data: Record<string, unknown> = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.description !== undefined) data.description = req.body.description;
    if (req.body.date !== undefined) data.date = new Date(req.body.date);
    if (req.body.startTime !== undefined) data.startTime = req.body.startTime;
    if (req.body.endTime !== undefined) data.endTime = req.body.endTime;
    if (req.body.maxCapacity !== undefined) data.maxCapacity = req.body.maxCapacity;
    if (req.body.currentRsvps !== undefined) data.currentRsvps = req.body.currentRsvps;
    if (req.body.isActive !== undefined) data.isActive = req.body.isActive;

    const event = await prisma.event.update({ where: { id: eventId }, data });
    res.json(event);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    console.error('[Events] Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

router.delete('/:merchantId/events/:eventId', async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    await prisma.event.delete({ where: { id: eventId } });
    res.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    console.error('[Events] Error deleting event:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// ============ Customer Feedback ============

router.get('/:merchantId/customers/feedback', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const feedback = await prisma.customerFeedback.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(feedback);
  } catch (error: unknown) {
    console.error('[CRM] Error fetching feedback:', error);
    res.status(500).json({ error: 'Failed to fetch customer feedback' });
  }
});

router.post('/:merchantId/customers/feedback', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { customerId, orderId, rating, comment, source } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'rating (1-5) is required' });
      return;
    }

    const feedback = await prisma.customerFeedback.create({
      data: { restaurantId, customerId, orderId, rating, comment, source },
    });
    res.status(201).json(feedback);
  } catch (error: unknown) {
    console.error('[CRM] Error creating feedback:', error);
    res.status(500).json({ error: 'Failed to create feedback' });
  }
});

// ============ Smart Groups ============

router.get('/:merchantId/customers/smart-groups', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const groups = await prisma.smartGroup.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });
    res.json(groups);
  } catch (error: unknown) {
    console.error('[CRM] Error fetching smart groups:', error);
    res.status(500).json({ error: 'Failed to fetch smart groups' });
  }
});

router.post('/:merchantId/customers/smart-groups', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { name, rules } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const group = await prisma.smartGroup.create({
      data: { restaurantId, name, rules: rules ?? [] },
    });
    res.status(201).json(group);
  } catch (error: unknown) {
    console.error('[CRM] Error creating smart group:', error);
    res.status(500).json({ error: 'Failed to create smart group' });
  }
});

router.patch('/:merchantId/customers/smart-groups/:groupId', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const data: Record<string, unknown> = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.rules !== undefined) data.rules = req.body.rules;

    const group = await prisma.smartGroup.update({ where: { id: groupId }, data });
    res.json(group);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Smart group not found' });
      return;
    }
    console.error('[CRM] Error updating smart group:', error);
    res.status(500).json({ error: 'Failed to update smart group' });
  }
});

router.delete('/:merchantId/customers/smart-groups/:groupId', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    await prisma.smartGroup.delete({ where: { id: groupId } });
    res.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Smart group not found' });
      return;
    }
    console.error('[CRM] Error deleting smart group:', error);
    res.status(500).json({ error: 'Failed to delete smart group' });
  }
});

// ============ Message Threads ============

router.get('/:merchantId/customers/messages/threads', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const threads = await prisma.messageThread.findMany({
      where: { restaurantId },
      include: { messages: { orderBy: { sentAt: 'desc' }, take: 1 } },
      orderBy: { lastMessageAt: 'desc' },
    });
    res.json(threads);
  } catch (error: unknown) {
    console.error('[CRM] Error fetching message threads:', error);
    res.status(500).json({ error: 'Failed to fetch message threads' });
  }
});

// ============ Message Templates ============

router.get('/:merchantId/customers/messages/templates', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const templates = await prisma.messageTemplate.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });
    res.json(templates);
  } catch (error: unknown) {
    console.error('[CRM] Error fetching message templates:', error);
    res.status(500).json({ error: 'Failed to fetch message templates' });
  }
});

router.post('/:merchantId/customers/messages/templates', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { name, channel, subject, body, variables } = req.body;

    if (!name || !channel || !body) {
      res.status(400).json({ error: 'name, channel, and body are required' });
      return;
    }

    const template = await prisma.messageTemplate.create({
      data: { restaurantId, name, channel, subject, body, variables: variables ?? [] },
    });
    res.status(201).json(template);
  } catch (error: unknown) {
    console.error('[CRM] Error creating message template:', error);
    res.status(500).json({ error: 'Failed to create message template' });
  }
});

router.patch('/:merchantId/customers/messages/templates/:templateId', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const data: Record<string, unknown> = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.channel !== undefined) data.channel = req.body.channel;
    if (req.body.subject !== undefined) data.subject = req.body.subject;
    if (req.body.body !== undefined) data.body = req.body.body;
    if (req.body.variables !== undefined) data.variables = req.body.variables;

    const template = await prisma.messageTemplate.update({ where: { id: templateId }, data });
    res.json(template);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Message template not found' });
      return;
    }
    console.error('[CRM] Error updating message template:', error);
    res.status(500).json({ error: 'Failed to update message template' });
  }
});

router.delete('/:merchantId/customers/messages/templates/:templateId', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    await prisma.messageTemplate.delete({ where: { id: templateId } });
    res.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Message template not found' });
      return;
    }
    console.error('[CRM] Error deleting message template:', error);
    res.status(500).json({ error: 'Failed to delete message template' });
  }
});

// ============ Team Sales Analytics ============

router.get('/:merchantId/analytics/team/sales', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { startDate, endDate } = req.query;

    const where: Record<string, unknown> = {
      restaurantId,
      status: { in: ['completed', 'delivered', 'ready', 'preparing'] },
      serverId: { not: null },
    };

    if (startDate && endDate) {
      where.createdAt = { gte: new Date(startDate as string), lte: new Date(endDate as string) };
    }

    const orders = await prisma.order.findMany({
      where,
      select: { serverId: true, total: true, tax: true, tip: true },
    });

    const byServer = new Map<string, { totalSales: number; orderCount: number; totalTips: number }>();
    for (const order of orders) {
      const sid = order.serverId ?? 'unknown';
      const existing = byServer.get(sid) ?? { totalSales: 0, orderCount: 0, totalTips: 0 };
      existing.totalSales += Number(order.total) - Number(order.tax);
      existing.orderCount += 1;
      existing.totalTips += Number(order.tip);
      byServer.set(sid, existing);
    }

    const results = [...byServer.entries()].map(([serverId, stats]) => ({
      serverId,
      totalSales: Math.round(stats.totalSales * 100) / 100,
      orderCount: stats.orderCount,
      totalTips: Math.round(stats.totalTips * 100) / 100,
      avgOrderValue: stats.orderCount > 0 ? Math.round((stats.totalSales / stats.orderCount) * 100) / 100 : 0,
    }));

    res.json(results);
  } catch (error: unknown) {
    console.error('[Analytics] Error getting team sales:', error);
    res.status(500).json({ error: 'Failed to get team sales analytics' });
  }
});

// ============ Reports: Team Member Sales ============

router.get('/:merchantId/reports/team-member-sales', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { startDate, endDate } = req.query;

    const where: Record<string, unknown> = {
      restaurantId,
      status: { in: ['completed', 'delivered'] },
      serverId: { not: null },
    };

    if (startDate && endDate) {
      where.createdAt = { gte: new Date(startDate as string), lte: new Date(endDate as string) };
    }

    const orders = await prisma.order.findMany({
      where,
      select: { serverId: true, total: true, tax: true, tip: true, createdAt: true },
    });

    const byServer = new Map<string, { totalSales: number; orderCount: number; totalTips: number }>();
    for (const order of orders) {
      const sid = order.serverId ?? 'unknown';
      const existing = byServer.get(sid) ?? { totalSales: 0, orderCount: 0, totalTips: 0 };
      existing.totalSales += Number(order.total) - Number(order.tax);
      existing.orderCount += 1;
      existing.totalTips += Number(order.tip);
      byServer.set(sid, existing);
    }

    res.json([...byServer.entries()].map(([serverId, stats]) => ({
      serverId,
      ...stats,
      totalSales: Math.round(stats.totalSales * 100) / 100,
      totalTips: Math.round(stats.totalTips * 100) / 100,
    })));
  } catch (error: unknown) {
    console.error('[Reports] Error getting team member sales:', error);
    res.status(500).json({ error: 'Failed to get team member sales report' });
  }
});

// ============ Reports: Tax & Service Charges ============

router.get('/:merchantId/reports/tax-service-charges', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { startDate, endDate } = req.query;

    const where: Record<string, unknown> = {
      restaurantId,
      status: { in: ['completed', 'delivered'] },
    };

    if (startDate && endDate) {
      where.createdAt = { gte: new Date(startDate as string), lte: new Date(endDate as string) };
    }

    const orders = await prisma.order.findMany({
      where,
      select: { tax: true, total: true, createdAt: true },
    });

    const totalTax = orders.reduce((sum, o) => sum + Number(o.tax), 0);
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total), 0);

    res.json({
      totalTax: Math.round(totalTax * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      orderCount: orders.length,
      effectiveTaxRate: totalRevenue > 0 ? Math.round((totalTax / totalRevenue) * 10000) / 100 : 0,
    });
  } catch (error: unknown) {
    console.error('[Reports] Error getting tax report:', error);
    res.status(500).json({ error: 'Failed to get tax & service charges report' });
  }
});

// ============ Analytics Forecasts (empty-data-aware) ============

router.get('/:merchantId/analytics/conversion-funnel', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

    // Derive from order data: views -> cart -> checkout -> completed
    const completedStatuses = ['completed', 'delivered'];
    const allOrders = await prisma.order.count({ where: { restaurantId } });
    const completedOrders = await prisma.order.count({
      where: { restaurantId, status: { in: completedStatuses } },
    });
    const cancelledOrders = await prisma.order.count({
      where: { restaurantId, status: 'cancelled' },
    });

    res.json({
      stages: [
        { name: 'Orders Placed', count: allOrders },
        { name: 'Completed', count: completedOrders },
        { name: 'Cancelled', count: cancelledOrders },
      ],
      conversionRate: allOrders > 0 ? Math.round((completedOrders / allOrders) * 1000) / 10 : 0,
    });
  } catch (error: unknown) {
    console.error('[Analytics] Error getting conversion funnel:', error);
    res.status(500).json({ error: 'Failed to get conversion funnel' });
  }
});

router.get('/:merchantId/analytics/forecast/revenue', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

    // Simple forecast: average daily revenue over last 30 days projected forward
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        status: { in: ['completed', 'delivered'] },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { total: true, createdAt: true },
    });

    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const avgDailyRevenue = orders.length > 0 ? totalRevenue / 30 : 0;

    const forecast = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() + i + 1);
      return {
        date: date.toISOString().split('T')[0],
        projectedRevenue: Math.round(avgDailyRevenue * 100) / 100,
      };
    });

    res.json({
      forecast,
      avgDailyRevenue: Math.round(avgDailyRevenue * 100) / 100,
      basedOnDays: 30,
      confidence: orders.length > 100 ? 'medium' : orders.length > 0 ? 'low' : null,
    });
  } catch (error: unknown) {
    console.error('[Analytics] Error getting revenue forecast:', error);
    res.status(500).json({ error: 'Failed to get revenue forecast' });
  }
});

router.get('/:merchantId/analytics/forecast/demand', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        status: { in: ['completed', 'delivered'] },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { createdAt: true },
    });

    // Group by day of week
    const byDayOfWeek: Record<number, number> = {};
    for (const order of orders) {
      const dow = order.createdAt.getDay();
      byDayOfWeek[dow] = (byDayOfWeek[dow] ?? 0) + 1;
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const forecast = dayNames.map((name, i) => ({
      dayOfWeek: i,
      dayName: name,
      avgOrders: Math.round(((byDayOfWeek[i] ?? 0) / 4) * 10) / 10, // ~4 weeks in 30 days
    }));

    res.json({
      forecast,
      basedOnDays: 30,
      confidence: orders.length > 100 ? 'medium' : orders.length > 0 ? 'low' : null,
    });
  } catch (error: unknown) {
    console.error('[Analytics] Error getting demand forecast:', error);
    res.status(500).json({ error: 'Failed to get demand forecast' });
  }
});

router.get('/:merchantId/analytics/forecast/staffing', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get order demand by day of week
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        status: { in: ['completed', 'delivered'] },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { createdAt: true },
    });

    const byDayOfWeek: Record<number, number> = {};
    for (const order of orders) {
      const dow = order.createdAt.getDay();
      byDayOfWeek[dow] = (byDayOfWeek[dow] ?? 0) + 1;
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    // Rough heuristic: 1 staff per 10 orders/day
    const forecast = dayNames.map((name, i) => {
      const avgOrders = ((byDayOfWeek[i] ?? 0) / 4);
      return {
        dayOfWeek: i,
        dayName: name,
        avgOrders: Math.round(avgOrders * 10) / 10,
        recommendedStaff: Math.max(1, Math.ceil(avgOrders / 10)),
      };
    });

    res.json({
      forecast,
      basedOnDays: 30,
      confidence: orders.length > 100 ? 'medium' : orders.length > 0 ? 'low' : null,
    });
  } catch (error: unknown) {
    console.error('[Analytics] Error getting staffing forecast:', error);
    res.status(500).json({ error: 'Failed to get staffing forecast' });
  }
});

export default router;
