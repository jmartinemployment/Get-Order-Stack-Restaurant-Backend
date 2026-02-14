import crypto from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { broadcastOrderEvent } from './socket.service';
import { enrichOrderResponse } from '../utils/order-enrichment';

const prisma = new PrismaClient();

const ENCRYPTION_KEY_ENV = 'DELIVERY_CREDENTIALS_ENCRYPTION_KEY';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

const ORDER_INCLUDE = {
  orderItems: { include: { modifiers: true } },
  customer: true,
  table: true,
} as const;

const MARKETPLACE_PROVIDERS = ['doordash_marketplace', 'ubereats', 'grubhub'] as const;

export type MarketplaceProvider = typeof MARKETPLACE_PROVIDERS[number];

export interface MarketplaceIntegrationSummary {
  provider: MarketplaceProvider;
  enabled: boolean;
  externalStoreId: string | null;
  hasWebhookSigningSecret: boolean;
  updatedAt: string | null;
}

export interface MarketplaceIntegrationUpdatePayload {
  enabled?: boolean;
  externalStoreId?: string;
  webhookSigningSecret?: string;
}

export interface MarketplaceMenuMappingSummary {
  id: string;
  provider: MarketplaceProvider;
  externalItemId: string;
  externalItemName: string | null;
  menuItemId: string;
  menuItemName: string;
  updatedAt: string;
}

export interface UpsertMarketplaceMenuMappingPayload {
  provider: MarketplaceProvider;
  externalItemId: string;
  externalItemName?: string;
  menuItemId: string;
}

interface MarketplaceInboundItem {
  externalItemId?: string;
  name: string;
  quantity: number;
  unitPrice?: number;
  specialInstructions?: string;
}

interface MarketplaceInboundAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  instructions?: string;
}

interface MarketplaceInboundCustomer {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
}

interface NormalizedMarketplaceEvent {
  provider: MarketplaceProvider;
  eventType: string;
  externalEventId?: string;
  externalOrderId?: string;
  externalStoreId?: string;
  orderStatus?: string;
  specialInstructions?: string;
  customer: MarketplaceInboundCustomer;
  deliveryAddress: MarketplaceInboundAddress;
  items: MarketplaceInboundItem[];
  subtotal?: number;
  tax?: number;
  tip?: number;
  deliveryFee?: number;
  total?: number;
  raw: Record<string, unknown>;
}

function isMarketplaceProvider(provider: string): provider is MarketplaceProvider {
  return (MARKETPLACE_PROVIDERS as readonly string[]).includes(provider);
}

function normalizeProvider(provider: string): MarketplaceProvider {
  const normalized = provider.trim().toLowerCase();
  if (!isMarketplaceProvider(normalized)) {
    throw new Error(`Unsupported marketplace provider: ${provider}`);
  }
  return normalized;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  return undefined;
}

function getEncryptionKey(): Buffer {
  const secret = process.env[ENCRYPTION_KEY_ENV]
    || process.env.JWT_SECRET
    || 'your-secret-key-change-in-production';

  return crypto.createHash('sha256').update(secret).digest();
}

function encryptSecret(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptSecret(payload: string): string {
  const key = getEncryptionKey();
  const [ivB64, tagB64, encryptedB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !encryptedB64) {
    throw new Error('Invalid encrypted secret payload');
  }

  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    key,
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

function getHeaderValue(headers: Record<string, unknown>, key: string): string | undefined {
  const header = headers[key] as string | string[] | undefined;
  if (Array.isArray(header)) return header[0];
  return typeof header === 'string' ? header : undefined;
}

function verifyHmacSha256(rawBody: Buffer, providedSignature: string, secret: string): boolean {
  const normalized = providedSignature.replace(/^sha256=/i, '').trim().toLowerCase();
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')
    .toLowerCase();

  if (normalized.length !== expected.length) return false;

  return crypto.timingSafeEqual(Buffer.from(normalized), Buffer.from(expected));
}

function payloadSha256(rawBody: Buffer): string {
  return crypto.createHash('sha256').update(rawBody).digest('hex');
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getByPath(input: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[segment];
  }, input);
}

function firstString(input: Record<string, unknown>, paths: string[]): string | undefined {
  for (const path of paths) {
    const value = normalizeOptionalString(getByPath(input, path));
    if (value) return value;
  }
  return undefined;
}

function firstArray(input: Record<string, unknown>, paths: string[]): unknown[] {
  for (const path of paths) {
    const value = getByPath(input, path);
    if (Array.isArray(value)) return value;
  }
  return [];
}

function toMoney(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value) && Math.abs(value) >= 1000) {
      return value / 100;
    }
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim());
    if (!Number.isFinite(parsed)) return undefined;
    if (/^-?\d+$/.test(value.trim()) && Math.abs(parsed) >= 1000) {
      return parsed / 100;
    }
    return parsed;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('amount' in record) return toMoney(record.amount);
    if ('value' in record) return toMoney(record.value);
  }

  return undefined;
}

function toRoundedMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeItems(rawItems: unknown[]): MarketplaceInboundItem[] {
  const normalized: MarketplaceInboundItem[] = [];

  for (const rawItem of rawItems) {
    const item = asRecord(rawItem);
    const name = firstString(item, ['name', 'item_name', 'title', 'product_name'])
      ?? 'Marketplace item';
    const quantityRaw = getByPath(item, 'quantity') ?? getByPath(item, 'qty');
    const quantityNumber = Number.parseInt(String(quantityRaw ?? '1'), 10);
    const quantity = Number.isFinite(quantityNumber) && quantityNumber > 0 ? quantityNumber : 1;

    normalized.push({
      externalItemId: firstString(item, ['merchant_supplied_id', 'external_id', 'item_id', 'id']),
      name,
      quantity,
      unitPrice: toMoney(getByPath(item, 'unit_price') ?? getByPath(item, 'price')),
      specialInstructions: firstString(item, ['special_instructions', 'instructions', 'notes']),
    });
  }

  return normalized;
}

function normalizeDoorDashMarketplaceEvent(payload: Record<string, unknown>): NormalizedMarketplaceEvent {
  const order = asRecord(getByPath(payload, 'order'));
  const deliveryAddress = asRecord(getByPath(order, 'delivery_address'));
  const customer = asRecord(getByPath(order, 'customer'));

  return {
    provider: 'doordash_marketplace',
    eventType: firstString(payload, ['event_type', 'type', 'event.type']) ?? 'unknown',
    externalEventId: firstString(payload, ['event_id', 'id', 'event.id', 'metadata.event_id']),
    externalOrderId: firstString(payload, ['order.id', 'order.order_id', 'order_id', 'data.order_id', 'data.order.id']),
    externalStoreId: firstString(payload, ['store.id', 'store_id', 'merchant.id', 'merchant_store_id', 'data.store.id']),
    orderStatus: firstString(payload, ['order.status', 'status', 'data.status']),
    specialInstructions: firstString(order, ['special_instructions', 'delivery_notes', 'notes']),
    customer: {
      firstName: firstString(customer, ['first_name', 'given_name', 'name']),
      lastName: firstString(customer, ['last_name', 'family_name']),
      phone: firstString(customer, ['phone', 'phone_number']),
      email: firstString(customer, ['email']),
    },
    deliveryAddress: {
      line1: firstString(deliveryAddress, ['street', 'line1', 'address1'])
        ?? firstString(order, ['delivery_address']),
      line2: firstString(deliveryAddress, ['line2', 'address2']),
      city: firstString(deliveryAddress, ['city']),
      state: firstString(deliveryAddress, ['state', 'region']),
      zip: firstString(deliveryAddress, ['zip', 'postal_code']),
      instructions: firstString(deliveryAddress, ['instructions', 'delivery_instructions'])
        ?? firstString(order, ['delivery_notes']),
    },
    items: normalizeItems(firstArray(payload, ['order.items', 'items', 'data.order.items'])),
    subtotal: toMoney(getByPath(order, 'subtotal') ?? getByPath(payload, 'subtotal')),
    tax: toMoney(getByPath(order, 'tax') ?? getByPath(payload, 'tax')),
    tip: toMoney(getByPath(order, 'tip') ?? getByPath(payload, 'tip')),
    deliveryFee: toMoney(getByPath(order, 'delivery_fee') ?? getByPath(payload, 'delivery_fee')),
    total: toMoney(getByPath(order, 'total') ?? getByPath(payload, 'total')),
    raw: payload,
  };
}

function normalizeUberEatsEvent(payload: Record<string, unknown>): NormalizedMarketplaceEvent {
  const data = asRecord(getByPath(payload, 'data'));
  const order = asRecord(getByPath(data, 'order'));
  const deliveryAddress = asRecord(getByPath(order, 'delivery_address'));
  const customer = asRecord(getByPath(order, 'customer'));

  return {
    provider: 'ubereats',
    eventType: firstString(payload, ['event_type', 'type']) ?? 'unknown',
    externalEventId: firstString(payload, ['id', 'event_id', 'event.id', 'data.event_id']),
    externalOrderId: firstString(payload, ['data.order.id', 'data.order_id', 'order.id', 'order_id', 'data.id']),
    externalStoreId: firstString(payload, ['store_id', 'data.store_id', 'restaurant.id', 'merchant.id']),
    orderStatus: firstString(payload, ['data.status', 'status', 'order.status']),
    specialInstructions: firstString(order, ['special_instructions', 'notes']),
    customer: {
      firstName: firstString(customer, ['first_name', 'given_name', 'name']),
      lastName: firstString(customer, ['last_name', 'family_name']),
      phone: firstString(customer, ['phone', 'phone_number']),
      email: firstString(customer, ['email']),
    },
    deliveryAddress: {
      line1: firstString(deliveryAddress, ['line1', 'street', 'address1'])
        ?? firstString(order, ['delivery_address']),
      line2: firstString(deliveryAddress, ['line2', 'address2']),
      city: firstString(deliveryAddress, ['city']),
      state: firstString(deliveryAddress, ['state', 'region']),
      zip: firstString(deliveryAddress, ['zip', 'postal_code']),
      instructions: firstString(deliveryAddress, ['instructions', 'delivery_instructions'])
        ?? firstString(order, ['delivery_notes']),
    },
    items: normalizeItems(firstArray(payload, ['data.order.items', 'order.items', 'items'])),
    subtotal: toMoney(getByPath(order, 'subtotal') ?? getByPath(data, 'subtotal')),
    tax: toMoney(getByPath(order, 'tax') ?? getByPath(data, 'tax')),
    tip: toMoney(getByPath(order, 'tip') ?? getByPath(data, 'tip')),
    deliveryFee: toMoney(getByPath(order, 'delivery_fee') ?? getByPath(data, 'delivery_fee')),
    total: toMoney(getByPath(order, 'total') ?? getByPath(data, 'total')),
    raw: payload,
  };
}

function normalizeMarketplaceEvent(provider: MarketplaceProvider, payload: Record<string, unknown>): NormalizedMarketplaceEvent {
  switch (provider) {
    case 'doordash_marketplace':
      return normalizeDoorDashMarketplaceEvent(payload);
    case 'ubereats':
      return normalizeUberEatsEvent(payload);
    case 'grubhub':
      return {
        provider,
        eventType: firstString(payload, ['event_type', 'type']) ?? 'unknown',
        externalEventId: firstString(payload, ['event_id', 'id']),
        externalOrderId: firstString(payload, ['order_id', 'order.id', 'data.order.id']),
        externalStoreId: firstString(payload, ['store_id', 'merchant_id']),
        orderStatus: firstString(payload, ['status', 'order.status']),
        customer: {},
        deliveryAddress: {},
        items: normalizeItems(firstArray(payload, ['order.items', 'items'])),
        raw: payload,
      };
  }
}

function deriveFallbackEventId(normalized: NormalizedMarketplaceEvent, payloadHash: string): string {
  const orderPart = normalized.externalOrderId ?? 'unknown-order';
  const typePart = normalized.eventType || 'unknown-event';
  return `${orderPart}:${typePart}:${payloadHash.slice(0, 16)}`;
}

function normalizeEventStatus(normalized: NormalizedMarketplaceEvent): string {
  const raw = normalized.orderStatus || normalized.eventType || 'UNKNOWN';
  return raw.trim().replace(/\s+/g, '_').toUpperCase();
}

function providerToOrderSource(provider: MarketplaceProvider): string {
  switch (provider) {
    case 'doordash_marketplace':
      return 'marketplace_doordash';
    case 'ubereats':
      return 'marketplace_ubereats';
    case 'grubhub':
      return 'marketplace_grubhub';
  }
}

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MKT-${timestamp}-${random}`;
}

interface ResolvedMenuItem {
  id: string;
  name: string;
  price: number;
  source: 'explicit_mapping' | 'compat_external_id' | 'compat_name';
}

async function resolveMenuItem(
  restaurantId: string,
  provider: MarketplaceProvider,
  item: MarketplaceInboundItem,
): Promise<ResolvedMenuItem | null> {
  if (item.externalItemId) {
    const explicit = await prisma.marketplaceMenuMapping.findUnique({
      where: {
        restaurantId_provider_externalItemId: {
          restaurantId,
          provider,
          externalItemId: item.externalItemId,
        },
      },
      include: {
        menuItem: {
          select: { id: true, name: true, price: true, available: true, eightySixed: true },
        },
      },
    });

    if (explicit?.menuItem && explicit.menuItem.available && !explicit.menuItem.eightySixed) {
      return {
        id: explicit.menuItem.id,
        name: explicit.menuItem.name,
        price: Number(explicit.menuItem.price),
        source: 'explicit_mapping',
      };
    }

    // Temporary compatibility fallback for payloads that already send internal menuItem ids.
    const byId = await prisma.menuItem.findFirst({
      where: {
        restaurantId,
        id: item.externalItemId,
      },
      select: { id: true, name: true, price: true, available: true, eightySixed: true },
    });

    if (byId && byId.available && !byId.eightySixed) {
      return {
        id: byId.id,
        name: byId.name,
        price: Number(byId.price),
        source: 'compat_external_id',
      };
    }
  }

  const byName = await prisma.menuItem.findFirst({
    where: {
      restaurantId,
      name: { equals: item.name, mode: 'insensitive' },
    },
    select: { id: true, name: true, price: true, available: true, eightySixed: true },
  });

  if (!byName || !byName.available || byName.eightySixed) return null;
  return {
    id: byName.id,
    name: byName.name,
    price: Number(byName.price),
    source: 'compat_name',
  };
}

async function upsertCustomer(restaurantId: string, customer: MarketplaceInboundCustomer): Promise<string | null> {
  const phone = normalizeOptionalString(customer.phone);
  const email = normalizeOptionalString(customer.email);

  let firstName = normalizeOptionalString(customer.firstName);
  let lastName = normalizeOptionalString(customer.lastName);

  if (!firstName && customer.firstName) {
    const parts = customer.firstName.trim().split(' ');
    firstName = parts[0];
    lastName = lastName ?? (parts.slice(1).join(' ') || undefined);
  }

  if (phone) {
    const saved = await prisma.customer.upsert({
      where: { restaurantId_phone: { restaurantId, phone } },
      update: {
        firstName: firstName ?? undefined,
        lastName: lastName ?? undefined,
        email: email ?? undefined,
      },
      create: {
        restaurantId,
        firstName,
        lastName,
        phone,
        email,
      },
      select: { id: true },
    });

    return saved.id;
  }

  if (!email && !firstName) return null;

  const created = await prisma.customer.create({
    data: {
      restaurantId,
      firstName,
      lastName,
      email,
    },
    select: { id: true },
  });

  return created.id;
}

async function applyMarketplaceStatusToOrder(orderId: string, status: string): Promise<void> {
  const normalized = status.toUpperCase();

  const updateData: Prisma.OrderUpdateInput = {
    deliveryStatus: normalized,
  };

  if (normalized.includes('CANCEL')) {
    updateData.status = 'cancelled';
    updateData.cancelledAt = new Date();
    updateData.cancelledBy = 'system';
    updateData.cancellationReason = 'Marketplace cancellation';
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: updateData,
    include: ORDER_INCLUDE,
  });

  broadcastOrderEvent(updated.restaurantId, 'order:updated', enrichOrderResponse(updated));
}

export const marketplaceService = {
  async listIntegrations(restaurantId: string): Promise<MarketplaceIntegrationSummary[]> {
    const existing = await prisma.marketplaceIntegration.findMany({
      where: { restaurantId },
      orderBy: { provider: 'asc' },
    });

    return MARKETPLACE_PROVIDERS.map((provider) => {
      const match = existing.find((entry) => entry.provider === provider);
      return {
        provider,
        enabled: match?.enabled ?? false,
        externalStoreId: match?.externalStoreId ?? null,
        hasWebhookSigningSecret: Boolean(match?.webhookSigningSecretEncrypted),
        updatedAt: match?.updatedAt?.toISOString() ?? null,
      };
    });
  },

  async updateIntegration(
    restaurantId: string,
    providerInput: string,
    payload: MarketplaceIntegrationUpdatePayload,
  ): Promise<MarketplaceIntegrationSummary> {
    const provider = normalizeProvider(providerInput);

    const existing = await prisma.marketplaceIntegration.findUnique({
      where: {
        restaurantId_provider: { restaurantId, provider },
      },
      select: {
        webhookSigningSecretEncrypted: true,
      },
    });

    const webhookSigningSecret = normalizeOptionalString(payload.webhookSigningSecret);
    const encryptedSecret = webhookSigningSecret
      ? encryptSecret(webhookSigningSecret)
      : existing?.webhookSigningSecretEncrypted ?? null;

    const updateData: Prisma.MarketplaceIntegrationUpdateInput = {
      enabled: normalizeOptionalBoolean(payload.enabled),
      webhookSigningSecretEncrypted: encryptedSecret,
    };
    if (updateData.enabled === undefined) {
      delete updateData.enabled;
    }
    if (payload.externalStoreId !== undefined) {
      updateData.externalStoreId = normalizeOptionalString(payload.externalStoreId) ?? null;
    }

    const updated = await prisma.marketplaceIntegration.upsert({
      where: {
        restaurantId_provider: { restaurantId, provider },
      },
      update: updateData,
      create: {
        restaurantId,
        provider,
        enabled: normalizeOptionalBoolean(payload.enabled) ?? false,
        externalStoreId: normalizeOptionalString(payload.externalStoreId) ?? null,
        webhookSigningSecretEncrypted: encryptedSecret,
      },
    });

    return {
      provider,
      enabled: updated.enabled,
      externalStoreId: updated.externalStoreId,
      hasWebhookSigningSecret: Boolean(updated.webhookSigningSecretEncrypted),
      updatedAt: updated.updatedAt.toISOString(),
    };
  },

  async clearIntegrationSecret(restaurantId: string, providerInput: string): Promise<MarketplaceIntegrationSummary> {
    const provider = normalizeProvider(providerInput);

    const updated = await prisma.marketplaceIntegration.upsert({
      where: {
        restaurantId_provider: { restaurantId, provider },
      },
      update: {
        webhookSigningSecretEncrypted: null,
      },
      create: {
        restaurantId,
        provider,
        enabled: false,
        webhookSigningSecretEncrypted: null,
      },
    });

    return {
      provider,
      enabled: updated.enabled,
      externalStoreId: updated.externalStoreId,
      hasWebhookSigningSecret: false,
      updatedAt: updated.updatedAt.toISOString(),
    };
  },

  async listMenuMappings(
    restaurantId: string,
    providerInput?: string,
  ): Promise<MarketplaceMenuMappingSummary[]> {
    const provider = providerInput ? normalizeProvider(providerInput) : undefined;

    const mappings = await prisma.marketplaceMenuMapping.findMany({
      where: {
        restaurantId,
        ...(provider ? { provider } : {}),
      },
      include: {
        menuItem: {
          select: { id: true, name: true },
        },
      },
      orderBy: [
        { provider: 'asc' },
        { externalItemName: 'asc' },
        { externalItemId: 'asc' },
      ],
    });

    return mappings.map((mapping) => ({
      id: mapping.id,
      provider: normalizeProvider(mapping.provider),
      externalItemId: mapping.externalItemId,
      externalItemName: mapping.externalItemName,
      menuItemId: mapping.menuItemId,
      menuItemName: mapping.menuItem.name,
      updatedAt: mapping.updatedAt.toISOString(),
    }));
  },

  async upsertMenuMapping(
    restaurantId: string,
    payload: UpsertMarketplaceMenuMappingPayload,
  ): Promise<MarketplaceMenuMappingSummary> {
    const provider = normalizeProvider(payload.provider);
    const externalItemId = normalizeOptionalString(payload.externalItemId);
    const menuItemId = normalizeOptionalString(payload.menuItemId);

    if (!externalItemId) {
      throw new Error('externalItemId is required');
    }
    if (!menuItemId) {
      throw new Error('menuItemId is required');
    }

    const menuItem = await prisma.menuItem.findFirst({
      where: { id: menuItemId, restaurantId },
      select: { id: true, name: true },
    });

    if (!menuItem) {
      throw new Error('menuItemId is invalid for this restaurant');
    }

    const mapping = await prisma.marketplaceMenuMapping.upsert({
      where: {
        restaurantId_provider_externalItemId: {
          restaurantId,
          provider,
          externalItemId,
        },
      },
      update: {
        menuItemId,
        externalItemName: normalizeOptionalString(payload.externalItemName) ?? null,
      },
      create: {
        restaurantId,
        provider,
        externalItemId,
        externalItemName: normalizeOptionalString(payload.externalItemName) ?? null,
        menuItemId,
      },
      include: {
        menuItem: {
          select: { id: true, name: true },
        },
      },
    });

    return {
      id: mapping.id,
      provider: normalizeProvider(mapping.provider),
      externalItemId: mapping.externalItemId,
      externalItemName: mapping.externalItemName,
      menuItemId: mapping.menuItemId,
      menuItemName: mapping.menuItem.name,
      updatedAt: mapping.updatedAt.toISOString(),
    };
  },

  async deleteMenuMapping(restaurantId: string, mappingId: string): Promise<boolean> {
    const mapping = await prisma.marketplaceMenuMapping.findFirst({
      where: { id: mappingId, restaurantId },
      select: { id: true },
    });

    if (!mapping) return false;

    await prisma.marketplaceMenuMapping.delete({
      where: { id: mapping.id },
    });
    return true;
  },

  async handleWebhook(providerInput: string, rawBody: Buffer, headers: Record<string, unknown>) {
    const provider = normalizeProvider(providerInput);
    const payloadHash = payloadSha256(rawBody);

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString()) as Record<string, unknown>;
    } catch {
      throw new Error('Invalid JSON payload');
    }
    const jsonPayload = payload as Prisma.InputJsonValue;

    const normalized = normalizeMarketplaceEvent(provider, payload);
    const externalEventId = normalized.externalEventId
      ? normalized.externalEventId
      : deriveFallbackEventId(normalized, payloadHash);

    const integration = await (async () => {
      if (normalized.externalStoreId) {
        return prisma.marketplaceIntegration.findFirst({
          where: {
            provider,
            externalStoreId: normalized.externalStoreId,
            enabled: true,
          },
        });
      }

      const candidates = await prisma.marketplaceIntegration.findMany({
        where: { provider, enabled: true },
        orderBy: { updatedAt: 'desc' },
        take: 2,
      });

      if (candidates.length === 1) return candidates[0];
      return null;
    })();

    try {
      await prisma.marketplaceWebhookEvent.create({
        data: {
          provider,
          externalEventId,
          externalOrderId: normalized.externalOrderId ?? null,
          payloadHash,
          payload: jsonPayload,
          restaurantId: integration?.restaurantId ?? null,
          integrationId: integration?.id ?? null,
          outcome: 'RECEIVED',
        },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { status: 'duplicate' as const, message: 'Duplicate webhook event ignored' };
      }
      throw error;
    }

    const markOutcome = async (outcome: string, errorMessage?: string) => {
      await prisma.marketplaceWebhookEvent.update({
        where: {
          provider_externalEventId: { provider, externalEventId },
        },
        data: {
          outcome,
          errorMessage: errorMessage ?? null,
          processedAt: new Date(),
        },
      });
    };

    if (!integration) {
      await markOutcome('IGNORED_NO_INTEGRATION', 'No enabled integration matched webhook store');
      return { status: 'ignored' as const, message: 'No enabled integration matched webhook store' };
    }

    if (integration.webhookSigningSecretEncrypted) {
      const secret = decryptSecret(integration.webhookSigningSecretEncrypted);
      const signatureHeader = provider === 'doordash_marketplace'
        ? getHeaderValue(headers, 'x-doordash-signature')
        : getHeaderValue(headers, 'x-uber-signature') ?? getHeaderValue(headers, 'x-uber-eats-signature');

      if (!signatureHeader) {
        await markOutcome('REJECTED_BAD_SIGNATURE', 'Missing signature header');
        throw new Error('Missing signature header');
      }

      const valid = verifyHmacSha256(rawBody, signatureHeader, secret);
      if (!valid) {
        await markOutcome('REJECTED_BAD_SIGNATURE', 'Signature verification failed');
        throw new Error('Signature verification failed');
      }
    }

    if (!normalized.externalOrderId) {
      await markOutcome('IGNORED_NO_ORDER_ID', 'No external order id in payload');
      return { status: 'ignored' as const, message: 'No external order id in payload' };
    }

    try {
      const eventStatus = normalizeEventStatus(normalized);

      const marketplaceOrder = await prisma.marketplaceOrder.upsert({
        where: {
          provider_externalOrderId: {
            provider,
            externalOrderId: normalized.externalOrderId,
          },
        },
        update: {
          integrationId: integration.id,
          status: eventStatus,
          rawPayload: jsonPayload,
          lastEventId: externalEventId,
          externalStoreId: normalized.externalStoreId ?? undefined,
        },
        create: {
          restaurantId: integration.restaurantId,
          integrationId: integration.id,
          provider,
          externalOrderId: normalized.externalOrderId,
          externalStoreId: normalized.externalStoreId,
          externalCustomerId: normalized.customer.phone ?? normalized.customer.email ?? null,
          status: eventStatus,
          rawPayload: jsonPayload,
          lastEventId: externalEventId,
        },
      });

      let linkedOrderId = marketplaceOrder.orderId;

      if (!linkedOrderId && normalized.items.length > 0) {
        const customerId = await upsertCustomer(integration.restaurantId, normalized.customer);

        const orderItemsData: Prisma.OrderItemCreateWithoutOrderInput[] = [];
        const unknownItems: Array<{ externalItemId: string | null; name: string }> = [];
        let subtotal = 0;

        for (const inboundItem of normalized.items) {
          const matchedMenuItem = await resolveMenuItem(integration.restaurantId, provider, inboundItem);
          if (!matchedMenuItem) {
            unknownItems.push({
              externalItemId: inboundItem.externalItemId ?? null,
              name: inboundItem.name,
            });
            continue;
          }

          const unitPrice = inboundItem.unitPrice ?? matchedMenuItem.price;
          const totalPrice = toRoundedMoney(unitPrice * inboundItem.quantity);
          subtotal += totalPrice;

          orderItemsData.push({
            menuItem: { connect: { id: matchedMenuItem.id } },
            menuItemName: matchedMenuItem.name,
            quantity: inboundItem.quantity,
            unitPrice: unitPrice,
            modifiersPrice: 0,
            totalPrice,
            specialInstructions: inboundItem.specialInstructions,
            fulfillmentStatus: 'SENT',
            sentToKitchenAt: new Date(),
          });
        }

        if (unknownItems.length > 0 || orderItemsData.length === 0) {
          const reason = unknownItems.length > 0
            ? `Unmapped marketplace items: ${unknownItems.map((item) => item.name).join(', ')}`
            : 'Marketplace payload contained no mappable order items';

          await prisma.marketplaceOrder.update({
            where: { id: marketplaceOrder.id },
            data: {
              status: 'HOLD_FOR_REVIEW',
              lastEventId: externalEventId,
              rawPayload: jsonPayload,
            },
          });

          await markOutcome('PROCESSED_HOLD_FOR_REVIEW', reason);
          return {
            status: 'hold_for_review' as const,
            message: reason,
            orderId: undefined,
            unmappedItems: unknownItems,
          };
        }

        subtotal = toRoundedMoney(subtotal);
        const tax = toRoundedMoney(normalized.tax ?? 0);
        const tip = toRoundedMoney(normalized.tip ?? 0);
        const deliveryFee = toRoundedMoney(normalized.deliveryFee ?? 0);

        const fallbackTotal = toRoundedMoney(subtotal + tax + tip + deliveryFee);
        const total = toRoundedMoney(normalized.total ?? fallbackTotal);

        const createdOrder = await prisma.order.create({
          data: {
            restaurantId: integration.restaurantId,
            customerId,
            orderNumber: generateOrderNumber(),
            orderType: 'delivery',
            orderSource: providerToOrderSource(provider),
            status: 'pending',
            subtotal,
            tax,
            tip,
            deliveryFee,
            total,
            paymentMethod: 'marketplace',
            paymentStatus: 'paid',
            specialInstructions: normalized.specialInstructions,
            deliveryAddress: normalized.deliveryAddress.line1,
            deliveryAddress2: normalized.deliveryAddress.line2,
            deliveryCity: normalized.deliveryAddress.city,
            deliveryStateUs: normalized.deliveryAddress.state,
            deliveryZip: normalized.deliveryAddress.zip,
            deliveryNotes: normalized.deliveryAddress.instructions,
            deliveryStatus: 'PREPARING',
            orderItems: { create: orderItemsData },
          },
          include: ORDER_INCLUDE,
        });

        await prisma.marketplaceOrder.update({
          where: { id: marketplaceOrder.id },
          data: {
            orderId: createdOrder.id,
          },
        });

        linkedOrderId = createdOrder.id;
        broadcastOrderEvent(createdOrder.restaurantId, 'order:new', enrichOrderResponse(createdOrder));
      } else if (!linkedOrderId && normalized.items.length === 0) {
        const reason = 'Marketplace payload contained no items';
        await prisma.marketplaceOrder.update({
          where: { id: marketplaceOrder.id },
          data: {
            status: 'HOLD_FOR_REVIEW',
            lastEventId: externalEventId,
            rawPayload: jsonPayload,
          },
        });
        await markOutcome('PROCESSED_HOLD_FOR_REVIEW', reason);
        return {
          status: 'hold_for_review' as const,
          message: reason,
          orderId: undefined,
        };
      }

      if (linkedOrderId && normalized.orderStatus) {
        await applyMarketplaceStatusToOrder(linkedOrderId, normalized.orderStatus);
      }

      await markOutcome('PROCESSED');

      return {
        status: 'processed' as const,
        message: linkedOrderId
          ? `Processed webhook and linked order ${linkedOrderId}`
          : 'Processed webhook event',
        orderId: linkedOrderId ?? undefined,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Webhook processing failed';
      await markOutcome('FAILED', message);
      throw error;
    }
  },
};
