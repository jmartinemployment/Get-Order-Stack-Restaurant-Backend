import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Store connected sockets by restaurant
const restaurantSockets: Map<string, Set<string>> = new Map();
// Store socket info
const socketInfo: Map<string, { restaurantId: string; deviceId: string; deviceType: string }> = new Map();

let io: Server | null = null;

export function initializeSocketServer(httpServer: HttpServer, corsOrigins: any): Server {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow all origins that our CORS config allows
        if (!origin) {
          callback(null, true);
          return;
        }
        if (origin.endsWith('.exp.direct') || origin.includes('vercel.app') || origin.includes('localhost')) {
          callback(null, true);
          return;
        }
        callback(null, true); // Be permissive for now
      },
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    // Handle device joining a restaurant room
    socket.on('join-restaurant', async (data: { restaurantId: string; deviceId: string; deviceType: string }) => {
      const { restaurantId, deviceId, deviceType } = data;

      if (!restaurantId || !deviceId) {
        socket.emit('error', { message: 'restaurantId and deviceId are required' });
        return;
      }

      // Join the restaurant room
      socket.join(`restaurant:${restaurantId}`);

      // Track this socket
      if (!restaurantSockets.has(restaurantId)) {
        restaurantSockets.set(restaurantId, new Set());
      }
      restaurantSockets.get(restaurantId)!.add(socket.id);
      socketInfo.set(socket.id, { restaurantId, deviceId, deviceType });

      // Update device status in database
      try {
        await prisma.device.updateMany({
          where: { deviceId },
          data: { lastSeenAt: new Date() }
        });
      } catch (err) {
        console.error('[Socket.io] Error updating device status:', err);
      }

      console.log(`[Socket.io] Device ${deviceType}:${deviceId} joined restaurant ${restaurantId}`);

      // Notify other devices in the room
      socket.to(`restaurant:${restaurantId}`).emit('device-connected', {
        deviceId,
        deviceType,
        timestamp: new Date().toISOString()
      });

      // Confirm join
      socket.emit('joined-restaurant', {
        restaurantId,
        connectedDevices: restaurantSockets.get(restaurantId)?.size || 0
      });
    });

    // Handle device leaving
    socket.on('leave-restaurant', async (data: { restaurantId: string; deviceId: string }) => {
      const { restaurantId, deviceId } = data;

      socket.leave(`restaurant:${restaurantId}`);

      // Remove from tracking
      restaurantSockets.get(restaurantId)?.delete(socket.id);
      socketInfo.delete(socket.id);

      // Update device status
      try {
        await prisma.device.updateMany({
          where: { deviceId },
          data: { lastSeenAt: new Date() }
        });
      } catch (err) {
        console.error('[Socket.io] Error updating device status:', err);
      }

      console.log(`[Socket.io] Device ${deviceId} left restaurant ${restaurantId}`);
    });

    // Handle heartbeat
    socket.on('heartbeat', async (data: { deviceId: string }) => {
      try {
        await prisma.device.updateMany({
          where: { deviceId: data.deviceId },
          data: { lastSeenAt: new Date() }
        });
      } catch (err) {
        // Ignore heartbeat errors
      }
    });

    // Handle disconnect
    socket.on('disconnect', async (reason) => {
      const info = socketInfo.get(socket.id);
      if (info) {
        restaurantSockets.get(info.restaurantId)?.delete(socket.id);
        socketInfo.delete(socket.id);

        // Update device last seen
        try {
          await prisma.device.updateMany({
            where: { deviceId: info.deviceId },
            data: { lastSeenAt: new Date() }
          });
        } catch (err) {
          // Ignore
        }

        // Notify other devices
        io?.to(`restaurant:${info.restaurantId}`).emit('device-disconnected', {
          deviceId: info.deviceId,
          deviceType: info.deviceType,
          timestamp: new Date().toISOString()
        });

        console.log(`[Socket.io] Device ${info.deviceType}:${info.deviceId} disconnected (${reason})`);
      } else {
        console.log(`[Socket.io] Client disconnected: ${socket.id} (${reason})`);
      }
    });
  });

  console.log('[Socket.io] WebSocket server initialized');
  return io;
}

// Broadcast an order event to all devices in a restaurant
export function broadcastOrderEvent(restaurantId: string, eventType: string, order: any) {
  if (!io) {
    console.warn('[Socket.io] Server not initialized, cannot broadcast');
    return;
  }

  const room = `restaurant:${restaurantId}`;
  const connectedCount = restaurantSockets.get(restaurantId)?.size || 0;

  console.log(`[Socket.io] Broadcasting ${eventType} to ${connectedCount} devices in restaurant ${restaurantId}`);

  io.to(room).emit(eventType, {
    order,
    timestamp: new Date().toISOString()
  });
}

// Send an order event to a specific device only
export function sendOrderEventToDevice(restaurantId: string, targetDeviceId: string, eventType: string, order: any) {
  if (!io) {
    console.warn('[Socket.io] Server not initialized, cannot send');
    return false;
  }

  // Find the socket ID for the target device
  const sockets = restaurantSockets.get(restaurantId);
  if (!sockets) {
    console.log(`[Socket.io] No sockets found for restaurant ${restaurantId}`);
    return false;
  }

  let targetSocketId: string | null = null;
  for (const socketId of sockets) {
    const info = socketInfo.get(socketId);
    if (info && info.deviceId === targetDeviceId) {
      targetSocketId = socketId;
      break;
    }
  }

  if (!targetSocketId) {
    console.log(`[Socket.io] Device ${targetDeviceId} not found in restaurant ${restaurantId}`);
    return false;
  }

  console.log(`[Socket.io] Sending ${eventType} to device ${targetDeviceId} (socket ${targetSocketId})`);

  io.to(targetSocketId).emit(eventType, {
    order,
    timestamp: new Date().toISOString()
  });

  return true;
}

// Broadcast to all devices EXCEPT a specific one (useful for new orders - notify KDS but not source)
export function broadcastOrderEventExcept(restaurantId: string, excludeDeviceId: string, eventType: string, order: any) {
  if (!io) {
    console.warn('[Socket.io] Server not initialized, cannot broadcast');
    return;
  }

  const sockets = restaurantSockets.get(restaurantId);
  if (!sockets) return;

  let sentCount = 0;
  for (const socketId of sockets) {
    const info = socketInfo.get(socketId);
    if (info && info.deviceId !== excludeDeviceId) {
      io.to(socketId).emit(eventType, {
        order,
        timestamp: new Date().toISOString()
      });
      sentCount++;
    }
  }

  console.log(`[Socket.io] Broadcast ${eventType} to ${sentCount} devices (excluding ${excludeDeviceId})`);
}

// Get count of connected devices for a restaurant
export function getConnectedDeviceCount(restaurantId: string): number {
  return restaurantSockets.get(restaurantId)?.size || 0;
}

// Get all connected device info for a restaurant
export function getConnectedDevices(restaurantId: string): Array<{ deviceId: string; deviceType: string }> {
  const sockets = restaurantSockets.get(restaurantId);
  if (!sockets) return [];

  return Array.from(sockets)
    .map(socketId => socketInfo.get(socketId))
    .filter((info): info is { restaurantId: string; deviceId: string; deviceType: string } => !!info)
    .map(({ deviceId, deviceType }) => ({ deviceId, deviceType }));
}

export { io };
