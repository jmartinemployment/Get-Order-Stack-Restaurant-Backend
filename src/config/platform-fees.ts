export const PLATFORM_FEE_TIERS = {
  free:    { percent: 2.6, fixedCents: 10 },
  plus:    { percent: 2.5, fixedCents: 10 },
  premium: { percent: 2.4, fixedCents: 10 },
} as const;

export type PlatformFeeTier = keyof typeof PLATFORM_FEE_TIERS;

export function calculatePlatformFee(
  amountCents: number,
  feePercent: number,
  feeFixedCents: number,
): number {
  return Math.round(amountCents * feePercent / 100) + feeFixedCents;
}
