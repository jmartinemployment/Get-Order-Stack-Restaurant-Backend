/**
 * Safely converts an unknown caught value into a human-readable string.
 *
 * Avoids `[object Object]` — the root cause of SonarCloud rule S6551.
 * Use this everywhere you would otherwise write:
 *   `error instanceof Error ? error.message : String(error)`
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}
