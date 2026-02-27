import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../test/request-helper';
import { getPrismaMock, resetPrismaMock } from '../test/prisma-mock';
import { RESTAURANT_ID, GIFT_CARD } from '../test/fixtures';

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

const BASE_URL = `/api/restaurant/${RESTAURANT_ID}/gift-cards`;

// Gift card fixture matching the actual schema the route uses
const CARD = {
  id: 'gc-00000000-0000-0000-0000-000000000001',
  restaurantId: RESTAURANT_ID,
  code: 'ABCDEF1234567890',
  type: 'digital',
  initialBalance: 50,
  currentBalance: 50,
  status: 'active',
  purchasedBy: null,
  recipientName: null,
  recipientEmail: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

// ============ GET /gift-cards ============

describe('GET /gift-cards', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(BASE_URL);
    expect(res.status).toBe(401);
  });

  it('returns gift cards list', async () => {
    prisma.giftCard.findMany.mockResolvedValue([CARD]);

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].code).toBe(CARD.code);
  });

  it('returns empty array when no cards exist', async () => {
    prisma.giftCard.findMany.mockResolvedValue([]);

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 on database error', async () => {
    prisma.giftCard.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to list gift cards');
  });
});

// ============ POST /gift-cards ============

describe('POST /gift-cards', () => {
  const validBody = {
    type: 'digital',
    initialBalance: 50,
    recipientName: 'John Doe',
    recipientEmail: 'john@example.com',
  };

  beforeEach(() => {
    // findUnique returns null (no duplicate code)
    prisma.giftCard.findUnique.mockResolvedValue(null);
    prisma.giftCard.create.mockResolvedValue(CARD);
  });

  it('returns 401 without auth', async () => {
    const res = await api.anonymous().post(BASE_URL).send(validBody);
    expect(res.status).toBe(401);
  });

  it('creates a gift card', async () => {
    const res = await api.owner.post(BASE_URL).send(validBody);
    expect(res.status).toBe(201);
    expect(prisma.giftCard.create).toHaveBeenCalled();
  });

  it('returns 400 for missing type', async () => {
    const res = await api.owner.post(BASE_URL).send({ initialBalance: 50 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 for invalid type', async () => {
    const res = await api.owner.post(BASE_URL).send({ type: 'virtual', initialBalance: 50 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-positive balance', async () => {
    const res = await api.owner.post(BASE_URL).send({ type: 'digital', initialBalance: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for negative balance', async () => {
    const res = await api.owner.post(BASE_URL).send({ type: 'digital', initialBalance: -10 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email', async () => {
    const res = await api.owner.post(BASE_URL).send({
      type: 'digital',
      initialBalance: 50,
      recipientEmail: 'not-an-email',
    });
    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    prisma.giftCard.create.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(BASE_URL).send(validBody);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to create gift card');
  });
});

// ============ GET /gift-cards/balance/:code ============

describe('GET /gift-cards/balance/:code', () => {
  it('returns balance for existing card', async () => {
    prisma.giftCard.findUnique.mockResolvedValue(CARD);

    const res = await api.owner.get(`${BASE_URL}/balance/${CARD.code}`);
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(CARD.currentBalance);
    expect(res.body.status).toBe('active');
  });

  it('returns 404 for non-existent card', async () => {
    prisma.giftCard.findUnique.mockResolvedValue(null);

    const res = await api.owner.get(`${BASE_URL}/balance/NONEXISTENT`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Gift card not found');
  });

  it('returns 500 on database error', async () => {
    prisma.giftCard.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(`${BASE_URL}/balance/SOMECODE`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to check balance');
  });
});

// ============ POST /gift-cards/redeem ============

describe('POST /gift-cards/redeem', () => {
  const validRedeem = {
    code: 'ABCDEF1234567890',
    amount: 10,
    orderId: 'order-1',
    redeemedBy: 'staff-1',
  };

  it('returns 401 without auth', async () => {
    const res = await api.anonymous().post(`${BASE_URL}/redeem`).send(validRedeem);
    expect(res.status).toBe(401);
  });

  it('redeems from a gift card', async () => {
    // $transaction mock calls the callback with the prisma proxy
    const updatedCard = { ...CARD, currentBalance: 40 };
    const redemption = { id: 'redemption-1', giftCardId: CARD.id, amount: 10 };

    prisma.giftCard.findUnique.mockResolvedValue(CARD);
    prisma.giftCard.update.mockResolvedValue(updatedCard);
    prisma.giftCardRedemption.create.mockResolvedValue(redemption);

    const res = await api.owner.post(`${BASE_URL}/redeem`).send(validRedeem);
    expect(res.status).toBe(200);
    expect(res.body.card.currentBalance).toBe(40);
    expect(res.body.redemption.amount).toBe(10);
  });

  it('returns 400 when gift card not found', async () => {
    prisma.giftCard.findUnique.mockResolvedValue(null);

    const res = await api.owner.post(`${BASE_URL}/redeem`).send(validRedeem);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not found');
  });

  it('returns 400 when gift card is not active', async () => {
    prisma.giftCard.findUnique.mockResolvedValue({ ...CARD, status: 'disabled' });

    const res = await api.owner.post(`${BASE_URL}/redeem`).send(validRedeem);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not active');
  });

  it('returns 400 for insufficient balance', async () => {
    prisma.giftCard.findUnique.mockResolvedValue({ ...CARD, currentBalance: 5 });

    const res = await api.owner.post(`${BASE_URL}/redeem`).send({ ...validRedeem, amount: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Insufficient');
  });

  it('returns 400 for missing code', async () => {
    const res = await api.owner.post(`${BASE_URL}/redeem`).send({ amount: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 for non-positive amount', async () => {
    const res = await api.owner.post(`${BASE_URL}/redeem`).send({ code: 'ABC', amount: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 500 on unexpected database error', async () => {
    prisma.giftCard.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(`${BASE_URL}/redeem`).send(validRedeem);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to redeem gift card');
  });
});

// ============ PATCH /gift-cards/:cardId ============

describe('PATCH /gift-cards/:cardId', () => {
  const url = `${BASE_URL}/${CARD.id}`;

  it('updates gift card status', async () => {
    prisma.giftCard.update.mockResolvedValue({ ...CARD, status: 'disabled' });

    const res = await api.owner.patch(url).send({ status: 'disabled' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('disabled');
  });

  it('returns 400 for invalid status', async () => {
    const res = await api.owner.patch(url).send({ status: 'expired' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty body', async () => {
    const res = await api.owner.patch(url).send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when card does not exist', async () => {
    prisma.giftCard.update.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.patch(url).send({ status: 'active' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Gift card not found');
  });

  it('returns 500 on database error', async () => {
    prisma.giftCard.update.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.patch(url).send({ status: 'active' });
    expect(res.status).toBe(500);
  });
});

// ============ GET /gift-cards/:cardId/redemptions ============

describe('GET /gift-cards/:cardId/redemptions', () => {
  const url = `${BASE_URL}/${CARD.id}/redemptions`;

  it('returns redemptions list', async () => {
    const redemption = {
      id: 'redemption-1',
      giftCardId: CARD.id,
      amount: 10,
      orderId: 'order-1',
      redeemedBy: 'staff-1',
      createdAt: new Date('2025-06-01'),
    };
    prisma.giftCardRedemption.findMany.mockResolvedValue([redemption]);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].amount).toBe(10);
  });

  it('returns empty array when no redemptions', async () => {
    prisma.giftCardRedemption.findMany.mockResolvedValue([]);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 on database error', async () => {
    prisma.giftCardRedemption.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to list redemptions');
  });
});
