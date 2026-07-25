import { test, expect } from '@playwright/test';

test.describe('Slice A — 3D Simplified Calculation navigation', () => {
  test('opens the existing 3D analysis module as 3D Simplified Calculation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-3d-analysis').click();

    await expect(page.getByTestId('3d-simplified-analysis-tab')).toBeVisible();
    await expect(page.getByRole('heading', { name: '3D Simplified Calculation' })).toBeVisible();

    await expect(page.getByTestId('3d-simplified-color-mode')).toBeVisible();
    await expect(page.getByTestId('3d-simplified-include-sif')).toBeVisible();
    await expect(page.getByTestId('3d-simplified-results-panel')).toBeVisible();
  });
});