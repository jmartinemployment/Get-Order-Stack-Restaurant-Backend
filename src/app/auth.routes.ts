import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authService } from '../services/auth.service';

const router = Router();
const prisma = new PrismaClient();

// ============ User Authentication ============

// Login with email/password
router.post('/login', async (req: Request, res: Response) => {
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

    await authService.logout(payload.sessionId);
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

    // Get full user info
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
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

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'User not found or disabled' });
      return;
    }

    // Get accessible restaurants
    let restaurants: Array<{ id: string; name: string; slug: string; role: string }> = [];

    if (user.role === 'super_admin') {
      const allRestaurants = await prisma.restaurant.findMany({
        where: { active: true },
        select: { id: true, name: true, slug: true }
      });
      restaurants = allRestaurants.map(r => ({ ...r, role: 'super_admin' }));
    } else if (user.restaurantAccess.length > 0) {
      restaurants = user.restaurantAccess.map(access => ({
        id: access.restaurant.id,
        name: access.restaurant.name,
        slug: access.restaurant.slug,
        role: access.role
      }));
    } else if (user.restaurantGroupId) {
      const groupRestaurants = await prisma.restaurant.findMany({
        where: { restaurantGroupId: user.restaurantGroupId, active: true },
        select: { id: true, name: true, slug: true }
      });
      restaurants = groupRestaurants.map(r => ({ ...r, role: user.role }));
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        restaurantGroupId: user.restaurantGroupId
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
router.post('/:restaurantId/pin/verify', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { pin } = req.body;

    if (!pin) {
      res.status(400).json({ error: 'PIN is required' });
      return;
    }

    const result = await authService.verifyStaffPin(restaurantId, pin);

    if (!result.success) {
      res.status(401).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      staff: result.staffPin
    });
  } catch (error) {
    console.error('PIN verification error:', error);
    res.status(500).json({ error: 'PIN verification failed' });
  }
});

// ============ Staff PIN Management (admin only) ============

// List all staff PINs for a restaurant (without actual PIN values)
router.get('/:restaurantId/pins', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

    // TODO: Add auth middleware to verify admin access

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
router.post('/:restaurantId/pins', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { name, pin, role = 'staff' } = req.body;

    // TODO: Add auth middleware to verify admin access

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

// Update a staff PIN
router.patch('/:restaurantId/pins/:pinId', async (req: Request, res: Response) => {
  try {
    const { pinId } = req.params;
    const { name, role, isActive } = req.body;

    // TODO: Add auth middleware to verify admin access

    const updated = await prisma.staffPin.update({
      where: { id: pinId },
      data: {
        ...(name !== undefined && { name }),
        ...(role !== undefined && { role }),
        ...(isActive !== undefined && { isActive })
      },
      select: {
        id: true,
        name: true,
        role: true,
        isActive: true
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Update staff PIN error:', error);
    res.status(500).json({ error: 'Failed to update staff PIN' });
  }
});

// Delete (deactivate) a staff PIN
router.delete('/:restaurantId/pins/:pinId', async (req: Request, res: Response) => {
  try {
    const { pinId } = req.params;

    // TODO: Add auth middleware to verify admin access

    await authService.deleteStaffPin(pinId);
    res.status(204).send();
  } catch (error) {
    console.error('Delete staff PIN error:', error);
    res.status(500).json({ error: 'Failed to delete staff PIN' });
  }
});

// ============ User Management (super admin only) ============

// Create a new user
router.post('/users', async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, role, restaurantGroupId } = req.body;

    // TODO: Add auth middleware to verify super_admin access

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
      restaurantGroupId
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
router.post('/users/:userId/restaurants/:restaurantId', async (req: Request, res: Response) => {
  try {
    const { userId, restaurantId } = req.params;
    const { role = 'staff' } = req.body;

    // TODO: Add auth middleware to verify admin access

    const access = await prisma.userRestaurantAccess.upsert({
      where: {
        userId_restaurantId: { userId, restaurantId }
      },
      create: {
        userId,
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
router.delete('/users/:userId/restaurants/:restaurantId', async (req: Request, res: Response) => {
  try {
    const { userId, restaurantId } = req.params;

    // TODO: Add auth middleware to verify admin access

    await prisma.userRestaurantAccess.delete({
      where: {
        userId_restaurantId: { userId, restaurantId }
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
router.post('/groups', async (req: Request, res: Response) => {
  try {
    const { name, slug, description, logo } = req.body;

    // TODO: Add auth middleware to verify super_admin access

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
router.get('/groups', async (req: Request, res: Response) => {
  try {
    // TODO: Add auth middleware to verify super_admin access

    const groups = await prisma.restaurantGroup.findMany({
      where: { active: true },
      include: {
        _count: {
          select: { restaurants: true, users: true }
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
