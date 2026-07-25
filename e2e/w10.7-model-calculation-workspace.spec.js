import fs from 'node:fs';
import { expect, test } from '@playwright/test';

const STAGED_PACKAGE = {
  schema: 'inputxml-managed-stage/v1', packageHash: 'W10.7-BROWSER', unit: 'mm',
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
    globalThis.__w107UrlAudit = { created: 0, revoked: 0 };
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { globalThis.__w107UrlAudit.created += 1; return create(blob); };
    URL.revokeObjectURL = (url) => { globalThis.__w107UrlAudit.revoked += 1; return revoke(url); };
  });
});

test('creates, archives, selects and explicitly exports model calculation packages', async ({ page }) => {
  let downloadCount = 0;
  page.on('download', () => { downloadCount += 1; });
  await page.goto('/');
  await installEventAudit(page);
  await uploadJson(page, 'w10.7-browser.json', STAGED_PACKAGE);

  const card = page.locator('[data-role="model-calculation-card"]');
  await expect(card).toContainText('Model Calculation Package & Archive');
  expect(await page.evaluate(() => AnalysisWorkspace.getModelCalculationLedger().entries.length)).toBe(0);
  expect(await page.evaluate(() => AnalysisWorkspace.getActiveModelCalculationPackage())).toBeNull();
  expect(downloadCount).toBe(0);

  await page.getByRole('button', { name: 'Run Tributary Screening' }).click();
  await expect(page.locator('[data-role="support-load-screening-status"]')).toContainText('completed');
  await page.getByRole('button', { name: 'Solve Vertical Stiffness' }).click();
  await expect(page.locator('[data-role="vertical-beam-status"]')).toContainText('completed');
  await expect(page.locator('[data-role="model-calculation-availability"]')).toContainText('Screening available · Beam available');
  expect(await page.evaluate(() => AnalysisWorkspace.getActiveModelCalculationPackage())).toBeNull();

  const upstreamBefore = await upstreamSnapshot(page), eventBaseline = await eventCounts(page);
  await page.locator('[data-model-calculation-control="mode"]').selectOption('SCREENING_AND_VERTICAL_BEAM');
  await page.getByRole('button', { name: 'Create Calculation Package' }).click();
  await expect(page.locator('[data-role="model-calculation-status"]')).toContainText('Archived');

  const first = await activeEvidence(page);
  expect(first.ledger.schema).toBe('model-calculation-ledger/v1');
  expect(first.ledger.entries).toHaveLength(1);
  expect(first.package.schema).toBe('model-calculation-package/v1');
  expect(first.package.packageMode).toBe('SCREENING_AND_VERTICAL_BEAM');
  expect(first.package.methodEvidence.map((row) => row.engineeringLevel).sort()).toEqual(['BENCHMARKED_SCREENING', 'LINEAR_ELASTIC_VERTICAL_BEAM']);
  expect(first.report.schema).toBe('model-calculation-report/v1');
  expect(first.package.qualificationSummary).toHaveLength(3);
  expect(JSON.stringify(first.package)).toContain('screenedVerticalForceN');
  expect(JSON.stringify(first.package)).toContain('signedSupportForceN');

  await page.getByRole('button', { name: 'Create Calculation Package' }).click();
  expect(await page.evaluate(() => AnalysisWorkspace.getModelCalculationLedger().entries.length)).toBe(1);
  await page.locator('[data-model-calculation-control="mode"]').selectOption('VERTICAL_BEAM_ONLY');
  await page.getByRole('button', { name: 'Create Calculation Package' }).click();
  expect(await page.evaluate(() => AnalysisWorkspace.getModelCalculationLedger().entries.length)).toBe(2);
  await page.locator('[data-model-calculation-control="entry"]').selectOption(first.ledger.entries[0].entryId);
  await page.getByRole('button', { name: 'Select Archived Package' }).click();
  expect(await page.evaluate(() => AnalysisWorkspace.getActiveModelCalculationPackage().packageId)).toBe(first.package.packageId);

  const downloads = [];
  for (const name of ['Export Package JSON', 'Export Report CSV', 'Export Report Markdown']) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()]);
    downloads.push({ name: download.suggestedFilename(), content: fs.readFileSync(await download.path(), 'utf8') });
  }
  expect(downloads.every((row) => row.content.endsWith('\n'))).toBe(true);
  expect(downloads[0].name).toMatch(/^model-calculation-w10-7-browser-[a-f0-9]+\.json$/);
  expect(JSON.parse(downloads[0].content).package.packageId).toBe(first.package.packageId);
  expect(downloads[1].content).toContain('screening force');
  expect(downloads[1].content).toContain('beam support force');
  expect(downloads[2].content).toContain('not a full pipe-stress or code-compliance report');
  expect(await page.evaluate(() => globalThis.__w107UrlAudit)).toEqual({ created: 3, revoked: 3 });
  expect(await eventCounts(page)).toEqual(eventBaseline);
  expect(await upstreamSnapshot(page)).toEqual(upstreamBefore);
  expect(downloadCount).toBe(3);
});

test('resets history on dataset replacement, explicit clear and teardown', async ({ page }) => {
  let downloadCount = 0;
  page.on('download', () => { downloadCount += 1; });
  await page.goto('/');
  await installEventAudit(page);
  await uploadJson(page, 'w10.7-browser.json', STAGED_PACKAGE);
  await prepareAndCreate(page);
  expect(await page.evaluate(() => AnalysisWorkspace.getModelCalculationLedger().entries.length)).toBe(1);

  const archivedId = await page.evaluate(() => AnalysisWorkspace.getActiveModelCalculationPackage().packageId);
  await page.locator('[data-entity-id="PIPE-B"]').click();
  expect(await page.evaluate(() => AnalysisWorkspace.getModelCalculationLedger().entries.length)).toBe(1);
  expect(await page.evaluate(() => AnalysisWorkspace.getActiveModelCalculationPackage().packageId)).toBe(archivedId);
  await uploadJson(page, 'w10.7-browser-2.json', { ...STAGED_PACKAGE, packageHash: 'W10.7-BROWSER-2' });
  expect(await page.evaluate(() => AnalysisWorkspace.getModelCalculationLedger().entries.length)).toBe(0);
  expect(await page.evaluate(() => AnalysisWorkspace.getActiveModelCalculationReport())).toBeNull();

  await prepareAndCreate(page);
  await page.getByRole('button', { name: 'Clear Calculation History' }).click();
  expect(await page.evaluate(() => AnalysisWorkspace.getModelCalculationLedger().entries.length)).toBe(0);
  await page.evaluate(() => AnalysisWorkspace.destroy());
  expect(await page.locator('#root').textContent()).toBe('');
  expect(await page.evaluate(() => AnalysisWorkspace.getModelCalculationLedger())).toBeNull();
  await page.evaluate(() => EventBus.publish('modelCalculation:exportRequested', { format: 'JSON' }));
  await page.waitForTimeout(100);
  expect(downloadCount).toBe(0);
  expect(await page.evaluate(() => globalThis.__w107UrlAudit)).toEqual({ created: 0, revoked: 0 });
});

async function prepareAndCreate(page) {
  await page.getByRole('button', { name: 'Run Tributary Screening' }).click();
  await page.getByRole('button', { name: 'Solve Vertical Stiffness' }).click();
  await page.locator('[data-model-calculation-control="mode"]').selectOption('SCREENING_AND_VERTICAL_BEAM');
  await page.getByRole('button', { name: 'Create Calculation Package' }).click();
}
async function installEventAudit(page) {
  await page.evaluate(() => {
    globalThis.__w107Events = { analysis: 0, screeningRuns: 0, beamSolves: 0 };
    EventBus.subscribe('analysis:started', () => { globalThis.__w107Events.analysis += 1; });
    EventBus.subscribe('supportLoadScreening:runRequested', () => { globalThis.__w107Events.screeningRuns += 1; });
    EventBus.subscribe('verticalBeam:solveRequested', () => { globalThis.__w107Events.beamSolves += 1; });
  });
}
async function uploadJson(page, name, payload) { await page.locator('[data-role="dataset-file"]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) }); }
async function activeEvidence(page) { return page.evaluate(() => ({ ledger: AnalysisWorkspace.getModelCalculationLedger(), package: AnalysisWorkspace.getActiveModelCalculationPackage(), report: AnalysisWorkspace.getActiveModelCalculationReport() })); }
async function eventCounts(page) { return page.evaluate(() => globalThis.__w107Events); }
async function upstreamSnapshot(page) {
  return page.evaluate(() => ({
    selectedEntityId: AnalysisWorkspace.getSnapshot().selectedEntityId,
    version: AnalysisWorkspace.getSnapshot().version,
    hashes: {
      shared: AnalysisWorkspace.getSharedModel().semanticHash,
      topology: AnalysisWorkspace.getTopologyGraph().semanticHash,
      attachment: AnalysisWorkspace.getSupportAttachmentModel().semanticHash,
      restraint: AnalysisWorkspace.getRestraintCapabilityModel().semanticHash,
      cases: AnalysisWorkspace.getLoadCaseSet().semanticHash,
      primitives: AnalysisWorkspace.getLoadPrimitiveSet().semanticHash,
      readiness: AnalysisWorkspace.getModelLoadReadinessAudit().semanticHash,
      paths: AnalysisWorkspace.getVerticalLoadPathModel().semanticHash,
      screening: AnalysisWorkspace.getSupportLoadScreening().semanticHash,
      beam: AnalysisWorkspace.getVerticalBeamSolution().semanticHash,
    },
  }));
}
function pipe(id, startPoint, endPoint) {
  return { id, name: id, type: 'PIPE', sourcePath: `/MODEL/PIPES/${id}`, sourceAttributes: { LINE_ID: 'LINE-W10.7', SYSTEM_ID: 'SYS-W10.7', EI_N_M2: 2000000, UNIT_PIPE_WEIGHT_KG_PER_M: 10, INSULATION_THICKNESS_MM: 0, FLUID_WT_OPE_KG_M: 2, FLUID_WT_HYD_KG_M: 3 }, nativeParams: { startPoint, endPoint } };
}
function support(id, position, attachedPortId) {
  return { id, name: id, type: 'SUPPORT', sourcePath: `/MODEL/SUPPORTS/${id}`, sourceAttributes: { LINE_ID: 'LINE-W10.7', SYSTEM_ID: 'SYS-W10.7', POS: { x: position[0], y: position[1], z: position[2] }, ATTACHED_PORT_ID: attachedPortId, SUPPORT_TYPE: 'ANCHOR', VERTICAL_CAPABILITY: 'RESTRAINED' } };
}
