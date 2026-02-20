import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import multer from 'multer';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// --- Zod Schemas ---

const createVendorSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

const updateVendorSchema = z.object({
  name: z.string().min(1).optional(),
  contactName: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

const lineItemSchema = z.object({
  ingredientName: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  unitCost: z.number().nonnegative(),
  totalCost: z.number().nonnegative(),
  normalizedIngredient: z.string().optional(),
});

const createInvoiceSchema = z.object({
  vendorId: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string(), // ISO date string
  totalAmount: z.number().nonnegative(),
  lineItems: z.array(lineItemSchema).min(1),
});

const recipeIngredientSchema = z.object({
  ingredientName: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  estimatedUnitCost: z.number().nonnegative(),
});

const createRecipeSchema = z.object({
  menuItemId: z.string().uuid(),
  name: z.string().min(1),
  yieldQty: z.number().positive(),
  yieldUnit: z.string().min(1),
  ingredients: z.array(recipeIngredientSchema).min(1),
});

const updateRecipeSchema = z.object({
  name: z.string().min(1).optional(),
  yieldQty: z.number().positive().optional(),
  yieldUnit: z.string().min(1).optional(),
  ingredients: z.array(recipeIngredientSchema).min(1).optional(),
});

// =====================
// VENDOR CRUD
// =====================

// GET /:restaurantId/vendors
router.get('/:restaurantId/vendors', async (req: Request, res: Response) => {
  const { restaurantId } = req.params;
  try {
    const vendors = await prisma.vendor.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });
    res.json(vendors);
  } catch (error: unknown) {
    console.error('[FoodCost] List vendors error:', error);
    res.status(500).json({ error: 'Failed to list vendors' });
  }
});

// POST /:restaurantId/vendors
router.post('/:restaurantId/vendors', async (req: Request, res: Response) => {
  const { restaurantId } = req.params;
  const parsed = createVendorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const vendor = await prisma.vendor.create({
      data: { restaurantId, ...parsed.data },
    });
    res.status(201).json(vendor);
  } catch (error: unknown) {
    console.error('[FoodCost] Create vendor error:', error);
    res.status(500).json({ error: 'Failed to create vendor' });
  }
});

// PATCH /:restaurantId/vendors/:vendorId
router.patch('/:restaurantId/vendors/:vendorId', async (req: Request, res: Response) => {
  const { restaurantId, vendorId } = req.params;
  const parsed = updateVendorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const vendor = await prisma.vendor.update({
      where: { id: vendorId, restaurantId },
      data: parsed.data,
    });
    res.json(vendor);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Vendor not found' });
      return;
    }
    console.error('[FoodCost] Update vendor error:', error);
    res.status(500).json({ error: 'Failed to update vendor' });
  }
});

// DELETE /:restaurantId/vendors/:vendorId
router.delete('/:restaurantId/vendors/:vendorId', async (req: Request, res: Response) => {
  const { restaurantId, vendorId } = req.params;
  try {
    await prisma.vendor.delete({ where: { id: vendorId, restaurantId } });
    res.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Vendor not found' });
      return;
    }
    console.error('[FoodCost] Delete vendor error:', error);
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
});

// =====================
// PURCHASE INVOICE CRUD + ACTIONS
// =====================

// GET /:restaurantId/purchase-invoices
router.get('/:restaurantId/purchase-invoices', async (req: Request, res: Response) => {
  const { restaurantId } = req.params;
  try {
    const invoices = await prisma.purchaseInvoice.findMany({
      where: { restaurantId },
      include: { lineItems: true, vendor: { select: { id: true, name: true } } },
      orderBy: { invoiceDate: 'desc' },
    });
    res.json(invoices);
  } catch (error: unknown) {
    console.error('[FoodCost] List invoices error:', error);
    res.status(500).json({ error: 'Failed to list invoices' });
  }
});

// POST /:restaurantId/purchase-invoices
router.post('/:restaurantId/purchase-invoices', async (req: Request, res: Response) => {
  const { restaurantId } = req.params;
  const parsed = createInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseInvoice.create({
        data: {
          restaurantId,
          vendorId: parsed.data.vendorId,
          invoiceNumber: parsed.data.invoiceNumber,
          invoiceDate: new Date(parsed.data.invoiceDate),
          totalAmount: parsed.data.totalAmount,
        },
      });

      await tx.purchaseLineItem.createMany({
        data: parsed.data.lineItems.map((li) => ({
          invoiceId: created.id,
          ingredientName: li.ingredientName,
          quantity: li.quantity,
          unit: li.unit,
          unitCost: li.unitCost,
          totalCost: li.totalCost,
          normalizedIngredient: li.normalizedIngredient,
        })),
      });

      return tx.purchaseInvoice.findUnique({
        where: { id: created.id },
        include: { lineItems: true, vendor: { select: { id: true, name: true } } },
      });
    });

    res.status(201).json(invoice);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2002') {
      res.status(409).json({ error: 'Invoice number already exists for this restaurant' });
      return;
    }
    console.error('[FoodCost] Create invoice error:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// POST /:restaurantId/purchase-invoices/upload — OCR via Claude Vision
router.post('/:restaurantId/purchase-invoices/upload', upload.single('image'), async (req: Request, res: Response) => {
  const { restaurantId } = req.params;
  const file = req.file;
  const vendorId = req.body?.vendorId as string | undefined;

  if (!file) {
    res.status(400).json({ error: 'No image file provided' });
    return;
  }

  if (!vendorId) {
    res.status(400).json({ error: 'vendorId is required' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'AI service not configured' });
    return;
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const base64 = file.buffer.toString('base64');
    const mediaType = file.mimetype as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `Extract invoice data from this image. Return ONLY valid JSON with this structure:
{
  "invoiceNumber": "string",
  "invoiceDate": "YYYY-MM-DD",
  "totalAmount": number,
  "lineItems": [
    {
      "ingredientName": "string",
      "quantity": number,
      "unit": "string (e.g. lb, oz, case, each)",
      "unitCost": number,
      "totalCost": number
    }
  ]
}
If you cannot extract a field, use reasonable defaults. invoiceDate defaults to today. Return ONLY the JSON object, no markdown fences.`,
          },
        ],
      }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      res.status(500).json({ error: 'AI returned no text response' });
      return;
    }

    let ocrData: {
      invoiceNumber: string;
      invoiceDate: string;
      totalAmount: number;
      lineItems: Array<{
        ingredientName: string;
        quantity: number;
        unit: string;
        unitCost: number;
        totalCost: number;
      }>;
    };

    try {
      ocrData = JSON.parse(textBlock.text.trim());
    } catch {
      res.status(500).json({ error: 'AI returned invalid JSON', raw: textBlock.text });
      return;
    }

    if (!ocrData.lineItems || ocrData.lineItems.length === 0) {
      res.status(400).json({ error: 'No line items extracted from image', ocrData });
      return;
    }

    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseInvoice.create({
        data: {
          restaurantId,
          vendorId,
          invoiceNumber: ocrData.invoiceNumber ?? `OCR-${Date.now()}`,
          invoiceDate: new Date(ocrData.invoiceDate ?? new Date().toISOString()),
          totalAmount: ocrData.totalAmount ?? 0,
          ocrProcessedAt: new Date(),
        },
      });

      await tx.purchaseLineItem.createMany({
        data: ocrData.lineItems.map((li) => ({
          invoiceId: created.id,
          ingredientName: li.ingredientName,
          quantity: li.quantity,
          unit: li.unit,
          unitCost: li.unitCost,
          totalCost: li.totalCost,
        })),
      });

      return tx.purchaseInvoice.findUnique({
        where: { id: created.id },
        include: { lineItems: true, vendor: { select: { id: true, name: true } } },
      });
    });

    res.status(201).json(invoice);
  } catch (error: unknown) {
    console.error('[FoodCost] OCR upload error:', error);
    res.status(500).json({ error: 'Failed to process invoice image' });
  }
});

// PATCH /:restaurantId/purchase-invoices/:id/approve
router.patch('/:restaurantId/purchase-invoices/:id/approve', async (req: Request, res: Response) => {
  const { restaurantId, id } = req.params;
  try {
    const invoice = await prisma.purchaseInvoice.update({
      where: { id, restaurantId },
      data: { status: 'approved' },
      include: { lineItems: true, vendor: { select: { id: true, name: true } } },
    });
    res.json(invoice);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }
    console.error('[FoodCost] Approve invoice error:', error);
    res.status(500).json({ error: 'Failed to approve invoice' });
  }
});

// PATCH /:restaurantId/purchase-invoices/:id/paid
router.patch('/:restaurantId/purchase-invoices/:id/paid', async (req: Request, res: Response) => {
  const { restaurantId, id } = req.params;
  try {
    const invoice = await prisma.purchaseInvoice.update({
      where: { id, restaurantId },
      data: { status: 'paid' },
      include: { lineItems: true, vendor: { select: { id: true, name: true } } },
    });
    res.json(invoice);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }
    console.error('[FoodCost] Mark paid error:', error);
    res.status(500).json({ error: 'Failed to mark invoice paid' });
  }
});

// DELETE /:restaurantId/purchase-invoices/:id
router.delete('/:restaurantId/purchase-invoices/:id', async (req: Request, res: Response) => {
  const { restaurantId, id } = req.params;
  try {
    await prisma.purchaseInvoice.delete({ where: { id, restaurantId } });
    res.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }
    console.error('[FoodCost] Delete invoice error:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

// GET /:restaurantId/purchase-invoices/price-history
router.get('/:restaurantId/purchase-invoices/price-history', async (req: Request, res: Response) => {
  const { restaurantId } = req.params;
  const ingredient = req.query.ingredient as string | undefined;

  try {
    const lineItems = await prisma.purchaseLineItem.findMany({
      where: {
        invoice: { restaurantId },
        ...(ingredient ? { ingredientName: { contains: ingredient, mode: 'insensitive' as const } } : {}),
      },
      include: {
        invoice: { select: { invoiceDate: true, vendor: { select: { name: true } } } },
      },
      orderBy: { invoice: { invoiceDate: 'desc' } },
      take: 100,
    });

    const history = lineItems.map((li) => ({
      ingredientName: li.ingredientName,
      unitCost: li.unitCost,
      unit: li.unit,
      quantity: li.quantity,
      date: li.invoice.invoiceDate,
      vendorName: li.invoice.vendor.name,
    }));

    res.json(history);
  } catch (error: unknown) {
    console.error('[FoodCost] Price history error:', error);
    res.status(500).json({ error: 'Failed to load price history' });
  }
});

// =====================
// RECIPE CRUD
// =====================

// GET /:restaurantId/recipes
router.get('/:restaurantId/recipes', async (req: Request, res: Response) => {
  const { restaurantId } = req.params;
  try {
    const recipes = await prisma.foodCostRecipe.findMany({
      where: { restaurantId },
      include: {
        ingredients: true,
        menuItem: { select: { id: true, name: true, price: true } },
      },
      orderBy: { name: 'asc' },
    });

    const enriched = recipes.map((r) => {
      const totalCost = r.ingredients.reduce(
        (sum, ing) => sum + Number(ing.quantity) * Number(ing.estimatedUnitCost),
        0,
      );
      const costPerServing = totalCost / Math.max(Number(r.yieldQty), 1);
      const menuPrice = r.menuItem ? Number(r.menuItem.price) : 0;
      const foodCostPercent = menuPrice > 0 ? (costPerServing / menuPrice) * 100 : 0;

      return {
        ...r,
        totalCost: Math.round(totalCost * 100) / 100,
        costPerServing: Math.round(costPerServing * 100) / 100,
        foodCostPercent: Math.round(foodCostPercent * 10) / 10,
      };
    });

    res.json(enriched);
  } catch (error: unknown) {
    console.error('[FoodCost] List recipes error:', error);
    res.status(500).json({ error: 'Failed to list recipes' });
  }
});

// POST /:restaurantId/recipes
router.post('/:restaurantId/recipes', async (req: Request, res: Response) => {
  const { restaurantId } = req.params;
  const parsed = createRecipeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const recipe = await prisma.$transaction(async (tx) => {
      const created = await tx.foodCostRecipe.create({
        data: {
          restaurantId,
          menuItemId: parsed.data.menuItemId,
          name: parsed.data.name,
          yieldQty: parsed.data.yieldQty,
          yieldUnit: parsed.data.yieldUnit,
        },
      });

      await tx.foodCostRecipeIngredient.createMany({
        data: parsed.data.ingredients.map((ing) => ({
          recipeId: created.id,
          ingredientName: ing.ingredientName,
          quantity: ing.quantity,
          unit: ing.unit,
          estimatedUnitCost: ing.estimatedUnitCost,
        })),
      });

      return tx.foodCostRecipe.findUnique({
        where: { id: created.id },
        include: {
          ingredients: true,
          menuItem: { select: { id: true, name: true, price: true } },
        },
      });
    });

    res.status(201).json(recipe);
  } catch (error: unknown) {
    console.error('[FoodCost] Create recipe error:', error);
    res.status(500).json({ error: 'Failed to create recipe' });
  }
});

// PATCH /:restaurantId/recipes/:id
router.patch('/:restaurantId/recipes/:id', async (req: Request, res: Response) => {
  const { restaurantId, id } = req.params;
  const parsed = updateRecipeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const recipe = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
      if (parsed.data.yieldQty !== undefined) updateData.yieldQty = parsed.data.yieldQty;
      if (parsed.data.yieldUnit !== undefined) updateData.yieldUnit = parsed.data.yieldUnit;

      await tx.foodCostRecipe.update({
        where: { id, restaurantId },
        data: updateData,
      });

      if (parsed.data.ingredients) {
        await tx.foodCostRecipeIngredient.deleteMany({ where: { recipeId: id } });
        await tx.foodCostRecipeIngredient.createMany({
          data: parsed.data.ingredients.map((ing) => ({
            recipeId: id,
            ingredientName: ing.ingredientName,
            quantity: ing.quantity,
            unit: ing.unit,
            estimatedUnitCost: ing.estimatedUnitCost,
          })),
        });
      }

      return tx.foodCostRecipe.findUnique({
        where: { id },
        include: {
          ingredients: true,
          menuItem: { select: { id: true, name: true, price: true } },
        },
      });
    });

    res.json(recipe);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    console.error('[FoodCost] Update recipe error:', error);
    res.status(500).json({ error: 'Failed to update recipe' });
  }
});

// DELETE /:restaurantId/recipes/:id
router.delete('/:restaurantId/recipes/:id', async (req: Request, res: Response) => {
  const { restaurantId, id } = req.params;
  try {
    await prisma.foodCostRecipe.delete({ where: { id, restaurantId } });
    res.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    console.error('[FoodCost] Delete recipe error:', error);
    res.status(500).json({ error: 'Failed to delete recipe' });
  }
});

// =====================
// FOOD COST REPORT
// =====================

// GET /:restaurantId/food-cost-report
router.get('/:restaurantId/food-cost-report', async (req: Request, res: Response) => {
  const { restaurantId } = req.params;
  const days = Number.parseInt(req.query.days as string, 10) || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    // Revenue from orders in period
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: { gte: since },
        status: { notIn: ['cancelled'] },
      },
      select: { total: true },
    });
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total), 0);

    // Items sold in period (with menuItemId for recipe matching)
    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: { restaurantId, createdAt: { gte: since }, status: { notIn: ['cancelled'] } },
        menuItemId: { not: null },
      },
      select: { menuItemId: true, menuItemName: true, quantity: true },
    });

    // Recipes with ingredients
    const recipes = await prisma.foodCostRecipe.findMany({
      where: { restaurantId },
      include: { ingredients: true },
    });

    // Build recipe cost lookup by menuItemId
    const recipeCostByMenuItem = new Map<string, number>();
    for (const recipe of recipes) {
      const totalCost = recipe.ingredients.reduce(
        (sum, ing) => sum + Number(ing.quantity) * Number(ing.estimatedUnitCost),
        0,
      );
      const costPerServing = totalCost / Math.max(Number(recipe.yieldQty), 1);
      recipeCostByMenuItem.set(recipe.menuItemId, costPerServing);
    }

    // Theoretical COGS: sum(items sold × recipe cost per serving)
    let theoreticalCogs = 0;
    const itemCosts: Array<{ name: string; qtySold: number; unitCost: number; totalCost: number }> = [];

    // Aggregate by menuItemId
    const itemAgg = new Map<string, { name: string; qty: number }>();
    for (const oi of orderItems) {
      if (!oi.menuItemId) continue;
      const existing = itemAgg.get(oi.menuItemId);
      if (existing) {
        existing.qty += oi.quantity;
      } else {
        itemAgg.set(oi.menuItemId, { name: oi.menuItemName, qty: oi.quantity });
      }
    }

    for (const [menuItemId, { name, qty }] of itemAgg) {
      const unitCost = recipeCostByMenuItem.get(menuItemId);
      if (unitCost !== undefined) {
        const cost = qty * unitCost;
        theoreticalCogs += cost;
        itemCosts.push({
          name,
          qtySold: qty,
          unitCost: Math.round(unitCost * 100) / 100,
          totalCost: Math.round(cost * 100) / 100,
        });
      }
    }

    // Actual COGS from purchase invoices in period
    const invoices = await prisma.purchaseInvoice.findMany({
      where: {
        restaurantId,
        invoiceDate: { gte: since },
        status: { in: ['approved', 'paid'] },
      },
      select: { totalAmount: true },
    });
    const actualCogs = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

    // Price spike alerts (>10% increase in most recent vs previous purchase)
    const allLineItems = await prisma.purchaseLineItem.findMany({
      where: { invoice: { restaurantId } },
      include: { invoice: { select: { invoiceDate: true } } },
      orderBy: { invoice: { invoiceDate: 'desc' } },
    });

    const priceAlerts: Array<{ ingredientName: string; previousCost: number; currentCost: number; changePercent: number }> = [];
    const seen = new Map<string, { current: number; previous: number | null }>();

    for (const li of allLineItems) {
      const key = li.ingredientName.toLowerCase();
      const cost = Number(li.unitCost);
      const entry = seen.get(key);
      if (!entry) {
        seen.set(key, { current: cost, previous: null });
      } else if (entry.previous === null) {
        entry.previous = cost;
      }
    }

    for (const [name, { current, previous }] of seen) {
      if (previous !== null && previous > 0) {
        const changePercent = ((current - previous) / previous) * 100;
        if (changePercent > 10) {
          priceAlerts.push({
            ingredientName: name,
            previousCost: Math.round(previous * 100) / 100,
            currentCost: Math.round(current * 100) / 100,
            changePercent: Math.round(changePercent * 10) / 10,
          });
        }
      }
    }

    // Count menu items without recipes
    const menuItemCount = await prisma.menuItem.count({ where: { restaurantId, available: true } });
    const costedItemCount = recipes.length;
    const uncostedItems = menuItemCount - costedItemCount;

    // Top cost items sorted by total cost desc
    itemCosts.sort((a, b) => b.totalCost - a.totalCost);

    const foodCostPercent = totalRevenue > 0
      ? Math.round((theoreticalCogs / totalRevenue) * 1000) / 10
      : 0;

    const actualFoodCostPercent = totalRevenue > 0
      ? Math.round((actualCogs / totalRevenue) * 1000) / 10
      : 0;

    res.json({
      days,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      theoreticalCogs: Math.round(theoreticalCogs * 100) / 100,
      actualCogs: Math.round(actualCogs * 100) / 100,
      foodCostPercent,
      actualFoodCostPercent,
      variance: Math.round((actualCogs - theoreticalCogs) * 100) / 100,
      topCostItems: itemCosts.slice(0, 10),
      priceAlerts: priceAlerts.slice(0, 10),
      uncostedItems,
      totalMenuItems: menuItemCount,
      costedItems: costedItemCount,
    });
  } catch (error: unknown) {
    console.error('[FoodCost] Report error:', error);
    res.status(500).json({ error: 'Failed to generate food cost report' });
  }
});

export default router;
