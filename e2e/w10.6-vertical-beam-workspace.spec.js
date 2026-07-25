import fs from 'node:fs';
import { expect, test } from '@playwright/test';

const STAGED_PACKAGE = {
  schema: 'inputxml-managed-stage/v1', packageHash: 'W10.6-BROWSER', unit: 'mm',
  objects: [
    { id: 'PIPES', name: 'Pipes', type: 'BRANCH', children: [
      pipe('PIPE-A', [0, 0, 0], [1000, 0, 0]),
      pipe('PIPE-B', [1000, 0, 0], [2000, 0, 0]),
    ] },
    { id: 'SUPPORTS', name: 'Supports', type: 'GROUP', children: [
      support('SUP-START', [0, 0, 0], 'PIPE-A:port:start'),
      support('SUP-END', [2000, 0, 0], 'PIPE-B:port:end'),
    ] },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d';
    globalThis.__w106UrlAudit = { created: 0, revoked: 0 };
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { globalThis.__w106UrlAudit.created += 1; return create(blob); };
    URL.revokeObjectURL = (url) => { globalThis.__w106UrlAudit.revoked += 1; return revoke(url); };
  });
});

test('prepares explicit-EI readiness automatically and solves only on explicit action', async ({ page }) => {
  let downloadCount = 0;
  page.on('download', () => { downloadCount += 1; });
  await page.goto('/');
  await page.evaluate(() => {
    globalThis.__w106AnalysisStarts = 0; globalThis.__w106LegacyEvents = 0;
    EventBus.subscribe('analysis:started', () => { globalThis.__w106AnalysisStarts += 1; });
    EventBus.subscribe('modelSupportLoad:readinessChanged', () => { globalThis.__w106LegacyEvents += 1; });
  });
  await uploadJson(page, 'w10.6-browser.json', STAGED_PACKAGE);

  const card = page.locator('[data-role="vertical-beam-card"]');
  await expect(card).toContainText('Explicit-EI Vertical Beam Solver');
  await expect(page.locator('[data-role="vertical-beam-readiness"]')).toContainText('Ready 3 · Blocked 0');
  await expect(page.locator('[data-role="vertical-beam-solution-health"]')).toContainText('Solution not run');
  expect(await page.evaluate(() => AnalysisWorkspace.getFlexuralPropertyProjection().summary.readyIntervalCount)).toBe(2);
  expect(await page.evaluate(() => AnalysisWorkspace.getVerticalBeamModel().summary.readyPathCaseCount)).toBe(3);
  expect(await page.evaluate(() => AnalysisWorkspace.getVerticalBeamSolution())).toBeNull();
  expect(await page.evaluate(() => AnalysisWorkspace.getVerticalBeamSolverAudit())).toBeNull();
  expect(downloadCount).toBe(0);

  await page.locator('[data-entity-id="PIPE-A"]').click();
  const before = await upstreamSnapshot(page);
  const eventsBefore = await eventCounts(page);
  await page.getByRole('button', { name: 'Rebuild Vertical Beam Model' }).click();
  await expect(page.locator('[data-role="vertical-beam-status"]')).toContainText('rebuilt');
  expect(await page.evaluate(() => AnalysisWorkspace.getVerticalBeamSolution())).toBeNull();

  await page.getByRole('button', { name: 'Solve Vertical Stiffness' }).click();
  await expect(page.locator('[data-role="vertical-beam-status"]')).toContainText('completed');
  const result = await page.evaluate(() => ({
    projection: AnalysisWorkspace.getFlexuralPropertyProjection(),
    model: AnalysisWorkspace.getVerticalBeamModel(),
    solution: AnalysisWorkspace.getVerticalBeamSolution(),
    audit: AnalysisWorkspace.getVerticalBeamSolverAudit(),
  }));
  expect(result.projection.schema).toBe('flexural-property-projection/v1');
  expect(result.model.schema).toBe('vertical-beam-model/v1');
  expect(result.solution.schema).toBe('vertical-beam-solution/v1');
  expect(result.audit.schema).toBe('vertical-beam-solver-audit/v1');
  expect(result.solution.pathCases).toHaveLength(3);
  expect(result.solution.pathCases.every((row) => row.qualification === 'READY')).toBe(true);
  expect(result.solution.pathCases.every((row) => row.maximumAbsoluteDisplacementM > 0)).toBe(true);
  expect(result.solution.pathCases.every((row) => row.supportForceResults.length === 2)).toBe(true);
  expect(result.solution.pathCases.every((row) => row.forceEquilibrium.pass && row.momentEquilibrium.pass && row.matrixResidual.pass)).toBe(true);
  await expect(page.locator('[data-role="vertical-beam-solution-health"]')).toContainText('EMPTY · READY');
  await expect(page.locator('[data-role="vertical-beam-solution-health"]')).toContainText('Max v');
  await expect(page.locator('[data-role="vertical-beam-solution-health"]')).toContainText('Moment residual');
  expect(await eventCounts(page)).toEqual(eventsBefore);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Vertical Beam Solution' }).click(),
  ]);
  const content = fs.readFileSync(await download.path(), 'utf8'), exported = JSON.parse(content);
  expect(download.suggestedFilename()).toBe('vertical-beam-solution-w10-6-browser.json');
  expect(exported.schema).toBe('vertical-beam-solution-export/v1');
  expect(exported.flexuralPropertyProjection.semanticHash).toBe(result.projection.semanticHash);
  expect(exported.verticalBeamModel.semanticHash).toBe(result.model.semanticHash);
  expect(exported.verticalBeamSolution.semanticHash).toBe(result.solution.semanticHash);
  expect(exported.verticalBeamSolverAudit.semanticHash).toBe(result.audit.semanticHash);
  expect(content.endsWith('\n')).toBe(true);
  expect(await page.evaluate(() => globalThis.__w106UrlAudit)).toEqual({ created: 1, revoked: 1 });
  expect(await eventCounts(page)).toEqual(eventsBefore);

  const after = await upstreamSnapshot(page);
  expect(after.snapshot.dataset.datasetId).toBe(before.snapshot.dataset.datasetId);
  expect(after.snapshot.selectedEntityId).toBe(before.snapshot.selectedEntityId);
  expect(after.snapshot.version).toBe(before.snapshot.version);
  expect(after.hashes).toEqual(before.hashes);
});

test('clear and teardown remove beam state and listeners', async ({ page }) => {
  let downloadCount = 0;
  page.on('download', () => { downloadCount += 1; });
  await page.goto('/');
  await uploadJson(page, 'w10.6-browser.json', STAGED_PACKAGE);
  await page.getByRole('button', { name: 'Solve Vertical Stiffness' }).click();
  expect(await page.evaluate(() => AnalysisWorkspace.getVerticalBeamSolution())).not.toBeNull();

  await page.locator('[data-action="clear-dataset"]').click();
  await expect(page.locator('[data-role="vertical-beam-card"]')).toContainText('Import a dataset');
  expect(await page.evaluate(() => AnalysisWorkspace.getFlexuralPropertyProjection())).toBeNull();
  expect(await page.evaluate(() => AnalysisWorkspace.getVerticalBeamModel())).toBeNull();
  expect(await page.evaluate(() => AnalysisWorkspace.getVerticalBeamSolution())).toBeNull();
  expect(await page.evaluate(() => AnalysisWorkspace.getVerticalBeamSolverAudit())).toBeNull();

  await uploadJson(page, 'w10.6-browser.json', STAGED_PACKAGE);
  await page.evaluate(() => AnalysisWorkspace.destroy());
  expect(await page.locator('#root').textContent()).toBe('');
  expect(await page.evaluate(() => AnalysisWorkspace.getVerticalBeamModel())).toBeNull();
  await page.evaluate(() => EventBus.publish('verticalBeam:exportRequested', {}));
  await page.waitForTimeout(100);
  expect(downloadCount).toBe(0);
  expect(await page.evaluate(() => globalThis.__w106UrlAudit)).toEqual({ created: 0, revoked: 0 });
});

function pipe(id, startPoint, endPoint) {
  return {
    id, name: id, type: 'PIPE', sourcePath: `/MODEL/PIPES/${id}`,
    sourceAttributes: {
      LINE_ID: 'LINE-W10.6', SYSTEM_ID: 'SYS-W10.6', EI_N_M2: 2000000,
      UNIT_PIPE_WEIGHT_KG_PER_M: 10, INSULATION_THICKNESS_MM: 0,
      FLUID_WT_OPE_KG_M: 2, FLUID_WT_HYD_KG_M: 3,
    },
    nativeParams: { startPoint, endPoint },
  };
}
function support(id, position, attachedPortId) {
  return {
    id, name: id, type: 'SUPPORT', sourcePath: `/MODEL/SUPPORTS/${id}`,
    sourceAttributes: {
      LINE_ID: 'LINE-W10.6', SYSTEM_ID: 'SYS-W10.6', POS: { x: position[0], y: position[1], z: position[2] },
      ATTACHED_PORT_ID: attachedPortId, SUPPORT_TYPE: 'ANCHOR', VERTICAL_CAPABILITY: 'RESTRAINED',
    },
  };
}
async function uploadJson(page, name, payload) { await page.locator('[data-role="dataset-file"]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) }); }
async function eventCounts(page) { return page.evaluate(() => ({ analysis: globalThis.__w106AnalysisStarts, legacy: globalThis.__w106LegacyEvents })); }
async function upstreamSnapshot(page) {
  return page.evaluate(() => ({
    snapshot: AnalysisWorkspace.getSnapshot(),
    hashes: {
      shared: AnalysisWorkspace.getSharedModel().semanticHash,
      topology: AnalysisWorkspace.getTopologyGraph().semanticHash,
      attachment: AnalysisWorkspace.getSupportAttachmentModel().semanticHash,
      restraint: AnalysisWorkspace.getRestraintCapabilityModel().semanticHash,
      cases: AnalysisWorkspace.getLoadCaseSet().semanticHash,
      primitives: AnalysisWorkspace.getLoadPrimitiveSet().semanticHash,
      readiness: AnalysisWorkspace.getModelLoadReadinessAudit().semanticHash,
      paths: AnalysisWorkspace.getVerticalLoadPathModel().semanticHash,
    },
  }));
}
