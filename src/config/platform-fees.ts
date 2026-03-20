/**
 * Platform fees are deprecated. OrderStack charges $0.00 platform fee.
 * Merchants pay PayPal processing rates directly.
 * Kept for backward compatibility with existing code references.
 */
export const PLATFORM_FEE_TIERS = {
  free:    { percent: 0, fixedCents: 0 },
  plus:    { percent: 0, fixedCents: 0 },
  premium: { percent: 0, fixedCents: 0 },
} as const;

export type PlatformFeeTier = keyof typeof PLATFORM_FEE_TIERS;

export function calculatePlatformFee(
  _amountCents: number,
  _feePercent: number,
  _feeFixedCents: number,
): number {
  return 0;
}

/** Monthly subscription price in cents */
export const PLAN_PRICE_CENTS = 5000; // $50.00
