import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { handlePrismaError } from '../utils/prisma-errors';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

// --- Zod schemas ---

const createKioskProfileSchema = z.object({
  name: z.string().min(1).max(100),
  posMode: z.enum(['full_service', 'quick_service', 'bar', 'retail', 'services', 'bookings', 'standard']),
  welcomeMessage: z.string().max(500).default('Welcome!'),
  showImages: z.boolean().default(true),
  enabledCategories: z.array(z.string().uuid()).default([]),
  requireNameForOrder: z.boolean().default(false),
  maxIdleSeconds: z.number().int().min(30).max(600).default(120),
  enableAccessibility: z.boolean().default(false),
});

const updateKioskProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  posMode: z.enum(['full_service', 'quick_service', 'bar', 'retail', 'services', 'bookings', 'standard']).optional(),
  welcomeMessage: z.string().max(500).optional(),
  showImages: z.boolean().optional(),
  enabledCategories: z.array(z.string().uuid()).optional(),
  requireNameForOrder: z.boolean().optional(),
  maxIdleSeconds: z.number().int().min(30).max(600).optional(),
  enableAccessibility: z.boolean().optional(),
});

// --- Kiosk Profile CRUD ---

// List all kiosk profiles for a restaurant
router.get('/:restaurantId/kiosk-profiles', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

    const profiles = await prisma.kioskProfile.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(profiles);
  } catch (error) {
    handlePrismaError(error, res, {}, 'Failed to fetch kiosk profiles');
  }
});

// Create a new kiosk profile
router.post('/:restaurantId/kiosk-profiles', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = createKioskProfileSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const profile = await prisma.kioskProfile.create({
      data: { restaurantId, ...parsed.data },
    });

    res.status(201).json(profile);
  } catch (error) {
    handlePrismaError(error, res, {
      P2002: { status: 409, message: 'A kiosk profile with this name already exists' },
      P2003: { status: 400, message: 'Invalid restaurant ID' },
    }, 'Failed to create kiosk profile');
  }
});

// Update a kiosk profile
router.patch('/:restaurantId/kiosk-profiles/:id', async (req: Request, res: Response) => {
  try {
    const { restaurantId, id } = req.params;
    const parsed = updateKioskProfileSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const existing = await prisma.kioskProfile.findFirst({
      where: { id, restaurantId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Kiosk profile not found' });
      return;
    }

    const profile = await prisma.kioskProfile.update({
      where: { id },
      data: parsed.data,
    });

    res.json(profile);
  } catch (error) {
    handlePrismaError(error, res, {
      P2002: { status: 409, message: 'A kiosk profile with this name already exists' },
      P2025: { status: 404, message: 'Kiosk profile not found' },
    }, 'Failed to update kiosk profile');
  }
});

// Delete a kiosk profile
router.delete('/:restaurantId/kiosk-profiles/:id', async (req: Request, res: Response) => {
  try {
    const { restaurantId, id } = req.params;

    const existing = await prisma.kioskProfile.findFirst({
      where: { id, restaurantId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Kiosk profile not found' });
      return;
    }

    await prisma.kioskProfile.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    handlePrismaError(error, res, {
      P2025: { status: 404, message: 'Kiosk profile not found' },
    }, 'Failed to delete kiosk profile');
  }
});

export default router;
