import { expect, test } from '@playwright/test';

const ENGINEERING_ATTRIBUTES = {
  LINE_NO: 'LINE-100',
  PIPE_OD: 168.3,
  WALL_THICKNESS_MM: 7.11,
  MATERIAL_DENSITY_KG_M3: 7850,
  FLUID_DENSITY_OPE_KG_M3: 800,
  FLUID_DENSITY_HYD_KG_M3: 1000,
  INSULATION_THICKNESS_MM: 40,
  INSULATION_DENSITY_KG_M3: 120,
  TEMP_EXP_C1: 200,
  REFERENCE_TEMP_C: 20,
  ALPHA_PER_C: 0.000012,
  E_MPA: 200000,
  SA_MPA: 100,
};

const COMPLETE_PACKAGE = {
  schema: 'rvm-selected-geometry-workspace-package/v1',
  packageHash: 'PHASE5-BROWSER',
  geometry: {
    objects: [
      pipe('PIPE-1', [0, 0, 0], [6000, 0, 0], ENGINEERING_ATTRIBUTES),
      pipe('PIPE-2', [6000, 0, 0], [6000, 3000, 0], { LINE_NO: 'LINE-100' }),
    ],
    supports: [{
      id: 'SUP-1',
      name: 'Guide Support',
      type: 'GUIDE',
      sourcePath: '/AREA-A/LINE-100/SUP-1',
      sourceAttributes: { PIPE_ID: 'PIPE-1', LINE_NO: 'LINE-100' },
      nativeParams: { center: [3000, 0, 0] },
    }],
    branches: [],
  },
};

const INCOMPLETE_PACKAGE = {
  schema: 'rvm-selected-geometry-workspace-package/v1',
  packageHash: 'PHASE5-INCOMPLETE',
  geometry: {
    objects: [pipe('PIPE-INCOMPLETE', [0, 0, 0], [1000, 0, 0], { LINE_NO: 'LINE-X' })],
    supports: [],
    branches: [],
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d';
  });
});

test('pipe selection reviews and executes certified support-load and screening capabilities', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'complete.json', COMPLETE_PACKAGE);
  await page.locator('[data-entity-id="PIPE-1"]').click();

  const supportLoad = page.locator('[data-analysis-type="support-load"]');
  const screening = page.locator('[data-analysis-type="pipe-screening"]');
  await expect(supportLoad).toBeEnabled();
  await expect(screening).toBeEnabled();

  await supportLoad.click();
  await expect(page.locator('[data-role="analysis-session-readiness"]')).toHaveText(
    'Ready for reviewed execution',
  );
  await page.getByRole('button', { name: 'Run reviewed analysis · support-load' }).click();
  await expect(page.locator('[data-role="analysis-status"]')).toHaveText(
    'support-load completed · CALCULATED',
  );
  const result = page.locator('[data-role="analysis-result"]');
  await expect(result).toContainText('summary.sourcePipeId');
  await expect(result).toContainText('PIPE-1');
  await expect(result).toContainText('results.vertical.opeVA');

  await screening.click();
  await expect(page.locator('[data-role="analysis-session"]')).toContainText('Connected pipe legs');
  await page.getByRole('button', { name: 'Run reviewed analysis · pipe-screening' }).click();
  await expect(page.locator('[data-role="analysis-status"]')).toContainText(
    'pipe-screening completed ·',
  );
  await expect(result).toContainText('summary.sourceEntityCount');
  await expect(result).toContainText('2');
  await expect(result).toContainText('results.classification.geometryType');
});

test('linked support resolves to its pipe without panel-side calculator coupling', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'complete.json', COMPLETE_PACKAGE);
  await page.locator('[data-entity-id="SUP-1"]').click();

  const supportLoad = page.locator('[data-analysis-type="support-load"]');
  await expect(supportLoad).toBeEnabled();
  await supportLoad.click();
  await page.getByRole('button', { name: 'Run reviewed analysis · support-load' }).click();

  await expect(page.locator('[data-role="analysis-status"]')).toHaveText(
    'support-load completed · CALCULATED',
  );
  await expect(page.locator('[data-role="analysis-result"]')).toContainText('summary.sourcePipeId');
  await expect(page.locator('[data-role="analysis-result"]')).toContainText('PIPE-1');
  expect(await page.evaluate(() => AnalysisWorkspace.getSnapshot().selectedEntityId)).toBe('SUP-1');
});

test('incomplete engineering data opens review and forced requests fail deterministically', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'incomplete.json', INCOMPLETE_PACKAGE);
  await page.locator('[data-entity-id="PIPE-INCOMPLETE"]').click();

  await expect(page.locator('[data-role="analysis-capabilities"]')).toContainText(
    'Support-load inputs are incomplete',
  );
  await page.locator('[data-analysis-type="support-load"]').click();
  await expect(page.locator('[data-role="analysis-session-readiness"]')).toContainText(
    'Support-load inputs are incomplete',
  );
  await expect(page.getByRole('button', { name: 'Run reviewed analysis · support-load' })).toBeDisabled();

  await page.evaluate(() => {
    EventBus.publish('analysis:requested', {
      analysisType: 'support-load',
      targetId: 'PIPE-INCOMPLETE',
    });
  });
  await expect(page.locator('[data-role="analysis-status"]')).toHaveText('support-load failed');
  await expect(page.locator('[data-role="analysis-result"]')).toContainText('UNREVIEWED_ANALYSIS_SESSION');
});

test('selection change clears previous result and destroy removes analysis listeners', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'complete.json', COMPLETE_PACKAGE);
  await page.locator('[data-entity-id="PIPE-1"]').click();
  await page.locator('[data-analysis-type="support-load"]').click();
  await page.getByRole('button', { name: 'Run reviewed analysis · support-load' }).click();
  await expect(page.locator('[data-role="analysis-status"]')).toContainText('completed');

  await page.locator('[data-entity-id="PIPE-2"]').click();
  await expect(page.locator('[data-role="analysis-status"]')).toHaveText(
    'No analysis has been run for this selection.',
  );
  await expect(page.locator('[data-role="analysis-session"]')).toBeEmpty();
  await expect(page.locator('[data-role="analysis-result"]')).not.toContainText('summary.sourcePipeId');

  await page.evaluate(() => AnalysisWorkspace.destroy());
  const topics = [
    'analysis:capabilitiesChanged',
    'analysis:sessionOpenRequested',
    'analysis:sessionOverrideRequested',
    'analysis:sessionResetRequested',
    'analysis:sessionCloseRequested',
    'analysis:sessionChanged',
    'analysis:requested',
    'analysis:started',
    'analysis:completed',
    'analysis:failed',
  ];
  for (const topic of topics) {
    expect(await page.evaluate((value) => EventBus.listenerCount(value), topic)).toBe(0);
  }
});

function pipe(id, startPoint, endPoint, sourceAttributes) {
  return {
    id,
    name: id,
    type: 'PIPE',
    sourcePath: `/AREA-A/LINE-100/${id}`,
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
