import { test, expect } from '@playwright/test';
import fixture from './fixtures/3d-simplified/component-insert-button-run.json' with { type: 'json' };

test.describe('Slice M — Sketcher component insertion buttons', () => {
  test('inserts a Master DB component using a Sketcher toolbar button and carries it to 3D Simplified Calculation', async ({ page }) => {
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
        selectedNodeId: null,
        workingPlane: caseData.sketcher.workingPlane,
        workingElevation: caseData.sketcher.workingElevation,
        designTemperature: caseData.sketcher.designTemperature
      });
    }, fixture);

    await expect(page.getByText('Segment: S001')).toBeVisible();

    await page.getByTestId(fixture.componentButton.testId).click();

    await expect(page.getByTestId('sketcher-master-db-provenance')).toContainText(
      fixture.expected.masterDbRowId
    );
    await expect(page.getByTestId('sketcher-master-db-provenance')).toContainText(
      `Length: ${fixture.componentButton.expectedComponentLength_mm} mm`
    );
    await expect(page.getByTestId('sketcher-master-db-provenance')).toContainText(
      `Weight: ${fixture.componentButton.expectedComponentWeight_kg} kg`
    );
    await expect(page.getByTestId('sketcher-master-db-provenance')).toContainText(
      `Source: ${fixture.expected.propertySource}`
    );

    await page.getByTestId('sketcher-push-to-3d-simplified').click();

    await expect(page.getByTestId('3d-simplified-analysis-tab')).toBeVisible();
    await expect(page.getByRole('heading', { name: '3D Simplified Calculation' })).toBeVisible();

    await expect(page.getByTestId('3d-simplified-model-validation-status')).toContainText(
      fixture.expected.validationStatus
    );

    const propertySummary = page.getByTestId('3d-simplified-property-contract-summary');

    await expect(propertySummary).toContainText(
      `Component weights assigned: ${fixture.expected.componentWeightsAssigned}`
    );

    const supportSummary = page.getByTestId('3d-simplified-support-load-summary');

    await expect(supportSummary).toContainText(
      `Support-load method: ${fixture.expected.methodId}`
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

    await expect(reportMarkdown).toContainText(fixture.expected.masterDbRowId);
    await expect(reportMarkdown).toContainText(fixture.expected.propertySource);
    await expect(reportMarkdown).toContainText(String(fixture.expected.supportReaction_N));

    const reportJson = page.getByTestId('3d-simplified-report-json');

    await expect(reportJson).toContainText(fixture.expected.masterDbRowId);
    await expect(reportJson).toContainText(fixture.expected.propertySource);
  });
});
