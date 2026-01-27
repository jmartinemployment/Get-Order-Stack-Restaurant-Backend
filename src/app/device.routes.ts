import { Router, Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ============ Device Registration ============

// Register a new device or update existing
router.post('/:restaurantId/devices/register', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { deviceId, deviceName, deviceType, platform, appVersion, pushToken } = req.body;

    if (!deviceId || !deviceType) {
      res.status(400).json({ error: 'deviceId and deviceType are required' });
      return;
    }

    // Verify restaurant exists
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId }
    });

    if (!restaurant) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    // Upsert device - create or update if exists
    const device = await prisma.device.upsert({
      where: { deviceId },
      create: {
        restaurantId,
        deviceId,
        deviceName: deviceName || `${deviceType.toUpperCase()}-${deviceId.slice(-6)}`,
        deviceType,
        isActive: true,
        lastSeenAt: new Date()
      },
      update: {
        restaurantId, // Allow device to switch restaurants
        deviceName: deviceName || undefined,
        isActive: true,
        lastSeenAt: new Date()
      }
    });

    console.log(`[Device] Registered ${deviceType} device: ${deviceId} for restaurant ${restaurantId}`);

    res.status(201).json({
      success: true,
      device: {
        id: device.id,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        restaurantId: device.restaurantId
      }
    });
  } catch (error) {
    console.error('Error registering device:', error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        res.status(409).json({ error: 'Device ID conflict - device may already be registered' });
        return;
      }
      if (error.code === 'P2003') {
        res.status(400).json({ error: 'Invalid restaurant ID' });
        return;
      }
    }

    res.status(500).json({ error: 'Failed to register device' });
  }
});

// Device heartbeat - update last seen timestamp
router.post('/:restaurantId/devices/:deviceId/heartbeat', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;

    const device = await prisma.device.update({
      where: { deviceId },
      data: {
        lastSeenAt: new Date(),
        isActive: true
      }
    });

    res.json({ success: true, lastSeenAt: device.lastSeenAt });
  } catch (error) {
    console.error('Error updating device heartbeat:', error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        res.status(404).json({ error: 'Device not found' });
        return;
      }
    }

    res.status(500).json({ error: 'Failed to update heartbeat' });
  }
});

// Get all devices for a restaurant
router.get('/:restaurantId/devices', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { type, online } = req.query;

    const devices = await prisma.device.findMany({
      where: {
        restaurantId,
        isActive: true,
        ...(type && { deviceType: type as string }),
        ...(online === 'true' && { isOnline: true })
      },
      orderBy: { lastSeenAt: 'desc' }
    });

    // Mark devices as offline if no heartbeat in 30 seconds
    const thirtySecondsAgo = new Date(Date.now() - 30000);
    const devicesWithStatus = devices.map(device => ({
      ...device,
      isOnline: device.lastSeenAt ? device.lastSeenAt > thirtySecondsAgo : false
    }));

    res.json(devicesWithStatus);
  } catch (error) {
    console.error('Error fetching devices:', error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      res.status(400).json({ error: 'Invalid query parameters' });
      return;
    }

    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// Update device info
router.patch('/:restaurantId/devices/:deviceId', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { deviceName, pushToken, isActive } = req.body;

    const device = await prisma.device.update({
      where: { deviceId },
      data: {
        ...(deviceName !== undefined && { deviceName }),
        ...(pushToken !== undefined && { pushToken }),
        ...(isActive !== undefined && { isActive })
      }
    });

    res.json(device);
  } catch (error) {
    console.error('Error updating device:', error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        res.status(404).json({ error: 'Device not found' });
        return;
      }
    }

    res.status(500).json({ error: 'Failed to update device' });
  }
});

// Disconnect/deactivate a device
router.post('/:restaurantId/devices/:deviceId/disconnect', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;

    const device = await prisma.device.update({
      where: { deviceId },
      data: {
        isActive: false
      }
    });

    res.json({ success: true, message: 'Device disconnected' });
  } catch (error) {
    console.error('Error disconnecting device:', error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        res.status(404).json({ error: 'Device not found' });
        return;
      }
    }

    res.status(500).json({ error: 'Failed to disconnect device' });
  }
});

// Delete a device registration
router.delete('/:restaurantId/devices/:deviceId', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;

    await prisma.device.delete({
      where: { deviceId }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting device:', error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        res.status(404).json({ error: 'Device not found' });
        return;
      }
    }

    res.status(500).json({ error: 'Failed to delete device' });
  }
});

export default router;
