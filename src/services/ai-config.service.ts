import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';
import { aiCredentialsService } from './ai-credentials.service';

const prisma = new PrismaClient();

export type AIFeatureKey =
  | 'aiCostEstimation'
  | 'menuEngineering'
  | 'salesInsights'
  | 'laborOptimization'
  | 'inventoryPredictions'
  | 'taxEstimation';

const VALID_FEATURE_KEYS: readonly AIFeatureKey[] = [
  'aiCostEstimation',
  'menuEngineering',
  'salesInsights',
  'laborOptimization',
  'inventoryPredictions',
  'taxEstimation',
];

export function isValidFeatureKey(key: string): key is AIFeatureKey {
  return (VALID_FEATURE_KEYS as readonly string[]).includes(key);
}

function defaultAiFeatures(): Record<AIFeatureKey, boolean> {
  return {
    aiCostEstimation: false,
    menuEngineering: false,
    salesInsights: false,
    laborOptimization: false,
    inventoryPredictions: false,
    taxEstimation: false,
  };
}

async function getAiFeatures(restaurantId: string): Promise<Record<AIFeatureKey, boolean>> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { aiSettings: true },
  });

  const aiSettings = (restaurant?.aiSettings ?? {}) as Record<string, unknown>;
  const features = (aiSettings.aiFeatures ?? {}) as Record<string, unknown>;
  const defaults = defaultAiFeatures();

  const result = { ...defaults };
  for (const key of VALID_FEATURE_KEYS) {
    if (typeof features[key] === 'boolean') {
      result[key] = features[key];
    }
  }
  return result;
}

export const aiConfigService = {
  async getAnthropicClientForRestaurant(
    restaurantId: string,
    featureKey: AIFeatureKey,
  ): Promise<Anthropic | null> {
    const features = await getAiFeatures(restaurantId);
    if (!features[featureKey]) return null;

    const restaurantKey = await aiCredentialsService.getApiKey(restaurantId);
    const apiKey = restaurantKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    return new Anthropic({ apiKey });
  },

  async isFeatureEnabled(restaurantId: string, featureKey: AIFeatureKey): Promise<boolean> {
    const features = await getAiFeatures(restaurantId);
    return features[featureKey];
  },

  getAiFeatures,
  defaultAiFeatures,
  VALID_FEATURE_KEYS,
};
