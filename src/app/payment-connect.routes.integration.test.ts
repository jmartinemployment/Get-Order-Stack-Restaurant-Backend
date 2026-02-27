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

// Mock Stripe — must be a real constructor class (not just a function)
vi.mock('stripe', () => {
  class MockStripe {
    accounts = {
      create: vi.fn().mockResolvedValue({ id: 'acct_test123' }),
      retrieve: vi.fn().mockResolvedValue({
        id: 'acct_test123',
        charges_enabled: true,
        details_submitted: true,
        payouts_enabled: true,
      }),
    };
    accountLinks = {
      create: vi.fn().mockResolvedValue({ url: 'https://connect.stripe.com/setup/test' }),
    };
  }
  return { default: MockStripe };
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

const BASE_URL = `/api/restaurant/${RESTAURANT_ID}/connect`;

// ============ Stripe Connect ============

describe('POST /connect/stripe/create-account', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().post(`${BASE_URL}/stripe/create-account`);
    expect(res.status).toBe(401);
  });

  it('creates a new Stripe account', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: RESTAURANT_ID,
      name: 'Test Restaurant',
      stripeConnectedAccountId: null,
    });
    prisma.restaurant.update.mockResolvedValue({});

    const res = await api.owner.post(`${BASE_URL}/stripe/create-account`);
    expect(res.status).toBe(200);
    expect(res.body.accountId).toBe('acct_test123');
  });

  it('returns existing account if already connected', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: RESTAURANT_ID,
      name: 'Test Restaurant',
      stripeConnectedAccountId: 'acct_existing',
    });

    const res = await api.owner.post(`${BASE_URL}/stripe/create-account`);
    expect(res.status).toBe(200);
    expect(res.body.accountId).toBe('acct_existing');
  });

  it('returns 404 when restaurant not found', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);

    const res = await api.owner.post(`${BASE_URL}/stripe/create-account`);
    expect(res.status).toBe(404);
  });
});

describe('POST /connect/stripe/account-link', () => {
  it('creates an account link', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: RESTAURANT_ID,
      stripeConnectedAccountId: 'acct_test123',
    });

    const res = await api.owner.post(`${BASE_URL}/stripe/account-link`).send({
      returnUrl: 'https://example.com/return',
      refreshUrl: 'https://example.com/refresh',
    });
    expect(res.status).toBe(200);
    expect(res.body.url).toContain('stripe.com');
  });

  it('returns 400 when no Stripe account exists', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: RESTAURANT_ID,
      stripeConnectedAccountId: null,
    });

    const res = await api.owner.post(`${BASE_URL}/stripe/account-link`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No Stripe account found');
  });
});

describe('GET /connect/stripe/status', () => {
  it('returns connected status', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: RESTAURANT_ID,
      stripeConnectedAccountId: 'acct_test123',
    });

    const res = await api.owner.get(`${BASE_URL}/stripe/status`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('connected');
    expect(res.body.chargesEnabled).toBe(true);
  });

  it('returns none when no account', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: RESTAURANT_ID,
      stripeConnectedAccountId: null,
    });

    const res = await api.owner.get(`${BASE_URL}/stripe/status`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('none');
  });
});

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
