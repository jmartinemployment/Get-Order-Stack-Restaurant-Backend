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
