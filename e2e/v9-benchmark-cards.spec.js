import { test, expect } from '@playwright/test';
import { openApp, openBenchmarks } from './helpers/appNavigation.js';

test.describe('V9 benchmark cards', () => {
  test('benchmark tab opens if available', async ({ page }) => {
    await openApp(page);
    const benchTab = page.getByTestId('nav-tab-benchmarks');
    if (await benchTab.count()) {
      await openBenchmarks(page);
      const content = await page.locator('#root').innerText();
      expect(content.trim().length).toBeGreaterThan(10);
    } else {
      test.skip();
    }
  });
});
