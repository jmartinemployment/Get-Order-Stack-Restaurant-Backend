import jwt from 'jsonwebtoken';
import { USERS, SESSION, RESTAURANT_ID, RESTAURANT_GROUP_ID } from './fixtures';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-integration-tests';

interface TokenOptions {
  teamMemberId?: string;
  email?: string;
  role?: string;
  restaurantGroupId?: string;
  sessionId?: string;
  type?: 'user' | 'device' | 'pin';
  expiresIn?: string;
}

/**
 * Generate a valid JWT token for testing.
 */
export function createToken(options: TokenOptions = {}): string {
  const payload = {
    teamMemberId: options.teamMemberId ?? USERS.owner.id,
    email: options.email ?? USERS.owner.email,
    role: options.role ?? 'owner',
    restaurantGroupId: options.restaurantGroupId ?? RESTAURANT_GROUP_ID,
    sessionId: options.sessionId ?? SESSION.id,
    type: options.type ?? 'user',
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: (options.expiresIn ?? '7d') as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Pre-built tokens for each role.
 */
export const tokens = {
  superAdmin: createToken({
    teamMemberId: USERS.superAdmin.id,
    email: USERS.superAdmin.email,
    role: 'super_admin',
    sessionId: 'session-super-admin',
  }),
  owner: createToken({
    teamMemberId: USERS.owner.id,
    email: USERS.owner.email,
    role: 'owner',
    sessionId: 'session-owner',
  }),
  manager: createToken({
    teamMemberId: USERS.manager.id,
    email: USERS.manager.email,
    role: 'manager',
    sessionId: 'session-manager',
  }),
  staff: createToken({
    teamMemberId: USERS.staff.id,
    email: USERS.staff.email,
    role: 'staff',
    sessionId: 'session-staff',
  }),
  expired: jwt.sign(
    {
      teamMemberId: USERS.owner.id,
      email: USERS.owner.email,
      role: 'owner',
      sessionId: 'session-expired',
      type: 'user',
    },
    JWT_SECRET,
    { expiresIn: '0s' },
  ),
} as const;

/**
 * Auth header object for supertest.
 */
export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Shorthand to get the base API path for a restaurant.
 */
export function restaurantPath(path: string, restaurantId: string = RESTAURANT_ID): string {
  return `/api/restaurant/${restaurantId}${path}`;
}
