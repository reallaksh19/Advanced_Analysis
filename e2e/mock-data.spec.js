import { expect, test } from '@playwright/test';

const LAFEA_STAGES = ['LAFEA.1', 'LAFEA.2', 'LAFEA.3', 'LAFEA.4', 'LAFEA.5'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d';
  });
  await page.goto('/');
});

test('every Advanced tab loads deterministic [SIMULATED] input through its UI', async ({ page }) => {
  await page.getByRole('button', { name: '[SIMULATED] Load Mock Data', exact: true }).click();
  await expect.poll(() => page.evaluate(() => AnalysisWorkspace.getSnapshot().status)).toBe('ready');
  expect(await page.evaluate(() => AnalysisWorkspace.getSnapshot().dataset.summary)).toMatchObject({
    pipes: 2,
    supports: 2,
  });

  await page.locator('[data-application-nav="LOAD_CALC"]').click();
  const loadCalc = page.locator('[data-role="load-calc-consumer"]');
  await expect(loadCalc).toContainText('EMPTY');
  await loadCalc.locator('[data-load-calc-action="load-mock-data"]').click();
  await expect.poll(() => page.evaluate(
    () => AnalysisWorkspace.getApplicationViewState().activeViewId,
  )).toBe('WORKSPACE');
  await page.locator('[data-application-nav="LOAD_CALC"]').click();
  await expect(loadCalc).toContainText('SIMULATED-ADVANCED-WORKSPACE-V1');

  await page.locator('[data-application-nav="LAFEA"]').click();
  for (const stageId of LAFEA_STAGES) {
    await page.locator(`[data-stage-id="${stageId}"]`).click();
    await page.locator('[data-role="lafea-mock"]').click();
    await expect(page.locator('.lafea-workbench__status')).toHaveText('READY');
    const stage = await page.evaluate((id) => AnalysisWorkspace.getLafeaWorkbenchState().stages[id], stageId);
    expect(stage.document).not.toBeNull();
    expect(stage.execution).toBeNull();
  }

  await page.locator('[data-application-nav="LFEA"]').click();
  await page.locator('[data-role="lfea-mock"]').click();
  await expect(page.locator('.lfea-workbench__status')).toHaveText('READY');
  const collectionSelect = page.locator('.lfea-workbench__records select');
  const collectionPaths = await collectionSelect.locator('option').evaluateAll(
    (options) => options.map((option) => option.value),
  );
  for (const collectionPath of collectionPaths) {
    await collectionSelect.selectOption(collectionPath);
    await page.locator('[data-role="lfea-collection-mock"]').click();
    const state = await page.evaluate(() => AnalysisWorkspace.getLfeaWorkbenchState());
    expect(state.packageValue.schema).toBe('lfea-mesh-package/v1');
    expect(state.execution).toBeNull();
  }
});
