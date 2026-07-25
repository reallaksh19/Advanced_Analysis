import fs from 'node:fs';
import { expect, test } from '@playwright/test';

const STAGED_PACKAGE = {
  schema: 'inputxml-managed-stage/v1',
  packageHash: 'W10.4-BROWSER',
  unit: 'mm',
  objects: [{
    id: 'MODEL',
    name: 'Model',
    type: 'BRANCH',
    children: [
      {
        id: 'PIPE-LOAD',
        name: 'Pipe Load',
        type: 'PIPE',
        sourcePath: '/MODEL/PIPE-LOAD',
        sourceAttributes: {
          UNIT_PIPE_WEIGHT_KG_PER_M: 10,
          INSULATION_WEIGHT_KG_PER_M: 0,
          FLUID_WEIGHT_OPE_KG_PER_M: 2,
          FLUID_WEIGHT_HYD_KG_PER_M: 3,
        },
        nativeParams: { startPoint: [0, 0, 0], endPoint: [1000, 0, 0] },
      },
      {
        id: 'VALVE-LOAD',
        name: 'Valve Load',
        type: 'VALVE',
        sourcePath: '/MODEL/VALVE-LOAD',
        sourceAttributes: { COMPONENT_WEIGHT_KG: 5 },
        nativeParams: { center: [500, 100, 0] },
      },
    ],
  }],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d';
    globalThis.__modelLoadUrlAudit = { created: 0, revoked: 0 };
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      globalThis.__modelLoadUrlAudit.created += 1;
      return create(blob);
    };
    URL.revokeObjectURL = (url) => {
      globalThis.__modelLoadUrlAudit.revoked += 1;
      return revoke(url);
    };
  });
});

test('prepares independent cases, rebuilds explicitly, and exports deterministic primitives', async ({ page }) => {
  let downloadCount = 0;
  page.on('download', () => { downloadCount += 1; });
  await page.goto('/');
  await page.evaluate(() => {
    globalThis.__w104AnalysisStarts = 0;
    EventBus.subscribe('analysis:started', () => { globalThis.__w104AnalysisStarts += 1; });
  });
  await uploadJson(page, 'w10.4-browser.json', STAGED_PACKAGE);

  const card = page.locator('[data-role="model-load-card"]');
  await expect(card).toContainText('Model Load Cases & Primitives');
  await expect(page.locator('[data-role="model-load-profiles"]')).toContainText('STANDARD_GRAVITY_9_80665_V1');
  await expect(card.locator('[data-load-case-id="EMPTY"]')).toContainText('Mass 15');
  await expect(card.locator('[data-load-case-id="OPE"]')).toContainText('Mass 17');
  await expect(card.locator('[data-load-case-id="HYD"]')).toContainText('Mass 18');
  expect(downloadCount).toBe(0);
  expect(await page.evaluate(() => globalThis.__w104AnalysisStarts)).toBe(0);

  const initial = await page.evaluate(() => ({
    cases: AnalysisWorkspace.getLoadCaseSet(),
    primitives: AnalysisWorkspace.getLoadPrimitiveSet(),
    readiness: AnalysisWorkspace.getModelLoadReadinessAudit(),
    snapshot: AnalysisWorkspace.getSnapshot(),
    sharedHash: AnalysisWorkspace.getSharedModel().semanticHash,
    topologyHash: AnalysisWorkspace.getTopologyGraph().semanticHash,
    attachmentHash: AnalysisWorkspace.getSupportAttachmentModel()?.semanticHash || null,
    restraintHash: AnalysisWorkspace.getRestraintCapabilityModel()?.semanticHash || null,
  }));
  expect(initial.cases.loadCases.map((row) => row.loadCaseId)).toEqual(['EMPTY', 'HYD', 'OPE']);
  expect(initial.primitives.summary.distributedPrimitiveCount).toBe(3);
  expect(initial.primitives.summary.pointPrimitiveCount).toBe(3);
  expect(initial.readiness.cases.every((row) => row.qualification === 'READY')).toBe(true);

  await page.locator('[data-entity-id="VALVE-LOAD"]').click();
  await page.getByRole('button', { name: 'Rebuild Model Loads' }).click();
  await expect(page.locator('[data-role="model-load-status"]')).toContainText('rebuilt');
  const rebuilt = await page.evaluate(() => AnalysisWorkspace.getLoadPrimitiveSet());
  expect(rebuilt.semanticHash).toBe(initial.primitives.semanticHash);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Load Case/Primitive Model' }).click(),
  ]);
  const content = fs.readFileSync(await download.path(), 'utf8');
  const exported = JSON.parse(content);
  expect(download.suggestedFilename()).toBe('model-load-w10-4-browser.json');
  expect(exported.schema).toBe('model-load-export/v1');
  expect(exported.loadCaseSet.semanticHash).toBe(initial.cases.semanticHash);
  expect(exported.loadPrimitiveSet.semanticHash).toBe(initial.primitives.semanticHash);
  expect(exported.readinessAudit.semanticHash).toBe(initial.readiness.semanticHash);
  expect(content.endsWith('\n')).toBe(true);
  expect(await page.evaluate(() => globalThis.__modelLoadUrlAudit)).toEqual({ created: 1, revoked: 1 });

  const after = await page.evaluate(() => ({
    snapshot: AnalysisWorkspace.getSnapshot(),
    sharedHash: AnalysisWorkspace.getSharedModel().semanticHash,
    topologyHash: AnalysisWorkspace.getTopologyGraph().semanticHash,
    attachmentHash: AnalysisWorkspace.getSupportAttachmentModel()?.semanticHash || null,
    restraintHash: AnalysisWorkspace.getRestraintCapabilityModel()?.semanticHash || null,
  }));
  expect(after.snapshot.dataset.datasetId).toBe(initial.snapshot.dataset.datasetId);
  expect(after.snapshot.selectedEntityId).toBe('VALVE-LOAD');
  expect(after.snapshot.version).toBe(initial.snapshot.version + 1);
  expect(after.sharedHash).toBe(initial.sharedHash);
  expect(after.topologyHash).toBe(initial.topologyHash);
  expect(after.attachmentHash).toBe(initial.attachmentHash);
  expect(after.restraintHash).toBe(initial.restraintHash);
  expect(await page.evaluate(() => globalThis.__w104AnalysisStarts)).toBe(0);
});

test('clear and teardown remove model-load state and listeners', async ({ page }) => {
  let downloadCount = 0;
  page.on('download', () => { downloadCount += 1; });
  await page.goto('/');
  await uploadJson(page, 'w10.4-browser.json', STAGED_PACKAGE);
  await expect(page.getByRole('button', { name: 'Export Load Case/Primitive Model' })).toBeVisible();

  await page.locator('[data-action="clear-dataset"]').click();
  await expect(page.locator('[data-role="model-load-card"]')).toContainText('Import a dataset');
  expect(await page.evaluate(() => AnalysisWorkspace.getLoadCaseSet())).toBeNull();
  expect(await page.evaluate(() => AnalysisWorkspace.getLoadPrimitiveSet())).toBeNull();
  expect(await page.evaluate(() => AnalysisWorkspace.getModelLoadReadinessAudit())).toBeNull();

  await uploadJson(page, 'w10.4-browser.json', STAGED_PACKAGE);
  await page.evaluate(() => AnalysisWorkspace.destroy());
  expect(await page.locator('#root').textContent()).toBe('');
  expect(await page.evaluate(() => AnalysisWorkspace.getLoadPrimitiveSet())).toBeNull();
  await page.evaluate(() => EventBus.publish('modelLoad:exportRequested', {}));
  await page.waitForTimeout(100);
  expect(downloadCount).toBe(0);
  expect(await page.evaluate(() => globalThis.__modelLoadUrlAudit)).toEqual({ created: 0, revoked: 0 });
});

async function uploadJson(page, name, payload) {
  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}
