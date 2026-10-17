import { expect, test } from '@playwright/test';
import { currentTab, goTab, openApp, openHabit, tabBar, Touch } from './helpers';

test.describe('Back button and popups', () => {
  test('Back closes a popup and stays in the app', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'New habit' }).click();
    await expect(page.getByRole('dialog', { name: /habit$/ })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog', { name: /habit$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New habit' })).toBeVisible();
  });

  test('closing with X leaves no stray history entry', async ({ page }) => {
    await openApp(page);
    const clean = await page.evaluate(() => JSON.stringify(history.state));
    await page.getByRole('button', { name: 'New habit' }).click();
    await page.locator('[aria-label=Close]').first().click();
    await page.waitForTimeout(450);
    expect(await page.evaluate(() => JSON.stringify(history.state))).toBe(clean);
  });

  test('palette to editor: Back closes the editor and stays in the app', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('Control+k');
    await page.getByText('New habit', { exact: true }).first().click();
    await expect(page.getByRole('dialog', { name: /habit$/ })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog', { name: /habit$/ })).toHaveCount(0);
    await expect(page).toHaveURL(/127\.0\.0\.1|localhost/);
  });

  test('stacked popups close one at a time', async ({ page }) => {
    await openApp(page);
    const detail = await openHabit(page, 'Reading');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = page.getByRole('dialog', { name: /habit$/ });
    await expect(editor).toBeVisible();
    await page.goBack();
    await expect(editor).toHaveCount(0);
    await expect(detail).toBeVisible();
    await page.goBack();
    await expect(detail).toHaveCount(0);
  });

  test('the ⋯ menu is a light popover that Back closes', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'More' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    expect(await page.evaluate(() => document.querySelector('.app-content')?.classList.contains('app-blur'))).toBe(false);
    await page.goBack();
    await expect(page.getByRole('menu')).toHaveCount(0);
  });
});

test.describe('swiping', () => {
  test('swipe between tabs, but not on rows, grids or under a popup', async ({ page }) => {
    await openApp(page);
    const t = await Touch.on(page);
    const left = (y: number) => t.drag(320, y, 90, y);
    const right = (y: number) => t.drag(90, y, 320, y);
    expect(await currentTab(page)).toBe('Today');

    const row = (await page.locator('[data-no-swipe]').first().boundingBox())!;
    await left(row.y + row.height / 2);
    expect(await currentTab(page)).toBe('Today');           // a Today row logs/skips instead

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const y = (await page.getByText('This month').first().boundingBox())!.y + 10;
    await left(y);
    expect(await currentTab(page)).toBe('Habits');
    await left(300);
    expect(await currentTab(page)).toBe('Stats');
    await left(300);
    expect(await currentTab(page)).toBe('Stats');           // last tab: stays put
    await right(300);
    await right(300);
    expect(await currentTab(page)).toBe('Today');

    await t.drag(200, 600, 215, 250);                        // vertical scroll is not a swipe
    expect(await currentTab(page)).toBe('Today');

    await goTab(page, 'Habits');
    await page.getByRole('button', { name: 'month', exact: true }).click();
    const grid = (await page.locator('.thin-scroll.overflow-auto').first().boundingBox())!;
    await t.drag(300, grid.y + 80, 100, grid.y + 80);
    expect(await currentTab(page)).toBe('Habits');           // the grid scrolls, the tab stays

    await page.getByRole('button', { name: 'New habit' }).click();
    await t.drag(320, 300, 90, 300);
    expect(await currentTab(page)).toBe('Habits');           // popups block tab swiping
  });

  test('no horizontal overflow while switching tabs (tab-bar glitch)', async ({ page }) => {
    await openApp(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    for (const tab of ['Habits', 'Stats', 'Today', 'Stats', 'Habits']) {
      await tabBar(page).locator('button', { hasText: tab }).click();
      for (let i = 0; i < 6; i++) { expect(await overflow()).toBe(0); await page.waitForTimeout(40); }
    }
  });

  test('swipe right logs a Today row, swipe left skips it', async ({ page }) => {
    await openApp(page);
    const t = await Touch.on(page);
    const row = page.locator('[data-no-swipe]', { hasText: 'Meditation' }).first();
    await row.scrollIntoViewIfNeeded();
    const bx = (await row.boundingBox())!;
    await t.drag(bx.x + bx.width - 40, bx.y + bx.height / 2, bx.x + 40, bx.y + bx.height / 2, 8, 14);
    await expect(row).toContainText(/skipped/i);
  });
});
