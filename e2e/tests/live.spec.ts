import { expect, test } from '@playwright/test';

// Runs only when E2E_BASE_URL points at a deployed stack (see the "live" project). It signs up a
// throwaway account through the real UI and deletes it afterwards.
const password = 'e2e-password-1234';

test('sign up, track a habit, get a calendar feed link, delete the account', async ({ page, request }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Register' }).first().click();
  await page.locator('input:not([type=email]):not([type=password])').first().fill('E2E Tester');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  // first-run checklist, then an empty Today
  const welcome = page.getByRole('dialog', { name: 'Welcome to OpenHabit' });
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: /skip for now/i }).click();
  await expect(page.getByText('Nothing to track yet')).toBeVisible();

  // add a habit and tick it
  await page.getByRole('button', { name: 'New habit' }).click();
  await page.getByPlaceholder('Wake up at 05:00', { exact: true }).fill('Live habit');
  await page.locator('button', { hasText: 'Create habit' }).click();
  const row = page.locator('[data-no-swipe]', { hasText: 'Live habit' }).first();
  await row.locator('button').first().click();
  await expect(page.getByRole('status')).toContainText('marked done');
  await page.reload();
  await expect(page.locator('[data-no-swipe]', { hasText: 'Live habit' }).first()).toBeVisible();

  // calendar feed link
  await page.getByRole('button', { name: 'Account' }).click();
  await page.locator('button', { hasText: 'Calendar feed' }).click();
  const link = await page.locator('code').first().innerText();
  const feed = await request.get(link);
  expect(feed.status()).toBe(200);
  expect(await feed.text()).toContain('SUMMARY:Live habit');

  // clean up
  const token = await page.evaluate(() => localStorage.getItem('openhabit.token'));
  const del = await request.delete(new URL('/api/auth/me', link).href, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, data: { password },
  });
  expect(del.status()).toBe(204);
});
