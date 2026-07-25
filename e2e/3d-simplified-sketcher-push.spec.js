import { test, expect } from '@playwright/test';
import minimalPipeRun from './fixtures/3d-simplified/minimal-sketcher-pipe-run.json' with { type: 'json' };

function countSupportsFromFixture(sketcher) {
  return Object.values(sketcher.nodes || {}).filter((node) =>
    ['anchor', 'support'].includes(String(node.type || '').toLowerCase())
  ).length;
}

test.describe('Slice C — 2D Sketcher push to 3D Simplified Calculation', () => {
  test('pushes a named sketcher fixture into the 3D Simplified model contract', async ({ page }) => {
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
    }, minimalPipeRun);

    await expect(page.getByTestId('sketcher-push-to-3d-simplified')).toBeVisible();

    await page.getByTestId('sketcher-push-to-3d-simplified').click();

    await expect(page.getByTestId('3d-simplified-analysis-tab')).toBeVisible();

    await expect(
      page.getByRole('heading', { name: '3D Simplified Calculation' })
    ).toBeVisible();

    const expectedNodes = Object.keys(minimalPipeRun.sketcher.nodes).length;
    const expectedSegments = minimalPipeRun.sketcher.segments.length;
    const expectedSupports = countSupportsFromFixture(minimalPipeRun.sketcher);

    const summary = page.getByTestId('3d-simplified-imported-model-summary');

    await expect(summary).toContainText(`Nodes: ${expectedNodes}`);
    await expect(summary).toContainText(`Segments: ${expectedSegments}`);
    await expect(summary).toContainText(`Supports: ${expectedSupports}`);

    await expect(page.getByTestId('3d-simplified-model-validation-status')).toContainText(
      minimalPipeRun.expected.validationStatus
    );

    await expect(page.getByTestId('3d-simplified-model-contract-json')).toContainText(
      '3d-simplified-model-v1'
    );
  });
});