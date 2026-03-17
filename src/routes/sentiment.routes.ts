import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { toErrorMessage } from '../utils/errors';

const prisma = new PrismaClient();

export const sentimentRouter = Router({ mergeParams: true });

// GET /:merchantId/analytics/sentiment
sentimentRouter.get('/analytics/sentiment', async (req: Request, res: Response) => {
  try {
    const merchantId = req.params.merchantId;
    const days = Number.parseInt(req.query.days as string, 10) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const records = await prisma.orderSentiment.findMany({
      where: { restaurantId: merchantId, analyzedAt: { gte: since } },
      orderBy: { analyzedAt: 'asc' },
    });

    const trendsMap = new Map<string, { positive: number; neutral: number; negative: number; total: number }>();
    const flagCounts = new Map<string, number>();
    let positive = 0;
    let neutral = 0;
    let negative = 0;
    let alertCount = 0;

    for (const r of records) {
      const dateKey = r.analyzedAt.toISOString().split('T')[0];
      const bucket = trendsMap.get(dateKey) ?? { positive: 0, neutral: 0, negative: 0, total: 0 };
      bucket.total += 1;

      if (r.sentiment === 'positive') {
        bucket.positive += 1;
        positive += 1;
      } else if (r.sentiment === 'negative') {
        bucket.negative += 1;
        negative += 1;
      } else {
        bucket.neutral += 1;
        neutral += 1;
      }

      trendsMap.set(dateKey, bucket);

      for (const flag of r.flags) {
        flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1);
      }

      if (r.urgency === 'high' || r.urgency === 'critical') {
        alertCount += 1;
      }
    }

    const trends = [...trendsMap.entries()].map(([date, b]) => ({
      date,
      avgScore: b.total > 0 ? Math.round((b.positive - b.negative) / b.total * 100) : 0,
      positive: b.positive,
      neutral: b.neutral,
      negative: b.negative,
    }));

    const topFlags = [...flagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([flag, count]) => ({ flag, count }));

    res.json({
      trends,
      topFlags,
      topKeywords: [],
      alertCount,
      totalAnalyzed: records.length,
      positive,
      neutral,
      negative,
    });
  } catch (error: unknown) {
    logger.error('[sentiment-routes] GET /analytics/sentiment failed', { error: toErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:merchantId/alerts/sentiment
sentimentRouter.get('/alerts/sentiment', async (req: Request, res: Response) => {
  try {
    const merchantId = req.params.merchantId;

    const records = await prisma.orderSentiment.findMany({
      where: { restaurantId: merchantId, isRead: false },
      orderBy: { analyzedAt: 'desc' },
      take: 50,
    });

    const alerts = records.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      orderNumber: r.orderNumber,
      tableNumber: r.tableNumber,
      sentiment: r.sentiment,
      flags: r.flags,
      urgency: r.urgency,
      summary: r.summary,
      isRead: r.isRead,
      analyzedAt: r.analyzedAt.toISOString(),
    }));

    res.json(alerts);
  } catch (error: unknown) {
    logger.error('[sentiment-routes] GET /alerts/sentiment failed', { error: toErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /:merchantId/alerts/sentiment/:id/read
sentimentRouter.patch('/alerts/sentiment/:id/read', async (req: Request, res: Response) => {
  try {
    const merchantId = req.params.merchantId;
    const { id } = req.params;

    const record = await prisma.orderSentiment.findFirst({
      where: { id, restaurantId: merchantId },
    });

    if (!record) {
      res.status(404).json({ error: 'Sentiment record not found' });
      return;
    }

    await prisma.orderSentiment.update({
      where: { id },
      data: { isRead: true },
    });

    res.json({ success: true });
  } catch (error: unknown) {
    logger.error('[sentiment-routes] PATCH /alerts/sentiment/:id/read failed', { error: toErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /:merchantId/alerts/sentiment/read-all
sentimentRouter.patch('/alerts/sentiment/read-all', async (req: Request, res: Response) => {
  try {
    const merchantId = req.params.merchantId;

    const result = await prisma.orderSentiment.updateMany({
      where: { restaurantId: merchantId, isRead: false },
      data: { isRead: true },
    });

    res.json({ count: result.count });
  } catch (error: unknown) {
    logger.error('[sentiment-routes] PATCH /alerts/sentiment/read-all failed', { error: toErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});
