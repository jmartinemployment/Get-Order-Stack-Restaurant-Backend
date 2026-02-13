import { PrismaClient } from '@prisma/client';

export type OrderThrottleState = 'NONE' | 'HELD' | 'RELEASED';
export type OrderThrottleSource = 'AUTO' | 'MANUAL';
export type OrderThrottleReason =
  | 'ACTIVE_OVERLOAD'
  | 'OVERDUE_OVERLOAD'
  | 'MANUAL_HOLD';
export type OrderThrottleReleaseReason =
  | 'LOAD_RECOVERED'
  | 'MAX_HOLD_TIMEOUT'
  | 'MANUAL_RELEASE';

export interface OrderThrottlingSettings {
  orderThrottlingEnabled: boolean;
  maxActiveOrders: number;
  maxOverdueOrders: number;
  releaseActiveOrders: number;
  releaseOverdueOrders: number;
  maxHoldMinutes: number;
  allowRushThrottle: boolean;
}

export interface KitchenLoadSnapshot {
  activeOrders: number;
  overdueOrders: number;
  heldOrders: number;
}

export interface OrderThrottlingStatus {
  enabled: boolean;
  triggering: boolean;
  triggerReason?: 'ACTIVE_OVERLOAD' | 'OVERDUE_OVERLOAD';
  activeOrders: number;
  overdueOrders: number;
  heldOrders: number;
  thresholds: {
    maxActiveOrders: number;
    maxOverdueOrders: number;
    releaseActiveOrders: number;
    releaseOverdueOrders: number;
    maxHoldMinutes: number;
  };
  evaluatedAt: string;
}

export interface ThrottleEvaluationResult {
  releasedOrderIds: string[];
}

const DEFAULT_SETTINGS: OrderThrottlingSettings = {
  orderThrottlingEnabled: false,
  maxActiveOrders: 18,
  maxOverdueOrders: 6,
  releaseActiveOrders: 14,
  releaseOverdueOrders: 3,
  maxHoldMinutes: 20,
  allowRushThrottle: false,
};

const ACTIVE_ORDER_STATUSES: string[] = ['pending', 'confirmed', 'preparing'];
const OVERDUE_ORDER_AGE_MINUTES = 25;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asRoundedNumber(raw: unknown, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(parsed);
}

class OrderThrottlingService {
  private readonly prisma = new PrismaClient();

  async getStatus(restaurantId: string): Promise<OrderThrottlingStatus> {
    const settings = await this.getSettings(restaurantId);
    const load = await this.getKitchenLoad(restaurantId);
    const triggerReason = this.getTriggerReason(load, settings);

    return {
      enabled: settings.orderThrottlingEnabled,
      triggering: Boolean(triggerReason),
      triggerReason: triggerReason ?? undefined,
      activeOrders: load.activeOrders,
      overdueOrders: load.overdueOrders,
      heldOrders: load.heldOrders,
      thresholds: {
        maxActiveOrders: settings.maxActiveOrders,
        maxOverdueOrders: settings.maxOverdueOrders,
        releaseActiveOrders: settings.releaseActiveOrders,
        releaseOverdueOrders: settings.releaseOverdueOrders,
        maxHoldMinutes: settings.maxHoldMinutes,
      },
      evaluatedAt: new Date().toISOString(),
    };
  }

  async applyAutoThrottleForNewOrder(
    restaurantId: string,
    orderId: string,
    options?: { isRush?: boolean }
  ): Promise<boolean> {
    const settings = await this.getSettings(restaurantId);
    if (!settings.orderThrottlingEnabled) return false;

    const isRush = options?.isRush ?? false;
    if (isRush && !settings.allowRushThrottle) return false;

    const load = await this.getKitchenLoad(restaurantId);
    const triggerReason = this.getTriggerReason(load, settings);
    if (!triggerReason) return false;

    return this.holdOrder(orderId, triggerReason, 'AUTO');
  }

  async holdOrderManually(restaurantId: string, orderId: string): Promise<boolean> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      select: { id: true },
    });
    if (!order) return false;

    return this.holdOrder(orderId, 'MANUAL_HOLD', 'MANUAL');
  }

  async releaseOrderManually(restaurantId: string, orderId: string): Promise<boolean> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      select: { id: true },
    });
    if (!order) return false;

    return this.releaseOrder(orderId, 'MANUAL_RELEASE', 'MANUAL');
  }

  async evaluateAndRelease(restaurantId: string): Promise<ThrottleEvaluationResult> {
    const settings = await this.getSettings(restaurantId);
    if (!settings.orderThrottlingEnabled) {
      const heldOrders = await this.prisma.order.findMany({
        where: {
          restaurantId,
          throttleState: 'HELD',
          status: { in: ACTIVE_ORDER_STATUSES },
        },
        select: { id: true },
      });

      const releasedOrderIds: string[] = [];
      for (const held of heldOrders) {
        const released = await this.releaseOrder(held.id, 'LOAD_RECOVERED', 'AUTO');
        if (released) releasedOrderIds.push(held.id);
      }
      return { releasedOrderIds };
    }

    const releasedOrderIds: string[] = [];
    const now = Date.now();
    const maxHoldCutoff = new Date(now - settings.maxHoldMinutes * 60 * 1000);

    // Safety release for tickets held too long.
    const staleHeldOrders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        throttleState: 'HELD',
        status: { in: ACTIVE_ORDER_STATUSES },
        throttleHeldAt: { lte: maxHoldCutoff },
      },
      select: { id: true },
      orderBy: { throttleHeldAt: 'asc' },
    });

    for (const held of staleHeldOrders) {
      const released = await this.releaseOrder(held.id, 'MAX_HOLD_TIMEOUT', 'AUTO');
      if (released) releasedOrderIds.push(held.id);
    }

    // Release one additional held ticket when kitchen load has recovered.
    const load = await this.getKitchenLoad(restaurantId);
    const recovered =
      load.activeOrders <= settings.releaseActiveOrders
      && load.overdueOrders <= settings.releaseOverdueOrders;

    if (recovered) {
      const nextHeld = await this.prisma.order.findFirst({
        where: {
          restaurantId,
          throttleState: 'HELD',
          status: { in: ACTIVE_ORDER_STATUSES },
        },
        select: { id: true },
        orderBy: { throttleHeldAt: 'asc' },
      });

      if (nextHeld) {
        const released = await this.releaseOrder(nextHeld.id, 'LOAD_RECOVERED', 'AUTO');
        if (released) releasedOrderIds.push(nextHeld.id);
      }
    }

    return { releasedOrderIds };
  }

  private async holdOrder(
    orderId: string,
    reason: OrderThrottleReason,
    source: OrderThrottleSource
  ): Promise<boolean> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        throttleState: true,
      },
    });

    if (!order) return false;
    if (order.status === 'completed' || order.status === 'cancelled') return false;
    if (order.throttleState === 'HELD') return true;

    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: {
          throttleState: 'HELD',
          throttleReason: reason,
          throttleHeldAt: now,
          throttleReleasedAt: null,
          throttleSource: source,
          throttleReleaseReason: null,
        },
      }),
      this.prisma.orderItem.updateMany({
        where: {
          orderId,
          courseGuid: null,
        },
        data: {
          status: 'pending',
          fulfillmentStatus: 'HOLD',
          sentToKitchenAt: null,
          completedAt: null,
        },
      }),
      this.prisma.orderItem.updateMany({
        where: {
          orderId,
          courseGuid: { not: null },
        },
        data: {
          status: 'pending',
          fulfillmentStatus: 'HOLD',
          courseFireStatus: 'PENDING',
          courseFiredAt: null,
          courseReadyAt: null,
          sentToKitchenAt: null,
          completedAt: null,
        },
      }),
    ]);

    return true;
  }

  private async releaseOrder(
    orderId: string,
    reason: OrderThrottleReleaseReason,
    source: OrderThrottleSource
  ): Promise<boolean> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        throttleState: true,
      },
    });

    if (!order) return false;
    if (order.status === 'completed' || order.status === 'cancelled') return false;
    if (order.throttleState !== 'HELD') return false;

    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
      select: {
        id: true,
        courseGuid: true,
        courseSortOrder: true,
      },
    });

    const nonCourseItemIds: string[] = [];
    const courseItems: Array<{ id: string; sortOrder: number }> = [];

    for (const item of items) {
      if (!item.courseGuid) {
        nonCourseItemIds.push(item.id);
      } else {
        courseItems.push({
          id: item.id,
          sortOrder: Number.isFinite(Number(item.courseSortOrder))
            ? Number(item.courseSortOrder)
            : 0,
        });
      }
    }

    let firstCourseSortOrder: number | null = null;
    for (const item of courseItems) {
      if (firstCourseSortOrder === null || item.sortOrder < firstCourseSortOrder) {
        firstCourseSortOrder = item.sortOrder;
      }
    }

    const firstCourseIds = firstCourseSortOrder === null
      ? []
      : courseItems
          .filter(item => item.sortOrder === firstCourseSortOrder)
          .map(item => item.id);
    const laterCourseIds = firstCourseSortOrder === null
      ? []
      : courseItems
          .filter(item => item.sortOrder !== firstCourseSortOrder)
          .map(item => item.id);

    const now = new Date();
    await this.prisma.$transaction(async tx => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          throttleState: 'RELEASED',
          throttleReleasedAt: now,
          throttleReleaseReason: reason,
          throttleSource: source,
        },
      });

      if (nonCourseItemIds.length > 0) {
        await tx.orderItem.updateMany({
          where: { id: { in: nonCourseItemIds } },
          data: {
            status: 'pending',
            fulfillmentStatus: 'SENT',
            sentToKitchenAt: now,
            completedAt: null,
          },
        });
      }

      if (firstCourseIds.length > 0) {
        await tx.orderItem.updateMany({
          where: { id: { in: firstCourseIds } },
          data: {
            status: 'pending',
            fulfillmentStatus: 'SENT',
            courseFireStatus: 'FIRED',
            courseFiredAt: now,
            courseReadyAt: null,
            sentToKitchenAt: now,
            completedAt: null,
          },
        });
      }

      if (laterCourseIds.length > 0) {
        await tx.orderItem.updateMany({
          where: { id: { in: laterCourseIds } },
          data: {
            status: 'pending',
            fulfillmentStatus: 'HOLD',
            courseFireStatus: 'PENDING',
            courseFiredAt: null,
            courseReadyAt: null,
            sentToKitchenAt: null,
            completedAt: null,
          },
        });
      }
    });
    return true;
  }

  private async getKitchenLoad(restaurantId: string): Promise<KitchenLoadSnapshot> {
    const overdueCutoff = new Date(Date.now() - OVERDUE_ORDER_AGE_MINUTES * 60 * 1000);

    const [activeOrders, overdueOrders, heldOrders] = await this.prisma.$transaction([
      this.prisma.order.count({
        where: {
          restaurantId,
          status: { in: ACTIVE_ORDER_STATUSES },
          throttleState: { not: 'HELD' },
        },
      }),
      this.prisma.order.count({
        where: {
          restaurantId,
          status: { in: ACTIVE_ORDER_STATUSES },
          throttleState: { not: 'HELD' },
          createdAt: { lte: overdueCutoff },
        },
      }),
      this.prisma.order.count({
        where: {
          restaurantId,
          status: { in: ACTIVE_ORDER_STATUSES },
          throttleState: 'HELD',
        },
      }),
    ]);

    return {
      activeOrders,
      overdueOrders,
      heldOrders,
    };
  }

  private getTriggerReason(
    load: KitchenLoadSnapshot,
    settings: OrderThrottlingSettings
  ): 'ACTIVE_OVERLOAD' | 'OVERDUE_OVERLOAD' | null {
    if (!settings.orderThrottlingEnabled) return null;
    if (load.activeOrders >= settings.maxActiveOrders) return 'ACTIVE_OVERLOAD';
    if (load.overdueOrders >= settings.maxOverdueOrders) return 'OVERDUE_OVERLOAD';
    return null;
  }

  private async getSettings(restaurantId: string): Promise<OrderThrottlingSettings> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { aiSettings: true },
    });

    return this.normalizeSettings((restaurant?.aiSettings ?? null) as Record<string, unknown> | null);
  }

  private normalizeSettings(raw: Record<string, unknown> | null): OrderThrottlingSettings {
    const merged: OrderThrottlingSettings = {
      ...DEFAULT_SETTINGS,
      orderThrottlingEnabled: Boolean(raw?.orderThrottlingEnabled ?? DEFAULT_SETTINGS.orderThrottlingEnabled),
      maxActiveOrders: clamp(asRoundedNumber(raw?.maxActiveOrders, DEFAULT_SETTINGS.maxActiveOrders), 2, 120),
      maxOverdueOrders: clamp(asRoundedNumber(raw?.maxOverdueOrders, DEFAULT_SETTINGS.maxOverdueOrders), 1, 50),
      releaseActiveOrders: clamp(asRoundedNumber(raw?.releaseActiveOrders, DEFAULT_SETTINGS.releaseActiveOrders), 0, 119),
      releaseOverdueOrders: clamp(asRoundedNumber(raw?.releaseOverdueOrders, DEFAULT_SETTINGS.releaseOverdueOrders), 0, 49),
      maxHoldMinutes: clamp(asRoundedNumber(raw?.maxHoldMinutes, DEFAULT_SETTINGS.maxHoldMinutes), 1, 180),
      allowRushThrottle: Boolean(raw?.allowRushThrottle ?? DEFAULT_SETTINGS.allowRushThrottle),
    };

    if (merged.releaseActiveOrders >= merged.maxActiveOrders) {
      merged.releaseActiveOrders = Math.max(0, merged.maxActiveOrders - 1);
    }
    if (merged.releaseOverdueOrders >= merged.maxOverdueOrders) {
      merged.releaseOverdueOrders = Math.max(0, merged.maxOverdueOrders - 1);
    }

    return merged;
  }
}

export const orderThrottlingService = new OrderThrottlingService();
