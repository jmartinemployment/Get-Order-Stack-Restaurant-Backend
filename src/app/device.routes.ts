import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { handlePrismaError } from '../utils/prisma-errors';
import { generateDeviceCode } from '../utils/device-code';

const router = Router({ mergeParams: true });
const prisma = new PrismaClient();

const HEARTBEAT_THRESHOLD_MS = 30_000;

// === Validation Schemas ===

const createDeviceSchema = z.object({
  deviceName: z.string().min(1).max(100),
  deviceType: z.enum(['terminal', 'kds', 'kiosk', 'printer', 'register']),
  posMode: z.enum(['full_service', 'quick_service', 'bar', 'retail', 'services', 'bookings', 'standard']).optional(),
  modeId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  teamMemberId: z.string().uuid().optional(),
});

const registerBrowserSchema = z.object({
  posMode: z.enum(['full_service', 'quick_service', 'bar', 'retail', 'services', 'bookings', 'standard']),
  hardwareInfo: z.object({
    platform: z.string(),
    osVersion: z.string().nullable().optional(),
    appVersion: z.string().nullable().optional(),
    screenSize: z.string().nullable().optional(),
    serialNumber: z.string().nullable().optional(),
  }).optional(),
});

const updateDeviceSchema = z.object({
  deviceName: z.string().min(1).max(100).optional(),
  posMode: z.enum(['full_service', 'quick_service', 'bar', 'retail', 'services', 'bookings', 'standard']).optional(),
  modeId: z.string().uuid().nullable().optional(),
  status: z.enum(['pending', 'active', 'revoked']).optional(),
  locationId: z.string().uuid().nullable().optional(),
  teamMemberId: z.string().uuid().nullable().optional(),
});

// === Routes ===

// List all devices for a restaurant
router.get('/:restaurantId/devices', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { status, type } = req.query;

    // Clean up expired pending devices
    await prisma.device.deleteMany({
      where: {
        restaurantId,
        status: 'pending',
        expiresAt: { lt: new Date() },
      },
    });

    const devices = await prisma.device.findMany({
      where: {
        restaurantId,
        ...(status && { status: status as string }),
        ...(type && { deviceType: type as string }),
      },
      include: { mode: true, teamMember: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const thirtySecondsAgo = new Date(Date.now() - HEARTBEAT_THRESHOLD_MS);
    const devicesWithStatus = devices.map(device => ({
      ...device,
      isOnline: device.lastSeenAt ? device.lastSeenAt > thirtySecondsAgo : false,
    }));

    res.json(devicesWithStatus);
  } catch (error) {
    handlePrismaError(error, res, {}, 'Failed to fetch devices');
  }
});

// Create a new device with pairing code
router.post('/:restaurantId/devices', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = createDeviceSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { deviceName, deviceType, posMode, modeId, locationId, teamMemberId } = parsed.data;
    const deviceCode = await generateDeviceCode(prisma);

    const device = await prisma.device.create({
      data: {
        restaurantId,
        deviceCode,
        deviceName,
        deviceType,
        posMode: posMode ?? null,
        modeId: modeId ?? null,
        locationId: locationId ?? null,
        teamMemberId: teamMemberId ?? null,
        status: 'pending',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
    });

    res.status(201).json(device);
  } catch (error) {
    handlePrismaError(error, res, {
      P2003: { status: 400, message: 'Invalid restaurant, mode, or location ID' },
    }, 'Failed to create device');
  }
});

// Register current browser as a device (no pairing code needed)
router.post('/:restaurantId/devices/register-browser', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = registerBrowserSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { posMode, hardwareInfo } = parsed.data;

    // Reuse an existing active Browser device for this restaurant if one exists
    const existing = await prisma.device.findFirst({
      where: { restaurantId, deviceName: 'Browser', deviceType: 'terminal', status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      const updated = await prisma.device.update({
        where: { id: existing.id },
        data: {
          posMode,
          lastSeenAt: new Date(),
          hardwareInfo: hardwareInfo ?? existing.hardwareInfo,
        },
      });
      res.status(200).json(updated);
      return;
    }

    const device = await prisma.device.create({
      data: {
        restaurantId,
        deviceName: 'Browser',
        deviceType: 'terminal',
        posMode,
        status: 'active',
        pairedAt: new Date(),
        hardwareInfo: hardwareInfo ?? { platform: 'Browser' },
      },
    });

    res.status(201).json(device);
  } catch (error) {
    handlePrismaError(error, res, {
      P2003: { status: 400, message: 'Invalid restaurant ID' },
    }, 'Failed to register browser device');
  }
});

// Get a single device by UUID
router.get('/:restaurantId/devices/:id', async (req: Request, res: Response) => {
  try {
    const { restaurantId, id } = req.params;

    const device = await prisma.device.findFirst({
      where: { id, restaurantId },
      include: { mode: true, teamMember: { select: { id: true, displayName: true } } },
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

// Update device
router.patch('/:restaurantId/devices/:id', async (req: Request, res: Response) => {
  try {
    const { restaurantId, id } = req.params;
    const parsed = updateDeviceSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const existing = await prisma.device.findFirst({
      where: { id, restaurantId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    const device = await prisma.device.update({
      where: { id },
      data: parsed.data,
    });

    res.json(device);
  } catch (error) {
    handlePrismaError(error, res, {
      P2025: { status: 404, message: 'Device not found' },
    }, 'Failed to update device');
  }
});

// Delete device
router.delete('/:restaurantId/devices/:id', async (req: Request, res: Response) => {
  try {
    const { restaurantId, id } = req.params;

    const existing = await prisma.device.findFirst({
      where: { id, restaurantId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    await prisma.device.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    handlePrismaError(error, res, {
      P2025: { status: 404, message: 'Device not found' },
    }, 'Failed to delete device');
  }
});

// Device heartbeat
router.post('/:restaurantId/devices/:id/heartbeat', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const device = await prisma.device.update({
      where: { id },
      data: { lastSeenAt: new Date() },
    });

    res.json({ success: true, lastSeenAt: device.lastSeenAt });
  } catch (error) {
    handlePrismaError(error, res, {
      P2025: { status: 404, message: 'Device not found' },
    }, 'Failed to update heartbeat');
  }
});

export default router;
