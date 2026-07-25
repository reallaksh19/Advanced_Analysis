import { test, expect } from '@playwright/test';
import fixture from './fixtures/3d-simplified/component-placement-ratio-run.json' with { type: 'json' };

test.describe('Slice O — user-controlled component placement ratio', () => {
  test('splits selected pipe with requested ratio offset', async ({ page }) => {
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
          placementRatio: segment.properties?.placementRatio,
          componentStartDistance_mm: segment.properties?.componentStartDistance_mm,
          componentEndDistance_mm: segment.properties?.componentEndDistance_mm
        }))
      };
    });

    expect(splitState.nodeCount).toBe(fixture.expected.nodes);
    expect(splitState.segmentCount).toBe(fixture.expected.segments);

    const upstreamPipe = splitState.segments.find(
      (segment) => segment.splitRole === 'upstream-pipe'
    );
    const componentSegment = splitState.segments.find(
      (segment) => segment.splitRole === 'inline-component'
    );
    const downstreamPipe = splitState.segments.find(
      (segment) => segment.splitRole === 'downstream-pipe'
    );

    expect(upstreamPipe).toBeTruthy();
    expect(componentSegment).toBeTruthy();
    expect(downstreamPipe).toBeTruthy();

    // Validate the ratios
    expect(componentSegment.placementRatio).toBe(fixture.componentButton.placementRatio);
    expect(componentSegment.componentStartDistance_mm).toBe(fixture.componentButton.expectedStartDistance_mm);
    expect(componentSegment.componentEndDistance_mm).toBe(fixture.componentButton.expectedEndDistance_mm);

    expect(componentSegment.masterDbRowId).toBe(fixture.expected.masterDbRowId);
    expect(componentSegment.componentWeight_kg).toBe(fixture.componentButton.expectedComponentWeight_kg);
    expect(componentSegment.componentLength_mm).toBe(fixture.componentButton.expectedComponentLength_mm);

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

    await expect(supportTable).toContainText(String(fixture.expected.supportReactionA_N));
    await expect(supportTable).toContainText(String(fixture.expected.supportReactionA_kgf));
    await expect(supportTable).toContainText(String(fixture.expected.supportReactionB_N));
    await expect(supportTable).toContainText(String(fixture.expected.supportReactionB_kgf));

    const reportMarkdown = page.getByTestId('3d-simplified-report-markdown');

    await expect(reportMarkdown).toContainText(fixture.expected.masterDbRowId);
    await expect(reportMarkdown).toContainText(fixture.expected.propertySource);
    await expect(reportMarkdown).toContainText(String(fixture.expected.supportReactionA_N));

    const reportJson = page.getByTestId('3d-simplified-report-json');

    await expect(reportJson).toContainText(fixture.expected.masterDbRowId);
    await expect(reportJson).toContainText(fixture.expected.propertySource);
  });
});