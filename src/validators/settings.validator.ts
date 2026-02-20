import { z } from 'zod';

export const CoursePacingModeSchema = z.enum([
  'disabled',
  'server_fires',
  'auto_fire_timed',
]);

export const AISettingsPatchSchema = z.object({
  aiOrderApprovalEnabled: z.boolean().optional(),
  timeThresholdHours: z.number().int().min(1).max(168).optional(),
  valueThresholdDollars: z.number().nonnegative().max(100000).optional(),
  quantityThreshold: z.number().int().min(1).max(1000).optional(),
  coursePacingMode: CoursePacingModeSchema.optional(),
  targetCourseServeGapSeconds: z.number().int().min(300).max(3600).optional(),
  orderThrottlingEnabled: z.boolean().optional(),
  maxActiveOrders: z.number().int().min(2).max(120).optional(),
  maxOverdueOrders: z.number().int().min(1).max(50).optional(),
  releaseActiveOrders: z.number().int().min(0).max(119).optional(),
  releaseOverdueOrders: z.number().int().min(0).max(49).optional(),
  maxHoldMinutes: z.number().int().min(1).max(180).optional(),
  allowRushThrottle: z.boolean().optional(),
  expoStationEnabled: z.boolean().optional(),
  approvalTimeoutHours: z.number().int().min(1).max(168).optional(),
  aiFeatures: z.object({
    aiCostEstimation: z.boolean().optional(),
    menuEngineering: z.boolean().optional(),
    salesInsights: z.boolean().optional(),
    laborOptimization: z.boolean().optional(),
    inventoryPredictions: z.boolean().optional(),
    taxEstimation: z.boolean().optional(),
  }).strict().optional(),
}).passthrough().superRefine((value, ctx) => {
  if (
    value.maxActiveOrders !== undefined
    && value.releaseActiveOrders !== undefined
    && value.releaseActiveOrders >= value.maxActiveOrders
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['releaseActiveOrders'],
      message: 'releaseActiveOrders must be less than maxActiveOrders',
    });
  }

  if (
    value.maxOverdueOrders !== undefined
    && value.releaseOverdueOrders !== undefined
    && value.releaseOverdueOrders >= value.maxOverdueOrders
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['releaseOverdueOrders'],
      message: 'releaseOverdueOrders must be less than maxOverdueOrders',
    });
  }
});
