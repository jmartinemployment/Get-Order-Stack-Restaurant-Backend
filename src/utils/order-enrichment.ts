/**
 * Enriches a raw Prisma Order object with nested dining-specific objects
 * (deliveryInfo, curbsideInfo, cateringInfo) built from flat DB columns.
 *
 * Applied to all order responses (REST + WebSocket broadcasts) so the
 * frontend receives the nested structure its models expect.
 */
export function enrichOrderResponse(order: any): any {
  if (!order) return order;

  const enriched = { ...order };

  // Build deliveryInfo from flat columns
  if (order.deliveryAddress || order.deliveryCity) {
    enriched.deliveryInfo = {
      address: order.deliveryAddress,
      address2: order.deliveryAddress2 ?? undefined,
      city: order.deliveryCity ?? undefined,
      state: order.deliveryStateUs ?? undefined,
      zip: order.deliveryZip ?? undefined,
      deliveryNotes: order.deliveryNotes ?? undefined,
      deliveryState: order.deliveryStatus ?? 'PREPARING',
      estimatedDeliveryTime: order.deliveryEstimatedAt ?? undefined,
      dispatchedDate: order.dispatchedAt ?? undefined,
      deliveredDate: order.deliveredAt ?? undefined,
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
