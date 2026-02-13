import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ENCRYPTION_KEY_ENV = 'DELIVERY_CREDENTIALS_ENCRYPTION_KEY';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

export type DeliveryProviderMode = 'production' | 'test';

export interface DoorDashCredentialPayload {
  apiKey?: string;
  signingSecret?: string;
  mode?: DeliveryProviderMode;
}

export interface UberCredentialPayload {
  clientId?: string;
  clientSecret?: string;
  customerId?: string;
  webhookSigningKey?: string;
}

export interface DeliveryCredentialSummary {
  doordash: {
    configured: boolean;
    hasApiKey: boolean;
    hasSigningSecret: boolean;
    mode: DeliveryProviderMode;
    updatedAt: string | null;
  };
  uber: {
    configured: boolean;
    hasClientId: boolean;
    hasClientSecret: boolean;
    hasCustomerId: boolean;
    hasWebhookSigningKey: boolean;
    updatedAt: string | null;
  };
}

export interface DoorDashRuntimeCredentials {
  apiKey: string;
  signingSecret: string;
  mode: DeliveryProviderMode;
}

export interface UberRuntimeCredentials {
  clientId: string;
  clientSecret: string;
  customerId: string;
  webhookSigningKey: string;
}

function getEncryptionKey(): Buffer {
  const secret = process.env[ENCRYPTION_KEY_ENV]
    || process.env.JWT_SECRET
    || 'your-secret-key-change-in-production';

  // Derive a stable 32-byte key from the configured secret.
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptCredential(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptCredential(payload: string): string {
  const key = getEncryptionKey();
  const [ivB64, tagB64, encryptedB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !encryptedB64) {
    throw new Error('Invalid encrypted credential payload');
  }

  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

function toOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeMode(value: unknown): DeliveryProviderMode {
  return value === 'production' ? 'production' : 'test';
}

function summarizeCredentials(row: {
  doordashApiKeyEncrypted: string | null;
  doordashSigningSecretEncrypted: string | null;
  doordashMode: string | null;
  uberClientIdEncrypted: string | null;
  uberClientSecretEncrypted: string | null;
  uberCustomerIdEncrypted: string | null;
  uberWebhookSigningKeyEncrypted: string | null;
  updatedAt: Date;
} | null): DeliveryCredentialSummary {
  const updatedAt = row?.updatedAt.toISOString() ?? null;

  const doordashHasApiKey = Boolean(row?.doordashApiKeyEncrypted);
  const doordashHasSigningSecret = Boolean(row?.doordashSigningSecretEncrypted);

  const uberHasClientId = Boolean(row?.uberClientIdEncrypted);
  const uberHasClientSecret = Boolean(row?.uberClientSecretEncrypted);
  const uberHasCustomerId = Boolean(row?.uberCustomerIdEncrypted);
  const uberHasWebhookSigningKey = Boolean(row?.uberWebhookSigningKeyEncrypted);

  return {
    doordash: {
      configured: doordashHasApiKey && doordashHasSigningSecret,
      hasApiKey: doordashHasApiKey,
      hasSigningSecret: doordashHasSigningSecret,
      mode: normalizeMode(row?.doordashMode),
      updatedAt: doordashHasApiKey || doordashHasSigningSecret ? updatedAt : null,
    },
    uber: {
      configured: uberHasClientId && uberHasClientSecret && uberHasCustomerId && uberHasWebhookSigningKey,
      hasClientId: uberHasClientId,
      hasClientSecret: uberHasClientSecret,
      hasCustomerId: uberHasCustomerId,
      hasWebhookSigningKey: uberHasWebhookSigningKey,
      updatedAt: uberHasClientId || uberHasClientSecret || uberHasCustomerId || uberHasWebhookSigningKey ? updatedAt : null,
    },
  };
}

export const deliveryCredentialsService = {
  async getSummary(restaurantId: string): Promise<DeliveryCredentialSummary> {
    const row = await prisma.restaurantDeliveryCredentials.findUnique({
      where: { restaurantId },
      select: {
        doordashApiKeyEncrypted: true,
        doordashSigningSecretEncrypted: true,
        doordashMode: true,
        uberClientIdEncrypted: true,
        uberClientSecretEncrypted: true,
        uberCustomerIdEncrypted: true,
        uberWebhookSigningKeyEncrypted: true,
        updatedAt: true,
      },
    });
    return summarizeCredentials(row);
  },

  async upsertDoorDash(restaurantId: string, payload: DoorDashCredentialPayload): Promise<DeliveryCredentialSummary> {
    const existing = await prisma.restaurantDeliveryCredentials.findUnique({
      where: { restaurantId },
      select: {
        doordashApiKeyEncrypted: true,
        doordashSigningSecretEncrypted: true,
        doordashMode: true,
      },
    });

    const apiKey = toOptionalTrimmedString(payload.apiKey);
    const signingSecret = toOptionalTrimmedString(payload.signingSecret);
    const mode = payload.mode ? normalizeMode(payload.mode) : normalizeMode(existing?.doordashMode);

    const nextApiKeyEncrypted = apiKey
      ? encryptCredential(apiKey)
      : (existing?.doordashApiKeyEncrypted ?? null);
    const nextSigningSecretEncrypted = signingSecret
      ? encryptCredential(signingSecret)
      : (existing?.doordashSigningSecretEncrypted ?? null);

    if (!nextApiKeyEncrypted || !nextSigningSecretEncrypted) {
      throw new Error('DoorDash credentials require apiKey and signingSecret');
    }

    await prisma.restaurantDeliveryCredentials.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        doordashApiKeyEncrypted: nextApiKeyEncrypted,
        doordashSigningSecretEncrypted: nextSigningSecretEncrypted,
        doordashMode: mode,
      },
      update: {
        doordashApiKeyEncrypted: nextApiKeyEncrypted,
        doordashSigningSecretEncrypted: nextSigningSecretEncrypted,
        doordashMode: mode,
      },
    });

    return this.getSummary(restaurantId);
  },

  async upsertUber(restaurantId: string, payload: UberCredentialPayload): Promise<DeliveryCredentialSummary> {
    const existing = await prisma.restaurantDeliveryCredentials.findUnique({
      where: { restaurantId },
      select: {
        uberClientIdEncrypted: true,
        uberClientSecretEncrypted: true,
        uberCustomerIdEncrypted: true,
        uberWebhookSigningKeyEncrypted: true,
      },
    });

    const clientId = toOptionalTrimmedString(payload.clientId);
    const clientSecret = toOptionalTrimmedString(payload.clientSecret);
    const customerId = toOptionalTrimmedString(payload.customerId);
    const webhookSigningKey = toOptionalTrimmedString(payload.webhookSigningKey);

    const nextClientIdEncrypted = clientId
      ? encryptCredential(clientId)
      : (existing?.uberClientIdEncrypted ?? null);
    const nextClientSecretEncrypted = clientSecret
      ? encryptCredential(clientSecret)
      : (existing?.uberClientSecretEncrypted ?? null);
    const nextCustomerIdEncrypted = customerId
      ? encryptCredential(customerId)
      : (existing?.uberCustomerIdEncrypted ?? null);
    const nextWebhookSigningKeyEncrypted = webhookSigningKey
      ? encryptCredential(webhookSigningKey)
      : (existing?.uberWebhookSigningKeyEncrypted ?? null);

    if (!nextClientIdEncrypted || !nextClientSecretEncrypted || !nextCustomerIdEncrypted || !nextWebhookSigningKeyEncrypted) {
      throw new Error('Uber credentials require clientId, clientSecret, customerId, and webhookSigningKey');
    }

    await prisma.restaurantDeliveryCredentials.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        uberClientIdEncrypted: nextClientIdEncrypted,
        uberClientSecretEncrypted: nextClientSecretEncrypted,
        uberCustomerIdEncrypted: nextCustomerIdEncrypted,
        uberWebhookSigningKeyEncrypted: nextWebhookSigningKeyEncrypted,
      },
      update: {
        uberClientIdEncrypted: nextClientIdEncrypted,
        uberClientSecretEncrypted: nextClientSecretEncrypted,
        uberCustomerIdEncrypted: nextCustomerIdEncrypted,
        uberWebhookSigningKeyEncrypted: nextWebhookSigningKeyEncrypted,
      },
    });

    return this.getSummary(restaurantId);
  },

  async clearDoorDash(restaurantId: string): Promise<DeliveryCredentialSummary> {
    await prisma.restaurantDeliveryCredentials.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        doordashApiKeyEncrypted: null,
        doordashSigningSecretEncrypted: null,
        doordashMode: null,
      },
      update: {
        doordashApiKeyEncrypted: null,
        doordashSigningSecretEncrypted: null,
        doordashMode: null,
      },
    });

    return this.getSummary(restaurantId);
  },

  async clearUber(restaurantId: string): Promise<DeliveryCredentialSummary> {
    await prisma.restaurantDeliveryCredentials.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        uberClientIdEncrypted: null,
        uberClientSecretEncrypted: null,
        uberCustomerIdEncrypted: null,
        uberWebhookSigningKeyEncrypted: null,
      },
      update: {
        uberClientIdEncrypted: null,
        uberClientSecretEncrypted: null,
        uberCustomerIdEncrypted: null,
        uberWebhookSigningKeyEncrypted: null,
      },
    });

    return this.getSummary(restaurantId);
  },

  async getDoorDashRuntimeCredentials(restaurantId: string): Promise<DoorDashRuntimeCredentials | null> {
    const row = await prisma.restaurantDeliveryCredentials.findUnique({
      where: { restaurantId },
      select: {
        doordashApiKeyEncrypted: true,
        doordashSigningSecretEncrypted: true,
        doordashMode: true,
      },
    });

    if (!row?.doordashApiKeyEncrypted || !row?.doordashSigningSecretEncrypted) {
      return null;
    }

    return {
      apiKey: decryptCredential(row.doordashApiKeyEncrypted),
      signingSecret: decryptCredential(row.doordashSigningSecretEncrypted),
      mode: normalizeMode(row.doordashMode),
    };
  },

  async getUberRuntimeCredentials(restaurantId: string): Promise<UberRuntimeCredentials | null> {
    const row = await prisma.restaurantDeliveryCredentials.findUnique({
      where: { restaurantId },
      select: {
        uberClientIdEncrypted: true,
        uberClientSecretEncrypted: true,
        uberCustomerIdEncrypted: true,
        uberWebhookSigningKeyEncrypted: true,
      },
    });

    if (!row?.uberClientIdEncrypted
      || !row?.uberClientSecretEncrypted
      || !row?.uberCustomerIdEncrypted
      || !row?.uberWebhookSigningKeyEncrypted) {
      return null;
    }

    return {
      clientId: decryptCredential(row.uberClientIdEncrypted),
      clientSecret: decryptCredential(row.uberClientSecretEncrypted),
      customerId: decryptCredential(row.uberCustomerIdEncrypted),
      webhookSigningKey: decryptCredential(row.uberWebhookSigningKeyEncrypted),
    };
  },

  async getWebhookSecretByExternalDeliveryId(provider: 'doordash' | 'uber', deliveryExternalId: string): Promise<string | null> {
    const order = await prisma.order.findFirst({
      where: { deliveryExternalId },
      select: { restaurantId: true },
    });

    if (!order) return null;

    if (provider === 'doordash') {
      const creds = await this.getDoorDashRuntimeCredentials(order.restaurantId);
      return creds?.signingSecret ?? null;
    }

    const creds = await this.getUberRuntimeCredentials(order.restaurantId);
    return creds?.webhookSigningKey ?? null;
  },
};
