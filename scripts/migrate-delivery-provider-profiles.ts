import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

type ProviderKeyBackend = 'vault_oss' | 'managed_kms';

const prisma = new PrismaClient();

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_VERSION = 'v1';
const SECURITY_PROVIDER = 'delivery_security';

interface ParsedPayload {
  backend: ProviderKeyBackend;
  ivB64: string;
  tagB64: string;
  encryptedB64: string;
}

interface MigrationConfig {
  dryRun: boolean;
  restaurantId?: string;
  actor: string;
}

function parseConfig(): MigrationConfig {
  const dryRunRaw = (process.env.DELIVERY_PROFILE_MIGRATE_DRY_RUN ?? 'true').toLowerCase();
  const dryRun = dryRunRaw !== 'false' && dryRunRaw !== '0';
  const restaurantId = process.env.DELIVERY_PROFILE_MIGRATE_RESTAURANT_ID?.trim();
  const actor = process.env.DELIVERY_PROFILE_MIGRATE_ACTOR?.trim() || 'migration-script';
  return {
    dryRun,
    restaurantId: restaurantId || undefined,
    actor,
  };
}

function parsePayload(payload: string): ParsedPayload {
  if (payload.startsWith(`${ENCRYPTION_VERSION}:`)) {
    const [version, backendRaw, rest] = payload.split(':');
    if (version !== ENCRYPTION_VERSION || !backendRaw || !rest) {
      throw new Error('Invalid encrypted payload format');
    }
    const [ivB64, tagB64, encryptedB64] = rest.split('.');
    if (!ivB64 || !tagB64 || !encryptedB64) {
      throw new Error('Invalid encrypted payload body');
    }
    return {
      backend: backendRaw === 'managed_kms' ? 'managed_kms' : 'vault_oss',
      ivB64,
      tagB64,
      encryptedB64,
    };
  }

  const [ivB64, tagB64, encryptedB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !encryptedB64) {
    throw new Error('Invalid encrypted payload body');
  }
  return {
    backend: 'vault_oss',
    ivB64,
    tagB64,
    encryptedB64,
  };
}

function deriveSha256(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

function getCandidateKeys(backend: ProviderKeyBackend): Buffer[] {
  const seen = new Set<string>();
  const values: string[] = [];

  if (backend === 'managed_kms') {
    if (process.env.DELIVERY_MANAGED_KMS_WRAPPING_KEY) values.push(process.env.DELIVERY_MANAGED_KMS_WRAPPING_KEY);
  } else {
    if (process.env.DELIVERY_FREE_WRAPPING_KEY) values.push(process.env.DELIVERY_FREE_WRAPPING_KEY);
    if (process.env.DELIVERY_CREDENTIALS_ENCRYPTION_KEY) values.push(process.env.DELIVERY_CREDENTIALS_ENCRYPTION_KEY);
    if (process.env.JWT_SECRET) values.push(process.env.JWT_SECRET);
    values.push('your-secret-key-change-in-production');
  }

  return values
    .filter((v): v is string => Boolean(v && v.trim().length > 0))
    .filter((v) => {
      const key = v.trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((value) => deriveSha256(value));
}

function decryptWithKey(parsed: ParsedPayload, key: Buffer): string {
  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    key,
    Buffer.from(parsed.ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(parsed.tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.encryptedB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function decryptPayload(payload: string): string {
  const parsed = parsePayload(payload);
  const keys = getCandidateKeys(parsed.backend);
  if (keys.length === 0) {
    throw new Error(`No keys configured for backend ${parsed.backend}`);
  }

  let lastError: unknown;
  for (const key of keys) {
    try {
      return decryptWithKey(parsed, key);
    } catch (error: unknown) {
      lastError = error;
    }
  }

  throw new Error(`Failed to decrypt payload: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function getPrimaryKey(backend: ProviderKeyBackend): Buffer {
  const keys = getCandidateKeys(backend);
  if (keys.length === 0) {
    throw new Error(`No key configured for backend ${backend}`);
  }
  return keys[0];
}

function encryptPayload(value: string, backend: ProviderKeyBackend): string {
  const key = getPrimaryKey(backend);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTION_VERSION}:${backend}:${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function modeToBackend(mode: string | null | undefined): ProviderKeyBackend {
  return mode === 'most_secure' ? 'managed_kms' : 'vault_oss';
}

async function run(): Promise<void> {
  const config = parseConfig();
  console.log(`[Migrate Profiles] dryRun=${config.dryRun} restaurantId=${config.restaurantId ?? 'ALL'}`);

  const credentialsRows = await prisma.restaurantDeliveryCredentials.findMany({
    where: config.restaurantId ? { restaurantId: config.restaurantId } : undefined,
    orderBy: { updatedAt: 'asc' },
    select: {
      id: true,
      restaurantId: true,
      doordashApiKeyEncrypted: true,
      doordashSigningSecretEncrypted: true,
      doordashMode: true,
      uberClientIdEncrypted: true,
      uberClientSecretEncrypted: true,
      uberCustomerIdEncrypted: true,
      uberWebhookSigningKeyEncrypted: true,
    },
  });

  if (credentialsRows.length === 0) {
    console.log('[Migrate Profiles] No rows found.');
    return;
  }

  const securityProfiles = await prisma.restaurantProviderProfile.findMany({
    where: {
      provider: SECURITY_PROVIDER,
      restaurantId: { in: credentialsRows.map((row) => row.restaurantId) },
    },
    select: {
      restaurantId: true,
      keyBackend: true,
    },
  });

  const backendByRestaurant = new Map<string, ProviderKeyBackend>();
  for (const entry of securityProfiles) {
    backendByRestaurant.set(entry.restaurantId, entry.keyBackend === 'managed_kms' ? 'managed_kms' : 'vault_oss');
  }

  let updatedRows = 0;
  let migratedProfiles = 0;
  let failures = 0;

  for (const row of credentialsRows) {
    const targetBackend = backendByRestaurant.get(row.restaurantId) ?? 'vault_oss';

    try {
      const migrated = {
        doordashApiKeyEncrypted: row.doordashApiKeyEncrypted
          ? encryptPayload(decryptPayload(row.doordashApiKeyEncrypted), targetBackend)
          : null,
        doordashSigningSecretEncrypted: row.doordashSigningSecretEncrypted
          ? encryptPayload(decryptPayload(row.doordashSigningSecretEncrypted), targetBackend)
          : null,
        uberClientIdEncrypted: row.uberClientIdEncrypted
          ? encryptPayload(decryptPayload(row.uberClientIdEncrypted), targetBackend)
          : null,
        uberClientSecretEncrypted: row.uberClientSecretEncrypted
          ? encryptPayload(decryptPayload(row.uberClientSecretEncrypted), targetBackend)
          : null,
        uberCustomerIdEncrypted: row.uberCustomerIdEncrypted
          ? encryptPayload(decryptPayload(row.uberCustomerIdEncrypted), targetBackend)
          : null,
        uberWebhookSigningKeyEncrypted: row.uberWebhookSigningKeyEncrypted
          ? encryptPayload(decryptPayload(row.uberWebhookSigningKeyEncrypted), targetBackend)
          : null,
      };

      const doordashConfigured = Boolean(migrated.doordashApiKeyEncrypted && migrated.doordashSigningSecretEncrypted);
      const uberConfigured = Boolean(
        migrated.uberClientIdEncrypted
        && migrated.uberClientSecretEncrypted
        && migrated.uberCustomerIdEncrypted
        && migrated.uberWebhookSigningKeyEncrypted,
      );

      if (config.dryRun) {
        console.log(`[Migrate Profiles] DRY RUN restaurant=${row.restaurantId} backend=${targetBackend} doordash=${doordashConfigured} uber=${uberConfigured}`);
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.restaurantDeliveryCredentials.update({
          where: { id: row.id },
          data: migrated,
        });

        updatedRows += 1;

        const ddProfile = await tx.restaurantProviderProfile.upsert({
          where: {
            restaurantId_provider: {
              restaurantId: row.restaurantId,
              provider: 'doordash',
            },
          },
          create: {
            restaurantId: row.restaurantId,
            provider: 'doordash',
            keyBackend: targetBackend,
            profileVersion: 1,
            profileState: doordashConfigured ? 'ACTIVE' : 'DISABLED',
            configRefMap: {
              refs: {
                apiKey: migrated.doordashApiKeyEncrypted ? 'present' : 'absent',
                signingSecret: migrated.doordashSigningSecretEncrypted ? 'present' : 'absent',
              },
              mode: row.doordashMode === 'production' ? 'production' : 'test',
            },
            dekVersion: 1,
          },
          update: {
            keyBackend: targetBackend,
            profileState: doordashConfigured ? 'ACTIVE' : 'DISABLED',
            configRefMap: {
              refs: {
                apiKey: migrated.doordashApiKeyEncrypted ? 'present' : 'absent',
                signingSecret: migrated.doordashSigningSecretEncrypted ? 'present' : 'absent',
              },
              mode: row.doordashMode === 'production' ? 'production' : 'test',
            },
            profileVersion: { increment: 1 },
          },
        });

        await tx.restaurantProviderProfileEvent.create({
          data: {
            restaurantId: row.restaurantId,
            profileId: ddProfile.id,
            provider: 'doordash',
            action: 'migration_profile_sync',
            actor: config.actor,
            profileVersion: ddProfile.profileVersion,
            outcome: 'SUCCESS',
            metadata: { backend: targetBackend },
          },
        });

        const uberProfile = await tx.restaurantProviderProfile.upsert({
          where: {
            restaurantId_provider: {
              restaurantId: row.restaurantId,
              provider: 'uber',
            },
          },
          create: {
            restaurantId: row.restaurantId,
            provider: 'uber',
            keyBackend: targetBackend,
            profileVersion: 1,
            profileState: uberConfigured ? 'ACTIVE' : 'DISABLED',
            configRefMap: {
              refs: {
                clientId: migrated.uberClientIdEncrypted ? 'present' : 'absent',
                clientSecret: migrated.uberClientSecretEncrypted ? 'present' : 'absent',
                customerId: migrated.uberCustomerIdEncrypted ? 'present' : 'absent',
                webhookSigningKey: migrated.uberWebhookSigningKeyEncrypted ? 'present' : 'absent',
              },
            },
            dekVersion: 1,
          },
          update: {
            keyBackend: targetBackend,
            profileState: uberConfigured ? 'ACTIVE' : 'DISABLED',
            configRefMap: {
              refs: {
                clientId: migrated.uberClientIdEncrypted ? 'present' : 'absent',
                clientSecret: migrated.uberClientSecretEncrypted ? 'present' : 'absent',
                customerId: migrated.uberCustomerIdEncrypted ? 'present' : 'absent',
                webhookSigningKey: migrated.uberWebhookSigningKeyEncrypted ? 'present' : 'absent',
              },
            },
            profileVersion: { increment: 1 },
          },
        });

        await tx.restaurantProviderProfileEvent.create({
          data: {
            restaurantId: row.restaurantId,
            profileId: uberProfile.id,
            provider: 'uber',
            action: 'migration_profile_sync',
            actor: config.actor,
            profileVersion: uberProfile.profileVersion,
            outcome: 'SUCCESS',
            metadata: { backend: targetBackend },
          },
        });

        migratedProfiles += 2;
      });
    } catch (error: unknown) {
      failures += 1;
      console.error(
        `[Migrate Profiles] Failed restaurant=${row.restaurantId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log('[Migrate Profiles] Summary');
  console.log(`- rows: ${credentialsRows.length}`);
  console.log(`- updatedRows: ${updatedRows}`);
  console.log(`- migratedProfiles: ${migratedProfiles}`);
  console.log(`- failures: ${failures}`);

  if (failures > 0) {
    process.exitCode = 1;
  }
}

run()
  .catch((error: unknown) => {
    console.error('[Migrate Profiles] Fatal error:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
