import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test('Today groups habits by time of day', async ({ page }) => {
  await openApp(page);
  const heads = await page.locator('h2', { hasText: /^(Morning|Afternoon|Evening|Anytime)$/ }).allInnerTexts();
  expect(heads.length).toBeGreaterThanOrEqual(2);
});

test('every Today action has an Undo that restores the row', async ({ page }) => {
  await openApp(page);
  const row = page.locator('[data-no-swipe]:visible', { hasText: 'No sugar' }).first(); // a daily yes/no habit
  const before = await row.innerText();
  await row.locator('button').first().click();
  const status = page.getByRole('status');
  await expect(status).toContainText(/marked done|skipped|cleared|updated/);
  await page.getByRole('button', { name: 'Undo', exact: true }).last().click();
  await expect.poll(() => row.innerText()).toBe(before);
  await expect(status).toHaveText('');
});

test('a duration habit reads as time, not minutes', async ({ page }) => {
  await openApp(page);
  const med = page.locator('[data-no-swipe]:visible', { hasText: 'Meditation' }).first();
  const text = await med.innerText();
  expect(text).toMatch(/\d+m|\dh/);
  expect(text).not.toMatch(/\bmin\b/);
});

test.describe('Auto theme', () => {
  test('follows the phone, including a live change', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openApp(page);
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
    expect(await theme()).toBe('forest-dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(theme).toBe('forest-light');
  });
});

test('launcher shortcuts open the right tab', async ({ page }) => {
  await openApp(page, '/?view=stats');
  await expect(page.locator('nav[aria-label=Main] button[aria-current=page]')).toContainText('Stats');
});
