import crypto from 'node:crypto';
import {
  CreateDekInput,
  DeliveryCredentialMode,
  DisableProfileInput,
  KeyManagementService,
  ProviderKeyBackend,
  RotateDekInput,
  UnwrapDekInput,
  WrappedDekResult,
} from './provider-profile.types';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

const FREE_BACKEND: ProviderKeyBackend = 'vault_oss';
const MOST_SECURE_BACKEND: ProviderKeyBackend = 'managed_kms';

function toSha256Key(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

function ensureWrappingKey(secret: string | undefined, backend: ProviderKeyBackend): Buffer {
  if (!secret || secret.trim().length === 0) {
    throw new Error(`${backend} key backend is not configured`);
  }
  return toSha256Key(secret);
}

function encodeWrappedDek(buffer: Buffer, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decodeWrappedDek(payload: string, key: Buffer): Buffer {
  const [ivB64, tagB64, encryptedB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !encryptedB64) {
    throw new Error('Invalid wrapped DEK payload');
  }

  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    key,
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, 'base64')),
    decipher.final(),
  ]);
}

class LocalEnvelopeKeyManagementService implements KeyManagementService {
  constructor(
    private readonly wrappingKey: Buffer,
    private readonly keyRefPrefix: string,
  ) {}

  async createDek(_input: CreateDekInput): Promise<Uint8Array> {
    return crypto.randomBytes(32);
  }

  async wrapDek(rawDek: Uint8Array, _input: CreateDekInput): Promise<WrappedDekResult> {
    const dek = Buffer.from(rawDek);
    return {
      wrappedDek: encodeWrappedDek(dek, this.wrappingKey),
      dekVersion: 1,
      keyRef: `${this.keyRefPrefix}:v1`,
    };
  }

  async unwrapDek(input: UnwrapDekInput): Promise<Uint8Array> {
    return decodeWrappedDek(input.wrappedDek, this.wrappingKey);
  }

  async rotateDek(_input: RotateDekInput): Promise<WrappedDekResult> {
    const nextDek = crypto.randomBytes(32);
    return {
      wrappedDek: encodeWrappedDek(nextDek, this.wrappingKey),
      dekVersion: 1,
      keyRef: `${this.keyRefPrefix}:v1`,
    };
  }

  async disableProfile(_input: DisableProfileInput): Promise<void> {
    // No-op for local adapters.
  }
}

export function modeToKeyBackend(mode: DeliveryCredentialMode): ProviderKeyBackend {
  return mode === 'most_secure' ? MOST_SECURE_BACKEND : FREE_BACKEND;
}

export function backendToMode(backend: ProviderKeyBackend): DeliveryCredentialMode {
  return backend === MOST_SECURE_BACKEND ? 'most_secure' : 'free';
}

export function canUseMostSecureBackend(): boolean {
  return Boolean(process.env.DELIVERY_MANAGED_KMS_WRAPPING_KEY);
}

export function createKeyManagementService(backend: ProviderKeyBackend): KeyManagementService {
  if (backend === MOST_SECURE_BACKEND) {
    const key = ensureWrappingKey(process.env.DELIVERY_MANAGED_KMS_WRAPPING_KEY, backend);
    return new LocalEnvelopeKeyManagementService(key, 'managed_kms_local');
  }

  const key = ensureWrappingKey(
    process.env.DELIVERY_FREE_WRAPPING_KEY
      || process.env.JWT_SECRET,
    backend,
  );
  return new LocalEnvelopeKeyManagementService(key, 'vault_oss_local');
}
