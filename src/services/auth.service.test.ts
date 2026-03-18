import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set JWT_SECRET before importing auth service
process.env.JWT_SECRET = 'test-secret-for-vitest';

// ── bcryptjs ──────────────────────────────────────────────────────────────────
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

// ── jsonwebtoken ──────────────────────────────────────────────────────────────
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockReturnValue('mock-jwt-token'),
    verify: vi.fn(),
    TokenExpiredError: class TokenExpiredError extends Error {},
    JsonWebTokenError: class JsonWebTokenError extends Error {},
  },
}));

// ── Logger (suppress console output during tests) ─────────────────────────────
vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

// ── Audit function (prevent audit.ts from hitting its own PrismaClient) ───────
vi.mock('../utils/audit', () => ({ auditLog: vi.fn() }));

// ── Email service ─────────────────────────────────────────────────────────────
vi.mock('./email.service', () => ({ sendPasswordResetEmail: vi.fn() }));

// ── Prisma model mocks ────────────────────────────────────────────────────────
const mockPrismaTeamMember = {
  findUnique: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

const mockPrismaPasswordHistory = {
  findMany: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
};

const mockPrismaAuditLog = {
  count: vi.fn(),
  create: vi.fn(),
};

const mockPrismaUserSession = {
  create: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
};

const mockPrismaPasswordResetToken = {
  deleteMany: vi.fn(),
  create: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
};

const mockTransaction = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    teamMember = mockPrismaTeamMember;
    passwordHistory = mockPrismaPasswordHistory;
    auditLog = mockPrismaAuditLog;
    userSession = mockPrismaUserSession;
    passwordResetToken = mockPrismaPasswordResetToken;
    $transaction = mockTransaction;
  },
}));

// Must import after mocks are set up
const { authService } = await import('./auth.service');

// ── Safe defaults reset before each test ──────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockPrismaAuditLog.count.mockResolvedValue(0);
  mockPrismaAuditLog.create.mockResolvedValue({});
  mockPrismaPasswordHistory.findMany.mockResolvedValue([]);
  mockPrismaPasswordHistory.create.mockResolvedValue({});
  mockPrismaPasswordHistory.deleteMany.mockResolvedValue({ count: 0 });
  mockPrismaUserSession.create.mockResolvedValue({ id: 'sess-1', token: 'sess-token' });
  mockPrismaUserSession.findMany.mockResolvedValue([]);
  mockTransaction.mockResolvedValue([]);
});

// =============================================================================
// Existing tests — passwords updated to satisfy FEATURE-15 policy
// =============================================================================

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
      // Updated from 'password123' — FEATURE-15 requires 12+ chars, uppercase, digit, special
      password: 'Password123!', // NOSONAR - intentional test credential
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
      // Updated from 'password123' — FEATURE-15 requires 12+ chars, uppercase, digit, special
      password: 'Password123!', // NOSONAR - intentional test credential
      role: 'owner',
    });

    expect(result.success).toBe(true);

    const createCall = mockPrismaTeamMember.create.mock.calls[0][0];
    expect(createCall.data.email).toBe('minimal@example.com');
    expect(createCall.data.email).not.toBeUndefined();
    expect(createCall.data.email).not.toBeNull();
  });
});

// =============================================================================
// New tests — Password Strength Validation (validatePasswordStrength via createUser)
// Note: createUser checks email uniqueness before password strength, so all
// tests that expect a strength failure must mock findUnique to return null.
// =============================================================================

describe('validatePasswordStrength — createUser rejects weak passwords', () => {
  it('rejects password shorter than 12 characters', async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue(null);

    const result = await authService.createUser({
      email: 'test@example.com',
      password: 'Short1!', // NOSONAR - intentional weak credential: 7 chars
      role: 'owner',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('at least 12 characters');
    expect(mockPrismaTeamMember.create).not.toHaveBeenCalled();
  });

  it('rejects password without an uppercase letter', async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue(null);

    const result = await authService.createUser({
      email: 'test@example.com',
      password: 'alllowercase1!', // NOSONAR - intentional weak credential: no uppercase
      role: 'owner',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('uppercase letter');
    expect(mockPrismaTeamMember.create).not.toHaveBeenCalled();
  });

  it('rejects password without a lowercase letter', async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue(null);

    const result = await authService.createUser({
      email: 'test@example.com',
      password: 'ALLUPPERCASE1!', // NOSONAR - intentional weak credential: no lowercase
      role: 'owner',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('lowercase letter');
    expect(mockPrismaTeamMember.create).not.toHaveBeenCalled();
  });

  it('rejects password without a digit', async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue(null);

    const result = await authService.createUser({
      email: 'test@example.com',
      password: 'NoDigitsHere!!', // NOSONAR - intentional weak credential: no digit
      role: 'owner',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('number');
    expect(mockPrismaTeamMember.create).not.toHaveBeenCalled();
  });

  it('rejects password without a special character', async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue(null);

    const result = await authService.createUser({
      email: 'test@example.com',
      password: 'NoSpecial12345', // NOSONAR - intentional weak credential: no special char
      role: 'owner',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('special character');
    expect(mockPrismaTeamMember.create).not.toHaveBeenCalled();
  });

  it('accepts a password at exactly 12 characters that meets all requirements', async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue(null);
    mockPrismaTeamMember.create.mockResolvedValue({
      id: 'tm-4', email: 'test@example.com', firstName: null, lastName: null, role: 'owner',
    });

    const result = await authService.createUser({
      email: 'test@example.com',
      // 12 chars exactly: A(upper) bcdefghij(lower) 1(digit) !(special)
      password: 'Abcdefghij1!', // NOSONAR - boundary test credential
      role: 'owner',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a strong password that satisfies all five requirements', async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue(null);
    mockPrismaTeamMember.create.mockResolvedValue({
      id: 'tm-5', email: 'test@example.com', firstName: null, lastName: null, role: 'owner',
    });

    const result = await authService.createUser({
      email: 'test@example.com',
      password: 'MyStr0ng!Pass', // NOSONAR - valid strong credential
      role: 'owner',
    });

    expect(result.success).toBe(true);
  });
});

// =============================================================================
// New test — changePassword: password policy enforced on the new password
// =============================================================================

describe('changePassword — password policy enforced', () => {
  it('rejects a weak new password even when the old password is correct', async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue({
      id: 'tm-cp', passwordHash: 'current-hash',
    });
    // bcrypt.compare default mock returns true → old password verified as correct

    const result = await authService.changePassword(
      'tm-cp',
      'OldPassword1!', // NOSONAR - valid old password
      'alllowercase1!', // NOSONAR - intentional weak new password: no uppercase
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('uppercase letter');
    // Strength rejected before history check or hash update
    expect(mockPrismaPasswordHistory.findMany).not.toHaveBeenCalled();
    expect(mockPrismaTeamMember.update).not.toHaveBeenCalled();
  });
});

// =============================================================================
// New test — resetPasswordWithToken: password policy runs before token DB lookup
// =============================================================================

describe('resetPasswordWithToken — password policy enforced', () => {
  it('rejects a weak new password before performing any database lookup', async () => {
    const result = await authService.resetPasswordWithToken(
      'any-valid-looking-token',
      'short', // NOSONAR - intentional weak credential: 5 chars
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('at least 12 characters');
    // validatePasswordStrength runs on line 706, before passwordResetToken.findUnique on line 712
    expect(mockPrismaPasswordResetToken.findUnique).not.toHaveBeenCalled();
  });
});

// =============================================================================
// New tests — loginUser: account lockout after too many failed attempts
// =============================================================================

describe('loginUser — account lockout after failed attempts', () => {
  // Shared user fixture — active, no forced changes, password not expired
  const activeUser = {
    id: 'tm-login',
    email: 'user@test.com',
    passwordHash: 'hashed-password',
    isActive: true,
    mustChangePassword: false,
    passwordChangedAt: new Date(),    // changed today → 0 days → not expired
    tempPasswordExpiresAt: null,
    role: 'owner',
    restaurantGroupId: null,
    restaurantGroup: null,
    restaurantAccess: [],
    firstName: 'Test',
    lastName: 'User',
  };

  it('returns locked-account error when failed attempt count reaches 6', async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue(activeUser);
    mockPrismaAuditLog.count.mockResolvedValue(6);

    const result = await authService.loginUser('user@test.com', 'SomePassword1!');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Account locked');
    // Lockout triggered before password verification
    expect(mockPrismaUserSession.create).not.toHaveBeenCalled();
  });

  it('allows login when failed attempt count is below the lockout threshold of 6', async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue(activeUser);
    mockPrismaAuditLog.count.mockResolvedValue(5);
    mockPrismaUserSession.create.mockResolvedValue({
      id: 'sess-new', token: 'session-token', isActive: true, createdAt: new Date(),
    });
    // 1 active session — well below the 5-session limit, no revocation needed
    mockPrismaUserSession.findMany.mockResolvedValue([
      { id: 'sess-new', createdAt: new Date() },
    ]);

    const result = await authService.loginUser('user@test.com', 'SomePassword1!');

    expect(result.success).toBe(true);
    expect(result.token).toBe('mock-jwt-token');
  });
});

// =============================================================================
// New test — changePassword: password history prevents reuse of last 4 passwords
// =============================================================================

describe('changePassword — password history check', () => {
  it('rejects a new password that matches one of the last 4 stored password hashes', async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue({
      id: 'tm-hist', passwordHash: 'current-hash',
    });
    // One previous password hash in history
    mockPrismaPasswordHistory.findMany.mockResolvedValue([
      { id: 'ph-1', passwordHash: 'previous-hash', createdAt: new Date() },
    ]);
    // bcrypt.compare mock returns true for all calls (default):
    //   call 1 → verifyPassword(oldPw, 'current-hash')      → true (old pw correct)
    //   call 2 → compare(newPw, 'previous-hash') in history  → true (reuse detected)

    const result = await authService.changePassword(
      'tm-hist',
      'OldPassword1!', // NOSONAR - valid old password
      'NewPassword1!', // NOSONAR - valid strength but reused (bcrypt compare returns true)
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('reuse');
    // History was checked but no hash update or audit log should have been written
    expect(mockPrismaTeamMember.update).not.toHaveBeenCalled();
  });
});

// =============================================================================
// B1 — resetPasswordWithToken: null token handling (token not found / already used)
// =============================================================================

describe('resetPasswordWithToken — null token handling', () => {
  it('returns error when token does not exist in database', async () => {
    // findUnique returns null — token hash not found
    mockPrismaPasswordResetToken.findUnique.mockResolvedValue(null);

    const result = await authService.resetPasswordWithToken(
      'nonexistent-token-value',
      'ValidPassword1!', // NOSONAR - valid strength so we reach the DB lookup
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid or expired reset link. Please request a new one.');
    // Must NOT throw a TypeError when resetToken is null
    expect(mockPrismaTeamMember.update).not.toHaveBeenCalled();
  });

  it('returns error when token has already been used', async () => {
    // findUnique returns a token record with usedAt set (already consumed)
    mockPrismaPasswordResetToken.findUnique.mockResolvedValue({
      id: 'prt-1',
      token: 'hashed-token',
      teamMemberId: 'tm-reset',
      usedAt: new Date('2026-03-10T00:00:00Z'),
      expiresAt: new Date('2026-04-01T00:00:00Z'),
      createdAt: new Date(),
      teamMember: { id: 'tm-reset', isActive: true },
    });

    const result = await authService.resetPasswordWithToken(
      'already-used-token-value',
      'ValidPassword1!', // NOSONAR - valid strength so we reach the DB lookup
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid or expired reset link. Please request a new one.');
    // Password should NOT have been updated
    expect(mockPrismaTeamMember.update).not.toHaveBeenCalled();
  });
});

// =============================================================================
// B5 — loginUser: MFA enrollment enforcement for privileged roles
// =============================================================================

describe('loginUser — MFA enrollment enforcement for privileged roles', () => {
  // Base member factory — reusable across tests
  const baseMember = (overrides: Record<string, unknown> = {}) => ({
    id: 'tm-mfa',
    email: 'admin@test.com',
    passwordHash: 'hashed-password',
    isActive: true,
    mustChangePassword: false,
    passwordChangedAt: new Date(),
    tempPasswordExpiresAt: null,
    mfaEnabled: false,
    mfaGraceDeadline: null,
    role: 'owner',
    restaurantGroupId: null,
    restaurantGroup: null,
    restaurantAccess: [],
    restaurantId: null,
    firstName: 'Admin',
    lastName: 'User',
    ...overrides,
  });

  it('sets mfaGraceDeadline and returns mfaEnrollmentRequired when admin has no MFA', async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue(baseMember());
    mockPrismaTeamMember.update.mockResolvedValue({});
    mockPrismaUserSession.create.mockResolvedValue({
      id: 'sess-mfa-1', token: 'session-token', isActive: true, createdAt: new Date(),
    });
    mockPrismaUserSession.findMany.mockResolvedValue([
      { id: 'sess-mfa-1', createdAt: new Date() },
    ]);

    const result = await authService.loginUser('admin@test.com', 'SomePassword1!');

    expect(result.success).toBe(true);
    expect(result.mfaEnrollmentRequired).toBe(true);
    expect(result.mfaGraceDeadline).toBeDefined();
    // Verify the grace deadline was persisted via teamMember.update
    expect(mockPrismaTeamMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tm-mfa' },
        data: expect.objectContaining({ mfaGraceDeadline: expect.any(Date) }),
      }),
    );
  });

  it('blocks login when grace period has expired', async () => {
    const pastDeadline = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
    mockPrismaTeamMember.findUnique.mockResolvedValue(
      baseMember({ mfaGraceDeadline: pastDeadline }),
    );

    const result = await authService.loginUser('admin@test.com', 'SomePassword1!');

    expect(result.success).toBe(false);
    expect(result.error).toBe('MFA_ENROLLMENT_REQUIRED');
    // No session should have been created
    expect(mockPrismaUserSession.create).not.toHaveBeenCalled();
  });

  it('allows login within grace period and returns enrollment flag', async () => {
    const futureDeadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now
    mockPrismaTeamMember.findUnique.mockResolvedValue(
      baseMember({ mfaGraceDeadline: futureDeadline }),
    );
    mockPrismaUserSession.create.mockResolvedValue({
      id: 'sess-mfa-2', token: 'session-token', isActive: true, createdAt: new Date(),
    });
    mockPrismaUserSession.findMany.mockResolvedValue([
      { id: 'sess-mfa-2', createdAt: new Date() },
    ]);

    const result = await authService.loginUser('admin@test.com', 'SomePassword1!');

    expect(result.success).toBe(true);
    expect(result.mfaEnrollmentRequired).toBe(true);
    expect(result.mfaGraceDeadline).toBe(futureDeadline.toISOString());
  });

  it('does not require MFA enrollment for staff role', async () => {
    mockPrismaTeamMember.findUnique.mockResolvedValue(
      baseMember({ role: 'staff', mfaEnabled: false, mfaGraceDeadline: null }),
    );
    mockPrismaUserSession.create.mockResolvedValue({
      id: 'sess-mfa-3', token: 'session-token', isActive: true, createdAt: new Date(),
    });
    mockPrismaUserSession.findMany.mockResolvedValue([
      { id: 'sess-mfa-3', createdAt: new Date() },
    ]);

    const result = await authService.loginUser('staff@test.com', 'SomePassword1!');

    expect(result.success).toBe(true);
    expect(result.mfaEnrollmentRequired).toBeUndefined();
    expect(result.mfaGraceDeadline).toBeUndefined();
  });
});
