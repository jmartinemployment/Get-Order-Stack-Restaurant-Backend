import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { handlePrismaError } from '../utils/prisma-errors';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

// --- Zod schemas ---

const checkoutSettingsSchema = z.object({
  defaultOrderType: z.enum(['dine-in', 'takeout', 'delivery']).default('dine-in'),
  requireTableSelection: z.boolean().default(true),
  skipPaymentScreen: z.boolean().default(false),
  autoSendToKds: z.boolean().default(false),
  showTipPrompt: z.boolean().default(true),
  tipPresets: z.array(z.number()).default([15, 18, 20, 25]),
});

const receiptSettingsSchema = z.object({
  autoPrintReceipt: z.boolean().default(false),
  autoPrintKitchenTicket: z.boolean().default(true),
  printerProfileId: z.string().uuid().nullable().default(null),
});

const securitySettingsSchema = z.object({
  requirePinPerTransaction: z.boolean().default(false),
  inactivityTimeoutMinutes: z.number().int().min(1).max(120).default(15),
  lockOnSleep: z.boolean().default(true),
});

const displaySettingsSchema = z.object({
  fontSize: z.enum(['small', 'medium', 'large']).default('medium'),
  showImages: z.boolean().default(true),
  gridColumns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  categoryDisplayMode: z.enum(['tabs', 'sidebar']).default('tabs'),
});

const modeSettingsSchema = z.object({
  checkout: checkoutSettingsSchema.default({
    defaultOrderType: 'dine-in',
    requireTableSelection: true,
    skipPaymentScreen: false,
    autoSendToKds: false,
    showTipPrompt: true,
    tipPresets: [15, 18, 20, 25],
  }),
  receipt: receiptSettingsSchema.default({
    autoPrintReceipt: false,
    autoPrintKitchenTicket: true,
    printerProfileId: null,
  }),
  security: securitySettingsSchema.default({
    requirePinPerTransaction: false,
    inactivityTimeoutMinutes: 15,
    lockOnSleep: true,
  }),
  display: displaySettingsSchema.default({
    fontSize: 'medium',
    showImages: true,
    gridColumns: 3,
    categoryDisplayMode: 'tabs',
  }),
});

const createModeSchema = z.object({
  name: z.string().min(1).max(100),
  deviceType: z.enum(['pos_terminal', 'kds_station', 'kiosk', 'order_pad', 'printer_station']),
  isDefault: z.boolean().default(false),
  settings: modeSettingsSchema,
});

const updateModeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  deviceType: z.enum(['pos_terminal', 'kds_station', 'kiosk', 'order_pad', 'printer_station']).optional(),
  isDefault: z.boolean().optional(),
  settings: modeSettingsSchema.optional(),
});

// --- Device Mode CRUD ---

// List all modes for a restaurant
router.get('/:restaurantId/device-modes', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

    const modes = await prisma.deviceMode.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(modes);
  } catch (error) {
    handlePrismaError(error, res, {}, 'Failed to fetch device modes');
  }
});

// Create a new mode
router.post('/:restaurantId/device-modes', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = createModeSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { name, deviceType, isDefault, settings } = parsed.data;

    // If setting as default, unset existing default for same deviceType
    if (isDefault) {
      await prisma.deviceMode.updateMany({
        where: { restaurantId, deviceType, isDefault: true },
        data: { isDefault: false },
      });
    }

    const mode = await prisma.deviceMode.create({
      data: { restaurantId, name, deviceType, isDefault, settings },
    });

    res.status(201).json(mode);
  } catch (error) {
    handlePrismaError(error, res, {
      P2002: { status: 409, message: 'A mode with this name already exists' },
      P2003: { status: 400, message: 'Invalid restaurant ID' },
    }, 'Failed to create device mode');
  }
});

// Update a mode
router.patch('/:restaurantId/device-modes/:id', async (req: Request, res: Response) => {
  try {
    const { restaurantId, id } = req.params;
    const parsed = updateModeSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const existing = await prisma.deviceMode.findFirst({
      where: { id, restaurantId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Device mode not found' });
      return;
    }

    // If setting as default, unset existing default for same deviceType
    if (parsed.data.isDefault) {
      const deviceType = parsed.data.deviceType ?? existing.deviceType;
      await prisma.deviceMode.updateMany({
        where: { restaurantId, deviceType, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const mode = await prisma.deviceMode.update({
      where: { id },
      data: parsed.data,
    });

    res.json(mode);
  } catch (error) {
    handlePrismaError(error, res, {
      P2002: { status: 409, message: 'A mode with this name already exists' },
      P2025: { status: 404, message: 'Device mode not found' },
    }, 'Failed to update device mode');
  }
});

// Delete a mode
router.delete('/:restaurantId/device-modes/:id', async (req: Request, res: Response) => {
  try {
    const { restaurantId, id } = req.params;

    const existing = await prisma.deviceMode.findFirst({
      where: { id, restaurantId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Device mode not found' });
      return;
    }

    // Check if any devices reference this mode
    const deviceCount = await prisma.device.count({
      where: { modeId: id },
    });

    if (deviceCount > 0) {
      res.status(409).json({ error: `Cannot delete mode — ${deviceCount} device(s) are using it` });
      return;
    }

    await prisma.deviceMode.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    handlePrismaError(error, res, {
      P2025: { status: 404, message: 'Device mode not found' },
    }, 'Failed to delete device mode');
  }
});

export default router;
