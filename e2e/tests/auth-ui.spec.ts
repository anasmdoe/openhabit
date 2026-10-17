import { expect, test, type Page } from '@playwright/test';

// The sign-in, forgot-password and reset screens against a stubbed API: they appear only when a
// backend answers, so /api is mocked here. The real endpoints are covered by scripts/smoke-test.js.
async function stubApi(page: Page, opts: { mail: boolean }) {
  const calls: { path: string; body: unknown }[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    const body = route.request().postData() ? JSON.parse(route.request().postData()!) : undefined;
    const json = (status: number, data: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (path === '/auth/config') return json(200, { registration: true, mail: opts.mail, oidc: { enabled: false } });
    if (path === '/auth/forgot' || path === '/auth/reset') { calls.push({ path, body }); return path === '/auth/reset' && body.password === 'bad' ? json(400, { error: 'this link is invalid or has expired: request a new one' }) : json(200, { ok: true }); }
    if (path === '/auth/verify') { calls.push({ path, body }); return json(200, { ok: true }); }
    return json(401, { error: 'unauthorized' });
  });
  return calls;
}

test('forgot password: link only when email is set up, then a neutral confirmation', async ({ page }) => {
  const calls = await stubApi(page, { mail: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.locator('input[type=email]').fill('someone@example.com');
  await page.getByRole('button', { name: 'Email me a reset link' }).click();
  await expect(page.getByText(/reset link is on its way/)).toBeVisible();
  expect(calls).toContainEqual({ path: '/auth/forgot', body: { email: 'someone@example.com' } });
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('no forgot-password link when the server has no email set up', async ({ page }) => {
  await stubApi(page, { mail: false });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Forgot password?' })).toHaveCount(0);
});

test('reset link: choose a new password, mismatch and expired link are explained', async ({ page }) => {
  const calls = await stubApi(page, { mail: true });
  await page.goto('/?reset=abcdefghijklmnopqrstuvwxyz0123456789');
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  const [pw, again] = await page.locator('input[type=password]').all();
  await pw.fill('a-new-password-2'); await again.fill('different-password');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('alert')).toContainText(/do not match/);

  await pw.fill('bad'.padEnd(8, 'x')); await again.fill('bad'.padEnd(8, 'x'));
  await pw.fill('bad'); await again.fill('bad');
  await page.evaluate(() => document.querySelector('form')?.setAttribute('novalidate', ''));
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('alert')).toContainText(/invalid or has expired/);

  await pw.fill('a-new-password-2'); await again.fill('a-new-password-2');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText(/Password changed/)).toBeVisible();
  expect(calls.at(-1)).toEqual({ path: '/auth/reset', body: { token: 'abcdefghijklmnopqrstuvwxyz0123456789', password: 'a-new-password-2' } });
  await page.getByRole('button', { name: 'Continue to sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('verification link: confirms and removes the token from the address bar', async ({ page }) => {
  const calls = await stubApi(page, { mail: true });
  await page.goto('/?verify=abcdefghijklmnopqrstuvwxyz0123456789');
  await expect(page.getByText(/Email confirmed/)).toBeVisible();
  expect(calls).toContainEqual({ path: '/auth/verify', body: { token: 'abcdefghijklmnopqrstuvwxyz0123456789' } });
  await expect(page).toHaveURL(/\/$/);
});
