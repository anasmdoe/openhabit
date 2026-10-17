import { expect, test } from '@playwright/test';
import { goTab, openApp } from './helpers';

test('recap, calendar, year in pixels and customize', async ({ page }) => {
  await openApp(page);
  await goTab(page, 'Stats');
  const text = () => page.locator('.app-content').innerText();
  await expect.poll(async () => /recap/i.test(await text()) && /pts? vs the 7/.test(await text())).toBe(true);
  await page.getByRole('button', { name: 'Month', exact: true }).first().click();
  await expect.poll(text).toMatch(/last 30 days/);

  const cal = page.locator('section', { hasText: 'Calendar' }).first();
  await cal.locator('button[aria-label^="20"]:not([disabled])').first().click();
  await expect.poll(async () => /of \d+ done/.test(await cal.innerText())).toBe(true);
  await cal.getByRole('button', { name: 'Previous month' }).click();
  await page.waitForTimeout(500);

  const px = page.locator('section', { hasText: 'in pixels' }).first();
  await px.locator('button[aria-label*="mood "][aria-label*=" of 5"]').first().click();
  await expect.poll(async () => /\(\d\/5\)/.test(await px.innerText())).toBe(true);

  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  await page.getByRole('button', { name: 'Move Insights up' }).click();
  await page.getByRole('button', { name: 'Shown', exact: true }).last().click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(text).not.toMatch(/Completion by sleep/);
  await page.reload();
  await goTab(page, 'Stats');
  await expect.poll(text).not.toMatch(/Completion by sleep/);   // survives a reload
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(text).toMatch(/insights/i);
});
