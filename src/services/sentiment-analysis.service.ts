import { aiConfigService } from './ai-config.service';
import { aiUsageService } from './ai-usage.service';
import { logger } from '../utils/logger';
import { toErrorMessage } from '../utils/errors';

interface SentimentResult {
  sentiment: 'positive' | 'neutral' | 'negative';
  flags: string[];
  urgency: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
}

const CRITICAL_KEYWORDS = ['allergy', 'allergic', 'nut', 'peanut', 'shellfish', 'celiac', 'epipen'];
const HIGH_KEYWORDS = ['complaint', 'wrong', 'remake', 'refund', 'angry', 'upset'];
const MEDIUM_KEYWORDS = ['rush', 'asap', 'hurry', 'urgent', 'vegan', 'gluten-free', 'kosher', 'halal'];

const NEGATIVE_KEYWORDS = ['wrong', 'cold', 'late', 'slow', 'bad', 'terrible', 'awful', 'horrible', 'disgusting', 'complaint', 'angry', 'upset', 'worst', 'refund', 'remake'];
const POSITIVE_KEYWORDS = ['great', 'excellent', 'perfect', 'amazing', 'love', 'best', 'wonderful', 'fantastic', 'delicious', 'outstanding'];

const FLAG_KEYWORDS: Record<string, string> = {};
for (const w of ['refund', 'wrong', 'mistake', 'unhappy', 'complaint', 'remake']) FLAG_KEYWORDS[w] = 'complaint';
for (const w of ['allergy', 'allergic', 'gluten', 'dairy', 'nut', 'peanut', 'shellfish', 'celiac', 'epipen']) FLAG_KEYWORDS[w] = 'allergy';
for (const w of ['rush', 'hurry', 'asap', 'quick', 'urgent']) FLAG_KEYWORDS[w] = 'rush';
for (const w of ['great', 'excellent', 'amazing', 'best', 'wonderful', 'fantastic', 'love']) FLAG_KEYWORDS[w] = 'compliment';
for (const w of ['vegan', 'vegetarian', 'keto', 'halal', 'kosher', 'gluten-free', 'dairy-free']) FLAG_KEYWORDS[w] = 'dietary';
for (const w of ['no', 'without', 'extra', 'add', 'remove', 'substitute', 'side']) FLAG_KEYWORDS[w] = 'modification';

function keywordFallback(specialInstructions: string): SentimentResult {
  const lower = specialInstructions.toLowerCase();
  const words = lower.split(/[^a-z-]+/).filter(w => w.length > 0);

  let score = 0;
  for (const word of words) {
    if (POSITIVE_KEYWORDS.includes(word)) score += 15;
    if (NEGATIVE_KEYWORDS.includes(word)) score -= 15;
  }

  const sentiment: SentimentResult['sentiment'] =
    score > 10 ? 'positive' : score < -10 ? 'negative' : 'neutral';

  const flagSet = new Set<string>();
  for (const word of words) {
    const flag = FLAG_KEYWORDS[word];
    if (flag) flagSet.add(flag);
  }
  const flags = [...flagSet];

  let urgency: SentimentResult['urgency'] = 'low';
  if (words.some(w => CRITICAL_KEYWORDS.includes(w))) {
    urgency = 'critical';
  } else if (words.some(w => HIGH_KEYWORDS.includes(w))) {
    urgency = 'high';
  } else if (words.some(w => MEDIUM_KEYWORDS.includes(w))) {
    urgency = 'medium';
  }

  let summary: string;
  if (urgency === 'critical') {
    summary = 'Order contains allergy concern';
  } else if (urgency === 'high') {
    summary = 'Order contains customer complaint';
  } else if (urgency === 'medium') {
    summary = flagSet.has('rush') ? 'Customer requests rush preparation' : 'Order contains dietary restriction';
  } else if (flagSet.has('compliment')) {
    summary = 'Customer left a compliment';
  } else if (flagSet.has('modification')) {
    summary = 'Standard modification request';
  } else {
    summary = 'Standard order instruction';
  }

  return { sentiment, flags, urgency, summary };
}

export async function analyzeOrderSentiment(
  restaurantId: string,
  orderId: string,
  orderNumber: string,
  specialInstructions: string,
  tableNumber?: string,
): Promise<SentimentResult | null> {
  if (!specialInstructions.trim()) return null;

  const client = await aiConfigService.getAnthropicClientForRestaurant(restaurantId, 'sentimentAnalysis');

  if (client) {
    try {
      const startMs = Date.now();
      logger.info('[sentiment-analysis] Starting AI analysis', { restaurantId, orderId, orderNumber });

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        system: 'You are a restaurant operations analyst. Analyze customer order special instructions and classify them for kitchen and management awareness. Return ONLY valid JSON.',
        messages: [{
          role: 'user',
          content: `Analyze this order instruction:

Order #: ${orderNumber}
Table: ${tableNumber ?? 'N/A'}
Instructions: "${specialInstructions}"

Return JSON:
{
  "sentiment": "positive" | "neutral" | "negative",
  "flags": [],
  "urgency": "low" | "medium" | "high" | "critical",
  "summary": "one-sentence plain English description"
}

Urgency rules:
- critical: any allergy mention, food safety concern
- high: complaint about a previous order, request to remake, explicit anger
- medium: rush/hurry request, dietary restriction (not allergy), customer dissatisfaction hint
- low: compliment, standard modification, neutral dietary preference`,
        }],
      });

      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const durationMs = Date.now() - startMs;

      const textContent = response.content.find(c => c.type === 'text');
      const rawText = textContent?.type === 'text' ? textContent.text : '';

      const parsed = JSON.parse(rawText) as SentimentResult;

      await aiUsageService.logUsage(restaurantId, 'sentimentAnalysis', inputTokens, outputTokens);

      logger.info('[sentiment-analysis] AI analysis complete', {
        restaurantId,
        orderId,
        orderNumber,
        sentiment: parsed.sentiment,
        urgency: parsed.urgency,
        inputTokens,
        outputTokens,
        durationMs,
      });

      return parsed;
    } catch (error: unknown) {
      logger.error('[sentiment-analysis] AI analysis failed, falling back to keywords', {
        restaurantId,
        orderId,
        error: toErrorMessage(error),
      });
    }
  }

  const result = keywordFallback(specialInstructions);

  logger.info('[sentiment-analysis] Keyword fallback analysis complete', {
    restaurantId,
    orderId,
    orderNumber,
    sentiment: result.sentiment,
    urgency: result.urgency,
    flags: result.flags,
  });

  return result;
}
