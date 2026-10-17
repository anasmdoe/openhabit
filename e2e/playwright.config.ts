import { defineConfig } from '@playwright/test';

// E2E_BASE_URL unset: build the frontend (cd frontend && npm run build) and the config serves it with
// `vite preview`; the app runs in demo mode (data in the browser, no backend).
// E2E_BASE_URL=https://your-deployment: also runs the "live" project against that stack.
const live = process.env.E2E_BASE_URL;
const local = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'results/junit.xml' }]] : 'list',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: live ? undefined : {
    command: 'npm --prefix ../frontend run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: local,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'phone',
      testIgnore: ['**/live.spec.ts', '**/desktop.spec.ts'],
      use: { baseURL: local, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'desktop',
      testMatch: ['**/desktop.spec.ts'],
      use: { baseURL: local, viewport: { width: 1280, height: 800 } },
    },
    ...(live ? [{
      name: 'live',
      testMatch: ['**/live.spec.ts'],
      use: { baseURL: live, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    }] : []),
  ],
});
