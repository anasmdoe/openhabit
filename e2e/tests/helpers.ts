import { expect, type CDPSession, type Page } from '@playwright/test';

export const tabBar = (p: Page) => p.locator('nav[aria-label=Main]');
export const goTab = async (p: Page, name: string) => {
  await tabBar(p).locator('button', { hasText: name }).click();
  await p.waitForTimeout(350);
};
export const currentTab = async (p: Page) => (await tabBar(p).locator('button[aria-current=page]').innerText()).trim();

/** Opens the app (demo mode) and waits until the Today list is on screen. */
export async function openApp(p: Page, path = '/') {
  await p.goto(path);
  await expect(p.locator('.app-content')).toBeVisible();
  await p.waitForTimeout(800);
}

/** Opens the habit window of a demo habit from the Habits tab. */
export async function openHabit(p: Page, name: string) {
  await goTab(p, 'Habits');
  await p.locator('section.panel button:visible', { hasText: name }).first().click();
  const dlg = p.getByRole('dialog', { name: 'Habit details' });
  await expect(dlg).toBeVisible();
  await p.waitForTimeout(500);
  return dlg;
}

/** Real touch gestures through the DevTools protocol (Playwright has no touch-drag API). */
export class Touch {
  private constructor(private p: Page, private cdp: CDPSession) {}
  static async on(p: Page) { return new Touch(p, await p.context().newCDPSession(p)); }
  private send(type: string, x: number, y: number) {
    return this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  }
  async drag(x0: number, y0: number, x1: number, y1: number, steps = 8, stepMs = 12, release = true) {
    await this.send('touchStart', x0, y0);
    for (let i = 1; i <= steps; i++) {
      await this.send('touchMove', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
      await this.p.waitForTimeout(stepMs);
    }
    if (release) await this.send('touchEnd', 0, 0);
    await this.p.waitForTimeout(450);
  }
}
