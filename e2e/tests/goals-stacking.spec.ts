import { expect, test } from '@playwright/test';
import { goTab, openApp } from './helpers';

test('goals: the demo goals show progress, and a new one can be added and removed', async ({ page }) => {
  await openApp(page);
  await goTab(page, 'Stats');
  const goals = page.locator('section.panel', { has: page.locator('.panel-head', { hasText: 'Goals' }) }).first();
  await expect(goals.getByRole('progressbar')).toHaveCount(2);
  await expect(goals).toContainText('Read 1,800 pages');
  await expect(goals).toContainText(/days left/);

  await goals.getByRole('button', { name: '+ New goal' }).click();
  const dlg = page.getByRole('dialog', { name: 'New goal' });
  await dlg.getByLabel('Goal habit').selectOption({ label: 'Gym' });
  await dlg.getByLabel('Goal title').fill('Train 40 times');
  await dlg.getByLabel('Goal target').fill('40');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await expect(goals).toContainText('Train 40 times');
  await expect(goals.getByRole('progressbar')).toHaveCount(3);

  await goals.getByRole('button', { name: 'Goal Train 40 times' }).click();
  await page.getByRole('dialog', { name: 'Edit goal' }).getByRole('button', { name: 'Delete' }).click();
  await expect(goals).not.toContainText('Train 40 times');
  await expect(goals.getByRole('progressbar')).toHaveCount(2);
});

test('goals: a dialog without a title or target says so', async ({ page }) => {
  await openApp(page);
  await goTab(page, 'Stats');
  await page.getByRole('button', { name: '+ New goal' }).click();
  await page.getByRole('dialog', { name: 'New goal' }).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toContainText(/title and a target/);
});

test('stacking: the demo habit sits behind its anchor and says so; the editor offers only valid anchors', async ({ page }) => {
  await openApp(page);
  await goTab(page, 'Habits');
  await page.locator('section.panel button:visible', { hasText: 'Meditation' }).first().click();
  await page.getByRole('dialog', { name: 'Habit details' }).getByRole('button', { name: /edit/i }).first().click();
  const sel = page.getByLabel('Stack after');
  await expect(sel).toHaveValue(/.+/);
  const options = await sel.locator('option').allInnerTexts();
  expect(options).not.toContain('After: Meditation');
  expect(options).not.toContain('After: Social media scrolling'); // a habit to quit can't be an anchor
  await sel.selectOption('');
  await expect(sel).toHaveValue('');
});

test('patterns: the panel explains what data it needs, or shows findings', async ({ page }) => {
  await openApp(page);
  await goTab(page, 'Stats');
  const p = page.locator('section.panel', { has: page.locator('.panel-head', { hasText: 'Patterns' }) }).first();
  await expect(p).toBeVisible();
  await expect.poll(async () => (await p.innerText()).length).toBeGreaterThan(40);
});
