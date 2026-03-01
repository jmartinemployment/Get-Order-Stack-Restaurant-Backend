import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

// --- Zod schemas ---

const comboItemSchema = z.object({
  menuItemId: z.string().uuid(),
  menuItemName: z.string().min(1),
  quantity: z.number().int().min(1),
  required: z.boolean(),
});

const createComboSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  comboPrice: z.number().min(0),
  items: z.array(comboItemSchema).min(1),
});

const updateComboSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  comboPrice: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
  items: z.array(comboItemSchema).min(1).optional(),
});

// --- Routes ---

// GET /:merchantId/combos
router.get('/:merchantId/combos', async (req: Request, res: Response) => {
  const restaurantId = req.params.merchantId;
  try {
    const combos = await prisma.combo.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });
    res.json(combos);
  } catch (error: unknown) {
    console.error('[Combo] List error:', error);
    res.status(500).json({ error: 'Failed to list combos' });
  }
});

// POST /:merchantId/combos
router.post('/:merchantId/combos', async (req: Request, res: Response) => {
  const restaurantId = req.params.merchantId;
  const parsed = createComboSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const combo = await prisma.combo.create({
      data: {
        restaurantId,
        name: parsed.data.name,
        description: parsed.data.description,
        comboPrice: parsed.data.comboPrice,
        items: parsed.data.items,
      },
    });
    res.status(201).json(combo);
  } catch (error: unknown) {
    console.error('[Combo] Create error:', error);
    res.status(500).json({ error: 'Failed to create combo' });
  }
});

// PATCH /:merchantId/combos/:comboId
router.patch('/:merchantId/combos/:comboId', async (req: Request, res: Response) => {
  const { restaurantId, comboId } = req.params;
  const parsed = updateComboSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const combo = await prisma.combo.update({
      where: { id: comboId, restaurantId },
      data: parsed.data,
    });
    res.json(combo);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Combo not found' });
      return;
    }
    console.error('[Combo] Update error:', error);
    res.status(500).json({ error: 'Failed to update combo' });
  }
});

// DELETE /:merchantId/combos/:comboId
router.delete('/:merchantId/combos/:comboId', async (req: Request, res: Response) => {
  const { restaurantId, comboId } = req.params;
  try {
    await prisma.combo.delete({
      where: { id: comboId, restaurantId },
    });
    res.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Combo not found' });
      return;
    }
    console.error('[Combo] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete combo' });
  }
});

export default router;
