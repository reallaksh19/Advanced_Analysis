import { test, expect } from '@playwright/test';
import { openApp, openSketcher, assertNoBlankRoute } from './helpers/appNavigation.js';
import { enableE2EMode, createSketcherLRoute, analyzeSketcher2D } from './helpers/sketcherActions.js';

test.describe('V9 sketcher to 2D', () => {
  test('L-route analyze 2D does not produce blank route', async ({ page }) => {
    await enableE2EMode(page);
    await openApp(page);
    await openSketcher(page);
    await createSketcherLRoute(page);
    await analyzeSketcher2D(page);
    await assertNoBlankRoute(page);
  });
});
