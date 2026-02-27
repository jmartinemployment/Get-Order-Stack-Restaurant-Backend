import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../test/request-helper';
import { getPrismaMock, resetPrismaMock } from '../test/prisma-mock';
import { RESTAURANT_ID, RESTAURANT } from '../test/fixtures';

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

const prisma = getPrismaMock();

beforeEach(() => {
  resetPrismaMock();
});

const BASE_URL = `/api/restaurant/${RESTAURANT_ID}`;

// --- Invoice fixture ---
const INVOICE = {
  id: 'inv-00000000-0000-0000-0000-000000000001',
  restaurantId: RESTAURANT_ID,
  invoiceNumber: 'INV-0001',
  customerName: 'John Doe',
  customerEmail: 'john@example.com',
  customerId: null,
  houseAccountId: null,
  subtotal: 100,
  tax: 7,
  total: 107,
  paidAmount: 0,
  paidAt: null,
  sentAt: null,
  status: 'draft',
  dueDate: new Date('2026-03-01'),
  notes: null,
  lineItems: [
    { id: 'li-1', description: 'Catering service', quantity: 1, unitPrice: 100, total: 100 },
  ],
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

// --- House account fixture ---
const HOUSE_ACCOUNT = {
  id: 'ha-00000000-0000-0000-0000-000000000001',
  restaurantId: RESTAURANT_ID,
  name: 'Acme Corp',
  contactName: 'Jane Smith',
  contactEmail: 'jane@acme.com',
  creditLimit: 5000,
  currentBalance: 0,
  status: 'active',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

// ============ GET /invoices ============

describe('GET /invoices', () => {
  const url = `${BASE_URL}/invoices`;

  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(url);
    expect(res.status).toBe(401);
  });

  it('returns invoices list', async () => {
    prisma.invoice.findMany.mockResolvedValue([INVOICE]);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].invoiceNumber).toBe('INV-0001');
  });

  it('returns empty array when no invoices exist', async () => {
    prisma.invoice.findMany.mockResolvedValue([]);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 on database error', async () => {
    prisma.invoice.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to list invoices');
  });
});

// ============ POST /invoices ============

describe('POST /invoices', () => {
  const url = `${BASE_URL}/invoices`;

  const validBody = {
    customerName: 'John Doe',
    customerEmail: 'john@example.com',
    lineItems: [{ description: 'Catering service', quantity: 2, unitPrice: 50 }],
    dueDate: '2026-03-01',
  };

  beforeEach(() => {
    prisma.invoice.count.mockResolvedValue(0);
    prisma.restaurant.findUnique.mockResolvedValue(RESTAURANT);
    // $transaction passes through to the callback
    prisma.invoice.create.mockResolvedValue(INVOICE);
  });

  it('returns 401 without auth', async () => {
    const res = await api.anonymous().post(url).send(validBody);
    expect(res.status).toBe(401);
  });

  it('creates an invoice', async () => {
    const res = await api.owner.post(url).send(validBody);
    expect(res.status).toBe(201);
  });

  it('returns 400 for missing customerName', async () => {
    const res = await api.owner.post(url).send({
      customerEmail: 'john@example.com',
      lineItems: [{ description: 'Item', quantity: 1, unitPrice: 10 }],
      dueDate: '2026-03-01',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 for invalid email', async () => {
    const res = await api.owner.post(url).send({
      customerName: 'John',
      customerEmail: 'bad-email',
      lineItems: [{ description: 'Item', quantity: 1, unitPrice: 10 }],
      dueDate: '2026-03-01',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty lineItems', async () => {
    const res = await api.owner.post(url).send({
      customerName: 'John',
      customerEmail: 'john@example.com',
      lineItems: [],
      dueDate: '2026-03-01',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid dueDate', async () => {
    const res = await api.owner.post(url).send({
      customerName: 'John',
      customerEmail: 'john@example.com',
      lineItems: [{ description: 'Item', quantity: 1, unitPrice: 10 }],
      dueDate: 'not-a-date',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing line item description', async () => {
    const res = await api.owner.post(url).send({
      customerName: 'John',
      customerEmail: 'john@example.com',
      lineItems: [{ quantity: 1, unitPrice: 10 }],
      dueDate: '2026-03-01',
    });
    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    prisma.invoice.create.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(url).send(validBody);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to create invoice');
  });
});

// ============ PATCH /invoices/:invoiceId ============

describe('PATCH /invoices/:invoiceId', () => {
  const url = `${BASE_URL}/invoices/${INVOICE.id}`;

  it('updates an invoice', async () => {
    prisma.invoice.update.mockResolvedValue({ ...INVOICE, customerName: 'Jane Doe' });

    const res = await api.owner.patch(url).send({ customerName: 'Jane Doe' });
    expect(res.status).toBe(200);
    expect(res.body.customerName).toBe('Jane Doe');
  });

  it('returns 404 when invoice does not exist', async () => {
    prisma.invoice.update.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.patch(url).send({ customerName: 'Updated' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Invoice not found');
  });

  it('returns 400 for invalid email', async () => {
    const res = await api.owner.patch(url).send({ customerEmail: 'bad' });
    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    prisma.invoice.update.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.patch(url).send({ customerName: 'Updated' });
    expect(res.status).toBe(500);
  });
});

// ============ POST /invoices/:invoiceId/send ============

describe('POST /invoices/:invoiceId/send', () => {
  const url = `${BASE_URL}/invoices/${INVOICE.id}/send`;

  it('marks invoice as sent', async () => {
    prisma.invoice.update.mockResolvedValue({ ...INVOICE, status: 'sent', sentAt: new Date() });

    const res = await api.owner.post(url);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('sent');
  });

  it('returns 404 when invoice does not exist', async () => {
    prisma.invoice.update.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.post(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Invoice not found');
  });

  it('returns 500 on database error', async () => {
    prisma.invoice.update.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(url);
    expect(res.status).toBe(500);
  });
});

// ============ POST /invoices/:invoiceId/payment ============

describe('POST /invoices/:invoiceId/payment', () => {
  const url = `${BASE_URL}/invoices/${INVOICE.id}/payment`;

  it('records a partial payment', async () => {
    prisma.invoice.findFirst.mockResolvedValue({ ...INVOICE, paidAmount: 0 });
    prisma.invoice.update.mockResolvedValue({ ...INVOICE, paidAmount: 50, status: 'draft' });

    const res = await api.owner.post(url).send({ amount: 50 });
    expect(res.status).toBe(200);
  });

  it('marks invoice as paid when fully paid', async () => {
    prisma.invoice.findFirst.mockResolvedValue({ ...INVOICE, paidAmount: 0, total: 107 });
    prisma.invoice.update.mockResolvedValue({ ...INVOICE, paidAmount: 107, status: 'paid' });

    const res = await api.owner.post(url).send({ amount: 107 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paid');
  });

  it('returns 404 when invoice does not exist', async () => {
    prisma.invoice.findFirst.mockResolvedValue(null);

    const res = await api.owner.post(url).send({ amount: 50 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Invoice not found');
  });

  it('returns 400 for missing amount', async () => {
    const res = await api.owner.post(url).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 for non-positive amount', async () => {
    const res = await api.owner.post(url).send({ amount: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    prisma.invoice.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(url).send({ amount: 50 });
    expect(res.status).toBe(500);
  });
});

// ============ DELETE /invoices/:invoiceId ============

describe('DELETE /invoices/:invoiceId', () => {
  const url = `${BASE_URL}/invoices/${INVOICE.id}`;

  it('cancels an invoice', async () => {
    prisma.invoice.update.mockResolvedValue({ ...INVOICE, status: 'cancelled' });

    const res = await api.owner.delete(url);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
  });

  it('returns 404 when invoice does not exist', async () => {
    prisma.invoice.update.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.delete(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Invoice not found');
  });

  it('returns 500 on database error', async () => {
    prisma.invoice.update.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.delete(url);
    expect(res.status).toBe(500);
  });
});

// ============ GET /house-accounts ============

describe('GET /house-accounts', () => {
  const url = `${BASE_URL}/house-accounts`;

  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(url);
    expect(res.status).toBe(401);
  });

  it('returns house accounts list', async () => {
    prisma.houseAccount.findMany.mockResolvedValue([HOUSE_ACCOUNT]);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Acme Corp');
  });

  it('returns empty array', async () => {
    prisma.houseAccount.findMany.mockResolvedValue([]);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 on database error', async () => {
    prisma.houseAccount.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to list house accounts');
  });
});

// ============ POST /house-accounts ============

describe('POST /house-accounts', () => {
  const url = `${BASE_URL}/house-accounts`;

  const validBody = {
    name: 'Acme Corp',
    contactName: 'Jane Smith',
    contactEmail: 'jane@acme.com',
    creditLimit: 5000,
  };

  it('creates a house account', async () => {
    prisma.houseAccount.create.mockResolvedValue(HOUSE_ACCOUNT);

    const res = await api.owner.post(url).send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Acme Corp');
  });

  it('returns 400 for missing name', async () => {
    const res = await api.owner.post(url).send({
      contactName: 'Jane',
      contactEmail: 'jane@acme.com',
      creditLimit: 5000,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing contactEmail', async () => {
    const res = await api.owner.post(url).send({
      name: 'Acme',
      contactName: 'Jane',
      creditLimit: 5000,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email', async () => {
    const res = await api.owner.post(url).send({
      name: 'Acme',
      contactName: 'Jane',
      contactEmail: 'bad',
      creditLimit: 5000,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for negative credit limit', async () => {
    const res = await api.owner.post(url).send({
      name: 'Acme',
      contactName: 'Jane',
      contactEmail: 'jane@acme.com',
      creditLimit: -100,
    });
    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    prisma.houseAccount.create.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(url).send(validBody);
    expect(res.status).toBe(500);
  });
});

// ============ PATCH /house-accounts/:accountId ============

describe('PATCH /house-accounts/:accountId', () => {
  const url = `${BASE_URL}/house-accounts/${HOUSE_ACCOUNT.id}`;

  it('updates a house account', async () => {
    prisma.houseAccount.update.mockResolvedValue({ ...HOUSE_ACCOUNT, name: 'Updated Corp' });

    const res = await api.owner.patch(url).send({ name: 'Updated Corp' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Corp');
  });

  it('returns 404 when account does not exist', async () => {
    prisma.houseAccount.update.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.patch(url).send({ name: 'Updated' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('House account not found');
  });

  it('returns 400 for invalid email', async () => {
    const res = await api.owner.patch(url).send({ contactEmail: 'bad' });
    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    prisma.houseAccount.update.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.patch(url).send({ name: 'Updated' });
    expect(res.status).toBe(500);
  });
});

// ============ DELETE /house-accounts/:accountId ============

describe('DELETE /house-accounts/:accountId', () => {
  const url = `${BASE_URL}/house-accounts/${HOUSE_ACCOUNT.id}`;

  it('closes a house account', async () => {
    prisma.houseAccount.update.mockResolvedValue({ ...HOUSE_ACCOUNT, status: 'closed' });

    const res = await api.owner.delete(url);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('closed');
  });

  it('returns 404 when account does not exist', async () => {
    prisma.houseAccount.update.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.delete(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('House account not found');
  });

  it('returns 500 on database error', async () => {
    prisma.houseAccount.update.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.delete(url);
    expect(res.status).toBe(500);
  });
});
