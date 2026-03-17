# SonarQube Fix Plan 4: Error Handling and Logging

Estimated issues resolved: ~104

## S2486 -- Empty Catch Blocks (18 issues, MINOR)

All 18 instances are in `src/app/catering.routes.ts`.

### Lines

242-244, 361-363, 404-406, 473-475, 536-538, 573-575, 663-665, 698-700,
724-726, 758-760, 817-819, 859-861, 903-905, 960-962, 1039-1041

### Fix Strategy

Read the catering routes file to understand the context of each catch block.
For each empty catch:
1. If the error is recoverable and intentionally swallowed, add an explanatory comment
2. If the error should be logged, add `logger.warn()` or `logger.error()`
3. If the error should propagate, remove the try/catch entirely

```typescript
// Before
try {
  await someOperation();
} catch {
  // empty
}

// After (option A: intentional swallow)
try {
  await someOperation();
} catch {
  // Notification failure is non-critical; order processing continues
}

// After (option B: log it)
try {
  await someOperation();
} catch (error: unknown) {
  logger.warn('Notification failed', { error: toErrorMessage(error) });
}
```

---

## S6551 -- Object Stringification (46 issues, MINOR)

Logging or concatenating objects that get stringified as `[object Object]`.

### Files (high concentration)

- src/app/catering.routes.ts (multiple)
- src/app/analytics.routes.ts
- Multiple route and service files

### Fix Strategy

Use `toErrorMessage(error)` from `src/utils/errors.ts` for error objects.
For non-error objects being logged, use structured metadata.

```typescript
// Before
logger.error(`Failed: ${error}`);
console.error('Error:', error);

// After
logger.error('Failed', { error: toErrorMessage(error) });
```

Verify `toErrorMessage()` exists in `src/utils/errors.ts`. If not, create it:

```typescript
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}
```

---

## S5145 -- User-Controlled Data in Logs (40 issues, MINOR)

Logging request parameters, headers, or body content directly.

### Files

- src/services/auth.service.ts:238, 239 (+ 5 instances)
- src/app/team-management.routes.ts:580
- Many additional route files

### Fix Strategy

Sanitize or redact user-controlled data before logging. For IDs and non-sensitive
fields, logging is acceptable but should use structured metadata rather than
string interpolation.

```typescript
// Before
logger.info(`User login: ${req.body.email}`);
logger.error(`Failed for user ${req.params.userId}: ${error}`);

// After (sanitize email)
logger.info('User login attempt', { email: sanitizeEmail(req.body.email) });

// After (IDs are generally safe but use structured logging)
logger.error('Operation failed', {
  userId: req.params.userId,
  error: toErrorMessage(error)
});
```

For S5145, SonarCloud specifically flags data flowing from `req.params`, `req.body`,
`req.query`, or `req.headers` into log statements. The fix is either:
1. Use structured logging metadata (Winston handles this safely)
2. Sanitize/truncate the values
3. For truly non-sensitive identifiers (UUIDs), mark with `// NOSONAR` if the logging is intentional

---

## Execution Notes

- Start with catering.routes.ts (highest concentration of S2486 and S6551)
- Verify `toErrorMessage()` utility exists before using it across files
- S5145 fixes require judgment -- some logging of request data is necessary for debugging
- Run `npm run build` after changes to verify no type errors
- Run `npm test` to verify no behavioral regressions
