import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { broadcastToSourceAndKDS } from '../services/socket.service';
import { enrichOrderResponse } from '../utils/order-enrichment';
import { updateOrderStatus } from '../services/order-status.service';

const router = Router({ mergeParams: true });
const prisma = new PrismaClient();

const DELIVERY_TRANSITIONS: Record<string, string[]> = {
  'PREPARING': ['OUT_FOR_DELIVERY'],
  'OUT_FOR_DELIVERY': ['DELIVERED'],
  'DELIVERED': [],
};

const ORDER_INCLUDE = {
  orderItems: { include: { modifiers: true } },
  customer: true,
  table: true,
} as const;

// PATCH /:orderId/delivery-status
router.patch('/:orderId/delivery-status', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { deliveryStatus } = req.body;

    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order || order.orderType !== 'delivery') {
      res.status(404).json({ error: 'Delivery order not found' });
      return;
    }

    const currentStatus = order.deliveryStatus ?? 'PREPARING';
    const allowed = DELIVERY_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(deliveryStatus)) {
      res.status(409).json({
        error: `Invalid transition from ${currentStatus} to ${deliveryStatus}. Allowed: ${allowed.join(', ') || 'none (terminal state)'}`,
      });
      return;
    }

    const updateData: Record<string, any> = { deliveryStatus };
    if (deliveryStatus === 'OUT_FOR_DELIVERY') {
      updateData.dispatchedAt = new Date();
    } else if (deliveryStatus === 'DELIVERED') {
      updateData.deliveredAt = new Date();
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: updateData,
      include: ORDER_INCLUDE,
    });

    const enriched = enrichOrderResponse(updated);
    broadcastToSourceAndKDS(updated.restaurantId, updated.sourceDeviceId, 'order:updated', enriched);

    res.json(enriched);
  } catch (error: unknown) {
    console.error('[Order Actions] Error updating delivery status:', error);
    res.status(500).json({ error: 'Failed to update delivery status' });
  }
});

// PATCH /:orderId/approval
router.patch('/:orderId/approval', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status, approvedBy } = req.body;

    if (status !== 'APPROVED' && status !== 'NOT_APPROVED') {
      res.status(400).json({ error: 'Status must be APPROVED or NOT_APPROVED' });
      return;
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order || order.approvalStatus === null) {
      res.status(404).json({ error: 'Order requiring approval not found' });
      return;
    }

    if (order.approvalStatus !== 'NEEDS_APPROVAL') {
      res.status(409).json({ error: `Order already ${order.approvalStatus.toLowerCase()}` });
      return;
    }

    // Update approval status
    await prisma.order.update({
      where: { id: orderId },
      data: {
        approvalStatus: status,
        approvedBy: approvedBy ?? null,
        approvedAt: new Date(),
      },
    });

    // Auto-confirm on approval, auto-cancel on rejection
    if (status === 'APPROVED') {
      await updateOrderStatus(orderId, 'confirmed', { changedBy: approvedBy, note: 'Auto-confirmed on catering approval' });
    } else {
      await updateOrderStatus(orderId, 'cancelled', { changedBy: approvedBy, note: 'Auto-cancelled on catering rejection', cancellationReason: 'Catering order rejected' });
    }

    const updated = await prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });

    if (updated) {
      const enriched = enrichOrderResponse(updated);
      broadcastToSourceAndKDS(updated.restaurantId, updated.sourceDeviceId, 'order:updated', enriched);
      res.json(enriched);
    } else {
      res.status(500).json({ error: 'Failed to fetch updated order' });
    }
  } catch (error: unknown) {
    console.error('[Order Actions] Error updating approval:', error);
    res.status(500).json({ error: 'Failed to update approval status' });
  }
});

// PATCH /:orderId/arrival
router.patch('/:orderId/arrival', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order || !order.vehicleDescription) {
      res.status(404).json({ error: 'Curbside order not found' });
      return;
    }

    if (order.arrivalNotified) {
      res.status(409).json({ error: 'Arrival already notified' });
      return;
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { arrivalNotified: true },
      include: ORDER_INCLUDE,
    });

    const enriched = enrichOrderResponse(updated);
    broadcastToSourceAndKDS(updated.restaurantId, updated.sourceDeviceId, 'order:updated', enriched);

    res.json(enriched);
  } catch (error: unknown) {
    console.error('[Order Actions] Error notifying arrival:', error);
    res.status(500).json({ error: 'Failed to notify arrival' });
  }
});

export default router;
