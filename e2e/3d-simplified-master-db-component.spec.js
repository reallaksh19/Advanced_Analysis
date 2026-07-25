import { test, expect } from '@playwright/test';
import fixture from './fixtures/3d-simplified/master-db-valve-component-run.json' with { type: 'json' };

test.describe('Slice F — Master DB component integration', () => {
  test('applies a named Master DB component row in Sketcher and carries its weight into 3D Simplified support loads', async ({ page }) => {
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

      const result = store
        .getState()
        .applyMasterDbComponentToSegment(
          caseData.sketcher.segments[0].id,
          caseData.masterDb.rowId
        );

      if (!result?.ok) {
        throw new Error(result?.diagnostic?.message || 'Master DB apply failed.');
      }
    }, fixture);

    await expect(page.getByTestId('sketcher-master-db-provenance')).toContainText(
      fixture.masterDb.rowId
    );
    await expect(page.getByTestId('sketcher-master-db-provenance')).toContainText(
      `Weight: ${fixture.masterDb.expectedComponentWeight_kg} kg`
    );
    await expect(page.getByTestId('sketcher-master-db-provenance')).toContainText(
      `Source: ${fixture.masterDb.expectedSource}`
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

    const contractJson = page.getByTestId('3d-simplified-model-contract-json');
    await expect(contractJson).toContainText(fixture.expected.masterDbRowId);
    await expect(contractJson).toContainText(fixture.expected.propertySource);
  });
});