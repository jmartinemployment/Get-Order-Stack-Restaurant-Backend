/**
 * Inventory Tracking Service
 * Simple inventory management with AI-powered predictions
 * - Track stock levels
 * - Predict when items will run out
 * - Generate reorder alerts
 */

import { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';

const prisma = new PrismaClient();

export interface InventoryItem {
  id: string;
  restaurantId: string;
  name: string;
  nameEn?: string | null;
  unit: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  costPerUnit: number;
  supplier?: string | null;
  category: string;
  lastRestocked?: Date | null;
  lastCountDate?: Date | null;
  active: boolean;
}

export interface StockPrediction {
  inventoryItemId: string;
  itemName: string;
  currentStock: number;
  unit: string;
  avgDailyUsage: number;
  daysUntilEmpty: number;
  predictedEmptyDate: string;
  reorderRecommended: boolean;
  reorderQuantity: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface InventoryAlert {
  type: 'low_stock' | 'out_of_stock' | 'reorder_soon' | 'overstock';
  severity: 'critical' | 'warning' | 'info';
  itemId: string;
  itemName: string;
  message: string;
  currentStock: number;
  threshold: number;
  suggestedAction: string;
}

export interface InventoryReport {
  restaurantId: string;
  reportDate: string;
  totalItems: number;
  totalValue: number;
  alerts: InventoryAlert[];
  predictions: StockPrediction[];
  lowStockItems: InventoryItem[];
  reorderList: Array<{
    item: InventoryItem;
    suggestedQuantity: number;
    estimatedCost: number;
  }>;
}

export class InventoryService {
  private client: Anthropic | null = null;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  /**
   * Get all inventory items for a restaurant
   */
  async getInventory(restaurantId: string): Promise<InventoryItem[]> {
    const items = await prisma.inventoryItem.findMany({
      where: { restaurantId, active: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }]
    });
    return items as InventoryItem[];
  }

  /**
   * Get a single inventory item
   */
  async getInventoryItem(itemId: string): Promise<InventoryItem | null> {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId }
    });
    return item as InventoryItem | null;
  }

  /**
   * Create a new inventory item
   */
  async createInventoryItem(data: {
    restaurantId: string;
    name: string;
    nameEn?: string;
    unit: string;
    currentStock: number;
    minStock: number;
    maxStock?: number;
    costPerUnit: number;
    supplier?: string;
    category: string;
  }): Promise<InventoryItem> {
    const item = await prisma.inventoryItem.create({
      data: {
        ...data,
        maxStock: data.maxStock || data.minStock * 5,
        lastCountDate: new Date()
      }
    });
    return item as InventoryItem;
  }

  /**
   * Update stock level (manual count or adjustment)
   */
  async updateStock(
    itemId: string,
    newStock: number,
    reason?: string
  ): Promise<InventoryItem> {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId }
    });

    if (!item) {
      throw new Error('Inventory item not found');
    }

    // Log the stock change
    await prisma.inventoryLog.create({
      data: {
        inventoryItemId: itemId,
        previousStock: item.currentStock,
        newStock,
        changeAmount: newStock - Number(item.currentStock),
        reason: reason || 'manual_adjustment',
        createdAt: new Date()
      }
    });

    const updated = await prisma.inventoryItem.update({
      where: { id: itemId },
      data: {
        currentStock: newStock,
        lastCountDate: new Date()
      }
    });

    return updated as InventoryItem;
  }

  /**
   * Record stock usage (deduct from inventory)
   */
  async recordUsage(
    itemId: string,
    quantity: number,
    reason: string = 'order_fulfillment'
  ): Promise<InventoryItem> {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId }
    });

    if (!item) {
      throw new Error('Inventory item not found');
    }

    const newStock = Math.max(0, Number(item.currentStock) - quantity);

    await prisma.inventoryLog.create({
      data: {
        inventoryItemId: itemId,
        previousStock: item.currentStock,
        newStock,
        changeAmount: -quantity,
        reason,
        createdAt: new Date()
      }
    });

    const updated = await prisma.inventoryItem.update({
      where: { id: itemId },
      data: { currentStock: newStock }
    });

    return updated as InventoryItem;
  }

  /**
   * Record restocking (add to inventory)
   */
  async recordRestock(
    itemId: string,
    quantity: number,
    invoiceNumber?: string
  ): Promise<InventoryItem> {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId }
    });

    if (!item) {
      throw new Error('Inventory item not found');
    }

    const newStock = Number(item.currentStock) + quantity;

    await prisma.inventoryLog.create({
      data: {
        inventoryItemId: itemId,
        previousStock: item.currentStock,
        newStock,
        changeAmount: quantity,
        reason: `restock${invoiceNumber ? ` (Invoice: ${invoiceNumber})` : ''}`,
        createdAt: new Date()
      }
    });

    const updated = await prisma.inventoryItem.update({
      where: { id: itemId },
      data: {
        currentStock: newStock,
        lastRestocked: new Date()
      }
    });

    return updated as InventoryItem;
  }

  /**
   * Get stock predictions based on usage history
   */
  async getStockPredictions(restaurantId: string): Promise<StockPrediction[]> {
    const items = await prisma.inventoryItem.findMany({
      where: { restaurantId, active: true }
    });

    const predictions: StockPrediction[] = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const item of items) {
      // Get usage logs for the past 30 days
      const logs = await prisma.inventoryLog.findMany({
        where: {
          inventoryItemId: item.id,
          changeAmount: { lt: 0 }, // Only negative changes (usage)
          createdAt: { gte: thirtyDaysAgo }
        }
      });

      // Calculate average daily usage
      const totalUsage = logs.reduce((sum, log) => sum + Math.abs(Number(log.changeAmount)), 0);
      const daysWithData = Math.min(30, Math.ceil((Date.now() - thirtyDaysAgo.getTime()) / (1000 * 60 * 60 * 24)));
      const avgDailyUsage = daysWithData > 0 ? totalUsage / daysWithData : 0;

      // Predict days until empty
      const daysUntilEmpty = avgDailyUsage > 0 
        ? Math.floor(Number(item.currentStock) / avgDailyUsage)
        : 999;

      const predictedEmptyDate = new Date();
      predictedEmptyDate.setDate(predictedEmptyDate.getDate() + daysUntilEmpty);

      // Determine confidence based on data quality
      let confidence: 'high' | 'medium' | 'low' = 'low';
      if (logs.length >= 20) confidence = 'high';
      else if (logs.length >= 7) confidence = 'medium';

      // Calculate reorder recommendation
      const reorderRecommended = daysUntilEmpty <= 7 || Number(item.currentStock) <= Number(item.minStock);
      const reorderQuantity = reorderRecommended 
        ? Math.max(Number(item.maxStock) - Number(item.currentStock), Number(item.minStock) * 2)
        : 0;

      predictions.push({
        inventoryItemId: item.id,
        itemName: item.name,
        currentStock: Number(item.currentStock),
        unit: item.unit,
        avgDailyUsage: Math.round(avgDailyUsage * 100) / 100,
        daysUntilEmpty: Math.min(daysUntilEmpty, 999),
        predictedEmptyDate: predictedEmptyDate.toISOString().split('T')[0],
        reorderRecommended,
        reorderQuantity: Math.ceil(reorderQuantity),
        confidence
      });
    }

    // Sort by days until empty (most urgent first)
    return predictions.sort((a, b) => a.daysUntilEmpty - b.daysUntilEmpty);
  }

  /**
   * Get inventory alerts
   */
  async getAlerts(restaurantId: string): Promise<InventoryAlert[]> {
    const items = await prisma.inventoryItem.findMany({
      where: { restaurantId, active: true }
    });

    const alerts: InventoryAlert[] = [];

    for (const item of items) {
      const currentStock = Number(item.currentStock);
      const minStock = Number(item.minStock);
      const maxStock = Number(item.maxStock);

      if (currentStock === 0) {
        alerts.push({
          type: 'out_of_stock',
          severity: 'critical',
          itemId: item.id,
          itemName: item.name,
          message: `${item.name} is OUT OF STOCK!`,
          currentStock,
          threshold: minStock,
          suggestedAction: `Order ${minStock * 2} ${item.unit} immediately`
        });
      } else if (currentStock <= minStock) {
        alerts.push({
          type: 'low_stock',
          severity: 'warning',
          itemId: item.id,
          itemName: item.name,
          message: `${item.name} is running low (${currentStock} ${item.unit} remaining)`,
          currentStock,
          threshold: minStock,
          suggestedAction: `Reorder to bring stock up to ${maxStock} ${item.unit}`
        });
      } else if (currentStock > maxStock * 1.5) {
        alerts.push({
          type: 'overstock',
          severity: 'info',
          itemId: item.id,
          itemName: item.name,
          message: `${item.name} may be overstocked (${currentStock} ${item.unit})`,
          currentStock,
          threshold: maxStock,
          suggestedAction: `Consider reducing next order or using in specials`
        });
      }
    }

    // Sort by severity
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }

  /**
   * Generate comprehensive inventory report
   */
  async generateReport(restaurantId: string): Promise<InventoryReport> {
    const items = await this.getInventory(restaurantId);
    const alerts = await this.getAlerts(restaurantId);
    const predictions = await this.getStockPredictions(restaurantId);

    // Calculate total inventory value
    const totalValue = items.reduce(
      (sum, item) => sum + (Number(item.currentStock) * Number(item.costPerUnit)),
      0
    );

    // Get low stock items
    const lowStockItems = items.filter(
      item => Number(item.currentStock) <= Number(item.minStock)
    );

    // Generate reorder list
    const reorderList = predictions
      .filter(p => p.reorderRecommended)
      .map(p => {
        const item = items.find(i => i.id === p.inventoryItemId)!;
        return {
          item,
          suggestedQuantity: p.reorderQuantity,
          estimatedCost: p.reorderQuantity * Number(item.costPerUnit)
        };
      });

    return {
      restaurantId,
      reportDate: new Date().toISOString(),
      totalItems: items.length,
      totalValue,
      alerts,
      predictions: predictions.slice(0, 10), // Top 10 most urgent
      lowStockItems,
      reorderList
    };
  }

  /**
   * AI-powered analysis: "When will I run out of X?"
   */
  async predictItemRunout(itemId: string): Promise<string> {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId }
    });

    if (!item) {
      return 'Item not found';
    }

    const predictions = await this.getStockPredictions(item.restaurantId);
    const prediction = predictions.find(p => p.inventoryItemId === itemId);

    if (!prediction) {
      return `Unable to predict - not enough usage data for ${item.name}`;
    }

    if (prediction.daysUntilEmpty > 30) {
      return `${item.name}: You have about ${prediction.daysUntilEmpty} days of stock (${prediction.currentStock} ${item.unit}). No immediate action needed.`;
    } else if (prediction.daysUntilEmpty > 7) {
      return `${item.name}: You'll run out in about ${prediction.daysUntilEmpty} days (${prediction.predictedEmptyDate}). Consider reordering ${prediction.reorderQuantity} ${item.unit} soon.`;
    } else if (prediction.daysUntilEmpty > 0) {
      return `⚠️ ${item.name}: LOW STOCK! Only ${prediction.daysUntilEmpty} days remaining. Order ${prediction.reorderQuantity} ${item.unit} TODAY.`;
    } else {
      return `🚨 ${item.name}: OUT OF STOCK! Reorder immediately.`;
    }
  }
}

export const inventoryService = new InventoryService();
