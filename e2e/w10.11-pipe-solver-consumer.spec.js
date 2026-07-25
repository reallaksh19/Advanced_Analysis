import { expect, test } from '@playwright/test';

// Historical closed compatibility remains covered for application-view-state/v4.
const COMPLETE = packageValue('W10.11-BROWSER', {
  DELTA_T: 180, ALPHA_PER_C: 0.000012, E_MPA: 200000, PIPE_OD: 168.3, SA_MPA: 100,
});
const INCOMPLETE = packageValue('W10.11-MISSING', { DELTA_T: 180, E_MPA: 200000, PIPE_OD: 168.3 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d'; });
});

test('adopts existing pipe-screening, delegates events, and exports the current report', async ({ page }) => {
  await page.goto('/');
  await installAudit(page);
  await upload(page, 'complete.json', COMPLETE);
  const nav = applicationNavigation(page);
  const pipeSolver = navButton(nav, 'Pipe Solver');
  await expect(pipeSolver).toHaveAttribute('aria-disabled', 'false');
  await pipeSolver.click();
  expect(await page.evaluate(() => AnalysisWorkspace.getApplicationViewState().schema)).toBe('application-view-state/v7');
  expect(await page.evaluate(() => AnalysisWorkspace.getPipeSolverReviewModel().schema)).toBe('pipe-solver-review-model/v1');
  await expect(page.locator('[data-role="pipe-solver-consumer"]')).toContainText('Not final piping-code stress analysis.');
  expect((await audit(page)).automaticActions).toBe(0);

  await navButton(nav, 'Workspace').click();
  await page.locator('[data-entity-id="PIPE-A"]').click();
  await pipeSolver.click();
  await page.getByRole('button', { name: 'Open Input Review' }).click();
  await expect(page.locator('[data-role="pipe-solver-session"]')).toContainText('analysis-session-1');
  await page.getByRole('button', { name: 'Run Reviewed Pipe Screening' }).click();
  await expect(page.locator('[data-role="pipe-solver-result"]')).toContainText('PASS');
  const model = await page.evaluate(() => AnalysisWorkspace.getPipeSolverReviewModel());
  expect(model.capabilitySummary.methodId).toBe('SIMPLIFIED_2D_TOPOLOGY_SCREENING');
  expect(model.currentResult.engineeringLevel).toBe('BENCHMARKED_SCREENING');
  expect(model.currentResult.methodId).toBe('SIMPLIFIED_2D_L_SHAPE');
  expect(model.currentResult.meta.geometryType).toBe('L_SHAPE');
  await expect(page.locator('[data-role="pipe-solver-capability"]')).toContainText('SIMPLIFIED_2D_TOPOLOGY_SCREENING');
  await expect(page.locator('[data-role="pipe-solver-result"]')).toContainText('SIMPLIFIED_2D_L_SHAPE');
  await expect(page.locator('[data-role="pipe-solver-ledger"]')).toContainText('analysis-ledger-entry-1');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Analysis Report' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  expect((await audit(page)).exportPayloads).toEqual([{ format: 'json' }]);
});

test('keeps generic readiness separate and sends raw override values to the existing owner', async ({ page }) => {
  await page.goto('/');
  await installAudit(page);
  await upload(page, 'missing.json', INCOMPLETE);
  const nav = applicationNavigation(page);
  const pipeSolver = navButton(nav, 'Pipe Solver');
  await expect(pipeSolver).toHaveAttribute('aria-disabled', 'false');
  await page.locator('[data-entity-id="PIPE-A"]').click();
  await pipeSolver.click();
  await expect(page.locator('[data-role="pipe-solver-capability"]')).toContainText('alpha, Sa');
  await page.getByRole('button', { name: 'Open Input Review' }).click();
  await expect(page.getByRole('button', { name: 'Run Reviewed Pipe Screening' })).toBeDisabled();
  await override(page, 'alpha', '0.000012');
  await override(page, 'Sa', '100');
  await expect(page.getByRole('button', { name: 'Run Reviewed Pipe Screening' })).toBeEnabled();
  expect((await audit(page)).overridePayloads).toEqual([
    { sessionId: 'analysis-session-1', fieldKey: 'alpha', value: '0.000012' },
    { sessionId: 'analysis-session-1', fieldKey: 'Sa', value: '100' },
  ]);
  const session = await page.evaluate(() => AnalysisWorkspace.getAnalysisSession().session);
  expect(session.overrides).toMatchObject({ alpha: 0.000012, Sa: 100 });
});

test('same-ID replacement falls back, excludes stale analysis evidence, and teardown removes listeners', async ({ page }) => {
  await page.goto('/');
  await upload(page, 'first.json', COMPLETE);
  const nav = applicationNavigation(page);
  const pipeSolver = navButton(nav, 'Pipe Solver');
  await page.locator('[data-entity-id="PIPE-A"]').click();
  await pipeSolver.click();
  await page.getByRole('button', { name: 'Open Input Review' }).click();
  await page.getByRole('button', { name: 'Run Reviewed Pipe Screening' }).click();
  const before = await page.evaluate(() => ({
    datasetId: AnalysisWorkspace.getSnapshot().dataset.datasetId,
    sourceHash: AnalysisWorkspace.getPipeSolverReviewModel().sourceReferences.sourceSemanticHash,
  }));
  await upload(page, 'replacement.json', packageValue('W10.11-BROWSER', {
    DELTA_T: 90, ALPHA_PER_C: 0.00001, E_MPA: 190000, PIPE_OD: 219.1, SA_MPA: 80,
  }, 7000));
  await expect.poll(() => page.evaluate(() => AnalysisWorkspace.getApplicationViewState().activeViewId)).toBe('WORKSPACE');
  expect(await page.evaluate(() => AnalysisWorkspace.getSnapshot().dataset.datasetId)).toBe(before.datasetId);
  const replacementReview = await page.evaluate(() => AnalysisWorkspace.getPipeSolverReviewModel());
  expect(replacementReview.sessionSummary.available).toBe(false);
  expect(replacementReview.currentResult).toBeNull();
  expect((await page.evaluate(() => AnalysisWorkspace.getAnalysisLedger())).entries).toHaveLength(0);
  await page.locator('[data-entity-id="PIPE-A"]').click();
  await pipeSolver.click();
  const after = await page.evaluate(() => AnalysisWorkspace.getPipeSolverReviewModel());
  expect(after.currentResult).toBeNull();
  expect(after.sourceReferences.sourceSemanticHash).not.toBe(before.sourceHash);
  const topics = requestTopics();
  const beforeDestroy = await listenerCounts(page, topics);
  await page.evaluate(() => AnalysisWorkspace.destroy());
  const afterDestroy = await listenerCounts(page, topics);
  topics.forEach((topic) => expect(afterDestroy[topic]).toBeLessThan(beforeDestroy[topic]));
});

function applicationNavigation(page) { return page.getByRole('navigation', { name: 'Application views' }); }
function navButton(nav, name) { return nav.getByRole('button', { name, exact: true }); }
async function installAudit(page) {
  await page.evaluate(() => {
    globalThis.__w1011 = { automaticActions: 0, overridePayloads: [], exportPayloads: [] };
    EventBus.subscribe('analysis:sessionOpenRequested', () => { globalThis.__w1011.automaticActions += 1; });
    EventBus.subscribe('analysis:requested', () => { globalThis.__w1011.automaticActions += 1; });
    EventBus.subscribe('analysis:sessionOverrideRequested', (payload) => globalThis.__w1011.overridePayloads.push(payload));
    EventBus.subscribe('analysis:exportRequested', (payload) => globalThis.__w1011.exportPayloads.push(payload));
  });
}
async function audit(page) { return page.evaluate(() => globalThis.__w1011); }
async function override(page, key, value) {
  const input = page.locator(`[data-pipe-solver-field="${key}"]`);
  await input.fill(value); await input.blur();
}
async function upload(page, name, payload) {
  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)),
  });
}
function packageValue(packageHash, attributes, secondLength = 6000) {
  return { schema: 'rvm-selected-geometry-workspace-package/v1', packageHash, geometry: {
    objects: [pipe('PIPE-A', [0, 0, 0], [6000, 0, 0], { LINE_NO: 'LINE-P', ...attributes }),
      pipe('PIPE-B', [6000, 0, 0], [6000, secondLength, 0], { LINE_NO: 'LINE-P' })], supports: [], branches: [],
  } };
}
function pipe(id, startPoint, endPoint, sourceAttributes) {
  return { id, name: id, type: 'PIPE', sourcePath: `/AREA/LINE/${id}`, sourceAttributes, nativeParams: { startPoint, endPoint } };
}
function requestTopics() {
  return ['analysis:sessionOpenRequested','analysis:sessionOverrideRequested','analysis:sessionResetRequested',
    'analysis:sessionCloseRequested','analysis:requested','analysis:ledgerActiveRequested','analysis:exportRequested'];
}
function listenerCounts(page, topics) {
  return page.evaluate((rows) => Object.fromEntries(rows.map((topic) => [topic, EventBus.listenerCount(topic)])), topics);
}
