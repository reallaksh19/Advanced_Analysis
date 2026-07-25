import { test, expect } from '@playwright/test';
import fixture from './fixtures/3d-simplified/component-placement-clamp-run.json' with { type: 'json' };

test.describe('Slice Q — component placement validation and clamping', () => {
  test('verifies clamped placement metadata in Sketcher and 3D report', async ({ page }) => {
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
    await ratioInput.fill('5');

    await page.getByTestId(fixture.componentButton.testId).click();

    await page.waitForFunction(() => {
      const store = window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__;
      return store.getState().segments.length === 3 &&
        Object.keys(store.getState().nodes).length === 4;
    });

    const splitState = await page.evaluate(() => {
      const store = window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__;
      return {
        nodeCount: Object.keys(store.getState().nodes).length,
        segmentCount: store.getState().segments.length,
        selectedSegmentId: store.getState().selectedSegmentId,
        segments: store.getState().segments.map((segment) => ({
          id: segment.id,
          type: segment.type,
          startNode: segment.startNode,
          endNode: segment.endNode,
          splitRole: segment.properties?.splitRole,
          masterDbRowId: segment.properties?.masterDbRowId,
          componentWeight_kg: segment.properties?.componentWeight_kg,
          componentLength_mm: segment.properties?.componentLength_mm,
          requestedPlacementRatio: segment.properties?.requestedPlacementRatio,
          actualPlacementRatio: segment.properties?.actualPlacementRatio,
          placementWasClamped: segment.properties?.placementWasClamped,
          minimumPipeStub_mm: segment.properties?.minimumPipeStub_mm,
          componentStartDistance_mm: segment.properties?.componentStartDistance_mm,
          componentEndDistance_mm: segment.properties?.componentEndDistance_mm
        }))
      };
    });

    expect(splitState.nodeCount).toBe(fixture.expected.nodes);
    expect(splitState.segmentCount).toBe(fixture.expected.segments);

    const componentSegment = splitState.segments.find(
      (segment) => segment.splitRole === 'inline-component'
    );

    expect(componentSegment).toBeTruthy();

    // Validate the ratios
    const epsilon = 0.001;
    expect(Math.abs(componentSegment.requestedPlacementRatio - fixture.componentButton.requestedPlacementRatio)).toBeLessThan(epsilon);
    expect(Math.abs(componentSegment.actualPlacementRatio - fixture.componentButton.actualPlacementRatio)).toBeLessThan(epsilon);
    expect(componentSegment.placementWasClamped).toBe(fixture.componentButton.placementWasClamped);
    expect(componentSegment.minimumPipeStub_mm).toBe(fixture.componentButton.minimumPipeStub_mm);
    expect(Math.abs(componentSegment.componentStartDistance_mm - fixture.componentButton.expectedStartDistance_mm)).toBeLessThan(epsilon);
    expect(Math.abs(componentSegment.componentEndDistance_mm - fixture.componentButton.expectedEndDistance_mm)).toBeLessThan(epsilon);

    await page.getByTestId('sketcher-push-to-3d-simplified').click();

    await expect(page.getByTestId('3d-simplified-analysis-tab')).toBeVisible();
    await expect(page.getByRole('heading', { name: '3D Simplified Calculation' })).toBeVisible();

    const reportMarkdown = page.getByTestId('3d-simplified-report-markdown');

    // Check Markdown format
    await expect(reportMarkdown).toContainText('## Component Placement Table');
    await expect(reportMarkdown).toContainText(fixture.componentButton.rowId);
    await expect(reportMarkdown).toContainText(fixture.componentButton.expectedSource);

    // Since Markdown format may trim or stringify exact decimals slightly differently, we can check for substring logic
    // We expect requested, actual, clamped to all exist on the row.
    await expect(reportMarkdown).toContainText('true'); // clamped
    await expect(reportMarkdown).toContainText('0.05'); // requested
    await expect(reportMarkdown).toContainText('0.108667'); // actual

    // Check JSON format contains the array data
    const reportJson = page.getByTestId('3d-simplified-report-json');
    await expect(reportJson).toContainText('"componentPlacementTable"');
    await expect(reportJson).toContainText(`"requestedPlacementRatio": ${fixture.componentButton.requestedPlacementRatio}`);
    await expect(reportJson).toContainText(`"actualPlacementRatio": ${fixture.componentButton.actualPlacementRatio}`);
    await expect(reportJson).toContainText(`"placementWasClamped": ${fixture.componentButton.placementWasClamped}`);
    await expect(reportJson).toContainText(`"minimumPipeStub_mm": ${fixture.componentButton.minimumPipeStub_mm}`);
  });
});