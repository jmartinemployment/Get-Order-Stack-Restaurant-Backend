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

const prisma = getPrismaMock();

beforeEach(() => {
  resetPrismaMock();
});

const BASE_URL = `/api/merchant/${RESTAURANT_ID}/campaigns`;

const CAMPAIGN = {
  id: 'campaign-00000000-0000-0000-0000-000000000001',
  restaurantId: RESTAURANT_ID,
  name: 'Summer Promo',
  channel: 'email',
  type: 'promotion',
  subject: 'Summer Sale!',
  body: 'Enjoy 20% off all items',
  status: 'draft',
  audienceSegment: null,
  audienceLoyaltyTier: null,
  estimatedRecipients: 100,
  sentAt: null,
  scheduledAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  performance: null,
};

// ============ GET /campaigns ============

describe('GET /campaigns', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().get(BASE_URL);
    expect(res.status).toBe(401);
  });

  it('returns campaigns list', async () => {
    prisma.campaign.findMany.mockResolvedValue([CAMPAIGN]);

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Summer Promo');
  });

  it('returns empty array when no campaigns', async () => {
    prisma.campaign.findMany.mockResolvedValue([]);

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 on database error', async () => {
    prisma.campaign.findMany.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(BASE_URL);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to list campaigns');
  });
});

// ============ POST /campaigns ============

describe('POST /campaigns', () => {
  const validBody = {
    name: 'Summer Promo',
    channel: 'email',
    type: 'promotion',
    body: 'Enjoy 20% off all items',
  };

  it('returns 401 without auth', async () => {
    const res = await api.anonymous().post(BASE_URL).send(validBody);
    expect(res.status).toBe(401);
  });

  it('creates a campaign', async () => {
    prisma.campaign.create.mockResolvedValue(CAMPAIGN);

    const res = await api.owner.post(BASE_URL).send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Summer Promo');
  });

  it('returns 400 for missing name', async () => {
    const res = await api.owner.post(BASE_URL).send({ channel: 'email', type: 'promotion', body: 'text' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 for invalid channel', async () => {
    const res = await api.owner.post(BASE_URL).send({ ...validBody, channel: 'fax' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing body', async () => {
    const res = await api.owner.post(BASE_URL).send({ name: 'Test', channel: 'email', type: 'promotion' });
    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    prisma.campaign.create.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(BASE_URL).send(validBody);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to create campaign');
  });
});

// ============ PATCH /campaigns/:campaignId ============

describe('PATCH /campaigns/:campaignId', () => {
  const url = `${BASE_URL}/${CAMPAIGN.id}`;

  it('updates a campaign', async () => {
    prisma.campaign.update.mockResolvedValue({ ...CAMPAIGN, name: 'Fall Promo' });

    const res = await api.owner.patch(url).send({ name: 'Fall Promo' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Fall Promo');
  });

  it('returns 404 when campaign does not exist', async () => {
    prisma.campaign.update.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.patch(url).send({ name: 'Updated' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Campaign not found');
  });

  it('returns 500 on database error', async () => {
    prisma.campaign.update.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.patch(url).send({ name: 'Updated' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to update campaign');
  });
});

// ============ DELETE /campaigns/:campaignId ============

describe('DELETE /campaigns/:campaignId', () => {
  const url = `${BASE_URL}/${CAMPAIGN.id}`;

  it('cancels a campaign (soft delete)', async () => {
    prisma.campaign.update.mockResolvedValue({ ...CAMPAIGN, status: 'cancelled' });

    const res = await api.owner.delete(url);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
  });

  it('returns 404 when campaign does not exist', async () => {
    prisma.campaign.update.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.delete(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Campaign not found');
  });

  it('returns 500 on database error', async () => {
    prisma.campaign.update.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.delete(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to cancel campaign');
  });
});

// ============ POST /campaigns/:campaignId/send ============

describe('POST /campaigns/:campaignId/send', () => {
  const url = `${BASE_URL}/${CAMPAIGN.id}/send`;

  it('sends a campaign', async () => {
    prisma.campaign.findFirst.mockResolvedValue(CAMPAIGN);
    prisma.campaign.update.mockResolvedValue({ ...CAMPAIGN, status: 'sent', sentAt: new Date() });
    prisma.campaignPerformance.create.mockResolvedValue({});

    const res = await api.owner.post(url);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('sent');
  });

  it('returns 404 when campaign does not exist', async () => {
    prisma.campaign.findFirst.mockResolvedValue(null);

    const res = await api.owner.post(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Campaign not found');
  });

  it('returns 500 on database error', async () => {
    prisma.campaign.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to send campaign');
  });
});

// ============ POST /campaigns/:campaignId/schedule ============

describe('POST /campaigns/:campaignId/schedule', () => {
  const url = `${BASE_URL}/${CAMPAIGN.id}/schedule`;

  it('schedules a campaign', async () => {
    const scheduledAt = '2026-03-15T10:00:00Z';
    prisma.campaign.update.mockResolvedValue({ ...CAMPAIGN, status: 'scheduled', scheduledAt });

    const res = await api.owner.post(url).send({ scheduledAt });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('scheduled');
  });

  it('returns 400 for invalid datetime', async () => {
    const res = await api.owner.post(url).send({ scheduledAt: 'not-a-date' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 404 when campaign does not exist', async () => {
    prisma.campaign.update.mockRejectedValue({ code: 'P2025' });

    const res = await api.owner.post(url).send({ scheduledAt: '2026-03-15T10:00:00Z' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Campaign not found');
  });

  it('returns 500 on database error', async () => {
    prisma.campaign.update.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(url).send({ scheduledAt: '2026-03-15T10:00:00Z' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to schedule campaign');
  });
});

// ============ GET /campaigns/:campaignId/performance ============

describe('GET /campaigns/:campaignId/performance', () => {
  const url = `${BASE_URL}/${CAMPAIGN.id}/performance`;

  it('returns performance data', async () => {
    const perf = { id: 'perf-1', campaignId: CAMPAIGN.id, sent: 100, opened: 50, clicked: 20 };
    prisma.campaignPerformance.findUnique.mockResolvedValue(perf);

    const res = await api.owner.get(url);
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(100);
  });

  it('returns 404 when no performance data', async () => {
    prisma.campaignPerformance.findUnique.mockResolvedValue(null);

    const res = await api.owner.get(url);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Performance data not found');
  });

  it('returns 500 on database error', async () => {
    prisma.campaignPerformance.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.get(url);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to get performance data');
  });
});

// ============ POST /campaigns/audience-estimate ============

describe('POST /campaigns/audience-estimate', () => {
  const url = `${BASE_URL}/audience-estimate`;

  it('returns audience count for all segment', async () => {
    prisma.customer.count.mockResolvedValue(250);

    const res = await api.owner.post(url).send({ audienceSegment: 'all' });
    expect(res.status).toBe(200);
    expect(res.body.estimatedRecipients).toBe(250);
  });

  it('returns audience count for vip segment', async () => {
    prisma.customer.count.mockResolvedValue(15);

    const res = await api.owner.post(url).send({ audienceSegment: 'vip' });
    expect(res.status).toBe(200);
    expect(res.body.estimatedRecipients).toBe(15);
  });

  it('filters by loyalty tier', async () => {
    prisma.customer.count.mockResolvedValue(30);

    const res = await api.owner.post(url).send({ audienceLoyaltyTier: 'gold' });
    expect(res.status).toBe(200);
    expect(res.body.estimatedRecipients).toBe(30);
  });

  it('returns 500 on database error', async () => {
    prisma.customer.count.mockRejectedValue(new Error('DB error'));

    const res = await api.owner.post(url).send({});
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to estimate audience');
  });
});
