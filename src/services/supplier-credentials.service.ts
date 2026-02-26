import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_VERSION = 'v1';

export type SupplierProviderType = 'sysco' | 'gfs';
export type SupplierProviderMode = 'production' | 'test';

export interface SyscoCredentialPayload {
  clientId?: string;
  clientSecret?: string;
  customerId?: string;
  mode?: SupplierProviderMode;
}

export interface GfsCredentialPayload {
  clientId?: string;
  clientSecret?: string;
  customerId?: string;
  mode?: SupplierProviderMode;
}

export interface SupplierCredentialSummary {
  sysco: {
    configured: boolean;
    hasClientId: boolean;
    hasClientSecret: boolean;
    hasCustomerId: boolean;
    mode: SupplierProviderMode;
    updatedAt: string | null;
  };
  gfs: {
    configured: boolean;
    hasClientId: boolean;
    hasClientSecret: boolean;
    hasCustomerId: boolean;
    mode: SupplierProviderMode;
    updatedAt: string | null;
  };
}

export interface SupplierRuntimeCredentials {
  clientId: string;
  clientSecret: string;
  customerId: string;
  mode: SupplierProviderMode;
}

function deriveSha256(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

function getEncryptionKey(): Buffer {
  const secret = process.env.SUPPLIER_CREDENTIALS_ENCRYPTION_KEY
    ?? process.env.DELIVERY_CREDENTIALS_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('FATAL: No supplier credentials encryption key configured.');
  }
  return deriveSha256(secret);
}

function encryptCredential(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTION_VERSION}:supplier:${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptCredential(payload: string): string {
  const key = getEncryptionKey();

  let ivB64: string;
  let tagB64: string;
  let encryptedB64: string;

  if (payload.startsWith(`${ENCRYPTION_VERSION}:`)) {
    const parts = payload.split(':');
    const cipherPayload = parts[2];
    if (!cipherPayload) throw new Error('Invalid encrypted supplier credential payload');
    const segments = cipherPayload.split('.');
    ivB64 = segments[0];
    tagB64 = segments[1];
    encryptedB64 = segments[2];
  } else {
    const segments = payload.split('.');
    ivB64 = segments[0];
    tagB64 = segments[1];
    encryptedB64 = segments[2];
  }

  if (!ivB64 || !tagB64 || !encryptedB64) {
    throw new Error('Invalid encrypted supplier credential payload');
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

function normalizeMode(value: unknown): SupplierProviderMode {
  return value === 'production' ? 'production' : 'test';
}

function summarizeCredentials(row: {
  syscoClientIdEncrypted: string | null;
  syscoClientSecretEncrypted: string | null;
  syscoCustomerIdEncrypted: string | null;
  syscoMode: string | null;
  gfsClientIdEncrypted: string | null;
  gfsClientSecretEncrypted: string | null;
  gfsCustomerIdEncrypted: string | null;
  gfsMode: string | null;
  updatedAt: Date;
} | null): SupplierCredentialSummary {
  const updatedAt = row?.updatedAt.toISOString() ?? null;

  const syscoHasClientId = Boolean(row?.syscoClientIdEncrypted);
  const syscoHasClientSecret = Boolean(row?.syscoClientSecretEncrypted);
  const syscoHasCustomerId = Boolean(row?.syscoCustomerIdEncrypted);

  const gfsHasClientId = Boolean(row?.gfsClientIdEncrypted);
  const gfsHasClientSecret = Boolean(row?.gfsClientSecretEncrypted);
  const gfsHasCustomerId = Boolean(row?.gfsCustomerIdEncrypted);

  return {
    sysco: {
      configured: syscoHasClientId && syscoHasClientSecret && syscoHasCustomerId,
      hasClientId: syscoHasClientId,
      hasClientSecret: syscoHasClientSecret,
      hasCustomerId: syscoHasCustomerId,
      mode: normalizeMode(row?.syscoMode),
      updatedAt: syscoHasClientId || syscoHasClientSecret || syscoHasCustomerId ? updatedAt : null,
    },
    gfs: {
      configured: gfsHasClientId && gfsHasClientSecret && gfsHasCustomerId,
      hasClientId: gfsHasClientId,
      hasClientSecret: gfsHasClientSecret,
      hasCustomerId: gfsHasCustomerId,
      mode: normalizeMode(row?.gfsMode),
      updatedAt: gfsHasClientId || gfsHasClientSecret || gfsHasCustomerId ? updatedAt : null,
    },
  };
}

export const supplierCredentialsService = {
  async getSummary(restaurantId: string): Promise<SupplierCredentialSummary> {
    const row = await prisma.restaurantSupplierCredentials.findUnique({
      where: { restaurantId },
    });
    return summarizeCredentials(row);
  },

  async upsertSysco(
    restaurantId: string,
    payload: SyscoCredentialPayload,
  ): Promise<SupplierCredentialSummary> {
    const existing = await prisma.restaurantSupplierCredentials.findUnique({
      where: { restaurantId },
      select: {
        syscoClientIdEncrypted: true,
        syscoClientSecretEncrypted: true,
        syscoCustomerIdEncrypted: true,
        syscoMode: true,
      },
    });

    const clientId = toOptionalTrimmedString(payload.clientId);
    const clientSecret = toOptionalTrimmedString(payload.clientSecret);
    const customerId = toOptionalTrimmedString(payload.customerId);
    const mode = payload.mode ? normalizeMode(payload.mode) : normalizeMode(existing?.syscoMode);

    const nextClientIdEncrypted = clientId
      ? encryptCredential(clientId)
      : (existing?.syscoClientIdEncrypted ?? null);
    const nextClientSecretEncrypted = clientSecret
      ? encryptCredential(clientSecret)
      : (existing?.syscoClientSecretEncrypted ?? null);
    const nextCustomerIdEncrypted = customerId
      ? encryptCredential(customerId)
      : (existing?.syscoCustomerIdEncrypted ?? null);

    await prisma.restaurantSupplierCredentials.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        syscoClientIdEncrypted: nextClientIdEncrypted,
        syscoClientSecretEncrypted: nextClientSecretEncrypted,
        syscoCustomerIdEncrypted: nextCustomerIdEncrypted,
        syscoMode: mode,
      },
      update: {
        syscoClientIdEncrypted: nextClientIdEncrypted,
        syscoClientSecretEncrypted: nextClientSecretEncrypted,
        syscoCustomerIdEncrypted: nextCustomerIdEncrypted,
        syscoMode: mode,
      },
    });

    return this.getSummary(restaurantId);
  },

  async upsertGfs(
    restaurantId: string,
    payload: GfsCredentialPayload,
  ): Promise<SupplierCredentialSummary> {
    const existing = await prisma.restaurantSupplierCredentials.findUnique({
      where: { restaurantId },
      select: {
        gfsClientIdEncrypted: true,
        gfsClientSecretEncrypted: true,
        gfsCustomerIdEncrypted: true,
        gfsMode: true,
      },
    });

    const clientId = toOptionalTrimmedString(payload.clientId);
    const clientSecret = toOptionalTrimmedString(payload.clientSecret);
    const customerId = toOptionalTrimmedString(payload.customerId);
    const mode = payload.mode ? normalizeMode(payload.mode) : normalizeMode(existing?.gfsMode);

    const nextClientIdEncrypted = clientId
      ? encryptCredential(clientId)
      : (existing?.gfsClientIdEncrypted ?? null);
    const nextClientSecretEncrypted = clientSecret
      ? encryptCredential(clientSecret)
      : (existing?.gfsClientSecretEncrypted ?? null);
    const nextCustomerIdEncrypted = customerId
      ? encryptCredential(customerId)
      : (existing?.gfsCustomerIdEncrypted ?? null);

    await prisma.restaurantSupplierCredentials.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        gfsClientIdEncrypted: nextClientIdEncrypted,
        gfsClientSecretEncrypted: nextClientSecretEncrypted,
        gfsCustomerIdEncrypted: nextCustomerIdEncrypted,
        gfsMode: mode,
      },
      update: {
        gfsClientIdEncrypted: nextClientIdEncrypted,
        gfsClientSecretEncrypted: nextClientSecretEncrypted,
        gfsCustomerIdEncrypted: nextCustomerIdEncrypted,
        gfsMode: mode,
      },
    });

    return this.getSummary(restaurantId);
  },

  async clearSysco(restaurantId: string): Promise<SupplierCredentialSummary> {
    await prisma.restaurantSupplierCredentials.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        syscoClientIdEncrypted: null,
        syscoClientSecretEncrypted: null,
        syscoCustomerIdEncrypted: null,
        syscoMode: null,
      },
      update: {
        syscoClientIdEncrypted: null,
        syscoClientSecretEncrypted: null,
        syscoCustomerIdEncrypted: null,
        syscoMode: null,
      },
    });
    return this.getSummary(restaurantId);
  },

  async clearGfs(restaurantId: string): Promise<SupplierCredentialSummary> {
    await prisma.restaurantSupplierCredentials.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        gfsClientIdEncrypted: null,
        gfsClientSecretEncrypted: null,
        gfsCustomerIdEncrypted: null,
        gfsMode: null,
      },
      update: {
        gfsClientIdEncrypted: null,
        gfsClientSecretEncrypted: null,
        gfsCustomerIdEncrypted: null,
        gfsMode: null,
      },
    });
    return this.getSummary(restaurantId);
  },

  async getSyscoRuntimeCredentials(restaurantId: string): Promise<SupplierRuntimeCredentials | null> {
    const row = await prisma.restaurantSupplierCredentials.findUnique({
      where: { restaurantId },
      select: {
        syscoClientIdEncrypted: true,
        syscoClientSecretEncrypted: true,
        syscoCustomerIdEncrypted: true,
        syscoMode: true,
      },
    });

    if (!row?.syscoClientIdEncrypted || !row?.syscoClientSecretEncrypted || !row?.syscoCustomerIdEncrypted) {
      return null;
    }

    return {
      clientId: decryptCredential(row.syscoClientIdEncrypted),
      clientSecret: decryptCredential(row.syscoClientSecretEncrypted),
      customerId: decryptCredential(row.syscoCustomerIdEncrypted),
      mode: normalizeMode(row.syscoMode),
    };
  },

  async getGfsRuntimeCredentials(restaurantId: string): Promise<SupplierRuntimeCredentials | null> {
    const row = await prisma.restaurantSupplierCredentials.findUnique({
      where: { restaurantId },
      select: {
        gfsClientIdEncrypted: true,
        gfsClientSecretEncrypted: true,
        gfsCustomerIdEncrypted: true,
        gfsMode: true,
      },
    });

    if (!row?.gfsClientIdEncrypted || !row?.gfsClientSecretEncrypted || !row?.gfsCustomerIdEncrypted) {
      return null;
    }

    return {
      clientId: decryptCredential(row.gfsClientIdEncrypted),
      clientSecret: decryptCredential(row.gfsClientSecretEncrypted),
      customerId: decryptCredential(row.gfsCustomerIdEncrypted),
      mode: normalizeMode(row.gfsMode),
    };
  },

  async testConnection(
    restaurantId: string,
    provider: SupplierProviderType,
  ): Promise<{ success: boolean; message: string }> {
    const creds = provider === 'sysco'
      ? await this.getSyscoRuntimeCredentials(restaurantId)
      : await this.getGfsRuntimeCredentials(restaurantId);

    if (!creds) {
      return { success: false, message: `${provider} credentials are not configured.` };
    }

    try {
      if (provider === 'sysco') {
        // Sysco OAuth2 token endpoint — validates clientId + clientSecret
        const tokenUrl = creds.mode === 'production'
          ? 'https://api.sysco.com/oauth/token'
          : 'https://api-sandbox.sysco.com/oauth/token';

        const resp = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
          }).toString(),
        });

        if (resp.ok) {
          return { success: true, message: 'Sysco API connection successful.' };
        }
        const text = await resp.text();
        return { success: false, message: `Sysco API returned ${resp.status}: ${text}` };
      }

      if (provider === 'gfs') {
        // GFS OAuth2 token endpoint — validates clientId + clientSecret
        const tokenUrl = creds.mode === 'production'
          ? 'https://api.gfs.com/oauth/token'
          : 'https://api-sandbox.gfs.com/oauth/token';

        const resp = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
          }).toString(),
        });

        if (resp.ok) {
          return { success: true, message: 'GFS API connection successful.' };
        }
        const text = await resp.text();
        return { success: false, message: `GFS API returned ${resp.status}: ${text}` };
      }

      return { success: false, message: `Unknown provider: ${provider}` };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, message: `Connection failed: ${message}` };
    }
  },
};
