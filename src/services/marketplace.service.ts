import crypto from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { broadcastToSourceAndKDS } from './socket.service';
import { enrichOrderResponse } from '../utils/order-enrichment';

const prisma = new PrismaClient();

const ENCRYPTION_KEY_ENV = 'DELIVERY_CREDENTIALS_ENCRYPTION_KEY';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

const ORDER_INCLUDE = {
  orderItems: { include: { modifiers: true } },
  customer: true,
  table: true,
  marketplaceOrder: true,
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

export type MarketplaceSyncJobState = 'QUEUED' | 'PROCESSING' | 'FAILED' | 'SUCCESS' | 'DEAD_LETTER';

export interface MarketplaceStatusSyncJobSummary {
  id: string;
  provider: MarketplaceProvider;
  externalOrderId: string;
  targetStatus: string;
  status: MarketplaceSyncJobState;
  attemptCount: number;
  nextAttemptAt: string;
  completedAt: string | null;
  lastError: string | null;
  updatedAt: string;
}

export interface MarketplacePilotGateThresholds {
  maxDeadLetterCount: number;
  maxBadSignatureCount: number;
  maxHoldForReviewCount: number;
  maxWebhookFailedCount: number;
  minTerminalSampleSize: number;
  minSuccessRatePercent: number;
}

export interface MarketplaceWebhookPilotStats {
  total: number;
  processed: number;
  holdForReview: number;
  failed: number;
  badSignature: number;
  ignoredNoIntegration: number;
  ignoredNoOrderId: number;
}

export interface MarketplaceSyncPilotStats {
  total: number;
  queued: number;
  processing: number;
  failed: number;
  success: number;
  deadLetter: number;
  terminalCount: number;
  successRatePercent: number | null;
}

export interface MarketplacePilotProviderSummary {
  provider: MarketplaceProvider;
  webhook: MarketplaceWebhookPilotStats;
  sync: MarketplaceSyncPilotStats;
  go: boolean;
  reasons: string[];
}

export interface MarketplacePilotRolloutSummary {
  restaurantId: string;
  windowHours: number;
  since: string;
  generatedAt: string;
  thresholds: MarketplacePilotGateThresholds;
  providers: MarketplacePilotProviderSummary[];
  go: boolean;
  reasons: string[];
}

interface MarketplaceSyncProviderRequest {
  externalOrderId: string;
  targetStatus: string;
  payload: Prisma.InputJsonValue | null;
}

class MarketplaceStatusSyncError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'MarketplaceStatusSyncError';
  }
}

const OUTBOUND_SUPPORTED_PROVIDERS: MarketplaceProvider[] = ['doordash_marketplace', 'ubereats'];
const DEFAULT_MAX_SYNC_ATTEMPTS = 5;
const DEFAULT_PILOT_WINDOW_HOURS = 24;
const DEFAULT_MAX_DEAD_LETTER_COUNT = 0;
const DEFAULT_MAX_BAD_SIGNATURE_COUNT = 0;
const DEFAULT_MAX_HOLD_FOR_REVIEW_COUNT = 0;
const DEFAULT_MAX_WEBHOOK_FAILED_COUNT = 0;
const DEFAULT_MIN_TERMINAL_SAMPLE_SIZE = 5;
const DEFAULT_MIN_SUCCESS_RATE_PERCENT = 95;

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
  const secret = process.env[ENCRYPTION_KEY_ENV];
  if (!secret) {
    throw new Error(`FATAL: ${ENCRYPTION_KEY_ENV} environment variable is not set. Cannot encrypt/decrypt marketplace credentials.`);
  }
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

function mapInternalOrderStatusToMarketplaceStatus(
  orderStatus: string,
): string | null {
  switch (orderStatus) {
    case 'pending':
      return 'PENDING';
    case 'confirmed':
      return 'ACCEPTED';
    case 'preparing':
      return 'PREPARING';
    case 'ready':
      return 'READY_FOR_PICKUP';
    case 'completed':
      return 'COMPLETED';
    case 'cancelled':
      return 'CANCELLED';
    default:
      return null;
  }
}

function maxSyncAttempts(): number {
  const parsed = Number.parseInt(String(process.env.MARKETPLACE_STATUS_SYNC_MAX_ATTEMPTS ?? DEFAULT_MAX_SYNC_ATTEMPTS), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MAX_SYNC_ATTEMPTS;
  return parsed;
}

function backoffMsForAttempt(attemptCount: number): number {
  const base = 10_000;
  const max = 15 * 60_000;
  const value = base * Math.pow(2, Math.max(attemptCount - 1, 0));
  return Math.min(value, max);
}

function normalizeSyncState(value: string): MarketplaceSyncJobState {
  if (value === 'QUEUED' || value === 'PROCESSING' || value === 'FAILED' || value === 'SUCCESS' || value === 'DEAD_LETTER') {
    return value;
  }
  return 'QUEUED';
}

function toSyncJobSummary(job: {
  id: string;
  provider: string;
  externalOrderId: string;
  targetStatus: string;
  status: string;
  attemptCount: number;
  nextAttemptAt: Date;
  completedAt: Date | null;
  lastError: string | null;
  updatedAt: Date;
}): MarketplaceStatusSyncJobSummary {
  return {
    id: job.id,
    provider: normalizeProvider(job.provider),
    externalOrderId: job.externalOrderId,
    targetStatus: job.targetStatus,
    status: normalizeSyncState(job.status),
    attemptCount: job.attemptCount,
    nextAttemptAt: job.nextAttemptAt.toISOString(),
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    lastError: job.lastError,
    updatedAt: job.updatedAt.toISOString(),
  };
}

function makeSyncPayload(orderId: string, sourceStatus: string, targetStatus: string): Prisma.InputJsonValue {
  return {
    orderId,
    sourceStatus,
    targetStatus,
    requestedAt: new Date().toISOString(),
  };
}

function buildDoorDashStatusUrl(externalOrderId: string): string {
  const template = process.env.DOORDASH_MARKETPLACE_STATUS_URL_TEMPLATE;
  if (template && template.includes('{externalOrderId}')) {
    return template.replace('{externalOrderId}', encodeURIComponent(externalOrderId));
  }
  const base = process.env.DOORDASH_MARKETPLACE_BASE_URL || 'https://openapi.doordash.com';
  return `${base}/marketplace/v1/orders/${encodeURIComponent(externalOrderId)}/status`;
}

function buildUberEatsStatusUrl(externalOrderId: string): string {
  const template = process.env.UBER_EATS_STATUS_URL_TEMPLATE;
  if (template && template.includes('{externalOrderId}')) {
    return template.replace('{externalOrderId}', encodeURIComponent(externalOrderId));
  }
  const base = process.env.UBER_EATS_BASE_URL || 'https://api.uber.com/v1/eats';
  return `${base}/orders/${encodeURIComponent(externalOrderId)}/status`;
}

async function pushDoorDashMarketplaceStatus(request: MarketplaceSyncProviderRequest): Promise<void> {
  const token = process.env.DOORDASH_MARKETPLACE_API_KEY || process.env.DOORDASH_API_KEY;
  if (!token) {
    throw new MarketplaceStatusSyncError('DoorDash Marketplace API key is not configured', false);
  }

  const response = await fetch(buildDoorDashStatusUrl(request.externalOrderId), {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      status: request.targetStatus,
      metadata: request.payload ?? undefined,
    }),
  });

  if (!response.ok) {
    const retryable = response.status >= 500 || response.status === 429;
    const body = await response.text();
    throw new MarketplaceStatusSyncError(
      `DoorDash status push failed (${response.status}): ${body || response.statusText}`,
      retryable,
      response.status,
    );
  }
}

async function pushUberEatsStatus(request: MarketplaceSyncProviderRequest): Promise<void> {
  const token = process.env.UBER_EATS_ACCESS_TOKEN || process.env.UBER_CLIENT_SECRET;
  if (!token) {
    throw new MarketplaceStatusSyncError('Uber Eats access token is not configured', false);
  }

  const response = await fetch(buildUberEatsStatusUrl(request.externalOrderId), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      status: request.targetStatus,
      metadata: request.payload ?? undefined,
    }),
  });

  if (!response.ok) {
    const retryable = response.status >= 500 || response.status === 429;
    const body = await response.text();
    throw new MarketplaceStatusSyncError(
      `Uber Eats status push failed (${response.status}): ${body || response.statusText}`,
      retryable,
      response.status,
    );
  }
}

async function pushMarketplaceOrderStatus(provider: MarketplaceProvider, request: MarketplaceSyncProviderRequest): Promise<void> {
  if (provider === 'doordash_marketplace') {
    await pushDoorDashMarketplaceStatus(request);
    return;
  }
  if (provider === 'ubereats') {
    await pushUberEatsStatus(request);
    return;
  }
  throw new MarketplaceStatusSyncError(`Outbound status sync not supported for provider: ${provider}`, false);
}

function toSyncError(error: unknown): MarketplaceStatusSyncError {
  if (error instanceof MarketplaceStatusSyncError) return error;
  if (error instanceof Error) return new MarketplaceStatusSyncError(error.message, true);
  return new MarketplaceStatusSyncError('Unknown status sync error', true);
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const parsed = Math.trunc(value);
  return Math.min(Math.max(parsed, min), max);
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return clampInt(parsed, min, max);
}

function normalizePilotWindowHours(hours?: number): number {
  if (typeof hours !== 'number') return DEFAULT_PILOT_WINDOW_HOURS;
  return clampInt(hours, 1, 24 * 14);
}

function resolvePilotThresholds(): MarketplacePilotGateThresholds {
  return {
    maxDeadLetterCount: envInt('MARKETPLACE_PILOT_MAX_DEAD_LETTER', DEFAULT_MAX_DEAD_LETTER_COUNT, 0, 10_000),
    maxBadSignatureCount: envInt('MARKETPLACE_PILOT_MAX_BAD_SIGNATURE', DEFAULT_MAX_BAD_SIGNATURE_COUNT, 0, 10_000),
    maxHoldForReviewCount: envInt('MARKETPLACE_PILOT_MAX_HOLD_FOR_REVIEW', DEFAULT_MAX_HOLD_FOR_REVIEW_COUNT, 0, 10_000),
    maxWebhookFailedCount: envInt('MARKETPLACE_PILOT_MAX_WEBHOOK_FAILED', DEFAULT_MAX_WEBHOOK_FAILED_COUNT, 0, 10_000),
    minTerminalSampleSize: envInt('MARKETPLACE_PILOT_MIN_TERMINAL_SAMPLE', DEFAULT_MIN_TERMINAL_SAMPLE_SIZE, 1, 10_000),
    minSuccessRatePercent: envInt('MARKETPLACE_PILOT_MIN_SUCCESS_RATE_PERCENT', DEFAULT_MIN_SUCCESS_RATE_PERCENT, 1, 100),
  };
}

function toPercent(value: number): number {
  return Number((value * 100).toFixed(2));
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

  broadcastToSourceAndKDS(updated.restaurantId, updated.sourceDeviceId, 'order:updated', enrichOrderResponse(updated));
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

  async enqueueStatusSyncForOrder(orderId: string): Promise<{ queued: boolean; reason: string }> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        marketplaceOrder: true,
      },
    });

    if (!order || !order.marketplaceOrder) {
      return { queued: false, reason: 'Order is not linked to a marketplace order' };
    }

    const marketplaceOrder = order.marketplaceOrder;
    const provider = normalizeProvider(marketplaceOrder.provider);
    if (!OUTBOUND_SUPPORTED_PROVIDERS.includes(provider)) {
      return { queued: false, reason: 'Provider does not support outbound status sync' };
    }

    const targetStatus = mapInternalOrderStatusToMarketplaceStatus(order.status);
    if (!targetStatus) {
      return { queued: false, reason: `Order status '${order.status}' is not mapped for outbound sync` };
    }

    if (
      marketplaceOrder.lastPushedStatus === targetStatus
      && (marketplaceOrder.lastPushResult ?? '').toUpperCase() === 'SUCCESS'
    ) {
      return { queued: false, reason: 'Target status already synced successfully' };
    }

    const payload = makeSyncPayload(order.id, order.status, targetStatus);

    await prisma.marketplaceStatusSyncJob.upsert({
      where: {
        marketplaceOrderId_targetStatus: {
          marketplaceOrderId: marketplaceOrder.id,
          targetStatus,
        },
      },
      update: {
        status: 'QUEUED',
        nextAttemptAt: new Date(),
        attemptCount: 0,
        completedAt: null,
        lastError: null,
        payload,
      },
      create: {
        restaurantId: marketplaceOrder.restaurantId,
        marketplaceOrderId: marketplaceOrder.id,
        provider,
        externalOrderId: marketplaceOrder.externalOrderId,
        targetStatus,
        status: 'QUEUED',
        payload,
      },
    });

    return { queued: true, reason: `Queued outbound status sync to ${targetStatus}` };
  },

  async listStatusSyncJobs(
    restaurantId: string,
    options?: { status?: MarketplaceSyncJobState; limit?: number },
  ): Promise<MarketplaceStatusSyncJobSummary[]> {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);

    const jobs = await prisma.marketplaceStatusSyncJob.findMany({
      where: {
        restaurantId,
        ...(options?.status ? { status: options.status } : {}),
      },
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });

    return jobs.map((job) => toSyncJobSummary(job));
  },

  async getPilotRolloutSummary(
    restaurantId: string,
    options?: { provider?: MarketplaceProvider; windowHours?: number },
  ): Promise<MarketplacePilotRolloutSummary> {
    const windowHours = normalizePilotWindowHours(options?.windowHours);
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const thresholds = resolvePilotThresholds();
    const providers: MarketplaceProvider[] = options?.provider
      ? [options.provider]
      : [...OUTBOUND_SUPPORTED_PROVIDERS];

    const providerSummaries = await Promise.all(
      providers.map(async (provider): Promise<MarketplacePilotProviderSummary> => {
        const webhookWhere: Prisma.MarketplaceWebhookEventWhereInput = {
          restaurantId,
          provider,
          receivedAt: { gte: since },
        };

        const syncWhere: Prisma.MarketplaceStatusSyncJobWhereInput = {
          restaurantId,
          provider,
          createdAt: { gte: since },
        };

        const [
          webhookTotal,
          webhookProcessed,
          webhookHoldForReview,
          webhookFailed,
          webhookBadSignature,
          webhookIgnoredNoIntegration,
          webhookIgnoredNoOrderId,
          syncTotal,
          syncQueued,
          syncProcessing,
          syncFailed,
          syncSuccess,
          syncDeadLetter,
        ] = await Promise.all([
          prisma.marketplaceWebhookEvent.count({ where: webhookWhere }),
          prisma.marketplaceWebhookEvent.count({ where: { ...webhookWhere, outcome: 'PROCESSED' } }),
          prisma.marketplaceWebhookEvent.count({ where: { ...webhookWhere, outcome: 'PROCESSED_HOLD_FOR_REVIEW' } }),
          prisma.marketplaceWebhookEvent.count({ where: { ...webhookWhere, outcome: 'FAILED' } }),
          prisma.marketplaceWebhookEvent.count({ where: { ...webhookWhere, outcome: 'REJECTED_BAD_SIGNATURE' } }),
          prisma.marketplaceWebhookEvent.count({ where: { ...webhookWhere, outcome: 'IGNORED_NO_INTEGRATION' } }),
          prisma.marketplaceWebhookEvent.count({ where: { ...webhookWhere, outcome: 'IGNORED_NO_ORDER_ID' } }),
          prisma.marketplaceStatusSyncJob.count({ where: syncWhere }),
          prisma.marketplaceStatusSyncJob.count({ where: { ...syncWhere, status: 'QUEUED' } }),
          prisma.marketplaceStatusSyncJob.count({ where: { ...syncWhere, status: 'PROCESSING' } }),
          prisma.marketplaceStatusSyncJob.count({ where: { ...syncWhere, status: 'FAILED' } }),
          prisma.marketplaceStatusSyncJob.count({ where: { ...syncWhere, status: 'SUCCESS' } }),
          prisma.marketplaceStatusSyncJob.count({ where: { ...syncWhere, status: 'DEAD_LETTER' } }),
        ]);

        const terminalCount = syncSuccess + syncDeadLetter;
        const successRatePercent = terminalCount > 0
          ? toPercent(syncSuccess / terminalCount)
          : null;

        const reasons: string[] = [];
        if (syncDeadLetter > thresholds.maxDeadLetterCount) {
          reasons.push(`dead-letter sync jobs ${syncDeadLetter} exceeded ${thresholds.maxDeadLetterCount}`);
        }
        if (webhookBadSignature > thresholds.maxBadSignatureCount) {
          reasons.push(`bad-signature webhooks ${webhookBadSignature} exceeded ${thresholds.maxBadSignatureCount}`);
        }
        if (webhookHoldForReview > thresholds.maxHoldForReviewCount) {
          reasons.push(`hold-for-review webhooks ${webhookHoldForReview} exceeded ${thresholds.maxHoldForReviewCount}`);
        }
        if (webhookFailed > thresholds.maxWebhookFailedCount) {
          reasons.push(`failed webhooks ${webhookFailed} exceeded ${thresholds.maxWebhookFailedCount}`);
        }
        if (terminalCount < thresholds.minTerminalSampleSize) {
          reasons.push(`terminal sync sample ${terminalCount} is below minimum ${thresholds.minTerminalSampleSize}`);
        } else if ((successRatePercent ?? 0) < thresholds.minSuccessRatePercent) {
          reasons.push(`terminal sync success rate ${successRatePercent}% below ${thresholds.minSuccessRatePercent}%`);
        }

        return {
          provider,
          webhook: {
            total: webhookTotal,
            processed: webhookProcessed,
            holdForReview: webhookHoldForReview,
            failed: webhookFailed,
            badSignature: webhookBadSignature,
            ignoredNoIntegration: webhookIgnoredNoIntegration,
            ignoredNoOrderId: webhookIgnoredNoOrderId,
          },
          sync: {
            total: syncTotal,
            queued: syncQueued,
            processing: syncProcessing,
            failed: syncFailed,
            success: syncSuccess,
            deadLetter: syncDeadLetter,
            terminalCount,
            successRatePercent,
          },
          go: reasons.length === 0,
          reasons,
        };
      }),
    );

    const reasons = providerSummaries
      .flatMap(summary => summary.reasons.map(reason => `${summary.provider}: ${reason}`));

    return {
      restaurantId,
      windowHours,
      since: since.toISOString(),
      generatedAt: new Date().toISOString(),
      thresholds,
      providers: providerSummaries,
      go: reasons.length === 0,
      reasons,
    };
  },

  async retryStatusSyncJob(restaurantId: string, jobId: string): Promise<MarketplaceStatusSyncJobSummary | null> {
    const job = await prisma.marketplaceStatusSyncJob.findFirst({
      where: { id: jobId, restaurantId },
    });
    if (!job) return null;

    const reset = await prisma.marketplaceStatusSyncJob.update({
      where: { id: job.id },
      data: {
        status: 'QUEUED',
        nextAttemptAt: new Date(),
        attemptCount: 0,
        completedAt: null,
        lastError: null,
      },
    });

    return toSyncJobSummary(reset);
  },

  async processDueStatusSyncJobs(params?: { restaurantId?: string; limit?: number }): Promise<{
    scanned: number;
    processed: number;
    succeeded: number;
    failed: number;
    deadLettered: number;
  }> {
    const now = new Date();
    const limit = Math.min(Math.max(params?.limit ?? 20, 1), 100);

    const candidates = await prisma.marketplaceStatusSyncJob.findMany({
      where: {
        ...(params?.restaurantId ? { restaurantId: params.restaurantId } : {}),
        status: { in: ['QUEUED', 'FAILED'] },
        nextAttemptAt: { lte: now },
      },
      orderBy: [
        { nextAttemptAt: 'asc' },
        { createdAt: 'asc' },
      ],
      take: limit,
      include: {
        marketplaceOrder: {
          include: {
            integration: true,
          },
        },
      },
    });

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let deadLettered = 0;

    for (const candidate of candidates) {
      const claimed = await prisma.marketplaceStatusSyncJob.updateMany({
        where: {
          id: candidate.id,
          status: { in: ['QUEUED', 'FAILED'] },
        },
        data: {
          status: 'PROCESSING',
        },
      });

      if (claimed.count === 0) continue;
      processed += 1;

      try {
        if (!candidate.marketplaceOrder) {
          throw new MarketplaceStatusSyncError('Marketplace order reference is missing', false);
        }

        const provider = normalizeProvider(candidate.provider);
        if (!OUTBOUND_SUPPORTED_PROVIDERS.includes(provider)) {
          throw new MarketplaceStatusSyncError(`Outbound sync unsupported for provider: ${provider}`, false);
        }

        if (!candidate.marketplaceOrder.integration || !candidate.marketplaceOrder.integration.enabled) {
          throw new MarketplaceStatusSyncError('Marketplace integration is disabled or missing', false);
        }

        await pushMarketplaceOrderStatus(provider, {
          externalOrderId: candidate.externalOrderId,
          targetStatus: candidate.targetStatus,
          payload: candidate.payload as Prisma.InputJsonValue | null,
        });

        await prisma.$transaction([
          prisma.marketplaceStatusSyncJob.update({
            where: { id: candidate.id },
            data: {
              status: 'SUCCESS',
              attemptCount: candidate.attemptCount + 1,
              completedAt: new Date(),
              lastError: null,
            },
          }),
          prisma.marketplaceOrder.update({
            where: { id: candidate.marketplaceOrderId },
            data: {
              lastPushedStatus: candidate.targetStatus,
              lastPushAt: new Date(),
              lastPushResult: 'SUCCESS',
              lastPushError: null,
            },
          }),
        ]);

        succeeded += 1;
      } catch (error: unknown) {
        const syncError = toSyncError(error);
        const nextAttemptCount = candidate.attemptCount + 1;
        const canRetry = syncError.retryable && nextAttemptCount < maxSyncAttempts();

        if (canRetry) {
          await prisma.$transaction([
            prisma.marketplaceStatusSyncJob.update({
              where: { id: candidate.id },
              data: {
                status: 'FAILED',
                attemptCount: nextAttemptCount,
                nextAttemptAt: new Date(Date.now() + backoffMsForAttempt(nextAttemptCount)),
                lastError: syncError.message,
              },
            }),
            prisma.marketplaceOrder.update({
              where: { id: candidate.marketplaceOrderId },
              data: {
                lastPushAt: new Date(),
                lastPushResult: 'FAILED_RETRYING',
                lastPushError: syncError.message,
              },
            }),
          ]);
          failed += 1;
        } else {
          await prisma.$transaction([
            prisma.marketplaceStatusSyncJob.update({
              where: { id: candidate.id },
              data: {
                status: 'DEAD_LETTER',
                attemptCount: nextAttemptCount,
                completedAt: new Date(),
                lastError: syncError.message,
              },
            }),
            prisma.marketplaceOrder.update({
              where: { id: candidate.marketplaceOrderId },
              data: {
                lastPushAt: new Date(),
                lastPushResult: 'FAILED',
                lastPushError: syncError.message,
              },
            }),
          ]);
          deadLettered += 1;
        }
      }
    }

    return {
      scanned: candidates.length,
      processed,
      succeeded,
      failed,
      deadLettered,
    };
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
        : provider === 'ubereats'
          ? getHeaderValue(headers, 'x-uber-signature') ?? getHeaderValue(headers, 'x-uber-eats-signature')
          : getHeaderValue(headers, 'x-grubhub-signature');

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
        broadcastToSourceAndKDS(createdOrder.restaurantId, createdOrder.sourceDeviceId, 'order:new', enrichOrderResponse(createdOrder));
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
