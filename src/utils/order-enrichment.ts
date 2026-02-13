/**
 * Enriches a raw Prisma Order object with nested dining-specific objects
 * (deliveryInfo, curbsideInfo, cateringInfo) built from flat DB columns.
 *
 * Applied to all order responses (REST + WebSocket broadcasts) so the
 * frontend receives the nested structure its models expect.
 */

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

export function enrichOrderResponse(order: any): any {
  if (!order) return order;

  const enriched = { ...order };

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
