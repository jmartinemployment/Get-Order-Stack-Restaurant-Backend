import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { handlePrismaError } from '../utils/prisma-errors';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

// --- Zod schemas ---

const routingRuleSchema = z.object({
  jobType: z.enum(['customer_receipt', 'kitchen_ticket', 'bar_ticket', 'expo_ticket', 'order_summary', 'close_of_day']),
  printerId: z.string().uuid(),
  copies: z.number().int().min(1).max(10).default(1),
  enabled: z.boolean().default(true),
});

const createProfileSchema = z.object({
  name: z.string().min(1).max(100),
  isDefault: z.boolean().default(false),
  routingRules: z.array(routingRuleSchema).default([]),
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isDefault: z.boolean().optional(),
  routingRules: z.array(routingRuleSchema).optional(),
});

// --- Printer Profile CRUD ---

// List all printer profiles for a restaurant
router.get('/:restaurantId/printer-profiles', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

    const profiles = await prisma.printerProfile.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(profiles);
  } catch (error) {
    handlePrismaError(error, res, {}, 'Failed to fetch printer profiles');
  }
});

// Create a new printer profile
router.post('/:restaurantId/printer-profiles', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = createProfileSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { name, isDefault, routingRules } = parsed.data;

    if (isDefault) {
      await prisma.printerProfile.updateMany({
        where: { restaurantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const profile = await prisma.printerProfile.create({
      data: { restaurantId, name, isDefault, routingRules },
    });

    res.status(201).json(profile);
  } catch (error) {
    handlePrismaError(error, res, {
      P2002: { status: 409, message: 'A printer profile with this name already exists' },
      P2003: { status: 400, message: 'Invalid restaurant ID' },
    }, 'Failed to create printer profile');
  }
});

// Update a printer profile
router.patch('/:restaurantId/printer-profiles/:id', async (req: Request, res: Response) => {
  try {
    const { restaurantId, id } = req.params;
    const parsed = updateProfileSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const existing = await prisma.printerProfile.findFirst({
      where: { id, restaurantId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Printer profile not found' });
      return;
    }

    if (parsed.data.isDefault) {
      await prisma.printerProfile.updateMany({
        where: { restaurantId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const profile = await prisma.printerProfile.update({
      where: { id },
      data: parsed.data,
    });

    res.json(profile);
  } catch (error) {
    handlePrismaError(error, res, {
      P2002: { status: 409, message: 'A printer profile with this name already exists' },
      P2025: { status: 404, message: 'Printer profile not found' },
    }, 'Failed to update printer profile');
  }
});

// Delete a printer profile
router.delete('/:restaurantId/printer-profiles/:id', async (req: Request, res: Response) => {
  try {
    const { restaurantId, id } = req.params;

    const existing = await prisma.printerProfile.findFirst({
      where: { id, restaurantId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Printer profile not found' });
      return;
    }

    await prisma.printerProfile.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    handlePrismaError(error, res, {
      P2025: { status: 404, message: 'Printer profile not found' },
    }, 'Failed to delete printer profile');
  }
});

export default router;
