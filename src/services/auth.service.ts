import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// JWT_SECRET is required — refuse to start if not configured
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. The server cannot start without it.');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // Admin sessions: 7 days
const DEVICE_TOKEN_EXPIRES_IN = '30d'; // Device sessions: 30 days (was 365d — reduced for security)
const SALT_ROUNDS = 10;

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
    onboardingStatus: string;
  };
  restaurants?: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
  }>;
  error?: string;
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
        console.debug('[Auth] Token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        console.debug('[Auth] Invalid token:', error.message);
      } else {
        console.error('[Auth] Unexpected token verification error:', error);
      }
      return null;
    }
  }

  // ============ User Authentication (Email/Password) ============

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
                select: { id: true, name: true, slug: true }
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

      // Verify password
      const isValid = await this.verifyPassword(password, member.passwordHash);
      if (!isValid) {
        return { success: false, error: 'Invalid email or password' };
      }

      // Check temp password expiry
      if (member.tempPasswordExpiresAt && new Date() > member.tempPasswordExpiresAt) {
        return { success: false, error: 'Temporary password expired. Ask your manager to reset it.' };
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

      // Get accessible restaurants
      let restaurants: Array<{ id: string; name: string; slug: string; role: string }> = [];

      if (member.role === 'super_admin') {
        // Super admin can access all restaurants
        const allRestaurants = await prisma.restaurant.findMany({
          where: { active: true },
          select: { id: true, name: true, slug: true }
        });
        restaurants = allRestaurants.map(r => ({ ...r, role: 'super_admin' }));
      } else if (member.restaurantAccess.length > 0) {
        // Member has specific restaurant access
        restaurants = member.restaurantAccess.map(access => ({
          id: access.restaurant.id,
          name: access.restaurant.name,
          slug: access.restaurant.slug,
          role: access.role
        }));
      } else if (member.restaurantGroupId) {
        // Member belongs to a group - can access all restaurants in group
        const groupRestaurants = await prisma.restaurant.findMany({
          where: { restaurantGroupId: member.restaurantGroupId, active: true },
          select: { id: true, name: true, slug: true }
        });
        restaurants = groupRestaurants.map(r => ({ ...r, role: member.role }));
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
          onboardingStatus: member.onboardingStatus,
        },
        restaurants
      };
    } catch (error) {
      console.error('[Auth] Login error:', error);
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

      // Check each PIN (we can't query by hash directly)
      for (const staffPin of staffPins) {
        const isValid = await this.verifyPin(pin, staffPin.pin);
        if (isValid) {
          return {
            success: true,
            staffPin: {
              id: staffPin.id,
              name: staffPin.name,
              role: staffPin.role,
              restaurantId: staffPin.restaurantId
            }
          };
        }
      }

      return { success: false, error: 'Invalid PIN' };
    } catch (error) {
      console.error('[Auth] PIN verification error:', error);
      return { success: false, error: 'PIN verification failed' };
    }
  }

  // ============ Session Management ============

  async logout(sessionId: string): Promise<ServiceResult> {
    try {
      await prisma.userSession.update({
        where: { id: sessionId },
        data: { isActive: false }
      });
      return { success: true };
    } catch (error) {
      console.error('[Auth] Logout error:', error);
      return { success: false, error: 'Failed to logout session' };
    }
  }

  async logoutAllSessions(teamMemberId: string): Promise<ServiceResult> {
    try {
      await prisma.userSession.updateMany({
        where: { userId: teamMemberId }, // userId is the Prisma field name on UserSession (mapped to user_id column)
        data: { isActive: false }
      });
      return { success: true };
    } catch (error) {
      console.error('[Auth] Logout all error:', error);
      return { success: false, error: 'Failed to logout all sessions' };
    }
  }

  async validateSession(sessionId: string): Promise<boolean> {
    try {
      const session = await prisma.userSession.findUnique({
        where: { id: sessionId }
      });

      if (!session || !session.isActive) {
        return false;
      }

      if (new Date() > session.expiresAt) {
        // Session expired, mark as inactive
        await prisma.userSession.update({
          where: { id: sessionId },
          data: { isActive: false }
        });
        return false;
      }

      return true;
    } catch (error) {
      console.error('[Auth] Session validation error:', error);
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
        }
      });

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
      console.error('[Auth] Create user error:', error);
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
      console.error('[Auth] Create staff PIN error:', error);
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
      console.error('[Auth] Delete staff PIN error:', error);
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

      // If deactivated, invalidate all sessions
      if (data.isActive === false) {
        await this.logoutAllSessions(teamMemberId);
      }

      return { success: true };
    } catch (error: unknown) {
      console.error('[Auth] Update user error:', error);
      return { success: false, error: 'Failed to update user' };
    }
  }

  async changePassword(teamMemberId: string, oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const member = await prisma.teamMember.findUnique({ where: { id: teamMemberId } });
      if (!member || !member.passwordHash) {
        return { success: false, error: 'User not found' };
      }

      const isValid = await this.verifyPassword(oldPassword, member.passwordHash);
      if (!isValid) {
        return { success: false, error: 'Current password is incorrect' };
      }

      if (newPassword.length < 6) {
        return { success: false, error: 'New password must be at least 6 characters' };
      }

      const passwordHash = await this.hashPassword(newPassword);
      await prisma.teamMember.update({
        where: { id: teamMemberId },
        data: { passwordHash }
      });

      return { success: true };
    } catch (error: unknown) {
      console.error('[Auth] Change password error:', error);
      return { success: false, error: 'Failed to change password' };
    }
  }

  async resetPasswordByEmail(email: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (newPassword.length < 6) {
        return { success: false, error: 'New password must be at least 6 characters' };
      }

      const member = await prisma.teamMember.findUnique({ where: { email: email.toLowerCase() } });
      if (!member) {
        return { success: false, error: 'No account found with that email address' };
      }

      const passwordHash = await this.hashPassword(newPassword);
      await prisma.teamMember.update({
        where: { id: member.id },
        data: { passwordHash }
      });

      return { success: true };
    } catch (error: unknown) {
      console.error('[Auth] Reset password by email error:', error);
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
      console.error('[Auth] Update staff PIN error:', error);
      return { success: false, error: 'Failed to update staff PIN' };
    }
  }

  // ============ Helpers ============

  private generateSessionToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 64; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
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
      console.error('[Auth] Check access error:', error);
      // Re-throw to let caller handle - don't silently deny access on DB errors
      throw new Error('Unable to verify restaurant access');
    }
  }

  // ============ POS Login (PIN + Permissions) ============

  async posLogin(restaurantId: string, passcode: string): Promise<{
    token: string;
    teamMemberId: string | null;
    teamMemberName: string;
    role: string;
    permissions: Record<string, boolean>;
    clockedIn: boolean;
    activeTimecardId: string | null;
  } | null> {
    try {
      // Find matching PIN
      const staffPins = await prisma.staffPin.findMany({
        where: { restaurantId, isActive: true },
        include: {
          teamMember: {
            include: {
              permissionSet: true,
            },
          },
        },
      });

      console.log(`[posLogin] Found ${staffPins.length} active pins for restaurant ${restaurantId}`);

      let matchedPin: typeof staffPins[number] | null = null;
      for (const pin of staffPins) {
        const isValid = await this.verifyPin(passcode, pin.pin);
        console.log(`[posLogin] Comparing against ${pin.name}: ${isValid}`);
        if (isValid) {
          matchedPin = pin;
          break;
        }
      }

      if (!matchedPin) return null;

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
        teamMemberId: teamMember?.id ?? null,
        teamMemberName: matchedPin.name,
        role: matchedPin.role,
        permissions,
        clockedIn: activeTimeEntry !== null,
        activeTimecardId: activeTimeEntry?.id ?? null,
      };
    } catch (error) {
      console.error('[Auth] POS login error:', error);
      return null;
    }
  }
}

export const authService = new AuthService();
