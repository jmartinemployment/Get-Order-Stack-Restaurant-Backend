/**
 * AI Cost Estimation Service
 * Uses Claude to estimate ingredient costs and suggest pricing for menu items
 */

import { aiConfigService } from './ai-config.service';
import { aiUsageService } from './ai-usage.service';

interface CostEstimation {
  estimatedCost: number;
  suggestedPrice: number;
  profitMargin: number;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export class AICostService {
  /**
   * Estimate the ingredient cost for a menu item
   */
  async estimateCost(
    restaurantId: string,
    name: string,
    description: string,
    currentPrice: number,
    cuisineType?: string
  ): Promise<CostEstimation | null> {
    const client = await aiConfigService.getAnthropicClientForRestaurant(restaurantId, 'aiCostEstimation');
    if (!client) return null;

    try {
      const prompt = `You are a restaurant cost analyst. Estimate the ingredient/food cost for this menu item.

Menu Item: ${name}
Description: ${description}
Current Menu Price: $${currentPrice.toFixed(2)}
Cuisine Type: ${cuisineType || 'Unknown'}

Based on typical restaurant ingredient costs in the US (2024-2025 prices), estimate:
1. The ingredient/food cost to make this dish
2. A suggested menu price (targeting 65-70% profit margin for a sustainable restaurant)
3. Your confidence level in this estimate

Respond in JSON format only:
{
  "estimatedCost": <number>,
  "suggestedPrice": <number>,
  "profitMargin": <number between 0-100>,
  "confidence": "<high|medium|low>",
  "reasoning": "<brief explanation>"
}`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      });

      await aiUsageService.logUsage(restaurantId, 'aiCostEstimation', response.usage.input_tokens, response.usage.output_tokens);

      const content = response.content[0];
      if (content.type !== 'text') return null;

      // Parse JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const result = JSON.parse(jsonMatch[0]) as CostEstimation;

      // Recalculate profit margin based on current price
      result.profitMargin = ((currentPrice - result.estimatedCost) / currentPrice) * 100;

      return result;
    } catch (error) {
      console.error('AI cost estimation failed:', error);
      return null;
    }
  }

  /**
   * Generate an English description for a menu item (gringo-friendly explanation)
   */
  async generateEnglishDescription(
    restaurantId: string,
    name: string,
    description: string,
    cuisineType?: string
  ): Promise<string | null> {
    const client = await aiConfigService.getAnthropicClientForRestaurant(restaurantId, 'aiCostEstimation');
    if (!client) return null;

    try {
      const prompt = `You are helping a ${cuisineType || ''} restaurant create English descriptions for their menu.

Dish Name: ${name}
Current Description: ${description}

Write a clear, appetizing English description that helps American diners understand what this dish is. 
- Keep it concise (1-2 sentences max)
- Explain key ingredients and preparation style
- Make it sound delicious but not over-the-top
- Don't translate the dish name, just explain what it is

Respond with ONLY the description text, no quotes or formatting.`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }]
      });

      await aiUsageService.logUsage(restaurantId, 'aiCostEstimation', response.usage.input_tokens, response.usage.output_tokens);

      const content = response.content[0];
      if (content.type !== 'text') return null;

      return content.text.trim();
    } catch (error) {
      console.error('AI description generation failed:', error);
      return null;
    }
  }

  /**
   * Batch process multiple items for cost estimation
   */
  async estimateCostBatch(
    restaurantId: string,
    items: Array<{ id: string; name: string; description: string; price: number }>,
    cuisineType?: string
  ): Promise<Map<string, CostEstimation>> {
    const results = new Map<string, CostEstimation>();

    for (const item of items) {
      const estimation = await this.estimateCost(
        restaurantId,
        item.name,
        item.description,
        item.price,
        cuisineType
      );
      if (estimation) {
        results.set(item.id, estimation);
      }
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return results;
  }
}

export const aiCostService = new AICostService();
