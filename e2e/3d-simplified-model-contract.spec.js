import { test, expect } from '@playwright/test';

test.describe('Slice B — 3D Simplified model contract', () => {
  test('shows normalized model contract summary and validation status', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-3d-analysis').click();

    await expect(page.getByTestId('3d-simplified-analysis-tab')).toBeVisible();
    await expect(page.getByTestId('3d-simplified-model-contract-panel')).toBeVisible();

    await expect(page.getByTestId('3d-simplified-imported-model-summary')).toContainText('Nodes:');
    await expect(page.getByTestId('3d-simplified-imported-model-summary')).toContainText('Segments:');
    await expect(page.getByTestId('3d-simplified-imported-model-summary')).toContainText('Components:');
    await expect(page.getByTestId('3d-simplified-imported-model-summary')).toContainText('Supports:');

    await expect(page.getByTestId('3d-simplified-model-validation-status')).toBeVisible();
    await expect(page.getByTestId('3d-simplified-model-contract-json')).toContainText('3d-simplified-model-v1');
  });
});
