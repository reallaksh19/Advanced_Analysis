import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = Object.freeze({
  sjson: 'F:\\CODE-5-SS\\3D_Converters\\Benchmarks\\1885Sjson\\Sjson.json',
  profile: path.join(root, 'project-data/1885s-project-data-profile.json'),
  lineList: 'D:\\Code3\\EF\\AML-91-PDFEED-PX-2345-00001-0000 BC4.xlsx',
  pipingClass: 'F:\\CODE-4-SS\\SS2\\3D_Viewer_github_clone\\docs\\Masters\\Piping class master.xlsx',
  componentWeight: 'F:\\CODE-6\\XML_Compare_Utilities\\docs\\Masters\\wtValveweights.json',
});
const targetEntityId = '=1006649732/51250';
const retainedEntityIds = Object.freeze([
  '=1006649732/51249', '=1006649732/51255', '=1006649732/51254',
  'PIPE AUTO /ASIM-1885-6"-S8811951-91261M7-HC-01/B2 7',
]);

test('1885S Workspace starts, imports the supplied SJSON, and preserves a valid dataset after a rejected import', async ({ page }) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  for (const label of ['Workspace', 'Edit, Topo fix and Load Calc', 'LAFEA', 'LFEA']) await expect(navigation.getByRole('button', { name: label, exact: true })).toHaveCount(1);
  await page.locator('[data-role="dataset-file"]').setInputFiles(sources.sjson);
  await expect.poll(() => page.evaluate(() => AnalysisWorkspace.getSnapshot().status)).toBe('ready');
  const imported = await page.evaluate(() => ({
    nodeCount: AnalysisWorkspace.getSnapshot().dataset.summary.nodeCount,
    sourceSha256: AnalysisWorkspace.getSnapshot().dataset.sourceSha256,
    support: AnalysisWorkspace.getSupportSiteModel()?.summary,
    routes: AnalysisWorkspace.getRoutePartitionModel()?.summary,
  }));
  expect(imported).toMatchObject({
    nodeCount: 279,
    sourceSha256: '6b2c8b01ab0ba6ec8e9e7c42eb4a719668ffd2dc4dbe4790d27cf426a1f60288',
    support: { sourceSupportRecordCount: 139, supportAssemblyCount: 38, physicalLocationCount: 37 },
    routes: { routeCount: 13, edgeCount: 127, physicalEdgeCount: 124, autoCarrierCount: 3 },
  });
  const beforeRejected = await page.evaluate(() => AnalysisWorkspace.getSnapshot());
  await page.locator('[data-role="dataset-file"]').setInputFiles({ name: 'rejected.json', mimeType: 'application/json', buffer: Buffer.from('{"schema":"unsupported/v1"}') });
  await expect(page.locator('[data-role="tree-error"]')).toBeVisible();
  expect(await page.evaluate(() => AnalysisWorkspace.getSnapshot())).toEqual(beforeRejected);
});

test('1885S WebGL replacement uses exact master rows and supports commit, undo, and redo', async ({ page }) => {
  await page.goto('/');
  await importDatasetAndAuthorities(page);
  await expect(page.locator('[data-role="viewport-status"]')).toContainText('150 source-backed items rendered');
  await page.locator('[data-role="tree-search"]').fill('88-UZV-11951');
  await page.locator(`[data-entity-id="${targetEntityId}"]`).click();
  await expect.poll(() => page.evaluate(() => AnalysisWorkspace.getSnapshot().selectedEntityId)).toBe(targetEntityId);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('[data-role="viewport-edit-bar"]')).toContainText('Preview ready');
  const startedAt = Date.now();
  await page.getByRole('button', { name: 'Commit', exact: true }).click();
  const commitMs = Date.now() - startedAt;
  expect(commitMs).toBeLessThanOrEqual(500);
  const committed = await page.evaluate(({ retained }) => {
    const dataset = AnalysisWorkspace.getSnapshot().dataset;
    const replacements = dataset.entities.filter((entity) => entity.properties?.attributes?.REPLACEMENT_COMMAND_ID);
    return {
      version: dataset.version,
      stale: dataset.calculationFreshness,
      replacements: replacements.map((entity) => ({ type: entity.entityType, lengthMm: entity.properties.attributes.CATALOG_LENGTH_MM, massKg: entity.properties.attributes.CATALOG_MASS_KG, dtxr: entity.properties.attributes.DTXR })),
      retiredPresent: ['=1006649732/51248', '=1006649732/51256', '=1006649732/51250'].filter((id) => dataset.entities.some((entity) => entity.entityId === id)),
      retainedPresent: retained.filter((id) => dataset.entities.some((entity) => entity.entityId === id)),
      audit: dataset.editAudit,
    };
  }, { retained: retainedEntityIds });
  expect(committed).toMatchObject({ version: 1, stale: 'STALE', retiredPresent: [], retainedPresent: retainedEntityIds });
  expect(committed.replacements).toEqual([
    expect.objectContaining({ type: 'FLAN', lengthMm: 147, massKg: 59, dtxr: expect.stringMatching(/Sch 80/i) }),
    expect.objectContaining({ type: 'VALV', lengthMm: 610, massKg: 263 }),
    expect.objectContaining({ type: 'FLAN', lengthMm: 147, massKg: 59, dtxr: expect.stringMatching(/Sch 80/i) }),
  ]);
  expect(committed.audit.masterChecks.lineListRow.sourceRowNumber).toBe(316);
  expect(committed.audit.invariants).toContain('PHYSICAL_NON_OVERLAP_VALIDATED');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => page.evaluate(() => AnalysisWorkspace.getSnapshot().dataset.entities.some((entity) => entity.entityId === '=1006649732/51250'))).toBe(true);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(() => page.evaluate(() => AnalysisWorkspace.getSnapshot().dataset.entities.filter((entity) => entity.properties?.attributes?.REPLACEMENT_COMMAND_ID).length)).toBe(3);
});

test('1885S Load Calc refuses incomplete Project Data and keeps SVG/support Properties selection canonical', async ({ page }) => {
  await page.goto('/');
  await importDatasetAndAuthorities(page);
  await page.getByRole('navigation', { name: 'Application views' }).getByRole('button', { name: 'Edit, Topo fix and Load Calc', exact: true }).click();
  await page.locator('[data-engineering-load-calculate]').click();
  await expect.poll(() => page.evaluate(() => AnalysisWorkspace.getEngineeringSupportLoadDistribution()?.status)).toBe('BLOCKED');
  const distribution = await page.evaluate(() => AnalysisWorkspace.getEngineeringSupportLoadDistribution());
  expect(distribution.loadCases.map((loadCase) => loadCase.loadCaseId)).toEqual(['EMPTY', 'OPE', 'HYD']);
  for (const loadCase of distribution.loadCases) {
    expect(loadCase.status).toBe('BLOCKED');
    expect(loadCase.supportResults.every((result) => result.verticalForceN === null)).toBe(true);
    expect(loadCase.blockers.map((blocker) => blocker.path).filter(Boolean)).toContain('loadCalculation.gravityMPerS2');
  }
  const support = await page.evaluate(() => {
    const site = AnalysisWorkspace.getSupportSiteModel().sites[0];
    return { siteId: site.siteId, primaryEntityId: site.primaryEntityId, memberEntityId: site.memberEntityIds[0] };
  });
  await page.locator(`[data-load-support-entity-id="${support.primaryEntityId}"]`).first().click();
  await expect.poll(() => page.evaluate(() => AnalysisWorkspace.getSnapshot().selectedEntityId)).toBe(support.primaryEntityId);
  await page.getByRole('navigation', { name: 'Application views' }).getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByRole('button', { name: '2D SVG', exact: true }).click();
  await page.locator(`svg [data-entity-id="${support.memberEntityId}"]`).click();
  await expect.poll(() => page.evaluate(() => AnalysisWorkspace.getSnapshot().selectedEntityId)).toBe(support.primaryEntityId);
  const properties = page.locator('[data-role="properties-content"]');
  await expect(properties).toContainText(support.siteId);
  await expect(properties).toContainText('EMPTY');
  await expect(properties).toContainText('BLOCKED');
});

async function importDatasetAndAuthorities(page) {
  await page.locator('[data-role="dataset-file"]').setInputFiles(sources.sjson);
  await expect.poll(() => page.evaluate(() => AnalysisWorkspace.getSnapshot().status)).toBe('ready');
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  const loadCalc = navigation.getByRole('button', { name: 'Edit, Topo fix and Load Calc', exact: true });
  await expect(loadCalc).toHaveAttribute('aria-disabled', 'false');
  await loadCalc.click();
  await page.getByRole('button', { name: 'Project Data', exact: true }).click();
  await page.locator('[data-project-data-import]').setInputFiles(sources.profile);
  await expect.poll(() => page.evaluate(() => AnalysisWorkspace.getProjectDataProfile().projectId)).toBe('1885S');
  await page.getByRole('button', { name: 'Masters', exact: true }).click();
  await uploadMaster(page, 'Line List', 'lineList', sources.lineList);
  await uploadMaster(page, 'Piping Classes', 'pipingClass', sources.pipingClass);
  await uploadMaster(page, 'Weights', 'weight', sources.componentWeight);
  await navigation.getByRole('button', { name: 'Workspace', exact: true }).click();
}

async function uploadMaster(page, label, masterKey, filePath) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.locator(`input[data-master-file="${masterKey}"]`).setInputFiles(filePath);
  await expect(page.locator('[data-role="load-calc-consumer"]')).not.toContainText('Failed to parse file');
}
