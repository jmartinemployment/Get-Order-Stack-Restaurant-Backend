import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set JWT_SECRET before importing auth service
process.env.JWT_SECRET = 'test-secret-for-vitest';

// Mock bcryptjs before importing auth service
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

// Mock jsonwebtoken
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockReturnValue('mock-jwt-token'),
    verify: vi.fn(),
    TokenExpiredError: class TokenExpiredError extends Error {},
    JsonWebTokenError: class JsonWebTokenError extends Error {},
  },
}));

// Mock PrismaClient
const mockPrismaTeamMember = {
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    teamMember = mockPrismaTeamMember;
  },
}));

// Must import after mocks are set up
const { authService } = await import('./auth.service');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AuthService — createUser includes email in Prisma create', () => {
  it('passes email to prisma.teamMember.create', async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue(null);
    mockPrismaTeamMember.create.mockResolvedValue({
      id: 'tm-1',
      email: 'signup@example.com',
      firstName: 'Bug',
      lastName: 'Test',
      role: 'owner',
    });

    const result = await authService.createUser({
      email: 'Signup@Example.com',
      password: 'BugTest2025!', // NOSONAR - intentional test credential
      firstName: 'Bug',
      lastName: 'Test',
      role: 'owner',
    });

    expect(result.success).toBe(true);

    const createCall = mockPrismaTeamMember.create.mock.calls[0][0];
    expect(createCall.data.email).toBe('signup@example.com');
  });

  it('returns email in the user object after creation', async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue(null);
    mockPrismaTeamMember.create.mockResolvedValue({
      id: 'tm-2',
      email: 'newuser@example.com',
      firstName: 'New',
      lastName: 'User',
      role: 'owner',
    });

    const result = await authService.createUser({
      email: 'newuser@example.com',
      password: 'password123', // NOSONAR - intentional test credential
      firstName: 'New',
      lastName: 'User',
      role: 'owner',
    });

    expect(result.success).toBe(true);
    expect(result.user?.email).toBe('newuser@example.com');
  });

  it('does not silently drop email when optional fields are missing', async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue(null);
    mockPrismaTeamMember.create.mockResolvedValue({
      id: 'tm-3',
      email: 'minimal@example.com',
      firstName: undefined,
      lastName: undefined,
      role: 'owner',
    });

    const result = await authService.createUser({
      email: 'Minimal@Example.com',
      password: 'password123', // NOSONAR - intentional test credential
      role: 'owner',
    });

    expect(result.success).toBe(true);

    const createCall = mockPrismaTeamMember.create.mock.calls[0][0];
    expect(createCall.data.email).toBe('minimal@example.com');
    expect(createCall.data.email).not.toBeUndefined();
    expect(createCall.data.email).not.toBeNull();
  });
});
