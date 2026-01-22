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
 * Generate a complete menu engineering report
 */
router.get('/:restaurantId/analytics/menu-engineering', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { days = '30' } = req.query;

    const report = await menuEngineeringService.generateReport(
      restaurantId,
      parseInt(days as string)
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
 * Get real-time upsell suggestions for POS
 */
router.get('/:restaurantId/analytics/upsell-suggestions', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { cartItems } = req.query;

    const cartItemIds = cartItems 
      ? (cartItems as string).split(',').filter(Boolean)
      : [];

    const suggestions = await menuEngineeringService.getUpsellSuggestions(
      restaurantId,
      cartItemIds
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

    const targetDate = date ? new Date(date as string) : new Date();
    const report = await salesInsightsService.getDailyInsights(restaurantId, targetDate);

    if (!report) {
      res.status(500).json({ error: 'Failed to generate daily insights' });
      return;
    }

    res.json(report);
  } catch (error) {
    console.error('Error getting daily insights:', error);
    res.status(500).json({ error: 'Failed to get daily insights' });
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

    const report = await salesInsightsService.getWeeklyInsights(
      restaurantId,
      parseInt(weeksAgo as string)
    );

    if (!report) {
      res.status(500).json({ error: 'Failed to generate weekly insights' });
      return;
    }

    res.json(report);
  } catch (error) {
    console.error('Error getting weekly insights:', error);
    res.status(500).json({ error: 'Failed to get weekly insights' });
  }
});

/**
 * GET /:restaurantId/analytics/sales/summary
 * Get sales summary for a custom date range
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
    console.error('Error getting sales summary:', error);
    res.status(500).json({ error: 'Failed to get sales summary' });
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
    console.error('Error getting inventory:', error);
    res.status(500).json({ error: 'Failed to get inventory' });
  }
});

/**
 * GET /:restaurantId/inventory/:itemId
 * Get a single inventory item
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
    console.error('Error getting inventory item:', error);
    res.status(500).json({ error: 'Failed to get inventory item' });
  }
});

/**
 * POST /:restaurantId/inventory
 * Create a new inventory item
 */
router.post('/:restaurantId/inventory', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const {
      name, nameEn, unit, currentStock, minStock, maxStock,
      costPerUnit, supplier, category
    } = req.body;

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
    const { stock, reason } = req.body;

    if (stock === undefined) {
      res.status(400).json({ error: 'stock is required' });
      return;
    }

    const item = await inventoryService.updateStock(itemId, stock, reason);
    res.json(item);
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({ error: 'Failed to update stock' });
  }
});

/**
 * POST /:restaurantId/inventory/:itemId/usage
 * Record stock usage (deduct from inventory)
 */
router.post('/:restaurantId/inventory/:itemId/usage', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { quantity, reason } = req.body;

    if (!quantity || quantity <= 0) {
      res.status(400).json({ error: 'quantity must be a positive number' });
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
 * Record restocking (add to inventory)
 */
router.post('/:restaurantId/inventory/:itemId/restock', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { quantity, invoiceNumber } = req.body;

    if (!quantity || quantity <= 0) {
      res.status(400).json({ error: 'quantity must be a positive number' });
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
 * Get all inventory alerts (low stock, out of stock, etc.)
 */
router.get('/:restaurantId/inventory/alerts', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const alerts = await inventoryService.getAlerts(restaurantId);
    res.json(alerts);
  } catch (error) {
    console.error('Error getting inventory alerts:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

/**
 * GET /:restaurantId/inventory/predictions
 * Get stock predictions (when will we run out?)
 */
router.get('/:restaurantId/inventory/predictions', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const predictions = await inventoryService.getStockPredictions(restaurantId);
    res.json(predictions);
  } catch (error) {
    console.error('Error getting predictions:', error);
    res.status(500).json({ error: 'Failed to get predictions' });
  }
});

/**
 * GET /:restaurantId/inventory/report
 * Generate comprehensive inventory report
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
 * GET /:restaurantId/inventory/:itemId/predict
 * AI prediction: When will we run out of this item?
 */
router.get('/:restaurantId/inventory/:itemId/predict', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const prediction = await inventoryService.predictItemRunout(itemId);
    res.json({ prediction });
  } catch (error) {
    console.error('Error predicting runout:', error);
    res.status(500).json({ error: 'Failed to predict runout' });
  }
});

export default router;
