import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger';
import { auditLog } from '../utils/audit';
import { sendMfaOtpEmail } from './email.service';

const prisma = new PrismaClient();

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export const mfaService = {
  /**
   * Generate and send a 6-digit email OTP.
   * Used for both MFA setup verification and login challenge.
   */
  async sendOtp(teamMemberId: string, email: string, firstName: string | null): Promise<void> {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const hash = await bcrypt.hash(code, 10);
    const expiry = new Date(Date.now() + OTP_EXPIRY_MS);

    await prisma.mfaSecret.upsert({
      where: { teamMemberId },
      create: {
        teamMemberId,
        mfaType: 'email',
        emailOtpHash: hash,
        emailOtpExpiry: expiry,
        verified: false,
        backupCodes: [],
      },
      update: {
        mfaType: 'email',
        emailOtpHash: hash,
        emailOtpExpiry: expiry,
      },
    });

    await sendMfaOtpEmail(email, firstName, code);
    logger.info('[MFA] OTP sent', { userId: teamMemberId });
  },

  /**
   * Verify an email OTP to complete MFA setup.
   * Marks MFA as enabled on success.
   */
  async verifyAndEnable(teamMemberId: string, code: string): Promise<{ success: boolean; error?: string }> {
    const record = await prisma.mfaSecret.findUnique({ where: { teamMemberId } });

    if (!record?.emailOtpHash || !record.emailOtpExpiry) {
      return { success: false, error: 'No pending code. Please request a new one.' };
    }

    if (record.emailOtpExpiry < new Date()) {
      return { success: false, error: 'Code expired. Please request a new one.' };
    }

    const isValid = await bcrypt.compare(code.trim(), record.emailOtpHash);
    if (!isValid) {
      return { success: false, error: 'Invalid code. Please try again.' };
    }

    await prisma.$transaction([
      prisma.mfaSecret.update({
        where: { teamMemberId },
        data: { verified: true, emailOtpHash: null, emailOtpExpiry: null },
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
   * Verify an email OTP during login challenge.
   * Consumes (deletes) the OTP on success — single use.
   */
  async verifyCode(teamMemberId: string, code: string): Promise<boolean> {
    const record = await prisma.mfaSecret.findUnique({ where: { teamMemberId } });

    if (!record?.verified) return false;
    if (!record.emailOtpHash || !record.emailOtpExpiry) return false;
    if (record.emailOtpExpiry < new Date()) {
      await auditLog('mfa_verify_expired', { userId: teamMemberId });
      return false;
    }

    const isValid = await bcrypt.compare(code.trim(), record.emailOtpHash);

    if (isValid) {
      await prisma.mfaSecret.update({
        where: { teamMemberId },
        data: { emailOtpHash: null, emailOtpExpiry: null },
      });
      await auditLog('mfa_verify_success', { userId: teamMemberId });
      return true;
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
  async getStatus(teamMemberId: string): Promise<{ enabled: boolean; mfaType: 'email' }> {
    const member = await prisma.teamMember.findUnique({
      where: { id: teamMemberId },
      select: { mfaEnabled: true },
    });

    return {
      enabled: member?.mfaEnabled ?? false,
      mfaType: 'email',
    };
  },

  maskEmail,
};
