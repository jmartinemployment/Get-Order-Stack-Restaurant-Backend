import { Request, Response, NextFunction } from 'express';
import { authService, TokenPayload } from '../services/auth.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      merchantAccess?: {
        hasAccess: boolean;
        role?: string;
      };
    }
  }
}

// ============ Authentication Middleware ============

// Require valid JWT token
export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const token = authHeader.substring(7);
    const payload = authService.verifyToken(token);

    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Validate session is still active
    const isValid = await authService.validateSession(payload.sessionId);
    if (!isValid) {
      res.status(401).json({ error: 'Session expired' });
      return;
    }

    // Attach user to request
    req.user = payload;
    next();
  } catch (error) {
    console.error('[Auth Middleware] Error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

// Optional auth - attach user if token present, but don't require it
export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = authService.verifyToken(token);

      if (payload) {
        const isValid = await authService.validateSession(payload.sessionId);
        if (isValid) {
          req.user = payload;
        }
      }
    }

    next();
  } catch (error) {
    // Don't fail on optional auth errors, just continue without user
    // But log for debugging visibility
    console.debug('[Auth Middleware] Optional auth error (continuing without user):', error);
    next();
  }
};

// ============ Role-based Authorization ============

// Require specific role(s)
export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
};

// Require super_admin role
export const requireSuperAdmin = requireRole('super_admin');

// Require admin-level access (super_admin or owner)
export const requireAdmin = requireRole('super_admin', 'owner');

// Require manager or higher
export const requireManager = requireRole('super_admin', 'owner', 'manager');

// ============ Merchant Access Authorization ============

// Check if user has access to the specified restaurant
export const requireMerchantAccess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Get restaurantId from route params
    const restaurantId = req.params.merchantId;

    if (!restaurantId) {
      res.status(400).json({ error: 'Merchant ID required' });
      return;
    }

    // Check access
    const access = await authService.checkRestaurantAccess(req.user.teamMemberId, restaurantId);

    if (!access.hasAccess) {
      res.status(403).json({ error: 'Access to this merchant denied' });
      return;
    }

    // Attach access info to request
    req.merchantAccess = access;
    next();
  } catch (error) {
    console.error('[Auth Middleware] Merchant access error:', error);
    res.status(500).json({ error: 'Authorization error' });
  }
};

// Require manager or higher role for the specific restaurant
export const requireMerchantManager = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const restaurantId = req.params.merchantId;

    if (!restaurantId) {
      res.status(400).json({ error: 'Merchant ID required' });
      return;
    }

    const access = await authService.checkRestaurantAccess(req.user.teamMemberId, restaurantId);

    if (!access.hasAccess) {
      res.status(403).json({ error: 'Access to this merchant denied' });
      return;
    }

    // Check if role is manager or higher
    const managerRoles = ['super_admin', 'owner', 'manager'];
    if (!access.role || !managerRoles.includes(access.role)) {
      res.status(403).json({ error: 'Manager access required' });
      return;
    }

    req.merchantAccess = access;
    next();
  } catch (error) {
    console.error('[Auth Middleware] Merchant manager access error:', error);
    res.status(500).json({ error: 'Authorization error' });
  }
};

// Require owner or higher role for the specific restaurant
export const requireMerchantOwner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const restaurantId = req.params.merchantId;

    if (!restaurantId) {
      res.status(400).json({ error: 'Merchant ID required' });
      return;
    }

    const access = await authService.checkRestaurantAccess(req.user.teamMemberId, restaurantId);

    if (!access.hasAccess) {
      res.status(403).json({ error: 'Access to this merchant denied' });
      return;
    }

    // Check if role is owner or higher
    const ownerRoles = ['super_admin', 'owner'];
    if (!access.role || !ownerRoles.includes(access.role)) {
      res.status(403).json({ error: 'Owner access required' });
      return;
    }

    req.merchantAccess = access;
    next();
  } catch (error) {
    console.error('[Auth Middleware] Merchant owner access error:', error);
    res.status(500).json({ error: 'Authorization error' });
  }
};

// ============ Device Authentication ============

// For device-based authentication (KDS/POS without user login)
export const requireDeviceAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const deviceId = req.headers['x-device-id'] as string;

    if (!deviceId) {
      res.status(401).json({ error: 'Device ID required' });
      return;
    }

    // Verify device exists and is active
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { restaurant: true }
    });

    if (!device || device.status !== 'active') {
      res.status(401).json({ error: 'Invalid or inactive device' });
      return;
    }

    // Attach device info to request
    (req as any).device = device;
    next();
  } catch (error) {
    console.error('[Auth Middleware] Device auth error:', error);
    res.status(500).json({ error: 'Device authentication error' });
  }
};

// Combined auth: accept either user token OR device auth
export const requireAuthOrDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  const deviceId = req.headers['x-device-id'] as string;

  // Try user auth first
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return requireAuth(req, res, next);
  }

  // Fall back to device auth
  if (deviceId) {
    return requireDeviceAuth(req, res, next);
  }

  res.status(401).json({ error: 'Authentication required (token or device ID)' });
};
