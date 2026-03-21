import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { UAParser } from 'ua-parser-js';
import { sendPasswordResetEmail } from './email.service';
import { logger } from '../utils/logger';
import { auditLog } from '../utils/audit';
import { trackLoginFailed, trackAccountLocked, trackPasswordResetRequest, trackMfaFailed } from './security-alert.service';

const prisma = new PrismaClient();

// ============ Shared Constants & Helpers ============
// Exported for use in auth.routes.ts — single source of truth.

export const MFA_REQUIRED_ROLES: readonly string[] = ['super_admin', 'owner', 'manager'];

export const RESTAURANT_SELECT = {
  id: true, name: true, slug: true, merchantProfile: true,
  trialEndsAt: true, trialExpiredAt: true,
  subscription: { select: { status: true } },
} as const;

export interface RestaurantListItem {
  id: string;
  name: string;
  slug: string;
  role: string;
  onboardingComplete: boolean;
  subscriptionStatus: string;
  trialEndsAt: string | null;
}

export function extractOnboardingComplete(merchantProfile: unknown): boolean {
  if (!merchantProfile || typeof merchantProfile !== 'object') return false;
  return (merchantProfile as Record<string, unknown>)['onboardingComplete'] === true;
}

export function deriveSubscriptionStatus(r: { trialEndsAt: Date | null; trialExpiredAt: Date | null; subscription: { status: string } | null }): string {
  if (r.subscription?.status) return r.subscription.status;
  const now = new Date();
  if (r.trialEndsAt && r.trialEndsAt > now && r.trialExpiredAt === null) return 'trialing';
  return 'suspended';
}

// JWT_SECRET is required — refuse to start if not configured
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. The server cannot start without it.');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h'; // Admin sessions: 8 hours
const DEVICE_TOKEN_EXPIRES_IN = '24h'; // Device sessions: 24 hours
const SALT_ROUNDS = 12;
const TRUST_WINDOW_DAYS = 90;
const MAX_TRUSTED_DEVICES = 10;

export interface TokenPayload {
  teamMemberId: string;
  email: string;
  role: string;
  restaurantGroupId?: string;
  sessionId: string;
  type: 'user' | 'device' | 'pin';
}

export interface AuthResult {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    restaurantGroupId: string | null;
    mfaEnabled: boolean;
  };
  restaurants?: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
    onboardingComplete: boolean;
  }>;
  error?: string;
  requiresPasswordChange?: boolean;
  mfaRequired?: boolean;
  mfaEnrollmentRequired?: boolean;
  mfaGraceDeadline?: string;
}

export interface PinAuthResult {
  success: boolean;
  staffPin?: {
    id: string;
    name: string;
    role: string;
    restaurantId: string;
  };
  error?: string;
}

export interface ServiceResult {
  success: boolean;
  error?: string;
}

class AuthService {
  // ============ Password Hashing ============

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // ============ PIN Hashing ============

  async hashPin(pin: string): Promise<string> {
    // PINs use same bcrypt but could use lighter hashing if performance is an issue
    return bcrypt.hash(pin, SALT_ROUNDS);
  }

  async verifyPin(pin: string, hash: string): Promise<boolean> {
    return bcrypt.compare(pin, hash);
  }

  // ============ JWT Token Management ============

  generateToken(payload: Omit<TokenPayload, 'sessionId'>, sessionId: string, expiresIn: string = JWT_EXPIRES_IN): string {
    return jwt.sign(
      { ...payload, sessionId },
      JWT_SECRET,
      { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] }
    );
  }

  verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.debug('[Auth] Token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        logger.debug('[Auth] Invalid token:', { message: error.message });
      } else {
        logger.error('[Auth] Unexpected token verification error:', { error });
      }
      return null;
    }
  }

  // ============ Password Policy ============

  private validatePasswordStrength(password: string): { valid: boolean; error?: string } {
    if (password.length < 12) return { valid: false, error: 'Password must be at least 12 characters' };
    if (!/[A-Z]/.exec(password)) return { valid: false, error: 'Password must contain an uppercase letter' };
    if (!/[a-z]/.exec(password)) return { valid: false, error: 'Password must contain a lowercase letter' };
    if (!/\d/.exec(password)) return { valid: false, error: 'Password must contain a number' };
    if (!/[^A-Za-z0-9]/.exec(password)) return { valid: false, error: 'Password must contain a special character' };
    return { valid: true };
  }

  // ============ Password History ============

  private async checkPasswordHistory(teamMemberId: string, newPassword: string): Promise<boolean> {
    // Check ALL retained history (up to 12) — PCI DSS 8.2.5
    const history = await prisma.passwordHistory.findMany({
      where: { teamMemberId },
      orderBy: { createdAt: 'desc' },
    });
    for (const entry of history) {
      if (await bcrypt.compare(newPassword, entry.passwordHash)) return false;
    }
    return true;
  }

  private async recordPasswordHistory(teamMemberId: string, passwordHash: string): Promise<void> {
    await prisma.passwordHistory.create({ data: { teamMemberId, passwordHash } });
    const old = await prisma.passwordHistory.findMany({
      where: { teamMemberId },
      orderBy: { createdAt: 'desc' },
      skip: 12,
    });
    if (old.length > 0) {
      await prisma.passwordHistory.deleteMany({ where: { id: { in: old.map(o => o.id) } } });
    }
  }

  // ============ User Authentication (Email/Password) ============

  private async isAccountLocked(email: string): Promise<boolean> {
    const recentFailures = await prisma.auditLog.count({
      where: {
        action: 'login_failed',
        metadata: { path: ['email'], equals: email.toLowerCase() },
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
    });
    return recentFailures >= 6;
  }

  private checkPasswordValidity(member: Awaited<ReturnType<typeof prisma.teamMember.findUnique>>): AuthResult | null {
    if (member!.tempPasswordExpiresAt && new Date() > member!.tempPasswordExpiresAt) {
      return { success: false, error: 'Temporary password expired. Ask your manager to reset it.' };
    }
    if (member!.mustChangePassword) {
      return { success: false, error: 'PASSWORD_CHANGE_REQUIRED', requiresPasswordChange: true };
    }
    if (member!.passwordChangedAt && ['admin', 'owner', 'manager', 'super_admin'].includes(member!.role)) {
      const daysSinceChange = (Date.now() - member!.passwordChangedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceChange > 90) {
        return { success: false, error: 'PASSWORD_EXPIRED', requiresPasswordChange: true };
      }
    }
    return null;
  }

  async loginUser(email: string, password: string, deviceInfo?: string, ipAddress?: string, userAgent?: string, deviceInfoHeader?: string): Promise<AuthResult> {
    try {
      // Find team member by email (only those with passwordHash can do email/password login)
      const member = await prisma.teamMember.findUnique({
        where: { email: email.toLowerCase() },
        include: {
          restaurantGroup: true,
          restaurantAccess: {
            include: {
              restaurant: {
                select: {
                  id: true, name: true, slug: true, merchantProfile: true,
                  trialEndsAt: true, trialExpiredAt: true,
                  subscription: { select: { status: true } },
                }
              }
            }
          }
        }
      });

      if (!member) {
        return { success: false, error: 'Invalid email or password' };
      }

      if (!member.isActive) {
        return { success: false, error: 'Account is disabled' };
      }

      if (!member.passwordHash) {
        return { success: false, error: 'Invalid email or password' };
      }

      // Account lockout: check for too many recent failed attempts
      if (await this.isAccountLocked(email)) {
        await auditLog('account_locked', { metadata: { email } });
        trackAccountLocked(email, ipAddress);
        return { success: false, error: 'Account locked due to too many failed attempts. Try again in 15 minutes.' };
      }

      // Verify password
      const isValid = await this.verifyPassword(password, member.passwordHash);
      if (!isValid) {
        await auditLog('login_failed', { metadata: { email: email.toLowerCase(), reason: 'invalid_password' } });
        trackLoginFailed(ipAddress ?? 'unknown', email);
        return { success: false, error: 'Invalid email or password' };
      }

      // Check password validity (expiry, forced change, 90-day policy)
      const validityError = this.checkPasswordValidity(member);
      if (validityError) return validityError;

      // MFA check — if enabled, check trusted device before requiring OTP (PCI DSS 8.4.2)
      if (member.mfaEnabled) {
        const fingerprint = this.computeUaFingerprint(userAgent, deviceInfoHeader);
        const isTrusted = fingerprint && ipAddress
          ? await this.checkTrust(member.id, fingerprint, ipAddress)
          : false;

        if (!isTrusted) {
          // Not trusted — require MFA challenge
          const mfaSession = await prisma.userSession.create({
            data: {
              userId: member.id,
              token: this.generateSessionToken(),
              deviceInfo: deviceInfo ?? 'MFA pending',
              ipAddress,
              expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
            },
          });

          const mfaToken = this.generateToken(
            { teamMemberId: member.id, email: member.email!, role: member.role, type: 'user' },
            mfaSession.id,
            '5m',
          );

          return {
            success: true,
            token: mfaToken,
            user: {
              id: member.id,
              email: member.email!,
              firstName: member.firstName,
              lastName: member.lastName,
              role: member.role,
              restaurantGroupId: member.restaurantGroupId,
              mfaEnabled: true,
            },
            mfaRequired: true,
          };
        }
        // Trusted device — skip MFA, fall through to create full session
      }

      // PCI DSS 8.4.2: MFA enrollment enforcement for privileged roles.
      // Admin/owner/manager accounts MUST enable MFA. A 7-day grace period is
      // granted on first login; after that, login is blocked until MFA is set up.
      // Skip for accounts with no restaurant access (still onboarding).
      const hasRestaurantAccess = member.restaurantAccess.length > 0 || !!member.restaurantGroupId || !!member.restaurantId;
      if (MFA_REQUIRED_ROLES.includes(member.role) && !member.mfaEnabled && hasRestaurantAccess) {
        const now = new Date();

        if (!member.mfaGraceDeadline) {
          // First login without MFA — start 7-day grace period
          const graceDeadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          await prisma.teamMember.update({
            where: { id: member.id },
            data: { mfaGraceDeadline: graceDeadline },
          });
          await auditLog('mfa_grace_started', { userId: member.id, ip: ipAddress, metadata: { deadline: graceDeadline.toISOString() } });
          // Allow login but signal that enrollment is required
          // (handled below — mfaEnrollmentRequired is set on the result)
          (member as { mfaGraceDeadline: Date }).mfaGraceDeadline = graceDeadline;
        } else if (now > member.mfaGraceDeadline) {
          // Grace period expired — block login
          await auditLog('mfa_enrollment_blocked', { userId: member.id, ip: ipAddress });
          return { success: false, error: 'MFA_ENROLLMENT_REQUIRED' };
        }
        // Within grace period — allow login, frontend shows enrollment banner
      }

      // Create session
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

      const session = await prisma.userSession.create({
        data: {
          userId: member.id,
          token: this.generateSessionToken(),
          deviceInfo,
          ipAddress,
          expiresAt
        }
      });

      // Enforce concurrent session limit (max 5 active sessions)
      const activeSessions = await prisma.userSession.findMany({
        where: { userId: member.id, isActive: true },
        orderBy: { createdAt: 'asc' },
      });

      if (activeSessions.length > 5) {
        const toRevoke = activeSessions.slice(0, -5);
        await prisma.userSession.updateMany({
          where: { id: { in: toRevoke.map(s => s.id) } },
          data: { isActive: false },
        });
        await auditLog('session_limit_enforced', { userId: member.id, metadata: { revokedCount: toRevoke.length } });
      }

      // Generate JWT
      const token = this.generateToken(
        {
          teamMemberId: member.id,
          email: member.email!,
          role: member.role,
          restaurantGroupId: member.restaurantGroupId ?? undefined,
          type: 'user'
        },
        session.id
      );

      // Update last login
      await prisma.teamMember.update({
        where: { id: member.id },
        data: { lastLoginAt: new Date() }
      });

      // Audit successful login
      const accessCount = member.restaurantAccess.length;
      await auditLog('login', {
        userId: member.id,
        ip: ipAddress,
        metadata: { email: email.toLowerCase(), merchantCount: accessCount },
      });

      // Get accessible restaurants
      const restaurants = await this.buildRestaurantList(member);

      const result: AuthResult = {
        success: true,
        token,
        user: {
          id: member.id,
          email: member.email!,
          firstName: member.firstName,
          lastName: member.lastName,
          role: member.role,
          restaurantGroupId: member.restaurantGroupId,
          mfaEnabled: member.mfaEnabled,
        },
        restaurants,
      };

      // Signal MFA enrollment requirement for privileged roles within grace period
      if (member.mfaGraceDeadline && !member.mfaEnabled) {
        result.mfaEnrollmentRequired = true;
        result.mfaGraceDeadline = member.mfaGraceDeadline.toISOString();
      }

      return result;
    } catch (error) {
      logger.error('[Auth] Login error:', { error });
      return { success: false, error: 'Login failed' };
    }
  }

  // ============ PIN Authentication (for staff) ============

  async verifyStaffPin(restaurantId: string, pin: string): Promise<PinAuthResult> {
    try {
      // Get all active PINs for this restaurant
      const staffPins = await prisma.staffPin.findMany({
        where: { restaurantId, isActive: true }
      });

      // Check each PIN (we can't query by hash directly).
      // Compare ALL PINs even after finding a match to avoid timing side-channels.
      let matchedPin: typeof staffPins[0] | null = null;
      for (const staffPin of staffPins) {
        const isValid = await this.verifyPin(pin, staffPin.pin);
        if (isValid && !matchedPin) {
          matchedPin = staffPin;
        }
      }

      if (matchedPin) {
        await auditLog('pin_verify', { metadata: { restaurantId } });
        return {
          success: true,
          staffPin: {
            id: matchedPin.id,
            name: matchedPin.name,
            role: matchedPin.role,
            restaurantId: matchedPin.restaurantId,
          },
        };
      }

      await auditLog('pin_failed', { metadata: { restaurantId } });
      return { success: false, error: 'Invalid PIN' };
    } catch (error) {
      logger.error('[Auth] PIN verification error:', { error });
      return { success: false, error: 'PIN verification failed' };
    }
  }

  // ============ Session Management ============

  async logout(sessionId: string): Promise<ServiceResult> {
    try {
      const session = await prisma.userSession.findUnique({ where: { id: sessionId }, select: { userId: true } });
      await prisma.userSession.update({
        where: { id: sessionId },
        data: { isActive: false }
      });
      if (session) {
        await auditLog('logout', { userId: session.userId, metadata: { sessionId } });
      }
      return { success: true };
    } catch (error) {
      logger.error('[Auth] Logout error:', { error });
      return { success: false, error: 'Failed to logout session' };
    }
  }

  async logoutAllSessions(teamMemberId: string): Promise<ServiceResult> {
    try {
      await prisma.userSession.updateMany({
        where: { userId: teamMemberId }, // userId is the Prisma field name on UserSession (mapped to user_id column)
        data: { isActive: false }
      });
      await auditLog('all_sessions_revoked', { userId: teamMemberId });
      return { success: true };
    } catch (error) {
      logger.error('[Auth] Logout all error:', { error });
      return { success: false, error: 'Failed to logout all sessions' };
    }
  }

  async validateSession(sessionId: string): Promise<boolean> {
    try {
      const session = await prisma.userSession.findUnique({
        where: { id: sessionId }
      });

      if (!session?.isActive) {
        return false;
      }

      if (new Date() > session.expiresAt) {
        // Session expired, mark as inactive
        await prisma.userSession.update({
          where: { id: sessionId },
          data: { isActive: false }
        });
        await auditLog('session_expired', { metadata: { sessionId } });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('[Auth] Session validation error:', { error });
      return false;
    }
  }

  // ============ User Management ============

  async createUser(data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    role: string;
    restaurantGroupId?: string;
    restaurantId?: string;
  }): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      // Check if email already exists
      const existing = await prisma.teamMember.findUnique({
        where: { email: data.email.toLowerCase() }
      });

      if (existing) {
        return { success: false, error: 'Email already registered' };
      }

      if (data.password) {
        const strengthCheck = this.validatePasswordStrength(data.password);
        if (!strengthCheck.valid) {
          return { success: false, error: strengthCheck.error };
        }
      }

      const passwordHash = await this.hashPassword(data.password);

      const member = await prisma.teamMember.create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          displayName: [data.firstName, data.lastName].filter(Boolean).join(' ') || data.email,
          role: data.role,
          restaurantGroupId: data.restaurantGroupId,
          restaurantId: data.restaurantId ?? null,
          passwordChangedAt: new Date(),
        }
      });

      await auditLog('signup', { userId: member.id, metadata: { email: member.email, role: member.role } });

      return {
        success: true,
        user: {
          id: member.id,
          email: member.email,
          firstName: member.firstName,
          lastName: member.lastName,
          role: member.role,
          mfaEnabled: false,
        }
      };
    } catch (error) {
      logger.error('[Auth] Create user error:', { error });
      return { success: false, error: 'Failed to create user' };
    }
  }

  // ============ Staff PIN Management ============

  async createStaffPin(restaurantId: string, name: string, pin: string, role: string = 'staff'): Promise<{ success: boolean; staffPin?: any; error?: string }> {
    try {
      // Validate PIN format (4-6 digits)
      if (!/^\d{4,6}$/.test(pin)) {
        return { success: false, error: 'PIN must be 4-6 digits' };
      }

      // Check if PIN already exists for this restaurant
      const existingPins = await prisma.staffPin.findMany({
        where: { restaurantId, isActive: true }
      });

      for (const existing of existingPins) {
        const isDuplicate = await this.verifyPin(pin, existing.pin);
        if (isDuplicate) {
          return { success: false, error: 'PIN already in use' };
        }
      }

      const hashedPin = await this.hashPin(pin);

      const staffPin = await prisma.staffPin.create({
        data: {
          restaurantId,
          name,
          pin: hashedPin,
          role
        }
      });

      return {
        success: true,
        staffPin: {
          id: staffPin.id,
          name: staffPin.name,
          role: staffPin.role
        }
      };
    } catch (error) {
      logger.error('[Auth] Create staff PIN error:', { error });
      return { success: false, error: 'Failed to create staff PIN' };
    }
  }

  async deleteStaffPin(pinId: string): Promise<ServiceResult> {
    try {
      await prisma.staffPin.update({
        where: { id: pinId },
        data: { isActive: false }
      });
      return { success: true };
    } catch (error) {
      logger.error('[Auth] Delete staff PIN error:', { error });
      return { success: false, error: 'Failed to delete staff PIN' };
    }
  }

  // ============ User Management — List & Update ============

  async listUsers(restaurantGroupId?: string): Promise<Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    isActive: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    restaurants: Array<{ id: string; name: string; slug: string; role: string }>;
  }>> {
    const where: any = { passwordHash: { not: null } };
    if (restaurantGroupId) {
      where.restaurantGroupId = restaurantGroupId;
    }

    const members = await prisma.teamMember.findMany({
      where,
      include: {
        restaurantAccess: {
          include: {
            restaurant: {
              select: { id: true, name: true, slug: true }
            }
          }
        }
      },
      orderBy: { email: 'asc' }
    });

    return members.map(m => ({
      id: m.id,
      email: m.email!,
      firstName: m.firstName,
      lastName: m.lastName,
      role: m.role,
      isActive: m.isActive,
      lastLoginAt: m.lastLoginAt,
      createdAt: m.createdAt,
      restaurants: m.restaurantAccess.map(a => ({
        id: a.restaurant.id,
        name: a.restaurant.name,
        slug: a.restaurant.slug,
        role: a.role
      }))
    }));
  }

  async updateUser(teamMemberId: string, data: {
    firstName?: string;
    lastName?: string;
    role?: string;
    isActive?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      await prisma.teamMember.update({
        where: { id: teamMemberId },
        data
      });

      // If deactivated, invalidate all sessions, revoke trust, and audit
      if (data.isActive === false) {
        await this.logoutAllSessions(teamMemberId);
        await this.revokeAllTrust(teamMemberId);
        await auditLog('account_deactivated', { metadata: { targetUserId: teamMemberId } });
      }

      return { success: true };
    } catch (error: unknown) {
      logger.error('[Auth] Update user error:', { error });
      return { success: false, error: 'Failed to update user' };
    }
  }

  async changePassword(teamMemberId: string, oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const member = await prisma.teamMember.findUnique({ where: { id: teamMemberId } });
      if (!member?.passwordHash) {
        return { success: false, error: 'User not found' };
      }

      const isValid = await this.verifyPassword(oldPassword, member.passwordHash);
      if (!isValid) {
        return { success: false, error: 'Current password is incorrect' };
      }

      const strengthCheck = this.validatePasswordStrength(newPassword);
      if (!strengthCheck.valid) {
        return { success: false, error: strengthCheck.error };
      }

      const notReused = await this.checkPasswordHistory(teamMemberId, newPassword);
      if (!notReused) {
        return { success: false, error: 'Cannot reuse any of your last 12 passwords' };
      }

      const passwordHash = await this.hashPassword(newPassword);
      await prisma.teamMember.update({
        where: { id: teamMemberId },
        data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false }
      });

      await this.recordPasswordHistory(teamMemberId, passwordHash);
      await this.revokeAllTrust(teamMemberId);
      await auditLog('password_change', { userId: teamMemberId, metadata: { method: 'change_password' } });

      return { success: true };
    } catch (error: unknown) {
      logger.error('[Auth] Change password error:', { error });
      return { success: false, error: 'Failed to change password' };
    }
  }

  async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const member = await prisma.teamMember.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, email: true, firstName: true, isActive: true },
      });

      if (member?.email && member.isActive) {
        // Delete any existing unused tokens for this user
        await prisma.passwordResetToken.deleteMany({
          where: { teamMemberId: member.id, usedAt: null },
        });

        const rawToken = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await prisma.passwordResetToken.create({
          data: { teamMemberId: member.id, token: tokenHash, expiresAt },
        });

        const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://www.getorderstack.com';
        const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`; // send raw, store hash

        await sendPasswordResetEmail(member.email, member.firstName, resetUrl);
        await auditLog('password_reset_requested', { userId: member.id, metadata: { email: member.email } });
      }

      // Always return success — anti-enumeration
      return { success: true };
    } catch (error: unknown) {
      logger.error('[Auth] Request password reset error:', { error });
      return { success: false, error: 'Failed to process request' };
    }
  }

  async resetPasswordWithToken(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const strengthCheck = this.validatePasswordStrength(newPassword);
      if (!strengthCheck.valid) {
        return { success: false, error: strengthCheck.error };
      }

      const tokenHash = createHash('sha256').update(token).digest('hex');
      const resetToken = await prisma.passwordResetToken.findUnique({
        where: { token: tokenHash },
        include: { teamMember: { select: { id: true, isActive: true } } },
      });

      if (!resetToken || resetToken.usedAt !== null) {
        return { success: false, error: 'Invalid or expired reset link. Please request a new one.' };
      }

      if (new Date() > resetToken.expiresAt) {
        return { success: false, error: 'This reset link has expired. Please request a new one.' };
      }

      if (!resetToken.teamMember.isActive) {
        return { success: false, error: 'Account is disabled' };
      }

      const notReused = await this.checkPasswordHistory(resetToken.teamMemberId, newPassword);
      if (!notReused) {
        return { success: false, error: 'Cannot reuse any of your last 12 passwords' };
      }

      const passwordHash = await this.hashPassword(newPassword);
      await prisma.$transaction([
        prisma.teamMember.update({
          where: { id: resetToken.teamMemberId },
          data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
        }),
        prisma.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { usedAt: new Date() },
        }),
      ]);

      await this.recordPasswordHistory(resetToken.teamMemberId, passwordHash);

      // Invalidate all sessions and revoke trust for security after password reset
      await this.logoutAllSessions(resetToken.teamMemberId);
      await this.revokeAllTrust(resetToken.teamMemberId);

      await auditLog('password_change', { userId: resetToken.teamMemberId, metadata: { method: 'reset_token' } });

      return { success: true };
    } catch (error: unknown) {
      logger.error('[Auth] Reset password with token error:', { error });
      return { success: false, error: 'Failed to reset password' };
    }
  }

  async updateStaffPin(pinId: string, restaurantId: string, data: {
    name?: string;
    role?: string;
    isActive?: boolean;
    newPin?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.role !== undefined) updateData.role = data.role;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;

      if (data.newPin) {
        if (!/^\d{4,6}$/.test(data.newPin)) {
          return { success: false, error: 'PIN must be 4-6 digits' };
        }

        // Check for duplicate
        const existingPins = await prisma.staffPin.findMany({
          where: { restaurantId, isActive: true, id: { not: pinId } }
        });

        for (const existing of existingPins) {
          const isDuplicate = await this.verifyPin(data.newPin, existing.pin);
          if (isDuplicate) {
            return { success: false, error: 'PIN already in use' };
          }
        }

        updateData.pin = await this.hashPin(data.newPin);
      }

      await prisma.staffPin.update({
        where: { id: pinId },
        data: updateData
      });

      return { success: true };
    } catch (error: unknown) {
      logger.error('[Auth] Update staff PIN error:', { error });
      return { success: false, error: 'Failed to update staff PIN' };
    }
  }

  // ============ Restaurant List Builder ============

  async buildRestaurantList(member: {
    role: string;
    restaurantGroupId: string | null;
    restaurantId?: string | null;
    restaurantAccess: Array<{
      role: string;
      restaurant: {
        id: string;
        name: string;
        slug: string;
        merchantProfile: unknown;
        trialEndsAt: Date | null;
        trialExpiredAt: Date | null;
        subscription: { status: string } | null;
      };
    }>;
  }): Promise<RestaurantListItem[]> {
    if (member.role === 'super_admin') {
      const allRestaurants = await prisma.restaurant.findMany({
        where: { active: true },
        select: RESTAURANT_SELECT,
      });
      return allRestaurants.map(r => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        role: 'super_admin',
        onboardingComplete: extractOnboardingComplete(r.merchantProfile),
        subscriptionStatus: deriveSubscriptionStatus(r),
        trialEndsAt: r.trialEndsAt?.toISOString() ?? null,
      }));
    }

    if (member.restaurantAccess.length > 0) {
      return member.restaurantAccess.map(access => ({
        id: access.restaurant.id,
        name: access.restaurant.name,
        slug: access.restaurant.slug,
        role: access.role,
        onboardingComplete: extractOnboardingComplete(access.restaurant.merchantProfile),
        subscriptionStatus: deriveSubscriptionStatus(access.restaurant),
        trialEndsAt: access.restaurant.trialEndsAt?.toISOString() ?? null,
      }));
    }

    if (member.restaurantGroupId) {
      const groupRestaurants = await prisma.restaurant.findMany({
        where: { restaurantGroupId: member.restaurantGroupId, active: true },
        select: RESTAURANT_SELECT,
      });
      return groupRestaurants.map(r => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        role: member.role,
        onboardingComplete: extractOnboardingComplete(r.merchantProfile),
        subscriptionStatus: deriveSubscriptionStatus(r),
        trialEndsAt: r.trialEndsAt?.toISOString() ?? null,
      }));
    }

    if (member.restaurantId) {
      const directRestaurant = await prisma.restaurant.findUnique({
        where: { id: member.restaurantId },
        select: { ...RESTAURANT_SELECT, active: true },
      });
      if (directRestaurant?.active) {
        return [{
          id: directRestaurant.id,
          name: directRestaurant.name,
          slug: directRestaurant.slug,
          role: member.role,
          onboardingComplete: extractOnboardingComplete(directRestaurant.merchantProfile),
          subscriptionStatus: deriveSubscriptionStatus(directRestaurant),
          trialEndsAt: directRestaurant.trialEndsAt?.toISOString() ?? null,
        }];
      }
    }

    return [];
  }

  // ============ MFA Trusted Devices ============

  computeUaFingerprint(userAgent?: string, deviceInfoHeader?: string): string | null {
    // Native app path — X-Device-Info header: "OrderStack-POS|iOS|iPad Pro"
    if (deviceInfoHeader && deviceInfoHeader.startsWith('OrderStack') && deviceInfoHeader.split('|').length === 3) {
      return createHash('sha256').update(deviceInfoHeader).digest('hex');
    }

    // Browser path — parse User-Agent with ua-parser-js
    if (!userAgent) return null;
    const parser = new UAParser(userAgent);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    if (!browser.name || !os.name) return null;
    const deviceType = parser.getDevice().type ?? 'desktop';
    const raw = `${browser.name}|${os.name}|${deviceType}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  buildDeviceInfoDisplay(userAgent?: string, deviceInfoHeader?: string): string | null {
    if (deviceInfoHeader && deviceInfoHeader.startsWith('OrderStack') && deviceInfoHeader.split('|').length === 3) {
      const [app, osName, model] = deviceInfoHeader.split('|');
      return `${app} on ${osName} (${model})`;
    }
    if (!userAgent) return null;
    const parser = new UAParser(userAgent);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    const deviceType = parser.getDevice().type ?? 'desktop';
    if (!browser.name || !os.name) return null;
    return `${browser.name} on ${os.name} (${deviceType})`;
  }

  async checkTrust(teamMemberId: string, fingerprint: string, ipAddress: string): Promise<boolean> {
    const trust = await prisma.mfaTrustedDevice.findFirst({
      where: { teamMemberId, uaFingerprint: fingerprint, ipAddress, expiresAt: { gt: new Date() } },
    });
    if (trust) {
      await auditLog('mfa_trust_matched', { userId: teamMemberId, ip: ipAddress, metadata: { trustedDeviceId: trust.id } });
      return true;
    }

    // Determine WHY trust was not found for audit granularity
    const fallback = await prisma.mfaTrustedDevice.findFirst({
      where: { teamMemberId, uaFingerprint: fingerprint },
    });
    if (fallback) {
      if (fallback.ipAddress !== ipAddress) {
        await auditLog('mfa_trust_ip_mismatch', { userId: teamMemberId, ip: ipAddress, metadata: { expectedIp: fallback.ipAddress } });
      } else if (fallback.expiresAt <= new Date()) {
        await auditLog('mfa_trust_expired', { userId: teamMemberId, ip: ipAddress });
      }
    }

    return false;
  }

  async createTrust(teamMemberId: string, userAgent?: string, deviceInfoHeader?: string, ipAddress?: string): Promise<void> {
    const fingerprint = this.computeUaFingerprint(userAgent, deviceInfoHeader);
    if (!fingerprint || !ipAddress) return;

    const deviceInfo = this.buildDeviceInfoDisplay(userAgent, deviceInfoHeader);
    const expiresAt = new Date(Date.now() + TRUST_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    await prisma.mfaTrustedDevice.upsert({
      where: {
        teamMemberId_uaFingerprint_ipAddress: { teamMemberId, uaFingerprint: fingerprint, ipAddress },
      },
      create: { teamMemberId, uaFingerprint: fingerprint, ipAddress, deviceInfo, expiresAt },
      update: { trustedAt: new Date(), expiresAt, deviceInfo },
    });

    // Enforce cap
    const all = await prisma.mfaTrustedDevice.findMany({
      where: { teamMemberId },
      orderBy: { trustedAt: 'desc' },
    });
    if (all.length > MAX_TRUSTED_DEVICES) {
      const toDelete = all.slice(MAX_TRUSTED_DEVICES);
      await prisma.mfaTrustedDevice.deleteMany({
        where: { id: { in: toDelete.map(d => d.id) } },
      });
      await auditLog('mfa_trust_limit_reached', { userId: teamMemberId, metadata: { deleted: toDelete.length } });
    }

    await auditLog('mfa_trust_created', { userId: teamMemberId, ip: ipAddress, metadata: { deviceInfo } });
  }

  async revokeAllTrust(teamMemberId: string): Promise<void> {
    const { count } = await prisma.mfaTrustedDevice.deleteMany({ where: { teamMemberId } });
    if (count > 0) {
      await auditLog('mfa_trust_all_revoked', { userId: teamMemberId, metadata: { deleted: count } });
    }
  }

  // ============ Helpers ============

  private generateSessionToken(): string {
    return randomBytes(32).toString('hex'); // 64 hex chars, cryptographically secure
  }

  // Check if team member has access to a specific restaurant
  async checkRestaurantAccess(teamMemberId: string, restaurantId: string): Promise<{ hasAccess: boolean; role?: string }> {
    try {
      const member = await prisma.teamMember.findUnique({
        where: { id: teamMemberId },
        include: {
          restaurantAccess: {
            where: { restaurantId }
          }
        }
      });

      if (!member) {
        return { hasAccess: false };
      }

      // Super admin has access to everything
      if (member.role === 'super_admin') {
        return { hasAccess: true, role: 'super_admin' };
      }

      // Check specific restaurant access
      if (member.restaurantAccess.length > 0) {
        return { hasAccess: true, role: member.restaurantAccess[0].role };
      }

      // Check if restaurant belongs to member's group
      if (member.restaurantGroupId) {
        const restaurant = await prisma.restaurant.findFirst({
          where: { id: restaurantId, restaurantGroupId: member.restaurantGroupId }
        });
        if (restaurant) {
          return { hasAccess: true, role: member.role };
        }
      }

      // Check if the team member's own restaurant matches
      if (member.restaurantId === restaurantId) {
        return { hasAccess: true, role: member.role };
      }

      return { hasAccess: false };
    } catch (error) {
      logger.error('[Auth] Check access error:', { error });
      // Re-throw to let caller handle - don't silently deny access on DB errors
      throw new Error('Unable to verify restaurant access');
    }
  }

  // ============ POS Login (PIN + Permissions) ============

  async posLogin(restaurantId: string, passcode: string, staffPinId?: string): Promise<{
    token: string;
    staffPinId: string;
    teamMemberId: string | null;
    teamMemberName: string;
    role: string;
    permissions: Record<string, boolean>;
    clockedIn: boolean;
    activeTimecardId: string | null;
  } | null> {
    try {
      // Find the specific staff PIN
      const staffPin = await prisma.staffPin.findFirst({
        where: { id: staffPinId, restaurantId, isActive: true },
        include: {
          teamMember: {
            include: {
              permissionSet: true,
            },
          },
        },
      });

      if (!staffPin) {
        logger.info('[posLogin] Staff PIN not found', { staffPinId, restaurantId });
        return null;
      }

      const isValid = await this.verifyPin(passcode, staffPin.pin);
      logger.info(`[posLogin] Validating PIN for ${staffPin.name}: ${isValid}`);

      if (!isValid) return null;

      const matchedPin = staffPin;

      // Resolve permissions from TeamMember's PermissionSet
      const teamMember = matchedPin.teamMember;
      const permissions: Record<string, boolean> = teamMember?.permissionSet
        ? (teamMember.permissionSet.permissions as Record<string, boolean>)
        : {};

      // Check for active time entry
      const activeTimeEntry = await prisma.timeEntry.findFirst({
        where: {
          staffPinId: matchedPin.id,
          clockOut: null,
        },
        orderBy: { clockIn: 'desc' },
      });

      // Generate a POS session token (short-lived, pin type)
      const sessionToken = this.generateSessionToken();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 16); // POS sessions: 16 hours

      const session = await prisma.userSession.create({
        data: {
          userId: matchedPin.teamMember?.id ?? matchedPin.id, // Use TeamMember ID if linked, staffPin ID as fallback
          token: sessionToken,
          deviceInfo: 'POS Terminal',
          expiresAt,
        },
      });

      const token = this.generateToken(
        {
          teamMemberId: matchedPin.teamMember?.id ?? matchedPin.id,
          email: matchedPin.name, // POS sessions don't have email; store name for logging
          role: matchedPin.role,
          type: 'pin',
        },
        session.id,
        '16h'
      );

      return {
        token,
        staffPinId: matchedPin.id,
        teamMemberId: teamMember?.id ?? null,
        teamMemberName: matchedPin.name,
        role: matchedPin.role,
        permissions,
        clockedIn: activeTimeEntry !== null,
        activeTimecardId: activeTimeEntry?.id ?? null,
      };
    } catch (error) {
      logger.error('[Auth] POS login error:', { error });
      return null;
    }
  }
}

export const authService = new AuthService();
