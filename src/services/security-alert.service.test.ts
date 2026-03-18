/**
 * Coverage scope: src/services/security-alert.service.ts
 *
 * Tests:
 *   - trackLoginFailed: threshold boundary (4 = no alert, 5 = alert, 6+ = alert),
 *     window pruning after 15 minutes, independent IP tracking
 *   - trackAccountLocked: always alerts, with and without IP
 *   - trackPasswordResetRequest: threshold boundary (2 distinct IPs = no alert,
 *     3 = alert), same IP repeated does not inflate count, window pruning after
 *     1 hour, independent email tracking
 *   - trackMfaFailed: always alerts with correct failCount, window pruning,
 *     independent userId tracking
 *
 * Mocking:
 *   - ../utils/logger → logger.error as vi.fn()
 *   - vi.useFakeTimers() for window expiration tests
 *   - vi.resetModules() + dynamic import to clear in-memory arrays between groups
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '../utils/logger';

const mockedError = logger.error as ReturnType<typeof vi.fn>;

// Helper: dynamically reimport the module to get fresh in-memory arrays
async function freshImport() {
  vi.resetModules();

  // Re-register the logger mock so the new module import picks it up
  vi.doMock('../utils/logger', () => ({
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: mockedError,
    },
  }));

  return await import('./security-alert.service');
}

// ─── trackLoginFailed ───────────────────────────────────────────────────────

describe('trackLoginFailed', () => {
  let trackLoginFailed: typeof import('./security-alert.service').trackLoginFailed;

  beforeEach(async () => {
    vi.useFakeTimers();
    mockedError.mockClear();
    const mod = await freshImport();
    trackLoginFailed = mod.trackLoginFailed;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not alert when failures are below threshold (4 from same IP)', () => {
    for (let i = 0; i < 4; i++) {
      trackLoginFailed('192.168.1.1', 'user@test.com');
    }
    expect(mockedError).not.toHaveBeenCalled();
  });

  it('triggers alert when exactly 5 login failures from same IP in 15 minutes', () => {
    for (let i = 0; i < 5; i++) {
      trackLoginFailed('10.0.0.1', 'user@test.com');
    }
    expect(mockedError).toHaveBeenCalledTimes(1);
    expect(mockedError).toHaveBeenCalledWith('[SECURITY_ALERT] Brute force detected', {
      alertType: 'brute_force',
      ip: '10.0.0.1',
      email: 'user@test.com',
      failedAttempts: 5,
      windowMinutes: 15,
    });
  });

  it('continues alerting on every call after threshold is exceeded', () => {
    for (let i = 0; i < 7; i++) {
      trackLoginFailed('10.0.0.1', 'user@test.com');
    }
    // Calls 5, 6, 7 should each trigger an alert = 3 total
    expect(mockedError).toHaveBeenCalledTimes(3);
    expect(mockedError).toHaveBeenLastCalledWith('[SECURITY_ALERT] Brute force detected', expect.objectContaining({
      failedAttempts: 7,
    }));
  });

  it('tracks different IPs independently', () => {
    for (let i = 0; i < 4; i++) {
      trackLoginFailed('192.168.1.1', 'a@test.com');
    }
    for (let i = 0; i < 4; i++) {
      trackLoginFailed('192.168.1.2', 'b@test.com');
    }
    // Neither IP has reached 5
    expect(mockedError).not.toHaveBeenCalled();
  });

  it('one IP reaching threshold does not affect another IP count', () => {
    for (let i = 0; i < 5; i++) {
      trackLoginFailed('10.0.0.1', 'a@test.com');
    }
    expect(mockedError).toHaveBeenCalledTimes(1);
    // Second IP still below threshold
    trackLoginFailed('10.0.0.2', 'b@test.com');
    expect(mockedError).toHaveBeenCalledTimes(1); // no additional alert
  });

  it('prunes entries older than 15 minutes so they do not count toward threshold', () => {
    // 4 failures now
    for (let i = 0; i < 4; i++) {
      trackLoginFailed('10.0.0.1', 'user@test.com');
    }
    expect(mockedError).not.toHaveBeenCalled();

    // Advance past the 15-minute window
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);

    // 1 more failure — old 4 should be pruned, total is now 1
    trackLoginFailed('10.0.0.1', 'user@test.com');
    expect(mockedError).not.toHaveBeenCalled();
  });

  it('entries just inside the 15-minute window still count', () => {
    // 4 failures at time 0
    for (let i = 0; i < 4; i++) {
      trackLoginFailed('10.0.0.1', 'user@test.com');
    }

    // Advance to just under 15 minutes
    vi.advanceTimersByTime(15 * 60 * 1000 - 1);

    // 5th failure — old entries are still within window
    trackLoginFailed('10.0.0.1', 'user@test.com');
    expect(mockedError).toHaveBeenCalledTimes(1);
    expect(mockedError).toHaveBeenCalledWith('[SECURITY_ALERT] Brute force detected', expect.objectContaining({
      failedAttempts: 5,
    }));
  });

  it('passes the email from the triggering call in the alert', () => {
    for (let i = 0; i < 4; i++) {
      trackLoginFailed('10.0.0.1', 'old@test.com');
    }
    trackLoginFailed('10.0.0.1', 'latest@test.com');
    expect(mockedError).toHaveBeenCalledWith('[SECURITY_ALERT] Brute force detected', expect.objectContaining({
      email: 'latest@test.com',
    }));
  });
});

// ─── trackAccountLocked ─────────────────────────────────────────────────────

describe('trackAccountLocked', () => {
  let trackAccountLocked: typeof import('./security-alert.service').trackAccountLocked;

  beforeEach(async () => {
    mockedError.mockClear();
    const mod = await freshImport();
    trackAccountLocked = mod.trackAccountLocked;
  });

  it('always alerts with email and ip', () => {
    trackAccountLocked('user@test.com', '10.0.0.1');
    expect(mockedError).toHaveBeenCalledTimes(1);
    expect(mockedError).toHaveBeenCalledWith('[SECURITY_ALERT] Account locked', {
      alertType: 'account_locked',
      email: 'user@test.com',
      ip: '10.0.0.1',
    });
  });

  it('alerts when ip is undefined', () => {
    trackAccountLocked('user@test.com');
    expect(mockedError).toHaveBeenCalledTimes(1);
    expect(mockedError).toHaveBeenCalledWith('[SECURITY_ALERT] Account locked', {
      alertType: 'account_locked',
      email: 'user@test.com',
      ip: undefined,
    });
  });

  it('alerts on every call — no deduplication', () => {
    trackAccountLocked('a@test.com', '1.1.1.1');
    trackAccountLocked('a@test.com', '1.1.1.1');
    trackAccountLocked('b@test.com', '2.2.2.2');
    expect(mockedError).toHaveBeenCalledTimes(3);
  });
});

// ─── trackPasswordResetRequest ──────────────────────────────────────────────

describe('trackPasswordResetRequest', () => {
  let trackPasswordResetRequest: typeof import('./security-alert.service').trackPasswordResetRequest;

  beforeEach(async () => {
    vi.useFakeTimers();
    mockedError.mockClear();
    const mod = await freshImport();
    trackPasswordResetRequest = mod.trackPasswordResetRequest;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not alert when fewer than 3 distinct IPs request reset for same email', () => {
    trackPasswordResetRequest('10.0.0.1', 'target@test.com');
    trackPasswordResetRequest('10.0.0.2', 'target@test.com');
    expect(mockedError).not.toHaveBeenCalled();
  });

  it('triggers alert when 3 distinct IPs request reset for same email within 1 hour', () => {
    trackPasswordResetRequest('10.0.0.1', 'target@test.com');
    trackPasswordResetRequest('10.0.0.2', 'target@test.com');
    trackPasswordResetRequest('10.0.0.3', 'target@test.com');
    expect(mockedError).toHaveBeenCalledTimes(1);
    expect(mockedError).toHaveBeenCalledWith('[SECURITY_ALERT] Suspicious password reset pattern', {
      alertType: 'password_reset_abuse',
      email: 'target@test.com',
      distinctIps: 3,
      windowMinutes: 60,
    });
  });

  it('continues alerting when more than 3 distinct IPs request reset', () => {
    trackPasswordResetRequest('10.0.0.1', 'target@test.com');
    trackPasswordResetRequest('10.0.0.2', 'target@test.com');
    trackPasswordResetRequest('10.0.0.3', 'target@test.com');
    trackPasswordResetRequest('10.0.0.4', 'target@test.com');
    // Alert on 3rd and 4th call
    expect(mockedError).toHaveBeenCalledTimes(2);
    expect(mockedError).toHaveBeenLastCalledWith('[SECURITY_ALERT] Suspicious password reset pattern', expect.objectContaining({
      distinctIps: 4,
    }));
  });

  it('repeated requests from the same IP do not inflate the distinct IP count', () => {
    trackPasswordResetRequest('10.0.0.1', 'target@test.com');
    trackPasswordResetRequest('10.0.0.1', 'target@test.com');
    trackPasswordResetRequest('10.0.0.1', 'target@test.com');
    trackPasswordResetRequest('10.0.0.2', 'target@test.com');
    // Only 2 distinct IPs — no alert
    expect(mockedError).not.toHaveBeenCalled();
  });

  it('tracks different emails independently', () => {
    trackPasswordResetRequest('10.0.0.1', 'alice@test.com');
    trackPasswordResetRequest('10.0.0.2', 'alice@test.com');
    trackPasswordResetRequest('10.0.0.1', 'bob@test.com');
    trackPasswordResetRequest('10.0.0.2', 'bob@test.com');
    // 2 distinct IPs per email — neither reaches 3
    expect(mockedError).not.toHaveBeenCalled();
  });

  it('one email reaching threshold does not trigger alert for another email', () => {
    trackPasswordResetRequest('10.0.0.1', 'alice@test.com');
    trackPasswordResetRequest('10.0.0.2', 'alice@test.com');
    trackPasswordResetRequest('10.0.0.3', 'alice@test.com');
    expect(mockedError).toHaveBeenCalledTimes(1);
    expect(mockedError).toHaveBeenCalledWith('[SECURITY_ALERT] Suspicious password reset pattern', expect.objectContaining({
      email: 'alice@test.com',
    }));

    mockedError.mockClear();

    // bob still at 0
    trackPasswordResetRequest('10.0.0.4', 'bob@test.com');
    expect(mockedError).not.toHaveBeenCalled();
  });

  it('prunes entries older than 1 hour so they do not count toward threshold', () => {
    trackPasswordResetRequest('10.0.0.1', 'target@test.com');
    trackPasswordResetRequest('10.0.0.2', 'target@test.com');
    expect(mockedError).not.toHaveBeenCalled();

    // Advance past the 1-hour window
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    // 3rd distinct IP — but the first 2 are pruned, so only 1 distinct IP now
    trackPasswordResetRequest('10.0.0.3', 'target@test.com');
    expect(mockedError).not.toHaveBeenCalled();
  });

  it('entries just inside the 1-hour window still count toward threshold', () => {
    trackPasswordResetRequest('10.0.0.1', 'target@test.com');
    trackPasswordResetRequest('10.0.0.2', 'target@test.com');

    // Advance to just under 1 hour
    vi.advanceTimersByTime(60 * 60 * 1000 - 1);

    trackPasswordResetRequest('10.0.0.3', 'target@test.com');
    expect(mockedError).toHaveBeenCalledTimes(1);
    expect(mockedError).toHaveBeenCalledWith('[SECURITY_ALERT] Suspicious password reset pattern', expect.objectContaining({
      distinctIps: 3,
    }));
  });
});

// ─── trackMfaFailed ─────────────────────────────────────────────────────────

describe('trackMfaFailed', () => {
  let trackMfaFailed: typeof import('./security-alert.service').trackMfaFailed;

  beforeEach(async () => {
    vi.useFakeTimers();
    mockedError.mockClear();
    const mod = await freshImport();
    trackMfaFailed = mod.trackMfaFailed;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('always alerts on every call with correct recentFailures count', () => {
    trackMfaFailed('user-1', '10.0.0.1');
    expect(mockedError).toHaveBeenCalledTimes(1);
    expect(mockedError).toHaveBeenCalledWith('[SECURITY_ALERT] MFA verification failed', {
      alertType: 'mfa_failed',
      userId: 'user-1',
      ip: '10.0.0.1',
      recentFailures: 1,
    });
  });

  it('increments recentFailures on consecutive calls for same userId', () => {
    trackMfaFailed('user-1', '10.0.0.1');
    trackMfaFailed('user-1', '10.0.0.1');
    trackMfaFailed('user-1', '10.0.0.1');
    expect(mockedError).toHaveBeenCalledTimes(3);
    expect(mockedError).toHaveBeenLastCalledWith('[SECURITY_ALERT] MFA verification failed', expect.objectContaining({
      recentFailures: 3,
    }));
  });

  it('alerts when ip is undefined', () => {
    trackMfaFailed('user-1');
    expect(mockedError).toHaveBeenCalledWith('[SECURITY_ALERT] MFA verification failed', {
      alertType: 'mfa_failed',
      userId: 'user-1',
      ip: undefined,
      recentFailures: 1,
    });
  });

  it('tracks different userIds independently', () => {
    trackMfaFailed('user-1', '10.0.0.1');
    trackMfaFailed('user-2', '10.0.0.2');
    trackMfaFailed('user-1', '10.0.0.1');

    expect(mockedError).toHaveBeenCalledTimes(3);
    // 3rd call is user-1's 2nd failure
    expect(mockedError).toHaveBeenLastCalledWith('[SECURITY_ALERT] MFA verification failed', expect.objectContaining({
      userId: 'user-1',
      recentFailures: 2,
    }));
  });

  it('prunes entries older than 15 minutes so recentFailures resets', () => {
    trackMfaFailed('user-1', '10.0.0.1');
    trackMfaFailed('user-1', '10.0.0.1');
    expect(mockedError).toHaveBeenCalledTimes(2);

    // Advance past the 15-minute window
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);

    trackMfaFailed('user-1', '10.0.0.1');
    expect(mockedError).toHaveBeenCalledTimes(3);
    // Old 2 entries pruned — this is failure #1 in a fresh window
    expect(mockedError).toHaveBeenLastCalledWith('[SECURITY_ALERT] MFA verification failed', expect.objectContaining({
      recentFailures: 1,
    }));
  });

  it('entries just inside the 15-minute window still count', () => {
    trackMfaFailed('user-1', '10.0.0.1');

    // Advance to just under 15 minutes
    vi.advanceTimersByTime(15 * 60 * 1000 - 1);

    trackMfaFailed('user-1', '10.0.0.1');
    expect(mockedError).toHaveBeenLastCalledWith('[SECURITY_ALERT] MFA verification failed', expect.objectContaining({
      recentFailures: 2,
    }));
  });
});
