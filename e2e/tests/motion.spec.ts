import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openApp } from './helpers';

// Smooth motion: things glide instead of jump. These run with motion allowed (the default), and the
// last test checks that "reduce motion" turns it all off.

const hideCompleted = (p: Page) => p.getByRole('button', { name: 'Hide completed habits' });
// "No sugar" is a daily yes/no habit. The demo data may already have it done today, so make sure it is open first.
const sugar = (p: Page) => p.locator('[data-no-swipe]:visible:not([inert])', { hasText: 'No sugar' }).first();
async function ensureOpen(p: Page) {
  if (await sugar(p).locator('button[aria-pressed="true"]').count()) await sugar(p).locator('button[aria-pressed]').click();
  await expect(sugar(p).locator('button[aria-pressed="false"]')).toBeVisible();
}
const tick = (p: Page) => sugar(p).locator('button[aria-pressed="false"]').click();

/** y positions of an element sampled every ~30 ms for `ms`. */
async function sampleY(p: Page, loc: ReturnType<Page['locator']>, ms: number) {
  const ys: number[] = [];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    ys.push((await loc.boundingBox())!.y);
    await p.waitForTimeout(30);
  }
  return ys;
}

test('completing a habit with "hide completed" on: the row fades out and what is below glides up', async ({ page }) => {
  await openApp(page);
  await ensureOpen(page);
  await hideCompleted(page).click();
  const below = page.getByText('This month', { exact: true }).first(); // a stat card under the Today panel
  const y0 = (await below.boundingBox())!.y;

  // tick an open habit
  await tick(page);

  // right away the row is still there, marked as leaving and not clickable
  await expect(page.locator('[data-no-swipe].row-out[inert]')).toHaveCount(1);
  const ys = await sampleY(page, below, 900);
  const final = ys[ys.length - 1];
  expect(final).toBeLessThan(y0 - 20);                          // it did move up
  const between = ys.filter((y) => y < y0 - 2 && y > final + 2);
  expect(between.length).toBeGreaterThanOrEqual(2);              // ...through intermediate positions, not in one jump
  expect(ys.every((y, i) => i === 0 || y <= ys[i - 1] + 0.5)).toBe(true); // never backwards
  await expect(page.locator('[data-no-swipe].row-out')).toHaveCount(0);   // and the ghost is gone
});

test('undo brings the row back with an entrance, not a pop', async ({ page }) => {
  await openApp(page);
  await ensureOpen(page);
  await hideCompleted(page).click();
  const name = 'No sugar';
  await tick(page);
  await expect(page.locator('[data-no-swipe].row-out')).toHaveCount(0, { timeout: 3000 });
  await page.getByRole('button', { name: 'Undo', exact: true }).last().click();
  await expect(page.locator('[data-no-swipe].row-in', { hasText: name })).toHaveCount(1);
  await expect(page.locator('[data-no-swipe]:visible', { hasText: name }).first()).toBeVisible();
});

test('stat numbers ease to their new value instead of snapping', async ({ page }) => {
  await openApp(page);
  await ensureOpen(page);
  const today = page.locator('section', { has: page.locator('.panel-head', { hasText: /^Today$/ }) }).first();
  const read = async () => parseInt((await today.locator('.num').first().innerText()).replace(/\D/g, ''), 10);
  const start = await read();
  await tick(page);
  const seen = new Set<number>();
  const end = Date.now() + 1200;
  while (Date.now() < end) { seen.add(await read()); await page.waitForTimeout(25); }
  expect(seen.size).toBeGreaterThanOrEqual(3);                   // start, at least one in-between, and the end
  expect([...seen].some((v) => v > start)).toBe(true);
});

test('chart bars grow into place', async ({ page }) => {
  await openApp(page);
  const bar = page.locator('svg .bar-rect').first();
  await expect(bar).toBeVisible();
  // the transform settles to a real, positive vertical scale
  await expect.poll(() => bar.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).d)).toBeGreaterThan(0.01);
});

test('a popup is marked closing, ignores clicks while it fades, then is removed', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: /Take a break/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Take a break' });
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.backdrop[data-closing]')).toHaveCount(1);
  expect(await page.locator('.backdrop[data-closing]').evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none');
  await expect(dlg).toBeHidden({ timeout: 2000 });
});

test.describe('reduce motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('rows leave and numbers change at once, with no ghost row', async ({ page }) => {
    await openApp(page);
    await ensureOpen(page);
    await hideCompleted(page).click();
    const before = await page.locator('[data-no-swipe]:visible').count();
    await tick(page);
    await expect(page.locator('[data-no-swipe]:visible')).toHaveCount(before - 1, { timeout: 400 });
    await expect(page.locator('.row-out')).toHaveCount(0);
  });
});
