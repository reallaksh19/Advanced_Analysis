import { expect, test } from '@playwright/test';

const SUPPORT_PACKAGE = {
  schema: 'rvm-selected-geometry-workspace-package/v1',
  packageHash: 'PHASE6-BROWSER-SUPPORT',
  geometry: {
    objects: [pipe('PIPE-SUPPORT', [0, 0, 0], [5000, 0, 0], { LINE_NO: 'LINE-S' })],
    supports: [],
    branches: [],
  },
};

const SCREENING_PACKAGE = {
  schema: 'rvm-selected-geometry-workspace-package/v1',
  packageHash: 'PHASE6-BROWSER-SCREENING',
  geometry: {
    objects: [
      pipe('PIPE-A', [0, 0, 0], [6000, 0, 0], { LINE_NO: 'LINE-P' }),
      pipe('PIPE-B', [6000, 0, 0], [6000, 3000, 0], { LINE_NO: 'LINE-P' }),
    ],
    supports: [],
    branches: [],
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d';
  });
});

test('reviewed support-load overrides complete readiness without mutating the dataset', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'support.json', SUPPORT_PACKAGE);
  await page.locator('[data-entity-id="PIPE-SUPPORT"]').click();
  const datasetBefore = await page.evaluate(() => JSON.stringify(AnalysisWorkspace.getSnapshot().dataset));

  await page.locator('[data-analysis-type="support-load"]').click();
  await expect(page.locator('[data-role="analysis-session"]')).toContainText('analysis-session-1');
  await expect(page.locator('[data-role="analysis-session"]')).toContainText('derived');
  await expect(page.locator('[data-role="analysis-session"]')).toContainText('missing');
  await expect(page.getByRole('button', { name: 'Run reviewed analysis · support-load' })).toBeDisabled();

  await setOverride(page, 'pipeOdMm', 168.3);
  await setOverride(page, 'wallThicknessMm', 7.11);
  await setOverride(page, 'unitPipeWtKgPerM', 28.3);
  await setOverride(page, 'fluidWtOpeKgPerM', 13.9);
  await setOverride(page, 'fluidWtHydKgPerM', 17.4);
  await setOverride(page, 'insulationThicknessMm', 40);
  await setOverride(page, 'insulationDensityKgM3', 120);
  await setOverride(page, 'tempExpC1', 200);

  await expect(page.locator('[data-role="analysis-session-readiness"]')).toHaveText(
    'Ready for reviewed execution',
  );
  await expect(page.locator('[data-field-key="pipeOdMm"]')).toContainText('override');
  expect(await page.evaluate(() => JSON.stringify(AnalysisWorkspace.getSnapshot().dataset))).toBe(datasetBefore);

  await page.getByRole('button', { name: 'Run reviewed analysis · support-load' }).click();
  await expect(page.locator('[data-role="analysis-status"]')).toHaveText(
    'support-load completed · CALCULATED',
  );
  const session = await page.evaluate(() => AnalysisWorkspace.getAnalysisSession().session);
  expect(session.status).toBe('completed');
  expect(session.result.meta.analysisSessionId).toBe(session.sessionId);
  expect(session.overrides.pipeOdMm).toBe(168.3);
});

test('invalid override preserves the prior valid value and reset restores source readiness', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'support.json', SUPPORT_PACKAGE);
  await page.locator('[data-entity-id="PIPE-SUPPORT"]').click();
  await page.locator('[data-analysis-type="support-load"]').click();

  await setOverride(page, 'pipeOdMm', 168.3);
  await setOverride(page, 'pipeOdMm', -1);
  await expect(page.locator('[data-field-key="pipeOdMm"]')).toContainText('must be greater than zero');
  expect(await page.evaluate(() => AnalysisWorkspace.getAnalysisSession().session.overrides.pipeOdMm)).toBe(168.3);

  await page.getByRole('button', { name: 'Reset reviewed overrides' }).click();
  const session = await page.evaluate(() => AnalysisWorkspace.getAnalysisSession().session);
  expect(session.overrides).toEqual({});
  expect(session.fieldErrors).toEqual({});
  expect(session.status).toBe('draft');
});

test('pipe screening uses connected geometry and reviewed engineering parameters', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'screening.json', SCREENING_PACKAGE);
  await page.locator('[data-entity-id="PIPE-A"]').click();
  await page.locator('[data-analysis-type="pipe-screening"]').click();

  await expect(page.locator('[data-field-key="connectedLineSegments"]')).toContainText('2');
  await setOverride(page, 'deltaT', 180);
  await setOverride(page, 'alpha', 0.000012);
  await setOverride(page, 'E', 200000);
  await setOverride(page, 'od', 168.3);
  await setOverride(page, 'Sa', 100);
  await expect(page.locator('[data-role="analysis-session-readiness"]')).toHaveText(
    'Ready for reviewed execution',
  );

  await page.getByRole('button', { name: 'Run reviewed analysis · pipe-screening' }).click();
  await expect(page.locator('[data-role="analysis-status"]')).toContainText('pipe-screening completed');
  const result = await page.evaluate(() => AnalysisWorkspace.getAnalysisSession().session.result);
  expect(result.meta.sourceEntityIds).toEqual(['PIPE-A', 'PIPE-B']);
  expect(result.meta.analysisSessionId).toMatch(/^analysis-session-/);
});

test('selection, close, clear, and destroy remove active sessions and listeners', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'screening.json', SCREENING_PACKAGE);
  await page.locator('[data-entity-id="PIPE-A"]').click();
  await page.locator('[data-analysis-type="pipe-screening"]').click();
  expect(await page.evaluate(() => AnalysisWorkspace.getAnalysisSession().status)).toBe('active');

  await page.locator('[data-entity-id="PIPE-B"]').click();
  expect(await page.evaluate(() => AnalysisWorkspace.getAnalysisSession().status)).toBe('empty');

  await page.locator('[data-analysis-type="pipe-screening"]').click();
  await page.getByRole('button', { name: 'Close input review' }).click();
  expect(await page.evaluate(() => AnalysisWorkspace.getAnalysisSession().status)).toBe('empty');

  await page.locator('[data-analysis-type="pipe-screening"]').click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  expect(await page.evaluate(() => AnalysisWorkspace.getAnalysisSession().status)).toBe('empty');

  await page.evaluate(() => AnalysisWorkspace.destroy());
  for (const topic of [
    'analysis:sessionOpenRequested',
    'analysis:sessionOverrideRequested',
    'analysis:sessionResetRequested',
    'analysis:sessionCloseRequested',
    'analysis:sessionChanged',
  ]) {
    expect(await page.evaluate((value) => EventBus.listenerCount(value), topic)).toBe(0);
  }
});

async function setOverride(page, key, value) {
  const input = page.locator(`[data-session-field="${key}"]`);
  await input.fill(String(value));
  await input.blur();
}

function pipe(id, startPoint, endPoint, sourceAttributes) {
  return {
    id,
    name: id,
    type: 'PIPE',
    sourcePath: `/AREA/LINE/${id}`,
    sourceAttributes,
    nativeParams: { startPoint, endPoint },
  };
}

async function uploadJson(page, name, payload) {
  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}
