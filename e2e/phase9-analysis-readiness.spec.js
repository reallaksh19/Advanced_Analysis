import { expect, test } from '@playwright/test';

const ENGINEERING = {
  LINE_NO: 'LINE-900', PIPE_OD: 168.3, WALL_THICKNESS_MM: 7.11,
  MATERIAL_DENSITY_KG_M3: 7850, FLUID_DENSITY_OPE_KG_M3: 800,
  FLUID_DENSITY_HYD_KG_M3: 1000, INSULATION_THICKNESS_MM: 40,
  INSULATION_DENSITY_KG_M3: 120, TEMP_EXP_C1: 200, REFERENCE_TEMP_C: 20,
  ALPHA_PER_C: 0.000012, E_MPA: 200000, SA_MPA: 100,
};

const COMPLETE_PACKAGE = packageWith('PHASE9-BROWSER-READY', [
  pipe('PIPE-1', [0, 0, 0], [6000, 0, 0], ENGINEERING),
  pipe('PIPE-2', [6000, 0, 0], [6000, 3000, 0], { LINE_NO: 'LINE-900' }),
]);

const INCOMPLETE_PACKAGE = packageWith('PHASE9-BROWSER-INCOMPLETE', [
  pipe('PIPE-INCOMPLETE', [0, 0, 0], [1000, 0, 0], { LINE_NO: 'LINE-X' }),
]);

const NON_APPLICABLE_PACKAGE = packageWith('PHASE9-BROWSER-NOT-APPLICABLE', [{
  id: 'VALVE-1', name: 'Valve 1', type: 'VALVE', sourcePath: '/AREA/V/VALVE-1',
  nativeParams: { center: [0, 0, 0] }, sourceAttributes: {},
}]);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d';
  });
  await page.goto('/');
});

test('ready capability exposes solver provenance and completes only through a reviewed session', async ({ page }) => {
  await uploadJson(page, 'ready.json', COMPLETE_PACKAGE);
  await page.locator('[data-entity-id="PIPE-1"]').click();

  const card = readinessCard(page, 'support-load');
  await expect(card).toHaveAttribute('data-solver-id', 'workspace-support-load-screening');
  await expect(card).toHaveAttribute('data-method-id', 'ACCESS_TEMP_WALL_WEIGHTED_V1');
  await expect(card).toHaveAttribute('data-qualification-status', 'READY_FOR_REVIEWED_EXECUTION');
  await expect(card).toHaveAttribute('data-ready-to-review', 'true');
  await expect(card).toHaveAttribute('data-ready-to-run', 'true');
  await expect(card.locator('[data-role="analysis-readiness-summary"]')).toContainText('Ready to run');
  await expect(card).toContainText('BENCHMARKED_SCREENING');
  await expect(card).toContainText('Limitations');

  await page.locator('[data-analysis-type="support-load"]').click();
  await expect(page.locator('[data-role="analysis-session-method"]')).toContainText('workspace-support-load-screening v1.0.0');
  await expect(page.locator('[data-role="analysis-session-readiness"]')).toHaveText('Ready for reviewed execution');
  await page.getByRole('button', { name: 'Run reviewed analysis · support-load' }).click();
  await expect(page.locator('[data-role="analysis-status"]')).toHaveText('support-load completed · CALCULATED');
});

test('applicable incomplete capability remains reviewable but cannot run', async ({ page }) => {
  await uploadJson(page, 'incomplete.json', INCOMPLETE_PACKAGE);
  await page.locator('[data-entity-id="PIPE-INCOMPLETE"]').click();

  const card = readinessCard(page, 'support-load');
  await expect(card).toHaveAttribute('data-qualification-status', 'INPUT_REQUIRED');
  await expect(card).toHaveAttribute('data-ready-to-review', 'true');
  await expect(card).toHaveAttribute('data-ready-to-run', 'false');
  await expect(card.locator('[data-role="analysis-readiness-summary"]')).toContainText('Review required');
  await expect(page.locator('[data-analysis-type="support-load"]')).toBeEnabled();

  await page.locator('[data-analysis-type="support-load"]').click();
  await expect(page.locator('[data-role="analysis-session"]')).toBeVisible();
  await expect(page.locator('[data-role="analysis-session-method"]')).toContainText('ACCESS_TEMP_WALL_WEIGHTED_V1 v1');
  await expect(page.getByRole('button', { name: 'Run reviewed analysis · support-load' })).toBeDisabled();
  const session = await page.evaluate(() => AnalysisWorkspace.getAnalysisSession().session);
  expect(session.workspaceReadiness.qualificationStatus).toBe('INPUT_REQUIRED');
  expect(session.workspaceReadiness.missingInputs.length).toBeGreaterThan(0);
});

test('non-applicable capabilities cannot open an analysis session', async ({ page }) => {
  await uploadJson(page, 'valve.json', NON_APPLICABLE_PACKAGE);
  await page.locator('[data-entity-id="VALVE-1"]').click();

  for (const analysisType of ['support-load', 'pipe-screening']) {
    const card = readinessCard(page, analysisType);
    await expect(card).toHaveAttribute('data-qualification-status', 'NOT_APPLICABLE');
    await expect(card).toHaveAttribute('data-ready-to-review', 'false');
    await expect(card.locator('[data-role="analysis-readiness-summary"]')).toContainText(/requires|applicable only/i);
    await expect(page.locator(`[data-analysis-type="${analysisType}"]`)).toBeDisabled();
  }

  await page.evaluate(() => {
    EventBus.publish('analysis:sessionOpenRequested', { analysisType: 'pipe-screening', targetId: 'VALVE-1' });
  });
  expect(await page.evaluate(() => AnalysisWorkspace.getAnalysisSession().session)).toBeNull();
});

test('direct execution without a reviewed session is rejected', async ({ page }) => {
  await uploadJson(page, 'direct.json', COMPLETE_PACKAGE);
  await page.locator('[data-entity-id="PIPE-1"]').click();
  await page.evaluate(() => {
    EventBus.publish('analysis:requested', { analysisType: 'support-load', targetId: 'PIPE-1' });
  });
  await expect(page.locator('[data-role="analysis-status"]')).toHaveText('support-load failed');
  await expect(page.locator('.analysis-error')).toContainText('UNREVIEWED_ANALYSIS_SESSION');
});

function readinessCard(page, analysisType) {
  return page.locator(`[data-readiness-analysis-type="${analysisType}"]`);
}

function packageWith(packageHash, objects) {
  return {
    schema: 'rvm-selected-geometry-workspace-package/v1', packageHash,
    geometry: { objects, supports: [], branches: [] },
  };
}

function pipe(id, startPoint, endPoint, sourceAttributes) {
  return {
    id, name: id, type: 'PIPE', sourcePath: `/AREA/LINE/${id}`,
    sourceAttributes, nativeParams: { startPoint, endPoint },
  };
}

async function uploadJson(page, name, payload) {
  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}
