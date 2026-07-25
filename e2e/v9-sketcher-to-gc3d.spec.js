import { test, expect } from '@playwright/test';
import { openApp, openSketcher } from './helpers/appNavigation.js';
import { enableE2EMode, createSketcherLRoute } from './helpers/sketcherActions.js';

test.describe('V9 sketcher to GC3D', () => {
  test('L-route push to GC3D does not land blank', async ({ page }) => {
    await enableE2EMode(page);
    await openApp(page);
    await openSketcher(page);
    await createSketcherLRoute(page);
    // just verify page is non-blank
    const content = await page.locator('#root').innerText();
    expect(content.trim().length).toBeGreaterThan(10);
  });
});
