import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateProposalContent } from './catering-proposal-ai.service';

// Mock dependencies
vi.mock('./ai-usage.service', () => ({
  aiUsageService: {
    logUsage: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { aiUsageService } from './ai-usage.service';
import { logger } from '../utils/logger';

function makeJob(overrides: Partial<{
  id: string;
  restaurantId: string;
  title: string;
  eventType: string;
  fulfillmentDate: Date;
  headcount: number;
  dietaryRequirements: unknown;
  restaurant: { name: string };
}> = {}) {
  return {
    id: 'job-1',
    restaurantId: 'rest-1',
    title: 'Annual Corporate Gala',
    eventType: 'corporate',
    fulfillmentDate: new Date('2026-06-15'),
    headcount: 100,
    dietaryRequirements: { vegetarian: 10, vegan: 5, glutenFree: 0, nutAllergy: 0, dairyFree: 0, kosher: 0, halal: 0, other: '' },
    restaurant: { name: 'Test Restaurant' },
    ...overrides,
  };
}

function makeMenuItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i + 1}`,
    name: `Menu Item ${i + 1}`,
    description: `Description for item ${i + 1}`,
  }));
}

function makeValidAiResponse(menuItems: { id: string; name: string }[]) {
  return JSON.stringify({
    intro: 'We are thrilled to cater your event.',
    menuDescriptions: menuItems.map(item => ({
      itemId: item.id,
      itemName: item.name,
      description: `A delightful ${item.name} prepared fresh for your guests.`,
    })),
    serviceOverview: 'Our professional team will ensure seamless service throughout the event.',
    dietaryStatement: 'We accommodate all dietary requirements with care.',
    closing: 'We look forward to making your event memorable.',
  });
}

function makeAnthropicClient(responseText: string, inputTokens = 500, outputTokens = 300) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseText }],
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      }),
    },
  } as unknown as import('@anthropic-ai/sdk').default;
}

describe('generateProposalContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all 5 sections when Claude returns valid JSON', async () => {
    const items = makeMenuItems(3);
    const client = makeAnthropicClient(makeValidAiResponse(items));
    const job = makeJob();

    const result = await generateProposalContent(client, job, items, 'professional');

    expect(result.intro).toBe('We are thrilled to cater your event.');
    expect(result.serviceOverview).toContain('professional team');
    expect(result.dietaryStatement).toContain('dietary');
    expect(result.closing).toContain('memorable');
    expect(result.menuDescriptions).toHaveLength(3);
  });

  it('sets truncated: false when items <= 50', async () => {
    const items = makeMenuItems(10);
    const client = makeAnthropicClient(makeValidAiResponse(items));

    const result = await generateProposalContent(client, makeJob(), items, 'warm');

    expect(result.truncated).toBe(false);
    expect(result.originalItemCount).toBe(10);
  });

  it('truncates menuItems to 50, sets truncated: true, calls logger.warn', async () => {
    const items = makeMenuItems(60);
    const first50 = items.slice(0, 50);
    const client = makeAnthropicClient(makeValidAiResponse(first50));

    const result = await generateProposalContent(client, makeJob(), items, 'casual');

    expect(result.truncated).toBe(true);
    expect(result.originalItemCount).toBe(60);
    expect(logger.warn).toHaveBeenCalledWith(
      '[catering-proposal-ai] Menu items truncated for AI generation',
      expect.objectContaining({ originalCount: 60, truncatedTo: 50 }),
    );
    // Anthropic should have been called with only 50 items
    const createCall = client.messages.create.mock.calls[0][0];
    expect(createCall.messages[0].content).toContain('50. Menu Item 50');
  });

  it('fills missing menuDescriptions with item.name as fallback', async () => {
    const items = makeMenuItems(3);
    // Only return descriptions for items 1 and 3 — item 2 missing
    const partialResponse = JSON.stringify({
      intro: 'Intro text.',
      menuDescriptions: [
        { itemId: 'item-1', itemName: 'Menu Item 1', description: 'Delicious item 1.' },
        { itemId: 'item-3', itemName: 'Menu Item 3', description: 'Delicious item 3.' },
      ],
      serviceOverview: 'Great service.',
      dietaryStatement: '',
      closing: 'Thanks.',
    });
    const client = makeAnthropicClient(partialResponse);

    const result = await generateProposalContent(client, makeJob(), items, 'professional');

    expect(result.menuDescriptions).toHaveLength(3);
    const item2Desc = result.menuDescriptions.find(d => d.itemId === 'item-2');
    expect(item2Desc?.description).toBe('Menu Item 2');
  });

  it('throws when Claude returns malformed JSON', async () => {
    const items = makeMenuItems(2);
    const client = makeAnthropicClient('not valid json at all {{}}');

    await expect(
      generateProposalContent(client, makeJob(), items, 'professional'),
    ).rejects.toThrow('AI returned malformed JSON');

    expect(logger.error).toHaveBeenCalledWith(
      '[catering-proposal-ai] JSON parse failed',
      expect.objectContaining({ jobId: 'job-1' }),
    );
  });

  it('throws when Anthropic API call rejects', async () => {
    const items = makeMenuItems(2);
    const client = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error('Anthropic API unavailable')),
      },
    } as unknown as import('@anthropic-ai/sdk').default;

    await expect(
      generateProposalContent(client, makeJob(), items, 'warm'),
    ).rejects.toThrow('Anthropic API unavailable');

    expect(logger.error).toHaveBeenCalledWith(
      '[catering-proposal-ai] Anthropic API call failed',
      expect.objectContaining({ jobId: 'job-1' }),
    );
  });

  it('calls aiUsageService.logUsage with correct tokens', async () => {
    const items = makeMenuItems(2);
    const client = makeAnthropicClient(makeValidAiResponse(items), 400, 250);

    await generateProposalContent(client, makeJob(), items, 'professional');

    expect(aiUsageService.logUsage).toHaveBeenCalledWith(
      'rest-1',
      'aiCateringProposals',
      400,
      250,
    );
  });
});
