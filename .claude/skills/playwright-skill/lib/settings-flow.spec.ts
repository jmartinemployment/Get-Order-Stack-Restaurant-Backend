import { test, expect } from '@playwright/test';

test('User can successfully add a new KDS station', async ({ page }) => {
  await page.goto('http://localhost:4200/settings');

  // Verify initial state
  await expect(page.getByText('No stations configured')).toBeVisible();

  // Click Add Station
  await page.getByRole('button', { name: /add station/i }).click();

  // Fill out the modal
  await page.getByLabel('Station Name').fill('Main Kitchen Expo');
  await page.getByRole('button', { name: /confirm/i }).click();

  // Verify the new station appears in the list
  await expect(page.getByText('Main Kitchen Expo')).toBeVisible();
});
