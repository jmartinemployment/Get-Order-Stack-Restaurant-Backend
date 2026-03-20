import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { authService } from '../services/auth.service';
import { requireAuth, requireAdmin, requireSuperAdmin, requireMerchantManager } from '../middleware/auth.middleware';
import { auditLog } from '../utils/audit';
import { logger } from '../utils/logger';
import { disableInactiveAccounts } from '../jobs/account-maintenance';
import { mfaService } from '../services/mfa.service';
import { trackPasswordResetRequest, trackMfaFailed } from '../services/security-alert.service';

const router = Router();
const prisma = new PrismaClient();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours — matches JWT_EXPIRES_IN

/** Set the HttpOnly auth cookie on the response. PCI DSS 3.4 / 6.5.10. */
function setAuthCookie(res: Response, token: string): void {
  res.cookie('os_auth', token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? 'none' : 'lax',
    path: '/api',
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

/** Clear the auth cookie on logout. */
function clearAuthCookie(res: Response): void {
  res.clearCookie('os_auth', {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? 'none' : 'lax',
    path: '/api',
  });
}

// Rate limit auth endpoints to prevent brute-force attacks
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 6, // 6 attempts per window — PCI DSS 8.2.6
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  keyGenerator: (req) => {
    const ip = req.ip ?? 'unknown';
    const email = (req.body?.email ?? '').toLowerCase().trim();
    return email ? `${ip}:${email}` : ip;
  },
});

// Stricter rate limit for PIN auth (4-6 digit PINs are easily brute-forced)
const pinRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // 5 attempts per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many PIN attempts. Please try again in 15 minutes.' },
  keyGenerator: (req) => req.ip ?? 'unknown',
});

// ============ User Authentication ============

// Public signup — creates owner account + restaurant + auto-login
router.post('/signup', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, password, businessName } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (!firstName || !lastName) {
      res.status(400).json({ error: 'First name and last name are required' });
      return;
    }

    if (!businessName) {
      res.status(400).json({ error: 'Business name is required' });
      return;
    }

    if (password.length < 12) {
      res.status(400).json({ error: 'Password must be at least 12 characters' });
      return;
    }
    if (!/[A-Z]/.exec(password) || !/[a-z]/.exec(password) || !/\d/.exec(password) || !/[^A-Za-z0-9]/.exec(password)) {
      res.status(400).json({ error: 'Password must contain uppercase, lowercase, number, and special character' });
      return;
    }

    // Create user + restaurant + link in one atomic transaction
    const createResult = await authService.createUser({
      email,
      password,
      firstName,
      lastName,
      role: 'owner',
    });

    if (!createResult.success) {
      await new Promise(resolve => setTimeout(resolve, 200));
      res.status(200).json({ message: 'If this email is not already registered, your account has been created.' });
      return;
    }

    const slug = businessName.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '');
    const teamMemberId = createResult.user!.id;

    const restaurant = await prisma.$transaction(async (tx) => {
      const r = await tx.restaurant.create({
        data: {
          name: businessName,
          slug: `${slug}-${Date.now()}`,
          email,
          address: '',
          city: '',
          state: '',
          zip: '',
          merchantProfile: { onboardingComplete: false },
        },
      });

      await tx.userRestaurantAccess.create({
        data: {
          teamMemberId,
          restaurantId: r.id,
          role: 'owner',
        },
      });

      await tx.teamMember.update({
        where: { id: teamMemberId },
        data: { restaurantId: r.id },
      });

      return r;
    });

    await auditLog('signup_with_restaurant', {
      userId: teamMemberId,
      metadata: { email, restaurantId: restaurant.id, businessName },
    });

    // Auto-login after signup
    const deviceInfo = req.headers['user-agent'] || undefined;
    const ipAddress = req.ip || req.socket.remoteAddress || undefined;
    const loginResult = await authService.loginUser(email, password, deviceInfo, ipAddress);

    if (!loginResult.success) {
      res.status(201).json({
        user: createResult.user,
        restaurants: [{ id: restaurant.id, name: restaurant.name, slug: restaurant.slug, role: 'owner', onboardingComplete: false }],
      });
      return;
    }

    setAuthCookie(res, loginResult.token!);
    res.status(201).json({
      user: loginResult.user,
      restaurants: loginResult.restaurants,
    });
  } catch (error) {
    logger.error('Signup error:', { error });
    res.status(500).json({ error: 'Signup failed' });
  }
});

// Login with email/password
router.post('/login', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const deviceInfo = req.headers['user-agent'] || undefined;
    const ipAddress = req.ip || req.socket.remoteAddress || undefined;

    const result = await authService.loginUser(email, password, deviceInfo, ipAddress);

    if (!result.success) {
      res.status(401).json({ error: result.error, requiresPasswordChange: result.requiresPasswordChange });
      return;
    }

    // Check if MFA is required before issuing full session
    if (result.user && result.mfaRequired) {
      // Send email OTP for the login challenge
      const mfaMember = await prisma.teamMember.findUnique({
        where: { id: result.user.id },
        select: { email: true, firstName: true },
      });
      if (mfaMember?.email) {
        await mfaService.sendOtp(result.user.id, mfaMember.email, mfaMember.firstName);
      }
      res.json({
        mfaRequired: true,
        mfaToken: result.token, // short-lived token for MFA verification only
        maskedEmail: mfaMember?.email ? mfaService.maskEmail(mfaMember.email) : undefined,
        user: { id: result.user.id },
      });
      return;
    }

    setAuthCookie(res, result.token!);
    res.json({
      user: result.user,
      restaurants: result.restaurants,
      ...(result.mfaEnrollmentRequired ? {
        mfaEnrollmentRequired: true,
        mfaGraceDeadline: result.mfaGraceDeadline,
      } : {}),
    });
  } catch (error) {
    logger.error('Login error:', { error });
    res.status(500).json({ error: 'Login failed' });
  }
});

// Request password reset — sends email with token link
router.post('/forgot-password', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    // Always returns success — anti-enumeration (never reveal if email exists)
    await authService.requestPasswordReset(email);
    trackPasswordResetRequest(req.ip ?? 'unknown', email);
    res.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' });
  } catch (error) {
    logger.error('Forgot password error:', { error });
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Reset password using a token from the email link
router.post('/reset-password', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      res.status(400).json({ error: 'Token and new password are required' });
      return;
    }

    const result = await authService.resetPasswordWithToken(token, newPassword);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Password reset successfully. Please sign in.' });
  } catch (error) {
    logger.error('Reset password error:', { error });
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Logout (invalidate session)
router.post('/logout', async (req: Request, res: Response) => {
  try {
    // Read token from cookie first (PCI DSS), fall back to Authorization header
    const cookieToken = req.cookies?.os_auth as string | undefined;
    const authHeader = req.headers.authorization;
    const token = cookieToken ?? (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined);

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const payload = authService.verifyToken(token);

    if (!payload) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const result = await authService.logout(payload.sessionId);
    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }
    clearAuthCookie(res);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error:', { error });
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Validate token and get current user
router.get('/me', async (req: Request, res: Response) => {
  try {
    // Read token from cookie first (PCI DSS), fall back to Authorization header
    const cookieToken = req.cookies?.os_auth as string | undefined;
    const authHeader = req.headers.authorization;
    const token = cookieToken ?? (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined);

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const payload = authService.verifyToken(token);

    if (!payload) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    // Validate session is still active
    const isValid = await authService.validateSession(payload.sessionId);
    if (!isValid) {
      res.status(401).json({ error: 'Session expired' });
      return;
    }

    // Get full team member info
    const member = await prisma.teamMember.findUnique({
      where: { id: payload.teamMemberId },
      include: {
        restaurantAccess: {
          include: {
            restaurant: {
              select: { id: true, name: true, slug: true, merchantProfile: true }
            }
          }
        }
      }
    });

    if (!member?.isActive) {
      res.status(401).json({ error: 'User not found or disabled' });
      return;
    }

    // Get accessible restaurants
    let restaurants: Array<{ id: string; name: string; slug: string; role: string; onboardingComplete: boolean }> = [];

    const extractOnboardingComplete = (merchantProfile: unknown): boolean => {
      if (!merchantProfile || typeof merchantProfile !== 'object') return false;
      return (merchantProfile as Record<string, unknown>)['onboardingComplete'] === true;
    };

    if (member.role === 'super_admin') {
      const allRestaurants = await prisma.restaurant.findMany({
        where: { active: true },
        select: { id: true, name: true, slug: true, merchantProfile: true }
      });
      restaurants = allRestaurants.map(r => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        role: 'super_admin',
        onboardingComplete: extractOnboardingComplete(r.merchantProfile),
      }));
    } else if (member.restaurantAccess.length > 0) {
      restaurants = member.restaurantAccess.map(access => ({
        id: access.restaurant.id,
        name: access.restaurant.name,
        slug: access.restaurant.slug,
        role: access.role,
        onboardingComplete: extractOnboardingComplete(access.restaurant.merchantProfile),
      }));
    } else if (member.restaurantGroupId) {
      const groupRestaurants = await prisma.restaurant.findMany({
        where: { restaurantGroupId: member.restaurantGroupId, active: true },
        select: { id: true, name: true, slug: true, merchantProfile: true }
      });
      restaurants = groupRestaurants.map(r => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        role: member.role,
        onboardingComplete: extractOnboardingComplete(r.merchantProfile),
      }));
    }

    res.json({
      user: {
        id: member.id,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        role: member.role,
        restaurantGroupId: member.restaurantGroupId,
        mfaEnabled: member.mfaEnabled,
      },
      restaurants
    });
  } catch (error) {
    logger.error('Get current user error:', { error });
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Re-auth: verify current password (for sensitive settings access)
router.post('/verify-password', requireAuth, authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    const member = await prisma.teamMember.findUnique({
      where: { id: req.user!.teamMemberId },
      select: { passwordHash: true },
    });

    if (!member?.passwordHash) {
      res.json({ verified: false });
      return;
    }

    const verified = await authService.verifyPassword(password, member.passwordHash);
    await auditLog(verified ? 'reauth_success' : 'reauth_failed', {
      userId: req.user!.teamMemberId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ verified });
  } catch (error) {
    logger.error('Verify password error:', { error });
    res.status(500).json({ error: 'Failed to verify password' });
  }
});

// List active sessions for current user
router.get('/sessions', requireAuth, async (req: Request, res: Response) => {
  try {
    const sessions = await prisma.userSession.findMany({
      where: { userId: req.user!.teamMemberId, isActive: true },
      select: { id: true, deviceInfo: true, ipAddress: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
    await auditLog('sessions_viewed', { userId: req.user!.teamMemberId, ip: req.ip });
    res.json(sessions);
  } catch (error) {
    logger.error('List sessions error:', { error });
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// Revoke a specific session
router.delete('/sessions/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    // Verify session belongs to current user
    const session = await prisma.userSession.findFirst({
      where: { id: sessionId, userId: req.user!.teamMemberId },
    });
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    await prisma.userSession.update({ where: { id: sessionId }, data: { isActive: false } });
    await auditLog('session_revoked', { userId: req.user!.teamMemberId, ip: req.ip, metadata: { sessionId } });
    res.status(204).send();
  } catch (error) {
    logger.error('Revoke session error:', { error });
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

// ============ Staff PIN Authentication ============

// Verify staff PIN for a restaurant
router.post('/:merchantId/pin/verify', pinRateLimiter, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { pin } = req.body;

    if (!pin) {
      res.status(400).json({ error: 'PIN is required' });
      return;
    }

    const result = await authService.verifyStaffPin(restaurantId, pin);

    if (!result.success || !result.staffPin) {
      res.status(401).json({ error: result.error });
      return;
    }

    // Load permissions from linked TeamMember's PermissionSet
    let permissions: Record<string, boolean> = {};
    const staffPin = await prisma.staffPin.findUnique({
      where: { id: result.staffPin.id },
      include: {
        teamMember: {
          include: { permissionSet: true },
        },
      },
    });
    if (staffPin?.teamMember?.permissionSet) {
      permissions = staffPin.teamMember.permissionSet.permissions as Record<string, boolean>;
    }

    res.json({
      success: true,
      staff: {
        ...result.staffPin,
        permissions,
      },
    });
  } catch (error) {
    logger.error('PIN verification error:', { error });
    res.status(500).json({ error: 'PIN verification failed' });
  }
});

// ============ Staff PIN Management (admin only) ============

// List all staff PINs for a restaurant (without actual PIN values)
router.get('/:merchantId/pins', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

    const pins = await prisma.staffPin.findMany({
      where: { restaurantId, isActive: true },
      select: {
        id: true,
        name: true,
        role: true,
        createdAt: true
      },
      orderBy: { name: 'asc' }
    });

    res.json(pins);
  } catch (error) {
    logger.error('List staff PINs error:', { error });
    res.status(500).json({ error: 'Failed to list staff PINs' });
  }
});

// Create a new staff PIN
router.post('/:merchantId/pins', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { name, pin, role = 'staff' } = req.body;

    if (!name || !pin) {
      res.status(400).json({ error: 'Name and PIN are required' });
      return;
    }

    const result = await authService.createStaffPin(restaurantId, name, pin, role);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.staffPin);
  } catch (error) {
    logger.error('Create staff PIN error:', { error });
    res.status(500).json({ error: 'Failed to create staff PIN' });
  }
});

// Update a staff PIN (including PIN value change)
router.patch('/:merchantId/pins/:pinId', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  try {
    const { restaurantId, pinId } = req.params;
    const { name, role, isActive, newPin } = req.body;

    const result = await authService.updateStaffPin(pinId, restaurantId, {
      ...(name !== undefined && { name }),
      ...(role !== undefined && { role }),
      ...(isActive !== undefined && { isActive }),
      ...(newPin !== undefined && { newPin })
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    // Return updated record
    const updated = await prisma.staffPin.findUnique({
      where: { id: pinId },
      select: { id: true, name: true, role: true, isActive: true }
    });

    res.json(updated);
  } catch (error) {
    logger.error('Update staff PIN error:', { error });
    res.status(500).json({ error: 'Failed to update staff PIN' });
  }
});

// Delete (deactivate) a staff PIN
router.delete('/:merchantId/pins/:pinId', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  try {
    const { pinId } = req.params;

    const result = await authService.deleteStaffPin(pinId);
    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }
    res.status(204).send();
  } catch (error) {
    logger.error('Delete staff PIN error:', { error });
    res.status(500).json({ error: 'Failed to delete staff PIN' });
  }
});

// ============ User Management ============

// List all users (admin: owner or super_admin) — returns TeamMembers with passwordHash (dashboard accounts)
router.get('/users', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const restaurantGroupId = req.query.restaurantGroupId as string | undefined;
    const users = await authService.listUsers(restaurantGroupId);
    res.json(users);
  } catch (error) {
    logger.error('List users error:', { error });
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Get a single user with restaurant access
router.get('/users/:userId', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const member = await prisma.teamMember.findUnique({
      where: { id: userId },
      include: {
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
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: member.id,
      email: member.email,
      firstName: member.firstName,
      lastName: member.lastName,
      role: member.role,
      isActive: member.isActive,
      lastLoginAt: member.lastLoginAt,
      createdAt: member.createdAt,
      restaurants: member.restaurantAccess.map(a => ({
        id: a.restaurant.id,
        name: a.restaurant.name,
        slug: a.restaurant.slug,
        role: a.role
      }))
    });
  } catch (error) {
    logger.error('Get user error:', { error });
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update a user (admin: owner or super_admin)
router.patch('/users/:userId', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, role, isActive } = req.body;

    // Only super_admin can change roles to super_admin or owner
    if (role && ['super_admin', 'owner'].includes(role) && req.user?.role !== 'super_admin') {
      res.status(403).json({ error: 'Only super_admin can assign owner or super_admin roles' });
      return;
    }

    const result = await authService.updateUser(userId, {
      ...(firstName !== undefined && { firstName }),
      ...(lastName !== undefined && { lastName }),
      ...(role !== undefined && { role }),
      ...(isActive !== undefined && { isActive })
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Update user error:', { error });
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Change own password (any authenticated user)
router.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      res.status(400).json({ error: 'Old password and new password are required' });
      return;
    }

    const result = await authService.changePassword(req.user!.teamMemberId, oldPassword, newPassword);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    await auditLog('password_change', { userId: req.user!.teamMemberId, ip: req.ip, metadata: { method: 'change_password' } });
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    logger.error('Change password error:', { error });
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Create a new user (super_admin only)
router.post('/users', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, role, restaurantGroupId, restaurantId } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const result = await authService.createUser({
      email,
      password,
      firstName,
      lastName,
      role: role || 'staff',
      restaurantGroupId,
      restaurantId: restaurantId ?? undefined,
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.user);
  } catch (error) {
    logger.error('Create user error:', { error });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Grant user access to a restaurant
router.post('/users/:userId/restaurants/:merchantId', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, restaurantId } = req.params;
    const { role = 'staff' } = req.body;

    const access = await prisma.userRestaurantAccess.upsert({
      where: {
        teamMemberId_restaurantId: { teamMemberId: userId, restaurantId }
      },
      create: {
        teamMemberId: userId,
        restaurantId,
        role
      },
      update: {
        role
      }
    });
    await auditLog('restaurant_access_granted', { userId: req.user!.teamMemberId, ip: req.ip, metadata: { targetUserId: userId, restaurantId, role } });
    res.json(access);
  } catch (error) {
    logger.error('Grant restaurant access error:', { error });
    res.status(500).json({ error: 'Failed to grant restaurant access' });
  }
});

// Revoke user access to a restaurant
router.delete('/users/:userId/restaurants/:merchantId', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, restaurantId } = req.params;

    await prisma.userRestaurantAccess.delete({
      where: {
        teamMemberId_restaurantId: { teamMemberId: userId, restaurantId }
      }
    });
    await auditLog('restaurant_access_revoked', { userId: req.user!.teamMemberId, ip: req.ip, metadata: { targetUserId: userId, restaurantId } });
    res.status(204).send();
  } catch (error) {
    logger.error('Revoke restaurant access error:', { error });
    res.status(500).json({ error: 'Failed to revoke restaurant access' });
  }
});

// ============ Restaurant Group Management ============

// Create a restaurant group
router.post('/groups', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { name, slug, description, logo } = req.body;

    if (!name || !slug) {
      res.status(400).json({ error: 'Name and slug are required' });
      return;
    }

    const group = await prisma.restaurantGroup.create({
      data: { name, slug, description, logo }
    });

    res.status(201).json(group);
  } catch (error) {
    logger.error('Create restaurant group error:', { error });
    res.status(500).json({ error: 'Failed to create restaurant group' });
  }
});

// List restaurant groups
router.get('/groups', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const groups = await prisma.restaurantGroup.findMany({
      where: { active: true },
      include: {
        _count: {
          select: { restaurants: true, teamMembers: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json(groups);
  } catch (error) {
    logger.error('List restaurant groups error:', { error });
    res.status(500).json({ error: 'Failed to list restaurant groups' });
  }
});

// ============ MFA (PCI DSS 8.4.2) ============

// Setup MFA — sends a 6-digit OTP to the user's email address
router.post('/mfa/setup', requireAuth, async (req: Request, res: Response) => {
  try {
    const member = await prisma.teamMember.findUnique({
      where: { id: req.user!.teamMemberId },
      select: { email: true, firstName: true, mfaEnabled: true },
    });

    if (!member?.email) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (member.mfaEnabled) {
      res.status(400).json({ error: 'MFA is already enabled. Disable it first to reconfigure.' });
      return;
    }

    await mfaService.sendOtp(req.user!.teamMemberId, member.email, member.firstName);
    res.json({ sent: true, maskedEmail: mfaService.maskEmail(member.email) });
  } catch (error) {
    logger.error('MFA setup error:', { error });
    res.status(500).json({ error: 'Failed to set up MFA' });
  }
});

// Verify MFA setup — user provides a TOTP code to confirm setup
router.post('/mfa/verify-setup', requireAuth, async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) {
      res.status(400).json({ error: 'Verification code is required' });
      return;
    }

    const result = await mfaService.verifyAndEnable(req.user!.teamMemberId, code);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'MFA is now enabled.' });
  } catch (error) {
    logger.error('MFA verify-setup error:', { error });
    res.status(500).json({ error: 'Failed to verify MFA setup' });
  }
});

// MFA challenge resend — send a fresh OTP to the user's email
router.post('/mfa/challenge/resend', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { mfaToken } = req.body;

    if (!mfaToken) {
      res.status(400).json({ error: 'MFA token is required' });
      return;
    }

    const payload = authService.verifyToken(mfaToken);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired MFA session' });
      return;
    }

    const member = await prisma.teamMember.findUnique({
      where: { id: payload.teamMemberId },
      select: { email: true, firstName: true },
    });

    if (!member?.email) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await mfaService.sendOtp(payload.teamMemberId, member.email, member.firstName);
    res.json({ sent: true, maskedEmail: mfaService.maskEmail(member.email) });
  } catch (error) {
    logger.error('MFA challenge resend error:', { error });
    res.status(500).json({ error: 'Failed to resend code' });
  }
});

// MFA challenge — verify email OTP after login to get full session
router.post('/mfa/challenge', async (req: Request, res: Response) => {
  try {
    const { mfaToken, code } = req.body;

    if (!mfaToken || !code) {
      res.status(400).json({ error: 'MFA token and code are required' });
      return;
    }

    // Verify the MFA session token
    const payload = authService.verifyToken(mfaToken);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired MFA session' });
      return;
    }

    // Validate the MFA session is still active
    const sessionValid = await authService.validateSession(payload.sessionId);
    if (!sessionValid) {
      res.status(401).json({ error: 'MFA session expired. Please log in again.' });
      return;
    }

    // Verify the TOTP code
    const isValid = await mfaService.verifyCode(payload.teamMemberId, code);
    if (!isValid) {
      await auditLog('mfa_challenge_failed', { userId: payload.teamMemberId, ip: req.ip });
      trackMfaFailed(payload.teamMemberId, req.ip ?? undefined);
      res.status(401).json({ error: 'Invalid MFA code' });
      return;
    }

    // Invalidate the short-lived MFA session
    await prisma.userSession.update({
      where: { id: payload.sessionId },
      data: { isActive: false },
    });

    // Create a full session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const session = await prisma.userSession.create({
      data: {
        userId: payload.teamMemberId,
        token: randomBytes(32).toString('hex'),
        deviceInfo: req.headers['user-agent'] ?? undefined,
        ipAddress: req.ip ?? undefined,
        expiresAt,
      },
    });

    const fullToken = authService.generateToken(
      { teamMemberId: payload.teamMemberId, email: payload.email, role: payload.role, type: 'user' },
      session.id,
    );

    // Get full user + restaurants
    const member = await prisma.teamMember.findUnique({
      where: { id: payload.teamMemberId },
      include: {
        restaurantAccess: {
          include: { restaurant: { select: { id: true, name: true, slug: true, merchantProfile: true } } },
        },
      },
    });

    const restaurants = (member?.restaurantAccess ?? []).map(a => ({
      id: a.restaurant.id,
      name: a.restaurant.name,
      slug: a.restaurant.slug,
      role: a.role,
      onboardingComplete: (() => {
        const p = a.restaurant.merchantProfile as Record<string, unknown> | null;
        return p?.['onboardingComplete'] === true;
      })(),
    }));

    setAuthCookie(res, fullToken);
    await auditLog('mfa_challenge_success', { userId: payload.teamMemberId, ip: req.ip });

    res.json({
      user: {
        id: member!.id,
        email: member!.email,
        firstName: member!.firstName,
        lastName: member!.lastName,
        role: member!.role,
        restaurantGroupId: member!.restaurantGroupId,
        mfaEnabled: member!.mfaEnabled,
      },
      restaurants,
    });
  } catch (error) {
    logger.error('MFA challenge error:', { error });
    res.status(500).json({ error: 'MFA verification failed' });
  }
});

// Disable MFA
// PCI DSS 8.4.2: Privileged roles (super_admin, owner, manager) cannot disable MFA.
router.post('/mfa/disable', requireAuth, authRateLimiter, async (req: Request, res: Response) => {
  try {
    // Block MFA disable for roles that require it
    const MFA_REQUIRED_ROLES = ['super_admin', 'owner', 'manager'];
    if (MFA_REQUIRED_ROLES.includes(req.user!.role)) {
      res.status(403).json({ error: 'MFA is required for your role and cannot be disabled.' });
      return;
    }

    await mfaService.disableMfa(req.user!.teamMemberId);
    res.json({ success: true, message: 'MFA has been disabled.' });
  } catch (error) {
    logger.error('MFA disable error:', { error });
    res.status(500).json({ error: 'Failed to disable MFA' });
  }
});

// Get MFA status for current user
router.get('/mfa/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const status = await mfaService.getStatus(req.user!.teamMemberId);
    res.json(status);
  } catch (error) {
    logger.error('MFA status error:', { error });
    res.status(500).json({ error: 'Failed to get MFA status' });
  }
});

// ============ Account Maintenance (super_admin only) ============

router.post('/maintenance/disable-inactive', requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const count = await disableInactiveAccounts();
    res.json({ success: true, disabledCount: count });
  } catch (error) {
    logger.error('Disable inactive accounts error:', { error });
    res.status(500).json({ error: 'Failed to disable inactive accounts' });
  }
});

export default router;
