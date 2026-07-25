import { test, expect } from '@playwright/test';

test.describe('Benchmark mock workflow proof', () => {
  test('loads benchmark mock and verifies report preview includes trace fields', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Simplified Analysis/i);

    await page.getByTestId('nav-tab-benchmarks').click();
    await expect(page.getByTestId('benchmarks-validation-tab')).toBeVisible();
    await expect(page.getByTestId('benchmark-card-2D-CANT-001')).toBeVisible();

    await page.getByTestId('load-benchmark-2D-CANT-001').click();
    await page.getByTestId('nav-tab-benchmarks').click();
    await expect(page.getByTestId('current-benchmark-mock')).toContainText('2D-CANT-001');

    await page.getByTestId('nav-tab-reports').click();
    await expect(page.getByTestId('reports-tab')).toBeVisible();
    const preview = page.getByTestId('report-preview');
    await expect(preview).toContainText('Method ID: CANTILEVER_END_LOAD');
    await expect(preview).toContainText('Formula ID(s): REPORT_MARKDOWN_CALC_SHEET');
    await expect(preview).toContainText('Unit system: imperial');
    await expect(preview).toContainText('Benchmark status: MOCK_LOADED');
  });
});
