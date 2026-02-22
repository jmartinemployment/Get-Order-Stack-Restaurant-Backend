import { z } from 'zod';

const positionEnum = z.enum(['server', 'cook', 'bartender', 'host', 'manager', 'expo']);
const timeRegex = /^\d{2}:\d{2}$/;

export const ShiftCreateSchema = z.object({
  staffPinId: z.string().uuid('staffPinId must be a valid UUID'),
  date: z.string().min(1, 'Date is required'),
  startTime: z.string().regex(timeRegex, 'startTime must be HH:mm format'),
  endTime: z.string().regex(timeRegex, 'endTime must be HH:mm format'),
  position: positionEnum,
  breakMinutes: z.number().int().min(0).max(120).optional().default(0),
  notes: z.string().max(500).optional(),
});

export const ShiftUpdateSchema = z.object({
  staffPinId: z.string().uuid().optional(),
  date: z.string().optional(),
  startTime: z.string().regex(timeRegex, 'startTime must be HH:mm format').optional(),
  endTime: z.string().regex(timeRegex, 'endTime must be HH:mm format').optional(),
  position: positionEnum.optional(),
  breakMinutes: z.number().int().min(0).max(120).optional(),
  notes: z.string().max(500).optional(),
});

export const ClockInSchema = z.object({
  staffPinId: z.string().uuid('staffPinId must be a valid UUID'),
  shiftId: z.string().uuid().optional(),
});

export const ClockOutSchema = z.object({
  breakMinutes: z.number().int().min(0).max(120).optional(),
  notes: z.string().max(500).optional(),
});

export const LaborTargetSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  targetPercent: z.number().min(0).max(100),
  targetCost: z.number().min(0).optional(),
});

export const PublishWeekSchema = z.object({
  weekStartDate: z.string().min(1, 'weekStartDate is required'),
});

// --- Workweek Config ---

export const WorkweekConfigSchema = z.object({
  weekStartDay: z.number().int().min(0).max(6),
  dayStartTime: z.string().regex(timeRegex, 'dayStartTime must be HH:mm format'),
  overtimeThresholdHours: z.number().min(1).max(168),
  overtimeMultiplier: z.number().min(1).max(3),
});

// --- Timecard Edit Requests ---

const editTypeEnum = z.enum(['clock_in_time', 'clock_out_time', 'break_minutes']);

export const TimecardEditRequestSchema = z.object({
  timeEntryId: z.string().uuid('timeEntryId must be a valid UUID'),
  editType: editTypeEnum,
  originalValue: z.string().min(1, 'originalValue is required'),
  newValue: z.string().min(1, 'newValue is required'),
  reason: z.string().min(1, 'Reason is required').max(500),
});

export const TimecardEditResponseSchema = z.object({
  respondedBy: z.string().min(1, 'respondedBy is required'),
});

// --- Schedule Enforcement ---

export const ValidateClockInSchema = z.object({
  staffPinId: z.string().uuid('staffPinId must be a valid UUID'),
});

export const ClockInOverrideSchema = z.object({
  staffPinId: z.string().uuid('staffPinId must be a valid UUID'),
  managerPin: z.string().min(4).max(6),
  shiftId: z.string().uuid().optional(),
});
