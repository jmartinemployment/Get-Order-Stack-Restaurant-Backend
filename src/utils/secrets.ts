import { readFileSync } from 'node:fs';
import { logger } from './logger';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Read a secret value.
 *
 * Production: Render Secret Files at `/etc/secrets/<name>`.
 * Localhost: environment variable of the same name.
 *
 * No fallback between the two — each environment uses exactly one source.
 */
export function getSecret(name: string): string {
  if (isProduction) {
    try {
      return readFileSync(`/etc/secrets/${name}`, 'utf-8').trim();
    } catch {
      logger.error(`[Secrets] ${name} not found at /etc/secrets/${name}`);
      return '';
    }
  }

  return process.env[name] ?? '';
}
