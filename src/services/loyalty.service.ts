import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TIER_RANK: Record<string, number> = { bronze: 0, silver: 1, gold: 2, platinum: 3 };

function tierMeetsMinimum(customerTier: string, minTier: string): boolean {
  return (TIER_RANK[customerTier] ?? 0) >= (TIER_RANK[minTier] ?? 0);
}

export const loyaltyService = {
  /**
   * Get or create default loyalty config for a restaurant
   */
  async getConfig(restaurantId: string) {
    const existing = await prisma.restaurantLoyaltyConfig.findUnique({
      where: { restaurantId },
    });

    if (existing) return existing;

    return prisma.restaurantLoyaltyConfig.create({
      data: { restaurantId },
    });
  },

  /**
   * Partial update loyalty config
   */
  async updateConfig(restaurantId: string, data: Record<string, unknown>) {
    // Ensure config exists first
    await loyaltyService.getConfig(restaurantId);

    return prisma.restaurantLoyaltyConfig.update({
      where: { restaurantId },
      data,
    });
  },

  /**
   * Calculate points earned for an order subtotal
   */
  calculatePointsEarned(
    subtotal: number,
    config: { pointsPerDollar: number; silverMultiplier: unknown; goldMultiplier: unknown; platinumMultiplier: unknown },
    tier: string,
  ): number {
    let multiplier = 1;
    if (tier === 'silver') multiplier = Number(config.silverMultiplier);
    else if (tier === 'gold') multiplier = Number(config.goldMultiplier);
    else if (tier === 'platinum') multiplier = Number(config.platinumMultiplier);

    return Math.floor(subtotal * config.pointsPerDollar * multiplier);
  },

  /**
   * Determine tier from lifetime points earned
   */
  calculateTier(
    totalPointsEarned: number,
    config: { tierSilverMin: number; tierGoldMin: number; tierPlatinumMin: number },
  ): string {
    if (totalPointsEarned >= config.tierPlatinumMin) return 'platinum';
    if (totalPointsEarned >= config.tierGoldMin) return 'gold';
    if (totalPointsEarned >= config.tierSilverMin) return 'silver';
    return 'bronze';
  },

  /**
   * Award points to a customer for an order
   */
  async awardPoints(customerId: string, orderId: string, points: number, restaurantId: string) {
    const customer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        loyaltyPoints: { increment: points },
        totalPointsEarned: { increment: points },
      },
    });

    await prisma.loyaltyTransaction.create({
      data: {
        restaurantId,
        customerId,
        orderId,
        type: 'earn',
        points,
        balanceAfter: customer.loyaltyPoints,
        description: `Earned ${points} points on order`,
      },
    });

    // Check for tier upgrade
    const config = await loyaltyService.getConfig(restaurantId);
    const newTier = loyaltyService.calculateTier(customer.totalPointsEarned, config);
    if (newTier !== customer.loyaltyTier) {
      await prisma.customer.update({
        where: { id: customerId },
        data: { loyaltyTier: newTier },
      });
    }

    return customer;
  },

  /**
   * Redeem points — atomic transaction to prevent race conditions
   */
  async redeemPoints(customerId: string, orderId: string, points: number, restaurantId: string) {
    return prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      if (customer.loyaltyPoints < points) {
        throw new Error(`Insufficient points: has ${customer.loyaltyPoints}, needs ${points}`);
      }

      const updated = await tx.customer.update({
        where: { id: customerId },
        data: {
          loyaltyPoints: { decrement: points },
          totalPointsRedeemed: { increment: points },
        },
      });

      await tx.loyaltyTransaction.create({
        data: {
          restaurantId,
          customerId,
          orderId,
          type: 'redeem',
          points: -points,
          balanceAfter: updated.loyaltyPoints,
          description: `Redeemed ${points} points on order`,
        },
      });

      return updated;
    });
  },

  /**
   * Reverse earned points and refund redeemed points when order is cancelled
   */
  async reverseOrder(orderId: string, restaurantId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || !order.customerId) return;

    const { loyaltyPointsEarned, loyaltyPointsRedeemed, customerId } = order;

    if (loyaltyPointsEarned === 0 && loyaltyPointsRedeemed === 0) return;

    return prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer) return;

      let newBalance = customer.loyaltyPoints;

      // Reverse earned points
      if (loyaltyPointsEarned > 0) {
        newBalance -= loyaltyPointsEarned;

        await tx.customer.update({
          where: { id: customerId },
          data: {
            loyaltyPoints: { decrement: loyaltyPointsEarned },
            totalPointsEarned: { decrement: loyaltyPointsEarned },
          },
        });

        await tx.loyaltyTransaction.create({
          data: {
            restaurantId,
            customerId,
            orderId,
            type: 'reversal',
            points: -loyaltyPointsEarned,
            balanceAfter: newBalance,
            description: `Reversed ${loyaltyPointsEarned} earned points (order cancelled)`,
          },
        });
      }

      // Refund redeemed points
      if (loyaltyPointsRedeemed > 0) {
        newBalance += loyaltyPointsRedeemed;

        await tx.customer.update({
          where: { id: customerId },
          data: {
            loyaltyPoints: { increment: loyaltyPointsRedeemed },
            totalPointsRedeemed: { decrement: loyaltyPointsRedeemed },
          },
        });

        await tx.loyaltyTransaction.create({
          data: {
            restaurantId,
            customerId,
            orderId,
            type: 'reversal',
            points: loyaltyPointsRedeemed,
            balanceAfter: newBalance,
            description: `Refunded ${loyaltyPointsRedeemed} redeemed points (order cancelled)`,
          },
        });
      }

      // Reset loyalty fields on the order
      await tx.order.update({
        where: { id: orderId },
        data: {
          loyaltyPointsEarned: 0,
          loyaltyPointsRedeemed: 0,
          discount: 0,
        },
      });
    });
  },

  /**
   * Calculate dollar discount from points
   */
  calculateDiscount(points: number, config: { pointsRedemptionRate: unknown }): number {
    return Math.round(points * Number(config.pointsRedemptionRate) * 100) / 100;
  },

  /**
   * Get customer loyalty profile
   */
  async getCustomerLoyalty(customerId: string, restaurantId: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    const config = await loyaltyService.getConfig(restaurantId);
    const currentTier = customer.loyaltyTier;
    const totalEarned = customer.totalPointsEarned;

    // Determine next tier and progress
    let nextTier: string | null = null;
    let pointsToNextTier = 0;
    let tierProgress = 100;

    if (currentTier === 'bronze') {
      nextTier = 'silver';
      pointsToNextTier = Math.max(0, config.tierSilverMin - totalEarned);
      tierProgress = Math.min(100, Math.round((totalEarned / config.tierSilverMin) * 100));
    } else if (currentTier === 'silver') {
      nextTier = 'gold';
      pointsToNextTier = Math.max(0, config.tierGoldMin - totalEarned);
      tierProgress = Math.min(100, Math.round(((totalEarned - config.tierSilverMin) / (config.tierGoldMin - config.tierSilverMin)) * 100));
    } else if (currentTier === 'gold') {
      nextTier = 'platinum';
      pointsToNextTier = Math.max(0, config.tierPlatinumMin - totalEarned);
      tierProgress = Math.min(100, Math.round(((totalEarned - config.tierGoldMin) / (config.tierPlatinumMin - config.tierGoldMin)) * 100));
    }

    return {
      customerId,
      points: customer.loyaltyPoints,
      tier: currentTier,
      totalPointsEarned: totalEarned,
      totalPointsRedeemed: customer.totalPointsRedeemed,
      nextTier,
      pointsToNextTier,
      tierProgress,
    };
  },

  /**
   * Get points transaction history for a customer
   */
  async getPointsHistory(customerId: string, limit = 50) {
    return prisma.loyaltyTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  /**
   * Get active rewards the customer qualifies for
   */
  async getAvailableRewards(restaurantId: string, customerTier: string) {
    const rewards = await prisma.loyaltyReward.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      orderBy: { pointsCost: 'asc' },
    });

    return rewards.filter((reward) => tierMeetsMinimum(customerTier, reward.minTier));
  },

  /**
   * Admin manual point adjustment
   */
  async adjustPoints(customerId: string, points: number, reason: string, restaurantId: string) {
    const customer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        loyaltyPoints: { increment: points },
        ...(points > 0 ? { totalPointsEarned: { increment: points } } : {}),
      },
    });

    await prisma.loyaltyTransaction.create({
      data: {
        restaurantId,
        customerId,
        type: 'adjustment',
        points,
        balanceAfter: customer.loyaltyPoints,
        description: reason,
      },
    });

    // Check for tier upgrade if points added
    if (points > 0) {
      const config = await loyaltyService.getConfig(restaurantId);
      const newTier = loyaltyService.calculateTier(customer.totalPointsEarned, config);
      if (newTier !== customer.loyaltyTier) {
        await prisma.customer.update({
          where: { id: customerId },
          data: { loyaltyTier: newTier },
        });
      }
    }

    return customer;
  },
};
