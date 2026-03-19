import { PrismaClient } from '@prisma/client';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import crypto from 'node:crypto';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger';
import { auditLog } from '../utils/audit';

const prisma = new PrismaClient();

function loadMfaEncryptionKey(): string | undefined {
  if (process.env.MFA_ENCRYPTION_KEY) return process.env.MFA_ENCRYPTION_KEY;
  try {
    return fs.readFileSync('/etc/secrets/MFA_ENCRYPTION_KEY', 'utf8').trim();
  } catch {
    return undefined;
  }
}

const MFA_ENCRYPTION_KEY = loadMfaEncryptionKey();
const APP_NAME = 'OrderStack';

// ============ Encryption helpers ============

function encrypt(plaintext: string): string {
  if (!MFA_ENCRYPTION_KEY) throw new Error('MFA_ENCRYPTION_KEY not configured');
  const key = Buffer.from(MFA_ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(ciphertext: string): string {
  if (!MFA_ENCRYPTION_KEY) throw new Error('MFA_ENCRYPTION_KEY not configured');
  const key = Buffer.from(MFA_ENCRYPTION_KEY, 'hex');
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

// ============ MFA Service ============

export const mfaService = {
  /**
   * Generate a new TOTP secret and QR code for the user.
   * Does NOT enable MFA — user must verify a code first.
   */
  async setupMfa(teamMemberId: string, email: string): Promise<{ secret: string; qrCodeDataUrl: string; backupCodes: string[] }> {
    const secret = generateSecret();
    const otpAuthUrl = generateURI({ secret, issuer: APP_NAME, label: email });
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    // Generate 10 backup codes
    const backupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      backupCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }

    // Hash backup codes for storage
    const hashedBackupCodes: string[] = [];
    for (const code of backupCodes) {
      hashedBackupCodes.push(await bcrypt.hash(code, 10));
    }

    // Store encrypted secret and hashed backup codes
    await prisma.mfaSecret.upsert({
      where: { teamMemberId },
      create: {
        teamMemberId,
        secret: encrypt(secret),
        backupCodes: hashedBackupCodes,
        verified: false,
      },
      update: {
        secret: encrypt(secret),
        backupCodes: hashedBackupCodes,
        verified: false,
      },
    });

    return { secret, qrCodeDataUrl, backupCodes };
  },

  /**
   * Verify a TOTP code to complete MFA setup.
   * Marks MFA as enabled on the TeamMember and MfaSecret.
   */
  async verifyAndEnable(teamMemberId: string, code: string): Promise<{ success: boolean; error?: string }> {
    const mfaRecord = await prisma.mfaSecret.findUnique({ where: { teamMemberId } });
    if (!mfaRecord) {
      return { success: false, error: 'MFA not configured. Run setup first.' };
    }

    const secret = decrypt(mfaRecord.secret);
    const result = verifySync({ token: code, secret });

    if (!result.valid) {
      return { success: false, error: 'Invalid verification code. Try again.' };
    }

    // Mark as verified and enable MFA on the user
    await prisma.$transaction([
      prisma.mfaSecret.update({
        where: { teamMemberId },
        data: { verified: true },
      }),
      prisma.teamMember.update({
        where: { id: teamMemberId },
        data: { mfaEnabled: true },
      }),
    ]);

    await auditLog('mfa_enabled', { userId: teamMemberId });
    logger.info('[MFA] Enabled for user', { userId: teamMemberId });

    return { success: true };
  },

  /**
   * Verify a TOTP code during login (MFA challenge).
   */
  async verifyCode(teamMemberId: string, code: string): Promise<boolean> {
    const mfaRecord = await prisma.mfaSecret.findUnique({ where: { teamMemberId } });
    if (!mfaRecord?.verified) return false;

    const secret = decrypt(mfaRecord.secret);

    // Try TOTP first
    if (verifySync({ token: code, secret }).valid) {
      await auditLog('mfa_verify_success', { userId: teamMemberId });
      return true;
    }

    // Try backup codes
    for (let i = 0; i < mfaRecord.backupCodes.length; i++) {
      const isMatch = await bcrypt.compare(code, mfaRecord.backupCodes[i]);
      if (isMatch) {
        // Remove used backup code
        const updatedCodes = [...mfaRecord.backupCodes];
        updatedCodes.splice(i, 1);
        await prisma.mfaSecret.update({
          where: { teamMemberId },
          data: { backupCodes: updatedCodes },
        });
        await auditLog('mfa_backup_code_used', { userId: teamMemberId, metadata: { remainingCodes: updatedCodes.length } });
        logger.info('[MFA] Backup code used', { userId: teamMemberId });
        return true;
      }
    }

    await auditLog('mfa_verify_failed', { userId: teamMemberId });
    return false;
  },

  /**
   * Disable MFA for a user.
   */
  async disableMfa(teamMemberId: string): Promise<void> {
    await prisma.$transaction([
      prisma.mfaSecret.deleteMany({ where: { teamMemberId } }),
      prisma.teamMember.update({
        where: { id: teamMemberId },
        data: { mfaEnabled: false },
      }),
    ]);

    await auditLog('mfa_disabled', { userId: teamMemberId });
    logger.info('[MFA] Disabled for user', { userId: teamMemberId });
  },

  /**
   * Get MFA status for a user.
   */
  async getStatus(teamMemberId: string): Promise<{ enabled: boolean; backupCodesRemaining: number }> {
    const member = await prisma.teamMember.findUnique({
      where: { id: teamMemberId },
      select: { mfaEnabled: true },
    });
    const mfaRecord = await prisma.mfaSecret.findUnique({
      where: { teamMemberId },
      select: { backupCodes: true },
    });
    return {
      enabled: member?.mfaEnabled ?? false,
      backupCodesRemaining: mfaRecord?.backupCodes?.length ?? 0,
    };
  },
};
