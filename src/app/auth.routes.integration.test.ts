import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../test/request-helper';
import { getPrismaMock, resetPrismaMock } from '../test/prisma-mock';
import { tokens } from '../test/auth-helper';
import { USERS, RESTAURANT_ID, RESTAURANT_GROUP_ID, SESSION } from '../test/fixtures';

// Mock authService — must not reference imports in the factory (hoisted)
vi.mock('../services/auth.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/auth.service')>();
  return {
    ...actual,
    authService: {
      ...actual.authService,
      validateSession: vi.fn().mockResolvedValue(true),
      loginUser: vi.fn().mockResolvedValue({ success: true, token: 'mock-jwt', user: {}, restaurants: [] }),
      createUser: vi.fn().mockResolvedValue({ success: true, user: { id: 'new-id' } }),
      verifyStaffPin: vi.fn().mockResolvedValue({ success: true, staffPin: { id: 'pin-1', name: 'John', role: 'staff', restaurantId: 'r-1' } }),
      createStaffPin: vi.fn().mockResolvedValue({ success: true, staffPin: { id: 'pin-new', name: 'Jane', role: 'staff' } }),
      updateStaffPin: vi.fn().mockResolvedValue({ success: true }),
      deleteStaffPin: vi.fn().mockResolvedValue({ success: true }),
      logout: vi.fn().mockResolvedValue({ success: true }),
      changePassword: vi.fn().mockResolvedValue({ success: true }),
      updateUser: vi.fn().mockResolvedValue({ success: true }),
      listUsers: vi.fn().mockResolvedValue([]),
      checkRestaurantAccess: vi.fn().mockResolvedValue({ hasAccess: true, role: 'owner' }),
      verifyToken: actual.authService.verifyToken,
    },
  };
});

const prisma = getPrismaMock();
const { authService } = await import('../services/auth.service');

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();

  // Restore defaults after clearAllMocks
  (authService.validateSession as any).mockResolvedValue(true);
  (authService.loginUser as any).mockResolvedValue({
    success: true,
    token: 'mock-jwt-token',
    user: {
      id: USERS.owner.id,
      email: USERS.owner.email,
      firstName: USERS.owner.firstName,
      lastName: USERS.owner.lastName,
      role: USERS.owner.role,
      restaurantGroupId: RESTAURANT_GROUP_ID,
    },
    restaurants: [{ id: RESTAURANT_ID, name: 'Taipa Restaurant', slug: 'taipa', role: 'owner' }],
  });
  (authService.createUser as any).mockResolvedValue({
    success: true,
    user: { id: 'new-user-id', email: 'new@example.com', firstName: 'New', lastName: 'User', role: 'owner' },
  });
  (authService.verifyStaffPin as any).mockResolvedValue({
    success: true,
    staffPin: { id: 'pin-1', name: 'John', role: 'staff', restaurantId: RESTAURANT_ID },
  });
  (authService.createStaffPin as any).mockResolvedValue({
    success: true,
    staffPin: { id: 'pin-new', name: 'Jane', role: 'staff' },
  });
  (authService.updateStaffPin as any).mockResolvedValue({ success: true });
  (authService.deleteStaffPin as any).mockResolvedValue({ success: true });
  (authService.logout as any).mockResolvedValue({ success: true });
  (authService.changePassword as any).mockResolvedValue({ success: true });
  (authService.updateUser as any).mockResolvedValue({ success: true });
  (authService.listUsers as any).mockResolvedValue([]);
  (authService.checkRestaurantAccess as any).mockResolvedValue({ hasAccess: true, role: 'owner' });
});

// ============ POST /api/auth/signup ============

describe('POST /api/auth/signup', () => {
  const url = '/api/auth/signup';

  it('creates account and returns token', async () => {
    const res = await api.anonymous().post(url).send({
      firstName: 'New', lastName: 'User', email: 'new@example.com', password: 'password123',
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
  });

  it('returns 400 for missing email', async () => {
    const res = await api.anonymous().post(url).send({ firstName: 'New', lastName: 'User', password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing password', async () => {
    const res = await api.anonymous().post(url).send({ firstName: 'New', lastName: 'User', email: 'new@example.com' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing names', async () => {
    const res = await api.anonymous().post(url).send({ email: 'new@example.com', password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for short password', async () => {
    const res = await api.anonymous().post(url).send({
      firstName: 'New', lastName: 'User', email: 'new@example.com', password: '12345',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when email already exists', async () => {
    (authService.createUser as any).mockResolvedValue({ success: false, error: 'Email already registered' });
    const res = await api.anonymous().post(url).send({
      firstName: 'New', lastName: 'User', email: 'existing@example.com', password: 'password123',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email already registered');
  });
});

// ============ POST /api/auth/login ============

describe('POST /api/auth/login', () => {
  const url = '/api/auth/login';

  it('returns token and user on success', async () => {
    const res = await api.anonymous().post(url).send({ email: 'owner@taipa.com', password: 'owner123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.restaurants).toBeDefined();
  });

  it('returns 400 for missing email', async () => {
    const res = await api.anonymous().post(url).send({ password: 'owner123' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing password', async () => {
    const res = await api.anonymous().post(url).send({ email: 'owner@taipa.com' });
    expect(res.status).toBe(400);
  });

  it('returns 401 for invalid credentials', async () => {
    (authService.loginUser as any).mockResolvedValue({ success: false, error: 'Invalid email or password' });
    const res = await api.anonymous().post(url).send({ email: 'wrong@example.com', password: 'wrongpass' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });
});

// ============ POST /api/auth/logout ============

describe('POST /api/auth/logout', () => {
  it('returns 401 without token', async () => {
    const res = await api.anonymous().post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  it('logs out successfully', async () => {
    const res = await api.owner.post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ============ GET /api/auth/me ============

describe('GET /api/auth/me', () => {
  it('returns 401 without token', async () => {
    const res = await api.anonymous().get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns current user info', async () => {
    prisma.teamMember.findUnique.mockResolvedValue({
      ...USERS.owner,
      restaurantAccess: USERS.owner.restaurantAccess,
    });
    const res = await api.owner.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(USERS.owner.email);
    expect(res.body.restaurants).toBeDefined();
  });

  it('returns 401 for expired session', async () => {
    (authService.validateSession as any).mockResolvedValue(false);
    const res = await api.owner.get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

// ============ PIN Authentication ============

describe('POST /api/auth/:merchantId/pin/verify', () => {
  const url = `/api/auth/${RESTAURANT_ID}/pin/verify`;

  it('verifies a valid PIN', async () => {
    const res = await api.anonymous().post(url).send({ pin: '1234' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when PIN is missing', async () => {
    const res = await api.anonymous().post(url).send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 for invalid PIN', async () => {
    (authService.verifyStaffPin as any).mockResolvedValue({ success: false, error: 'Invalid PIN' });
    const res = await api.anonymous().post(url).send({ pin: '9999' });
    expect(res.status).toBe(401);
  });
});

// ============ Staff PIN Management ============

describe('Staff PIN CRUD', () => {
  it('GET /:merchantId/pins returns 401 without auth', async () => {
    const res = await api.anonymous().get(`/api/auth/${RESTAURANT_ID}/pins`);
    expect(res.status).toBe(401);
  });

  it('GET /:merchantId/pins returns list', async () => {
    prisma.staffPin.findMany.mockResolvedValue([
      { id: 'pin-1', name: 'John', role: 'staff', createdAt: new Date() },
    ]);
    const res = await api.owner.get(`/api/auth/${RESTAURANT_ID}/pins`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /:merchantId/pins creates PIN', async () => {
    const res = await api.owner.post(`/api/auth/${RESTAURANT_ID}/pins`).send({ name: 'Jane', pin: '5678' });
    expect(res.status).toBe(201);
  });

  it('POST /:merchantId/pins returns 400 for missing fields', async () => {
    const res = await api.owner.post(`/api/auth/${RESTAURANT_ID}/pins`).send({ name: 'Jane' });
    expect(res.status).toBe(400);
  });

  it('PATCH /:merchantId/pins/:pinId updates PIN', async () => {
    prisma.staffPin.findUnique.mockResolvedValue({ id: 'pin-1', name: 'Updated', role: 'staff', isActive: true });
    const res = await api.owner.patch(`/api/auth/${RESTAURANT_ID}/pins/pin-1`).send({ name: 'Updated' });
    expect(res.status).toBe(200);
  });

  it('DELETE /:merchantId/pins/:pinId deactivates PIN', async () => {
    const res = await api.owner.delete(`/api/auth/${RESTAURANT_ID}/pins/pin-1`);
    expect(res.status).toBe(204);
  });
});

// ============ User Management ============

describe('User Management', () => {
  it('GET /users returns 401 without auth', async () => {
    const res = await api.anonymous().get('/api/auth/users');
    expect(res.status).toBe(401);
  });

  it('GET /users returns 403 for staff', async () => {
    const res = await api.staff.get('/api/auth/users');
    expect(res.status).toBe(403);
  });

  it('GET /users returns list for admin', async () => {
    (authService.listUsers as any).mockResolvedValue([{ id: USERS.owner.id, email: USERS.owner.email }]);
    const res = await api.owner.get('/api/auth/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /users/:userId returns user', async () => {
    prisma.teamMember.findUnique.mockResolvedValue({ ...USERS.owner, restaurantAccess: USERS.owner.restaurantAccess });
    const res = await api.owner.get(`/api/auth/users/${USERS.owner.id}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(USERS.owner.email);
  });

  it('GET /users/:userId returns 404 for nonexistent', async () => {
    prisma.teamMember.findUnique.mockResolvedValue(null);
    const res = await api.owner.get('/api/auth/users/nonexistent');
    expect(res.status).toBe(404);
  });

  it('PATCH /users/:userId updates user as admin', async () => {
    const res = await api.owner.patch(`/api/auth/users/${USERS.staff.id}`).send({ firstName: 'Updated' });
    expect(res.status).toBe(200);
  });

  it('PATCH /users/:userId returns 403 for staff', async () => {
    const res = await api.staff.patch(`/api/auth/users/${USERS.staff.id}`).send({ firstName: 'Updated' });
    expect(res.status).toBe(403);
  });

  it('PATCH /users/:userId returns 403 when non-super_admin assigns super_admin role', async () => {
    const res = await api.owner.patch(`/api/auth/users/${USERS.staff.id}`).send({ role: 'super_admin' });
    expect(res.status).toBe(403);
  });

  it('PATCH /users/:userId allows super_admin to assign owner role', async () => {
    const res = await api.superAdmin.patch(`/api/auth/users/${USERS.staff.id}`).send({ role: 'owner' });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/change-password', () => {
  it('returns 401 without auth', async () => {
    const res = await api.anonymous().post('/api/auth/change-password').send({ oldPassword: 'old', newPassword: 'new123' });
    expect(res.status).toBe(401);
  });

  it('changes password', async () => {
    const res = await api.owner.post('/api/auth/change-password').send({ oldPassword: 'owner123', newPassword: 'newpass123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 for missing fields', async () => {
    const res = await api.owner.post('/api/auth/change-password').send({ oldPassword: 'owner123' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/users (create user)', () => {
  it('returns 403 for non-super_admin', async () => {
    const res = await api.owner.post('/api/auth/users').send({ email: 'new@e.com', password: 'pass123' });
    expect(res.status).toBe(403);
  });

  it('creates user as super_admin', async () => {
    const res = await api.superAdmin.post('/api/auth/users').send({
      email: 'new@e.com', password: 'pass123', firstName: 'New', lastName: 'User',
    });
    expect(res.status).toBe(201);
  });

  it('returns 400 for missing email', async () => {
    const res = await api.superAdmin.post('/api/auth/users').send({ password: 'pass123' });
    expect(res.status).toBe(400);
  });
});

// ============ Restaurant Access ============

describe('Restaurant Access', () => {
  it('POST /users/:userId/restaurants/:merchantId grants access', async () => {
    prisma.userRestaurantAccess.upsert.mockResolvedValue({ teamMemberId: USERS.staff.id, restaurantId: RESTAURANT_ID, role: 'staff' });
    const res = await api.owner.post(`/api/auth/users/${USERS.staff.id}/restaurants/${RESTAURANT_ID}`).send({ role: 'staff' });
    expect(res.status).toBe(200);
  });

  it('DELETE /users/:userId/restaurants/:merchantId revokes access', async () => {
    const res = await api.owner.delete(`/api/auth/users/${USERS.staff.id}/restaurants/${RESTAURANT_ID}`);
    expect(res.status).toBe(204);
  });

  it('POST returns 403 for staff role', async () => {
    const res = await api.staff.post(`/api/auth/users/${USERS.staff.id}/restaurants/${RESTAURANT_ID}`).send({ role: 'staff' });
    expect(res.status).toBe(403);
  });
});

// ============ Restaurant Groups ============

describe('Restaurant Groups', () => {
  it('POST /groups returns 403 for non-super_admin', async () => {
    const res = await api.owner.post('/api/auth/groups').send({ name: 'Group', slug: 'group' });
    expect(res.status).toBe(403);
  });

  it('POST /groups creates group as super_admin', async () => {
    prisma.restaurantGroup.create.mockResolvedValue({ id: 'g-1', name: 'Test', slug: 'test' });
    const res = await api.superAdmin.post('/api/auth/groups').send({ name: 'Test', slug: 'test' });
    expect(res.status).toBe(201);
  });

  it('POST /groups returns 400 for missing slug', async () => {
    const res = await api.superAdmin.post('/api/auth/groups').send({ name: 'Test' });
    expect(res.status).toBe(400);
  });

  it('GET /groups returns 403 for non-super_admin', async () => {
    const res = await api.owner.get('/api/auth/groups');
    expect(res.status).toBe(403);
  });

  it('GET /groups returns list for super_admin', async () => {
    prisma.restaurantGroup.findMany.mockResolvedValue([]);
    const res = await api.superAdmin.get('/api/auth/groups');
    expect(res.status).toBe(200);
  });
});
