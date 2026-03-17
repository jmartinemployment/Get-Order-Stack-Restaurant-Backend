import Anthropic from '@anthropic-ai/sdk';
import { aiUsageService } from './ai-usage.service';
import { logger } from '../utils/logger';
import { toErrorMessage } from '../utils/errors';

export type ProposalTone = 'professional' | 'warm' | 'casual';

export interface ProposalMenuItemDescription {
  itemId: string;
  itemName: string;
  description: string;
}

export interface ProposalAiContent {
  intro: string;
  menuDescriptions: ProposalMenuItemDescription[];
  serviceOverview: string;
  dietaryStatement: string;
  closing: string;
  generatedAt?: string;
  tone?: ProposalTone;
}

export interface ProposalAiResult extends ProposalAiContent {
  truncated: boolean;
  originalItemCount: number;
}

type MenuItemInput = { id: string; name: string; description?: string | null };

type JobInput = {
  id: string;
  restaurantId: string;
  title: string;
  eventType: string;
  fulfillmentDate: Date;
  headcount: number;
  dietaryRequirements: unknown;
  restaurant: { name: string };
};

const MAX_MENU_ITEMS = 50;

function buildDietaryString(dietaryRequirements: unknown): string {
  if (!dietaryRequirements || typeof dietaryRequirements !== 'object') return '';
  const dr = dietaryRequirements as Record<string, unknown>;
  const items: string[] = [];
  if (Number(dr.vegetarian) > 0) items.push(`${dr.vegetarian} vegetarian`);
  if (Number(dr.vegan) > 0) items.push(`${dr.vegan} vegan`);
  if (Number(dr.glutenFree) > 0) items.push(`${dr.glutenFree} gluten-free`);
  if (Number(dr.nutAllergy) > 0) items.push(`${dr.nutAllergy} nut allergy`);
  if (Number(dr.dairyFree) > 0) items.push(`${dr.dairyFree} dairy-free`);
  if (Number(dr.kosher) > 0) items.push(`${dr.kosher} kosher`);
  if (Number(dr.halal) > 0) items.push(`${dr.halal} halal`);
  if (dr.other && typeof dr.other === 'string' && dr.other.trim()) items.push(dr.other.trim());
  return items.join(', ');
}

function buildUserPrompt(
  job: JobInput,
  menuItems: MenuItemInput[],
  tone: ProposalTone,
  dietaryString: string,
): string {
  const toneInstruction =
    tone === 'professional'
      ? 'professional and formal'
      : tone === 'warm'
      ? 'warm and personal'
      : 'casual and friendly';

  const menuList = menuItems
    .map((item, i) => `${i + 1}. ${item.name}${item.description ? ` — ${item.description}` : ''}`)
    .join('\n');

  const dietaryNote = dietaryString ? `\nDietary requirements: ${dietaryString}` : '';

  return `You are writing a catering proposal for ${job.restaurant.name}.

Event: ${job.title}
Type: ${job.eventType}
Date: ${job.fulfillmentDate.toISOString().split('T')[0]}
Headcount: ${job.headcount} guests${dietaryNote}

Menu items:
${menuList}

Write a ${toneInstruction} catering proposal. Return ONLY valid JSON in this exact shape:
{
  "intro": "Opening paragraph welcoming the client and expressing excitement about the event",
  "menuDescriptions": [
    { "itemId": "<exact id from menu list>", "itemName": "<item name>", "description": "<2-3 sentence description>" }
  ],
  "serviceOverview": "2-3 sentences about the service approach, staffing, and professionalism",
  "dietaryStatement": "Statement about dietary accommodation (empty string if no dietary requirements)",
  "closing": "Warm closing paragraph with call to action"
}

The menuDescriptions array MUST contain exactly ${menuItems.length} items, one per menu item listed above, in the same order.`;
}

function fillMissingDescriptions(
  menuDescriptions: ProposalMenuItemDescription[],
  menuItems: MenuItemInput[],
): ProposalMenuItemDescription[] {
  const byId = new Map(menuDescriptions.map(d => [d.itemId, d]));
  return menuItems.map(
    item => byId.get(item.id) ?? { itemId: item.id, itemName: item.name, description: item.name },
  );
}

function truncateItems(menuItems: MenuItemInput[]): {
  items: MenuItemInput[];
  truncated: boolean;
  originalItemCount: number;
} {
  const originalItemCount = menuItems.length;
  if (menuItems.length <= MAX_MENU_ITEMS) {
    return { items: menuItems, truncated: false, originalItemCount };
  }
  return { items: menuItems.slice(0, MAX_MENU_ITEMS), truncated: true, originalItemCount };
}

export async function generateProposalContent(
  client: Anthropic,
  job: JobInput,
  menuItems: MenuItemInput[],
  tone: ProposalTone,
): Promise<ProposalAiResult> {
  const { items: itemsForPrompt, truncated, originalItemCount } = truncateItems(menuItems);

  if (truncated) {
    logger.warn('[catering-proposal-ai] Menu items truncated for AI generation', {
      jobId: job.id,
      originalCount: originalItemCount,
      truncatedTo: MAX_MENU_ITEMS,
    });
  }

  const dietaryString = buildDietaryString(job.dietaryRequirements);
  const userPrompt = buildUserPrompt(job, itemsForPrompt, tone, dietaryString);

  const startMs = Date.now();
  logger.info('[catering-proposal-ai] Starting generation', {
    jobId: job.id,
    tone,
    menuItemCount: itemsForPrompt.length,
  });

  let response: Awaited<ReturnType<Anthropic['messages']['create']>>;
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: 'You are an expert catering copywriter. Return only valid JSON, no markdown, no explanation.',
      messages: [{ role: 'user', content: userPrompt }],
    });
  } catch (error: unknown) {
    logger.error('[catering-proposal-ai] Anthropic API call failed', {
      jobId: job.id,
      error: toErrorMessage(error),
    });
    throw error;
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const durationMs = Date.now() - startMs;

  logger.info('[catering-proposal-ai] Generation complete', {
    jobId: job.id,
    tone,
    menuItemCount: itemsForPrompt.length,
    inputTokens,
    outputTokens,
    durationMs,
  });

  await aiUsageService.logUsage(job.restaurantId, 'aiCateringProposals', inputTokens, outputTokens);

  const textContent = response.content.find(c => c.type === 'text');
  const rawText = textContent?.type === 'text' ? textContent.text : '';

  let parsed: ProposalAiContent;
  try {
    parsed = JSON.parse(rawText) as ProposalAiContent;
  } catch (error: unknown) {
    logger.error('[catering-proposal-ai] JSON parse failed', {
      jobId: job.id,
      rawText: rawText.slice(0, 200),
      error: toErrorMessage(error),
    });
    throw new Error('AI returned malformed JSON');
  }

  parsed.menuDescriptions = fillMissingDescriptions(parsed.menuDescriptions ?? [], itemsForPrompt);

  return { ...parsed, truncated, originalItemCount };
}
