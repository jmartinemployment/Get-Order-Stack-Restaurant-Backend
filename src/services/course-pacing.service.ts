import { PrismaClient } from '@prisma/client';

export interface CoursePacingMetrics {
  lookbackDays: number;
  sampleSize: number;
  tablePaceBaselineSeconds: number;
  p50Seconds: number;
  p80Seconds: number;
  confidence: 'low' | 'medium' | 'high';
  generatedAt: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = clamp((sortedValues.length - 1) * p, 0, sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * weight;
}

class CoursePacingService {
  private readonly prisma = new PrismaClient();

  async getRestaurantMetrics(restaurantId: string, lookbackDays = 30): Promise<CoursePacingMetrics> {
    const safeLookbackDays = clamp(Number.isFinite(lookbackDays) ? Math.round(lookbackDays) : 30, 1, 90);
    const since = new Date(Date.now() - safeLookbackDays * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.orderItem.findMany({
      where: {
        order: { restaurantId },
        courseGuid: { not: null },
        courseFiredAt: { not: null },
        completedAt: { not: null },
        createdAt: { gte: since },
      },
      select: {
        courseFiredAt: true,
        completedAt: true,
      },
    });

    const durations = rows
      .map(row => {
        if (!row.courseFiredAt || !row.completedAt) return null;
        return Math.round((row.completedAt.getTime() - row.courseFiredAt.getTime()) / 1000);
      })
      .filter((v): v is number => v !== null && Number.isFinite(v) && v > 0 && v <= 7200)
      .sort((a, b) => a - b);

    if (durations.length === 0) {
      return {
        lookbackDays: safeLookbackDays,
        sampleSize: 0,
        tablePaceBaselineSeconds: 900,
        p50Seconds: 900,
        p80Seconds: 1200,
        confidence: 'low',
        generatedAt: new Date().toISOString(),
      };
    }

    const p50 = Math.round(percentile(durations, 0.5));
    const p80 = Math.round(percentile(durations, 0.8));
    const weightedBaseline = Math.round(p50 * 0.7 + p80 * 0.3);

    const sampleSize = durations.length;
    const confidence: 'low' | 'medium' | 'high' =
      sampleSize >= 120 ? 'high' : sampleSize >= 40 ? 'medium' : 'low';

    return {
      lookbackDays: safeLookbackDays,
      sampleSize,
      tablePaceBaselineSeconds: clamp(weightedBaseline, 300, 2700),
      p50Seconds: clamp(p50, 60, 3600),
      p80Seconds: clamp(p80, 60, 5400),
      confidence,
      generatedAt: new Date().toISOString(),
    };
  }
}

export const coursePacingService = new CoursePacingService();
