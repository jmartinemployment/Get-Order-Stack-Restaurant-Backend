import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const secret = process.env.AI_CREDENTIALS_ENCRYPTION_KEY
    || process.env.JWT_SECRET
    || 'your-secret-key-change-in-production';
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(plainText: string): { encrypted: string; iv: string; tag: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

function decrypt(encryptedHex: string, ivHex: string, tagHex: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export interface AiKeyStatus {
  configured: boolean;
  keyLastFour: string | null;
  isValid: boolean;
}

export const aiCredentialsService = {
  async saveApiKey(restaurantId: string, apiKey: string): Promise<AiKeyStatus> {
    const { encrypted, iv, tag } = encrypt(apiKey);
    const keyLastFour = apiKey.slice(-4);
    const isValid = await this.validateApiKey(apiKey);

    await prisma.restaurantAiCredentials.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        encryptedApiKey: encrypted,
        encryptionIv: iv,
        encryptionTag: tag,
        keyLastFour,
        isValid,
      },
      update: {
        encryptedApiKey: encrypted,
        encryptionIv: iv,
        encryptionTag: tag,
        keyLastFour,
        isValid,
      },
    });

    return { configured: true, keyLastFour, isValid };
  },

  async getApiKey(restaurantId: string): Promise<string | null> {
    const row = await prisma.restaurantAiCredentials.findUnique({
      where: { restaurantId },
      select: { encryptedApiKey: true, encryptionIv: true, encryptionTag: true },
    });

    if (!row) return null;

    try {
      return decrypt(row.encryptedApiKey, row.encryptionIv, row.encryptionTag);
    } catch {
      return null;
    }
  },

  async deleteApiKey(restaurantId: string): Promise<void> {
    await prisma.restaurantAiCredentials.deleteMany({
      where: { restaurantId },
    });
  },

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const client = new Anthropic({ apiKey });
      await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Reply with OK' }],
      });
      return true;
    } catch {
      return false;
    }
  },

  async getKeyStatus(restaurantId: string): Promise<AiKeyStatus> {
    const row = await prisma.restaurantAiCredentials.findUnique({
      where: { restaurantId },
      select: { keyLastFour: true, isValid: true },
    });

    if (!row) {
      return { configured: false, keyLastFour: null, isValid: false };
    }

    return { configured: true, keyLastFour: row.keyLastFour, isValid: row.isValid };
  },
};
