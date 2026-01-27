import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Environment variables (should be set in production)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // Admin sessions: 7 days
const DEVICE_TOKEN_EXPIRES_IN = '365d'; // Device sessions: 1 year (persistent)
const SALT_ROUNDS = 10;

export interface TokenPayload {
  userId: string;
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
      return null;
    }
  }

  // ============ User Authentication (Email/Password) ============

  async loginUser(email: string, password: string, deviceInfo?: string, ipAddress?: string): Promise<AuthResult> {
    try {
      // Find user by email
      const user = await prisma.user.findUnique({
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

      if (!user) {
        return { success: false, error: 'Invalid email or password' };
      }

      if (!user.isActive) {
        return { success: false, error: 'Account is disabled' };
      }

      // Verify password
      const isValid = await this.verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return { success: false, error: 'Invalid email or password' };
      }

      // Create session
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

      const session = await prisma.userSession.create({
        data: {
          userId: user.id,
          token: this.generateSessionToken(),
          deviceInfo,
          ipAddress,
          expiresAt
        }
      });

      // Generate JWT
      const token = this.generateToken(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
          restaurantGroupId: user.restaurantGroupId || undefined,
          type: 'user'
        },
        session.id
      );

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

      // Get accessible restaurants
      let restaurants: Array<{ id: string; name: string; slug: string; role: string }> = [];

      if (user.role === 'super_admin') {
        // Super admin can access all restaurants
        const allRestaurants = await prisma.restaurant.findMany({
          where: { active: true },
          select: { id: true, name: true, slug: true }
        });
        restaurants = allRestaurants.map(r => ({ ...r, role: 'super_admin' }));
      } else if (user.restaurantAccess.length > 0) {
        // User has specific restaurant access
        restaurants = user.restaurantAccess.map(access => ({
          id: access.restaurant.id,
          name: access.restaurant.name,
          slug: access.restaurant.slug,
          role: access.role
        }));
      } else if (user.restaurantGroupId) {
        // User belongs to a group - can access all restaurants in group
        const groupRestaurants = await prisma.restaurant.findMany({
          where: { restaurantGroupId: user.restaurantGroupId, active: true },
          select: { id: true, name: true, slug: true }
        });
        restaurants = groupRestaurants.map(r => ({ ...r, role: user.role }));
      }

      return {
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          restaurantGroupId: user.restaurantGroupId
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

  async logout(sessionId: string): Promise<boolean> {
    try {
      await prisma.userSession.update({
        where: { id: sessionId },
        data: { isActive: false }
      });
      return true;
    } catch (error) {
      console.error('[Auth] Logout error:', error);
      return false;
    }
  }

  async logoutAllSessions(userId: string): Promise<boolean> {
    try {
      await prisma.userSession.updateMany({
        where: { userId },
        data: { isActive: false }
      });
      return true;
    } catch (error) {
      console.error('[Auth] Logout all error:', error);
      return false;
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
  }): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      // Check if email already exists
      const existing = await prisma.user.findUnique({
        where: { email: data.email.toLowerCase() }
      });

      if (existing) {
        return { success: false, error: 'Email already registered' };
      }

      const passwordHash = await this.hashPassword(data.password);

      const user = await prisma.user.create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role,
          restaurantGroupId: data.restaurantGroupId
        }
      });

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
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

  async deleteStaffPin(pinId: string): Promise<boolean> {
    try {
      await prisma.staffPin.update({
        where: { id: pinId },
        data: { isActive: false }
      });
      return true;
    } catch (error) {
      console.error('[Auth] Delete staff PIN error:', error);
      return false;
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

  // Check if user has access to a specific restaurant
  async checkRestaurantAccess(userId: string, restaurantId: string): Promise<{ hasAccess: boolean; role?: string }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          restaurantAccess: {
            where: { restaurantId }
          }
        }
      });

      if (!user) {
        return { hasAccess: false };
      }

      // Super admin has access to everything
      if (user.role === 'super_admin') {
        return { hasAccess: true, role: 'super_admin' };
      }

      // Check specific restaurant access
      if (user.restaurantAccess.length > 0) {
        return { hasAccess: true, role: user.restaurantAccess[0].role };
      }

      // Check if restaurant belongs to user's group
      if (user.restaurantGroupId) {
        const restaurant = await prisma.restaurant.findFirst({
          where: { id: restaurantId, restaurantGroupId: user.restaurantGroupId }
        });
        if (restaurant) {
          return { hasAccess: true, role: user.role };
        }
      }

      return { hasAccess: false };
    } catch (error) {
      console.error('[Auth] Check access error:', error);
      return { hasAccess: false };
    }
  }
}

export const authService = new AuthService();
