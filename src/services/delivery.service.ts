import { PrismaClient } from '@prisma/client';
import { broadcastOrderEvent, broadcastToSourceAndKDS } from './socket.service';
import { enrichOrderResponse } from '../utils/order-enrichment';
import {
  deliveryCredentialsService,
  DoorDashRuntimeCredentials,
  UberRuntimeCredentials,
} from './delivery-credentials.service';

const prisma = new PrismaClient();

// DaaS dispatch status (matches frontend DeliveryDispatchStatus)
type DispatchStatus =
  | 'QUOTED' | 'DISPATCH_REQUESTED' | 'DRIVER_ASSIGNED'
  | 'DRIVER_EN_ROUTE_TO_PICKUP' | 'DRIVER_AT_PICKUP' | 'PICKED_UP'
  | 'DRIVER_EN_ROUTE_TO_DROPOFF' | 'DRIVER_AT_DROPOFF'
  | 'DELIVERED' | 'CANCELLED' | 'FAILED';

interface DeliveryQuote {
  provider: string;
  quoteId: string;
  fee: number;
  estimatedPickupAt: string;
  estimatedDeliveryAt: string;
  expiresAt: string;
}

interface DispatchResult {
  deliveryExternalId: string;
  trackingUrl: string;
  estimatedDeliveryAt: string;
}

interface DriverInfo {
  name?: string;
  phone?: string;
  photoUrl?: string;
  location?: { lat: number; lng: number };
  estimatedDeliveryAt?: string;
}

const ORDER_INCLUDE = {
  orderItems: { include: { modifiers: true } },
  customer: true,
  table: true,
} as const;

// --- DoorDash Drive ---

async function doordashRequestQuote(
  order: any,
  restaurant: any,
  credentials: DoorDashRuntimeCredentials,
): Promise<DeliveryQuote> {
  // DoorDash Drive API: Create delivery quote
  const baseUrl = credentials.mode === 'production'
    ? 'https://openapi.doordash.com'
    : 'https://openapi.doordash.com'; // DoorDash uses same URL with test keys

  const response = await fetch(`${baseUrl}/drive/v2/deliveries`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${credentials.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      external_delivery_id: `os-${order.id}-${Date.now()}`,
      pickup_address: `${restaurant.address}, ${restaurant.city}, ${restaurant.state} ${restaurant.zip}`,
      pickup_phone_number: restaurant.phone ?? '',
      pickup_business_name: restaurant.name,
      dropoff_address: `${order.deliveryAddress}, ${order.deliveryCity}, ${order.deliveryStateUs} ${order.deliveryZip}`,
      dropoff_phone_number: order.customer?.phone ?? '',
      dropoff_contact_given_name: order.customer?.firstName ?? '',
      dropoff_contact_family_name: order.customer?.lastName ?? '',
      order_value: Number(order.total) * 100, // cents
      tip: Number(order.tip || 0) * 100,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error('[DoorDash] Quote request failed:', errBody);
    throw new Error(`DoorDash quote failed: ${response.status}`);
  }

  const data = await response.json() as Record<string, any>;

  return {
    provider: 'doordash',
    quoteId: data.external_delivery_id,
    fee: (data.fee ?? 0) / 100,
    estimatedPickupAt: data.pickup_time_estimated ?? new Date().toISOString(),
    estimatedDeliveryAt: data.dropoff_time_estimated ?? new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), // 30 min
  };
}

async function doordashAcceptQuote(
  externalDeliveryId: string,
  credentials: DoorDashRuntimeCredentials,
): Promise<DispatchResult> {
  const baseUrl = credentials.mode === 'production'
    ? 'https://openapi.doordash.com'
    : 'https://openapi.doordash.com';

  // Accept the delivery (confirm it)
  const response = await fetch(`${baseUrl}/drive/v2/deliveries/${externalDeliveryId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${credentials.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'confirmed' }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error('[DoorDash] Accept failed:', errBody);
    throw new Error(`DoorDash accept failed: ${response.status}`);
  }

  const data = await response.json() as Record<string, any>;

  return {
    deliveryExternalId: externalDeliveryId,
    trackingUrl: data.tracking_url ?? '',
    estimatedDeliveryAt: data.dropoff_time_estimated ?? new Date().toISOString(),
  };
}

async function doordashGetStatus(
  externalDeliveryId: string,
  credentials: DoorDashRuntimeCredentials,
): Promise<{ dispatchStatus: DispatchStatus; driver: DriverInfo }> {
  const baseUrl = credentials.mode === 'production'
    ? 'https://openapi.doordash.com'
    : 'https://openapi.doordash.com';

  const response = await fetch(`${baseUrl}/drive/v2/deliveries/${externalDeliveryId}`, {
    headers: { 'Authorization': `Bearer ${credentials.apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`DoorDash status check failed: ${response.status}`);
  }

  const data = await response.json() as Record<string, any>;

  return {
    dispatchStatus: mapDoordashStatus(data.delivery_status),
    driver: {
      name: data.dasher_name ?? undefined,
      phone: data.dasher_phone_number ?? undefined,
      location: data.dasher_location ? {
        lat: data.dasher_location.lat,
        lng: data.dasher_location.lng,
      } : undefined,
      estimatedDeliveryAt: data.dropoff_time_estimated ?? undefined,
    },
  };
}

function mapDoordashStatus(ddStatus: string): DispatchStatus {
  switch (ddStatus) {
    case 'created':
    case 'confirmed': return 'DISPATCH_REQUESTED';
    case 'dasher_confirmed':
    case 'dasher_confirmed_store_arrival': return 'DRIVER_ASSIGNED';
    case 'enroute_to_pickup': return 'DRIVER_EN_ROUTE_TO_PICKUP';
    case 'arrived_at_store': return 'DRIVER_AT_PICKUP';
    case 'picked_up': return 'PICKED_UP';
    case 'enroute_to_dropoff': return 'DRIVER_EN_ROUTE_TO_DROPOFF';
    case 'arrived_at_consumer': return 'DRIVER_AT_DROPOFF';
    case 'delivered': return 'DELIVERED';
    case 'cancelled': return 'CANCELLED';
    default: return 'DISPATCH_REQUESTED';
  }
}

async function doordashCancel(
  externalDeliveryId: string,
  credentials: DoorDashRuntimeCredentials,
): Promise<boolean> {
  const baseUrl = credentials.mode === 'production'
    ? 'https://openapi.doordash.com'
    : 'https://openapi.doordash.com';

  const response = await fetch(`${baseUrl}/drive/v2/deliveries/${externalDeliveryId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${credentials.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'cancelled' }),
  });

  return response.ok;
}

// --- Uber Direct ---

async function getUberAccessToken(credentials: UberRuntimeCredentials): Promise<string> {
  const response = await fetch('https://login.uber.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: 'client_credentials',
      scope: 'eats.deliveries',
    }),
  });

  if (!response.ok) {
    throw new Error(`Uber token request failed: ${response.status}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

async function uberRequestQuote(
  order: any,
  restaurant: any,
  credentials: UberRuntimeCredentials,
): Promise<DeliveryQuote> {
  const token = await getUberAccessToken(credentials);
  const customerId = credentials.customerId;

  const response = await fetch('https://api.uber.com/v1/customers/' + customerId + '/delivery_quotes', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pickup_address: JSON.stringify({
        street_address: [restaurant.address],
        city: restaurant.city,
        state: restaurant.state,
        zip_code: restaurant.zip,
        country: 'US',
      }),
      dropoff_address: JSON.stringify({
        street_address: [order.deliveryAddress],
        city: order.deliveryCity,
        state: order.deliveryStateUs,
        zip_code: order.deliveryZip,
        country: 'US',
      }),
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error('[Uber] Quote request failed:', errBody);
    throw new Error(`Uber quote failed: ${response.status}`);
  }

  const data = await response.json() as Record<string, any>;

  return {
    provider: 'uber',
    quoteId: data.id,
    fee: (data.fee ?? 0) / 100,
    estimatedPickupAt: data.pickup_eta ?? new Date().toISOString(),
    estimatedDeliveryAt: data.dropoff_eta ?? new Date().toISOString(),
    expiresAt: data.expires_at ?? new Date(Date.now() + 30 * 60_000).toISOString(),
  };
}

async function uberAcceptQuote(
  quoteId: string,
  order: any,
  restaurant: any,
  credentials: UberRuntimeCredentials,
): Promise<DispatchResult> {
  const token = await getUberAccessToken(credentials);
  const customerId = credentials.customerId;

  const response = await fetch('https://api.uber.com/v1/customers/' + customerId + '/deliveries', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      quote_id: quoteId,
      pickup_name: restaurant.name,
      pickup_phone_number: restaurant.phone ?? '',
      dropoff_name: `${order.customer?.firstName ?? ''} ${order.customer?.lastName ?? ''}`.trim(),
      dropoff_phone_number: order.customer?.phone ?? '',
      manifest_items: order.orderItems?.map((item: any) => ({
        name: item.menuItemName,
        quantity: item.quantity,
      })) ?? [],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error('[Uber] Accept failed:', errBody);
    throw new Error(`Uber accept failed: ${response.status}`);
  }

  const data = await response.json() as Record<string, any>;

  return {
    deliveryExternalId: data.id,
    trackingUrl: data.tracking_url ?? '',
    estimatedDeliveryAt: data.dropoff_eta ?? new Date().toISOString(),
  };
}

async function uberGetStatus(
  deliveryId: string,
  credentials: UberRuntimeCredentials,
): Promise<{ dispatchStatus: DispatchStatus; driver: DriverInfo }> {
  const token = await getUberAccessToken(credentials);
  const customerId = credentials.customerId;

  const response = await fetch(`https://api.uber.com/v1/customers/${customerId}/deliveries/${deliveryId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Uber status check failed: ${response.status}`);
  }

  const data = await response.json() as Record<string, any>;

  return {
    dispatchStatus: mapUberStatus(data.status),
    driver: {
      name: data.courier?.name ?? undefined,
      phone: data.courier?.phone_number ?? undefined,
      photoUrl: data.courier?.img_href ?? undefined,
      location: data.courier?.location ? {
        lat: data.courier.location.lat,
        lng: data.courier.location.lng,
      } : undefined,
      estimatedDeliveryAt: data.dropoff_eta ?? undefined,
    },
  };
}

function mapUberStatus(uberStatus: string): DispatchStatus {
  switch (uberStatus) {
    case 'pending': return 'DISPATCH_REQUESTED';
    case 'pickup': return 'DRIVER_EN_ROUTE_TO_PICKUP';
    case 'pickup_complete': return 'PICKED_UP';
    case 'dropoff': return 'DRIVER_EN_ROUTE_TO_DROPOFF';
    case 'delivered': return 'DELIVERED';
    case 'canceled': return 'CANCELLED';
    case 'returned': return 'FAILED';
    default: return 'DISPATCH_REQUESTED';
  }
}

async function uberCancel(deliveryId: string, credentials: UberRuntimeCredentials): Promise<boolean> {
  const token = await getUberAccessToken(credentials);
  const customerId = credentials.customerId;

  const response = await fetch(`https://api.uber.com/v1/customers/${customerId}/deliveries/${deliveryId}/cancel`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  return response.ok;
}

// --- Orchestrator (public API) ---

export const deliveryService = {
  async getConfigStatus(restaurantId: string): Promise<{ doordash: boolean; uber: boolean }> {
    const summary = await deliveryCredentialsService.getSummary(restaurantId);
    return {
      doordash: summary.doordash.configured,
      uber: summary.uber.configured,
    };
  },

  async requestQuote(orderId: string, provider: string): Promise<DeliveryQuote> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { ...ORDER_INCLUDE, restaurant: true },
    });

    if (!order) throw new Error('Order not found');
    if (order.orderType !== 'delivery') throw new Error('Not a delivery order');

    const restaurant = order.restaurant;

    let quote: DeliveryQuote;
    if (provider === 'doordash') {
      const credentials = await deliveryCredentialsService.getDoorDashRuntimeCredentials(order.restaurantId);
      if (!credentials) {
        throw new Error('DoorDash API credentials not configured for restaurant');
      }
      quote = await doordashRequestQuote(order, restaurant, credentials);
    } else if (provider === 'uber') {
      const credentials = await deliveryCredentialsService.getUberRuntimeCredentials(order.restaurantId);
      if (!credentials) {
        throw new Error('Uber Direct API credentials not configured for restaurant');
      }
      quote = await uberRequestQuote(order, restaurant, credentials);
    } else {
      throw new Error(`Unsupported delivery provider: ${provider}`);
    }

    // Update order with dispatch status
    await prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryProvider: provider,
        dispatchStatus: 'QUOTED',
        deliveryFee: quote.fee,
        deliveryEstimatedAt: new Date(quote.estimatedDeliveryAt),
      },
    });

    return quote;
  },

  async acceptQuote(orderId: string, quoteId: string): Promise<DispatchResult> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { ...ORDER_INCLUDE, restaurant: true },
    });

    if (!order) throw new Error('Order not found');

    const provider = order.deliveryProvider;

    let result: DispatchResult;
    if (provider === 'doordash') {
      const credentials = await deliveryCredentialsService.getDoorDashRuntimeCredentials(order.restaurantId);
      if (!credentials) {
        throw new Error('DoorDash API credentials not configured for restaurant');
      }
      result = await doordashAcceptQuote(quoteId, credentials);
    } else if (provider === 'uber') {
      const credentials = await deliveryCredentialsService.getUberRuntimeCredentials(order.restaurantId);
      if (!credentials) {
        throw new Error('Uber Direct API credentials not configured for restaurant');
      }
      result = await uberAcceptQuote(quoteId, order, order.restaurant, credentials);
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    // Update order with dispatch data
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryExternalId: result.deliveryExternalId,
        deliveryTrackingUrl: result.trackingUrl,
        dispatchStatus: 'DISPATCH_REQUESTED',
        dispatchedAt: new Date(),
        deliveryEstimatedAt: new Date(result.estimatedDeliveryAt),
      },
      include: ORDER_INCLUDE,
    });

    // Broadcast the order update to source POS + KDS only
    const enriched = enrichOrderResponse(updated);
    broadcastToSourceAndKDS(updated.restaurantId, updated.sourceDeviceId, 'order:updated', enriched);

    return result;
  },

  async getStatus(orderId: string): Promise<{ dispatchStatus: DispatchStatus; driver: DriverInfo } | null> {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order || !order.deliveryExternalId || !order.deliveryProvider) return null;

    if (order.deliveryProvider === 'doordash') {
      const credentials = await deliveryCredentialsService.getDoorDashRuntimeCredentials(order.restaurantId);
      if (!credentials) return null;
      return doordashGetStatus(order.deliveryExternalId, credentials);
    } else if (order.deliveryProvider === 'uber') {
      const credentials = await deliveryCredentialsService.getUberRuntimeCredentials(order.restaurantId);
      if (!credentials) return null;
      return uberGetStatus(order.deliveryExternalId, credentials);
    }

    return null;
  },

  async cancelDelivery(orderId: string): Promise<boolean> {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order || !order.deliveryExternalId || !order.deliveryProvider) return false;

    let cancelled = false;
    if (order.deliveryProvider === 'doordash') {
      const credentials = await deliveryCredentialsService.getDoorDashRuntimeCredentials(order.restaurantId);
      if (!credentials) return false;
      cancelled = await doordashCancel(order.deliveryExternalId, credentials);
    } else if (order.deliveryProvider === 'uber') {
      const credentials = await deliveryCredentialsService.getUberRuntimeCredentials(order.restaurantId);
      if (!credentials) return false;
      cancelled = await uberCancel(order.deliveryExternalId, credentials);
    }

    if (cancelled) {
      const updated = await prisma.order.update({
        where: { id: orderId },
        data: { dispatchStatus: 'CANCELLED' },
        include: ORDER_INCLUDE,
      });

      const enriched = enrichOrderResponse(updated);
      broadcastToSourceAndKDS(updated.restaurantId, updated.sourceDeviceId, 'order:updated', enriched);
    }

    return cancelled;
  },

  async handleWebhookUpdate(orderId: string, dispatchStatus: DispatchStatus, driverInfo?: DriverInfo): Promise<void> {
    const order = await prisma.order.findFirst({
      where: { deliveryExternalId: orderId },
    });

    if (!order) {
      console.warn(`[Delivery] Webhook for unknown delivery: ${orderId}`);
      return;
    }

    const updateData: Record<string, any> = {
      dispatchStatus,
    };

    if (driverInfo?.estimatedDeliveryAt) {
      updateData.deliveryEstimatedAt = new Date(driverInfo.estimatedDeliveryAt);
    }

    if (driverInfo?.location) {
      updateData.deliveryLat = driverInfo.location.lat;
      updateData.deliveryLng = driverInfo.location.lng;
    }

    if (dispatchStatus === 'DELIVERED') {
      updateData.deliveredAt = new Date();
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: updateData,
      include: ORDER_INCLUDE,
    });

    // Broadcast order update to source POS + KDS only
    const enriched = enrichOrderResponse(updated);
    broadcastToSourceAndKDS(updated.restaurantId, updated.sourceDeviceId, 'order:updated', enriched);

    // Also send GPS ping via delivery:location_updated for live tracking
    if (driverInfo?.location) {
      broadcastOrderEvent(updated.restaurantId, 'delivery:location_updated', {
        orderId: order.id,
        lat: driverInfo.location.lat,
        lng: driverInfo.location.lng,
        estimatedDeliveryAt: driverInfo.estimatedDeliveryAt,
      });
    }
  },

  async getActiveAssignments(restaurantId: string) {
    const activeStatuses: DispatchStatus[] = [
      'QUOTED', 'DISPATCH_REQUESTED', 'DRIVER_ASSIGNED',
      'DRIVER_EN_ROUTE_TO_PICKUP', 'DRIVER_AT_PICKUP', 'PICKED_UP',
      'DRIVER_EN_ROUTE_TO_DROPOFF', 'DRIVER_AT_DROPOFF',
    ];

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        orderType: 'delivery',
        dispatchStatus: { in: activeStatuses },
      },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return orders.map(order => ({
      orderId: order.id,
      orderNumber: order.orderNumber,
      provider: order.deliveryProvider,
      dispatchStatus: order.dispatchStatus,
      deliveryExternalId: order.deliveryExternalId,
      trackingUrl: order.deliveryTrackingUrl,
      estimatedDeliveryAt: order.deliveryEstimatedAt,
      dispatchedAt: order.dispatchedAt,
      customerName: order.customer
        ? `${order.customer.firstName ?? ''} ${order.customer.lastName ?? ''}`.trim()
        : null,
      deliveryAddress: order.deliveryAddress,
      total: order.total,
    }));
  },

  async getDrivers(restaurantId: string) {
    // No dedicated Driver model — derive from active delivery orders with assigned drivers
    const driverStatuses: DispatchStatus[] = [
      'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE_TO_PICKUP', 'DRIVER_AT_PICKUP',
      'PICKED_UP', 'DRIVER_EN_ROUTE_TO_DROPOFF', 'DRIVER_AT_DROPOFF',
    ];

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        orderType: 'delivery',
        dispatchStatus: { in: driverStatuses },
      },
      select: {
        id: true,
        orderNumber: true,
        deliveryProvider: true,
        dispatchStatus: true,
        deliveryExternalId: true,
        deliveryLat: true,
        deliveryLng: true,
        deliveryEstimatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map(order => ({
      orderId: order.id,
      orderNumber: order.orderNumber,
      provider: order.deliveryProvider,
      dispatchStatus: order.dispatchStatus,
      deliveryExternalId: order.deliveryExternalId,
      location: order.deliveryLat && order.deliveryLng
        ? { lat: Number(order.deliveryLat), lng: Number(order.deliveryLng) }
        : null,
      estimatedDeliveryAt: order.deliveryEstimatedAt,
    }));
  },

  async getWebhookVerificationSecret(
    provider: 'doordash' | 'uber',
    deliveryExternalId: string,
  ): Promise<string | null> {
    return deliveryCredentialsService.getWebhookSecretByExternalDeliveryId(provider, deliveryExternalId);
  },
};
