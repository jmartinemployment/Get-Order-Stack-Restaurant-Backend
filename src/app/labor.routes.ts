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
    const regularHours = Math.min(totalHours, 40);
    const overtimeHours = Math.max(totalHours - 40, 0);

    // Estimate pay (default $15/hr, 1.5x overtime)
    const hourlyRate = 15;
    const basePay = Math.round(regularHours * hourlyRate * 100) / 100;
    const overtimePay = Math.round(overtimeHours * hourlyRate * 1.5 * 100) / 100;

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

export default router;
