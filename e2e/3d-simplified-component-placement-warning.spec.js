import { test, expect } from '@playwright/test';
import fixture from './fixtures/3d-simplified/component-placement-warning-run.json' with { type: 'json' };

test.describe('Slice R — component placement warning UI', () => {
  test('displays clamp warning with formatted requested and actual ratios in segment editor', async ({ page }) => {
    await page.addInitScript(() => {
      window.__SIMPLIFIED_ANALYSIS_E2E__ = true;
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-sketcher').click();

    await page.waitForFunction(() =>
      Boolean(window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__)
    );

    // Apply baseline model
    await page.evaluate((caseData) => {
      const store = window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__;
      store.setState({
        nodes: caseData.sketcher.nodes,
        segments: caseData.sketcher.segments,
        selectedSegmentId: caseData.sketcher.segments[0].id,
        selectedNodeId: null,
        workingPlane: caseData.sketcher.workingPlane,
        workingElevation: caseData.sketcher.workingElevation,
        designTemperature: caseData.sketcher.designTemperature,
        componentPlacementRatio: caseData.placement.requestedRatio * 100
      });
    }, fixture);

    // Select the segment and run placement command
    await expect(page.getByText('Segment: S001')).toBeVisible();
    await page.getByTestId(fixture.placement.testId).click();

    // Verify split topology occurred
    await page.waitForFunction(() => {
      const store = window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__;
      return store.getState().segments.length === 3 &&
             Object.keys(store.getState().nodes).length === 4;
    });

    // Make sure the inline component segment is still selected (default behavior)
    const splitState = await page.evaluate(() => {
        const store = window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__;
        return { selectedSegmentId: store.getState().selectedSegmentId };
    });
    expect(splitState.selectedSegmentId).toBeTruthy();

    const warningBox = page.getByTestId('sketcher-component-placement-warning');

    if (fixture.expected.warningVisible) {
      await expect(warningBox).toBeVisible();
      await expect(warningBox).toContainText('Placement was clamped');
      await expect(warningBox).toContainText(fixture.expected.requestedText);
      await expect(warningBox).toContainText(fixture.expected.actualText);
      await expect(warningBox).toContainText(fixture.expected.minStubText);
      await expect(warningBox).toContainText(fixture.expected.startDistanceText);
      await expect(warningBox).toContainText(fixture.expected.endDistanceText);
    } else {
      await expect(warningBox).not.toBeVisible();
    }

    await page.getByTestId('sketcher-push-to-3d-simplified').click();

    await expect(page.getByTestId('3d-simplified-analysis-tab')).toBeVisible();
    await expect(page.getByRole('heading', { name: '3D Simplified Calculation' })).toBeVisible();

    const reportMarkdown = page.getByTestId('3d-simplified-report-markdown');
    await expect(reportMarkdown).toContainText('true');

    const reportJson = page.getByTestId('3d-simplified-report-json');
    await expect(reportJson).toContainText('"placementWasClamped": true');
  });
});
