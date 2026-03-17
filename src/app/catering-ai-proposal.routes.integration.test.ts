import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../test/request-helper';
import { getPrismaMock, resetPrismaMock } from '../test/prisma-mock';
import { RESTAURANT_ID } from '../test/fixtures';

const { mockGetAnthropicClient, mockGenerateProposalContent } = vi.hoisted(() => ({
  mockGetAnthropicClient: vi.fn(),
  mockGenerateProposalContent: vi.fn(),
}));

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

vi.mock('../services/ai-config.service', () => ({
  aiConfigService: {
    getAnthropicClientForRestaurant: mockGetAnthropicClient,
  },
}));

vi.mock('../services/catering-proposal-ai.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/catering-proposal-ai.service')>();
  return { ...actual, generateProposalContent: mockGenerateProposalContent };
});

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const prisma = getPrismaMock();

// ─── Fixture helpers ──────────────────────────────────────────────────────

const JOB_ID = 'catering-job-00000000-0000-0000-0001';

function makeCateringJob(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    restaurantId: RESTAURANT_ID,
    title: 'Annual Gala',
    eventType: 'corporate',
    status: 'inquiry',
    fulfillmentDate: new Date('2026-06-15'),
    headcount: 80,
    packages: [{ id: 'pkg-1', name: 'Standard', menuItemIds: ['item-1', 'item-2'] }],
    aiContent: null,
    dietaryRequirements: { vegetarian: 5, vegan: 2, glutenFree: 0, nutAllergy: 0, dairyFree: 0, kosher: 0, halal: 0, other: '' },
    restaurant: { name: 'Test Restaurant' },
    ...overrides,
  };
}

function makeMenuItems() {
  return [
    { id: 'item-1', name: 'Caesar Salad', description: 'Classic salad.' },
    { id: 'item-2', name: 'Pasta', description: 'House pasta.' },
  ];
}

function makeAiResult() {
  return {
    intro: 'We are excited to cater your event.',
    menuDescriptions: [
      { itemId: 'item-1', itemName: 'Caesar Salad', description: 'A classic Caesar salad.' },
      { itemId: 'item-2', itemName: 'Pasta', description: 'Freshly made pasta.' },
    ],
    serviceOverview: 'Our team will provide excellent service.',
    dietaryStatement: 'We accommodate all dietary needs.',
    closing: 'Looking forward to working with you.',
    truncated: false,
    originalItemCount: 2,
  };
}

const mockAnthropicClient = { messages: { create: vi.fn() } };

const BASE = `/api/merchant/${RESTAURANT_ID}/catering/events/${JOB_ID}/proposal`;

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
});

// ─── POST .../proposal/generate ──────────────────────────────────────────

describe('POST /catering/events/:id/proposal/generate', () => {
  it('returns 404 when catering event does not exist', async () => {
    prisma.cateringEvent.findFirst.mockResolvedValue(null);

    const res = await api.owner.post(`${BASE}/generate`);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  it('returns 400 when tone is an invalid value', async () => {
    prisma.cateringEvent.findFirst.mockResolvedValue(makeCateringJob());

    const res = await api.owner.post(`${BASE}/generate`).send({ tone: 'sarcastic' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Validation failed');
  });

  it('returns 500 when generateProposalContent throws', async () => {
    prisma.cateringEvent.findFirst.mockResolvedValue(makeCateringJob());
    prisma.menuItem.findMany.mockResolvedValue(makeMenuItems());
    mockGetAnthropicClient.mockResolvedValue(mockAnthropicClient);
    mockGenerateProposalContent.mockRejectedValue(new Error('Anthropic API unavailable'));

    const res = await api.owner.post(`${BASE}/generate`);

    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Failed to generate');
  });

  it('returns 403 when aiConfigService returns null (feature disabled)', async () => {
    prisma.cateringEvent.findFirst.mockResolvedValue(makeCateringJob());
    mockGetAnthropicClient.mockResolvedValue(null);

    const res = await api.owner.post(`${BASE}/generate`, { tone: 'professional' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not enabled');
  });

  it('returns 429 with Retry-After header when generatedAt < 30s ago', async () => {
    const recentGeneratedAt = new Date(Date.now() - 10_000).toISOString(); // 10 seconds ago
    prisma.cateringEvent.findFirst.mockResolvedValue(
      makeCateringJob({ aiContent: { generatedAt: recentGeneratedAt, intro: 'Old intro', menuDescriptions: [], serviceOverview: '', dietaryStatement: '', closing: '', tone: 'professional' } }),
    );
    mockGetAnthropicClient.mockResolvedValue(mockAnthropicClient);

    const res = await api.owner.post(`${BASE}/generate`, { tone: 'professional' });

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    const retryAfter = Number.parseInt(res.headers['retry-after'], 10);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(30);
    expect(res.body).toHaveProperty('retryAfter');
  });

  it('returns 201 with ProposalAiContent shape on success', async () => {
    prisma.cateringEvent.findFirst.mockResolvedValue(makeCateringJob());
    prisma.menuItem.findMany.mockResolvedValue(makeMenuItems());
    prisma.cateringEvent.update.mockResolvedValue(makeCateringJob());
    mockGetAnthropicClient.mockResolvedValue(mockAnthropicClient);
    mockGenerateProposalContent.mockResolvedValue(makeAiResult());

    const res = await api.owner.post(`${BASE}/generate`, { tone: 'professional' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('intro');
    expect(res.body).toHaveProperty('menuDescriptions');
    expect(res.body).toHaveProperty('serviceOverview');
    expect(res.body).toHaveProperty('dietaryStatement');
    expect(res.body).toHaveProperty('closing');
    expect(res.body).toHaveProperty('generatedAt');
    expect(res.body).toHaveProperty('tone', 'professional');
  });

  it('surfaces truncated: true when job packages exceed 50 menu items', async () => {
    prisma.cateringEvent.findFirst.mockResolvedValue(makeCateringJob());
    prisma.menuItem.findMany.mockResolvedValue(makeMenuItems());
    prisma.cateringEvent.update.mockResolvedValue(makeCateringJob());
    mockGetAnthropicClient.mockResolvedValue(mockAnthropicClient);
    mockGenerateProposalContent.mockResolvedValue({ ...makeAiResult(), truncated: true, originalItemCount: 55 });

    const res = await api.owner.post(`${BASE}/generate`, { tone: 'professional' });

    expect(res.status).toBe(201);
    expect(res.body.truncated).toBe(true);
    expect(res.body.originalItemCount).toBe(55);
  });

  it('persists result to CateringEvent.aiContent', async () => {
    prisma.cateringEvent.findFirst.mockResolvedValue(makeCateringJob());
    prisma.menuItem.findMany.mockResolvedValue(makeMenuItems());
    prisma.cateringEvent.update.mockResolvedValue(makeCateringJob());
    mockGetAnthropicClient.mockResolvedValue(mockAnthropicClient);
    mockGenerateProposalContent.mockResolvedValue(makeAiResult());

    await api.owner.post(`${BASE}/generate`, { tone: 'warm' });

    expect(prisma.cateringEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: JOB_ID },
        data: expect.objectContaining({ aiContent: expect.any(Object) }),
      }),
    );
  });

  it('deduplicates menu item IDs from multiple packages', async () => {
    const jobWithDupeIds = makeCateringJob({
      packages: [
        { id: 'pkg-1', menuItemIds: ['item-1', 'item-2'] },
        { id: 'pkg-2', menuItemIds: ['item-2', 'item-3'] }, // item-2 duplicated
      ],
    });
    prisma.cateringEvent.findFirst.mockResolvedValue(jobWithDupeIds);
    prisma.menuItem.findMany.mockResolvedValue(makeMenuItems());
    prisma.cateringEvent.update.mockResolvedValue(jobWithDupeIds);
    mockGetAnthropicClient.mockResolvedValue(mockAnthropicClient);
    mockGenerateProposalContent.mockResolvedValue(makeAiResult());

    await api.owner.post(`${BASE}/generate`, { tone: 'casual' });

    expect(prisma.menuItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: expect.arrayContaining(['item-1', 'item-2', 'item-3']) } },
      }),
    );
    // Verify deduplication: should be called with exactly 3 unique IDs, not 4
    const callArgs = prisma.menuItem.findMany.mock.calls[0][0];
    expect(callArgs.where.id.in).toHaveLength(3);
  });
});

// ─── PATCH .../proposal/content ──────────────────────────────────────────

describe('PATCH /catering/events/:id/proposal/content', () => {
  const patchPayload = {
    intro: 'Updated introduction.',
    serviceOverview: 'Updated service overview.',
    dietaryStatement: 'Updated dietary statement.',
    closing: 'Updated closing paragraph.',
    menuDescriptions: [
      { itemId: 'item-1', itemName: 'Caesar Salad', description: 'Edited salad description.' },
    ],
  };

  it('returns 404 when aiContent is null on the job (nothing to patch)', async () => {
    prisma.cateringEvent.findFirst.mockResolvedValue(makeCateringJob({ aiContent: null }));

    const res = await api.owner.patch(`${BASE}/content`).send(patchPayload);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Generate content first');
  });

  it('merges edits and preserves generatedAt and tone', async () => {
    const existingContent = {
      intro: 'Original intro.',
      menuDescriptions: [{ itemId: 'item-1', itemName: 'Caesar Salad', description: 'Original salad.' }],
      serviceOverview: 'Original service.',
      dietaryStatement: 'Original dietary.',
      closing: 'Original closing.',
      generatedAt: '2026-03-17T10:00:00.000Z',
      tone: 'professional',
    };
    prisma.cateringEvent.findFirst.mockResolvedValue(makeCateringJob({ aiContent: existingContent }));
    prisma.cateringEvent.update.mockImplementation(({ data }: { data: { aiContent: unknown } }) =>
      Promise.resolve(makeCateringJob({ aiContent: data.aiContent })),
    );

    const res = await api.owner.patch(`${BASE}/content`).send(patchPayload);

    expect(res.status).toBe(200);
    expect(res.body.generatedAt).toBe('2026-03-17T10:00:00.000Z');
    expect(res.body.tone).toBe('professional');
    expect(res.body.intro).toBe('Updated introduction.');
  });

  it('returns updated aiContent with edited fields', async () => {
    const existingContent = {
      intro: 'Original.',
      menuDescriptions: [],
      serviceOverview: 'Original svc.',
      dietaryStatement: '',
      closing: 'Original close.',
      generatedAt: '2026-03-17T09:00:00.000Z',
      tone: 'warm',
    };
    prisma.cateringEvent.findFirst.mockResolvedValue(makeCateringJob({ aiContent: existingContent }));
    prisma.cateringEvent.update.mockImplementation(({ data }: { data: { aiContent: unknown } }) =>
      Promise.resolve(makeCateringJob({ aiContent: data.aiContent })),
    );

    const res = await api.owner.patch(`${BASE}/content`).send(patchPayload);

    expect(res.status).toBe(200);
    expect(res.body.intro).toBe('Updated introduction.');
    expect(res.body.serviceOverview).toBe('Updated service overview.');
    expect(res.body.closing).toBe('Updated closing paragraph.');
    expect(res.body.menuDescriptions[0].description).toBe('Edited salad description.');
  });
});
