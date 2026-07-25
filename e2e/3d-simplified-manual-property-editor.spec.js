import { test, expect } from '@playwright/test';
import fixture from './fixtures/3d-simplified/manual-property-editor-run.json' with { type: 'json' };

async function fillNumber(page, testId, value) {
  const locator = page.getByTestId(testId);
  await locator.fill(String(value));
}

test.describe('Slice K — Sketcher manual engineering property editor', () => {
  test('edits segment properties in Sketcher and pushes them to 3D Simplified Calculation', async ({ page }) => {
    await page.addInitScript(() => {
      window.__SIMPLIFIED_ANALYSIS_E2E__ = true;
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-sketcher').click();

    await page.waitForFunction(() =>
      Boolean(window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__)
    );

    await page.evaluate((caseData) => {
      const store = window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__;

      store.setState({
        nodes: caseData.sketcher.nodes,
        segments: caseData.sketcher.segments,
        selectedSegmentId: caseData.sketcher.segments[0].id,
        workingPlane: caseData.sketcher.workingPlane,
        workingElevation: caseData.sketcher.workingElevation,
        designTemperature: caseData.sketcher.designTemperature
      });
    }, fixture);

    await expect(page.getByText('Segment: S001')).toBeVisible();

    await page.getByTestId('sketcher-segment-nps').fill(fixture.manualEdits.nps);

    await fillNumber(page, 'sketcher-segment-od-mm', fixture.manualEdits.od_mm);
    await fillNumber(page, 'sketcher-segment-material-density-kg-m3', fixture.manualEdits.materialDensity_kg_m3);
    await fillNumber(page, 'sketcher-segment-rating-class', fixture.manualEdits.ratingClass);
    await fillNumber(page, 'sketcher-segment-design-temperature-c', fixture.manualEdits.designTemperature_C);
    await fillNumber(page, 'sketcher-segment-design-pressure-barg', fixture.manualEdits.designPressure_barg);
    await fillNumber(page, 'sketcher-segment-fluid-density-kg-m3', fixture.manualEdits.fluidDensity_kg_m3);
    await fillNumber(page, 'sketcher-segment-insulation-thickness-mm', fixture.manualEdits.insulationThickness_mm);
    await fillNumber(page, 'sketcher-segment-insulation-density-kg-m3', fixture.manualEdits.insulationDensity_kg_m3);
    await fillNumber(page, 'sketcher-segment-component-weight-kg', fixture.manualEdits.componentWeight_kg);
    await fillNumber(page, 'sketcher-segment-component-length-mm', fixture.manualEdits.componentLength_mm);

    await page.getByTestId('sketcher-segment-material').selectOption(fixture.manualEdits.material);

    await page.evaluate((caseData) => {
      const store = window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__;
      const segment = store.getState().segments.find((item) => item.id === 'S001');

      store.getState().updateSegment('S001', {
        properties: {
          ...segment.properties,
          dn_mm: caseData.manualEdits.dn_mm,
          bore: caseData.manualEdits.dn_mm,
          schedule: caseData.manualEdits.schedule,
          wall_mm: caseData.manualEdits.wall_mm,
          wt: caseData.manualEdits.wall_mm
        }
      });
    }, fixture);

    await page.getByTestId('sketcher-push-to-3d-simplified').click();

    await expect(page.getByTestId('3d-simplified-analysis-tab')).toBeVisible();
    await expect(page.getByRole('heading', { name: '3D Simplified Calculation' })).toBeVisible();

    await expect(page.getByTestId('3d-simplified-model-validation-status')).toContainText(
      fixture.expected.validationStatus
    );

    const propertySummary = page.getByTestId('3d-simplified-property-contract-summary');

    await expect(propertySummary).toContainText(`Materials: ${fixture.expected.material}`);
    await expect(propertySummary).toContainText(`Schedules: ${fixture.expected.schedule}`);
    await expect(propertySummary).toContainText(`Ratings: ${fixture.expected.rating}`);
    await expect(propertySummary).toContainText(
      `Component weights assigned: ${fixture.expected.componentWeightsAssigned}`
    );

    const supportSummary = page.getByTestId('3d-simplified-support-load-summary');

    await expect(supportSummary).toContainText(
      `Support-load method: ${fixture.expected.supportLoadMethodId}`
    );
    await expect(supportSummary).toContainText(
      `Total weight N: ${fixture.expected.totalWeight_N}`
    );
    await expect(supportSummary).toContainText(
      `Total reaction N: ${fixture.expected.totalReaction_N}`
    );
    await expect(supportSummary).toContainText(
      `Imbalance N: ${fixture.expected.imbalance_N}`
    );

    const supportTable = page.getByTestId('3d-simplified-support-load-table');

    await expect(supportTable).toContainText(String(fixture.expected.supportReaction_N));
    await expect(supportTable).toContainText(String(fixture.expected.supportReaction_kgf));

    const reportMarkdown = page.getByTestId('3d-simplified-report-markdown');

    await expect(reportMarkdown).toContainText(`Total Weight N: ${fixture.expected.totalWeight_N}`);
    await expect(reportMarkdown).toContainText(String(fixture.expected.supportReaction_N));
    await expect(reportMarkdown).toContainText('SL-E-004-COMPONENT-MASS');
  });
});