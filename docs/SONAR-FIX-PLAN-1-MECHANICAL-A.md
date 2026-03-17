# SonarQube Fix Plan 1: Mechanical Fixes A

Estimated issues resolved: ~132

## S7748 -- Zero Fractions (64 issues, MINOR)

Remove `.00` from number literals (e.g., `1850.00` -> `1850`).

### Files

- scripts/seed-transactions.ts (multiple)
- scripts/seed-inventory.ts (multiple)
- src/app/app.routes.integration.test.ts
- src/app/analytics.routes.integration.test.ts
- src/app/check.routes.integration.test.ts
- src/test/fixtures.ts
- src/app/ai-admin.routes.integration.test.ts

### Fix Pattern

```typescript
// Before
const price = 1850.00;
const tax = 0.00;

// After
const price = 1850;
const tax = 0;
```

---

## S7781 -- Use .at() (12 issues, MINOR)

Replace `arr[arr.length - 1]` with `arr.at(-1)`.

### Fix Pattern

```typescript
// Before
const last = items[items.length - 1];

// After
const last = items.at(-1);
```

---

## S1128 -- Unused Imports (10 issues, MINOR)

Remove unused import statements.

### Files

- src/app/combo.routes.integration.test.ts (tokens)
- src/app/gift-card.routes.integration.test.ts (GIFT_CARD)
- src/app/auth.routes.integration.test.ts (tokens, SESSION)
- Additional files from SonarCloud report

### Fix Pattern

Delete the unused import line or remove the unused symbol from a multi-import.

---

## S4325 -- Unnecessary Type Assertions (22 issues, MINOR)

Remove `as Type` or `!` when the type already matches.

### Files

- src/app/auth.routes.integration.test.ts (15+ instances, lines 39-267)
- Additional files from SonarCloud report

### Fix Pattern

```typescript
// Before
const user = result as User;  // result is already User

// After
const user = result;
```

---

## S7735 -- Negated Conditions (24 issues, MINOR)

Swap if/else branches to use positive condition first.

### Files

- src/app/catering.routes.ts (lines 292-294, 624-626)
- scripts/seed-inventory.ts (line 93)
- src/app/analytics.routes.ts (line 689)
- Additional files from SonarCloud report

### Fix Pattern

```typescript
// Before
if (!isValid) {
  handleInvalid();
} else {
  handleValid();
}

// After
if (isValid) {
  handleValid();
} else {
  handleInvalid();
}
```

---

## Execution Notes

- All fixes are mechanical find-and-replace or simple restructuring
- No logic changes, no new helper functions needed
- Run `npm run build` after to verify no type errors introduced
- Run `npm test` to verify no behavioral changes
