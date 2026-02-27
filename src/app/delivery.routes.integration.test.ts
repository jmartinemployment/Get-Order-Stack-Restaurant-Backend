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
      checkRestaurantAccess: vi.fn().mockResolvedValue({ hasAccess: true, role: 'owner' }),
    },
  };
});

// Mock delivery service
vi.mock('../services/delivery.service', () => ({
  deliveryService: {
    getConfigStatus: vi.fn().mockResolvedValue({ doordash: false, uber: false }),
    requestQuote: vi.fn().mockResolvedValue({ quoteId: 'q1', fee: 5.99, eta: 30 }),
    acceptQuote: vi.fn().mockResolvedValue({ deliveryId: 'd1', status: 'dispatched' }),
    getStatus: vi.fn().mockResolvedValue({ status: 'en_route', eta: 15 }),
    cancelDelivery: vi.fn().mockResolvedValue(true),
    getActiveAssignments: vi.fn().mockResolvedValue([]),
    getDrivers: vi.fn().mockResolvedValue([]),
  },
}));

// Mock delivery credentials service
vi.mock('../services/delivery-credentials.service', () => ({
  deliveryCredentialsService: {
    getSummary: vi.fn().mockResolvedValue({ doordash: { configured: false }, uber: { configured: false } }),
    getSecurityProfile: vi.fn().mockResolvedValue({ mode: 'free' }),
    setSecurityProfile: vi.fn().mockResolvedValue({ mode: 'free' }),
    upsertDoorDash: vi.fn().mockResolvedValue({ doordash: { configured: true } }),
    clearDoorDash: vi.fn().mockResolvedValue({ doordash: { configured: false } }),
    upsertUber: vi.fn().mockResolvedValue({ uber: { configured: true } }),
    clearUber: vi.fn().mockResolvedValue({ uber: { configured: false } }),
  },
}));

const prisma = getPrismaMock();

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
});

const BASE_URL = `/api/restaurant/${RESTAURANT_ID}/delivery`;
const ORDER_ID = '11111111-1111-4111-a111-111111111111';

// ============ GET /config-status ============

describe('GET /config-status', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(`${BASE_URL}/config-status`);
    expect(res.status).toBe(401);
  });

  it('returns config status', async () => {
    const res = await api.owner.get(`${BASE_URL}/config-status`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('doordash');
  });
});

// ============ GET /credentials ============

describe('GET /credentials', () => {
  it('returns credentials summary for owner', async () => {
    const res = await api.owner.get(`${BASE_URL}/credentials`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('doordash');
  });

  it('returns credentials summary for manager', async () => {
    const res = await api.manager.get(`${BASE_URL}/credentials`);
    expect(res.status).toBe(200);
  });

  it('returns 403 for staff role', async () => {
    const { authService } = await import('../services/auth.service');
    vi.mocked(authService.checkRestaurantAccess).mockResolvedValueOnce({ hasAccess: true, role: 'staff' });

    const res = await api.staff.get(`${BASE_URL}/credentials`);
    expect(res.status).toBe(403);
  });
});

// ============ GET /credentials/security-profile ============

describe('GET /credentials/security-profile', () => {
  it('returns security profile for owner', async () => {
    const res = await api.owner.get(`${BASE_URL}/credentials/security-profile`);
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('free');
  });
});

// ============ PUT /credentials/security-profile ============

describe('PUT /credentials/security-profile', () => {
  it('updates security profile', async () => {
    const res = await api.owner.put(`${BASE_URL}/credentials/security-profile`).send({ mode: 'free' });
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid mode', async () => {
    const res = await api.owner.put(`${BASE_URL}/credentials/security-profile`).send({ mode: 'invalid' });
    expect(res.status).toBe(400);
  });
});

// ============ PUT /credentials/doordash ============

describe('PUT /credentials/doordash', () => {
  it('saves doordash credentials', async () => {
    const res = await api.owner.put(`${BASE_URL}/credentials/doordash`).send({
      apiKey: 'test-key',
      signingSecret: 'test-secret',
    });
    expect(res.status).toBe(200);
    expect(res.body.doordash.configured).toBe(true);
  });

  it('returns 400 when no fields provided', async () => {
    const res = await api.owner.put(`${BASE_URL}/credentials/doordash`).send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty apiKey', async () => {
    const res = await api.owner.put(`${BASE_URL}/credentials/doordash`).send({ apiKey: '' });
    expect(res.status).toBe(400);
  });
});

// ============ DELETE /credentials/doordash ============

describe('DELETE /credentials/doordash', () => {
  it('clears doordash credentials', async () => {
    const res = await api.owner.delete(`${BASE_URL}/credentials/doordash`);
    expect(res.status).toBe(200);
    expect(res.body.doordash.configured).toBe(false);
  });
});

// ============ PUT /credentials/uber ============

describe('PUT /credentials/uber', () => {
  it('saves uber credentials', async () => {
    const res = await api.owner.put(`${BASE_URL}/credentials/uber`).send({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
    });
    expect(res.status).toBe(200);
    expect(res.body.uber.configured).toBe(true);
  });

  it('returns 400 when no fields provided', async () => {
    const res = await api.owner.put(`${BASE_URL}/credentials/uber`).send({});
    expect(res.status).toBe(400);
  });
});

// ============ DELETE /credentials/uber ============

describe('DELETE /credentials/uber', () => {
  it('clears uber credentials', async () => {
    const res = await api.owner.delete(`${BASE_URL}/credentials/uber`);
    expect(res.status).toBe(200);
    expect(res.body.uber.configured).toBe(false);
  });
});

// ============ POST /quote ============

describe('POST /quote', () => {
  it('returns a delivery quote', async () => {
    const res = await api.owner.post(`${BASE_URL}/quote`).send({
      orderId: ORDER_ID,
      provider: 'doordash',
    });
    expect(res.status).toBe(200);
    expect(res.body.quoteId).toBe('q1');
    expect(res.body.fee).toBe(5.99);
  });

  it('returns 400 for missing orderId', async () => {
    const res = await api.owner.post(`${BASE_URL}/quote`).send({ provider: 'doordash' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid provider', async () => {
    const res = await api.owner.post(`${BASE_URL}/quote`).send({ orderId: ORDER_ID, provider: 'grubhub' });
    expect(res.status).toBe(400);
  });

  it('returns 503 when provider not configured', async () => {
    const { deliveryService } = await import('../services/delivery.service');
    vi.mocked(deliveryService.requestQuote).mockRejectedValueOnce(new Error('Provider not configured'));

    const res = await api.owner.post(`${BASE_URL}/quote`).send({ orderId: ORDER_ID, provider: 'doordash' });
    expect(res.status).toBe(503);
  });

  it('returns 404 when order not found', async () => {
    const { deliveryService } = await import('../services/delivery.service');
    vi.mocked(deliveryService.requestQuote).mockRejectedValueOnce(new Error('Order not found'));

    const res = await api.owner.post(`${BASE_URL}/quote`).send({ orderId: ORDER_ID, provider: 'doordash' });
    expect(res.status).toBe(404);
  });
});

// ============ POST /dispatch ============

describe('POST /dispatch', () => {
  it('dispatches a delivery', async () => {
    const res = await api.owner.post(`${BASE_URL}/dispatch`).send({
      orderId: ORDER_ID,
      quoteId: 'q1',
    });
    expect(res.status).toBe(200);
    expect(res.body.deliveryId).toBe('d1');
  });

  it('returns 400 for missing quoteId', async () => {
    const res = await api.owner.post(`${BASE_URL}/dispatch`).send({ orderId: ORDER_ID });
    expect(res.status).toBe(400);
  });

  it('returns 410 when quote expired', async () => {
    const { deliveryService } = await import('../services/delivery.service');
    vi.mocked(deliveryService.acceptQuote).mockRejectedValueOnce(new Error('Quote expired'));

    const res = await api.owner.post(`${BASE_URL}/dispatch`).send({ orderId: ORDER_ID, quoteId: 'q1' });
    expect(res.status).toBe(410);
  });
});

// ============ GET /:orderId/status ============

describe('GET /:orderId/status', () => {
  it('returns delivery status', async () => {
    const res = await api.owner.get(`${BASE_URL}/${ORDER_ID}/status`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('en_route');
  });

  it('returns 404 when delivery not found', async () => {
    const { deliveryService } = await import('../services/delivery.service');
    vi.mocked(deliveryService.getStatus).mockResolvedValueOnce(null);

    const res = await api.owner.get(`${BASE_URL}/${ORDER_ID}/status`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Delivery not found or not dispatched');
  });
});

// ============ POST /:orderId/cancel ============

describe('POST /:orderId/cancel', () => {
  it('cancels a delivery', async () => {
    const res = await api.owner.post(`${BASE_URL}/${ORDER_ID}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 409 when delivery cannot be cancelled', async () => {
    const { deliveryService } = await import('../services/delivery.service');
    vi.mocked(deliveryService.cancelDelivery).mockResolvedValueOnce(false);

    const res = await api.owner.post(`${BASE_URL}/${ORDER_ID}/cancel`);
    expect(res.status).toBe(409);
  });
});

// ============ GET /assignments ============

describe('GET /assignments', () => {
  it('returns active assignments', async () => {
    const res = await api.owner.get(`${BASE_URL}/assignments`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns empty array on error (graceful)', async () => {
    const { deliveryService } = await import('../services/delivery.service');
    vi.mocked(deliveryService.getActiveAssignments).mockRejectedValueOnce(new Error('Not implemented'));

    const res = await api.owner.get(`${BASE_URL}/assignments`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ============ GET /drivers ============

describe('GET /drivers', () => {
  it('returns drivers list', async () => {
    const res = await api.owner.get(`${BASE_URL}/drivers`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns empty array on error (graceful)', async () => {
    const { deliveryService } = await import('../services/delivery.service');
    vi.mocked(deliveryService.getDrivers).mockRejectedValueOnce(new Error('Not implemented'));

    const res = await api.owner.get(`${BASE_URL}/drivers`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
