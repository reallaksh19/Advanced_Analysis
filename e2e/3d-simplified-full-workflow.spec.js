import { test, expect } from '@playwright/test';
import fixture from './fixtures/3d-simplified/full-workflow-master-db-run.json' with { type: 'json' };

test.describe('Slice H — full 2D Sketcher to 3D Simplified workflow', () => {
  test('proves sketcher, Master DB, 3D model, support loads, and report in one deterministic workflow', async ({ page }) => {
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

    const sketcherProvenance = page.getByTestId('sketcher-master-db-provenance');

    await expect(sketcherProvenance).toContainText(fixture.expected.masterDbRowId);
    await expect(sketcherProvenance).toContainText(
      `Length: ${fixture.masterDb.expectedComponentLength_mm} mm`
    );
    await expect(sketcherProvenance).toContainText(
      `Weight: ${fixture.masterDb.expectedComponentWeight_kg} kg`
    );
    await expect(sketcherProvenance).toContainText(
      `Source: ${fixture.expected.masterDbSource}`
    );

    await page.getByTestId('sketcher-push-to-3d-simplified').click();

    await expect(page.getByTestId('3d-simplified-analysis-tab')).toBeVisible();
    await expect(page.getByRole('heading', { name: '3D Simplified Calculation' })).toBeVisible();

    const modelSummary = page.getByTestId('3d-simplified-imported-model-summary');

    await expect(modelSummary).toContainText(`Nodes: ${fixture.expected.nodes}`);
    await expect(modelSummary).toContainText(`Segments: ${fixture.expected.segments}`);
    await expect(modelSummary).toContainText(`Supports: ${fixture.expected.supports}`);

    await expect(page.getByTestId('3d-simplified-model-validation-status')).toContainText(
      fixture.expected.validationStatus
    );

    const propertySummary = page.getByTestId('3d-simplified-property-contract-summary');

    await expect(propertySummary).toContainText(`Pipe segments: ${fixture.expected.pipeSegments}`);
    await expect(propertySummary).toContainText(`Component segments: ${fixture.expected.componentSegments}`);
    await expect(propertySummary).toContainText('Materials: CARBON STEEL');
    await expect(propertySummary).toContainText('Schedules: STD');
    await expect(propertySummary).toContainText('Ratings: 150');
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

    await expect(supportTable).toContainText('SUP-A');
    await expect(supportTable).toContainText('SUP-B');
    await expect(supportTable).toContainText(String(fixture.expected.supportReaction_N));
    await expect(supportTable).toContainText(String(fixture.expected.supportReaction_kgf));

    const reportSummary = page.getByTestId('3d-simplified-report-summary');

    await expect(reportSummary).toContainText(`Report ID: ${fixture.expected.reportId}`);
    await expect(reportSummary).toContainText(`Schema: ${fixture.expected.reportSchema}`);
    await expect(reportSummary).toContainText(`Methods: ${fixture.expected.supportLoadMethodId}`);
    await expect(reportSummary).toContainText('Formula count: 5');
    await expect(reportSummary).toContainText('Support rows: 2');
    await expect(reportSummary).toContainText('Segment rows: 1');
    await expect(reportSummary).toContainText('Master DB rows: 1');

    const reportMarkdown = page.getByTestId('3d-simplified-report-markdown');

    await expect(reportMarkdown).toContainText('# 3D Simplified Calculation Report');
    await expect(reportMarkdown).toContainText(`Report ID: ${fixture.expected.reportId}`);
    await expect(reportMarkdown).toContainText(fixture.expected.supportLoadMethodId);
    await expect(reportMarkdown).toContainText(`Total Weight N: ${fixture.expected.totalWeight_N}`);
    await expect(reportMarkdown).toContainText(String(fixture.expected.supportReaction_N));
    await expect(reportMarkdown).toContainText(fixture.expected.masterDbRowId);
    await expect(reportMarkdown).toContainText(fixture.expected.masterDbSource);
    await expect(reportMarkdown).toContainText('Vertical support load only.');
    await expect(reportMarkdown).toContainText('Master DB Provenance');

    for (const formulaId of fixture.expected.formulaIds) {
      await expect(reportMarkdown).toContainText(formulaId);
    }

    const modelJson = page.getByTestId('3d-simplified-model-contract-json');

    await expect(modelJson).toContainText(fixture.expected.modelSchema);
    await expect(modelJson).toContainText(fixture.expected.reportSchema);
    await expect(modelJson).toContainText(fixture.expected.masterDbRowId);

    const reportJson = page.getByTestId('3d-simplified-report-json');

    await expect(reportJson).toContainText(fixture.expected.reportSchema);
    await expect(reportJson).toContainText(fixture.expected.masterDbRowId);
    await expect(reportJson).toContainText(fixture.expected.supportLoadMethodId);
  });
});