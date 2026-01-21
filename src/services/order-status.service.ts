import { PrismaClient, Order } from '@prisma/client';

const prisma = new PrismaClient();

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type CancelledBy = 'customer' | 'restaurant' | 'system';

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: []
};

const STATUS_TIMESTAMP_FIELD: Record<OrderStatus, string | null> = {
  pending: null,
  confirmed: 'confirmedAt',
  preparing: 'preparingAt',
  ready: 'readyAt',
  completed: 'completedAt',
  cancelled: 'cancelledAt'
};

export interface StatusUpdateResult {
  success: boolean;
  order?: Order;
  error?: string;
}

export interface StatusUpdateOptions {
  changedBy?: string;
  note?: string;
  cancellationReason?: string;
  cancelledBy?: CancelledBy;
}

export function isValidTransition(fromStatus: OrderStatus, toStatus: OrderStatus): boolean {
  return VALID_TRANSITIONS[fromStatus]?.includes(toStatus) ?? false;
}

export function getValidNextStatuses(currentStatus: OrderStatus): OrderStatus[] {
  return VALID_TRANSITIONS[currentStatus] || [];
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  options: StatusUpdateOptions = {}
): Promise<StatusUpdateResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId }
  });

  if (!order) {
    return { success: false, error: 'Order not found' };
  }

  const currentStatus = order.status as OrderStatus;

  if (!isValidTransition(currentStatus, newStatus)) {
    const validOptions = getValidNextStatuses(currentStatus);
    return {
      success: false,
      error: `Cannot transition from '${currentStatus}' to '${newStatus}'. Valid transitions: ${validOptions.length ? validOptions.join(', ') : 'none'}`
    };
  }

  if (newStatus === 'cancelled' && !options.cancelledBy) {
    return { success: false, error: 'cancelledBy is required when cancelling an order' };
  }

  const timestampField = STATUS_TIMESTAMP_FIELD[newStatus];
  const updateData: Record<string, unknown> = {
    status: newStatus
  };

  if (timestampField) {
    updateData[timestampField] = new Date();
  }

  if (newStatus === 'cancelled') {
    updateData.cancellationReason = options.cancellationReason || null;
    updateData.cancelledBy = options.cancelledBy;
  }

  const [updatedOrder] = await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: updateData
    }),
    prisma.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: currentStatus,
        toStatus: newStatus,
        changedBy: options.changedBy || null,
        note: options.note || null
      }
    })
  ]);

  return { success: true, order: updatedOrder };
}

export async function getOrderStatusHistory(orderId: string) {
  return prisma.orderStatusHistory.findMany({
    where: { orderId },
    orderBy: { createdAt: 'asc' }
  });
}
