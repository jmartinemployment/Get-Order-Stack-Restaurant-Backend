import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { authService } from '../services/auth.service';
import { requireAuth, requireAdmin, requireSuperAdmin, requireRestaurantManager } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

// Rate limit auth endpoints to prevent brute-force attacks
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // 10 attempts per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  keyGenerator: (req) => req.ip ?? 'unknown',
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

// Public signup — creates owner account + auto-login
router.post('/signup', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (!firstName || !lastName) {
      res.status(400).json({ error: 'First name and last name are required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    // Create the user as an owner — no restaurant yet, onboarding creates it and links them
    const createResult = await authService.createUser({
      email,
      password,
      firstName,
      lastName,
      role: 'owner',
    });

    if (!createResult.success) {
      res.status(400).json({ error: createResult.error });
      return;
    }

    // Auto-login after signup
    const deviceInfo = req.headers['user-agent'] || undefined;
    const ipAddress = req.ip || req.socket.remoteAddress || undefined;
    const loginResult = await authService.loginUser(email, password, deviceInfo, ipAddress);

    if (!loginResult.success) {
      // User created but login failed — unlikely but handle gracefully
      res.status(201).json({
        token: null,
        user: createResult.user,
        restaurants: [],
      });
      return;
    }

    res.status(201).json({
      token: loginResult.token,
      user: loginResult.user,
      restaurants: loginResult.restaurants,
    });
  } catch (error) {
    console.error('Signup error:', error);
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
      res.status(401).json({ error: result.error });
      return;
    }

    res.json({
      token: result.token,
      user: result.user,
      restaurants: result.restaurants
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Reset password by email (public, rate-limited)
router.post('/reset-password', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      res.status(400).json({ error: 'Email and new password are required' });
      return;
    }

    const result = await authService.resetPasswordByEmail(email, newPassword);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Logout (invalidate session)
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7);
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
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Validate token and get current user
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7);
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
              select: { id: true, name: true, slug: true }
            }
          }
        }
      }
    });

    if (!member || !member.isActive) {
      res.status(401).json({ error: 'User not found or disabled' });
      return;
    }

    // Get accessible restaurants
    let restaurants: Array<{ id: string; name: string; slug: string; role: string }> = [];

    if (member.role === 'super_admin') {
      const allRestaurants = await prisma.restaurant.findMany({
        where: { active: true },
        select: { id: true, name: true, slug: true }
      });
      restaurants = allRestaurants.map(r => ({ ...r, role: 'super_admin' }));
    } else if (member.restaurantAccess.length > 0) {
      restaurants = member.restaurantAccess.map(access => ({
        id: access.restaurant.id,
        name: access.restaurant.name,
        slug: access.restaurant.slug,
        role: access.role
      }));
    } else if (member.restaurantGroupId) {
      const groupRestaurants = await prisma.restaurant.findMany({
        where: { restaurantGroupId: member.restaurantGroupId, active: true },
        select: { id: true, name: true, slug: true }
      });
      restaurants = groupRestaurants.map(r => ({ ...r, role: member.role }));
    }

    res.json({
      user: {
        id: member.id,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        role: member.role,
        restaurantGroupId: member.restaurantGroupId,
        onboardingStatus: member.onboardingStatus,
      },
      restaurants
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// ============ Staff PIN Authentication ============

// Verify staff PIN for a restaurant
router.post('/:restaurantId/pin/verify', pinRateLimiter, async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
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
    console.error('PIN verification error:', error);
    res.status(500).json({ error: 'PIN verification failed' });
  }
});

// ============ Staff PIN Management (admin only) ============

// List all staff PINs for a restaurant (without actual PIN values)
router.get('/:restaurantId/pins', requireAuth, requireRestaurantManager, async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

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
    console.error('List staff PINs error:', error);
    res.status(500).json({ error: 'Failed to list staff PINs' });
  }
});

// Create a new staff PIN
router.post('/:restaurantId/pins', requireAuth, requireRestaurantManager, async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
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
    console.error('Create staff PIN error:', error);
    res.status(500).json({ error: 'Failed to create staff PIN' });
  }
});

// Update a staff PIN (including PIN value change)
router.patch('/:restaurantId/pins/:pinId', requireAuth, requireRestaurantManager, async (req: Request, res: Response) => {
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
    console.error('Update staff PIN error:', error);
    res.status(500).json({ error: 'Failed to update staff PIN' });
  }
});

// Delete (deactivate) a staff PIN
router.delete('/:restaurantId/pins/:pinId', requireAuth, requireRestaurantManager, async (req: Request, res: Response) => {
  try {
    const { pinId } = req.params;

    const result = await authService.deleteStaffPin(pinId);
    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }
    res.status(204).send();
  } catch (error) {
    console.error('Delete staff PIN error:', error);
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
    console.error('List users error:', error);
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
    console.error('Get user error:', error);
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
    console.error('Update user error:', error);
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

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
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
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Grant user access to a restaurant
router.post('/users/:userId/restaurants/:restaurantId', requireAuth, requireAdmin, async (req: Request, res: Response) => {
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

    res.json(access);
  } catch (error) {
    console.error('Grant restaurant access error:', error);
    res.status(500).json({ error: 'Failed to grant restaurant access' });
  }
});

// Revoke user access to a restaurant
router.delete('/users/:userId/restaurants/:restaurantId', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, restaurantId } = req.params;

    await prisma.userRestaurantAccess.delete({
      where: {
        teamMemberId_restaurantId: { teamMemberId: userId, restaurantId }
      }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Revoke restaurant access error:', error);
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
    console.error('Create restaurant group error:', error);
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
    console.error('List restaurant groups error:', error);
    res.status(500).json({ error: 'Failed to list restaurant groups' });
  }
});

export default router;
