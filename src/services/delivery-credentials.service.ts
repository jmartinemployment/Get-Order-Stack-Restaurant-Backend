import crypto from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { providerProfileService } from './provider-profile.service';
import {
  DeliveryCredentialMode,
  ProviderKeyBackend,
  ProviderSecurityProfileSummary,
} from './provider-profile.types';

const prisma = new PrismaClient();

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_VERSION = 'v1';
const PROFILE_PROVIDER_DOORDASH = 'doordash';
const PROFILE_PROVIDER_UBER = 'uber';

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
  securityProfile: ProviderSecurityProfileSummary;
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

function deriveSha256(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

function isProviderKeyBackend(value: string): value is ProviderKeyBackend {
  return value === 'vault_oss' || value === 'managed_kms';
}

function normalizeBackend(value: unknown): ProviderKeyBackend {
  if (typeof value === 'string' && isProviderKeyBackend(value)) {
    return value;
  }
  return 'vault_oss';
}

function getEncryptionKeyForBackend(backend: ProviderKeyBackend): Buffer {
  if (backend === 'managed_kms') {
    const secureSecret = process.env.DELIVERY_MANAGED_KMS_WRAPPING_KEY;
    if (!secureSecret) {
      throw new Error('Most secure backend is not configured yet');
    }
    return deriveSha256(secureSecret);
  }

  const freeSecret = process.env.DELIVERY_FREE_WRAPPING_KEY
    ?? process.env.DELIVERY_CREDENTIALS_ENCRYPTION_KEY;
  if (!freeSecret) {
    throw new Error('FATAL: Neither DELIVERY_FREE_WRAPPING_KEY nor DELIVERY_CREDENTIALS_ENCRYPTION_KEY is set. Cannot encrypt/decrypt delivery credentials.');
  }
  return deriveSha256(freeSecret);
}

function encodeEncryptedPayload(backend: ProviderKeyBackend, iv: Buffer, tag: Buffer, encrypted: Buffer): string {
  return `${ENCRYPTION_VERSION}:${backend}:${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function parseEncryptedPayload(payload: string): {
  backend: ProviderKeyBackend;
  ivB64: string;
  tagB64: string;
  encryptedB64: string;
} {
  if (payload.startsWith(`${ENCRYPTION_VERSION}:`)) {
    const [version, backendRaw, cipherPayload] = payload.split(':');
    if (version !== ENCRYPTION_VERSION || !backendRaw || !cipherPayload) {
      throw new Error('Invalid encrypted credential payload');
    }
    const [ivB64, tagB64, encryptedB64] = cipherPayload.split('.');
    if (!ivB64 || !tagB64 || !encryptedB64) {
      throw new Error('Invalid encrypted credential payload');
    }
    return {
      backend: normalizeBackend(backendRaw),
      ivB64,
      tagB64,
      encryptedB64,
    };
  }

  // Legacy payload compatibility: default to free backend.
  const [ivB64, tagB64, encryptedB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !encryptedB64) {
    throw new Error('Invalid encrypted credential payload');
  }
  return {
    backend: 'vault_oss',
    ivB64,
    tagB64,
    encryptedB64,
  };
}

function encryptCredential(plainText: string, backend: ProviderKeyBackend): string {
  const key = getEncryptionKeyForBackend(backend);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return encodeEncryptedPayload(backend, iv, tag, encrypted);
}

function decryptCredential(payload: string): string {
  const parsed = parseEncryptedPayload(payload);
  const key = getEncryptionKeyForBackend(parsed.backend);

  const iv = Buffer.from(parsed.ivB64, 'base64');
  const tag = Buffer.from(parsed.tagB64, 'base64');
  const encrypted = Buffer.from(parsed.encryptedB64, 'base64');
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

function shouldUseBackendMode(
  requestedMode: DeliveryCredentialMode,
  canUseMostSecure: boolean,
): DeliveryCredentialMode {
  if (requestedMode === 'most_secure' && !canUseMostSecure) {
    throw new Error('Most secure backend is not configured yet');
  }
  return requestedMode;
}

function summarizeCredentials(row: {
  securityProfile: ProviderSecurityProfileSummary;
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
    securityProfile: row.securityProfile,
  };
}

function buildDoorDashConfigRefMap(input: {
  hasApiKey: boolean;
  hasSigningSecret: boolean;
  mode: DeliveryProviderMode;
}): Prisma.InputJsonValue {
  return {
    refs: {
      apiKey: input.hasApiKey ? 'present' : 'absent',
      signingSecret: input.hasSigningSecret ? 'present' : 'absent',
    },
    mode: input.mode,
  };
}

function buildUberConfigRefMap(input: {
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasCustomerId: boolean;
  hasWebhookSigningKey: boolean;
}): Prisma.InputJsonValue {
  return {
    refs: {
      clientId: input.hasClientId ? 'present' : 'absent',
      clientSecret: input.hasClientSecret ? 'present' : 'absent',
      customerId: input.hasCustomerId ? 'present' : 'absent',
      webhookSigningKey: input.hasWebhookSigningKey ? 'present' : 'absent',
    },
  };
}

async function upsertCredentialProviderProfile(params: {
  restaurantId: string;
  provider: typeof PROFILE_PROVIDER_DOORDASH | typeof PROFILE_PROVIDER_UBER;
  backend: ProviderKeyBackend;
  profileState: 'ACTIVE' | 'DISABLED';
  configRefMap: Prisma.InputJsonValue;
  action: string;
  actor?: string | null;
}): Promise<void> {
  const profile = await prisma.restaurantProviderProfile.upsert({
    where: {
      restaurantId_provider: {
        restaurantId: params.restaurantId,
        provider: params.provider,
      },
    },
    create: {
      restaurantId: params.restaurantId,
      provider: params.provider,
      configRefMap: params.configRefMap,
      profileVersion: 1,
      profileState: params.profileState,
      keyBackend: params.backend,
      dekVersion: 1,
    },
    update: {
      configRefMap: params.configRefMap,
      profileState: params.profileState,
      keyBackend: params.backend,
      profileVersion: { increment: 1 },
    },
  });

  await prisma.restaurantProviderProfileEvent.create({
    data: {
      restaurantId: params.restaurantId,
      profileId: profile.id,
      provider: params.provider,
      action: params.action,
      actor: params.actor ?? null,
      profileVersion: profile.profileVersion,
      outcome: 'SUCCESS',
      correlationId: null,
      metadata: {
        profileState: params.profileState,
        keyBackend: params.backend,
      },
    },
  });
}

async function appendCredentialProviderEvent(params: {
  restaurantId: string;
  provider: typeof PROFILE_PROVIDER_DOORDASH | typeof PROFILE_PROVIDER_UBER;
  action: string;
  backend: ProviderKeyBackend;
  actor?: string | null;
}): Promise<void> {
  const existing = await prisma.restaurantProviderProfile.findUnique({
    where: {
      restaurantId_provider: {
        restaurantId: params.restaurantId,
        provider: params.provider,
      },
    },
    select: { id: true, profileVersion: true },
  });

  if (!existing) return;

  await prisma.restaurantProviderProfileEvent.create({
    data: {
      restaurantId: params.restaurantId,
      profileId: existing.id,
      provider: params.provider,
      action: params.action,
      actor: params.actor ?? null,
      profileVersion: existing.profileVersion,
      outcome: 'SUCCESS',
      correlationId: null,
      metadata: {
        keyBackend: params.backend,
      },
    },
  });
}

export const deliveryCredentialsService = {
  async getSecurityProfile(restaurantId: string): Promise<ProviderSecurityProfileSummary> {
    return providerProfileService.getDeliverySecurityProfile(restaurantId);
  },

  async setSecurityProfile(
    restaurantId: string,
    mode: DeliveryCredentialMode,
    actor?: string | null,
  ): Promise<ProviderSecurityProfileSummary> {
    const current = await providerProfileService.getDeliverySecurityProfile(restaurantId);
    const nextMode = shouldUseBackendMode(mode, current.canUseMostSecure);
    if (current.mode === nextMode) {
      return current;
    }

    const existing = await prisma.restaurantDeliveryCredentials.findUnique({
      where: { restaurantId },
      select: {
        id: true,
        doordashApiKeyEncrypted: true,
        doordashSigningSecretEncrypted: true,
        doordashMode: true,
        uberClientIdEncrypted: true,
        uberClientSecretEncrypted: true,
        uberCustomerIdEncrypted: true,
        uberWebhookSigningKeyEncrypted: true,
      },
    });

    const nextProfile = await providerProfileService.setDeliverySecurityProfile(
      restaurantId,
      nextMode,
      actor,
    );

    if (!existing) {
      return nextProfile;
    }

    const nextBackend = nextProfile.backend;
    await prisma.restaurantDeliveryCredentials.update({
      where: { id: existing.id },
      data: {
        doordashApiKeyEncrypted: existing.doordashApiKeyEncrypted
          ? encryptCredential(decryptCredential(existing.doordashApiKeyEncrypted), nextBackend)
          : null,
        doordashSigningSecretEncrypted: existing.doordashSigningSecretEncrypted
          ? encryptCredential(decryptCredential(existing.doordashSigningSecretEncrypted), nextBackend)
          : null,
        doordashMode: existing.doordashMode,
        uberClientIdEncrypted: existing.uberClientIdEncrypted
          ? encryptCredential(decryptCredential(existing.uberClientIdEncrypted), nextBackend)
          : null,
        uberClientSecretEncrypted: existing.uberClientSecretEncrypted
          ? encryptCredential(decryptCredential(existing.uberClientSecretEncrypted), nextBackend)
          : null,
        uberCustomerIdEncrypted: existing.uberCustomerIdEncrypted
          ? encryptCredential(decryptCredential(existing.uberCustomerIdEncrypted), nextBackend)
          : null,
        uberWebhookSigningKeyEncrypted: existing.uberWebhookSigningKeyEncrypted
          ? encryptCredential(decryptCredential(existing.uberWebhookSigningKeyEncrypted), nextBackend)
          : null,
      },
    });

    await prisma.restaurantProviderProfile.updateMany({
      where: {
        restaurantId,
        provider: { in: [PROFILE_PROVIDER_DOORDASH, PROFILE_PROVIDER_UBER] },
      },
      data: {
        keyBackend: nextBackend,
        profileVersion: { increment: 1 },
      },
    });

    await appendCredentialProviderEvent({
      restaurantId,
      provider: PROFILE_PROVIDER_DOORDASH,
      action: 'security_mode_rekey',
      backend: nextBackend,
      actor,
    });
    await appendCredentialProviderEvent({
      restaurantId,
      provider: PROFILE_PROVIDER_UBER,
      action: 'security_mode_rekey',
      backend: nextBackend,
      actor,
    });

    return nextProfile;
  },

  async getSummary(restaurantId: string): Promise<DeliveryCredentialSummary> {
    const [securityProfile, row] = await Promise.all([
      providerProfileService.getDeliverySecurityProfile(restaurantId),
      prisma.restaurantDeliveryCredentials.findUnique({
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
      }),
    ]);

    return summarizeCredentials(row ? {
      ...row,
      securityProfile,
    } : {
      securityProfile,
      doordashApiKeyEncrypted: null,
      doordashSigningSecretEncrypted: null,
      doordashMode: null,
      uberClientIdEncrypted: null,
      uberClientSecretEncrypted: null,
      uberCustomerIdEncrypted: null,
      uberWebhookSigningKeyEncrypted: null,
      updatedAt: new Date(),
    });
  },

  async upsertDoorDash(
    restaurantId: string,
    payload: DoorDashCredentialPayload,
    actor?: string | null,
  ): Promise<DeliveryCredentialSummary> {
    const securityProfile = await providerProfileService.getDeliverySecurityProfile(restaurantId);
    const activeBackend = securityProfile.backend;
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
      ? encryptCredential(apiKey, activeBackend)
      : (existing?.doordashApiKeyEncrypted ?? null);
    const nextSigningSecretEncrypted = signingSecret
      ? encryptCredential(signingSecret, activeBackend)
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

    await upsertCredentialProviderProfile({
      restaurantId,
      provider: PROFILE_PROVIDER_DOORDASH,
      backend: activeBackend,
      profileState: 'ACTIVE',
      configRefMap: buildDoorDashConfigRefMap({
        hasApiKey: Boolean(nextApiKeyEncrypted),
        hasSigningSecret: Boolean(nextSigningSecretEncrypted),
        mode,
      }),
      action: 'credentials_upserted',
      actor,
    });

    return this.getSummary(restaurantId);
  },

  async upsertUber(
    restaurantId: string,
    payload: UberCredentialPayload,
    actor?: string | null,
  ): Promise<DeliveryCredentialSummary> {
    const securityProfile = await providerProfileService.getDeliverySecurityProfile(restaurantId);
    const activeBackend = securityProfile.backend;
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
      ? encryptCredential(clientId, activeBackend)
      : (existing?.uberClientIdEncrypted ?? null);
    const nextClientSecretEncrypted = clientSecret
      ? encryptCredential(clientSecret, activeBackend)
      : (existing?.uberClientSecretEncrypted ?? null);
    const nextCustomerIdEncrypted = customerId
      ? encryptCredential(customerId, activeBackend)
      : (existing?.uberCustomerIdEncrypted ?? null);
    const nextWebhookSigningKeyEncrypted = webhookSigningKey
      ? encryptCredential(webhookSigningKey, activeBackend)
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

    await upsertCredentialProviderProfile({
      restaurantId,
      provider: PROFILE_PROVIDER_UBER,
      backend: activeBackend,
      profileState: 'ACTIVE',
      configRefMap: buildUberConfigRefMap({
        hasClientId: Boolean(nextClientIdEncrypted),
        hasClientSecret: Boolean(nextClientSecretEncrypted),
        hasCustomerId: Boolean(nextCustomerIdEncrypted),
        hasWebhookSigningKey: Boolean(nextWebhookSigningKeyEncrypted),
      }),
      action: 'credentials_upserted',
      actor,
    });

    return this.getSummary(restaurantId);
  },

  async clearDoorDash(restaurantId: string, actor?: string | null): Promise<DeliveryCredentialSummary> {
    const securityProfile = await providerProfileService.getDeliverySecurityProfile(restaurantId);
    const activeBackend = securityProfile.backend;

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

    await upsertCredentialProviderProfile({
      restaurantId,
      provider: PROFILE_PROVIDER_DOORDASH,
      backend: activeBackend,
      profileState: 'DISABLED',
      configRefMap: buildDoorDashConfigRefMap({
        hasApiKey: false,
        hasSigningSecret: false,
        mode: 'test',
      }),
      action: 'credentials_cleared',
      actor,
    });

    return this.getSummary(restaurantId);
  },

  async clearUber(restaurantId: string, actor?: string | null): Promise<DeliveryCredentialSummary> {
    const securityProfile = await providerProfileService.getDeliverySecurityProfile(restaurantId);
    const activeBackend = securityProfile.backend;

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

    await upsertCredentialProviderProfile({
      restaurantId,
      provider: PROFILE_PROVIDER_UBER,
      backend: activeBackend,
      profileState: 'DISABLED',
      configRefMap: buildUberConfigRefMap({
        hasClientId: false,
        hasClientSecret: false,
        hasCustomerId: false,
        hasWebhookSigningKey: false,
      }),
      action: 'credentials_cleared',
      actor,
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
