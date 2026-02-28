import { readFileSync, existsSync } from 'node:fs';

/**
 * Read a secret value. Checks Render secret files first (`/etc/secrets/<name>`),
 * then falls back to `process.env[name]`.
 *
 * Render stores secret files as plaintext at `/etc/secrets/<filename>`.
 * This lets sensitive values stay out of environment variable listings
 * while still working seamlessly in local dev via `.env`.
 */
export function getSecret(name: string): string {
  const filePath = `/etc/secrets/${name}`;
  if (existsSync(filePath)) {
    return readFileSync(filePath, 'utf-8').trim();
  }
  return process.env[name] ?? '';
}
