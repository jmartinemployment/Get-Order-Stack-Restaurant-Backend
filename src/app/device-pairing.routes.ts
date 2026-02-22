import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { handlePrismaError } from '../utils/prisma-errors';

const router = Router();
const prisma = new PrismaClient();

// === Validation Schemas ===

const pairDeviceSchema = z.object({
  code: z.string().length(5),
  hardwareInfo: z.object({
    platform: z.string(),
    osVersion: z.string().nullable().optional(),
    appVersion: z.string().nullable().optional(),
    screenSize: z.string().nullable().optional(),
    serialNumber: z.string().nullable().optional(),
  }).optional(),
});

// === Routes ===

// Pair a device using its 5-character code (no auth — code is self-authenticating)
router.post('/pair', async (req: Request, res: Response) => {
  try {
    const parsed = pairDeviceSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { code, hardwareInfo } = parsed.data;

    const device = await prisma.device.findUnique({
      where: { deviceCode: code },
    });

    if (!device) {
      res.status(400).json({ error: 'Invalid pairing code' });
      return;
    }

    if (device.status !== 'pending') {
      res.status(400).json({ error: 'Device has already been paired or revoked' });
      return;
    }

    if (device.expiresAt && device.expiresAt < new Date()) {
      res.status(400).json({ error: 'Pairing code has expired' });
      return;
    }

    const updated = await prisma.device.update({
      where: { id: device.id },
      data: {
        status: 'active',
        pairedAt: new Date(),
        lastSeenAt: new Date(),
        hardwareInfo: hardwareInfo ?? null,
        deviceCode: null, // Clear the code after pairing
      },
    });

    res.json(updated);
  } catch (error) {
    handlePrismaError(error, res, {}, 'Failed to pair device');
  }
});

// Get device by UUID (used by frontend resolveCurrentDevice on page refresh)
// This route requires auth — applied at mount point in app.ts
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const device = await prisma.device.findUnique({
      where: { id },
      include: { mode: true },
    });

    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    res.json(device);
  } catch (error) {
    handlePrismaError(error, res, {}, 'Failed to fetch device');
  }
});

export default router;
