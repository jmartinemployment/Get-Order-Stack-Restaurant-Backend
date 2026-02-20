/**
 * Enriches a raw Prisma Order object with nested dining-specific objects
 * (deliveryInfo, curbsideInfo, cateringInfo) built from flat DB columns.
 *
 * Applied to all order responses (REST + WebSocket broadcasts) so the
 * frontend receives the nested structure its models expect.
 */

type CourseFireStatus = 'PENDING' | 'FIRED' | 'READY';
type FulfillmentStatus = 'NEW' | 'HOLD' | 'SENT' | 'ON_THE_FLY';

/**
 * Maps granular DaaS dispatchStatus → 3-state deliveryState.
 * Self-delivery uses the existing deliveryStatus column directly.
 */
function toDeliveryState(dispatchStatus: string | null | undefined): 'PREPARING' | 'OUT_FOR_DELIVERY' | 'DELIVERED' {
  switch (dispatchStatus) {
    case 'PICKED_UP':
    case 'DRIVER_EN_ROUTE_TO_DROPOFF':
    case 'DRIVER_AT_DROPOFF':
      return 'OUT_FOR_DELIVERY';
    case 'DELIVERED':
      return 'DELIVERED';
    default:
      return 'PREPARING';
  }
}

function normalizeFulfillmentStatus(rawStatus: string | null | undefined, hasCourse: boolean): FulfillmentStatus {
  switch ((rawStatus ?? '').toUpperCase()) {
    case 'NEW':
      return 'NEW';
    case 'HOLD':
      return 'HOLD';
    case 'SENT':
      return 'SENT';
    case 'ON_THE_FLY':
      return 'ON_THE_FLY';
    // Backward compatibility with legacy order_item.status values.
    case 'PREPARING':
    case 'COMPLETED':
      return 'SENT';
    default:
      return hasCourse ? 'HOLD' : 'NEW';
  }
}

function normalizeCourseFireStatus(
  raw: string | null | undefined,
  fallback: FulfillmentStatus,
  itemStatus: string | null | undefined
): CourseFireStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'PENDING':
      return 'PENDING';
    case 'FIRED':
      return 'FIRED';
    case 'READY':
      return 'READY';
  }

  if ((itemStatus ?? '').toLowerCase() === 'completed') return 'READY';
  if (fallback === 'HOLD' || fallback === 'NEW') return 'PENDING';
  return 'FIRED';
}

function buildCourseSummaries(orderItems: any[]): any[] {
  const grouped = new Map<string, any[]>();

  for (const item of orderItems) {
    if (!item.courseGuid) continue;
    const existing = grouped.get(item.courseGuid);
    if (existing) {
      existing.push(item);
    } else {
      grouped.set(item.courseGuid, [item]);
    }
  }

  const courses = [...grouped.entries()].map(([courseGuid, items]) => {
    const first = items[0];
    const sortOrder = Number(first.courseSortOrder ?? 0);
    const firedDate = first.courseFiredAt ?? undefined;

    const allCompleted = items.every(i => (i.status ?? '').toLowerCase() === 'completed');
    const anyFired = items.some(i => {
      const fs = (i.fulfillmentStatus ?? '').toUpperCase();
      return fs === 'SENT' || fs === 'ON_THE_FLY';
    });

    const fireStatus: CourseFireStatus = allCompleted
      ? 'READY'
      : anyFired
        ? 'FIRED'
        : 'PENDING';

    const readyDate = fireStatus === 'READY'
      ? items
          .map(i => i.courseReadyAt ?? i.completedAt ?? null)
          .filter((d): d is Date => Boolean(d))
          .sort((a, b) => a.getTime() - b.getTime())
          .at(-1)
      : undefined;

    return {
      guid: courseGuid,
      name: first.courseName ?? courseGuid,
      sortOrder,
      fireStatus,
      firedDate,
      readyDate,
    };
  });

  return courses.sort((a, b) => a.sortOrder - b.sortOrder);
}

function buildChecksArray(order: any): any[] | undefined {
  if (Array.isArray(order.checks) && order.checks.length > 0) {
    return order.checks.map((check: any) => ({
      id: check.id,
      displayNumber: check.displayNumber,
      paymentStatus: check.paymentStatus,
      subtotal: Number(check.subtotal),
      tax: Number(check.tax),
      tip: Number(check.tip),
      total: Number(check.total),
      tabName: check.tabName ?? undefined,
      tabOpenedAt: check.tabOpenedAt ?? undefined,
      tabClosedAt: check.tabClosedAt ?? undefined,
      preauthId: check.preauthId ?? undefined,
      items: Array.isArray(check.items)
        ? check.items.map((item: any) => ({
            id: item.id,
            menuItemId: item.menuItemId,
            menuItemName: item.menuItemName,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            modifiersPrice: Number(item.modifiersPrice),
            totalPrice: Number(item.totalPrice),
            specialInstructions: item.specialInstructions ?? undefined,
            seatNumber: item.seatNumber ?? undefined,
            fulfillmentStatus: item.fulfillmentStatus,
            courseGuid: item.courseGuid ?? undefined,
            isComped: item.isComped,
            compReason: item.compReason ?? undefined,
            compBy: item.compBy ?? undefined,
            compApprovedBy: item.compApprovedBy ?? undefined,
            compAt: item.compAt ?? undefined,
            modifiers: Array.isArray(item.modifiers)
              ? item.modifiers.map((m: any) => ({
                  id: m.id,
                  modifierId: m.modifierId,
                  modifierName: m.modifierName,
                  priceAdjustment: Number(m.priceAdjustment),
                }))
              : [],
          }))
        : [],
      discounts: Array.isArray(check.discounts)
        ? check.discounts.map((d: any) => ({
            id: d.id,
            type: d.type,
            value: Number(d.value),
            reason: d.reason,
            appliedBy: d.appliedBy,
            approvedBy: d.approvedBy ?? undefined,
          }))
        : [],
      voidedSelections: Array.isArray(check.voidedItems)
        ? check.voidedItems.map((v: any) => ({
            id: v.id,
            checkItemId: v.checkItemId,
            menuItemName: v.menuItemName,
            quantity: v.quantity,
            unitPrice: Number(v.unitPrice),
            totalPrice: Number(v.totalPrice),
            voidReason: v.voidReason,
            voidedBy: v.voidedBy,
            managerApproval: v.managerApproval ?? undefined,
            voidedAt: v.voidedAt,
          }))
        : [],
    }));
  }

  // Backward compat: build a single virtual check from orderItems for SOS/kiosk/online orders
  if (Array.isArray(order.orderItems) && order.orderItems.length > 0 && (!order.checks || order.checks.length === 0)) {
    return undefined; // No checks — frontend handles orderItems directly
  }

  return undefined;
}

export function enrichOrderResponse(order: any): any {
  if (!order) return order;

  const enriched = { ...order };

  // Build course metadata + fulfillment fields from order items.
  if (Array.isArray(order.orderItems)) {
    enriched.orderItems = order.orderItems.map((item: any) => {
      const hasCourse = Boolean(item.courseGuid);
      const fulfillmentStatus = normalizeFulfillmentStatus(item.fulfillmentStatus ?? item.status, hasCourse);
      const courseFireStatus = hasCourse
        ? normalizeCourseFireStatus(item.courseFireStatus, fulfillmentStatus, item.status)
        : undefined;

      const course = hasCourse
        ? {
            guid: item.courseGuid,
            name: item.courseName ?? item.courseGuid,
            sortOrder: Number(item.courseSortOrder ?? 0),
            fireStatus: courseFireStatus,
            firedDate: item.courseFiredAt ?? undefined,
            readyDate: item.courseReadyAt ?? ((item.status ?? '').toLowerCase() === 'completed' ? item.completedAt ?? undefined : undefined),
          }
        : undefined;

      return {
        ...item,
        fulfillmentStatus,
        ...(course ? { course } : {}),
      };
    });

    const courses = buildCourseSummaries(enriched.orderItems);
    if (courses.length > 0) {
      enriched.courses = courses;
    }
  }

  // Build checks array for POS orders
  const checks = buildChecksArray(order);
  if (checks) {
    enriched.checks = checks;
  }

  enriched.throttle = {
    state: order.throttleState ?? 'NONE',
    reason: order.throttleReason ?? undefined,
    heldAt: order.throttleHeldAt ?? undefined,
    releasedAt: order.throttleReleasedAt ?? undefined,
    source: order.throttleSource ?? undefined,
    releaseReason: order.throttleReleaseReason ?? undefined,
  };

  // Build deliveryInfo from flat columns
  if (order.deliveryAddress || order.deliveryCity) {
    // If DaaS dispatchStatus exists, derive the 3-state deliveryState from it
    const derivedDeliveryState = order.dispatchStatus
      ? toDeliveryState(order.dispatchStatus)
      : (order.deliveryStatus ?? 'PREPARING');

    enriched.deliveryInfo = {
      address: order.deliveryAddress,
      address2: order.deliveryAddress2 ?? undefined,
      city: order.deliveryCity ?? undefined,
      state: order.deliveryStateUs ?? undefined,
      zip: order.deliveryZip ?? undefined,
      deliveryNotes: order.deliveryNotes ?? undefined,
      deliveryState: derivedDeliveryState,
      estimatedDeliveryTime: order.deliveryEstimatedAt ?? undefined,
      dispatchedDate: order.dispatchedAt ?? undefined,
      deliveredDate: order.deliveredAt ?? undefined,
      // DaaS fields
      deliveryProvider: order.deliveryProvider ?? undefined,
      deliveryExternalId: order.deliveryExternalId ?? undefined,
      deliveryTrackingUrl: order.deliveryTrackingUrl ?? undefined,
      dispatchStatus: order.dispatchStatus ?? undefined,
      estimatedDeliveryAt: order.deliveryEstimatedAt ?? undefined,
      deliveryFee: order.deliveryFee != null ? Number(order.deliveryFee) : undefined,
    };
  }

  // Build curbsideInfo from flat columns
  if (order.vehicleDescription) {
    enriched.curbsideInfo = {
      vehicleDescription: order.vehicleDescription,
      arrivalNotified: order.arrivalNotified ?? false,
    };
  }

  // Build cateringInfo from flat columns
  if (order.eventDate || order.headcount) {
    enriched.cateringInfo = {
      eventDate: order.eventDate ?? undefined,
      eventTime: order.eventTime ?? undefined,
      headcount: order.headcount ?? undefined,
      eventType: order.eventType ?? undefined,
      setupRequired: order.setupRequired ?? false,
      depositAmount: order.depositAmount ? Number(order.depositAmount) : undefined,
      depositPaid: order.depositPaid ?? false,
      specialInstructions: order.cateringInstructions ?? undefined,
    };
  }

  return enriched;
}
