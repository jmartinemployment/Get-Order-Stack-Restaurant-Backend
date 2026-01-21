/**
 * Tax Rate Service
 * DB lookup → AI fallback → 7% default
 */

import { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';

const prisma = new PrismaClient();
const anthropic = new Anthropic();

const DEFAULT_RATE = 0.07; // Florida fallback

interface TaxRateInfo {
  rate: number;
  state: string;
  county: string | null;
  city: string | null;
  breakdown: {
    state: number;
    county: number;
    city: number;
  } | null;
  source: 'db' | 'ai' | 'fallback';
}

export class TaxService {

  /**
   * Get tax rate by ZIP - checks DB first, then AI, then fallback
   */
  async getTaxRateByZip(zip: string, state = "FL"): Promise<TaxRateInfo> {
    // 1. Check database first
    try {
      const cached = await prisma.taxJurisdiction.findUnique({
        where: { zipCode_state: { zipCode: zip, state } }
      });

      if (cached) {
        const breakdown = cached.breakdown as { state: number; county: number; city: number } | null;
        return {
          rate: Number(cached.taxRate),
          state: cached.state,
          county: cached.county,
          city: cached.city,
          breakdown,
          source: 'db'
        };
      }
    } catch (error) {
      console.error('[TaxService] DB lookup failed:', error);
      // Continue to AI lookup
    }

    // 2. AI lookup
    try {
      const aiResult = await this.lookupTaxRateWithAI(zip, state);
      if (aiResult) {
        // Save to DB for future lookups
        await this.saveTaxJurisdiction(zip, state, aiResult);
        return { ...aiResult, source: 'ai' };
      }
    } catch (error) {
      console.error('[TaxService] AI lookup failed:', error);
      // Continue to fallback
    }

    // 3. Fallback to default
    console.warn(`[TaxService] Using fallback rate for ZIP ${zip}, ${state}`);
    return {
      rate: DEFAULT_RATE,
      state,
      county: null,
      city: null,
      breakdown: { state: 0.06, county: 0.01, city: 0 },
      source: 'fallback'
    };
  }

  /**
   * AI lookup for tax rate
   */
  private async lookupTaxRateWithAI(zip: string, state: string): Promise<Omit<TaxRateInfo, 'source'> | null> {
    const prompt = `What is the current combined sales tax rate for ZIP code ${zip} in ${state}?

Return ONLY valid JSON in this exact format, no other text:
{
  "rate": 0.07,
  "county": "County Name",
  "city": "City Name or null",
  "breakdown": {
    "state": 0.06,
    "county": 0.01,
    "city": 0
  }
}

The rate should be a decimal (e.g., 0.07 for 7%). Include the breakdown of state, county, and city portions.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') return null;

    try {
      const parsed = JSON.parse(content.text);
      
      // Validate the response
      if (typeof parsed.rate !== 'number' || parsed.rate < 0 || parsed.rate > 0.15) {
        console.error('[TaxService] Invalid rate from AI:', parsed.rate);
        return null;
      }

      return {
        rate: parsed.rate,
        state,
        county: parsed.county || null,
        city: parsed.city || null,
        breakdown: parsed.breakdown || null
      };
    } catch (error) {
      console.error('[TaxService] Failed to parse AI response:', content.text);
      return null;
    }
  }

  /**
   * Save tax jurisdiction to DB
   */
  private async saveTaxJurisdiction(
    zip: string, 
    state: string, 
    info: Omit<TaxRateInfo, 'source'>
  ): Promise<void> {
    try {
      await prisma.taxJurisdiction.create({
        data: {
          zipCode: zip,
          state,
          city: info.city,
          county: info.county,
          taxRate: info.rate,
          breakdown: info.breakdown,
          source: 'ai',
          verifiedAt: null
        }
      });
      console.log(`[TaxService] Saved tax rate for ${zip}, ${state}: ${info.rate}`);
    } catch (error) {
      console.error('[TaxService] Failed to save tax jurisdiction:', error);
      // Non-fatal - we still have the rate to return
    }
  }

  /**
   * Get tax rate for a specific tax category
   */
  getTaxRateByCategory(
    baseRate: number, 
    category: string, 
    state = "FL"
  ): number {
    if (state === "FL") {
      switch (category) {
        case "tax_exempt":
          return 0;
        case "alcohol":
          return baseRate;
        case "grocery":
          return baseRate; // FL taxes groceries
        case "prepared_food":
        default:
          return baseRate;
      }
    }

    // Other states - many exempt groceries
    switch (category) {
      case "tax_exempt":
        return 0;
      case "grocery":
        return 0;
      case "alcohol":
        return baseRate;
      case "prepared_food":
      default:
        return baseRate;
    }
  }

  /**
   * Calculate tax for an order
   */
  calculateOrderTax(
    items: Array<{ totalPrice: number; taxCategory?: string }>,
    restaurantTaxRate: number,
    state = "FL"
  ): { taxableAmount: number; taxAmount: number; breakdown: Record<string, number> } {
    let taxableAmount = 0;
    let taxAmount = 0;
    const breakdown: Record<string, number> = {};

    for (const item of items) {
      const category = item.taxCategory || "prepared_food";
      const itemRate = this.getTaxRateByCategory(restaurantTaxRate, category, state);
      const itemTax = Number(item.totalPrice) * itemRate;

      if (itemRate > 0) {
        taxableAmount += Number(item.totalPrice);
      }
      taxAmount += itemTax;

      breakdown[category] = (breakdown[category] || 0) + itemTax;
    }

    return {
      taxableAmount,
      taxAmount: Math.round(taxAmount * 100) / 100,
      breakdown
    };
  }
}

export const taxService = new TaxService();
