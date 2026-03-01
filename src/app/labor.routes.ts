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

// GET /:merchantId/staff/pins
router.get('/:merchantId/staff/pins', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const pins = await prisma.staffPin.findMany({
      where: { restaurantId, isActive: true },
      select: { id: true, name: true, role: true, teamMemberId: true },
      orderBy: { name: 'asc' },
    });
    res.json(pins);
  } catch (error: unknown) {
    console.error('[Labor] Error fetching staff pins:', error);
    res.status(500).json({ error: 'Failed to fetch staff pins' });
  }
});

// ============ Shifts ============

// GET /:merchantId/staff/shifts
router.get('/:merchantId/staff/shifts', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

// POST /:merchantId/staff/shifts/publish — MUST be before /:id route
router.post('/:merchantId/staff/shifts/publish', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

// POST /:merchantId/staff/shifts
router.post('/:merchantId/staff/shifts', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

// PATCH /:merchantId/staff/shifts/:id
router.patch('/:merchantId/staff/shifts/:id', async (req: Request, res: Response) => {
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

// DELETE /:merchantId/staff/shifts/:id
router.delete('/:merchantId/staff/shifts/:id', async (req: Request, res: Response) => {
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

// POST /:merchantId/staff/clock-in
router.post('/:merchantId/staff/clock-in', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

// POST /:merchantId/staff/clock-out/:id
router.post('/:merchantId/staff/clock-out/:id', async (req: Request, res: Response) => {
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

// GET /:merchantId/staff/active-clocks
router.get('/:merchantId/staff/active-clocks', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const clocks = await laborService.getActiveClocks(restaurantId);
    res.json(clocks);
  } catch (error: unknown) {
    console.error('[Labor] Error fetching active clocks:', error);
    res.status(500).json({ error: 'Failed to fetch active clocks' });
  }
});

// ============ Labor Report ============

// GET /:merchantId/staff/labor-report
router.get('/:merchantId/staff/labor-report', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

// GET /:merchantId/staff/labor-recommendations
router.get('/:merchantId/staff/labor-recommendations', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const recommendations = await laborService.getLaborRecommendations(restaurantId);
    res.json(recommendations);
  } catch (error: unknown) {
    console.error('[Labor] Error fetching recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch labor recommendations' });
  }
});

// ============ Labor Targets ============

// GET /:merchantId/staff/labor-targets
router.get('/:merchantId/staff/labor-targets', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const targets = await laborService.getTargets(restaurantId);
    res.json(targets);
  } catch (error: unknown) {
    console.error('[Labor] Error fetching labor targets:', error);
    res.status(500).json({ error: 'Failed to fetch labor targets' });
  }
});

// PUT /:merchantId/staff/labor-targets
router.put('/:merchantId/staff/labor-targets', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

// ============ Schedule Templates ============
// IMPORTANT: These routes MUST be before /:staffPinId/ routes to avoid param collision

// GET /:merchantId/staff/schedule-templates
router.get('/:merchantId/staff/schedule-templates', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

// POST /:merchantId/staff/schedule-templates — save current week as template
router.post('/:merchantId/staff/schedule-templates', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { name, weekStartDate } = req.body as { name: string; weekStartDate: string };

    if (!name?.trim()) {
      res.status(400).json({ error: 'Template name is required' });
      return;
    }
    if (!weekStartDate) {
      res.status(400).json({ error: 'weekStartDate is required' });
      return;
    }

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

// POST /:merchantId/staff/schedule-templates/:templateId/apply
router.post('/:merchantId/staff/schedule-templates/:templateId/apply', async (req: Request, res: Response) => {
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

// DELETE /:merchantId/staff/schedule-templates/:templateId
router.delete('/:merchantId/staff/schedule-templates/:templateId', async (req: Request, res: Response) => {
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

// POST /:merchantId/staff/copy-week
router.post('/:merchantId/staff/copy-week', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { targetWeekStart } = req.body as { targetWeekStart: string };

    if (!targetWeekStart) {
      res.status(400).json({ error: 'targetWeekStart is required' });
      return;
    }

    const targetStart = new Date(targetWeekStart + 'T00:00:00');

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

// GET /:merchantId/staff/labor-live
router.get('/:merchantId/staff/labor-live', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

    const activeClocks = await prisma.timeEntry.findMany({
      where: {
        restaurantId,
        clockOut: null,
      },
    });

    const clockedInCount = activeClocks.length;
    const hourlyRate = 15;
    const currentHourlyCost = Math.round(clockedInCount * hourlyRate * 100) / 100;

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

    const laborPercent = todayRevenue > 0
      ? Math.round((currentHourlyCost * (new Date().getHours() || 1)) / todayRevenue * 10000) / 100
      : 0;

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

// ============ Staff Notifications ============
// IMPORTANT: These routes MUST be before /:staffPinId/ routes to avoid param collision

// GET /:merchantId/staff/notifications?pinId=...
router.get('/:merchantId/staff/notifications', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { pinId } = req.query;

    if (!pinId) {
      res.status(400).json({ error: 'pinId query param is required' });
      return;
    }

    const notifications = await prisma.staffNotification.findMany({
      where: { restaurantId, recipientPinId: pinId as string },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json(notifications);
  } catch (error: unknown) {
    console.error('[Labor] Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PATCH /:merchantId/staff/notifications/:notificationId/read
router.patch('/:merchantId/staff/notifications/:notificationId/read', async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.params;

    await prisma.staffNotification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    res.json({ success: true });
  } catch (error: unknown) {
    console.error('[Labor] Error marking notification read:', error);
    res.status(500).json({ error: 'Failed to mark notification read' });
  }
});

// POST /:merchantId/staff/notifications/schedule-published
router.post('/:merchantId/staff/notifications/schedule-published', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { weekStart } = req.body;

    if (!weekStart) {
      res.status(400).json({ error: 'weekStart is required' });
      return;
    }

    // Find all staff with shifts in the published week
    const weekStartDate = new Date(weekStart);
    const weekEndDate = new Date(weekStart);
    weekEndDate.setDate(weekEndDate.getDate() + 6);

    const shifts = await prisma.shift.findMany({
      where: {
        restaurantId,
        date: { gte: weekStartDate, lte: weekEndDate },
      },
      select: { staffPinId: true },
    });

    const uniquePinIds = [...new Set(shifts.map((s) => s.staffPinId))];

    if (uniquePinIds.length === 0) {
      res.json({ sent: 0 });
      return;
    }

    const notifications = uniquePinIds.map((pinId) => ({
      restaurantId,
      recipientPinId: pinId,
      type: 'schedule_published',
      title: 'Schedule Published',
      message: `The schedule for the week of ${weekStart} has been published. Check your shifts.`,
    }));

    await prisma.staffNotification.createMany({ data: notifications });

    res.json({ sent: uniquePinIds.length });
  } catch (error: unknown) {
    console.error('[Labor] Error sending schedule notification:', error);
    res.status(500).json({ error: 'Failed to send schedule notification' });
  }
});

// POST /:merchantId/staff/notifications/announcement
router.post('/:merchantId/staff/notifications/announcement', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { message, recipientPinIds } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    let pinIds: string[];

    if (recipientPinIds && Array.isArray(recipientPinIds) && recipientPinIds.length > 0) {
      pinIds = recipientPinIds;
    } else {
      // Send to all active staff
      const staff = await prisma.staffPin.findMany({
        where: { restaurantId, isActive: true },
        select: { id: true },
      });
      pinIds = staff.map((s) => s.id);
    }

    if (pinIds.length === 0) {
      res.json({ sent: 0 });
      return;
    }

    const notifications = pinIds.map((pinId) => ({
      restaurantId,
      recipientPinId: pinId,
      type: 'announcement',
      title: 'Team Announcement',
      message: message.trim(),
    }));

    await prisma.staffNotification.createMany({ data: notifications });

    res.json({ sent: pinIds.length });
  } catch (error: unknown) {
    console.error('[Labor] Error sending announcement:', error);
    res.status(500).json({ error: 'Failed to send announcement' });
  }
});

// ============ Staff Portal — Earnings ============

// GET /:merchantId/staff/:staffPinId/earnings
router.get('/:merchantId/staff/:staffPinId/earnings', async (req: Request, res: Response) => {
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

// GET /:merchantId/staff/:staffPinId/availability
router.get('/:merchantId/staff/:staffPinId/availability', async (req: Request, res: Response) => {
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

// PUT /:merchantId/staff/:staffPinId/availability
router.put('/:merchantId/staff/:staffPinId/availability', async (req: Request, res: Response) => {
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

// GET /:merchantId/staff/:staffPinId/swap-requests
router.get('/:merchantId/staff/:staffPinId/swap-requests', async (req: Request, res: Response) => {
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

// POST /:merchantId/staff/swap-requests
router.post('/:merchantId/staff/swap-requests', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

// PATCH /:merchantId/staff/swap-requests/:requestId
router.patch('/:merchantId/staff/swap-requests/:requestId', async (req: Request, res: Response) => {
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

// GET /:merchantId/staff/workweek-config
router.get('/:merchantId/staff/workweek-config', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const config = await prisma.workweekConfig.findUnique({
      where: { restaurantId },
    });

    if (!config) {
      // Return defaults when no config exists
      res.json({
        startDay: 0,
        startTime: '04:00',
        overtimeThresholdHours: 40,
        overtimeMultiplier: 1.5,
      });
      return;
    }

    res.json({
      startDay: config.weekStartDay,
      startTime: config.dayStartTime,
      overtimeThresholdHours: Number(config.overtimeThresholdHours),
      overtimeMultiplier: Number(config.overtimeMultiplier),
    });
  } catch (error: unknown) {
    console.error('[Labor] Error fetching workweek config:', error);
    res.status(500).json({ error: 'Failed to fetch workweek config' });
  }
});

// PUT /:merchantId/staff/workweek-config
router.put('/:merchantId/staff/workweek-config', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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
        weekStartDay: parsed.data.startDay,
        dayStartTime: parsed.data.startTime,
        overtimeThresholdHours: parsed.data.overtimeThresholdHours,
        overtimeMultiplier: parsed.data.overtimeMultiplier ?? 1.5,
      },
      update: {
        weekStartDay: parsed.data.startDay,
        dayStartTime: parsed.data.startTime,
        overtimeThresholdHours: parsed.data.overtimeThresholdHours,
        overtimeMultiplier: parsed.data.overtimeMultiplier ?? 1.5,
      },
    });

    res.json({
      startDay: config.weekStartDay,
      startTime: config.dayStartTime,
      overtimeThresholdHours: Number(config.overtimeThresholdHours),
      overtimeMultiplier: Number(config.overtimeMultiplier),
    });
  } catch (error: unknown) {
    console.error('[Labor] Error saving workweek config:', error);
    res.status(500).json({ error: 'Failed to save workweek config' });
  }
});

// ============ Timecard Edit Requests (Step 11) ============

// GET /:merchantId/staff/:staffPinId/timecard-edits — staff's own edit requests
router.get('/:merchantId/staff/:staffPinId/timecard-edits', async (req: Request, res: Response) => {
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

// GET /:merchantId/staff/timecard-edits — manager view: all edit requests (filterable by status)
router.get('/:merchantId/staff/timecard-edits', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

// POST /:merchantId/staff/timecard-edits — staff requests an edit
router.post('/:merchantId/staff/timecard-edits', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

// PATCH /:merchantId/staff/timecard-edits/:editId/approve
router.patch('/:merchantId/staff/timecard-edits/:editId/approve', async (req: Request, res: Response) => {
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

// PATCH /:merchantId/staff/timecard-edits/:editId/deny
router.patch('/:merchantId/staff/timecard-edits/:editId/deny', async (req: Request, res: Response) => {
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

// POST /:merchantId/staff/validate-clock-in — pre-check before allowing clock-in
router.post('/:merchantId/staff/validate-clock-in', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

// POST /:merchantId/staff/clock-in-with-override — manager override for schedule enforcement
router.post('/:merchantId/staff/clock-in-with-override', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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

// POST /:merchantId/staff/auto-clock-out — close orphaned time entries
router.post('/:merchantId/staff/auto-clock-out', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

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

// ============ Break Types ============

// GET /:merchantId/break-types
router.get('/:merchantId/break-types', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const breakTypes = await prisma.breakType.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });
    res.json(breakTypes);
  } catch (error: unknown) {
    console.error('[Labor] Error fetching break types:', error);
    res.status(500).json({ error: 'Failed to fetch break types' });
  }
});

// POST /:merchantId/break-types
router.post('/:merchantId/break-types', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { name, expectedMinutes, isPaid, isActive } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const breakType = await prisma.breakType.create({
      data: {
        restaurantId,
        name: name.trim(),
        expectedMinutes: expectedMinutes ?? 15,
        isPaid: isPaid ?? false,
        isActive: isActive ?? true,
      },
    });
    res.status(201).json(breakType);
  } catch (error: unknown) {
    console.error('[Labor] Error creating break type:', error);
    res.status(500).json({ error: 'Failed to create break type' });
  }
});

// PATCH /:merchantId/break-types/:id
router.patch('/:merchantId/break-types/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data: Record<string, unknown> = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.expectedMinutes !== undefined) data.expectedMinutes = req.body.expectedMinutes;
    if (req.body.isPaid !== undefined) data.isPaid = req.body.isPaid;
    if (req.body.isActive !== undefined) data.isActive = req.body.isActive;

    const breakType = await prisma.breakType.update({
      where: { id },
      data,
    });
    res.json(breakType);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Break type not found' });
      return;
    }
    console.error('[Labor] Error updating break type:', error);
    res.status(500).json({ error: 'Failed to update break type' });
  }
});

// ============ Payroll Periods ============

// GET /:merchantId/labor/payroll
router.get('/:merchantId/labor/payroll', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const periods = await prisma.payrollPeriod.findMany({
      where: { restaurantId },
      orderBy: { startDate: 'desc' },
    });
    res.json(periods);
  } catch (error: unknown) {
    console.error('[Labor] Error fetching payroll periods:', error);
    res.status(500).json({ error: 'Failed to fetch payroll periods' });
  }
});

// POST /:merchantId/labor/payroll
router.post('/:merchantId/labor/payroll', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate are required' });
      return;
    }

    const period = await prisma.payrollPeriod.create({
      data: {
        restaurantId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
    });
    res.status(201).json(period);
  } catch (error: unknown) {
    console.error('[Labor] Error creating payroll period:', error);
    res.status(500).json({ error: 'Failed to create payroll period' });
  }
});

// PATCH /:merchantId/labor/payroll/:id
router.patch('/:merchantId/labor/payroll/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data: Record<string, unknown> = {};
    if (req.body.status !== undefined) data.status = req.body.status;
    if (req.body.summaries !== undefined) data.summaries = req.body.summaries;

    const period = await prisma.payrollPeriod.update({
      where: { id },
      data,
    });
    res.json(period);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Payroll period not found' });
      return;
    }
    console.error('[Labor] Error updating payroll period:', error);
    res.status(500).json({ error: 'Failed to update payroll period' });
  }
});

// ============ Commission Rules ============

// GET /:merchantId/labor/commissions/rules
router.get('/:merchantId/labor/commissions/rules', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const rules = await prisma.commissionRule.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });
    res.json(rules);
  } catch (error: unknown) {
    console.error('[Labor] Error fetching commission rules:', error);
    res.status(500).json({ error: 'Failed to fetch commission rules' });
  }
});

// POST /:merchantId/labor/commissions/rules
router.post('/:merchantId/labor/commissions/rules', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { name, type, value, appliesTo, jobTitles, isActive } = req.body;

    if (!name || !type || value === undefined) {
      res.status(400).json({ error: 'name, type, and value are required' });
      return;
    }

    const rule = await prisma.commissionRule.create({
      data: {
        restaurantId,
        name,
        type,
        value,
        appliesTo: appliesTo ?? 'sales',
        jobTitles: jobTitles ?? [],
        isActive: isActive ?? true,
      },
    });
    res.status(201).json(rule);
  } catch (error: unknown) {
    console.error('[Labor] Error creating commission rule:', error);
    res.status(500).json({ error: 'Failed to create commission rule' });
  }
});

// PATCH /:merchantId/labor/commissions/rules/:ruleId
router.patch('/:merchantId/labor/commissions/rules/:ruleId', async (req: Request, res: Response) => {
  try {
    const { ruleId } = req.params;
    const data: Record<string, unknown> = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.type !== undefined) data.type = req.body.type;
    if (req.body.value !== undefined) data.value = req.body.value;
    if (req.body.appliesTo !== undefined) data.appliesTo = req.body.appliesTo;
    if (req.body.jobTitles !== undefined) data.jobTitles = req.body.jobTitles;
    if (req.body.isActive !== undefined) data.isActive = req.body.isActive;

    const rule = await prisma.commissionRule.update({
      where: { id: ruleId },
      data,
    });
    res.json(rule);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Commission rule not found' });
      return;
    }
    console.error('[Labor] Error updating commission rule:', error);
    res.status(500).json({ error: 'Failed to update commission rule' });
  }
});

// DELETE /:merchantId/labor/commissions/rules/:ruleId
router.delete('/:merchantId/labor/commissions/rules/:ruleId', async (req: Request, res: Response) => {
  try {
    const { ruleId } = req.params;
    await prisma.commissionRule.delete({ where: { id: ruleId } });
    res.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Commission rule not found' });
      return;
    }
    console.error('[Labor] Error deleting commission rule:', error);
    res.status(500).json({ error: 'Failed to delete commission rule' });
  }
});

// ============ Compliance Alerts ============

// GET /:merchantId/labor/compliance/alerts
router.get('/:merchantId/labor/compliance/alerts', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { resolved } = req.query;

    const where: Record<string, unknown> = { restaurantId };
    if (resolved === 'false') where.isResolved = false;
    if (resolved === 'true') where.isResolved = true;

    const alerts = await prisma.complianceAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(alerts);
  } catch (error: unknown) {
    console.error('[Labor] Error fetching compliance alerts:', error);
    res.status(500).json({ error: 'Failed to fetch compliance alerts' });
  }
});

// GET /:merchantId/labor/compliance/summary
router.get('/:merchantId/labor/compliance/summary', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

    const alerts = await prisma.complianceAlert.findMany({
      where: { restaurantId, isResolved: false },
    });

    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const alert of alerts) {
      byType[alert.type] = (byType[alert.type] ?? 0) + 1;
      bySeverity[alert.severity] = (bySeverity[alert.severity] ?? 0) + 1;
    }

    res.json({
      totalOpen: alerts.length,
      byType,
      bySeverity,
    });
  } catch (error: unknown) {
    console.error('[Labor] Error fetching compliance summary:', error);
    res.status(500).json({ error: 'Failed to fetch compliance summary' });
  }
});

export default router;
