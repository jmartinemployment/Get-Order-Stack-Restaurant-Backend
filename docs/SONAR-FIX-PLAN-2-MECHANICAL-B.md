# SonarQube Fix Plan 2: Mechanical Fixes B

Estimated issues resolved: ~60

## S6582 -- Optional Chaining (27 issues, MAJOR)

Replace `foo && foo.bar` with `foo?.bar`.

### Files

- src/app/public-menu.routes.ts:47
- src/app/auth.routes.ts:157, 186, 220
- src/services/auth.service.ts:299, 507
- src/app/labor.routes.ts:1457, 1588
- src/middleware/auth.middleware.ts:27, 61, 237, 257
- src/utils/device-code.ts:28
- src/app/food-cost.routes.ts:301
- src/services/marketplace.service.ts:561, 570, 714, 732, 750, 1049, 1323
- src/app/order-actions.routes.ts:39, 142
- src/services/delivery.service.ts:514, 532
- src/services/loyalty.service.ts:155
- src/services/socket.service.ts:189

### Fix Pattern

```typescript
// Before
if (user && user.role) { ... }
const name = obj && obj.name;

// After
if (user?.role) { ... }
const name = obj?.name;
```

---

## S3358 -- Nested Ternaries (22 issues, MAJOR)

Extract nested ternary operations into independent statements.

### Files

- scripts/seed-jays-catering.ts:863
- src/app/analytics.routes.ts:2031, 2072, 2118
- src/app/subscription.routes.ts:52, 101
- src/services/marketplace.service.ts:1495-1497
- src/services/course-pacing.service.ts:76
- src/app/app.routes.ts:1359, 1495, 1498
- src/utils/order-enrichment.ts:93-95
- scripts/marketplace-pilot-gate-report.ts:135-137
- scripts/seed-orders.ts:79, 83, 108, 176
- src/services/menu-engineering.service.ts:285
- src/services/sales-insights.service.ts:415, 450, 451, 452

### Fix Pattern

```typescript
// Before
const result = a ? b : c ? d : e;

// After
const intermediate = c ? d : e;
const result = a ? b : intermediate;
```

---

## S3923 -- Same Value Both Branches (4 issues, MAJOR)

Remove conditionals that return the same value in both branches.

### Files

- src/services/delivery.service.ts:92, 138, 171, 220

### Fix Pattern

```typescript
// Before
const val = condition ? 'same' : 'same';

// After
const val = 'same';
```

---

## S2933 -- Mark Members Readonly (3 issues, MAJOR)

Add `readonly` to private members that are never reassigned.

### Files

- src/utils/star-line-mode.ts:14 (buffer)
- src/services/translation.service.ts:21 (apiKey), 22 (baseUrl)

### Fix Pattern

```typescript
// Before
private buffer: string[] = [];

// After
private readonly buffer: string[] = [];
```

---

## S1854 -- Useless Assignments (4 issues, MAJOR)

Remove or consolidate dead assignments.

### Files

- src/app/team-management.routes.ts:292 (tm)
- src/app/onboarding.routes.ts:393 (paymentProcessor)
- src/app/multi-location.routes.ts:360 (sourceCatMap)
- src/services/sales-insights.service.ts:331 (ordersChangePercent)

### Fix Pattern

Review each case -- either remove the variable entirely or use it downstream.

---

## Remaining Minor Rules

### S7772 (6 issues, MINOR)
Specific pattern from SonarCloud -- check each instance.

### S7723 (4 issues, MINOR)
Specific pattern from SonarCloud -- check each instance.

### S2871 (1 issue, CRITICAL)
src/app/analytics.routes.ts:216 -- Provide compare function to `.sort()`.

### S4043 (1 issue, MAJOR)
src/services/menu-engineering.service.ts:236 -- Use `.includes()` instead of `.indexOf() !== -1`.

### S7770 (1), S7744 (1), S7750 (1), S7758 (1), S6606 (1), S6635 (1), S6861 (1)
Single instances -- fix individually during this workstream.

---

## Execution Notes

- Optional chaining and ternary extraction are safe refactors
- S3923 (same value both branches) needs careful review -- the condition may have side effects
- S1854 (useless assignments) -- verify the variable is truly unused before removing
- Run `npm run build` and `npm test` after all changes
