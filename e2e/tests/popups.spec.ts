import { expect, test } from '@playwright/test';
import { goTab, openApp } from './helpers';

test.use({ viewport: { width: 390, height: 520 } }); // a short phone screen

const blurred = (p: import('@playwright/test').Page) => p.evaluate(() => ({
  content: document.querySelector('.app-content')?.classList.contains('app-blur') ?? false,
  tabbar: document.querySelector('nav[aria-label=Main]')?.classList.contains('app-blur') ?? false,
}));
const inView = async (loc: import('@playwright/test').Locator, p: import('@playwright/test').Page) => {
  const bx = (await loc.boundingBox())!;
  return bx.y >= 0 && bx.y + bx.height <= p.viewportSize()!.height + 0.5;
};

test('popups blur the page, and the New habit form can be filled and saved on a short screen', async ({ page }) => {
  await openApp(page);
  expect(await blurred(page)).toEqual({ content: false, tabbar: false });

  await page.getByRole('button', { name: 'New habit' }).click();
  await page.waitForTimeout(400);
  expect(await blurred(page)).toEqual({ content: true, tabbar: true });
  const create = page.locator('button', { hasText: 'Create habit' });
  expect(await inView(create, page)).toBe(true);                       // pinned footer, no scrolling to find it
  await page.locator('.modal-scroll').first().evaluate((e) => { e.scrollTop = e.scrollHeight; });
  expect(await inView(page.getByText('Color', { exact: true }).first(), page)).toBe(true); // the form scrolls to its end
  await page.getByPlaceholder('Wake up at 05:00', { exact: true }).fill('E2E popup habit');
  await create.click();
  await expect(page.getByText('E2E popup habit').first()).toBeVisible();
  expect(await blurred(page)).toEqual({ content: false, tabbar: false });
});

test('Take a break and Archived blur the page and clear it when closed', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: /Take a break/ }).click();
  await page.waitForTimeout(400);
  expect((await blurred(page)).content).toBe(true);
  await page.locator('.modal-scroll').first().evaluate((e) => { e.scrollTop = e.scrollHeight; });
  expect(await inView(page.getByRole('button', { name: 'Pause', exact: true }), page)).toBe(true);
  await page.locator('[aria-label=Close]').first().click();
  await page.waitForTimeout(300);
  expect((await blurred(page)).content).toBe(false);

  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Archived habits' }).click();
  await page.waitForTimeout(300);
  expect((await blurred(page)).content).toBe(true);
  await page.mouse.click(5, 5);
  await page.waitForTimeout(300);
  expect((await blurred(page)).content).toBe(false);
});

test('the phone top bar stays compact and its menu holds the rest', async ({ page }) => {
  await openApp(page);
  const bar = page.locator('.app-content > div').first();
  expect(await bar.locator('button:visible').count()).toBeLessThanOrEqual(3);
  expect((await bar.boundingBox())!.height).toBeLessThan(50);
  await page.getByRole('button', { name: 'More' }).click();
  const menu = await page.locator('.top-10').innerText();
  expect(menu).toMatch(/take a break/i);
  expect(menu).toMatch(/archived/i);
  expect(menu).toMatch(/theme/i);
  await page.getByRole('button', { name: 'Black', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('pitch-black');
  await goTab(page, 'Today');
});
