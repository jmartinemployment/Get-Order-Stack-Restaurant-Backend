import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();
const router = Router();

// --- Zod schemas ---

const createRetailItemSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  price: z.number().min(0),
  cost: z.number().min(0).optional(),
  categoryId: z.string().uuid().optional(),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  trackStock: z.boolean().optional(),
});

const updateRetailItemSchema = z.object({
  name: z.string().min(1).optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  price: z.number().min(0).optional(),
  cost: z.number().min(0).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  description: z.string().optional(),
  imageUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().optional(),
  trackStock: z.boolean().optional(),
});

const createRetailCategorySchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

const updateRetailCategorySchema = z.object({
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

const createRetailOptionSetSchema = z.object({
  name: z.string().min(1),
  options: z.array(z.object({
    name: z.string().min(1),
    priceAdjustment: z.number().optional(),
    sortOrder: z.number().int().optional(),
  })).optional(),
});

const updateRetailOptionSetSchema = z.object({
  name: z.string().min(1).optional(),
  options: z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1),
    priceAdjustment: z.number().optional(),
    sortOrder: z.number().int().optional(),
  })).optional(),
});

const createLayawaySchema = z.object({
  customerId: z.string().uuid().optional(),
  customerName: z.string().optional(),
  items: z.array(z.object({
    retailItemId: z.string(),
    name: z.string(),
    quantity: z.number().int().min(1),
    price: z.number(),
  })),
  totalAmount: z.number().min(0),
  depositPaid: z.number().min(0).optional(),
});

const quickKeysSchema = z.array(z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1),
  retailItemId: z.string().uuid().nullable().optional(),
  position: z.number().int(),
  color: z.string().nullable().optional(),
}));

const receiptTemplateSchema = z.object({
  header: z.string().optional(),
  footer: z.string().optional(),
  showLogo: z.boolean().optional(),
  showAddress: z.boolean().optional(),
});

const returnPolicySchema = z.object({
  returnWindowDays: z.number().int().min(0).optional(),
  requireReceipt: z.boolean().optional(),
  restockingFeePercent: z.number().min(0).max(100).optional(),
  exchangeOnly: z.boolean().optional(),
});

// ============ Retail Items ============

router.get('/:merchantId/retail/items', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const items = await prisma.retailItem.findMany({
      where: { restaurantId },
      include: { category: true, stock: true },
      orderBy: { name: 'asc' },
    });
    res.json(items);
  } catch (error: unknown) {
    console.error('[Retail] Error listing items:', error);
    res.status(500).json({ error: 'Failed to list retail items' });
  }
});

router.post('/:merchantId/retail/items', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const parsed = createRetailItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    const item = await prisma.retailItem.create({
      data: { restaurantId, ...parsed.data },
      include: { category: true, stock: true },
    });
    res.status(201).json(item);
  } catch (error: unknown) {
    console.error('[Retail] Error creating item:', error);
    res.status(500).json({ error: 'Failed to create retail item' });
  }
});

router.patch('/:merchantId/retail/items/:itemId', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const parsed = updateRetailItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    const item = await prisma.retailItem.update({
      where: { id: itemId },
      data: parsed.data,
      include: { category: true, stock: true },
    });
    res.json(item);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Retail item not found' });
      return;
    }
    console.error('[Retail] Error updating item:', error);
    res.status(500).json({ error: 'Failed to update retail item' });
  }
});

router.delete('/:merchantId/retail/items/:itemId', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    await prisma.retailItem.delete({ where: { id: itemId } });
    res.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Retail item not found' });
      return;
    }
    console.error('[Retail] Error deleting item:', error);
    res.status(500).json({ error: 'Failed to delete retail item' });
  }
});

// ============ Retail Categories ============

router.get('/:merchantId/retail/categories', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const categories = await prisma.retailCategory.findMany({
      where: { restaurantId },
      include: { children: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json(categories);
  } catch (error: unknown) {
    console.error('[Retail] Error listing categories:', error);
    res.status(500).json({ error: 'Failed to list retail categories' });
  }
});

router.post('/:merchantId/retail/categories', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const parsed = createRetailCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    const category = await prisma.retailCategory.create({
      data: { restaurantId, ...parsed.data },
    });
    res.status(201).json(category);
  } catch (error: unknown) {
    console.error('[Retail] Error creating category:', error);
    res.status(500).json({ error: 'Failed to create retail category' });
  }
});

router.patch('/:merchantId/retail/categories/:catId', async (req: Request, res: Response) => {
  try {
    const { catId } = req.params;
    const parsed = updateRetailCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    const category = await prisma.retailCategory.update({
      where: { id: catId },
      data: parsed.data,
    });
    res.json(category);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Retail category not found' });
      return;
    }
    console.error('[Retail] Error updating category:', error);
    res.status(500).json({ error: 'Failed to update retail category' });
  }
});

router.delete('/:merchantId/retail/categories/:catId', async (req: Request, res: Response) => {
  try {
    const { catId } = req.params;
    await prisma.retailCategory.delete({ where: { id: catId } });
    res.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Retail category not found' });
      return;
    }
    console.error('[Retail] Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete retail category' });
  }
});

// ============ Retail Option Sets ============

router.get('/:merchantId/retail/option-sets', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const sets = await prisma.retailOptionSet.findMany({
      where: { restaurantId },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    res.json(sets);
  } catch (error: unknown) {
    console.error('[Retail] Error listing option sets:', error);
    res.status(500).json({ error: 'Failed to list option sets' });
  }
});

router.post('/:merchantId/retail/option-sets', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const parsed = createRetailOptionSetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    const { name, options } = parsed.data;
    const set = await prisma.retailOptionSet.create({
      data: {
        restaurantId,
        name,
        options: options ? { create: options } : undefined,
      },
      include: { options: true },
    });
    res.status(201).json(set);
  } catch (error: unknown) {
    console.error('[Retail] Error creating option set:', error);
    res.status(500).json({ error: 'Failed to create option set' });
  }
});

router.patch('/:merchantId/retail/option-sets/:setId', async (req: Request, res: Response) => {
  try {
    const { setId } = req.params;
    const parsed = updateRetailOptionSetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    const { name, options } = parsed.data;
    if (options) {
      await prisma.retailOption.deleteMany({ where: { optionSetId: setId } });
      await prisma.retailOption.createMany({
        data: options.map((o) => ({
          optionSetId: setId,
          name: o.name,
          priceAdjustment: o.priceAdjustment ?? 0,
          sortOrder: o.sortOrder ?? 0,
        })),
      });
    }
    const set = await prisma.retailOptionSet.update({
      where: { id: setId },
      data: name ? { name } : {},
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
    res.json(set);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Option set not found' });
      return;
    }
    console.error('[Retail] Error updating option set:', error);
    res.status(500).json({ error: 'Failed to update option set' });
  }
});

router.delete('/:merchantId/retail/option-sets/:setId', async (req: Request, res: Response) => {
  try {
    const { setId } = req.params;
    await prisma.retailOptionSet.delete({ where: { id: setId } });
    res.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Option set not found' });
      return;
    }
    console.error('[Retail] Error deleting option set:', error);
    res.status(500).json({ error: 'Failed to delete option set' });
  }
});

// ============ Retail Inventory / Stock ============

router.get('/:merchantId/retail/inventory/stock', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const stock = await prisma.retailStock.findMany({
      where: { restaurantId },
      include: { retailItem: { select: { id: true, name: true, sku: true, barcode: true, price: true } } },
    });
    res.json(stock);
  } catch (error: unknown) {
    console.error('[Retail] Error listing stock:', error);
    res.status(500).json({ error: 'Failed to list retail stock' });
  }
});

router.get('/:merchantId/retail/inventory/alerts', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const stock = await prisma.retailStock.findMany({
      where: { restaurantId },
      include: { retailItem: { select: { id: true, name: true, sku: true } } },
    });
    const alerts = stock
      .filter((s) => s.quantity <= s.lowStockThreshold)
      .map((s) => ({
        retailItemId: s.retailItemId,
        itemName: s.retailItem.name,
        sku: s.retailItem.sku,
        quantity: s.quantity,
        lowStockThreshold: s.lowStockThreshold,
        severity: s.quantity === 0 ? 'out_of_stock' : 'low_stock',
      }));
    res.json(alerts);
  } catch (error: unknown) {
    console.error('[Retail] Error getting stock alerts:', error);
    res.status(500).json({ error: 'Failed to get stock alerts' });
  }
});

// ============ Layaways ============

router.get('/:merchantId/retail/layaways', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const layaways = await prisma.layaway.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(layaways);
  } catch (error: unknown) {
    console.error('[Retail] Error listing layaways:', error);
    res.status(500).json({ error: 'Failed to list layaways' });
  }
});

router.post('/:merchantId/retail/layaways', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const parsed = createLayawaySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    const layaway = await prisma.layaway.create({
      data: { restaurantId, ...parsed.data },
    });
    res.status(201).json(layaway);
  } catch (error: unknown) {
    console.error('[Retail] Error creating layaway:', error);
    res.status(500).json({ error: 'Failed to create layaway' });
  }
});

// ============ Quick Keys ============

router.get('/:merchantId/retail/quick-keys', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const keys = await prisma.retailQuickKey.findMany({
      where: { restaurantId },
      orderBy: { position: 'asc' },
    });
    res.json(keys);
  } catch (error: unknown) {
    console.error('[Retail] Error listing quick keys:', error);
    res.status(500).json({ error: 'Failed to list quick keys' });
  }
});

router.put('/:merchantId/retail/quick-keys', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const parsed = quickKeysSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    await prisma.retailQuickKey.deleteMany({ where: { restaurantId } });
    const keys = await prisma.retailQuickKey.createManyAndReturn({
      data: parsed.data.map((k) => ({
        restaurantId,
        label: k.label,
        retailItemId: k.retailItemId ?? null,
        position: k.position,
        color: k.color ?? null,
      })),
    });
    res.json(keys);
  } catch (error: unknown) {
    console.error('[Retail] Error saving quick keys:', error);
    res.status(500).json({ error: 'Failed to save quick keys' });
  }
});

// ============ Receipt Template (JSON on merchantProfile) ============

router.get('/:merchantId/retail/receipt-template', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { merchantProfile: true },
    });
    const profile = restaurant?.merchantProfile as Record<string, unknown> | null;
    res.json(profile?.retailReceiptTemplate ?? { header: '', footer: '', showLogo: true, showAddress: true });
  } catch (error: unknown) {
    console.error('[Retail] Error getting receipt template:', error);
    res.status(500).json({ error: 'Failed to get receipt template' });
  }
});

router.put('/:merchantId/retail/receipt-template', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const parsed = receiptTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { merchantProfile: true },
    });
    const profile = (restaurant?.merchantProfile as Record<string, unknown>) ?? {};
    profile.retailReceiptTemplate = parsed.data;
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { merchantProfile: profile as object },
    });
    res.json(parsed.data);
  } catch (error: unknown) {
    console.error('[Retail] Error saving receipt template:', error);
    res.status(500).json({ error: 'Failed to save receipt template' });
  }
});

// ============ Return Policy (JSON on merchantProfile) ============

router.get('/:merchantId/retail/return-policy', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { merchantProfile: true },
    });
    const profile = restaurant?.merchantProfile as Record<string, unknown> | null;
    res.json(profile?.retailReturnPolicy ?? { returnWindowDays: 30, requireReceipt: true, restockingFeePercent: 0, exchangeOnly: false });
  } catch (error: unknown) {
    console.error('[Retail] Error getting return policy:', error);
    res.status(500).json({ error: 'Failed to get return policy' });
  }
});

router.put('/:merchantId/retail/return-policy', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const parsed = returnPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { merchantProfile: true },
    });
    const profile = (restaurant?.merchantProfile as Record<string, unknown>) ?? {};
    profile.retailReturnPolicy = parsed.data;
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { merchantProfile: profile as object },
    });
    res.json(parsed.data);
  } catch (error: unknown) {
    console.error('[Retail] Error saving return policy:', error);
    res.status(500).json({ error: 'Failed to save return policy' });
  }
});

// ============ Retail Sales Report ============

router.get('/:merchantId/retail/reports/sales', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { startDate, endDate } = req.query;

    const where: Record<string, unknown> = {
      restaurantId,
      orderSource: 'retail',
      status: { in: ['completed', 'delivered'] },
    };

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }

    const orders = await prisma.order.findMany({
      where,
      include: { orderItems: true },
      orderBy: { createdAt: 'desc' },
    });

    const totalSales = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const totalOrders = orders.length;

    res.json({
      totalSales: Math.round(totalSales * 100) / 100,
      totalOrders,
      avgOrderValue: totalOrders > 0 ? Math.round((totalSales / totalOrders) * 100) / 100 : 0,
      orders: orders.slice(0, 50),
    });
  } catch (error: unknown) {
    console.error('[Retail] Error getting sales report:', error);
    res.status(500).json({ error: 'Failed to get retail sales report' });
  }
});

// ============ Retail Ecommerce Orders ============

router.get('/:merchantId/retail/ecommerce/orders', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        orderSource: 'ecommerce',
      },
      include: { orderItems: true, customer: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(orders);
  } catch (error: unknown) {
    console.error('[Retail] Error listing ecommerce orders:', error);
    res.status(500).json({ error: 'Failed to list ecommerce orders' });
  }
});

export default router;
