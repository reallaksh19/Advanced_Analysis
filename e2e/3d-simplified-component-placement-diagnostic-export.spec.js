import { test, expect } from '@playwright/test';
import fixture from './fixtures/3d-simplified/component-placement-diagnostic-export-run.json' with { type: 'json' };

async function readDownloadText(download) {
  const stream = await download.createReadStream();

  if (!stream) {
    throw new Error(`Could not read downloaded file: ${download.suggestedFilename()}`);
  }

  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf-8');
}

async function prepareClampedWorkflow(page, caseData) {
  await page.addInitScript(() => {
    window.__SIMPLIFIED_ANALYSIS_E2E__ = true;
  });

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  await page.getByTestId('nav-tab-sketcher').click();

  await page.waitForFunction(() =>
    Boolean(window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__)
  );

  await page.evaluate((fixtureData) => {
    const store = window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__;

    store.setState({
      nodes: fixtureData.sketcher.nodes,
      segments: fixtureData.sketcher.segments,
      selectedSegmentId: fixtureData.sketcher.segments[0].id,
      selectedNodeId: null,
      workingPlane: fixtureData.sketcher.workingPlane,
      workingElevation: fixtureData.sketcher.workingElevation,
      designTemperature: fixtureData.sketcher.designTemperature
    });
  }, caseData);

  await expect(page.getByText('Segment: S001')).toBeVisible();

  await page
    .getByTestId('sketcher-component-placement-ratio')
    .fill(String(caseData.componentButton.requestedPlacementPercent));

  await page.getByTestId(caseData.componentButton.testId).click();

  await page.waitForFunction(() => {
    const store = window.__SIMPLIFIED_ANALYSIS_SKETCHER_STORE__;
    return store.getState().segments.length === 3 &&
      Object.keys(store.getState().nodes).length === 4;
  });

  await expect(page.getByTestId('sketcher-component-placement-warning')).toContainText(
    'Placement was clamped'
  );

  await page.getByTestId('sketcher-push-to-3d-simplified').click();

  await expect(page.getByTestId('3d-simplified-analysis-tab')).toBeVisible();
  await expect(page.getByRole('heading', { name: '3D Simplified Calculation' })).toBeVisible();

  await expect(page.getByTestId('3d-simplified-model-validation-status')).toContainText(
    caseData.expected.validationStatus
  );

  await expect(page.getByTestId('3d-simplified-report-panel')).toBeVisible();
  await expect(page.getByTestId('3d-simplified-report-markdown')).toContainText(
    caseData.expected.diagnosticCode
  );
}

test.describe('Slice T — exported report files include placement diagnostics', () => {
  test('downloads Markdown and JSON reports containing clamped-placement diagnostics', async ({ page }) => {
    await prepareClampedWorkflow(page, fixture);

    const markdownDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('3d-simplified-report-download-md').click();
    const markdownDownload = await markdownDownloadPromise;

    expect(markdownDownload.suggestedFilename()).toBe(fixture.expected.markdownFilename);

    const markdownContent = await readDownloadText(markdownDownload);

    expect(markdownContent).toContain('# 3D Simplified Calculation Report');
    expect(markdownContent).toContain('## Diagnostics');
    expect(markdownContent).toContain(fixture.expected.diagnosticCode);
    expect(markdownContent).toContain(fixture.expected.diagnosticSeverity);
    expect(markdownContent).toContain('placement was clamped');
    expect(markdownContent).toContain(String(fixture.componentButton.requestedPlacementRatio));
    expect(markdownContent).toContain(String(fixture.componentButton.actualPlacementRatio));
    expect(markdownContent).toContain(String(fixture.componentButton.minimumPipeStub_mm));
    expect(markdownContent).toContain(fixture.expected.masterDbRowId);

    const jsonDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('3d-simplified-report-download-json').click();
    const jsonDownload = await jsonDownloadPromise;

    expect(jsonDownload.suggestedFilename()).toBe(fixture.expected.jsonFilename);

    const jsonContent = await readDownloadText(jsonDownload);
    const report = JSON.parse(jsonContent);

    expect(report.reportId).toBe(fixture.expected.reportId);
    expect(Array.isArray(report.diagnostics)).toBe(true);

    const placementDiagnostic = report.diagnostics.find(
      (diagnostic) => diagnostic.code === fixture.expected.diagnosticCode
    );

    expect(placementDiagnostic).toBeTruthy();
    expect(placementDiagnostic.severity).toBe(fixture.expected.diagnosticSeverity);
    expect(placementDiagnostic.message).toContain('placement was clamped');
    expect(placementDiagnostic.data.masterDbRowId).toBe(fixture.expected.masterDbRowId);
    expect(placementDiagnostic.data.requestedPlacementRatio).toBe(fixture.componentButton.requestedPlacementRatio);
    expect(placementDiagnostic.data.actualPlacementRatio).toBe(fixture.componentButton.actualPlacementRatio);
    expect(placementDiagnostic.data.minimumPipeStub_mm).toBe(fixture.componentButton.minimumPipeStub_mm);
    expect(placementDiagnostic.data.componentStartDistance_mm).toBe(fixture.componentButton.expectedStartDistance_mm);
    expect(placementDiagnostic.data.componentEndDistance_mm).toBe(fixture.componentButton.expectedEndDistance_mm);
  });
});