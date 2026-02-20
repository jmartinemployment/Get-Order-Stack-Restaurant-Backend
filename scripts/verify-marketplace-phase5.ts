import crypto from 'node:crypto';

type Provider = 'doordash_marketplace' | 'ubereats' | 'grubhub';
type Mode = 'all' | 'contract' | 'e2e';

interface LoginRestaurant {
  id: string;
  slug?: string;
  role?: string;
}

interface LoginResponse {
  token: string;
  restaurants: LoginRestaurant[];
}

interface AuthContext {
  token: string;
  restaurantId: string;
  provider: Provider;
  externalStoreId: string;
  webhookSecret: string;
}

interface CheckResult {
  name: string;
  passed: boolean;
  details?: string;
}

interface JsonObject {
  [key: string]: unknown;
}

const API_BASE_URL = normalizeApiBase(
  process.env.MARKETPLACE_VERIFY_API_BASE_URL
  || process.env.API_BASE_URL
  || 'http://localhost:3000',
);
const PROVIDER = normalizeProvider(process.env.MARKETPLACE_VERIFY_PROVIDER ?? 'doordash_marketplace');

const MODE = normalizeMode(process.argv[2] ?? process.env.MARKETPLACE_VERIFY_MODE ?? 'all');
const EMAIL = process.env.MARKETPLACE_VERIFY_EMAIL ?? process.env.AUTH_EMAIL ?? 'owner@taipa.com';
const PASSWORD = process.env.MARKETPLACE_VERIFY_PASSWORD ?? process.env.AUTH_PASSWORD ?? 'owner123';

const EXTERNAL_STORE_ID = process.env.MARKETPLACE_VERIFY_STORE_ID ?? `phase5-store-${Date.now().toString(36)}`;
const WEBHOOK_SECRET = process.env.MARKETPLACE_VERIFY_WEBHOOK_SECRET ?? randomString('phase5-secret');

function normalizeApiBase(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/api')) return trimmed;
  return `${trimmed}/api`;
}

function normalizeProvider(value: string): Provider {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'doordash_marketplace' || normalized === 'ubereats' || normalized === 'grubhub') {
    return normalized;
  }
  throw new Error(`Unsupported provider: ${value}`);
}

function normalizeMode(value: string): Mode {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'all' || normalized === 'contract' || normalized === 'e2e') return normalized;
  throw new Error(`Unsupported mode: ${value}`);
}

function randomString(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  try {
    return await response.text();
  } catch {
    return '';
  }
}

async function apiRequest(
  method: string,
  path: string,
  options?: {
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
    rawBody?: string;
  },
): Promise<{ response: Response; body: unknown }> {
  const headers: Record<string, string> = {
    ...(options?.headers ?? {}),
  };

  if (options?.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let body: string | undefined;
  if (options?.rawBody !== undefined) {
    body = options.rawBody;
  } else if (options?.body !== undefined) {
    body = JSON.stringify(options.body);
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body,
  });

  return {
    response,
    body: await readBody(response),
  };
}

function asJsonObject(value: unknown): JsonObject {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function signatureHeaderName(provider: Provider): string {
  if (provider === 'doordash_marketplace') return 'x-doordash-signature';
  if (provider === 'ubereats') return 'x-uber-signature';
  return 'x-grubhub-signature';
}

function webhookPath(provider: Provider): string {
  if (provider === 'doordash_marketplace') return '/webhooks/doordash-marketplace';
  if (provider === 'ubereats') return '/webhooks/ubereats';
  return '/webhooks/grubhub';
}

function signPayload(rawBody: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
}

function buildWebhookPayload(
  provider: Provider,
  input: {
    eventId: string;
    externalOrderId: string;
    externalStoreId: string;
    orderStatus: string;
    externalItemId?: string;
    externalItemName?: string;
    includeItems: boolean;
  },
): JsonObject {
  if (provider === 'doordash_marketplace') {
    return {
      event_type: 'order.updated',
      event_id: input.eventId,
      store: { id: input.externalStoreId },
      order: {
        id: input.externalOrderId,
        status: input.orderStatus,
        subtotal: 1299,
        tax: 104,
        delivery_fee: 250,
        total: 1653,
        customer: {
          first_name: 'Phase',
          last_name: 'Five',
          phone: '+15555550101',
          email: 'phase5@example.com',
        },
        delivery_address: {
          street: '123 Phase5 Ave',
          city: 'Miami',
          state: 'FL',
          zip: '33101',
        },
        items: input.includeItems ? [{
          merchant_supplied_id: input.externalItemId ?? randomString('ext-item'),
          name: input.externalItemName ?? 'Phase 5 Item',
          quantity: 1,
          unit_price: 1299,
        }] : [],
      },
    };
  }

  if (provider === 'ubereats') {
    return {
      type: 'orders.notification',
      id: input.eventId,
      store_id: input.externalStoreId,
      data: {
        status: input.orderStatus,
        order: {
          id: input.externalOrderId,
          customer: {
            first_name: 'Phase',
            last_name: 'Five',
            phone: '+15555550101',
            email: 'phase5@example.com',
          },
          delivery_address: {
            line1: '123 Phase5 Ave',
            city: 'Miami',
            state: 'FL',
            zip: '33101',
          },
          items: input.includeItems ? [{
            external_id: input.externalItemId ?? randomString('ext-item'),
            name: input.externalItemName ?? 'Phase 5 Item',
            quantity: 1,
            price: 1299,
          }] : [],
          subtotal: 1299,
          tax: 104,
          delivery_fee: 250,
          total: 1653,
        },
      },
    };
  }

  return {
    event_type: 'order.updated',
    event_id: input.eventId,
    store_id: input.externalStoreId,
    order_id: input.externalOrderId,
    status: input.orderStatus,
  };
}

async function ensureAuthContext(): Promise<AuthContext> {
  const configuredToken = asString(process.env.MARKETPLACE_VERIFY_TOKEN ?? process.env.AUTH_TOKEN);
  const configuredRestaurantId = asString(process.env.MARKETPLACE_VERIFY_RESTAURANT_ID ?? process.env.RESTAURANT_ID);

  if (configuredToken && configuredRestaurantId) {
    return {
      token: configuredToken,
      restaurantId: configuredRestaurantId,
      provider: PROVIDER,
      externalStoreId: EXTERNAL_STORE_ID,
      webhookSecret: WEBHOOK_SECRET,
    };
  }

  const login = await apiRequest('POST', '/auth/login', {
    body: {
      email: EMAIL,
      password: PASSWORD,
    },
  });

  if (!login.response.ok) {
    throw new Error(`Login failed (${login.response.status}): ${JSON.stringify(login.body)}`);
  }

  const loginJson = asJsonObject(login.body) as unknown as LoginResponse;
  const token = asString(loginJson.token);
  if (!token) {
    throw new Error('Login response missing token');
  }

  const restaurants = asArray(loginJson.restaurants)
    .map(asJsonObject)
    .map(entry => ({ id: asString(entry.id) ?? '' }))
    .filter(entry => entry.id.length > 0);

  const restaurantId = configuredRestaurantId ?? restaurants[0]?.id;
  if (!restaurantId) {
    throw new Error('No restaurant available for verification');
  }

  return {
    token,
    restaurantId,
    provider: PROVIDER,
    externalStoreId: EXTERNAL_STORE_ID,
    webhookSecret: WEBHOOK_SECRET,
  };
}

async function ensureIntegration(context: AuthContext): Promise<void> {
  const response = await apiRequest(
    'PUT',
    `/restaurant/${context.restaurantId}/marketplace/integrations/${context.provider}`,
    {
      token: context.token,
      body: {
        enabled: true,
        externalStoreId: context.externalStoreId,
        webhookSigningSecret: context.webhookSecret,
      },
    },
  );

  if (!response.response.ok) {
    throw new Error(`Failed to configure marketplace integration: ${JSON.stringify(response.body)}`);
  }
}

async function postWebhook(
  provider: Provider,
  payload: JsonObject,
  webhookSecret: string,
  options?: { invalidSignature?: boolean },
): Promise<{ statusCode: number; body: unknown }> {
  const rawBody = JSON.stringify(payload);
  const signature = options?.invalidSignature
    ? 'invalid-signature'
    : signPayload(rawBody, webhookSecret);

  const response = await apiRequest('POST', webhookPath(provider), {
    rawBody,
    headers: {
      'Content-Type': 'application/json',
      [signatureHeaderName(provider)]: signature,
    },
  });

  return {
    statusCode: response.response.status,
    body: response.body,
  };
}

async function runContractChecks(context: AuthContext): Promise<CheckResult[]> {
  console.log('\n[Phase5] Running webhook contract checks...');
  await ensureIntegration(context);

  const orderId = randomString('phase5-contract-order');
  const eventId = randomString('phase5-contract-event');

  const validPayload = buildWebhookPayload(context.provider, {
    eventId,
    externalOrderId: orderId,
    externalStoreId: context.externalStoreId,
    orderStatus: 'PENDING',
    includeItems: false,
  });

  const valid = await postWebhook(context.provider, validPayload, context.webhookSecret);
  const validBody = asJsonObject(valid.body);

  const duplicate = await postWebhook(context.provider, validPayload, context.webhookSecret);
  const duplicateBody = asJsonObject(duplicate.body);

  const invalidPayload = buildWebhookPayload(context.provider, {
    eventId: randomString('phase5-invalid-event'),
    externalOrderId: randomString('phase5-invalid-order'),
    externalStoreId: context.externalStoreId,
    orderStatus: 'PENDING',
    includeItems: false,
  });
  const invalid = await postWebhook(context.provider, invalidPayload, context.webhookSecret, { invalidSignature: true });

  const outOfOrderOrderId = randomString('phase5-outoforder-order');
  const outOfOrderFirst = await postWebhook(
    context.provider,
    buildWebhookPayload(context.provider, {
      eventId: randomString('phase5-ooo-first'),
      externalOrderId: outOfOrderOrderId,
      externalStoreId: context.externalStoreId,
      orderStatus: 'READY_FOR_PICKUP',
      includeItems: false,
    }),
    context.webhookSecret,
  );

  const outOfOrderSecond = await postWebhook(
    context.provider,
    buildWebhookPayload(context.provider, {
      eventId: randomString('phase5-ooo-second'),
      externalOrderId: outOfOrderOrderId,
      externalStoreId: context.externalStoreId,
      orderStatus: 'ACCEPTED',
      includeItems: false,
    }),
    context.webhookSecret,
  );

  return [
    {
      name: 'valid webhook accepted',
      passed: valid.statusCode === 200 && Boolean(asString(validBody.status)),
      details: `status=${valid.statusCode} body.status=${asString(validBody.status) ?? 'n/a'}`,
    },
    {
      name: 'duplicate webhook idempotency',
      passed: duplicate.statusCode === 200 && asString(duplicateBody.status) === 'duplicate',
      details: `status=${duplicate.statusCode} body.status=${asString(duplicateBody.status) ?? 'n/a'}`,
    },
    {
      name: 'invalid signature rejected',
      passed: invalid.statusCode === 400,
      details: `status=${invalid.statusCode}`,
    },
    {
      name: 'out-of-order events tolerated',
      passed: outOfOrderFirst.statusCode === 200 && outOfOrderSecond.statusCode === 200,
      details: `first=${outOfOrderFirst.statusCode} second=${outOfOrderSecond.statusCode}`,
    },
  ];
}

async function getFirstMenuItemId(context: AuthContext): Promise<{ id: string; name: string }> {
  const menuResponse = await apiRequest('GET', `/restaurant/${context.restaurantId}/menu/items`);
  if (!menuResponse.response.ok) {
    throw new Error(`Failed to load menu items: ${JSON.stringify(menuResponse.body)}`);
  }

  const items = asArray(menuResponse.body).map(asJsonObject);
  const first = items.find(item => asString(item.id) && (item.available !== false));
  if (!first) throw new Error('No menu items found for e2e verification');

  return {
    id: asString(first.id)!,
    name: asString(first.name) ?? 'Menu Item',
  };
}

async function upsertMenuMapping(
  context: AuthContext,
  payload: { externalItemId: string; externalItemName: string; menuItemId: string },
): Promise<void> {
  const response = await apiRequest(
    'POST',
    `/restaurant/${context.restaurantId}/marketplace/menu-mappings`,
    {
      token: context.token,
      body: {
        provider: context.provider,
        externalItemId: payload.externalItemId,
        externalItemName: payload.externalItemName,
        menuItemId: payload.menuItemId,
      },
    },
  );

  if (!response.response.ok) {
    throw new Error(`Failed to upsert menu mapping: ${JSON.stringify(response.body)}`);
  }
}

async function patchOrderStatus(context: AuthContext, orderId: string, status: string): Promise<void> {
  const response = await apiRequest(
    'PATCH',
    `/restaurant/${context.restaurantId}/orders/${orderId}/status`,
    {
      token: context.token,
      body: {
        status,
        changedBy: 'phase5-verifier',
      },
    },
  );

  if (!response.response.ok) {
    throw new Error(`Failed to set status '${status}': ${JSON.stringify(response.body)}`);
  }
}

async function getOrderById(context: AuthContext, orderId: string): Promise<JsonObject | null> {
  const response = await apiRequest(
    'GET',
    `/restaurant/${context.restaurantId}/orders/${orderId}`,
  );

  if (!response.response.ok) {
    throw new Error(`Failed to load order ${orderId}: ${JSON.stringify(response.body)}`);
  }

  const order = asJsonObject(response.body);
  if (!asString(order.id)) return null;
  return order;
}

async function listActiveOrders(context: AuthContext): Promise<JsonObject[]> {
  const response = await apiRequest(
    'GET',
    `/restaurant/${context.restaurantId}/orders?status=pending,confirmed,preparing,ready&limit=200`,
  );

  if (!response.response.ok) {
    throw new Error(`Failed to list active orders: ${JSON.stringify(response.body)}`);
  }

  return asArray(response.body).map(asJsonObject);
}

async function processStatusSyncJobs(context: AuthContext): Promise<void> {
  const response = await apiRequest(
    'POST',
    `/restaurant/${context.restaurantId}/marketplace/status-sync/process`,
    {
      token: context.token,
      body: { limit: 50 },
    },
  );

  if (!response.response.ok) {
    throw new Error(`Failed to process status sync jobs: ${JSON.stringify(response.body)}`);
  }
}

async function listStatusSyncJobs(context: AuthContext): Promise<JsonObject[]> {
  const response = await apiRequest(
    'GET',
    `/restaurant/${context.restaurantId}/marketplace/status-sync/jobs?limit=200`,
    {
      token: context.token,
    },
  );

  if (!response.response.ok) {
    throw new Error(`Failed to list status sync jobs: ${JSON.stringify(response.body)}`);
  }

  const body = asJsonObject(response.body);
  return asArray(body.jobs).map(asJsonObject);
}

async function runE2EChecks(context: AuthContext): Promise<CheckResult[]> {
  console.log('\n[Phase5] Running end-to-end marketplace flow checks...');
  await ensureIntegration(context);

  const menuItem = await getFirstMenuItemId(context);
  const externalItemId = randomString('phase5-ext-item');
  await upsertMenuMapping(context, {
    externalItemId,
    externalItemName: menuItem.name,
    menuItemId: menuItem.id,
  });

  const externalOrderId = randomString('phase5-e2e-order');
  const inbound = await postWebhook(
    context.provider,
    buildWebhookPayload(context.provider, {
      eventId: randomString('phase5-e2e-event'),
      externalOrderId,
      externalStoreId: context.externalStoreId,
      orderStatus: 'PENDING',
      externalItemId,
      externalItemName: menuItem.name,
      includeItems: true,
    }),
    context.webhookSecret,
  );

  const inboundBody = asJsonObject(inbound.body);
  const internalOrderId = asString(inboundBody.orderId);
  const inboundAccepted = inbound.statusCode === 200 && asString(inboundBody.status) === 'processed' && Boolean(internalOrderId);

  if (!internalOrderId) {
    return [
      {
        name: 'inbound webhook created internal order',
        passed: false,
        details: `status=${inbound.statusCode} body=${JSON.stringify(inboundBody)}`,
      },
      {
        name: 'status transitions and sync jobs',
        passed: false,
        details: 'skipped: no internal order id',
      },
    ];
  }

  const createdOrder = await getOrderById(context, internalOrderId);
  const activeOrders = await listActiveOrders(context);
  const orderInActiveQueue = activeOrders.some((order) => asString(order.id) === internalOrderId);
  const orderMarketplaceSource = asString(createdOrder?.orderSource ?? createdOrder?.order_source);
  const orderHasMarketplacePayload = Boolean(createdOrder?.marketplace || createdOrder?.marketplaceOrder);

  await patchOrderStatus(context, internalOrderId, 'confirmed');
  await patchOrderStatus(context, internalOrderId, 'preparing');
  await patchOrderStatus(context, internalOrderId, 'ready');

  // Force job processor and poll briefly for job state updates.
  for (let i = 0; i < 3; i++) {
    await processStatusSyncJobs(context);
    await sleep(600);
  }

  const jobs = await listStatusSyncJobs(context);
  const orderJobs = jobs.filter(job => asString(job.externalOrderId) === externalOrderId);
  const terminalJob = orderJobs.find(job => {
    const status = (asString(job.status) ?? '').toUpperCase();
    return status === 'SUCCESS' || status === 'DEAD_LETTER' || status === 'FAILED';
  });

  return [
    {
      name: 'inbound webhook created internal order',
      passed: inboundAccepted,
      details: `status=${inbound.statusCode} orderId=${internalOrderId}`,
    },
    {
      name: 'order visible in active queue',
      passed: orderInActiveQueue,
      details: `activeOrders=${activeOrders.length}`,
    },
    {
      name: 'order tagged as marketplace source',
      passed: Boolean(orderMarketplaceSource?.includes('marketplace')) && orderHasMarketplacePayload,
      details: `orderSource=${orderMarketplaceSource ?? 'n/a'} marketplaceMeta=${orderHasMarketplacePayload}`,
    },
    {
      name: 'status transitions generated outbound sync jobs',
      passed: orderJobs.length > 0,
      details: `jobs=${orderJobs.length}`,
    },
    {
      name: 'sync jobs reached observable state',
      passed: Boolean(terminalJob),
      details: terminalJob
        ? `terminalStatus=${asString(terminalJob.status)} attempts=${asNumber(terminalJob.attemptCount) ?? 'n/a'}`
        : 'no terminal job observed',
    },
  ];
}

function printSummary(results: CheckResult[]): void {
  console.log('\n[Phase5] Verification Summary');
  for (const result of results) {
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`- [${status}] ${result.name}${result.details ? ` (${result.details})` : ''}`);
  }
}

async function run(): Promise<void> {
  console.log(`[Phase5] API base: ${API_BASE_URL}`);
  console.log(`[Phase5] Provider: ${PROVIDER}`);
  console.log(`[Phase5] Mode: ${MODE}`);

  const context = await ensureAuthContext();
  console.log(`[Phase5] Restaurant: ${context.restaurantId}`);

  const results: CheckResult[] = [];

  if (MODE === 'all' || MODE === 'contract') {
    results.push(...await runContractChecks(context));
  }
  if (MODE === 'all' || MODE === 'e2e') {
    results.push(...await runE2EChecks(context));
  }

  printSummary(results);

  if (results.some(result => !result.passed)) {
    process.exitCode = 1;
    return;
  }

  console.log('\n[Phase5] All checks passed.');
}

run().catch((error: unknown) => {
  console.error('[Phase5] Verification failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
