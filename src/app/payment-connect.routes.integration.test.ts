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

// Mock global fetch for PayPal API calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const prisma = getPrismaMock();

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
  // Default PayPal token response
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ access_token: 'test-token' }),
    text: async () => '',
  });
});

const BASE_URL = `/api/merchant/${RESTAURANT_ID}/connect`;

// ============ PayPal Partner Referrals ============

describe('POST /connect/paypal/create-referral', () => {
  it('returns 404 when restaurant not found', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);

    const res = await api.owner.post(`${BASE_URL}/paypal/create-referral`);
    expect(res.status).toBe(404);
  });

  it('returns existing merchant if already connected', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: RESTAURANT_ID,
      name: 'Test',
      paypalMerchantId: 'merchant-123',
    });

    const res = await api.owner.post(`${BASE_URL}/paypal/create-referral`);
    expect(res.status).toBe(200);
    expect(res.body.merchantId).toBe('merchant-123');
    expect(res.body.status).toBe('already_connected');
  });

  it('creates a referral link', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: RESTAURANT_ID,
      name: 'Test',
      paypalMerchantId: null,
    });

    // First call: token, Second call: referral creation
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'test-token' }),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          links: [{ rel: 'action_url', href: 'https://paypal.com/signup/test' }],
        }),
        text: async () => '',
      });

    const res = await api.owner.post(`${BASE_URL}/paypal/create-referral`);
    expect(res.status).toBe(200);
    expect(res.body.actionUrl).toContain('paypal.com');
  });
});

describe('GET /connect/paypal/status', () => {
  it('returns none when no merchant ID', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: RESTAURANT_ID,
      paypalMerchantId: null,
    });

    const res = await api.owner.get(`${BASE_URL}/paypal/status`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('none');
  });

  it('returns connected when payments receivable', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: RESTAURANT_ID,
      paypalMerchantId: 'merchant-123',
    });

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'test-token' }),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          payments_receivable: true,
          primary_email_confirmed: true,
        }),
        text: async () => '',
      });

    const res = await api.owner.get(`${BASE_URL}/paypal/status`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('connected');
  });
});

describe('POST /connect/paypal/complete', () => {
  it('returns 400 without merchantId', async () => {
    const res = await api.owner.post(`${BASE_URL}/paypal/complete`).send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when restaurant not found', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);

    const res = await api.owner.post(`${BASE_URL}/paypal/complete`).send({ merchantId: 'merchant-123' });
    expect(res.status).toBe(404);
  });

  it('links PayPal merchant to restaurant', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ id: RESTAURANT_ID, name: 'Test' });
    prisma.restaurant.update.mockResolvedValue({});

    const res = await api.owner.post(`${BASE_URL}/paypal/complete`).send({ merchantId: 'merchant-123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.merchantId).toBe('merchant-123');
  });
});
