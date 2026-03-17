import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./ai-config.service', () => ({
  aiConfigService: {
    getAnthropicClientForRestaurant: vi.fn(),
  },
}));

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

vi.mock('../utils/errors', () => ({
  toErrorMessage: (e: unknown) => e instanceof Error ? e.message : String(e),
}));

import { analyzeOrderSentiment } from './sentiment-analysis.service';
import { aiConfigService } from './ai-config.service';
import { aiUsageService } from './ai-usage.service';

const RESTAURANT_ID = 'rest-1';
const ORDER_ID = 'order-1';
const ORDER_NUMBER = '1001';

function makeAiResponse(overrides: Partial<{
  sentiment: string;
  flags: string[];
  urgency: string;
  summary: string;
}> = {}) {
  return {
    sentiment: 'neutral',
    flags: [],
    urgency: 'low',
    summary: 'Standard order instruction',
    ...overrides,
  };
}

function makeMockClient(responseObj: object, inputTokens = 100, outputTokens = 50) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(responseObj) }],
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      }),
    },
  };
}

describe('analyzeOrderSentiment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('happy path (Claude AI)', () => {
    it('returns critical urgency with allergy flag for "severe nut allergy"', async () => {
      const client = makeMockClient(makeAiResponse({
        sentiment: 'negative',
        flags: ['allergy'],
        urgency: 'critical',
        summary: 'Customer has a severe nut allergy',
      }));
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(client as never);

      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'severe nut allergy');

      expect(result).not.toBeNull();
      expect(result!.urgency).toBe('critical');
      expect(result!.flags).toContain('allergy');
    });

    it('returns high urgency with complaint flag for "remake this, last order was wrong"', async () => {
      const client = makeMockClient(makeAiResponse({
        sentiment: 'negative',
        flags: ['complaint'],
        urgency: 'high',
        summary: 'Customer wants a remake due to previous error',
      }));
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(client as never);

      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'remake this, last order was wrong');

      expect(result).not.toBeNull();
      expect(result!.urgency).toBe('high');
      expect(result!.flags).toContain('complaint');
    });

    it('returns medium urgency with rush flag for "asap please, in a rush"', async () => {
      const client = makeMockClient(makeAiResponse({
        sentiment: 'neutral',
        flags: ['rush'],
        urgency: 'medium',
        summary: 'Customer in a hurry',
      }));
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(client as never);

      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'asap please, in a rush');

      expect(result).not.toBeNull();
      expect(result!.urgency).toBe('medium');
      expect(result!.flags).toContain('rush');
    });

    it('returns low urgency with compliment flag for "great job last time!"', async () => {
      const client = makeMockClient(makeAiResponse({
        sentiment: 'positive',
        flags: ['compliment'],
        urgency: 'low',
        summary: 'Customer left a compliment',
      }));
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(client as never);

      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'great job last time!');

      expect(result).not.toBeNull();
      expect(result!.urgency).toBe('low');
      expect(result!.flags).toContain('compliment');
    });

    it('calls aiUsageService.logUsage with correct args after Claude success', async () => {
      const client = makeMockClient(makeAiResponse(), 200, 80);
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(client as never);

      await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'some instructions');

      expect(aiUsageService.logUsage).toHaveBeenCalledWith(
        RESTAURANT_ID,
        'sentimentAnalysis',
        200,
        80,
      );
    });

    it('does NOT call aiUsageService.logUsage when JSON parse fails', async () => {
      const client = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'not valid json {{}}' }],
            usage: { input_tokens: 100, output_tokens: 50 },
          }),
        },
      };
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(client as never);

      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'some instructions');

      expect(aiUsageService.logUsage).not.toHaveBeenCalled();
      // Falls back to keyword — still returns a result
      expect(result).not.toBeNull();
    });
  });

  describe('AI config gating', () => {
    it('falls back to keyword matching when getAnthropicClientForRestaurant returns null', async () => {
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(null);

      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'nut allergy concern');

      expect(result).not.toBeNull();
      expect(result!.urgency).toBe('critical');
      expect(result!.flags).toContain('allergy');
    });

    it('calls Claude API when client is returned', async () => {
      const client = makeMockClient(makeAiResponse());
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(client as never);

      await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'hello');

      expect(client.messages.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('keyword fallback', () => {
    beforeEach(() => {
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(null);
    });

    it('falls back to keywords when Claude API throws', async () => {
      const client = {
        messages: {
          create: vi.fn().mockRejectedValue(new Error('Anthropic API unavailable')),
        },
      };
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(client as never);

      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'I am angry about my order');

      expect(result).not.toBeNull();
      expect(result!.urgency).toBe('high');
    });

    it('falls back to keywords when Claude returns malformed JSON', async () => {
      const client = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: '<<<not json>>>' }],
            usage: { input_tokens: 50, output_tokens: 20 },
          }),
        },
      };
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(client as never);

      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'please hurry up');

      expect(result).not.toBeNull();
      expect(result!.urgency).toBe('medium');
      expect(result!.flags).toContain('rush');
    });

    describe('CRITICAL_KEYWORDS → urgency: critical', () => {
      const criticalKeywords = ['allergy', 'allergic', 'nut', 'peanut', 'shellfish', 'celiac', 'epipen'];

      for (const keyword of criticalKeywords) {
        it(`"${keyword}" → urgency: critical`, async () => {
          const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, `please note ${keyword}`);

          expect(result).not.toBeNull();
          expect(result!.urgency).toBe('critical');
        });
      }
    });

    describe('HIGH_KEYWORDS → urgency: high', () => {
      const highKeywords = ['complaint', 'wrong', 'remake', 'refund', 'angry', 'upset'];

      for (const keyword of highKeywords) {
        it(`"${keyword}" → urgency: high`, async () => {
          const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, `this is ${keyword}`);

          expect(result).not.toBeNull();
          expect(result!.urgency).toBe('high');
        });
      }
    });

    describe('MEDIUM_KEYWORDS → urgency: medium', () => {
      const mediumKeywords = ['rush', 'asap', 'hurry', 'urgent', 'vegan', 'gluten-free', 'kosher', 'halal'];

      for (const keyword of mediumKeywords) {
        it(`"${keyword}" → urgency: medium`, async () => {
          const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, `please ${keyword}`);

          expect(result).not.toBeNull();
          expect(result!.urgency).toBe('medium');
        });
      }
    });

    it('returns urgency: low when no keywords match', async () => {
      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'table by the window');

      expect(result).not.toBeNull();
      expect(result!.urgency).toBe('low');
    });

    it('highest urgency wins when mixed — "allergic and in a rush" → critical', async () => {
      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'allergic and in a rush');

      expect(result).not.toBeNull();
      expect(result!.urgency).toBe('critical');
    });

    it('is case insensitive — "NUT ALLERGY" → critical', async () => {
      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'NUT ALLERGY');

      expect(result).not.toBeNull();
      expect(result!.urgency).toBe('critical');
    });

    it('allergy keywords produce allergy flag', async () => {
      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'has a peanut allergy');

      expect(result).not.toBeNull();
      expect(result!.flags).toContain('allergy');
    });

    it('rush keywords produce rush flag', async () => {
      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'need this asap');

      expect(result).not.toBeNull();
      expect(result!.flags).toContain('rush');
    });

    it('complaint keywords produce complaint flag', async () => {
      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'need a refund for wrong order');

      expect(result).not.toBeNull();
      expect(result!.flags).toContain('complaint');
    });

    it('compliment keywords produce compliment flag', async () => {
      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'food was amazing last time');

      expect(result).not.toBeNull();
      expect(result!.flags).toContain('compliment');
    });

    it('positive keywords produce positive sentiment', async () => {
      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'great excellent amazing');

      expect(result).not.toBeNull();
      expect(result!.sentiment).toBe('positive');
    });

    it('negative keywords produce negative sentiment', async () => {
      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'terrible awful horrible');

      expect(result).not.toBeNull();
      expect(result!.sentiment).toBe('negative');
    });

    it('neutral text produces neutral sentiment', async () => {
      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'table by the window please');

      expect(result).not.toBeNull();
      expect(result!.sentiment).toBe('neutral');
    });
  });

  describe('edge cases', () => {
    it('returns null for empty string', async () => {
      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, '');

      expect(result).toBeNull();
    });

    it('returns null for whitespace-only string', async () => {
      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, '   \t\n  ');

      expect(result).toBeNull();
    });

    it('does not call AI config for empty input', async () => {
      await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, '');

      expect(aiConfigService.getAnthropicClientForRestaurant).not.toHaveBeenCalled();
    });

    it('passes tableNumber to Claude prompt when provided', async () => {
      const client = makeMockClient(makeAiResponse());
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(client as never);

      await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'no onions', 'T5');

      const createCall = client.messages.create.mock.calls[0][0];
      expect(createCall.messages[0].content).toContain('Table: T5');
    });

    it('passes "N/A" for table when tableNumber is undefined', async () => {
      const client = makeMockClient(makeAiResponse());
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(client as never);

      await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'no onions');

      const createCall = client.messages.create.mock.calls[0][0];
      expect(createCall.messages[0].content).toContain('Table: N/A');
    });

    it('keyword fallback with dietary keywords produces dietary flag', async () => {
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(null);

      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'I am vegan');

      expect(result).not.toBeNull();
      expect(result!.flags).toContain('dietary');
    });

    it('keyword fallback with modification keywords produces modification flag', async () => {
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(null);

      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'no pickles extra cheese');

      expect(result).not.toBeNull();
      expect(result!.flags).toContain('modification');
    });

    it('keyword fallback produces correct summary for critical urgency', async () => {
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(null);

      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'peanut allergy');

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Order contains allergy concern');
    });

    it('keyword fallback produces correct summary for high urgency', async () => {
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(null);

      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'this is a complaint');

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Order contains customer complaint');
    });

    it('keyword fallback produces rush summary for medium urgency with rush flag', async () => {
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(null);

      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'in a rush please');

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Customer requests rush preparation');
    });

    it('keyword fallback produces dietary summary for medium urgency without rush', async () => {
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(null);

      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'need halal options');

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Order contains dietary restriction');
    });

    it('keyword fallback produces compliment summary for low urgency with compliment', async () => {
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(null);

      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'food was fantastic');

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Customer left a compliment');
    });

    it('keyword fallback produces modification summary for low urgency with modification', async () => {
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(null);

      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'no onions please');

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Standard modification request');
    });

    it('keyword fallback produces standard summary when no flags match', async () => {
      vi.mocked(aiConfigService.getAnthropicClientForRestaurant).mockResolvedValue(null);

      const result = await analyzeOrderSentiment(RESTAURANT_ID, ORDER_ID, ORDER_NUMBER, 'table by the window');

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Standard order instruction');
    });
  });
});
