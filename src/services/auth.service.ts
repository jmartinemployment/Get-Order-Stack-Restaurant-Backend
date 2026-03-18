import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { sendPasswordResetEmail } from './email.service';
import { logger } from '../utils/logger';
import { auditLog } from '../utils/audit';

const prisma = new PrismaClient();

// JWT_SECRET is required — refuse to start if not configured
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. The server cannot start without it.');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h'; // Admin sessions: 8 hours
const DEVICE_TOKEN_EXPIRES_IN = '24h'; // Device sessions: 24 hours
const SALT_ROUNDS = 12;

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

  async loginUser(email: string, password: string, deviceInfo?: string, ipAddress?: string): Promise<AuthResult> {
    try {
      // Find team member by email (only those with passwordHash can do email/password login)
      const member = await prisma.teamMember.findUnique({
        where: { email: email.toLowerCase() },
        include: {
          restaurantGroup: true,
          restaurantAccess: {
            include: {
              restaurant: {
                select: { id: true, name: true, slug: true, merchantProfile: true }
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
        return { success: false, error: 'Account locked due to too many failed attempts. Try again in 15 minutes.' };
      }

      // Verify password
      const isValid = await this.verifyPassword(password, member.passwordHash);
      if (!isValid) {
        await auditLog('login_failed', { metadata: { email: email.toLowerCase(), reason: 'invalid_password' } });
        return { success: false, error: 'Invalid email or password' };
      }

      // Check password validity (expiry, forced change, 90-day policy)
      const validityError = this.checkPasswordValidity(member);
      if (validityError) return validityError;

      // MFA check — if enabled, return partial auth (PCI DSS 8.4.2)
      if (member.mfaEnabled) {
        // Create a short-lived MFA session (5 min) — not a full session
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
          },
          mfaRequired: true,
        };
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
      let restaurants: Array<{ id: string; name: string; slug: string; role: string; onboardingComplete: boolean }> = [];

      if (member.role === 'super_admin') {
        // Super admin can access all restaurants
        const allRestaurants = await prisma.restaurant.findMany({
          where: { active: true },
          select: { id: true, name: true, slug: true, merchantProfile: true }
        });
        restaurants = allRestaurants.map(r => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          role: 'super_admin',
          onboardingComplete: this.extractOnboardingComplete(r.merchantProfile),
        }));
      } else if (member.restaurantAccess.length > 0) {
        // Member has specific restaurant access
        restaurants = member.restaurantAccess.map(access => ({
          id: access.restaurant.id,
          name: access.restaurant.name,
          slug: access.restaurant.slug,
          role: access.role,
          onboardingComplete: this.extractOnboardingComplete(access.restaurant.merchantProfile),
        }));
      } else if (member.restaurantGroupId) {
        // Member belongs to a group - can access all restaurants in group
        const groupRestaurants = await prisma.restaurant.findMany({
          where: { restaurantGroupId: member.restaurantGroupId, active: true },
          select: { id: true, name: true, slug: true, merchantProfile: true }
        });
        restaurants = groupRestaurants.map(r => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          role: member.role,
          onboardingComplete: this.extractOnboardingComplete(r.merchantProfile),
        }));
      } else if (member.restaurantId) {
        // Fallback: member has a direct restaurantId (e.g. created during onboarding
        // but UserRestaurantAccess entry is missing)
        const directRestaurant = await prisma.restaurant.findUnique({
          where: { id: member.restaurantId },
          select: { id: true, name: true, slug: true, merchantProfile: true, active: true },
        });
        if (directRestaurant?.active) {
          restaurants = [{
            id: directRestaurant.id,
            name: directRestaurant.name,
            slug: directRestaurant.slug,
            role: member.role,
            onboardingComplete: this.extractOnboardingComplete(directRestaurant.merchantProfile),
          }];
        }
      }

      return {
        success: true,
        token,
        user: {
          id: member.id,
          email: member.email!,
          firstName: member.firstName,
          lastName: member.lastName,
          role: member.role,
          restaurantGroupId: member.restaurantGroupId,
        },
        restaurants
      };
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
          role: member.role
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

      // If deactivated, invalidate all sessions and audit
      if (data.isActive === false) {
        await this.logoutAllSessions(teamMemberId);
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

      if (resetToken?.usedAt !== null) {
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

      // Invalidate all sessions for security after password reset
      await this.logoutAllSessions(resetToken.teamMemberId);

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

  // ============ Helpers ============

  private extractOnboardingComplete(merchantProfile: unknown): boolean {
    if (!merchantProfile || typeof merchantProfile !== 'object') return false;
    const profile = merchantProfile as Record<string, unknown>;
    return profile['onboardingComplete'] === true;
  }

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
