import { PrismaClient } from '@prisma/client';
import {
  DeliveryCredentialMode,
  ProviderSecurityProfileSummary,
} from './provider-profile.types';
import {
  backendToMode,
  canUseMostSecureBackend,
  modeToKeyBackend,
} from './provider-key-management.service';

const prisma = new PrismaClient();

const DELIVERY_SECURITY_PROVIDER = 'delivery_security';

function defaultSecuritySummary(): ProviderSecurityProfileSummary {
  return {
    mode: 'free',
    backend: modeToKeyBackend('free'),
    availableModes: ['free', 'most_secure'],
    canUseMostSecure: canUseMostSecureBackend(),
    updatedAt: null,
  };
}

export const providerProfileService = {
  async getDeliverySecurityProfile(restaurantId: string): Promise<ProviderSecurityProfileSummary> {
    const row = await prisma.restaurantProviderProfile.findUnique({
      where: {
        restaurantId_provider: {
          restaurantId,
          provider: DELIVERY_SECURITY_PROVIDER,
        },
      },
      select: {
        keyBackend: true,
        updatedAt: true,
      },
    });

    if (!row) {
      return defaultSecuritySummary();
    }

    const backend = row.keyBackend === 'managed_kms'
      ? 'managed_kms'
      : 'vault_oss';

    return {
      mode: backendToMode(backend),
      backend,
      availableModes: ['free', 'most_secure'],
      canUseMostSecure: canUseMostSecureBackend(),
      updatedAt: row.updatedAt.toISOString(),
    };
  },

  async setDeliverySecurityProfile(
    restaurantId: string,
    mode: DeliveryCredentialMode,
    actor?: string | null,
  ): Promise<ProviderSecurityProfileSummary> {
    const backend = modeToKeyBackend(mode);
    if (backend === 'managed_kms' && !canUseMostSecureBackend()) {
      throw new Error('Most secure backend is not configured yet');
    }

    const updated = await prisma.restaurantProviderProfile.upsert({
      where: {
        restaurantId_provider: {
          restaurantId,
          provider: DELIVERY_SECURITY_PROVIDER,
        },
      },
      create: {
        restaurantId,
        provider: DELIVERY_SECURITY_PROVIDER,
        configRefMap: null,
        profileVersion: 1,
        profileState: 'ACTIVE',
        keyBackend: backend,
        dekVersion: 1,
      },
      update: {
        keyBackend: backend,
        profileVersion: { increment: 1 },
        profileState: 'ACTIVE',
      },
    });

    await prisma.restaurantProviderProfileEvent.create({
      data: {
        restaurantId,
        profileId: updated.id,
        provider: DELIVERY_SECURITY_PROVIDER,
        action: 'security_mode_changed',
        actor: actor ?? null,
        profileVersion: updated.profileVersion,
        outcome: 'SUCCESS',
        correlationId: null,
        metadata: {
          mode,
          backend,
        },
      },
    });

    return {
      mode,
      backend,
      availableModes: ['free', 'most_secure'],
      canUseMostSecure: canUseMostSecureBackend(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  },
};
