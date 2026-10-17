import { expect, test } from '@playwright/test';
import { openApp, openHabit, Touch } from './helpers';

test('summary and numbers show for a measurable habit', async ({ page }) => {
  await openApp(page);
  const dlg = await openHabit(page, 'Reading');
  const text = (await dlg.innerText()).toLowerCase();
  expect(text).toMatch(/all time/);
  expect(text).toMatch(/average/);
});

test('tap a calendar day to skip it, add a note, and pause just this habit', async ({ page }) => {
  await openApp(page);
  const dlg = await openHabit(page, 'Reading');
  const cells = dlg.locator('button[aria-label*=": "]:not([disabled])');
  const target = cells.nth((await cells.count()) - 5);
  const before = await target.getAttribute('aria-label');
  await target.scrollIntoViewIfNeeded();
  await target.click();

  await dlg.getByPlaceholder(/note/i).first().fill('e2e calendar note');
  await dlg.locator('button', { hasText: /^save/i }).first().click();
  await expect(dlg).toContainText('e2e calendar note');          // shows in the notes timeline

  await dlg.locator('button', { hasText: /^skip/i }).first().click();
  await expect.poll(() => target.getAttribute('aria-label')).not.toBe(before);

  const pause = dlg.locator('button', { hasText: /pause this habit/i });
  await pause.scrollIntoViewIfNeeded();
  await pause.click();
  const last = page.getByRole('dialog').last();
  await expect(last).toContainText(/break/i);
  expect(await last.locator('input[type=checkbox]:checked').count()).toBeGreaterThanOrEqual(1);
});

test.describe('pull down to close', () => {
  const sheet = (p: import('@playwright/test').Page) => p.getByRole('dialog', { name: 'Habit details' });

  test('a long pull from the top closes the sheet, a short one springs back', async ({ page }) => {
    await openApp(page);
    const t = await Touch.on(page);
    await openHabit(page, 'Reading');
    await t.drag(195, 300, 195, 340, 6);
    await expect(sheet(page)).toBeVisible();
    await t.drag(195, 300, 195, 560, 12, 16);
    await expect(sheet(page)).toHaveCount(0);
  });

  test('pulling while scrolled down only scrolls', async ({ page }) => {
    await openApp(page);
    const t = await Touch.on(page);
    await openHabit(page, 'Reading');
    await sheet(page).evaluate((e) => { e.scrollTop = 400; });
    await t.drag(195, 300, 195, 420, 8);
    await expect(sheet(page)).toBeVisible();
  });
});
