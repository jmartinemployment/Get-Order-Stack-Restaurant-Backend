import { z } from 'zod';

const tierEnum = z.enum(['bronze', 'silver', 'gold', 'platinum']);

export const LoyaltyConfigUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  pointsPerDollar: z.number().int().min(1, 'Points per dollar must be at least 1').optional(),
  pointsRedemptionRate: z.number().min(0.001).max(1, 'Redemption rate must be between 0.001 and 1.00').optional(),
  tierSilverMin: z.number().int().positive('Silver threshold must be positive').optional(),
  tierGoldMin: z.number().int().positive('Gold threshold must be positive').optional(),
  tierPlatinumMin: z.number().int().positive('Platinum threshold must be positive').optional(),
  silverMultiplier: z.number().min(1).max(5, 'Multiplier must be between 1.00 and 5.00').optional(),
  goldMultiplier: z.number().min(1).max(5, 'Multiplier must be between 1.00 and 5.00').optional(),
  platinumMultiplier: z.number().min(1).max(5, 'Multiplier must be between 1.00 and 5.00').optional(),
}).refine(
  (data) => {
    // If multiple thresholds provided, enforce silver < gold < platinum
    const silver = data.tierSilverMin;
    const gold = data.tierGoldMin;
    const platinum = data.tierPlatinumMin;

    if (silver !== undefined && gold !== undefined && silver >= gold) {
      return false;
    }
    if (gold !== undefined && platinum !== undefined && gold >= platinum) {
      return false;
    }
    if (silver !== undefined && platinum !== undefined && silver >= platinum) {
      return false;
    }
    return true;
  },
  { message: 'Tier thresholds must be in ascending order: silver < gold < platinum' },
);

export const LoyaltyRewardCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500).optional(),
  pointsCost: z.number().int().min(1, 'Points cost must be at least 1'),
  discountType: z.enum(['fixed', 'percentage'], { message: 'Discount type must be fixed or percentage' }),
  discountValue: z.number().positive('Discount value must be greater than 0'),
  minTier: tierEnum.optional().default('bronze'),
}).refine(
  (data) => {
    if (data.discountType === 'percentage' && data.discountValue > 100) {
      return false;
    }
    return true;
  },
  { message: 'Percentage discount cannot exceed 100' },
);

export const LoyaltyRewardUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  pointsCost: z.number().int().min(1).optional(),
  discountType: z.enum(['fixed', 'percentage']).optional(),
  discountValue: z.number().positive().optional(),
  minTier: tierEnum.optional(),
  isActive: z.boolean().optional(),
}).refine(
  (data) => {
    if (data.discountType === 'percentage' && data.discountValue !== undefined && data.discountValue > 100) {
      return false;
    }
    return true;
  },
  { message: 'Percentage discount cannot exceed 100' },
);

export const PointsAdjustmentSchema = z.object({
  points: z.number().int().refine((val) => val !== 0, { message: 'Points must be non-zero' }),
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason must be 500 characters or less'),
});

export const PointsRedemptionSchema = z.object({
  points: z.number().int().positive('Points must be a positive integer'),
});
