import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { laborService } from '../services/labor.service';
import {
  ShiftCreateSchema,
  ShiftUpdateSchema,
  ClockInSchema,
  ClockOutSchema,
  LaborTargetSchema,
  PublishWeekSchema,
  WorkweekConfigSchema,
  TimecardEditRequestSchema,
  TimecardEditResponseSchema,
  ValidateClockInSchema,
  ClockInOverrideSchema,
} from '../validators/labor.validator';

const router = Router();
const prisma = new PrismaClient();

// ============ Staff Pins ============

// GET /:restaurantId/staff/pins
router.get('/:restaurantId/staff/pins', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const pins = await prisma.staffPin.findMany({
      where: { restaurantId, isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
    res.json(pins);
  } catch (error: unknown) {
    console.error('[Labor] Error fetching staff pins:', error);
    res.status(500).json({ error: 'Failed to fetch staff pins' });
  }
});

// ============ Shifts ============

// GET /:restaurantId/staff/shifts
router.get('/:restaurantId/staff/shifts', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { startDate, endDate, staffPinId } = req.query;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate query params are required' });
      return;
    }

    const shifts = await laborService.getShifts(
      restaurantId,
      startDate as string,
      endDate as string,
    );

    // Filter by staffPinId if provided
    if (staffPinId) {
      const filtered = shifts.filter((s: { staffPinId: string }) => s.staffPinId === staffPinId);
      res.json(filtered);
      return;
    }

    res.json(shifts);
  } catch (error: unknown) {
    console.error('[Labor] Error fetching shifts:', error);
    res.status(500).json({ error: 'Failed to fetch shifts' });
  }
});

// POST /:restaurantId/staff/shifts/publish — MUST be before /:id route
router.post('/:restaurantId/staff/shifts/publish', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = PublishWeekSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid publish data',
        details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const result = await laborService.publishWeek(restaurantId, parsed.data.weekStartDate);
    res.json(result);
  } catch (error: unknown) {
    console.error('[Labor] Error publishing week:', error);
    res.status(500).json({ error: 'Failed to publish week' });
  }
});

// POST /:restaurantId/staff/shifts
router.post('/:restaurantId/staff/shifts', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = ShiftCreateSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid shift data',
        details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const shift = await laborService.createShift(restaurantId, parsed.data);
    res.status(201).json(shift);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create shift';
    if (message.startsWith('CONFLICT:')) {
      res.status(409).json({ error: message.replace('CONFLICT: ', '') });
      return;
    }
    console.error('[Labor] Error creating shift:', error);
    res.status(500).json({ error: 'Failed to create shift' });
  }
});

// PATCH /:restaurantId/staff/shifts/:id
router.patch('/:restaurantId/staff/shifts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = ShiftUpdateSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid shift data',
        details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const shift = await laborService.updateShift(id, parsed.data);
    res.json(shift);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update shift';
    if (message.startsWith('CONFLICT:')) {
      res.status(409).json({ error: message.replace('CONFLICT: ', '') });
      return;
    }
    console.error('[Labor] Error updating shift:', error);
    res.status(500).json({ error: 'Failed to update shift' });
  }
});

// DELETE /:restaurantId/staff/shifts/:id
router.delete('/:restaurantId/staff/shifts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await laborService.deleteShift(id);
    res.status(204).send();
  } catch (error: unknown) {
    console.error('[Labor] Error deleting shift:', error);
    res.status(500).json({ error: 'Failed to delete shift' });
  }
});

// ============ Time Clock ============

// POST /:restaurantId/staff/clock-in
router.post('/:restaurantId/staff/clock-in', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = ClockInSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid clock-in data',
        details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const entry = await laborService.clockIn(
      restaurantId,
      parsed.data.staffPinId,
      parsed.data.shiftId,
    );
    res.status(201).json(entry);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to clock in';
    if (message.startsWith('ALREADY_CLOCKED_IN:')) {
      res.status(409).json({ error: message.replace('ALREADY_CLOCKED_IN: ', '') });
      return;
    }
    console.error('[Labor] Error clocking in:', error);
    res.status(500).json({ error: 'Failed to clock in' });
  }
});

// POST /:restaurantId/staff/clock-out/:id
router.post('/:restaurantId/staff/clock-out/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = ClockOutSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid clock-out data',
        details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const entry = await laborService.clockOut(id, parsed.data.breakMinutes, parsed.data.notes);
    res.json(entry);
  } catch (error: unknown) {
    console.error('[Labor] Error clocking out:', error);
    res.status(500).json({ error: 'Failed to clock out' });
  }
});

// GET /:restaurantId/staff/active-clocks
router.get('/:restaurantId/staff/active-clocks', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const clocks = await laborService.getActiveClocks(restaurantId);
    res.json(clocks);
  } catch (error: unknown) {
    console.error('[Labor] Error fetching active clocks:', error);
    res.status(500).json({ error: 'Failed to fetch active clocks' });
  }
});

// ============ Labor Report ============

// GET /:restaurantId/staff/labor-report
router.get('/:restaurantId/staff/labor-report', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate query params are required' });
      return;
    }

    const report = await laborService.getLaborReport(
      restaurantId,
      startDate as string,
      endDate as string,
    );
    res.json(report);
  } catch (error: unknown) {
    console.error('[Labor] Error generating labor report:', error);
    res.status(500).json({ error: 'Failed to generate labor report' });
  }
});

// ============ AI Recommendations ============

// GET /:restaurantId/staff/labor-recommendations
router.get('/:restaurantId/staff/labor-recommendations', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const recommendations = await laborService.getLaborRecommendations(restaurantId);
    res.json(recommendations);
  } catch (error: unknown) {
    console.error('[Labor] Error fetching recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch labor recommendations' });
  }
});

// ============ Labor Targets ============

// GET /:restaurantId/staff/labor-targets
router.get('/:restaurantId/staff/labor-targets', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const targets = await laborService.getTargets(restaurantId);
    res.json(targets);
  } catch (error: unknown) {
    console.error('[Labor] Error fetching labor targets:', error);
    res.status(500).json({ error: 'Failed to fetch labor targets' });
  }
});

// PUT /:restaurantId/staff/labor-targets
router.put('/:restaurantId/staff/labor-targets', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = LaborTargetSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid labor target data',
        details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const target = await laborService.setTarget(restaurantId, parsed.data);
    res.json(target);
  } catch (error: unknown) {
    console.error('[Labor] Error setting labor target:', error);
    res.status(500).json({ error: 'Failed to set labor target' });
  }
});

// ============ Staff Portal — Earnings ============

// GET /:restaurantId/staff/:staffPinId/earnings
router.get('/:restaurantId/staff/:staffPinId/earnings', async (req: Request, res: Response) => {
  try {
    const { restaurantId, staffPinId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate query params are required' });
      return;
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);

    // Get time entries for this staff member in the period
    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        restaurantId,
        staffPinId,
        clockIn: { gte: start },
        clockOut: { lte: end },
      },
    });

    // Calculate hours
    let totalMinutes = 0;
    for (const entry of timeEntries) {
      if (!entry.clockOut) continue;
      const worked = (entry.clockOut.getTime() - entry.clockIn.getTime()) / 60000;
      totalMinutes += worked - entry.breakMinutes;
    }

    const totalHours = Math.round(totalMinutes / 60 * 100) / 100;

    // Load workweek config for overtime thresholds
    const workweekConfig = await prisma.workweekConfig.findUnique({
      where: { restaurantId },
    });
    const otThreshold = workweekConfig ? Number(workweekConfig.overtimeThresholdHours) : 40;
    const otMultiplier = workweekConfig ? Number(workweekConfig.overtimeMultiplier) : 1.5;

    const regularHours = Math.min(totalHours, otThreshold);
    const overtimeHours = Math.max(totalHours - otThreshold, 0);

    // Estimate pay (default $15/hr)
    const hourlyRate = 15;
    const basePay = Math.round(regularHours * hourlyRate * 100) / 100;
    const overtimePay = Math.round(overtimeHours * hourlyRate * otMultiplier * 100) / 100;

    // Sum tips from orders in the period (basic — uses tip pool data if available)
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: { gte: start, lte: end },
        status: { not: 'cancelled' },
      },
      select: { tip: true },
    });

    // Get count of active staff for tip split estimate
    const activeStaff = await prisma.staffPin.count({
      where: { restaurantId, isActive: true },
    });

    const totalTips = orders.reduce((sum, o) => sum + Number(o.tip ?? 0), 0);
    const tipShare = activeStaff > 0 ? Math.round((totalTips / activeStaff) * 100) / 100 : 0;

    const earnings = {
      periodStart: startDate as string,
      periodEnd: endDate as string,
      regularHours,
      overtimeHours,
      totalHours,
      basePay,
      overtimePay,
      tips: tipShare,
      totalEarnings: Math.round((basePay + overtimePay + tipShare) * 100) / 100,
    };

    res.json(earnings);
  } catch (error: unknown) {
    console.error('[Labor] Error fetching staff earnings:', error);
    res.status(500).json({ error: 'Failed to fetch staff earnings' });
  }
});

// ============ Staff Portal — Availability ============

// GET /:restaurantId/staff/:staffPinId/availability
router.get('/:restaurantId/staff/:staffPinId/availability', async (req: Request, res: Response) => {
  try {
    const { restaurantId, staffPinId } = req.params;

    const prefs = await prisma.staffAvailability.findMany({
      where: { restaurantId, staffPinId },
      orderBy: { dayOfWeek: 'asc' },
    });

    res.json(prefs);
  } catch (error: unknown) {
    console.error('[Labor] Error fetching availability:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// PUT /:restaurantId/staff/:staffPinId/availability
router.put('/:restaurantId/staff/:staffPinId/availability', async (req: Request, res: Response) => {
  try {
    const { restaurantId, staffPinId } = req.params;
    const { preferences } = req.body as {
      preferences: Array<{
        dayOfWeek: number;
        isAvailable: boolean;
        preferredStart?: string | null;
        preferredEnd?: string | null;
        notes?: string | null;
      }>;
    };

    if (!Array.isArray(preferences)) {
      res.status(400).json({ error: 'preferences array is required' });
      return;
    }

    // Upsert each day's availability in a transaction
    const result = await prisma.$transaction(
      preferences.map((pref) =>
        prisma.staffAvailability.upsert({
          where: {
            staffPinId_dayOfWeek: {
              staffPinId,
              dayOfWeek: pref.dayOfWeek,
            },
          },
          create: {
            restaurantId,
            staffPinId,
            dayOfWeek: pref.dayOfWeek,
            isAvailable: pref.isAvailable,
            preferredStart: pref.preferredStart ?? null,
            preferredEnd: pref.preferredEnd ?? null,
            notes: pref.notes ?? null,
          },
          update: {
            isAvailable: pref.isAvailable,
            preferredStart: pref.preferredStart ?? null,
            preferredEnd: pref.preferredEnd ?? null,
            notes: pref.notes ?? null,
          },
        }),
      ),
    );

    res.json(result);
  } catch (error: unknown) {
    console.error('[Labor] Error saving availability:', error);
    res.status(500).json({ error: 'Failed to save availability' });
  }
});

// ============ Staff Portal — Swap Requests ============

// GET /:restaurantId/staff/:staffPinId/swap-requests
router.get('/:restaurantId/staff/:staffPinId/swap-requests', async (req: Request, res: Response) => {
  try {
    const { restaurantId, staffPinId } = req.params;

    const requests = await prisma.swapRequest.findMany({
      where: {
        restaurantId,
        OR: [
          { requestorPinId: staffPinId },
          { targetPinId: staffPinId },
        ],
      },
      include: {
        shift: true,
        requestor: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with shift details for frontend
    const enriched = requests.map((r) => ({
      id: r.id,
      shiftId: r.shiftId,
      shiftDate: r.shift.date.toISOString().split('T')[0],
      shiftStartTime: r.shift.startTime,
      shiftEndTime: r.shift.endTime,
      shiftPosition: r.shift.position,
      requestorPinId: r.requestorPinId,
      requestorName: r.requestor.name,
      targetPinId: r.targetPinId,
      targetName: null as string | null,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      respondedAt: r.respondedAt?.toISOString() ?? null,
      respondedBy: r.respondedBy,
    }));

    res.json(enriched);
  } catch (error: unknown) {
    console.error('[Labor] Error fetching swap requests:', error);
    res.status(500).json({ error: 'Failed to fetch swap requests' });
  }
});

// POST /:restaurantId/staff/swap-requests
router.post('/:restaurantId/staff/swap-requests', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { shiftId, requestorPinId, reason } = req.body as {
      shiftId: string;
      requestorPinId: string;
      reason: string;
    };

    if (!shiftId || !requestorPinId || !reason) {
      res.status(400).json({ error: 'shiftId, requestorPinId, and reason are required' });
      return;
    }

    const request = await prisma.swapRequest.create({
      data: {
        restaurantId,
        shiftId,
        requestorPinId,
        reason,
      },
      include: {
        shift: true,
        requestor: { select: { id: true, name: true } },
      },
    });

    const enriched = {
      id: request.id,
      shiftId: request.shiftId,
      shiftDate: request.shift.date.toISOString().split('T')[0],
      shiftStartTime: request.shift.startTime,
      shiftEndTime: request.shift.endTime,
      shiftPosition: request.shift.position,
      requestorPinId: request.requestorPinId,
      requestorName: request.requestor.name,
      targetPinId: request.targetPinId,
      targetName: null,
      reason: request.reason,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      respondedAt: null,
      respondedBy: null,
    };

    res.status(201).json(enriched);
  } catch (error: unknown) {
    console.error('[Labor] Error creating swap request:', error);
    res.status(500).json({ error: 'Failed to create swap request' });
  }
});

// PATCH /:restaurantId/staff/swap-requests/:requestId
router.patch('/:restaurantId/staff/swap-requests/:requestId', async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const { status, respondedBy } = req.body as {
      status: 'approved' | 'rejected';
      respondedBy: string;
    };

    if (!status || !respondedBy) {
      res.status(400).json({ error: 'status and respondedBy are required' });
      return;
    }

    if (status !== 'approved' && status !== 'rejected') {
      res.status(400).json({ error: 'status must be "approved" or "rejected"' });
      return;
    }

    const request = await prisma.swapRequest.update({
      where: { id: requestId },
      data: {
        status,
        respondedBy,
        respondedAt: new Date(),
      },
      include: {
        shift: true,
        requestor: { select: { id: true, name: true } },
      },
    });

    const enriched = {
      id: request.id,
      shiftId: request.shiftId,
      shiftDate: request.shift.date.toISOString().split('T')[0],
      shiftStartTime: request.shift.startTime,
      shiftEndTime: request.shift.endTime,
      shiftPosition: request.shift.position,
      requestorPinId: request.requestorPinId,
      requestorName: request.requestor.name,
      targetPinId: request.targetPinId,
      targetName: null,
      reason: request.reason,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      respondedAt: request.respondedAt?.toISOString() ?? null,
      respondedBy: request.respondedBy,
    };

    res.json(enriched);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Swap request not found' });
      return;
    }
    console.error('[Labor] Error updating swap request:', error);
    res.status(500).json({ error: 'Failed to update swap request' });
  }
});

// ============ Workweek Config (Step 15) ============

// GET /:restaurantId/staff/workweek-config
router.get('/:restaurantId/staff/workweek-config', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const config = await prisma.workweekConfig.findUnique({
      where: { restaurantId },
    });

    if (!config) {
      // Return defaults when no config exists
      res.json({
        weekStartDay: 0,
        dayStartTime: '04:00',
        overtimeThresholdHours: 40,
        overtimeMultiplier: 1.5,
      });
      return;
    }

    res.json({
      weekStartDay: config.weekStartDay,
      dayStartTime: config.dayStartTime,
      overtimeThresholdHours: Number(config.overtimeThresholdHours),
      overtimeMultiplier: Number(config.overtimeMultiplier),
    });
  } catch (error: unknown) {
    console.error('[Labor] Error fetching workweek config:', error);
    res.status(500).json({ error: 'Failed to fetch workweek config' });
  }
});

// PUT /:restaurantId/staff/workweek-config
router.put('/:restaurantId/staff/workweek-config', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = WorkweekConfigSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid workweek config',
        details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const config = await prisma.workweekConfig.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        weekStartDay: parsed.data.weekStartDay,
        dayStartTime: parsed.data.dayStartTime,
        overtimeThresholdHours: parsed.data.overtimeThresholdHours,
        overtimeMultiplier: parsed.data.overtimeMultiplier,
      },
      update: {
        weekStartDay: parsed.data.weekStartDay,
        dayStartTime: parsed.data.dayStartTime,
        overtimeThresholdHours: parsed.data.overtimeThresholdHours,
        overtimeMultiplier: parsed.data.overtimeMultiplier,
      },
    });

    res.json({
      weekStartDay: config.weekStartDay,
      dayStartTime: config.dayStartTime,
      overtimeThresholdHours: Number(config.overtimeThresholdHours),
      overtimeMultiplier: Number(config.overtimeMultiplier),
    });
  } catch (error: unknown) {
    console.error('[Labor] Error saving workweek config:', error);
    res.status(500).json({ error: 'Failed to save workweek config' });
  }
});

// ============ Timecard Edit Requests (Step 11) ============

// GET /:restaurantId/staff/:staffPinId/timecard-edits — staff's own edit requests
router.get('/:restaurantId/staff/:staffPinId/timecard-edits', async (req: Request, res: Response) => {
  try {
    const { restaurantId, staffPinId } = req.params;

    const edits = await prisma.timecardEditRequest.findMany({
      where: { restaurantId, staffPinId },
      include: {
        timeEntry: { select: { clockIn: true, clockOut: true, breakMinutes: true } },
        staffPin: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(edits.map((e) => ({
      id: e.id,
      timeEntryId: e.timeEntryId,
      staffPinId: e.staffPinId,
      staffName: e.staffPin.name,
      editType: e.editType,
      originalValue: e.originalValue,
      newValue: e.newValue,
      reason: e.reason,
      status: e.status,
      respondedBy: e.respondedBy,
      respondedAt: e.respondedAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
      timeEntry: {
        clockIn: e.timeEntry.clockIn.toISOString(),
        clockOut: e.timeEntry.clockOut?.toISOString() ?? null,
        breakMinutes: e.timeEntry.breakMinutes,
      },
    })));
  } catch (error: unknown) {
    console.error('[Labor] Error fetching staff timecard edits:', error);
    res.status(500).json({ error: 'Failed to fetch timecard edits' });
  }
});

// GET /:restaurantId/staff/timecard-edits — manager view: all edit requests (filterable by status)
router.get('/:restaurantId/staff/timecard-edits', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { status } = req.query;

    const where: Record<string, unknown> = { restaurantId };
    if (status) {
      where.status = status as string;
    }

    const edits = await prisma.timecardEditRequest.findMany({
      where,
      include: {
        timeEntry: { select: { clockIn: true, clockOut: true, breakMinutes: true } },
        staffPin: { select: { name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(edits.map((e) => ({
      id: e.id,
      timeEntryId: e.timeEntryId,
      staffPinId: e.staffPinId,
      staffName: e.staffPin.name,
      staffRole: e.staffPin.role,
      editType: e.editType,
      originalValue: e.originalValue,
      newValue: e.newValue,
      reason: e.reason,
      status: e.status,
      respondedBy: e.respondedBy,
      respondedAt: e.respondedAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
      timeEntry: {
        clockIn: e.timeEntry.clockIn.toISOString(),
        clockOut: e.timeEntry.clockOut?.toISOString() ?? null,
        breakMinutes: e.timeEntry.breakMinutes,
      },
    })));
  } catch (error: unknown) {
    console.error('[Labor] Error fetching timecard edits:', error);
    res.status(500).json({ error: 'Failed to fetch timecard edits' });
  }
});

// POST /:restaurantId/staff/timecard-edits — staff requests an edit
router.post('/:restaurantId/staff/timecard-edits', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = TimecardEditRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid edit request',
        details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    // Verify the time entry exists and belongs to this restaurant
    const timeEntry = await prisma.timeEntry.findFirst({
      where: { id: parsed.data.timeEntryId, restaurantId },
    });

    if (!timeEntry) {
      res.status(404).json({ error: 'Time entry not found' });
      return;
    }

    // Derive staffPinId from the time entry
    const edit = await prisma.timecardEditRequest.create({
      data: {
        restaurantId,
        timeEntryId: parsed.data.timeEntryId,
        staffPinId: timeEntry.staffPinId,
        editType: parsed.data.editType,
        originalValue: parsed.data.originalValue,
        newValue: parsed.data.newValue,
        reason: parsed.data.reason,
      },
      include: {
        staffPin: { select: { name: true } },
      },
    });

    res.status(201).json({
      id: edit.id,
      timeEntryId: edit.timeEntryId,
      staffPinId: edit.staffPinId,
      staffName: edit.staffPin.name,
      editType: edit.editType,
      originalValue: edit.originalValue,
      newValue: edit.newValue,
      reason: edit.reason,
      status: edit.status,
      createdAt: edit.createdAt.toISOString(),
    });
  } catch (error: unknown) {
    console.error('[Labor] Error creating timecard edit request:', error);
    res.status(500).json({ error: 'Failed to create edit request' });
  }
});

// PATCH /:restaurantId/staff/timecard-edits/:editId/approve
router.patch('/:restaurantId/staff/timecard-edits/:editId/approve', async (req: Request, res: Response) => {
  try {
    const { restaurantId, editId } = req.params;
    const parsed = TimecardEditResponseSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid response data',
        details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    // Fetch the edit request
    const editRequest = await prisma.timecardEditRequest.findFirst({
      where: { id: editId, restaurantId, status: 'pending' },
    });

    if (!editRequest) {
      res.status(404).json({ error: 'Edit request not found or already processed' });
      return;
    }

    // Apply the edit to the actual TimeEntry + mark request approved in a transaction
    const updateData: Record<string, unknown> = {};
    if (editRequest.editType === 'clock_in_time') {
      updateData.clockIn = new Date(editRequest.newValue);
    } else if (editRequest.editType === 'clock_out_time') {
      updateData.clockOut = new Date(editRequest.newValue);
    } else if (editRequest.editType === 'break_minutes') {
      updateData.breakMinutes = Number.parseInt(editRequest.newValue, 10);
    }

    const [updatedEdit] = await prisma.$transaction([
      prisma.timecardEditRequest.update({
        where: { id: editId },
        data: {
          status: 'approved',
          respondedBy: parsed.data.respondedBy,
          respondedAt: new Date(),
        },
        include: { staffPin: { select: { name: true } } },
      }),
      prisma.timeEntry.update({
        where: { id: editRequest.timeEntryId },
        data: updateData,
      }),
    ]);

    res.json({
      id: updatedEdit.id,
      timeEntryId: updatedEdit.timeEntryId,
      staffPinId: updatedEdit.staffPinId,
      staffName: updatedEdit.staffPin.name,
      editType: updatedEdit.editType,
      originalValue: updatedEdit.originalValue,
      newValue: updatedEdit.newValue,
      reason: updatedEdit.reason,
      status: updatedEdit.status,
      respondedBy: updatedEdit.respondedBy,
      respondedAt: updatedEdit.respondedAt?.toISOString() ?? null,
      createdAt: updatedEdit.createdAt.toISOString(),
    });
  } catch (error: unknown) {
    console.error('[Labor] Error approving timecard edit:', error);
    res.status(500).json({ error: 'Failed to approve edit request' });
  }
});

// PATCH /:restaurantId/staff/timecard-edits/:editId/deny
router.patch('/:restaurantId/staff/timecard-edits/:editId/deny', async (req: Request, res: Response) => {
  try {
    const { restaurantId, editId } = req.params;
    const parsed = TimecardEditResponseSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid response data',
        details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const editRequest = await prisma.timecardEditRequest.findFirst({
      where: { id: editId, restaurantId, status: 'pending' },
    });

    if (!editRequest) {
      res.status(404).json({ error: 'Edit request not found or already processed' });
      return;
    }

    const updatedEdit = await prisma.timecardEditRequest.update({
      where: { id: editId },
      data: {
        status: 'denied',
        respondedBy: parsed.data.respondedBy,
        respondedAt: new Date(),
      },
      include: { staffPin: { select: { name: true } } },
    });

    res.json({
      id: updatedEdit.id,
      timeEntryId: updatedEdit.timeEntryId,
      staffPinId: updatedEdit.staffPinId,
      staffName: updatedEdit.staffPin.name,
      editType: updatedEdit.editType,
      originalValue: updatedEdit.originalValue,
      newValue: updatedEdit.newValue,
      reason: updatedEdit.reason,
      status: updatedEdit.status,
      respondedBy: updatedEdit.respondedBy,
      respondedAt: updatedEdit.respondedAt?.toISOString() ?? null,
      createdAt: updatedEdit.createdAt.toISOString(),
    });
  } catch (error: unknown) {
    console.error('[Labor] Error denying timecard edit:', error);
    res.status(500).json({ error: 'Failed to deny edit request' });
  }
});

// ============ Schedule Enforcement (Step 12) ============

// POST /:restaurantId/staff/validate-clock-in — pre-check before allowing clock-in
router.post('/:restaurantId/staff/validate-clock-in', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = ValidateClockInSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid data',
        details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    // Load restaurant timeclock settings from aiSettings JSON
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { aiSettings: true },
    });

    const aiSettings = (restaurant?.aiSettings as Record<string, unknown>) ?? {};
    const enforcement = aiSettings.scheduleEnforcement as Record<string, unknown> | undefined;

    // If enforcement is not enabled, always allow
    if (!enforcement || enforcement.enabled !== true) {
      res.json({ allowed: true });
      return;
    }

    const gracePeriodMinutes = (enforcement.gracePeriodMinutes as number) ?? 15;

    // Find today's shifts for this staff member
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const todayShifts = await prisma.shift.findMany({
      where: {
        restaurantId,
        staffPinId: parsed.data.staffPinId,
        date: { gte: todayStart, lte: todayEnd },
      },
      orderBy: { startTime: 'asc' },
    });

    if (todayShifts.length === 0) {
      res.json({
        allowed: false,
        blockReason: 'No shift scheduled for today',
        requiresManagerOverride: true,
      });
      return;
    }

    // Check if current time is within grace period of any shift start
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    let withinGracePeriod = false;

    for (const shift of todayShifts) {
      const [startH, startM] = shift.startTime.split(':').map(Number);
      const shiftStartMinutes = startH * 60 + startM;
      const earliestClockIn = shiftStartMinutes - gracePeriodMinutes;

      if (currentMinutes >= earliestClockIn) {
        withinGracePeriod = true;
        break;
      }
    }

    if (!withinGracePeriod) {
      const nextShift = todayShifts[0];
      res.json({
        allowed: false,
        blockReason: `Too early — shift starts at ${nextShift.startTime}`,
        requiresManagerOverride: true,
      });
      return;
    }

    res.json({ allowed: true });
  } catch (error: unknown) {
    console.error('[Labor] Error validating clock-in:', error);
    res.status(500).json({ error: 'Failed to validate clock-in' });
  }
});

// POST /:restaurantId/staff/clock-in-with-override — manager override for schedule enforcement
router.post('/:restaurantId/staff/clock-in-with-override', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = ClockInOverrideSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid override data',
        details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    // Validate manager PIN
    const managerPin = await prisma.staffPin.findFirst({
      where: {
        restaurantId,
        pin: parsed.data.managerPin,
        isActive: true,
        role: { in: ['manager', 'owner', 'super_admin'] },
      },
    });

    if (!managerPin) {
      res.status(403).json({ error: 'Invalid manager PIN' });
      return;
    }

    // Proceed with clock-in (bypassing schedule enforcement)
    const entry = await laborService.clockIn(
      restaurantId,
      parsed.data.staffPinId,
      parsed.data.shiftId,
    );

    res.status(201).json({
      ...entry,
      overrideBy: managerPin.name,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to clock in';
    if (message.startsWith('ALREADY_CLOCKED_IN:')) {
      res.status(409).json({ error: message.replace('ALREADY_CLOCKED_IN: ', '') });
      return;
    }
    console.error('[Labor] Error clocking in with override:', error);
    res.status(500).json({ error: 'Failed to clock in with override' });
  }
});

// ============ Auto Clock-Out (Step 13) ============

// POST /:restaurantId/staff/auto-clock-out — close orphaned time entries
router.post('/:restaurantId/staff/auto-clock-out', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

    // Load restaurant timeclock settings
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { aiSettings: true },
    });

    const aiSettings = (restaurant?.aiSettings as Record<string, unknown>) ?? {};
    const autoClockOut = aiSettings.autoClockOut as Record<string, unknown> | undefined;

    if (!autoClockOut || autoClockOut.enabled !== true) {
      res.json({ closedEntries: 0, message: 'Auto clock-out is disabled' });
      return;
    }

    const mode = (autoClockOut.mode as string) ?? 'after_shift_end';
    const delayMinutes = (autoClockOut.delayMinutes as number) ?? 30;
    const cutoffTime = (autoClockOut.cutoffTime as string) ?? '04:00';

    // Find all open time entries for this restaurant
    const openEntries = await prisma.timeEntry.findMany({
      where: {
        restaurantId,
        clockOut: null,
      },
      include: {
        staffPin: { select: { name: true } },
      },
    });

    const now = new Date();
    const closedIds: string[] = [];

    for (const entry of openEntries) {
      let shouldClose = false;
      let clockOutTime = now;

      if (mode === 'after_shift_end' && entry.shiftId) {
        // Check if shift has ended + delay has passed
        const shift = await prisma.shift.findUnique({ where: { id: entry.shiftId } });
        if (shift) {
          const [endH, endM] = shift.endTime.split(':').map(Number);
          const shiftEnd = new Date(entry.clockIn);
          shiftEnd.setHours(endH, endM, 0, 0);

          // If shift end is before clock-in (cross-midnight), add a day
          if (shiftEnd.getTime() < entry.clockIn.getTime()) {
            shiftEnd.setDate(shiftEnd.getDate() + 1);
          }

          const cutoff = new Date(shiftEnd.getTime() + delayMinutes * 60000);
          if (now.getTime() >= cutoff.getTime()) {
            shouldClose = true;
            clockOutTime = shiftEnd; // Clock out at shift end time, not current time
          }
        }
      } else if (mode === 'business_day_cutoff') {
        // Check if current time has passed today's cutoff
        const [cutH, cutM] = cutoffTime.split(':').map(Number);
        const todayCutoff = new Date(now);
        todayCutoff.setHours(cutH, cutM, 0, 0);

        // If cutoff is early morning (e.g., 04:00) and entry was yesterday, check if we've passed it
        if (now.getTime() >= todayCutoff.getTime() && entry.clockIn.getTime() < todayCutoff.getTime()) {
          shouldClose = true;
          clockOutTime = todayCutoff;
        }
      }

      if (shouldClose) {
        await prisma.timeEntry.update({
          where: { id: entry.id },
          data: {
            clockOut: clockOutTime,
            notes: entry.notes
              ? `${entry.notes} | auto_clock_out`
              : 'auto_clock_out',
          },
        });
        closedIds.push(entry.id);
      }
    }

    res.json({
      closedEntries: closedIds.length,
      closedIds,
      message: closedIds.length > 0
        ? `Auto-clocked out ${closedIds.length} entries`
        : 'No entries needed auto clock-out',
    });
  } catch (error: unknown) {
    console.error('[Labor] Error running auto clock-out:', error);
    res.status(500).json({ error: 'Failed to run auto clock-out' });
  }
});

// ============ Schedule Templates ============

// GET /:restaurantId/staff/schedule-templates
router.get('/:restaurantId/staff/schedule-templates', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const templates = await prisma.scheduleTemplate.findMany({
      where: { restaurantId },
      include: { shifts: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json(templates.map((t) => ({
      id: t.id,
      restaurantId: t.restaurantId,
      name: t.name,
      shifts: t.shifts.map((s) => ({
        staffPinId: s.staffPinId,
        staffName: s.staffName,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        position: s.position,
        breakMinutes: s.breakMinutes,
      })),
      createdBy: t.createdBy,
      createdAt: t.createdAt.toISOString(),
    })));
  } catch (error: unknown) {
    console.error('[Labor] Error fetching schedule templates:', error);
    res.status(500).json({ error: 'Failed to fetch schedule templates' });
  }
});

// POST /:restaurantId/staff/schedule-templates — save current week as template
router.post('/:restaurantId/staff/schedule-templates', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { name, weekStartDate } = req.body as { name: string; weekStartDate: string };

    if (!name?.trim()) {
      res.status(400).json({ error: 'Template name is required' });
      return;
    }
    if (!weekStartDate) {
      res.status(400).json({ error: 'weekStartDate is required' });
      return;
    }

    // Get all shifts for the specified week
    const weekStart = new Date(weekStartDate + 'T00:00:00');
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const shifts = await prisma.shift.findMany({
      where: {
        restaurantId,
        date: { gte: weekStart, lte: weekEnd },
      },
      include: { staffPin: { select: { name: true } } },
    });

    if (shifts.length === 0) {
      res.status(400).json({ error: 'No shifts found for this week' });
      return;
    }

    // Create template with shifts
    const template = await prisma.scheduleTemplate.create({
      data: {
        restaurantId,
        name: name.trim(),
        createdBy: 'manager',
        shifts: {
          create: shifts.map((s) => ({
            staffPinId: s.staffPinId,
            staffName: s.staffPin.name,
            dayOfWeek: s.date.getDay(),
            startTime: s.startTime,
            endTime: s.endTime,
            position: s.position,
            breakMinutes: s.breakMinutes,
          })),
        },
      },
      include: { shifts: true },
    });

    res.status(201).json({
      id: template.id,
      restaurantId: template.restaurantId,
      name: template.name,
      shifts: template.shifts.map((s) => ({
        staffPinId: s.staffPinId,
        staffName: s.staffName,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        position: s.position,
        breakMinutes: s.breakMinutes,
      })),
      createdBy: template.createdBy,
      createdAt: template.createdAt.toISOString(),
    });
  } catch (error: unknown) {
    console.error('[Labor] Error saving schedule template:', error);
    res.status(500).json({ error: 'Failed to save schedule template' });
  }
});

// POST /:restaurantId/staff/schedule-templates/:templateId/apply — apply template to a week
router.post('/:restaurantId/staff/schedule-templates/:templateId/apply', async (req: Request, res: Response) => {
  try {
    const { restaurantId, templateId } = req.params;
    const { weekStartDate } = req.body as { weekStartDate: string };

    if (!weekStartDate) {
      res.status(400).json({ error: 'weekStartDate is required' });
      return;
    }

    const template = await prisma.scheduleTemplate.findFirst({
      where: { id: templateId, restaurantId },
      include: { shifts: true },
    });

    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const weekStart = new Date(weekStartDate + 'T00:00:00');

    // Create shifts for each template shift
    const createdShifts = await prisma.$transaction(
      template.shifts.map((ts) => {
        const shiftDate = new Date(weekStart);
        shiftDate.setDate(shiftDate.getDate() + ts.dayOfWeek);

        return prisma.shift.create({
          data: {
            restaurantId,
            staffPinId: ts.staffPinId,
            date: shiftDate,
            startTime: ts.startTime,
            endTime: ts.endTime,
            position: ts.position,
            breakMinutes: ts.breakMinutes,
          },
          include: { staffPin: { select: { name: true, role: true } } },
        });
      }),
    );

    res.status(201).json(createdShifts.map((s) => ({
      id: s.id,
      restaurantId: s.restaurantId,
      staffPinId: s.staffPinId,
      staffName: s.staffPin.name,
      staffRole: s.staffPin.role,
      date: s.date.toISOString().split('T')[0],
      startTime: s.startTime,
      endTime: s.endTime,
      position: s.position,
      breakMinutes: s.breakMinutes,
      notes: s.notes,
      isPublished: s.isPublished,
    })));
  } catch (error: unknown) {
    console.error('[Labor] Error applying schedule template:', error);
    res.status(500).json({ error: 'Failed to apply schedule template' });
  }
});

// DELETE /:restaurantId/staff/schedule-templates/:templateId
router.delete('/:restaurantId/staff/schedule-templates/:templateId', async (req: Request, res: Response) => {
  try {
    const { restaurantId, templateId } = req.params;

    const template = await prisma.scheduleTemplate.findFirst({
      where: { id: templateId, restaurantId },
    });

    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    await prisma.scheduleTemplate.delete({ where: { id: templateId } });
    res.status(204).send();
  } catch (error: unknown) {
    console.error('[Labor] Error deleting schedule template:', error);
    res.status(500).json({ error: 'Failed to delete schedule template' });
  }
});

// ============ Copy Previous Week ============

// POST /:restaurantId/staff/copy-week
router.post('/:restaurantId/staff/copy-week', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { targetWeekStart } = req.body as { targetWeekStart: string };

    if (!targetWeekStart) {
      res.status(400).json({ error: 'targetWeekStart is required' });
      return;
    }

    const targetStart = new Date(targetWeekStart + 'T00:00:00');

    // Calculate previous week dates
    const prevStart = new Date(targetStart);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevEnd = new Date(prevStart);
    prevEnd.setDate(prevEnd.getDate() + 6);
    prevEnd.setHours(23, 59, 59, 999);

    const prevShifts = await prisma.shift.findMany({
      where: {
        restaurantId,
        date: { gte: prevStart, lte: prevEnd },
      },
      include: { staffPin: { select: { name: true, role: true } } },
    });

    if (prevShifts.length === 0) {
      res.status(400).json({ error: 'No shifts found in previous week' });
      return;
    }

    // Create new shifts offset by +7 days
    const createdShifts = await prisma.$transaction(
      prevShifts.map((s) => {
        const newDate = new Date(s.date);
        newDate.setDate(newDate.getDate() + 7);

        return prisma.shift.create({
          data: {
            restaurantId,
            staffPinId: s.staffPinId,
            date: newDate,
            startTime: s.startTime,
            endTime: s.endTime,
            position: s.position,
            breakMinutes: s.breakMinutes,
          },
          include: { staffPin: { select: { name: true, role: true } } },
        });
      }),
    );

    res.status(201).json(createdShifts.map((s) => ({
      id: s.id,
      restaurantId: s.restaurantId,
      staffPinId: s.staffPinId,
      staffName: s.staffPin.name,
      staffRole: s.staffPin.role,
      date: s.date.toISOString().split('T')[0],
      startTime: s.startTime,
      endTime: s.endTime,
      position: s.position,
      breakMinutes: s.breakMinutes,
      notes: s.notes,
      isPublished: s.isPublished,
    })));
  } catch (error: unknown) {
    console.error('[Labor] Error copying previous week:', error);
    res.status(500).json({ error: 'Failed to copy previous week' });
  }
});

// ============ Live Labor Snapshot ============

// GET /:restaurantId/staff/labor-live
router.get('/:restaurantId/staff/labor-live', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

    // Get all currently clocked-in staff
    const activeClocks = await prisma.timeEntry.findMany({
      where: {
        restaurantId,
        clockOut: null,
      },
    });

    const clockedInCount = activeClocks.length;

    // Estimate hourly cost ($15/hr default — in production, use staff hourly rates)
    const hourlyRate = 15;
    const currentHourlyCost = Math.round(clockedInCount * hourlyRate * 100) / 100;

    // Get today's revenue
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayOrders = await prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: { gte: todayStart },
        status: { not: 'cancelled' },
      },
      select: { total: true },
    });

    const todayRevenue = todayOrders.reduce(
      (sum, o) => sum + Number(o.total ?? 0),
      0,
    );

    // Calculate labor % and projected daily cost
    const laborPercent = todayRevenue > 0
      ? Math.round((currentHourlyCost * (new Date().getHours() || 1)) / todayRevenue * 10000) / 100
      : 0;

    // Project: assume restaurant open 12 hours
    const projectedDailyLaborCost = Math.round(currentHourlyCost * 12 * 100) / 100;

    res.json({
      currentHourlyCost,
      clockedInCount,
      todayRevenue: Math.round(todayRevenue * 100) / 100,
      laborPercent,
      projectedDailyLaborCost,
    });
  } catch (error: unknown) {
    console.error('[Labor] Error fetching live labor snapshot:', error);
    res.status(500).json({ error: 'Failed to fetch live labor snapshot' });
  }
});

export default router;
