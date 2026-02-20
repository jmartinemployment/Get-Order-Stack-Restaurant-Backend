type Provider = 'doordash_marketplace' | 'ubereats' | 'grubhub';

interface LoginRestaurant {
  id: string;
}

interface LoginResponse {
  token: string;
  restaurants: LoginRestaurant[];
}

interface JsonObject {
  [key: string]: unknown;
}

interface PilotProviderSummary {
  provider: Provider;
  go: boolean;
  reasons: string[];
  webhook?: JsonObject;
  sync?: JsonObject;
}

interface PilotSummaryResponse {
  restaurantId: string;
  go: boolean;
  reasons: string[];
  windowHours: number;
  providers: PilotProviderSummary[];
}

const API_BASE = normalizeApiBase(
  process.env.MARKETPLACE_VERIFY_API_BASE_URL
  || process.env.API_BASE_URL
  || 'http://localhost:3000',
);

const EMAIL = process.env.MARKETPLACE_VERIFY_EMAIL ?? process.env.AUTH_EMAIL ?? 'owner@taipa.com';
const PASSWORD = process.env.MARKETPLACE_VERIFY_PASSWORD ?? process.env.AUTH_PASSWORD ?? 'owner123';
const WINDOW_HOURS = normalizeWindowHours(process.env.MARKETPLACE_PILOT_WINDOW_HOURS ?? '24');
const PROVIDER = normalizeProvider(process.env.MARKETPLACE_PILOT_PROVIDER ?? '');
const RESTAURANT_IDS = normalizeRestaurantIds(process.env.MARKETPLACE_PILOT_RESTAURANT_IDS);

function normalizeApiBase(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

function normalizeProvider(value: string): Provider | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'doordash_marketplace' || normalized === 'ubereats' || normalized === 'grubhub') {
    return normalized;
  }
  throw new Error(`Unsupported provider: ${value}`);
}

function normalizeWindowHours(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 24;
  return Math.min(parsed, 24 * 14);
}

function normalizeRestaurantIds(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(token => token.trim())
    .filter(token => token.length > 0);
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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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
  return await response.text();
}

async function apiRequest(
  method: string,
  path: string,
  options?: {
    token?: string;
    body?: unknown;
  },
): Promise<{ response: Response; body: unknown }> {
  const headers: Record<string, string> = {};
  if (options?.token) headers.Authorization = `Bearer ${options.token}`;

  let body: string | undefined;
  if (options?.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body,
  });

  return {
    response,
    body: await readBody(response),
  };
}

async function authenticate(): Promise<{ token: string; restaurantIds: string[] }> {
  const envToken = asString(process.env.MARKETPLACE_VERIFY_TOKEN ?? process.env.AUTH_TOKEN);
  const envRestaurantId = asString(process.env.MARKETPLACE_VERIFY_RESTAURANT_ID ?? process.env.RESTAURANT_ID);

  if (envToken) {
    const restaurantIds = RESTAURANT_IDS.length > 0
      ? RESTAURANT_IDS
      : envRestaurantId
        ? [envRestaurantId]
        : [];

    if (restaurantIds.length === 0) {
      throw new Error('No restaurant id provided. Set MARKETPLACE_PILOT_RESTAURANT_IDS or MARKETPLACE_VERIFY_RESTAURANT_ID.');
    }

    return {
      token: envToken,
      restaurantIds,
    };
  }

  const login = await apiRequest('POST', '/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });

  if (!login.response.ok) {
    throw new Error(`Login failed (${login.response.status}): ${JSON.stringify(login.body)}`);
  }

  const json = asJsonObject(login.body) as unknown as LoginResponse;
  const token = asString(json.token);
  if (!token) {
    throw new Error('Login response missing token');
  }

  const restaurantIdsFromLogin = asArray(json.restaurants)
    .map(asJsonObject)
    .map(item => asString(item.id))
    .filter((id): id is string => Boolean(id));

  const restaurantIds = RESTAURANT_IDS.length > 0 ? RESTAURANT_IDS : restaurantIdsFromLogin;
  if (restaurantIds.length === 0) {
    throw new Error('No restaurants available for pilot gate report');
  }

  return {
    token,
    restaurantIds,
  };
}

async function fetchPilotSummary(
  token: string,
  restaurantId: string,
): Promise<PilotSummaryResponse> {
  const search = new URLSearchParams();
  search.set('windowHours', String(WINDOW_HOURS));
  if (PROVIDER) search.set('provider', PROVIDER);

  const result = await apiRequest(
    'GET',
    `/restaurant/${restaurantId}/marketplace/pilot/summary?${search.toString()}`,
    { token },
  );

  if (!result.response.ok) {
    throw new Error(`Pilot summary failed for ${restaurantId} (${result.response.status}): ${JSON.stringify(result.body)}`);
  }

  return asJsonObject(result.body) as unknown as PilotSummaryResponse;
}

function printSummary(summary: PilotSummaryResponse): void {
  console.log(`\n[Marketplace Pilot] Restaurant ${summary.restaurantId} (window=${summary.windowHours}h)`);
  console.log(`Overall: ${summary.go ? 'GO' : 'STOP'}`);

  for (const provider of summary.providers) {
    const status = provider.go ? 'GO' : 'STOP';
    console.log(`- ${provider.provider}: ${status}`);
    if (provider.reasons.length > 0) {
      for (const reason of provider.reasons) {
        console.log(`  - ${reason}`);
      }
    }
  }
}

async function run(): Promise<void> {
  console.log(`[Marketplace Pilot] API base: ${API_BASE}`);
  console.log(`[Marketplace Pilot] Window hours: ${WINDOW_HOURS}`);
  if (PROVIDER) console.log(`[Marketplace Pilot] Provider filter: ${PROVIDER}`);

  const auth = await authenticate();
  console.log(`[Marketplace Pilot] Restaurants: ${auth.restaurantIds.join(', ')}`);

  let hasStop = false;
  for (const restaurantId of auth.restaurantIds) {
    const summary = await fetchPilotSummary(auth.token, restaurantId);
    printSummary(summary);
    if (!summary.go) hasStop = true;
  }

  if (hasStop) {
    process.exitCode = 1;
    console.log('\n[Marketplace Pilot] STOP gate triggered for one or more restaurants.');
    return;
  }

  console.log('\n[Marketplace Pilot] All restaurants passed GO gates.');
}

run().catch((error: unknown) => {
  console.error('[Marketplace Pilot] Failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
