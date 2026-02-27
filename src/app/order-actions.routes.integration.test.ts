import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../test/request-helper';
import { getPrismaMock, resetPrismaMock } from '../test/prisma-mock';
import { RESTAURANT_ID, ORDER } from '../test/fixtures';

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

// Mock order-status.service (imports marketplace.service internally)
vi.mock('../services/order-status.service', () => ({
  updateOrderStatus: vi.fn().mockResolvedValue({ success: true }),
  isValidTransition: vi.fn().mockReturnValue(true),
  getValidNextStatuses: vi.fn().mockReturnValue([]),
  getOrderStatusHistory: vi.fn().mockResolvedValue([]),
}));

// Mock marketplace.service (imported by order-status.service)
vi.mock('../services/marketplace.service', () => ({
  marketplaceService: {
    enqueueStatusSyncForOrder: vi.fn().mockResolvedValue({ queued: false }),
    processDueStatusSyncJobs: vi.fn().mockResolvedValue([]),
  },
}));

const prisma = getPrismaMock();

beforeEach(() => {
  resetPrismaMock();
});

const BASE_URL = `/api/restaurant/${RESTAURANT_ID}/orders`;

// Enriched order response (order with includes)
const ORDER_WITH_INCLUDES = {
  ...ORDER,
  orderItems: [],
  checks: [],
  customer: null,
  table: null,
  marketplaceOrder: null,
};

// ============ PATCH /:orderId/delivery-status ============

describe('PATCH /:orderId/delivery-status', () => {
  const url = `${BASE_URL}/${ORDER.id}/delivery-status`;

  it('returns 401 without auth', async () => {
    const res = await api.anonymous().patch(url).send({ deliveryStatus: 'OUT_FOR_DELIVERY' });
    expect(res.status).toBe(401);
  });

  it('transitions delivery status from PREPARING to OUT_FOR_DELIVERY', async () => {
    const deliveryOrder = {
      ...ORDER,
      orderType: 'delivery',
      deliveryStatus: 'PREPARING',
    };
    prisma.order.findUnique.mockResolvedValueOnce(deliveryOrder);
    prisma.order.update.mockResolvedValue({
      ...ORDER_WITH_INCLUDES,
      orderType: 'delivery',
      deliveryStatus: 'OUT_FOR_DELIVERY',
    });

    const res = await api.owner.patch(url).send({ deliveryStatus: 'OUT_FOR_DELIVERY' });
    expect(res.status).toBe(200);
  });

  it('transitions from OUT_FOR_DELIVERY to DELIVERED', async () => {
    const deliveryOrder = {
      ...ORDER,
      orderType: 'delivery',
      deliveryStatus: 'OUT_FOR_DELIVERY',
    };
    prisma.order.findUnique.mockResolvedValueOnce(deliveryOrder);
    prisma.order.update.mockResolvedValue({
      ...ORDER_WITH_INCLUDES,
      orderType: 'delivery',
      deliveryStatus: 'DELIVERED',
    });

    const res = await api.owner.patch(url).send({ deliveryStatus: 'DELIVERED' });
    expect(res.status).toBe(200);
  });

  it('returns 404 when order does not exist', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    const res = await api.owner.patch(url).send({ deliveryStatus: 'OUT_FOR_DELIVERY' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Delivery order not found');
  });

  it('returns 404 when order is not a delivery order', async () => {
    prisma.order.findUnique.mockResolvedValue({ ...ORDER, orderType: 'dine-in' });

    const res = await api.owner.patch(url).send({ deliveryStatus: 'OUT_FOR_DELIVERY' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Delivery order not found');
  });

  it('returns 409 for invalid transition', async () => {
    const deliveryOrder = {
      ...ORDER,
      orderType: 'delivery',
      deliveryStatus: 'DELIVERED',
    };
    prisma.order.findUnique.mockResolvedValue(deliveryOrder);

    const res = await api.owner.patch(url).send({ deliveryStatus: 'PREPARING' });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Invalid transition');
  });

  it('returns 500 on database error', async () => {
    prisma.order.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.patch(url).send({ deliveryStatus: 'OUT_FOR_DELIVERY' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to update delivery status');
  });
});

// ============ PATCH /:orderId/approval ============

describe('PATCH /:orderId/approval', () => {
  const url = `${BASE_URL}/${ORDER.id}/approval`;

  it('returns 401 without auth', async () => {
    const res = await api.anonymous().patch(url).send({ status: 'APPROVED' });
    expect(res.status).toBe(401);
  });

  it('approves a catering order', async () => {
    const cateringOrder = {
      ...ORDER,
      approvalStatus: 'NEEDS_APPROVAL',
    };
    prisma.order.findUnique
      .mockResolvedValueOnce(cateringOrder)
      .mockResolvedValueOnce({ ...ORDER_WITH_INCLUDES, approvalStatus: 'APPROVED' });
    prisma.order.update.mockResolvedValue({});

    const res = await api.owner.patch(url).send({ status: 'APPROVED', approvedBy: 'owner-1' });
    expect(res.status).toBe(200);
  });

  it('rejects a catering order', async () => {
    const cateringOrder = {
      ...ORDER,
      approvalStatus: 'NEEDS_APPROVAL',
    };
    prisma.order.findUnique
      .mockResolvedValueOnce(cateringOrder)
      .mockResolvedValueOnce({ ...ORDER_WITH_INCLUDES, approvalStatus: 'NOT_APPROVED' });
    prisma.order.update.mockResolvedValue({});

    const res = await api.owner.patch(url).send({ status: 'NOT_APPROVED', approvedBy: 'owner-1' });
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid status', async () => {
    const res = await api.owner.patch(url).send({ status: 'MAYBE' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Status must be APPROVED or NOT_APPROVED');
  });

  it('returns 404 when order does not exist', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    const res = await api.owner.patch(url).send({ status: 'APPROVED' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Order requiring approval not found');
  });

  it('returns 404 when order does not require approval', async () => {
    prisma.order.findUnique.mockResolvedValue({ ...ORDER, approvalStatus: null });

    const res = await api.owner.patch(url).send({ status: 'APPROVED' });
    expect(res.status).toBe(404);
  });

  it('returns 409 when already approved', async () => {
    prisma.order.findUnique.mockResolvedValue({ ...ORDER, approvalStatus: 'APPROVED' });

    const res = await api.owner.patch(url).send({ status: 'APPROVED' });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already');
  });

  it('returns 500 on database error', async () => {
    prisma.order.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.patch(url).send({ status: 'APPROVED' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to update approval status');
  });
});

// ============ PATCH /:orderId/arrival ============

describe('PATCH /:orderId/arrival', () => {
  const url = `${BASE_URL}/${ORDER.id}/arrival`;

  it('returns 401 without auth', async () => {
    const res = await api.anonymous().patch(url);
    expect(res.status).toBe(401);
  });

  it('notifies arrival for a curbside order', async () => {
    const curbsideOrder = {
      ...ORDER,
      vehicleDescription: 'Red Toyota Camry',
      arrivalNotified: false,
    };
    prisma.order.findUnique.mockResolvedValueOnce(curbsideOrder);
    prisma.order.update.mockResolvedValue({
      ...ORDER_WITH_INCLUDES,
      vehicleDescription: 'Red Toyota Camry',
      arrivalNotified: true,
    });

    const res = await api.owner.patch(url);
    expect(res.status).toBe(200);
  });

  it('returns 404 when order does not exist', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    const res = await api.owner.patch(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Curbside order not found');
  });

  it('returns 404 when order has no vehicle description', async () => {
    prisma.order.findUnique.mockResolvedValue({ ...ORDER, vehicleDescription: null });

    const res = await api.owner.patch(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Curbside order not found');
  });

  it('returns 409 when arrival already notified', async () => {
    const curbsideOrder = {
      ...ORDER,
      vehicleDescription: 'Red Toyota Camry',
      arrivalNotified: true,
    };
    prisma.order.findUnique.mockResolvedValue(curbsideOrder);

    const res = await api.owner.patch(url);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Arrival already notified');
  });

  it('returns 500 on database error', async () => {
    prisma.order.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.patch(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to notify arrival');
  });
});
