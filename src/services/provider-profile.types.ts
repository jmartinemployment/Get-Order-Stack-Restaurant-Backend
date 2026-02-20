import { Prisma } from '@prisma/client';

export type DeliveryCredentialMode = 'free' | 'most_secure';
export type ProviderProfileState = 'ACTIVE' | 'DISABLED' | 'ROTATING' | 'REVOKED';
export type ProviderKeyBackend = 'vault_oss' | 'managed_kms';

export interface ProviderSecurityProfileSummary {
  mode: DeliveryCredentialMode;
  backend: ProviderKeyBackend;
  availableModes: DeliveryCredentialMode[];
  canUseMostSecure: boolean;
  updatedAt: string | null;
}

export interface ProviderProfileSummary {
  id: string;
  restaurantId: string;
  provider: string;
  configRefMap: Prisma.JsonValue | null;
  profileVersion: number;
  profileState: ProviderProfileState;
  keyBackend: ProviderKeyBackend;
  keyRef: string | null;
  wrappedDek: string | null;
  dekVersion: number;
  aadHash: string | null;
  createdAt: string;
  updatedAt: string;
  rotatedAt: string | null;
}

export interface ProviderProfileEventSummary {
  id: string;
  restaurantId: string;
  profileId: string | null;
  provider: string;
  action: string;
  actor: string | null;
  profileVersion: number | null;
  outcome: string;
  correlationId: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: string;
}

export interface CreateDekInput {
  restaurantId: string;
  provider: string;
  profileVersion: number;
}

export interface WrappedDekResult {
  wrappedDek: string;
  dekVersion: number;
  keyRef?: string;
}

export interface UnwrapDekInput {
  restaurantId: string;
  provider: string;
  profileVersion: number;
  wrappedDek: string;
  dekVersion: number;
  keyRef?: string | null;
}

export interface RotateDekInput {
  restaurantId: string;
  provider: string;
  currentProfileVersion: number;
  keyRef?: string | null;
}

export interface DisableProfileInput {
  restaurantId: string;
  provider: string;
  reason: string;
}

export interface KeyManagementService {
  createDek(input: CreateDekInput): Promise<Uint8Array>;
  wrapDek(rawDek: Uint8Array, input: CreateDekInput): Promise<WrappedDekResult>;
  unwrapDek(input: UnwrapDekInput): Promise<Uint8Array>;
  rotateDek(input: RotateDekInput): Promise<WrappedDekResult>;
  disableProfile(input: DisableProfileInput): Promise<void>;
}

export interface SecretStoreWriteInput {
  restaurantId: string;
  provider: string;
  config: Record<string, string>;
  profileVersion: number;
}

export interface SecretStoreReadInput {
  restaurantId: string;
  provider: string;
  configRefMap: Prisma.JsonValue | null;
  profileVersion: number;
}

export interface SecretStoreDeleteInput {
  restaurantId: string;
  provider: string;
  configRefMap: Prisma.JsonValue | null;
  profileVersion: number;
}

export interface CredentialSecretStore {
  upsertRefs(input: SecretStoreWriteInput): Promise<Prisma.JsonValue>;
  readByRefs(input: SecretStoreReadInput): Promise<Record<string, string>>;
  deleteByRefs(input: SecretStoreDeleteInput): Promise<void>;
}
