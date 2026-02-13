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
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate query params are required' });
      return;
    }

    const shifts = await laborService.getShifts(
      restaurantId,
      startDate as string,
      endDate as string,
    );
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

export default router;
