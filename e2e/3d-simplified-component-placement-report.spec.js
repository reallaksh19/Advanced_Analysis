import { test, expect } from '@playwright/test';
import fixture from './fixtures/3d-simplified/component-placement-report-run.json' with { type: 'json' };

test.describe('Slice P — component placement report detail', () => {
  test('verifies placement metadata in report Markdown and JSON', async ({ page }) => {
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

    const ratioInput = page.getByTestId('sketcher-component-placement-ratio');
    await ratioInput.fill('25');

    await page.getByTestId(fixture.componentButton.testId).click();

    await page.waitForFunction(() => {
      const store = window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__;
      return store.getState().segments.length === 3 &&
        Object.keys(store.getState().nodes).length === 4;
    });

    await page.getByTestId('sketcher-push-to-3d-simplified').click();

    await expect(page.getByTestId('3d-simplified-analysis-tab')).toBeVisible();
    await expect(page.getByRole('heading', { name: '3D Simplified Calculation' })).toBeVisible();

    const reportMarkdown = page.getByTestId('3d-simplified-report-markdown');

    // Check Markdown format
    await expect(reportMarkdown).toContainText('## Component Placement Table');
    await expect(reportMarkdown).toContainText(fixture.componentButton.rowId);
    await expect(reportMarkdown).toContainText(fixture.componentButton.expectedSource);
    await expect(reportMarkdown).toContainText(String(fixture.componentButton.placementRatio));
    await expect(reportMarkdown).toContainText(String(fixture.componentButton.expectedStartDistance_mm));
    await expect(reportMarkdown).toContainText(String(fixture.componentButton.expectedEndDistance_mm));
    await expect(reportMarkdown).toContainText(String(fixture.componentButton.expectedComponentLength_mm));
    await expect(reportMarkdown).toContainText(String(fixture.componentButton.expectedComponentWeight_kg));

    // Check JSON format contains the array data
    const reportJson = page.getByTestId('3d-simplified-report-json');
    await expect(reportJson).toContainText('"componentPlacementTable"');
    await expect(reportJson).toContainText(`"masterDbRowId": "${fixture.componentButton.rowId}"`);
    await expect(reportJson).toContainText(`"placementRatio": ${fixture.componentButton.placementRatio}`);
    await expect(reportJson).toContainText(`"componentStartDistance_mm": ${fixture.componentButton.expectedStartDistance_mm}`);
    await expect(reportJson).toContainText(`"componentEndDistance_mm": ${fixture.componentButton.expectedEndDistance_mm}`);
  });
});
