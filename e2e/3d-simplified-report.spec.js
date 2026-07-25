import { test, expect } from '@playwright/test';
import fixture from './fixtures/3d-simplified/report-master-db-run.json' with { type: 'json' };

test.describe('Slice G — 3D Simplified calculation report', () => {
  test('generates a traceable report from the Master DB support-load workflow', async ({ page }) => {
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
      fixture.expected.masterDbRowId
    );

    await page.getByTestId('sketcher-push-to-3d-simplified').click();

    await expect(page.getByTestId('3d-simplified-analysis-tab')).toBeVisible();
    await expect(page.getByRole('heading', { name: '3D Simplified Calculation' })).toBeVisible();

    await expect(page.getByTestId('3d-simplified-model-validation-status')).toContainText(
      fixture.expected.validationStatus
    );

    const reportPanel = page.getByTestId('3d-simplified-report-panel');
    await expect(reportPanel).toBeVisible();

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

    for (const formulaId of fixture.expected.formulaIds) {
      await expect(reportMarkdown).toContainText(formulaId);
    }

    await expect(reportMarkdown).toContainText('Vertical support load only.');
    await expect(reportMarkdown).toContainText('Master DB Provenance');

    const reportJson = page.getByTestId('3d-simplified-report-json');
    await expect(reportJson).toContainText(fixture.expected.reportSchema);
    await expect(reportJson).toContainText(fixture.expected.masterDbRowId);
    await expect(reportJson).toContainText(fixture.expected.supportLoadMethodId);
  });
});