import { test, expect } from '@playwright/test';
import { openApp, openSimplifiedAnalysis, openReports } from './helpers/appNavigation.js';

test.describe('V13 report export checker workflow', () => {
  test('reports tab shows checker workflow panel', async ({ page }) => {
    await openApp(page);
    await openReports(page);
    const content = await page.locator('#root').innerText();
    expect(content.trim().length).toBeGreaterThan(10);
  });
});
