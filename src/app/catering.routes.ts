import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

// --- Zod schemas ---

const createEventSchema = z.object({
  title: z.string().min(1),
  eventType: z.string().min(1),
  status: z.string().optional(),
  eventDate: z.string().refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid date'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  headcount: z.number().int().min(1),
  locationType: z.string().optional(),
  locationAddress: z.string().optional(),
  contactName: z.string().min(1),
  contactPhone: z.string().min(1),
  contactEmail: z.string().email(),
  notes: z.string().optional(),
});

const updateEventSchema = z.object({
  title: z.string().min(1).optional(),
  eventType: z.string().min(1).optional(),
  status: z.string().optional(),
  eventDate: z.string().refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid date').optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  headcount: z.number().int().min(1).optional(),
  locationType: z.string().optional(),
  locationAddress: z.string().nullable().optional(),
  contactName: z.string().min(1).optional(),
  contactPhone: z.string().min(1).optional(),
  contactEmail: z.string().email().optional(),
  notes: z.string().nullable().optional(),
});

const capacitySchema = z.object({
  maxEventsPerDay: z.number().int().min(1),
  maxHeadcountPerDay: z.number().int().min(1),
  conflictAlertsEnabled: z.boolean(),
});

// --- Event Routes ---

// GET /api/merchant/:merchantId/catering/events
router.get('/:merchantId/catering/events', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const events = await prisma.cateringEvent.findMany({
      where: { restaurantId: merchantId },
      orderBy: { eventDate: 'asc' },
    });
    res.json(events);
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to fetch catering events' });
  }
});

// POST /api/merchant/:merchantId/catering/events
router.post('/:merchantId/catering/events', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const parsed = createEventSchema.parse(req.body);
    const event = await prisma.cateringEvent.create({
      data: {
        restaurantId: merchantId,
        title: parsed.title,
        eventType: parsed.eventType,
        status: parsed.status ?? 'inquiry',
        eventDate: new Date(parsed.eventDate),
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        headcount: parsed.headcount,
        locationType: parsed.locationType ?? 'on_site',
        locationAddress: parsed.locationAddress ?? null,
        contactName: parsed.contactName,
        contactPhone: parsed.contactPhone,
        contactEmail: parsed.contactEmail,
        notes: parsed.notes ?? null,
      },
    });
    res.status(201).json(event);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    res.status(500).json({ error: 'Failed to create catering event' });
  }
});

// GET /api/merchant/:merchantId/catering/events/:id
router.get('/:merchantId/catering/events/:id', async (req: Request, res: Response) => {
  try {
    const { merchantId, id } = req.params;
    const event = await prisma.cateringEvent.findFirst({
      where: { id, restaurantId: merchantId },
    });
    if (!event) {
      res.status(404).json({ error: 'Catering event not found' });
      return;
    }
    res.json(event);
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to fetch catering event' });
  }
});

// PATCH /api/merchant/:merchantId/catering/events/:id
router.patch('/:merchantId/catering/events/:id', async (req: Request, res: Response) => {
  try {
    const { merchantId, id } = req.params;
    const parsed = updateEventSchema.parse(req.body);

    const existing = await prisma.cateringEvent.findFirst({
      where: { id, restaurantId: merchantId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Catering event not found' });
      return;
    }

    const data: Record<string, unknown> = { ...parsed, updatedAt: new Date() };
    if (parsed.eventDate) {
      data.eventDate = new Date(parsed.eventDate);
    }

    const updated = await prisma.cateringEvent.update({
      where: { id },
      data,
    });
    res.json(updated);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    res.status(500).json({ error: 'Failed to update catering event' });
  }
});

// DELETE /api/merchant/:merchantId/catering/events/:id
router.delete('/:merchantId/catering/events/:id', async (req: Request, res: Response) => {
  try {
    const { merchantId, id } = req.params;

    const existing = await prisma.cateringEvent.findFirst({
      where: { id, restaurantId: merchantId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Catering event not found' });
      return;
    }

    await prisma.cateringEvent.delete({ where: { id } });
    res.status(204).send();
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to delete catering event' });
  }
});

// --- Capacity Settings Routes ---

// GET /api/merchant/:merchantId/catering/capacity
router.get('/:merchantId/catering/capacity', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const settings = await prisma.cateringCapacitySettings.findUnique({
      where: { restaurantId: merchantId },
    });
    res.json(settings ?? {
      maxEventsPerDay: 3,
      maxHeadcountPerDay: 200,
      conflictAlertsEnabled: true,
    });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to fetch capacity settings' });
  }
});

// PUT /api/merchant/:merchantId/catering/capacity
router.put('/:merchantId/catering/capacity', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const parsed = capacitySchema.parse(req.body);
    const settings = await prisma.cateringCapacitySettings.upsert({
      where: { restaurantId: merchantId },
      create: {
        restaurantId: merchantId,
        maxEventsPerDay: parsed.maxEventsPerDay,
        maxHeadcountPerDay: parsed.maxHeadcountPerDay,
        conflictAlertsEnabled: parsed.conflictAlertsEnabled,
      },
      update: {
        maxEventsPerDay: parsed.maxEventsPerDay,
        maxHeadcountPerDay: parsed.maxHeadcountPerDay,
        conflictAlertsEnabled: parsed.conflictAlertsEnabled,
      },
    });
    res.json(settings);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    res.status(500).json({ error: 'Failed to save capacity settings' });
  }
});

export default router;
