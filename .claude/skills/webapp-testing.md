---
name: e2e-test
description: Run end-to-end flow tests for OrderStack using the Playwright skill. Use when asked to test user flows, verify navigation, check login/onboarding, or validate that pages render correctly. Invoke with /e2e-test or /e2e-test <scenario>.
---

# OrderStack E2E Testing

Uses the `playwright-skill` to test complete user flows in the OrderStack Angular app.

## Prerequisites

- Dev server running: `ng serve --port 4200` (start in background if not running)
- Playwright skill installed at `.claude/skills/playwright-skill/`

## Test Credentials

| Email | Password | Role | Restaurants |
|-------|----------|------|-------------|
| `admin@orderstack.com` | `admin123` | super_admin | 3 (multi-select) |
| `owner@taipa.com` | `owner123` | owner | 1 (auto-select) |
| `manager@taipa.com` | `manager123` | manager | 1 |
| `staff@taipa.com` | `staff123` | staff | 1 |

## How to Run

1. **Detect dev server** using playwright-skill's auto-detection
2. If no server found, start one: `ng serve --port 4200 &` and wait for compilation
3. Write a Playwright test script to `/tmp/orderstack-e2e-*.js`
4. Execute via: `cd .claude/skills/playwright-skill && node run.js /tmp/orderstack-e2e-*.js`
5. Take screenshots at each milestone step
6. Report pass/fail with screenshot paths

## Test Scenarios

### `/e2e-test login` — Basic Login
1. Navigate to `http://localhost:4200/login`
2. Verify login form renders (email input, password input, login button)
3. Enter `owner@taipa.com` / `owner123`
4. Click login
5. Verify redirect away from `/login`
6. Screenshot the landing page

### `/e2e-test onboarding` — Fresh User Onboarding
1. Clear all localStorage
2. Navigate to `/login`
3. Login with `admin@orderstack.com` / `admin123`
4. Should see either `/setup` or `/select-restaurant`
5. If restaurant select: pick first restaurant, verify navigation
6. If setup wizard: verify step 1 renders, walk through steps
7. Screenshot each major step transition

### `/e2e-test restaurant-select` — Multi-Restaurant User
1. Clear localStorage
2. Login with `admin@orderstack.com` / `admin123`
3. Should reach `/select-restaurant`
4. Verify restaurant cards render
5. Click a restaurant
6. Verify navigation to authenticated route
7. Screenshot the restaurant list and landing page

### `/e2e-test page-refresh` — Session Persistence
1. Login with `owner@taipa.com` / `owner123`
2. Navigate to an authenticated page (e.g., `/floor-plan`)
3. Wait for page to fully load
4. Reload the page (F5 / page.reload())
5. Verify same page renders again (not redirected to `/login` or `/setup`)
6. Screenshot before and after refresh

### `/e2e-test floor-plan` — Table Management
1. Login and reach `/floor-plan`
2. Verify floor plan canvas renders
3. Check if tables are displayed (count them)
4. Screenshot the floor plan
5. If "Add Table" button exists, click it
6. Verify modal/form appears
7. Screenshot the add-table form

### `/e2e-test smoke` — Quick Smoke Test (All Critical Routes)
1. Login with `owner@taipa.com` / `owner123`
2. Navigate to each route and verify no blank page / no error:
   - `/orders`
   - `/floor-plan`
   - `/pos`
   - `/kds`
   - `/menu`
   - `/settings`
3. Screenshot each page
4. Report which pages loaded vs which showed errors

### `/e2e-test full` — Complete Flow
Run all scenarios above in sequence. Report summary table at end.

## Failure Handling

When a test step fails:
1. Take a screenshot showing the current state
2. Check browser console for JavaScript errors (use `page.on('console')`)
3. Check for network request failures (use `page.on('requestfailed')`)
4. Do NOT silently skip — report the exact failure
5. Continue to next scenario if possible

## Screenshot Convention

Save screenshots to `/tmp/orderstack-e2e/` with descriptive names:
- `/tmp/orderstack-e2e/01-login-form.png`
- `/tmp/orderstack-e2e/02-after-login.png`
- `/tmp/orderstack-e2e/03-floor-plan.png`
