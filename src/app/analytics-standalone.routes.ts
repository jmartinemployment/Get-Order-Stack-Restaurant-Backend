import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.middleware';

const prisma = new PrismaClient();
const router = Router();

// GET /api/analytics/pinned-widgets?merchantId=xxx
router.get('/pinned-widgets', requireAuth, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.query.merchantId as string;
    if (!restaurantId) {
      res.status(400).json({ error: 'restaurantId query param is required' });
      return;
    }

    // Read from restaurant merchantProfile JSON
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { merchantProfile: true },
    });

    const profile = (restaurant?.merchantProfile as Record<string, unknown>) ?? {};
    const widgets = (profile.pinnedWidgets as unknown[]) ?? [];
    res.json(widgets);
  } catch (error: unknown) {
    console.error('[Analytics] Pinned widgets error:', error instanceof Error ? error.message : String(error));
    res.json([]);
  }
});

// POST /api/analytics/pinned-widgets
router.post('/pinned-widgets', requireAuth, async (req: Request, res: Response) => {
  try {
    const { merchantId: restaurantId, ...widget } = req.body;
    if (!restaurantId) {
      res.status(400).json({ error: 'restaurantId is required' });
      return;
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { merchantProfile: true },
    });

    const profile = (restaurant?.merchantProfile as Record<string, unknown>) ?? {};
    const widgets = ((profile.pinnedWidgets as unknown[]) ?? []) as Record<string, unknown>[];
    widgets.push(widget);

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        merchantProfile: JSON.parse(JSON.stringify({ ...profile, pinnedWidgets: widgets })),
      },
    });

    res.json(widget);
  } catch (error: unknown) {
    console.error('[Analytics] Save pinned widget error:', error instanceof Error ? error.message : String(error));
    res.status(500).json({ error: 'Failed to save pinned widget' });
  }
});

// DELETE /api/analytics/pinned-widgets/:widgetId
router.delete('/pinned-widgets/:widgetId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { widgetId } = req.params;
    const restaurantId = req.query.merchantId as string;
    if (!restaurantId) {
      res.status(400).json({ error: 'restaurantId query param is required' });
      return;
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { merchantProfile: true },
    });

    const profile = (restaurant?.merchantProfile as Record<string, unknown>) ?? {};
    const widgets = ((profile.pinnedWidgets as unknown[]) ?? []) as Record<string, unknown>[];
    const filtered = widgets.filter((w) => w.id !== widgetId);

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        merchantProfile: JSON.parse(JSON.stringify({ ...profile, pinnedWidgets: filtered })),
      },
    });

    res.json({ success: true });
  } catch (error: unknown) {
    console.error('[Analytics] Delete pinned widget error:', error instanceof Error ? error.message : String(error));
    res.status(500).json({ error: 'Failed to delete pinned widget' });
  }
});

// GET /api/analytics/proactive-insights?restaurantId=xxx
router.get('/proactive-insights', requireAuth, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.query.merchantId as string;
    if (!restaurantId) {
      res.status(400).json({ error: 'restaurantId query param is required' });
      return;
    }

    // Generate insights from recent order data
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);

    const [todayOrders, yesterdayOrders] = await Promise.all([
      prisma.order.count({ where: { restaurantId, createdAt: { gte: todayStart } } }),
      prisma.order.count({ where: { restaurantId, createdAt: { gte: yesterdayStart, lt: todayStart } } }),
    ]);

    const insights: { id: string; type: string; title: string; message: string; severity: string; createdAt: string }[] = [];

    if (todayOrders > 0 && yesterdayOrders > 0) {
      const changePercent = Math.round(((todayOrders - yesterdayOrders) / yesterdayOrders) * 100);
      if (changePercent > 20) {
        insights.push({
          id: `insight-orders-up-${todayStart.toISOString()}`,
          type: 'trend',
          title: 'Orders Trending Up',
          message: `Today's orders are ${changePercent}% higher than yesterday. Consider increasing staff.`,
          severity: 'info',
          createdAt: now.toISOString(),
        });
      } else if (changePercent < -20) {
        insights.push({
          id: `insight-orders-down-${todayStart.toISOString()}`,
          type: 'trend',
          title: 'Orders Trending Down',
          message: `Today's orders are ${Math.abs(changePercent)}% lower than yesterday.`,
          severity: 'warning',
          createdAt: now.toISOString(),
        });
      }
    }

    res.json(insights);
  } catch (error: unknown) {
    console.error('[Analytics] Proactive insights error:', error instanceof Error ? error.message : String(error));
    res.json([]);
  }
});

export default router;
