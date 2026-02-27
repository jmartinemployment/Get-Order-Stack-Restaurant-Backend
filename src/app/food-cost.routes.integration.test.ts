import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../test/request-helper';
import { getPrismaMock, resetPrismaMock } from '../test/prisma-mock';
import { RESTAURANT_ID } from '../test/fixtures';

vi.mock('../services/auth.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/auth.service')>();
  return {
    ...actual,
    authService: {
      ...actual.authService,
      validateSession: vi.fn().mockResolvedValue(true),
      verifyToken: actual.authService.verifyToken,
    },
  };
});

// Mock Anthropic SDK (for OCR upload)
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              invoiceNumber: 'OCR-001',
              invoiceDate: '2026-01-15',
              totalAmount: 250,
              lineItems: [
                { ingredientName: 'Flour', quantity: 50, unit: 'lb', unitCost: 2, totalCost: 100 },
                { ingredientName: 'Sugar', quantity: 30, unit: 'lb', unitCost: 5, totalCost: 150 },
              ],
            }),
          }],
        }),
      },
    })),
  };
});

const prisma = getPrismaMock();

beforeEach(() => {
  resetPrismaMock();
});

const BASE_URL = `/api/restaurant/${RESTAURANT_ID}`;

const VENDOR = {
  id: 'vendor-00000000-0000-0000-0000-000000000001',
  restaurantId: RESTAURANT_ID,
  name: 'Sysco',
  contactName: 'John',
  contactEmail: 'john@sysco.com',
  phone: '555-1234',
  address: '123 Warehouse Blvd',
  notes: null,
  isActive: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const PURCHASE_INVOICE = {
  id: 'pinv-00000000-0000-0000-0000-000000000001',
  restaurantId: RESTAURANT_ID,
  vendorId: VENDOR.id,
  invoiceNumber: 'INV-2026-001',
  invoiceDate: new Date('2026-01-15'),
  totalAmount: 250,
  status: 'pending',
  ocrProcessedAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  lineItems: [
    { id: 'li-1', ingredientName: 'Flour', quantity: 50, unit: 'lb', unitCost: 2, totalCost: 100 },
  ],
  vendor: { id: VENDOR.id, name: 'Sysco' },
};

const RECIPE = {
  id: 'recipe-00000000-0000-0000-0000-000000000001',
  restaurantId: RESTAURANT_ID,
  menuItemId: '11111111-1111-4111-a111-111111111111',
  name: 'Burger Patty',
  yieldQty: 10,
  yieldUnit: 'servings',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  ingredients: [
    { id: 'ri-1', recipeId: 'recipe-1', ingredientName: 'Ground Beef', quantity: 5, unit: 'lb', estimatedUnitCost: 4 },
  ],
  menuItem: { id: '11111111-1111-4111-a111-111111111111', name: 'Burger', price: 12.99 },
};

// ============ VENDOR CRUD ============

describe('GET /vendors', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(`${BASE_URL}/vendors`);
    expect(res.status).toBe(401);
  });

  it('returns vendors list', async () => {
    prisma.vendor.findMany.mockResolvedValue([VENDOR]);

    const res = await api.owner.get(`${BASE_URL}/vendors`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Sysco');
  });

  it('returns 500 on database error', async () => {
    prisma.vendor.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${BASE_URL}/vendors`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to list vendors');
  });
});

describe('POST /vendors', () => {
  it('creates a vendor', async () => {
    prisma.vendor.create.mockResolvedValue(VENDOR);

    const res = await api.owner.post(`${BASE_URL}/vendors`).send({ name: 'Sysco' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Sysco');
  });

  it('returns 400 for missing name', async () => {
    const res = await api.owner.post(`${BASE_URL}/vendors`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 for invalid email', async () => {
    const res = await api.owner.post(`${BASE_URL}/vendors`).send({ name: 'Test', contactEmail: 'bad' });
    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    prisma.vendor.create.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(`${BASE_URL}/vendors`).send({ name: 'Sysco' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to create vendor');
  });
});

describe('PATCH /vendors/:vendorId', () => {
  const url = `${BASE_URL}/vendors/${VENDOR.id}`;

  it('updates a vendor', async () => {
    prisma.vendor.update.mockResolvedValue({ ...VENDOR, name: 'US Foods' });

    const res = await api.owner.patch(url).send({ name: 'US Foods' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('US Foods');
  });

  it('returns 404 when vendor does not exist', async () => {
    prisma.vendor.update.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.patch(url).send({ name: 'Updated' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Vendor not found');
  });

  it('returns 500 on database error', async () => {
    prisma.vendor.update.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.patch(url).send({ name: 'Updated' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to update vendor');
  });
});

describe('DELETE /vendors/:vendorId', () => {
  const url = `${BASE_URL}/vendors/${VENDOR.id}`;

  it('deletes a vendor', async () => {
    prisma.vendor.delete.mockResolvedValue(VENDOR);

    const res = await api.owner.delete(url);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 when vendor does not exist', async () => {
    prisma.vendor.delete.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.delete(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Vendor not found');
  });

  it('returns 500 on database error', async () => {
    prisma.vendor.delete.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.delete(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to delete vendor');
  });
});

// ============ PURCHASE INVOICE CRUD ============

describe('GET /purchase-invoices', () => {
  it('returns invoices list', async () => {
    prisma.purchaseInvoice.findMany.mockResolvedValue([PURCHASE_INVOICE]);

    const res = await api.owner.get(`${BASE_URL}/purchase-invoices`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('returns 500 on database error', async () => {
    prisma.purchaseInvoice.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${BASE_URL}/purchase-invoices`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to list invoices');
  });
});

describe('POST /purchase-invoices', () => {
  const validBody = {
    vendorId: '11111111-1111-4111-a111-111111111111',
    invoiceNumber: 'INV-001',
    invoiceDate: '2026-01-15',
    totalAmount: 250,
    lineItems: [
      { ingredientName: 'Flour', quantity: 50, unit: 'lb', unitCost: 2, totalCost: 100 },
    ],
  };

  it('creates a purchase invoice', async () => {
    prisma.purchaseInvoice.create.mockResolvedValue({ id: 'pinv-new' });
    prisma.purchaseLineItem.createMany.mockResolvedValue({ count: 1 });
    prisma.purchaseInvoice.findUnique.mockResolvedValue(PURCHASE_INVOICE);

    const res = await api.owner.post(`${BASE_URL}/purchase-invoices`).send(validBody);
    expect(res.status).toBe(201);
  });

  it('returns 400 for missing line items', async () => {
    const res = await api.owner.post(`${BASE_URL}/purchase-invoices`).send({
      vendorId: '11111111-1111-4111-a111-111111111111',
      invoiceNumber: 'INV-001',
      invoiceDate: '2026-01-15',
      totalAmount: 250,
      lineItems: [],
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing vendorId', async () => {
    const res = await api.owner.post(`${BASE_URL}/purchase-invoices`).send({
      invoiceNumber: 'INV-001',
      invoiceDate: '2026-01-15',
      totalAmount: 250,
      lineItems: [{ ingredientName: 'Flour', quantity: 50, unit: 'lb', unitCost: 2, totalCost: 100 }],
    });
    expect(res.status).toBe(400);
  });

  it('returns 409 for duplicate invoice number', async () => {
    prisma.purchaseInvoice.create.mockRejectedValue({ code: 'P2002' });

    const res = await api.owner.post(`${BASE_URL}/purchase-invoices`).send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already exists');
  });

  it('returns 500 on database error', async () => {
    prisma.purchaseInvoice.create.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(`${BASE_URL}/purchase-invoices`).send(validBody);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to create invoice');
  });
});

describe('PATCH /purchase-invoices/:id/approve', () => {
  const url = `${BASE_URL}/purchase-invoices/${PURCHASE_INVOICE.id}/approve`;

  it('approves a purchase invoice', async () => {
    prisma.purchaseInvoice.update.mockResolvedValue({ ...PURCHASE_INVOICE, status: 'approved' });

    const res = await api.owner.patch(url);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
  });

  it('returns 404 when invoice does not exist', async () => {
    prisma.purchaseInvoice.update.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.patch(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Invoice not found');
  });
});

describe('PATCH /purchase-invoices/:id/paid', () => {
  const url = `${BASE_URL}/purchase-invoices/${PURCHASE_INVOICE.id}/paid`;

  it('marks invoice as paid', async () => {
    prisma.purchaseInvoice.update.mockResolvedValue({ ...PURCHASE_INVOICE, status: 'paid' });

    const res = await api.owner.patch(url);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paid');
  });

  it('returns 404 when invoice does not exist', async () => {
    prisma.purchaseInvoice.update.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.patch(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Invoice not found');
  });
});

describe('DELETE /purchase-invoices/:id', () => {
  const url = `${BASE_URL}/purchase-invoices/${PURCHASE_INVOICE.id}`;

  it('deletes a purchase invoice', async () => {
    prisma.purchaseInvoice.delete.mockResolvedValue(PURCHASE_INVOICE);

    const res = await api.owner.delete(url);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 when invoice does not exist', async () => {
    prisma.purchaseInvoice.delete.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.delete(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Invoice not found');
  });

  it('returns 500 on database error', async () => {
    prisma.purchaseInvoice.delete.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.delete(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to delete invoice');
  });
});

describe('GET /purchase-invoices/price-history', () => {
  it('returns price history', async () => {
    prisma.purchaseLineItem.findMany.mockResolvedValue([
      {
        ingredientName: 'Flour',
        unitCost: 2,
        unit: 'lb',
        quantity: 50,
        invoice: { invoiceDate: new Date('2026-01-15'), vendor: { name: 'Sysco' } },
      },
    ]);

    const res = await api.owner.get(`${BASE_URL}/purchase-invoices/price-history`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].ingredientName).toBe('Flour');
  });

  it('filters by ingredient name', async () => {
    prisma.purchaseLineItem.findMany.mockResolvedValue([]);

    const res = await api.owner.get(`${BASE_URL}/purchase-invoices/price-history?ingredient=flour`);
    expect(res.status).toBe(200);
  });

  it('returns 500 on database error', async () => {
    prisma.purchaseLineItem.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${BASE_URL}/purchase-invoices/price-history`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to load price history');
  });
});

// ============ RECIPE CRUD ============

describe('GET /recipes', () => {
  it('returns enriched recipes', async () => {
    prisma.foodCostRecipe.findMany.mockResolvedValue([RECIPE]);

    const res = await api.owner.get(`${BASE_URL}/recipes`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toHaveProperty('totalCost');
    expect(res.body[0]).toHaveProperty('costPerServing');
    expect(res.body[0]).toHaveProperty('foodCostPercent');
  });

  it('returns 500 on database error', async () => {
    prisma.foodCostRecipe.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${BASE_URL}/recipes`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to list recipes');
  });
});

describe('POST /recipes', () => {
  const validBody = {
    menuItemId: '11111111-1111-4111-a111-111111111111',
    name: 'Burger Patty',
    yieldQty: 10,
    yieldUnit: 'servings',
    ingredients: [
      { ingredientName: 'Ground Beef', quantity: 5, unit: 'lb', estimatedUnitCost: 4 },
    ],
  };

  it('creates a recipe', async () => {
    prisma.foodCostRecipe.create.mockResolvedValue({ id: 'recipe-new' });
    prisma.foodCostRecipeIngredient.createMany.mockResolvedValue({ count: 1 });
    prisma.foodCostRecipe.findUnique.mockResolvedValue(RECIPE);

    const res = await api.owner.post(`${BASE_URL}/recipes`).send(validBody);
    expect(res.status).toBe(201);
  });

  it('returns 400 for missing ingredients', async () => {
    const res = await api.owner.post(`${BASE_URL}/recipes`).send({
      menuItemId: '11111111-1111-4111-a111-111111111111',
      name: 'Bad Recipe',
      yieldQty: 10,
      yieldUnit: 'servings',
      ingredients: [],
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid menuItemId', async () => {
    const res = await api.owner.post(`${BASE_URL}/recipes`).send({
      ...validBody,
      menuItemId: 'not-a-uuid',
    });
    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    prisma.foodCostRecipe.create.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(`${BASE_URL}/recipes`).send(validBody);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to create recipe');
  });
});

describe('PATCH /recipes/:id', () => {
  const url = `${BASE_URL}/recipes/${RECIPE.id}`;

  it('updates a recipe', async () => {
    prisma.foodCostRecipe.update.mockResolvedValue({});
    prisma.foodCostRecipe.findUnique.mockResolvedValue({ ...RECIPE, name: 'Updated Patty' });

    const res = await api.owner.patch(url).send({ name: 'Updated Patty' });
    expect(res.status).toBe(200);
  });

  it('replaces ingredients when provided', async () => {
    prisma.foodCostRecipe.update.mockResolvedValue({});
    prisma.foodCostRecipeIngredient.deleteMany.mockResolvedValue({ count: 1 });
    prisma.foodCostRecipeIngredient.createMany.mockResolvedValue({ count: 1 });
    prisma.foodCostRecipe.findUnique.mockResolvedValue(RECIPE);

    const res = await api.owner.patch(url).send({
      ingredients: [
        { ingredientName: 'Ground Turkey', quantity: 5, unit: 'lb', estimatedUnitCost: 3 },
      ],
    });
    expect(res.status).toBe(200);
  });

  it('returns 404 when recipe does not exist', async () => {
    prisma.foodCostRecipe.update.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.patch(url).send({ name: 'Updated' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Recipe not found');
  });

  it('returns 500 on database error', async () => {
    prisma.foodCostRecipe.update.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.patch(url).send({ name: 'Updated' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to update recipe');
  });
});

describe('DELETE /recipes/:id', () => {
  const url = `${BASE_URL}/recipes/${RECIPE.id}`;

  it('deletes a recipe', async () => {
    prisma.foodCostRecipe.delete.mockResolvedValue(RECIPE);

    const res = await api.owner.delete(url);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 when recipe does not exist', async () => {
    prisma.foodCostRecipe.delete.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.delete(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Recipe not found');
  });

  it('returns 500 on database error', async () => {
    prisma.foodCostRecipe.delete.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.delete(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to delete recipe');
  });
});

// ============ FOOD COST REPORT ============

describe('GET /food-cost-report', () => {
  it('returns food cost report', async () => {
    // Orders in period
    prisma.order.findMany.mockResolvedValue([
      { total: 500 },
      { total: 300 },
    ]);
    // Order items
    prisma.orderItem.findMany.mockResolvedValue([
      { menuItemId: '11111111-1111-4111-a111-111111111111', menuItemName: 'Burger', quantity: 20 },
    ]);
    // Recipes
    prisma.foodCostRecipe.findMany.mockResolvedValue([{
      menuItemId: '11111111-1111-4111-a111-111111111111',
      yieldQty: 10,
      ingredients: [
        { quantity: 5, estimatedUnitCost: 4 },
      ],
    }]);
    // Purchase invoices
    prisma.purchaseInvoice.findMany.mockResolvedValue([{ totalAmount: 200 }]);
    // All line items for price alerts
    prisma.purchaseLineItem.findMany.mockResolvedValue([]);
    // Menu item count
    prisma.menuItem.count.mockResolvedValue(25);

    const res = await api.owner.get(`${BASE_URL}/food-cost-report`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalRevenue');
    expect(res.body).toHaveProperty('theoreticalCogs');
    expect(res.body).toHaveProperty('actualCogs');
    expect(res.body).toHaveProperty('foodCostPercent');
    expect(res.body).toHaveProperty('topCostItems');
    expect(res.body).toHaveProperty('priceAlerts');
    expect(res.body.totalRevenue).toBe(800);
  });

  it('supports days query parameter', async () => {
    prisma.order.findMany.mockResolvedValue([]);
    prisma.orderItem.findMany.mockResolvedValue([]);
    prisma.foodCostRecipe.findMany.mockResolvedValue([]);
    prisma.purchaseInvoice.findMany.mockResolvedValue([]);
    prisma.purchaseLineItem.findMany.mockResolvedValue([]);
    prisma.menuItem.count.mockResolvedValue(0);

    const res = await api.owner.get(`${BASE_URL}/food-cost-report?days=7`);
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(7);
  });

  it('returns 500 on database error', async () => {
    prisma.order.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${BASE_URL}/food-cost-report`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to generate food cost report');
  });
});
