import { PrismaClient } from '@prisma/client';
import type { AIFeatureKey } from './ai-config.service';

const prisma = new PrismaClient();

// Sonnet pricing: $3/MTok input, $15/MTok output
const INPUT_COST_PER_MTOK_CENTS = 300;
const OUTPUT_COST_PER_MTOK_CENTS = 1500;

function calculateCostCents(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * INPUT_COST_PER_MTOK_CENTS;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_MTOK_CENTS;
  return Math.round(inputCost + outputCost);
}

export interface FeatureUsageSummary {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
}

export interface UsageSummary {
  byFeature: Record<string, FeatureUsageSummary>;
  totalCostCents: number;
  periodStart: string;
  periodEnd: string;
}

export const aiUsageService = {
  async logUsage(
    restaurantId: string,
    featureKey: AIFeatureKey,
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    const estimatedCostCents = calculateCostCents(inputTokens, outputTokens);

    await prisma.aiUsageLog.create({
      data: {
        restaurantId,
        featureKey,
        inputTokens,
        outputTokens,
        estimatedCostCents,
      },
    });
  },

  async getUsageSummary(
    restaurantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<UsageSummary> {
    const logs = await prisma.aiUsageLog.groupBy({
      by: ['featureKey'],
      where: {
        restaurantId,
        calledAt: { gte: startDate, lte: endDate },
      },
      _count: { id: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        estimatedCostCents: true,
      },
    });

    const byFeature: Record<string, FeatureUsageSummary> = {};
    let totalCostCents = 0;

    for (const row of logs) {
      const summary: FeatureUsageSummary = {
        calls: row._count.id,
        inputTokens: row._sum.inputTokens ?? 0,
        outputTokens: row._sum.outputTokens ?? 0,
        estimatedCostCents: row._sum.estimatedCostCents ?? 0,
      };
      byFeature[row.featureKey] = summary;
      totalCostCents += summary.estimatedCostCents;
    }

    return {
      byFeature,
      totalCostCents,
      periodStart: startDate.toISOString(),
      periodEnd: endDate.toISOString(),
    };
  },

  async getCurrentMonthUsage(restaurantId: string): Promise<UsageSummary> {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return this.getUsageSummary(restaurantId, startDate, endDate);
  },
};
