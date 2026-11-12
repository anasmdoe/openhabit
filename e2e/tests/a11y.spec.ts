import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { goTab, openApp, openHabit } from './helpers';

// WCAG 2 A/AA plus axe best practices, in every theme. Fails on any violation.
const scan = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'best-practice']).analyze();
  return violations.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}`);
};

for (const theme of ['forest-dark', 'forest-light', 'pitch-black']) {
  test(`no accessibility violations in ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => { localStorage.setItem('openhabit.theme', t); }, theme);
    await openApp(page);
    expect(await scan(page), 'Today').toEqual([]);
    for (const tab of ['Habits', 'Stats']) {
      await goTab(page, tab);
      expect(await scan(page), tab).toEqual([]);
    }
    if (theme === 'forest-dark') {
      await openHabit(page, 'Reading');
      expect(await scan(page), 'habit window').toEqual([]);
    }
  });
}

test('no violations in the New habit form, the ⋯ menu and Take a break', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'New habit' }).click();
  await page.waitForTimeout(400);
  expect(await scan(page), 'editor').toEqual([]);
  await page.locator('[aria-label=Close]').first().click();
  await page.getByRole('button', { name: 'More' }).click();
  expect(await scan(page), 'menu').toEqual([]);
  await page.getByRole('menuitem', { name: /Take a break/ }).click();
  await page.waitForTimeout(400);
  expect(await scan(page), 'pause').toEqual([]);
});
