import { test, expect } from '@playwright/test';
import supportLoadFixture from './fixtures/3d-simplified/support-load-simple-run.json' with { type: 'json' };

test.describe('Slice E — 3D Simplified support loads', () => {
  test('calculates deterministic support loads from a named Sketcher fixture', async ({ page }) => {
    await page.addInitScript(() => {
      window.__SIMPLIFIED_ANALYSIS_E2E__ = true;
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-sketcher').click();

    await page.waitForFunction(() =>
      Boolean(window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__)
    );

    await page.evaluate((fixture) => {
      const store = window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__;

      store.setState({
        nodes: fixture.sketcher.nodes,
        segments: fixture.sketcher.segments,
        workingPlane: fixture.sketcher.workingPlane,
        workingElevation: fixture.sketcher.workingElevation,
        designTemperature: fixture.sketcher.designTemperature
      });
    }, supportLoadFixture);

    await page.getByTestId('sketcher-push-to-3d-simplified').click();

    await expect(page.getByTestId('3d-simplified-analysis-tab')).toBeVisible();
    await expect(page.getByRole('heading', { name: '3D Simplified Calculation' })).toBeVisible();

    await expect(page.getByTestId('3d-simplified-model-validation-status')).toContainText(
      supportLoadFixture.expected.validationStatus
    );

    const supportSummary = page.getByTestId('3d-simplified-support-load-summary');

    await expect(supportSummary).toContainText(
      `Support-load method: ${supportLoadFixture.expected.methodId}`
    );
    await expect(supportSummary).toContainText(
      `Total weight N: ${supportLoadFixture.expected.totalWeight_N}`
    );
    await expect(supportSummary).toContainText(
      `Total reaction N: ${supportLoadFixture.expected.totalReaction_N}`
    );
    await expect(supportSummary).toContainText(
      `Imbalance N: ${supportLoadFixture.expected.imbalance_N}`
    );

    const supportTable = page.getByTestId('3d-simplified-support-load-table');

    await expect(supportTable).toContainText('SUP-A');
    await expect(supportTable).toContainText('SUP-B');
    await expect(supportTable).toContainText(String(supportLoadFixture.expected.supportReaction_N));
    await expect(supportTable).toContainText(String(supportLoadFixture.expected.supportReaction_kgf));

    const contractJson = page.getByTestId('3d-simplified-model-contract-json');
    await expect(contractJson).toContainText('supportLoadSummary');
  });
});
