import { test, expect } from '@playwright/test';
import fixture from './fixtures/3d-simplified/report-download-run.json' with { type: 'json' };

async function prepareWorkflow(page, caseData) {
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
      workingPlane: fixtureData.sketcher.workingPlane,
      workingElevation: fixtureData.sketcher.workingElevation,
      designTemperature: fixtureData.sketcher.designTemperature
    });

    const result = store
      .getState()
      .applyMasterDbComponentToSegment(
        fixtureData.sketcher.segments[0].id,
        fixtureData.masterDb.rowId
      );

    if (!result?.ok) {
      throw new Error(result?.diagnostic?.message || 'Master DB apply failed.');
    }
  }, caseData);

  await expect(page.getByTestId('sketcher-master-db-provenance')).toContainText(
    caseData.expected.masterDbRowId
  );

  await page.getByTestId('sketcher-push-to-3d-simplified').click();

  await expect(page.getByTestId('3d-simplified-analysis-tab')).toBeVisible();
  await expect(page.getByRole('heading', { name: '3D Simplified Calculation' })).toBeVisible();

  await expect(page.getByTestId('3d-simplified-model-validation-status')).toContainText(
    caseData.expected.validationStatus
  );

  await expect(page.getByTestId('3d-simplified-report-panel')).toBeVisible();
}

test.describe('Slice J — 3D Simplified report download', () => {
  test('downloads Markdown and JSON reports from the completed workflow', async ({ page }) => {
    await prepareWorkflow(page, fixture);

    const markdownDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('3d-simplified-report-download-md').click();
    const markdownDownload = await markdownDownloadPromise;

    expect(markdownDownload.suggestedFilename()).toBe(fixture.expected.markdownFilename);

    const markdownContent = await markdownDownload
      .createReadStream()
      .then(async (stream) => {
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return Buffer.concat(chunks).toString('utf-8');
      });

    expect(markdownContent).toContain('# 3D Simplified Calculation Report');
    expect(markdownContent).toContain(`Report ID: ${fixture.expected.reportId}`);
    expect(markdownContent).toContain(fixture.expected.supportLoadMethodId);
    expect(markdownContent).toContain(`Total Weight N: ${fixture.expected.totalWeight_N}`);
    expect(markdownContent).toContain(String(fixture.expected.supportReaction_N));
    expect(markdownContent).toContain(fixture.expected.masterDbRowId);
    expect(markdownContent).toContain(fixture.expected.masterDbSource);
    expect(markdownContent).toContain('Master DB Provenance');

    for (const formulaId of fixture.expected.formulaIds) {
      expect(markdownContent).toContain(formulaId);
    }

    const jsonDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('3d-simplified-report-download-json').click();
    const jsonDownload = await jsonDownloadPromise;

    expect(jsonDownload.suggestedFilename()).toBe(fixture.expected.jsonFilename);

    const jsonContent = await jsonDownload
      .createReadStream()
      .then(async (stream) => {
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return Buffer.concat(chunks).toString('utf-8');
      });

    const report = JSON.parse(jsonContent);

    expect(report.schemaVersion).toBe(fixture.expected.reportSchema);
    expect(report.reportId).toBe(fixture.expected.reportId);
    expect(report.methodIds).toContain(fixture.expected.supportLoadMethodId);
    expect(report.supportLoadSummary.totalSegmentWeight_N).toBe(fixture.expected.totalWeight_N);
    expect(report.masterDbProvenance[0].rowId).toBe(fixture.expected.masterDbRowId);
    expect(report.masterDbProvenance[0].source).toBe(fixture.expected.masterDbSource);

    for (const formulaId of fixture.expected.formulaIds) {
      expect(report.formulaIds).toContain(formulaId);
    }
  });
});