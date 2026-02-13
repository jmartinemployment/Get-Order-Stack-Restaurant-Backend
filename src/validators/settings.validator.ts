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
  expoStationEnabled: z.boolean().optional(),
  approvalTimeoutHours: z.number().int().min(1).max(168).optional(),
}).passthrough();
