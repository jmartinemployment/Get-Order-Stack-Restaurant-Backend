import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { handlePrismaError } from '../utils/prisma-errors';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

// --- Zod schemas ---

const createPeripheralSchema = z.object({
  parentDeviceId: z.string().uuid(),
  type: z.enum(['cash_drawer', 'barcode_scanner', 'card_reader', 'customer_display', 'scale']),
  name: z.string().min(1).max(100),
  connectionType: z.enum(['usb', 'bluetooth', 'network']),
});

// --- Peripheral CRUD ---

// List all peripherals for a restaurant
router.get('/:restaurantId/peripherals', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { parentDeviceId } = req.query;

    const peripherals = await prisma.peripheralDevice.findMany({
      where: {
        restaurantId,
        ...(parentDeviceId && { parentDeviceId: parentDeviceId as string }),
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(peripherals);
  } catch (error) {
    handlePrismaError(error, res, {}, 'Failed to fetch peripherals');
  }
});

// Register a new peripheral
router.post('/:restaurantId/peripherals', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = createPeripheralSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { parentDeviceId, type, name, connectionType } = parsed.data;

    // Verify parent device exists and belongs to this restaurant
    const parentDevice = await prisma.device.findFirst({
      where: { id: parentDeviceId, restaurantId },
    });

    if (!parentDevice) {
      res.status(400).json({ error: 'Parent device not found in this restaurant' });
      return;
    }

    const peripheral = await prisma.peripheralDevice.create({
      data: { restaurantId, parentDeviceId, type, name, connectionType },
    });

    res.status(201).json(peripheral);
  } catch (error) {
    handlePrismaError(error, res, {
      P2003: { status: 400, message: 'Invalid parent device or restaurant ID' },
    }, 'Failed to register peripheral');
  }
});

// Remove a peripheral
router.delete('/:restaurantId/peripherals/:id', async (req: Request, res: Response) => {
  try {
    const { restaurantId, id } = req.params;

    const existing = await prisma.peripheralDevice.findFirst({
      where: { id, restaurantId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Peripheral not found' });
      return;
    }

    await prisma.peripheralDevice.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    handlePrismaError(error, res, {
      P2025: { status: 404, message: 'Peripheral not found' },
    }, 'Failed to remove peripheral');
  }
});

export default router;
