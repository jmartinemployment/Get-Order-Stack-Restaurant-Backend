/**
 * Security alert service — PCI DSS 10.6.3
 *
 * In-memory sliding window tracker that detects suspicious patterns
 * and emits SECURITY_ALERT logs for real-time monitoring.
 */
import { logger } from '../utils/logger';

interface WindowEntry {
  timestamp: number;
  key: string;
}

const LOGIN_FAILED_WINDOW: WindowEntry[] = [];
const PASSWORD_RESET_WINDOW: WindowEntry[] = [];
const MFA_FAILED_WINDOW: WindowEntry[] = [];

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

function pruneWindow(window: WindowEntry[], maxAge: number): void {
  const cutoff = Date.now() - maxAge;
  while (window.length > 0 && window[0].timestamp < cutoff) {
    window.shift();
  }
}

function countByKey(window: WindowEntry[], key: string): number {
  return window.filter(e => e.key === key).length;
}

function uniqueKeys(window: WindowEntry[], filterKey: string): number {
  const keys = new Set(window.filter(e => e.key.endsWith(`:${filterKey}`)).map(e => e.key.split(':')[0]));
  return keys.size;
}

/**
 * Track a login failure. Alerts when:
 * - 5+ failures from the same IP in 15 minutes
 */
export function trackLoginFailed(ip: string, email: string): void {
  pruneWindow(LOGIN_FAILED_WINDOW, FIFTEEN_MIN_MS);
  LOGIN_FAILED_WINDOW.push({ timestamp: Date.now(), key: ip });

  const ipCount = countByKey(LOGIN_FAILED_WINDOW, ip);
  if (ipCount >= 5) {
    logger.error('[SECURITY_ALERT] Brute force detected', {
      alertType: 'brute_force',
      ip,
      email,
      failedAttempts: ipCount,
      windowMinutes: 15,
    });
  }
}

/**
 * Track an account lockout event. Always alerts.
 */
export function trackAccountLocked(email: string, ip?: string): void {
  logger.error('[SECURITY_ALERT] Account locked', {
    alertType: 'account_locked',
    email,
    ip,
  });
}

/**
 * Track a password reset request. Alerts when:
 * - 3+ requests from different IPs for the same email in 1 hour
 */
export function trackPasswordResetRequest(ip: string, email: string): void {
  pruneWindow(PASSWORD_RESET_WINDOW, ONE_HOUR_MS);
  PASSWORD_RESET_WINDOW.push({ timestamp: Date.now(), key: `${ip}:${email}` });

  const distinctIps = uniqueKeys(PASSWORD_RESET_WINDOW, email);
  if (distinctIps >= 3) {
    logger.error('[SECURITY_ALERT] Suspicious password reset pattern', {
      alertType: 'password_reset_abuse',
      email,
      distinctIps,
      windowMinutes: 60,
    });
  }
}

/**
 * Track an MFA verification failure after successful login. Always alerts.
 */
export function trackMfaFailed(userId: string, ip?: string): void {
  pruneWindow(MFA_FAILED_WINDOW, FIFTEEN_MIN_MS);
  MFA_FAILED_WINDOW.push({ timestamp: Date.now(), key: userId });

  const failCount = countByKey(MFA_FAILED_WINDOW, userId);
  logger.error('[SECURITY_ALERT] MFA verification failed', {
    alertType: 'mfa_failed',
    userId,
    ip,
    recentFailures: failCount,
  });
}
