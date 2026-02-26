/**
 * AI Analytics Routes
 * Routes for Menu Engineering, Sales Insights, and Inventory Management
 */

import { Router, Request, Response } from 'express';
import { menuEngineeringService } from '../services/menu-engineering.service';
import { salesInsightsService } from '../services/sales-insights.service';
import { inventoryService } from '../services/inventory.service';

const router = Router();

// ============ Menu Engineering ============

/**
 * GET /:restaurantId/analytics/menu-engineering
 * Generate a complete menu engineering report with quadrant analysis
 */
router.get('/:restaurantId/analytics/menu-engineering', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
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
 * GET /:restaurantId/analytics/upsell-suggestions
 * Get real-time upsell suggestions for POS display
 */
router.get('/:restaurantId/analytics/upsell-suggestions', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { cartItemIds } = req.query;

    const currentCartIds = cartItemIds 
      ? (cartItemIds as string).split(',').filter(Boolean)
      : [];

    const suggestions = await menuEngineeringService.getUpsellSuggestions(
      restaurantId,
      currentCartIds
    );

    res.json(suggestions);
  } catch (error) {
    console.error('Error getting upsell suggestions:', error);
    res.status(500).json({ error: 'Failed to get upsell suggestions' });
  }
});

// ============ Sales Insights ============

/**
 * GET /:restaurantId/analytics/sales/daily
 * Get daily sales insights with AI analysis
 */
router.get('/:restaurantId/analytics/sales/daily', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { date } = req.query;

    const targetDate = date ? new Date(date as string) : undefined;
    const insights = await salesInsightsService.getDailyInsights(restaurantId, targetDate);

    if (!insights) {
      res.status(500).json({ error: 'Failed to generate daily insights' });
      return;
    }

    res.json(insights);
  } catch (error) {
    console.error('Error generating daily insights:', error);
    res.status(500).json({ error: 'Failed to generate daily insights' });
  }
});

/**
 * GET /:restaurantId/analytics/sales/weekly
 * Get weekly sales insights with AI analysis
 */
router.get('/:restaurantId/analytics/sales/weekly', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { weeksAgo = '0' } = req.query;

    const insights = await salesInsightsService.getWeeklyInsights(
      restaurantId,
      Number.parseInt(weeksAgo as string, 10)
    );

    if (!insights) {
      res.status(500).json({ error: 'Failed to generate weekly insights' });
      return;
    }

    res.json(insights);
  } catch (error) {
    console.error('Error generating weekly insights:', error);
    res.status(500).json({ error: 'Failed to generate weekly insights' });
  }
});

/**
 * GET /:restaurantId/analytics/sales/summary
 * Get sales summary for a specific date range
 */
router.get('/:restaurantId/analytics/sales/summary', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
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
    console.error('Error generating sales summary:', error);
    res.status(500).json({ error: 'Failed to generate sales summary' });
  }
});

// ============ Inventory Management ============

/**
 * GET /:restaurantId/inventory
 * Get all inventory items
 */
router.get('/:restaurantId/inventory', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const items = await inventoryService.getInventory(restaurantId);
    res.json(items);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

/**
 * GET /:restaurantId/inventory/:itemId
 * Get a specific inventory item
 */
router.get('/:restaurantId/inventory/:itemId', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const item = await inventoryService.getInventoryItem(itemId);
    
    if (!item) {
      res.status(404).json({ error: 'Inventory item not found' });
      return;
    }
    
    res.json(item);
  } catch (error) {
    console.error('Error fetching inventory item:', error);
    res.status(500).json({ error: 'Failed to fetch inventory item' });
  }
});

/**
 * POST /:restaurantId/inventory
 * Create a new inventory item
 */
router.post('/:restaurantId/inventory', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { name, nameEn, unit, currentStock, minStock, maxStock, costPerUnit, supplier, category } = req.body;

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
 * PATCH /:restaurantId/inventory/:itemId/stock
 * Update stock level (manual count)
 */
router.patch('/:restaurantId/inventory/:itemId/stock', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { newStock, reason } = req.body;

    if (newStock === undefined) {
      res.status(400).json({ error: 'newStock is required' });
      return;
    }

    const item = await inventoryService.updateStock(itemId, newStock, reason);
    res.json(item);
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({ error: 'Failed to update stock' });
  }
});

/**
 * POST /:restaurantId/inventory/:itemId/usage
 * Record inventory usage (deduct stock)
 */
router.post('/:restaurantId/inventory/:itemId/usage', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { quantity, reason } = req.body;

    if (!quantity || quantity <= 0) {
      res.status(400).json({ error: 'Valid quantity is required' });
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
 * POST /:restaurantId/inventory/:itemId/restock
 * Record restocking (add stock)
 */
router.post('/:restaurantId/inventory/:itemId/restock', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { quantity, invoiceNumber } = req.body;

    if (!quantity || quantity <= 0) {
      res.status(400).json({ error: 'Valid quantity is required' });
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
 * GET /:restaurantId/inventory/alerts
 * Get inventory alerts (low stock, out of stock, etc.)
 */
router.get('/:restaurantId/inventory/alerts', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const alerts = await inventoryService.getAlerts(restaurantId);
    res.json(alerts);
  } catch (error) {
    console.error('Error fetching inventory alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

/**
 * GET /:restaurantId/inventory/predictions
 * Get stock predictions (when will items run out)
 */
router.get('/:restaurantId/inventory/predictions', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const predictions = await inventoryService.getStockPredictions(restaurantId);
    res.json(predictions);
  } catch (error) {
    console.error('Error fetching predictions:', error);
    res.status(500).json({ error: 'Failed to fetch predictions' });
  }
});

/**
 * GET /:restaurantId/inventory/report
 * Get comprehensive inventory report
 */
router.get('/:restaurantId/inventory/report', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const report = await inventoryService.generateReport(restaurantId);
    res.json(report);
  } catch (error) {
    console.error('Error generating inventory report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

/**
 * GET /:restaurantId/inventory/:itemId/prediction
 * Get prediction for a specific item
 */
router.get('/:restaurantId/inventory/:itemId/prediction', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const prediction = await inventoryService.predictItemRunout(itemId);
    res.json({ message: prediction });
  } catch (error) {
    console.error('Error predicting runout:', error);
    res.status(500).json({ error: 'Failed to predict runout' });
  }
});

export default router;
