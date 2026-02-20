/**
 * AI Sales Insights Service
 * Generates AI-powered insights from sales data
 * - Daily/weekly summaries
 * - Trend analysis
 * - Actionable recommendations
 */

import { PrismaClient } from '@prisma/client';
import { aiConfigService } from './ai-config.service';
import { aiUsageService } from './ai-usage.service';

const prisma = new PrismaClient();

export interface SalesSummary {
  period: string;
  periodStart: string;
  periodEnd: string;
  totalOrders: number;
  totalRevenue: number;
  totalProfit: number;
  avgTicket: number;
  avgProfitMargin: number;
  topSellingItems: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
  topProfitableItems: Array<{
    name: string;
    quantity: number;
    profit: number;
    margin: number;
  }>;
  ordersByType: Record<string, number>;
  ordersByHour: Record<number, number>;
  comparisonToPrevious?: {
    revenueChange: number;
    revenueChangePercent: number;
    ordersChange: number;
    ordersChangePercent: number;
    avgTicketChange: number;
    avgTicketChangePercent: number;
  };
}

export interface SalesInsight {
  type: 'success' | 'warning' | 'opportunity' | 'info';
  title: string;
  message: string;
  metric?: string;
  actionable: boolean;
  priority: 'high' | 'medium' | 'low';
}

export interface DailyInsightsReport {
  restaurantId: string;
  restaurantName: string;
  date: string;
  summary: SalesSummary;
  insights: SalesInsight[];
  recommendations: string[];
}

export class SalesInsightsService {

  /**
   * Get sales summary for a specific period
   */
  async getSalesSummary(
    restaurantId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<SalesSummary> {
    // Get completed orders in the period
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        status: { in: ['completed', 'ready', 'delivered'] },
        createdAt: {
          gte: periodStart,
          lte: periodEnd
        }
      },
      include: {
        orderItems: {
          include: {
            menuItem: true
          }
        }
      }
    });

    // Get menu items for profit calculation
    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId }
    });

    const menuItemCosts = new Map<string, number>();
    for (const item of menuItems) {
      menuItemCosts.set(item.id, Number(item.aiEstimatedCost || item.cost || 0));
    }

    // Aggregate metrics
    let totalRevenue = 0;
    let totalProfit = 0;
    const itemSales = new Map<string, { name: string; quantity: number; revenue: number; profit: number; cost: number }>();
    const ordersByType: Record<string, number> = {};
    const ordersByHour: Record<number, number> = {};

    for (const order of orders) {
      totalRevenue += Number(order.total);
      
      // Track order type
      ordersByType[order.orderType] = (ordersByType[order.orderType] || 0) + 1;
      
      // Track hour
      const hour = new Date(order.createdAt).getHours();
      ordersByHour[hour] = (ordersByHour[hour] || 0) + 1;

      for (const item of order.orderItems) {
        const itemId = item.menuItemId || item.menuItemName;
        const cost = item.menuItemId ? (menuItemCosts.get(item.menuItemId) || 0) : 0;
        const itemProfit = (Number(item.unitPrice) - cost) * item.quantity;
        totalProfit += itemProfit;

        const existing = itemSales.get(itemId) || { 
          name: item.menuItemName, 
          quantity: 0, 
          revenue: 0, 
          profit: 0,
          cost 
        };
        existing.quantity += item.quantity;
        existing.revenue += Number(item.totalPrice);
        existing.profit += itemProfit;
        itemSales.set(itemId, existing);
      }
    }

    // Sort items
    const sortedBySales = [...itemSales.values()].sort((a, b) => b.quantity - a.quantity);
    const sortedByProfit = [...itemSales.values()].sort((a, b) => b.profit - a.profit);

    const avgTicket = orders.length > 0 ? totalRevenue / orders.length : 0;
    const avgProfitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      period: this.formatPeriod(periodStart, periodEnd),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      totalOrders: orders.length,
      totalRevenue,
      totalProfit,
      avgTicket,
      avgProfitMargin,
      topSellingItems: sortedBySales.slice(0, 5).map(i => ({
        name: i.name,
        quantity: i.quantity,
        revenue: i.revenue
      })),
      topProfitableItems: sortedByProfit.slice(0, 5).map(i => ({
        name: i.name,
        quantity: i.quantity,
        profit: i.profit,
        margin: i.revenue > 0 ? (i.profit / i.revenue) * 100 : 0
      })),
      ordersByType,
      ordersByHour
    };
  }

  /**
   * Get daily insights report with AI analysis
   */
  async getDailyInsights(restaurantId: string, date?: Date): Promise<DailyInsightsReport | null> {
    try {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId }
      });

      if (!restaurant) {
        throw new Error('Restaurant not found');
      }

      const targetDate = date || new Date();
      const dayStart = new Date(targetDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(targetDate);
      dayEnd.setHours(23, 59, 59, 999);

      // Get today's summary
      const todaySummary = await this.getSalesSummary(restaurantId, dayStart, dayEnd);

      // Get previous day for comparison
      const prevDayStart = new Date(dayStart);
      prevDayStart.setDate(prevDayStart.getDate() - 1);
      const prevDayEnd = new Date(dayEnd);
      prevDayEnd.setDate(prevDayEnd.getDate() - 1);
      const prevSummary = await this.getSalesSummary(restaurantId, prevDayStart, prevDayEnd);

      // Get same day last week for comparison
      const weekAgoStart = new Date(dayStart);
      weekAgoStart.setDate(weekAgoStart.getDate() - 7);
      const weekAgoEnd = new Date(dayEnd);
      weekAgoEnd.setDate(weekAgoEnd.getDate() - 7);
      const weekAgoSummary = await this.getSalesSummary(restaurantId, weekAgoStart, weekAgoEnd);

      // Add comparison data
      if (prevSummary.totalOrders > 0) {
        todaySummary.comparisonToPrevious = {
          revenueChange: todaySummary.totalRevenue - prevSummary.totalRevenue,
          revenueChangePercent: prevSummary.totalRevenue > 0 
            ? ((todaySummary.totalRevenue - prevSummary.totalRevenue) / prevSummary.totalRevenue) * 100 
            : 0,
          ordersChange: todaySummary.totalOrders - prevSummary.totalOrders,
          ordersChangePercent: prevSummary.totalOrders > 0
            ? ((todaySummary.totalOrders - prevSummary.totalOrders) / prevSummary.totalOrders) * 100
            : 0,
          avgTicketChange: todaySummary.avgTicket - prevSummary.avgTicket,
          avgTicketChangePercent: prevSummary.avgTicket > 0
            ? ((todaySummary.avgTicket - prevSummary.avgTicket) / prevSummary.avgTicket) * 100
            : 0
        };
      }

      // Generate insights
      const insights = await this.generateInsights(todaySummary, prevSummary, weekAgoSummary);
      const recommendations = await this.generateRecommendations(restaurantId, todaySummary, restaurant.name);

      return {
        restaurantId,
        restaurantName: restaurant.name,
        date: targetDate.toISOString().split('T')[0],
        summary: todaySummary,
        insights,
        recommendations
      };
    } catch (error) {
      console.error('Error generating daily insights:', error);
      return null;
    }
  }

  /**
   * Get weekly insights summary
   */
  async getWeeklyInsights(restaurantId: string, weeksAgo: number = 0): Promise<DailyInsightsReport | null> {
    try {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId }
      });

      if (!restaurant) {
        throw new Error('Restaurant not found');
      }

      // Calculate week boundaries
      const now = new Date();
      const dayOfWeek = now.getDay();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - dayOfWeek - (weeksAgo * 7));
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      // Get this week's summary
      const thisWeekSummary = await this.getSalesSummary(restaurantId, weekStart, weekEnd);

      // Get previous week for comparison
      const prevWeekStart = new Date(weekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekEnd = new Date(weekEnd);
      prevWeekEnd.setDate(prevWeekEnd.getDate() - 7);
      const prevWeekSummary = await this.getSalesSummary(restaurantId, prevWeekStart, prevWeekEnd);

      // Add comparison
      if (prevWeekSummary.totalOrders > 0) {
        thisWeekSummary.comparisonToPrevious = {
          revenueChange: thisWeekSummary.totalRevenue - prevWeekSummary.totalRevenue,
          revenueChangePercent: prevWeekSummary.totalRevenue > 0
            ? ((thisWeekSummary.totalRevenue - prevWeekSummary.totalRevenue) / prevWeekSummary.totalRevenue) * 100
            : 0,
          ordersChange: thisWeekSummary.totalOrders - prevWeekSummary.totalOrders,
          ordersChangePercent: prevWeekSummary.totalOrders > 0
            ? ((thisWeekSummary.totalOrders - prevWeekSummary.totalOrders) / prevWeekSummary.totalOrders) * 100
            : 0,
          avgTicketChange: thisWeekSummary.avgTicket - prevWeekSummary.avgTicket,
          avgTicketChangePercent: prevWeekSummary.avgTicket > 0
            ? ((thisWeekSummary.avgTicket - prevWeekSummary.avgTicket) / prevWeekSummary.avgTicket) * 100
            : 0
        };
      }

      const insights = await this.generateInsights(thisWeekSummary, prevWeekSummary);
      const recommendations = await this.generateRecommendations(restaurantId, thisWeekSummary, restaurant.name);

      return {
        restaurantId,
        restaurantName: restaurant.name,
        date: `Week of ${weekStart.toISOString().split('T')[0]}`,
        summary: thisWeekSummary,
        insights,
        recommendations
      };
    } catch (error) {
      console.error('Error generating weekly insights:', error);
      return null;
    }
  }

  private formatPeriod(start: Date, end: Date): string {
    const sameDay = start.toDateString() === end.toDateString();
    if (sameDay) {
      return start.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    }
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  private async generateInsights(
    current: SalesSummary,
    previous: SalesSummary,
    weekAgo?: SalesSummary
  ): Promise<SalesInsight[]> {
    const insights: SalesInsight[] = [];

    // Revenue comparison
    if (current.comparisonToPrevious) {
      const { revenueChangePercent, ordersChangePercent, avgTicketChangePercent } = current.comparisonToPrevious;

      if (revenueChangePercent > 10) {
        insights.push({
          type: 'success',
          title: 'Revenue Up!',
          message: `Revenue increased ${revenueChangePercent.toFixed(0)}% compared to yesterday`,
          metric: `$${current.totalRevenue.toFixed(2)}`,
          actionable: false,
          priority: 'high'
        });
      } else if (revenueChangePercent < -10) {
        insights.push({
          type: 'warning',
          title: 'Revenue Down',
          message: `Revenue decreased ${Math.abs(revenueChangePercent).toFixed(0)}% compared to yesterday`,
          metric: `$${current.totalRevenue.toFixed(2)}`,
          actionable: true,
          priority: 'high'
        });
      }

      if (avgTicketChangePercent > 15) {
        insights.push({
          type: 'success',
          title: 'Higher Average Ticket',
          message: `Average order value up ${avgTicketChangePercent.toFixed(0)}% to $${current.avgTicket.toFixed(2)}`,
          actionable: false,
          priority: 'medium'
        });
      }
    }

    // Top seller insight
    if (current.topSellingItems.length > 0) {
      const topItem = current.topSellingItems[0];
      insights.push({
        type: 'info',
        title: 'Top Seller',
        message: `${topItem.name} was your best seller with ${topItem.quantity} sold`,
        metric: `$${topItem.revenue.toFixed(2)} revenue`,
        actionable: false,
        priority: 'medium'
      });
    }

    // Profit margin insight
    if (current.avgProfitMargin < 60) {
      insights.push({
        type: 'warning',
        title: 'Profit Margin Alert',
        message: `Average profit margin is ${current.avgProfitMargin.toFixed(0)}%. Industry target is 65-70%.`,
        actionable: true,
        priority: 'high'
      });
    } else if (current.avgProfitMargin >= 70) {
      insights.push({
        type: 'success',
        title: 'Strong Margins',
        message: `Your ${current.avgProfitMargin.toFixed(0)}% profit margin exceeds industry benchmarks`,
        actionable: false,
        priority: 'low'
      });
    }

    // Week-over-week comparison
    if (weekAgo && weekAgo.totalOrders > 0) {
      const weekChangePercent = ((current.totalRevenue - weekAgo.totalRevenue) / weekAgo.totalRevenue) * 100;
      if (Math.abs(weekChangePercent) > 20) {
        insights.push({
          type: weekChangePercent > 0 ? 'success' : 'warning',
          title: 'Week-over-Week',
          message: `Revenue ${weekChangePercent > 0 ? 'up' : 'down'} ${Math.abs(weekChangePercent).toFixed(0)}% vs same day last week`,
          actionable: weekChangePercent < 0,
          priority: 'medium'
        });
      }
    }

    // Peak hours
    const peakHour = Object.entries(current.ordersByHour)
      .sort(([, a], [, b]) => b - a)[0];
    if (peakHour) {
      const hour = parseInt(peakHour[0]);
      const hourLabel = hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`;
      insights.push({
        type: 'info',
        title: 'Peak Hour',
        message: `Your busiest time was ${hourLabel} with ${peakHour[1]} orders`,
        actionable: false,
        priority: 'low'
      });
    }

    return insights;
  }

  private async generateRecommendations(restaurantId: string, summary: SalesSummary, restaurantName: string): Promise<string[]> {
    const client = await aiConfigService.getAnthropicClientForRestaurant(restaurantId, 'salesInsights');
    if (!client) {
      return this.generateBasicRecommendations(summary);
    }

    try {
      const prompt = `You are a restaurant business advisor. Based on this sales data for ${restaurantName}, provide 3-4 specific, actionable recommendations.

SALES DATA:
- Period: ${summary.period}
- Total Orders: ${summary.totalOrders}
- Total Revenue: $${summary.totalRevenue.toFixed(2)}
- Average Ticket: $${summary.avgTicket.toFixed(2)}
- Average Profit Margin: ${summary.avgProfitMargin.toFixed(0)}%

TOP SELLERS: ${summary.topSellingItems.map(i => `${i.name} (${i.quantity} sold)`).join(', ')}

TOP PROFITABLE: ${summary.topProfitableItems.map(i => `${i.name} (${i.margin.toFixed(0)}% margin)`).join(', ')}

${summary.comparisonToPrevious ? `
COMPARED TO PREVIOUS PERIOD:
- Revenue: ${summary.comparisonToPrevious.revenueChangePercent > 0 ? '+' : ''}${summary.comparisonToPrevious.revenueChangePercent.toFixed(0)}%
- Orders: ${summary.comparisonToPrevious.ordersChangePercent > 0 ? '+' : ''}${summary.comparisonToPrevious.ordersChangePercent.toFixed(0)}%
- Avg Ticket: ${summary.comparisonToPrevious.avgTicketChangePercent > 0 ? '+' : ''}${summary.comparisonToPrevious.avgTicketChangePercent.toFixed(0)}%
` : ''}

Provide recommendations as a JSON array of strings. Each should be:
- Specific and actionable
- Reference actual data where relevant
- Written for a restaurant owner (practical, not theoretical)

Format: ["Recommendation 1", "Recommendation 2", "Recommendation 3"]`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }]
      });

      await aiUsageService.logUsage(restaurantId, 'salesInsights', response.usage.input_tokens, response.usage.output_tokens);

      const content = response.content[0];
      if (content.type !== 'text') {
        return this.generateBasicRecommendations(summary);
      }

      const jsonMatch = content.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return this.generateBasicRecommendations(summary);
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('AI recommendations failed:', error);
      return this.generateBasicRecommendations(summary);
    }
  }

  private generateBasicRecommendations(summary: SalesSummary): string[] {
    const recommendations: string[] = [];

    if (summary.avgProfitMargin < 65) {
      recommendations.push(`Your profit margin (${summary.avgProfitMargin.toFixed(0)}%) is below target. Review your highest-volume items for potential price increases or portion adjustments.`);
    }

    if (summary.topSellingItems.length > 0 && summary.topProfitableItems.length > 0) {
      const topSeller = summary.topSellingItems[0].name;
      const topProfit = summary.topProfitableItems[0].name;
      if (topSeller !== topProfit) {
        recommendations.push(`Train staff to upsell ${topProfit} - it has higher margins than your current top seller ${topSeller}.`);
      }
    }

    if (summary.avgTicket < 20) {
      recommendations.push(`Average ticket is $${summary.avgTicket.toFixed(2)}. Consider combo deals or "add-on" prompts to increase order value.`);
    }

    if (summary.comparisonToPrevious && summary.comparisonToPrevious.ordersChangePercent < -15) {
      recommendations.push(`Orders dropped ${Math.abs(summary.comparisonToPrevious.ordersChangePercent).toFixed(0)}%. Consider running a promotion or checking if external factors affected traffic.`);
    }

    return recommendations;
  }
}

export const salesInsightsService = new SalesInsightsService();
