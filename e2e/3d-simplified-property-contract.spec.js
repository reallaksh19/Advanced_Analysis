import { test, expect } from '@playwright/test';
import propertyFixture from './fixtures/3d-simplified/sketcher-property-contract-run.json' with { type: 'json' };

test.describe('Slice D — 3D Simplified property contract', () => {
  test('transfers named Sketcher engineering properties into the 3D Simplified model contract', async ({ page }) => {
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
    }, propertyFixture);

    await page.getByTestId('sketcher-push-to-3d-simplified').click();

    await expect(page.getByTestId('3d-simplified-analysis-tab')).toBeVisible();
    await expect(page.getByRole('heading', { name: '3D Simplified Calculation' })).toBeVisible();

    const summary = page.getByTestId('3d-simplified-imported-model-summary');
    await expect(summary).toContainText(`Nodes: ${propertyFixture.expected.nodes}`);
    await expect(summary).toContainText(`Segments: ${propertyFixture.expected.segments}`);
    await expect(summary).toContainText(`Supports: ${propertyFixture.expected.supports}`);

    await expect(page.getByTestId('3d-simplified-model-validation-status')).toContainText(
      propertyFixture.expected.validationStatus
    );

    const propertySummary = page.getByTestId('3d-simplified-property-contract-summary');

    await expect(propertySummary).toContainText(`Pipe segments: ${propertyFixture.expected.pipeSegments}`);
    await expect(propertySummary).toContainText(`Component segments: ${propertyFixture.expected.componentSegments}`);
    await expect(propertySummary).toContainText(`Materials: ${propertyFixture.expected.material}`);
    await expect(propertySummary).toContainText(`Schedules: ${propertyFixture.expected.schedule}`);
    await expect(propertySummary).toContainText(`Ratings: ${propertyFixture.expected.rating}`);
    await expect(propertySummary).toContainText(
      `Fluid density assigned: ${propertyFixture.expected.segmentsWithFluidDensity}`
    );
    await expect(propertySummary).toContainText(
      `Insulation assigned: ${propertyFixture.expected.segmentsWithInsulation}`
    );
    await expect(propertySummary).toContainText(
      `Component weights assigned: ${propertyFixture.expected.segmentsWithComponentWeight}`
    );

    const contractJson = page.getByTestId('3d-simplified-model-contract-json');
    await expect(contractJson).toContainText('3d-simplified-model-v1');
    await expect(contractJson).toContainText('propertySummary');
    await expect(contractJson).toContainText(propertyFixture.expected.material);
  });
});