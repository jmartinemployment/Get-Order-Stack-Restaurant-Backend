import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

// --- Zod schemas ---

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
});

const createInvoiceSchema = z.object({
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  customerId: z.string().optional(),
  houseAccountId: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1),
  dueDate: z.string().refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid date'),
  notes: z.string().optional(),
});

const updateInvoiceSchema = z.object({
  customerName: z.string().min(1).optional(),
  customerEmail: z.string().email().optional(),
  notes: z.string().optional(),
  dueDate: z.string().refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid date').optional(),
});

const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.string().optional(),
});

const createHouseAccountSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().min(1),
  contactEmail: z.string().email(),
  creditLimit: z.number().min(0),
});

const updateHouseAccountSchema = z.object({
  name: z.string().min(1).optional(),
  contactName: z.string().min(1).optional(),
  contactEmail: z.string().email().optional(),
  creditLimit: z.number().min(0).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

// --- Helpers ---

async function generateInvoiceNumber(restaurantId: string): Promise<string> {
  const count = await prisma.invoice.count({ where: { restaurantId } });
  return `INV-${String(count + 1).padStart(4, '0')}`;
}

// --- Invoice Routes ---

// GET /:merchantId/invoices
router.get('/:merchantId/invoices', async (req: Request, res: Response) => {
  const restaurantId = req.params.merchantId;
  try {
    const invoices = await prisma.invoice.findMany({
      where: { restaurantId },
      include: { lineItems: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(invoices);
  } catch (error: unknown) {
    console.error('[Invoice] List error:', error);
    res.status(500).json({ error: 'Failed to list invoices' });
  }
});

// POST /:merchantId/invoices
router.post('/:merchantId/invoices', async (req: Request, res: Response) => {
  const restaurantId = req.params.merchantId;
  const parsed = createInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const invoiceNumber = await generateInvoiceNumber(restaurantId);

    const lineItemsData = parsed.data.lineItems.map((li) => ({
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      total: li.quantity * li.unitPrice,
    }));

    const subtotal = lineItemsData.reduce((sum, li) => sum + li.total, 0);
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { taxRate: true },
    });
    const taxRate = restaurant ? Number(restaurant.taxRate) : 0;
    const tax = Math.round(subtotal * taxRate * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          restaurantId,
          invoiceNumber,
          customerName: parsed.data.customerName,
          customerEmail: parsed.data.customerEmail,
          customerId: parsed.data.customerId,
          houseAccountId: parsed.data.houseAccountId,
          subtotal,
          tax,
          total,
          dueDate: new Date(parsed.data.dueDate),
          notes: parsed.data.notes,
          lineItems: {
            create: lineItemsData,
          },
        },
        include: { lineItems: true },
      });
      return inv;
    });

    res.status(201).json(invoice);
  } catch (error: unknown) {
    console.error('[Invoice] Create error:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// PATCH /:merchantId/invoices/:invoiceId
router.patch('/:merchantId/invoices/:invoiceId', async (req: Request, res: Response) => {
  const { restaurantId, invoiceId } = req.params;
  const parsed = updateInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const data: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.dueDate) {
      data.dueDate = new Date(parsed.data.dueDate);
    }

    const invoice = await prisma.invoice.update({
      where: { id: invoiceId, restaurantId },
      data,
      include: { lineItems: true },
    });
    res.json(invoice);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }
    console.error('[Invoice] Update error:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// POST /:merchantId/invoices/:invoiceId/send
router.post('/:merchantId/invoices/:invoiceId/send', async (req: Request, res: Response) => {
  const { restaurantId, invoiceId } = req.params;
  try {
    const invoice = await prisma.invoice.update({
      where: { id: invoiceId, restaurantId },
      data: { status: 'sent', sentAt: new Date() },
      include: { lineItems: true },
    });
    res.json(invoice);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }
    console.error('[Invoice] Send error:', error);
    res.status(500).json({ error: 'Failed to send invoice' });
  }
});

// POST /:merchantId/invoices/:invoiceId/payment
router.post('/:merchantId/invoices/:invoiceId/payment', async (req: Request, res: Response) => {
  const { restaurantId, invoiceId } = req.params;
  const parsed = recordPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, restaurantId },
      });
      if (!invoice) throw new Error('Invoice not found');

      const newPaidAmount = Number(invoice.paidAmount) + parsed.data.amount;
      const isPaid = newPaidAmount >= Number(invoice.total);

      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newPaidAmount,
          status: isPaid ? 'paid' : invoice.status,
          paidAt: isPaid ? new Date() : undefined,
        },
        include: { lineItems: true },
      });

      if (invoice.houseAccountId) {
        await tx.houseAccount.update({
          where: { id: invoice.houseAccountId },
          data: {
            currentBalance: { decrement: parsed.data.amount },
          },
        });
      }

      return updated;
    });

    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Payment failed';
    if (message === 'Invoice not found') {
      res.status(404).json({ error: message });
      return;
    }
    console.error('[Invoice] Payment error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// DELETE /:merchantId/invoices/:invoiceId
router.delete('/:merchantId/invoices/:invoiceId', async (req: Request, res: Response) => {
  const { restaurantId, invoiceId } = req.params;
  try {
    const invoice = await prisma.invoice.update({
      where: { id: invoiceId, restaurantId },
      data: { status: 'cancelled' },
    });
    res.json(invoice);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }
    console.error('[Invoice] Cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel invoice' });
  }
});

// --- House Account Routes ---

// GET /:merchantId/house-accounts
router.get('/:merchantId/house-accounts', async (req: Request, res: Response) => {
  const restaurantId = req.params.merchantId;
  try {
    const accounts = await prisma.houseAccount.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(accounts);
  } catch (error: unknown) {
    console.error('[HouseAccount] List error:', error);
    res.status(500).json({ error: 'Failed to list house accounts' });
  }
});

// POST /:merchantId/house-accounts
router.post('/:merchantId/house-accounts', async (req: Request, res: Response) => {
  const restaurantId = req.params.merchantId;
  const parsed = createHouseAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const account = await prisma.houseAccount.create({
      data: {
        restaurantId,
        ...parsed.data,
      },
    });
    res.status(201).json(account);
  } catch (error: unknown) {
    console.error('[HouseAccount] Create error:', error);
    res.status(500).json({ error: 'Failed to create house account' });
  }
});

// PATCH /:merchantId/house-accounts/:accountId
router.patch('/:merchantId/house-accounts/:accountId', async (req: Request, res: Response) => {
  const { restaurantId, accountId } = req.params;
  const parsed = updateHouseAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const account = await prisma.houseAccount.update({
      where: { id: accountId, restaurantId },
      data: parsed.data,
    });
    res.json(account);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'House account not found' });
      return;
    }
    console.error('[HouseAccount] Update error:', error);
    res.status(500).json({ error: 'Failed to update house account' });
  }
});

// DELETE /:merchantId/house-accounts/:accountId
router.delete('/:merchantId/house-accounts/:accountId', async (req: Request, res: Response) => {
  const { restaurantId, accountId } = req.params;
  try {
    const account = await prisma.houseAccount.update({
      where: { id: accountId, restaurantId },
      data: { status: 'closed' },
    });
    res.json(account);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'House account not found' });
      return;
    }
    console.error('[HouseAccount] Delete error:', error);
    res.status(500).json({ error: 'Failed to close house account' });
  }
});

export default router;
