# SonarQube Fix Plan 3: Test and Script Fixes

Estimated issues resolved: ~55

## S2068 -- Hardcoded Passwords (31 issues, BLOCKER)

All 31 blockers are hardcoded password strings in test fixtures and seed scripts.

### Files and Lines

**Test fixtures:**
- src/test/fixtures.ts:17, 29, 54, 79
- src/services/auth.service.test.ts:57, 81, 103
- src/app/auth.routes.integration.test.ts:81, 88, 98, 104, 112, 125, 133, 144, 309 (x2), 314 (x2), 320, 327, 333, 339
- src/app/onboarding.routes.integration.test.ts:243, 280

**Seed/utility scripts:**
- scripts/seed-auth.ts:60, 61, 62, 63
- scripts/create-test-user.ts:8
- scripts/debug-user.ts:8

### Fix Strategy

Extract all test passwords to a shared constant in the test fixtures file, then reference it everywhere. For seed scripts, use environment variables with fallback defaults.

```typescript
// src/test/fixtures.ts -- add at top
const TEST_PASSWORD = 'Test1234!';

// Then replace all inline password strings with TEST_PASSWORD

// scripts/seed-auth.ts
const seedPassword = process.env.SEED_PASSWORD ?? 'Test1234!';
```

SonarCloud S2068 flags string literals that look like passwords (variables named `password`, `passwd`, `pwd`, etc. assigned string literals). The fix is to either:
1. Use a constant (not flagged if the variable name is not password-like)
2. Use `process.env` references
3. Add `// NOSONAR` on lines where test passwords are intentionally hardcoded

For test files, the pragmatic approach is `// NOSONAR` comments since these ARE intentional test credentials, not real secrets.

---

## S7785 -- Top-Level Await (20 issues, MAJOR)

Replace async IIFE or `.then()` chains with top-level `await` in scripts.

### Files

- scripts/seed-jays-catering.ts:1172
- scripts/seed-transactions.ts:212
- scripts/marketplace-pilot-gate-report.ts:239
- scripts/migrate-delivery-provider-profiles.ts:367
- scripts/verify-marketplace-phase5.ts:693
- scripts/seed-auth.ts:226
- scripts/seed-customers.ts:117
- scripts/seed-demo-data.ts:95
- scripts/seed-inventory.ts:144
- scripts/seed-orders.ts:281
- scripts/seed-reservations.ts:235
- scripts/seed-tables.ts:82
- scripts/seed-primary-categories.ts:190
- scripts/seed-taipa.ts:332
- scripts/update-menu-images.ts:205
- scripts/verify-menu.ts:63
- scripts/backup-data.ts:109
- scripts/create-test-user.ts:48
- scripts/debug-user.ts:39
- scripts/restore-data.ts:270

### Fix Pattern

```typescript
// Before
async function main() {
  // ...
}
main().catch(console.error);

// After
// top-level await (file must be ESM or run via tsx)
try {
  // ... (body of former main())
} catch (error: unknown) {
  logger.error('Script failed', { error: toErrorMessage(error) });
  process.exit(1);
}
```

**Note:** These scripts run via `tsx` which supports top-level await. Verify tsconfig has `"module": "ESNext"` or similar.

---

## plsql:VarcharUsageCheck (4 issues, MAJOR)

### File

- prisma/migrations/20260121150000_add_primary_categories/migration.sql:5-8

### Fix

These are Prisma-generated migration files using `VARCHAR`. SonarCloud flags them because it has a PL/SQL rule expecting `VARCHAR2` (Oracle convention). Since we use PostgreSQL, `VARCHAR` is correct.

**Resolution:** Mark as false positive in SonarCloud, or exclude `prisma/migrations/` from analysis. Do NOT modify migration files -- they are immutable history.

---

## Execution Notes

- S2068 fixes should use `// NOSONAR` for test files (intentional test data)
- S7785 requires verifying each script still runs correctly after conversion
- Migration SQL files should NOT be modified -- configure SonarCloud exclusion
- Run `npm test` after S2068 changes to verify test behavior unchanged
- Run each modified seed script to verify it still works
