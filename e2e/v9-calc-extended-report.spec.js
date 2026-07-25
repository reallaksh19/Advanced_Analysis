import { test, expect } from '@playwright/test';
import { openApp, openSimplifiedAnalysis, openReports } from './helpers/appNavigation.js';
import { expectNoDemoReport } from './helpers/reportAssertions.js';

test.describe('V9 calc extended report', () => {
  test('reports tab shows no active report before calculation', async ({ page }) => {
    await openApp(page);
    await openReports(page);
    await expectNoDemoReport(page);
    await expect(page.getByTestId('no-active-report')).toBeVisible();
  });
});
