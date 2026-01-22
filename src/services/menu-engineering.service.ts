/**
 * Menu Engineering Service
 * Analyzes menu items to categorize them into the classic four-quadrant matrix:
 * - Stars: High profit, high sales (promote heavily)
 * - Cash Cows/Plowhorses: High profit, low sales (train staff to upsell)
 * - Puzzles: Low profit, high sales (raise price or cut cost)
 * - Dogs: Low profit, low sales (consider removing)
 */

import { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';

const prisma = new PrismaClient();

export interface MenuItemAnalysis {
  id: string;
  name: string;
  nameEn: string | null;
  categoryName: string;
  price: number;
  estimatedCost: number;
  profitMargin: number;
  profitPerItem: number;
  totalSold: number;
  totalRevenue: number;
  totalProfit: number;
  salesRank: number;
  profitRank: number;
  quadrant: 'star' | 'cashCow' | 'puzzle' | 'dog';
  recommendation: string;
}

export interface MenuEngineeringReport {
  restaurantId: string;
  restaurantName: string;
  reportDate: string;
  periodStart: string;
  periodEnd: string;
  summary: {
    totalItems: number;
    totalRevenue: number;
    totalProfit: number;
    avgProfitMargin: number;
    stars: number;
    cashCows: number;
    puzzles: number;
    dogs: number;
  };
  items: MenuItemAnalysis[];
  quadrants: {
    stars: MenuItemAnalysis[];
    cashCows: MenuItemAnalysis[];
    puzzles: MenuItemAnalysis[];
    dogs: MenuItemAnalysis[];
  };
  aiInsights: string[];
  upsellRecommendations: UpsellRecommendation[];
}

export interface UpsellRecommendation {
  menuItemId: string;
  menuItemName: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  suggestedScript: string;
}

export class MenuEngineeringService {
  private client: Anthropic | null = null;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    } else {
      console.warn('ANTHROPIC_API_KEY not set - AI insights disabled');
    }
  }

  /**
   * Generate a complete menu engineering report for a restaurant
   */
  async generateReport(
    restaurantId: string,
    periodDays: number = 30
  ): Promise<MenuEngineeringReport | null> {
    try {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId }
      });

      if (!restaurant) {
        throw new Error('Restaurant not found');
      }

      const periodEnd = new Date();
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - periodDays);

      // Get all menu items with their AI-estimated costs
      const menuItems = await prisma.menuItem.findMany({
        where: { restaurantId, available: true },
        include: { category: true }
      });

      // Get sales data for the period
      const orderItems = await prisma.orderItem.findMany({
        where: {
          order: {
            restaurantId,
            status: { in: ['completed', 'ready', 'delivered'] },
            createdAt: {
              gte: periodStart,
              lte: periodEnd
            }
          }
        },
        include: {
          order: true
        }
      });

      // Aggregate sales by menu item
      const salesByItem = new Map<string, { quantity: number; revenue: number }>();
      
      for (const orderItem of orderItems) {
        const itemId = orderItem.menuItemId;
        if (!itemId) continue;
        
        const existing = salesByItem.get(itemId) || { quantity: 0, revenue: 0 };
        existing.quantity += orderItem.quantity;
        existing.revenue += Number(orderItem.totalPrice);
        salesByItem.set(itemId, existing);
      }

      // Calculate metrics for each item
      const itemAnalyses: MenuItemAnalysis[] = [];
      let totalRevenue = 0;
      let totalProfit = 0;

      for (const item of menuItems) {
        const sales = salesByItem.get(item.id) || { quantity: 0, revenue: 0 };
        const estimatedCost = Number(item.aiEstimatedCost || item.cost || 0);
        const price = Number(item.price);
        const profitPerItem = price - estimatedCost;
        const profitMargin = price > 0 ? (profitPerItem / price) * 100 : 0;
        const itemTotalProfit = profitPerItem * sales.quantity;

        totalRevenue += sales.revenue;
        totalProfit += itemTotalProfit;

        itemAnalyses.push({
          id: item.id,
          name: item.name,
          nameEn: item.nameEn,
          categoryName: item.category.name,
          price,
          estimatedCost,
          profitMargin,
          profitPerItem,
          totalSold: sales.quantity,
          totalRevenue: sales.revenue,
          totalProfit: itemTotalProfit,
          salesRank: 0, // Will be calculated after
          profitRank: 0, // Will be calculated after
          quadrant: 'dog', // Will be calculated after
          recommendation: '' // Will be generated after
        });
      }

      // Calculate median values for quadrant classification
      const sortedBySales = [...itemAnalyses].sort((a, b) => b.totalSold - a.totalSold);
      const sortedByProfit = [...itemAnalyses].sort((a, b) => b.profitMargin - a.profitMargin);

      // Assign ranks
      sortedBySales.forEach((item, index) => {
        const original = itemAnalyses.find(i => i.id === item.id);
        if (original) original.salesRank = index + 1;
      });

      sortedByProfit.forEach((item, index) => {
        const original = itemAnalyses.find(i => i.id === item.id);
        if (original) original.profitRank = index + 1;
      });

      // Calculate medians
      const medianSales = this.calculateMedian(itemAnalyses.map(i => i.totalSold));
      const medianProfitMargin = this.calculateMedian(itemAnalyses.map(i => i.profitMargin));

      // Classify into quadrants
      const quadrants = {
        stars: [] as MenuItemAnalysis[],
        cashCows: [] as MenuItemAnalysis[],
        puzzles: [] as MenuItemAnalysis[],
        dogs: [] as MenuItemAnalysis[]
      };

      for (const item of itemAnalyses) {
        const highSales = item.totalSold >= medianSales;
        const highProfit = item.profitMargin >= medianProfitMargin;

        if (highSales && highProfit) {
          item.quadrant = 'star';
          item.recommendation = 'Promote heavily. This is a winner - high profit and popular.';
          quadrants.stars.push(item);
        } else if (!highSales && highProfit) {
          item.quadrant = 'cashCow';
          item.recommendation = 'Train staff to upsell. High profit but underordered.';
          quadrants.cashCows.push(item);
        } else if (highSales && !highProfit) {
          item.quadrant = 'puzzle';
          item.recommendation = 'Raise price or reduce portion/ingredient cost. Popular but not profitable.';
          quadrants.puzzles.push(item);
        } else {
          item.quadrant = 'dog';
          item.recommendation = 'Consider removing or repositioning. Low sales and low profit.';
          quadrants.dogs.push(item);
        }
      }

      // Generate upsell recommendations (Cash Cows and Stars)
      const upsellRecommendations = this.generateUpsellRecommendations(quadrants);

      // Generate AI insights
      const aiInsights = await this.generateAIInsights(itemAnalyses, quadrants, restaurant.name);

      const report: MenuEngineeringReport = {
        restaurantId,
        restaurantName: restaurant.name,
        reportDate: new Date().toISOString(),
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        summary: {
          totalItems: itemAnalyses.length,
          totalRevenue,
          totalProfit,
          avgProfitMargin: itemAnalyses.length > 0 
            ? itemAnalyses.reduce((sum, i) => sum + i.profitMargin, 0) / itemAnalyses.length 
            : 0,
          stars: quadrants.stars.length,
          cashCows: quadrants.cashCows.length,
          puzzles: quadrants.puzzles.length,
          dogs: quadrants.dogs.length
        },
        items: itemAnalyses.sort((a, b) => b.totalProfit - a.totalProfit),
        quadrants,
        aiInsights,
        upsellRecommendations
      };

      return report;
    } catch (error) {
      console.error('Error generating menu engineering report:', error);
      return null;
    }
  }

  /**
   * Get real-time upsell suggestions for the POS
   */
  async getUpsellSuggestions(restaurantId: string, currentCartItemIds: string[] = []): Promise<UpsellRecommendation[]> {
    try {
      // Get cached or recent report data
      const menuItems = await prisma.menuItem.findMany({
        where: { 
          restaurantId, 
          available: true,
          eightySixed: false,
          id: { notIn: currentCartItemIds }
        },
        include: { category: true }
      });

      // Prioritize items with high profit margins that aren't in cart
      const suggestions: UpsellRecommendation[] = [];

      // Sort by profit margin (using AI estimated or actual cost)
      const sortedByProfit = menuItems
        .filter(item => item.aiEstimatedCost || item.cost)
        .map(item => {
          const cost = Number(item.aiEstimatedCost || item.cost || 0);
          const price = Number(item.price);
          const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
          return { item, margin, profitPerItem: price - cost };
        })
        .sort((a, b) => b.margin - a.margin);

      // Take top 3 high-margin items as suggestions
      for (const { item, margin, profitPerItem } of sortedByProfit.slice(0, 3)) {
        suggestions.push({
          menuItemId: item.id,
          menuItemName: item.nameEn || item.name,
          reason: `${margin.toFixed(0)}% margin ($${profitPerItem.toFixed(2)} profit)`,
          priority: margin >= 60 ? 'high' : margin >= 45 ? 'medium' : 'low',
          suggestedScript: `"Would you like to add our ${item.nameEn || item.name}? It's one of our most popular items!"`
        });
      }

      return suggestions;
    } catch (error) {
      console.error('Error getting upsell suggestions:', error);
      return [];
    }
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 
      ? sorted[mid] 
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private generateUpsellRecommendations(quadrants: MenuEngineeringReport['quadrants']): UpsellRecommendation[] {
    const recommendations: UpsellRecommendation[] = [];

    // Cash Cows are the primary upsell targets (high profit, need more sales)
    for (const item of quadrants.cashCows.slice(0, 5)) {
      recommendations.push({
        menuItemId: item.id,
        menuItemName: item.nameEn || item.name,
        reason: `High profit (${item.profitMargin.toFixed(0)}% margin) but underordered`,
        priority: 'high',
        suggestedScript: `"Have you tried our ${item.nameEn || item.name}? It's a hidden gem that our regulars love!"`
      });
    }

    // Stars should also be promoted (already doing well, keep pushing)
    for (const item of quadrants.stars.slice(0, 3)) {
      recommendations.push({
        menuItemId: item.id,
        menuItemName: item.nameEn || item.name,
        reason: `Top performer - ${item.totalSold} sold with ${item.profitMargin.toFixed(0)}% margin`,
        priority: 'medium',
        suggestedScript: `"Our ${item.nameEn || item.name} is very popular today - would you like to add one?"`
      });
    }

    return recommendations;
  }

  private async generateAIInsights(
    items: MenuItemAnalysis[],
    quadrants: MenuEngineeringReport['quadrants'],
    restaurantName: string
  ): Promise<string[]> {
    if (!this.client) {
      return this.generateBasicInsights(items, quadrants);
    }

    try {
      const topStars = quadrants.stars.slice(0, 3);
      const topDogs = quadrants.dogs.slice(0, 3);
      const topPuzzles = quadrants.puzzles.slice(0, 3);
      const topCashCows = quadrants.cashCows.slice(0, 3);

      const prompt = `You are a restaurant business analyst. Based on this menu engineering data for ${restaurantName}, provide 4-6 actionable insights.

MENU ANALYSIS SUMMARY:
- Total items analyzed: ${items.length}
- Stars (high profit, high sales): ${quadrants.stars.length} items
- Cash Cows (high profit, low sales): ${quadrants.cashCows.length} items  
- Puzzles (low profit, high sales): ${quadrants.puzzles.length} items
- Dogs (low profit, low sales): ${quadrants.dogs.length} items

TOP STARS: ${topStars.map(i => `${i.name} (${i.profitMargin.toFixed(0)}% margin, ${i.totalSold} sold)`).join(', ') || 'None'}

TOP CASH COWS (upsell opportunities): ${topCashCows.map(i => `${i.name} (${i.profitMargin.toFixed(0)}% margin, only ${i.totalSold} sold)`).join(', ') || 'None'}

TOP PUZZLES (need price increase): ${topPuzzles.map(i => `${i.name} (${i.profitMargin.toFixed(0)}% margin but ${i.totalSold} sold)`).join(', ') || 'None'}

TOP DOGS (consider removing): ${topDogs.map(i => `${i.name} (${i.profitMargin.toFixed(0)}% margin, ${i.totalSold} sold)`).join(', ') || 'None'}

Provide insights as a JSON array of strings. Each insight should be:
- Specific and actionable
- Reference actual menu items by name
- Include dollar amounts or percentages where relevant
- Written for a restaurant owner (not technical)

Example format:
["Insight 1", "Insight 2", "Insight 3"]`;

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return this.generateBasicInsights(items, quadrants);
      }

      const jsonMatch = content.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return this.generateBasicInsights(items, quadrants);
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('AI insights generation failed:', error);
      return this.generateBasicInsights(items, quadrants);
    }
  }

  private generateBasicInsights(
    items: MenuItemAnalysis[],
    quadrants: MenuEngineeringReport['quadrants']
  ): string[] {
    const insights: string[] = [];

    if (quadrants.stars.length > 0) {
      const topStar = quadrants.stars[0];
      insights.push(`Your top performer is ${topStar.name} with ${topStar.profitMargin.toFixed(0)}% margin and ${topStar.totalSold} sold. Keep promoting it!`);
    }

    if (quadrants.cashCows.length > 0) {
      const topCow = quadrants.cashCows[0];
      insights.push(`${topCow.name} has a ${topCow.profitMargin.toFixed(0)}% profit margin but only ${topCow.totalSold} sold. Train staff to recommend it.`);
    }

    if (quadrants.puzzles.length > 0) {
      const topPuzzle = quadrants.puzzles[0];
      const suggestedIncrease = (Number(topPuzzle.price) * 0.1).toFixed(2);
      insights.push(`${topPuzzle.name} is popular (${topPuzzle.totalSold} sold) but only ${topPuzzle.profitMargin.toFixed(0)}% margin. Consider raising price by $${suggestedIncrease}.`);
    }

    if (quadrants.dogs.length > 3) {
      insights.push(`You have ${quadrants.dogs.length} underperforming items. Consider removing the bottom 2-3 to simplify your menu and kitchen operations.`);
    }

    return insights;
  }
}

export const menuEngineeringService = new MenuEngineeringService();
