# SonarQube Fix Plan 5: Cognitive Complexity (S3776)

Estimated issues resolved: ~33

## Overview

All 33 CRITICAL issues are S3776 -- functions exceeding the cognitive complexity
limit of 15. These require extracting helper functions to reduce nesting and
branching within individual route handlers.

## Issues by Severity (complexity score)

### Extreme (50+)
| File | Line | Score | Context |
|------|------|-------|---------|
| src/app/app.routes.ts | 1285 | 108 | Largest offender -- likely a massive route handler |
| src/app/catering.routes.ts | 248 | 49 | Catering order processing |

### High (30-39)
| File | Line | Score |
|------|------|-------|
| src/app/onboarding.routes.ts | 443 | 35 |
| scripts/seed-jays-catering.ts | 816 | 43 |
| src/validators/dining.validator.ts | 77 | 38 |
| scripts/seed-transactions.ts | 50 | 37 |

### Medium (20-29)
| File | Line | Score |
|------|------|-------|
| src/app/app.routes.ts | 573 | 32 |
| scripts/seed-inventory.ts | 58 | 30 |
| scripts/migrate-delivery-provider-profiles.ts | 149 | 28 |
| src/app/labor.routes.ts | 1575 | 28 |
| src/app/multi-location.routes.ts | 563 | 26 |
| src/app/team-management.routes.ts | 248 | 25 |
| src/app/public-menu.routes.ts | 23 | 25 |
| src/app/food-cost.routes.ts | 620 | 24 |
| scripts/migrate-delivery-provider-profiles.ts | 232 | 23 |

### Low (16-19)
| File | Line | Score |
|------|------|-------|
| src/jobs/milestone-reminders.ts | 29 | 20 |
| src/app/onboarding.routes.ts | 291 | 19 |
| src/app/multi-location.routes.ts | 420 | 19 |
| scripts/seed-auth.ts | 22 | 19 |
| src/app/app.routes.ts | 475 | 16 |

### Remaining (from truncated CRITICAL list, issues 23-38)
Additional instances across route files and scripts -- to be identified by
reading each file and searching for complex functions.

## Refactoring Strategy

### Step 1: Identify the function boundaries

For each flagged line, read the file and find the full function. Determine what
the function does and where complexity comes from (nested if/else, try/catch,
loops with conditions, switch statements).

### Step 2: Extract helper functions

Common extraction patterns:

**A) Validation extraction:**
```typescript
// Before (inside route handler)
if (!body.name) return res.status(400).json({ error: 'Name required' });
if (!body.email) return res.status(400).json({ error: 'Email required' });
if (body.email && !emailRegex.exec(body.email)) return res.status(400).json({ error: 'Invalid email' });
// ... 10 more validations

// After
function validateCreateRequest(body: unknown): string | null {
  if (!body.name) return 'Name required';
  if (!body.email) return 'Email required';
  // ...
  return null;
}

// In handler:
const validationError = validateCreateRequest(req.body);
if (validationError) return res.status(400).json({ error: validationError });
```

**B) Data transformation extraction:**
```typescript
// Before (nested mapping/filtering inside handler)
const results = items.map(item => {
  if (item.type === 'A') {
    // 20 lines of transformation
  } else if (item.type === 'B') {
    // 15 lines of transformation
  }
});

// After
function transformItem(item: Item): TransformedItem {
  if (item.type === 'A') { ... }
  if (item.type === 'B') { ... }
}
const results = items.map(transformItem);
```

**C) Early return simplification:**
```typescript
// Before
if (condition1) {
  if (condition2) {
    if (condition3) {
      // actual work
    } else {
      return error3;
    }
  } else {
    return error2;
  }
} else {
  return error1;
}

// After (guard clauses)
if (!condition1) return error1;
if (!condition2) return error2;
if (!condition3) return error3;
// actual work
```

### Step 3: Place helpers appropriately

- If the helper is specific to one route file, place it in the same file above
  the route handler (not nested inside it)
- If the helper is reused across routes, place it in a relevant service file
- Seed script helpers stay in the same script file

## Priority Order

1. src/app/app.routes.ts:1285 (score 108) -- highest impact
2. src/app/catering.routes.ts:248 (score 49)
3. scripts/seed-jays-catering.ts:816 (score 43)
4. src/validators/dining.validator.ts:77 (score 38)
5. scripts/seed-transactions.ts:50 (score 37)
6. src/app/onboarding.routes.ts:443 (score 35)
7. src/app/app.routes.ts:573 (score 32)
8. Remaining in descending order of score

## Execution Notes

- Each function must be read and understood before refactoring
- Extracted helpers must preserve exact behavior -- no logic changes
- The app.routes.ts:1285 handler (score 108) will likely need 5+ helper extractions
- Run `npm run build` after each file to catch type errors immediately
- Run `npm test` after all changes to verify no regressions
- Some script files (seed-*.ts) may not have tests -- verify by running the script
