/**
 * Order Profit Insight Service
 * Calculates profit metrics for completed orders
 * Shows staff the profitability of each order
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface OrderProfitInsight {
  orderId: string;
  orderNumber: string;
  subtotal: number;
  estimatedCost: number;
  estimatedProfit: number;
  profitMargin: number;
  itemCount: number;
  starItem: {
    name: string;
    profit: number;
    margin: number;
  } | null;
  insightText: string;
  quickTip: string;
}

export class OrderProfitService {
  /**
   * Generate profit insight for an order
   */
  async getOrderProfitInsight(orderId: string): Promise<OrderProfitInsight | null> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: {
          include: {
            menuItem: true
          }
        }
      }
    });

    if (!order) {
      return null;
    }

    let totalCost = 0;
    let starItem: { name: string; profit: number; margin: number } | null = null;
    let highestProfit = 0;

    // Calculate costs and find star item
    for (const orderItem of order.orderItems) {
      const menuItem = orderItem.menuItem;
      
      if (menuItem) {
        // Use AI estimated cost if available, otherwise estimate at 33% of price
        const itemCost = menuItem.aiEstimatedCost 
          ? Number(menuItem.aiEstimatedCost) 
          : Number(orderItem.unitPrice) * 0.33;
        
        const itemTotalCost = itemCost * orderItem.quantity;
        totalCost += itemTotalCost;

        // Calculate item profit
        const itemRevenue = Number(orderItem.totalPrice);
        const itemProfit = itemRevenue - itemTotalCost;
        const itemMargin = itemRevenue > 0 ? (itemProfit / itemRevenue) * 100 : 0;

        // Track highest profit item (star)
        if (itemProfit > highestProfit) {
          highestProfit = itemProfit;
          starItem = {
            name: menuItem.name,
            profit: Math.round(itemProfit * 100) / 100,
            margin: Math.round(itemMargin)
          };
        }
      } else {
        // No menu item linked - estimate 33% cost
        totalCost += Number(orderItem.totalPrice) * 0.33;
      }
    }

    const subtotal = Number(order.subtotal);
    const estimatedProfit = subtotal - totalCost;
    const profitMargin = subtotal > 0 ? (estimatedProfit / subtotal) * 100 : 0;

    // Generate insight text
    const insightText = this.generateInsightText(
      order.orderNumber,
      estimatedProfit,
      profitMargin,
      starItem
    );

    // Generate quick tip
    const quickTip = this.generateQuickTip(profitMargin, starItem);

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      subtotal: Math.round(subtotal * 100) / 100,
      estimatedCost: Math.round(totalCost * 100) / 100,
      estimatedProfit: Math.round(estimatedProfit * 100) / 100,
      profitMargin: Math.round(profitMargin),
      itemCount: order.orderItems.length,
      starItem,
      insightText,
      quickTip
    };
  }

  /**
   * Generate human-readable insight text
   */
  private generateInsightText(
    orderNumber: string,
    profit: number,
    margin: number,
    starItem: { name: string; profit: number; margin: number } | null
  ): string {
    const profitStr = profit.toFixed(2);
    const marginStr = Math.round(margin);

    if (margin >= 70) {
      return `🌟 Excellent! Order ${orderNumber} has a ${marginStr}% margin ($${profitStr} profit).${starItem ? ` ${starItem.name} is your star!` : ''}`;
    } else if (margin >= 60) {
      return `✅ Order ${orderNumber} placed - ${marginStr}% margin ($${profitStr} profit).${starItem ? ` ${starItem.name} performed well.` : ''}`;
    } else if (margin >= 50) {
      return `📊 Order ${orderNumber} has ${marginStr}% margin ($${profitStr} profit). Consider upselling higher-margin items next time.`;
    } else {
      return `⚠️ Order ${orderNumber} has only ${marginStr}% margin ($${profitStr} profit). Focus on promoting profitable items.`;
    }
  }

  /**
   * Generate a quick actionable tip
   */
  private generateQuickTip(margin: number, starItem: { name: string; profit: number; margin: number } | null): string {
    if (margin >= 70) {
      return starItem 
        ? `Great sale! Keep recommending ${starItem.name}.`
        : 'Excellent profit on this order!';
    } else if (margin >= 60) {
      return 'Solid order. Try suggesting appetizers or drinks for even better margins.';
    } else if (margin >= 50) {
      return 'Tip: Suggest our high-margin items like cocktails or appetizers.';
    } else {
      return 'This order had lower margins. Focus on upselling profitable items.';
    }
  }

  /**
   * Get profit insights for recent orders (for dashboard)
   */
  async getRecentOrdersProfit(restaurantId: string, limit: number = 10): Promise<{
    orders: OrderProfitInsight[];
    summary: {
      totalRevenue: number;
      totalProfit: number;
      avgMargin: number;
      orderCount: number;
    };
  }> {
    const recentOrders = await prisma.order.findMany({
      where: { 
        restaurantId,
        status: { in: ['completed', 'ready', 'preparing'] }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true }
    });

    const insights: OrderProfitInsight[] = [];
    let totalRevenue = 0;
    let totalProfit = 0;

    for (const order of recentOrders) {
      const insight = await this.getOrderProfitInsight(order.id);
      if (insight) {
        insights.push(insight);
        totalRevenue += insight.subtotal;
        totalProfit += insight.estimatedProfit;
      }
    }

    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      orders: insights,
      summary: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        avgMargin: Math.round(avgMargin),
        orderCount: insights.length
      }
    };
  }
}

export const orderProfitService = new OrderProfitService();
