import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

// Tooltips are drawn by one global layer, so a panel edge can never clip them.
for (const [label, name] of [
  ['hide completed (Today panel)', 'Hide completed habits'],
  ['completion sound (Today panel)', 'Completion sound'],
  ['icon at the screen edge', 'New habit'],
] as const) {
  test(`tooltip "${label}" is fully on screen and goes away`, async ({ page }) => {
    await openApp(page);
    const target = page.getByRole('button', { name });
    await target.scrollIntoViewIfNeeded();
    await target.hover();
    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible();
    const r = (await tip.boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(1280);
    expect(r.y + r.height).toBeLessThanOrEqual(800);
    await page.mouse.move(5, 5);
    await expect(tip).toHaveCount(0);
  });
}
