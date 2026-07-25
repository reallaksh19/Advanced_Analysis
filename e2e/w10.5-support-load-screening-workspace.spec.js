import fs from 'node:fs';
import { expect, test } from '@playwright/test';

const STAGED_PACKAGE = {
  schema: 'inputxml-managed-stage/v1',
  packageHash: 'W10.5-BROWSER',
  unit: 'mm',
  objects: [
    {
      id: 'PIPES', name: 'Pipes', type: 'BRANCH', children: [
        pipe('PIPE-A', [0, 0, 0], [1000, 0, 0]),
        pipe('PIPE-B', [1000, 0, 0], [2000, 0, 0]),
      ],
    },
    {
      id: 'SUPPORTS', name: 'Supports', type: 'GROUP', children: [
        support('SUP-START', [0, 0, 0], 'PIPE-A:port:start'),
        support('SUP-END', [2000, 0, 0], 'PIPE-B:port:end'),
      ],
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d';
    globalThis.__w105UrlAudit = { created: 0, revoked: 0 };
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      globalThis.__w105UrlAudit.created += 1;
      return create(blob);
    };
    URL.revokeObjectURL = (url) => {
      globalThis.__w105UrlAudit.revoked += 1;
      return revoke(url);
    };
  });
});

test('prepares paths automatically and runs tributary screening only on explicit action', async ({ page }) => {
  let downloadCount = 0;
  page.on('download', () => { downloadCount += 1; });
  await page.goto('/');
  await page.evaluate(() => {
    globalThis.__w105AnalysisStarts = 0;
    EventBus.subscribe('analysis:started', () => { globalThis.__w105AnalysisStarts += 1; });
  });
  await uploadJson(page, 'w10.5-browser.json', STAGED_PACKAGE);

  const card = page.locator('[data-role="support-load-screening-card"]');
  await expect(card).toContainText('Topology-Local Tributary Screening');
  await expect(page.locator('[data-role="vertical-load-path-health"]')).toContainText('Paths 1 · Qualified 1');
  await expect(page.locator('[data-role="support-load-screening-health"]')).toContainText('Screening not run');
  expect(await page.evaluate(() => AnalysisWorkspace.getVerticalLoadPathModel().summary.qualifiedPathCount)).toBe(1);
  expect(await page.evaluate(() => AnalysisWorkspace.getSupportLoadScreening())).toBeNull();
  expect(await page.evaluate(() => AnalysisWorkspace.getSupportLoadScreeningAudit())).toBeNull();
  expect(downloadCount).toBe(0);
  expect(await page.evaluate(() => globalThis.__w105AnalysisStarts)).toBe(0);

  await page.locator('[data-entity-id="PIPE-A"]').click();
  const before = await upstreamSnapshot(page);
  await page.getByRole('button', { name: 'Rebuild Vertical Load Paths' }).click();
  await expect(page.locator('[data-role="support-load-screening-status"]')).toContainText('rebuilt');
  expect(await page.evaluate(() => AnalysisWorkspace.getSupportLoadScreening())).toBeNull();

  await page.getByRole('button', { name: 'Run Tributary Screening' }).click();
  await expect(page.locator('[data-role="support-load-screening-status"]')).toContainText('completed');
  const result = await page.evaluate(() => ({
    screening: AnalysisWorkspace.getSupportLoadScreening(),
    audit: AnalysisWorkspace.getSupportLoadScreeningAudit(),
  }));
  expect(result.screening.schema).toBe('tributary-support-load-screening/v1');
  expect(result.audit.schema).toBe('support-load-screening-audit/v1');
  expect(result.audit.records).toHaveLength(3);
  expect(result.audit.records.every((row) => row.qualification === 'READY')).toBe(true);
  expect(result.audit.records.every((row) => row.equilibriumPass)).toBe(true);
  expect(result.audit.records.every((row) => Math.abs(row.equilibriumResidualN) < 1e-9)).toBe(true);
  await expect(page.locator('[data-role="support-load-screening-health"]')).toContainText('EMPTY · READY');
  await expect(page.locator('[data-role="support-load-screening-health"]')).toContainText('OPE · READY');
  await expect(page.locator('[data-role="support-load-screening-health"]')).toContainText('HYD · READY');
  expect(await page.evaluate(() => globalThis.__w105AnalysisStarts)).toBe(0);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Support Load Screening' }).click(),
  ]);
  const content = fs.readFileSync(await download.path(), 'utf8');
  const exported = JSON.parse(content);
  expect(download.suggestedFilename()).toBe('support-load-screening-w10-5-browser.json');
  expect(exported.schema).toBe('support-load-screening-export/v1');
  expect(exported.verticalLoadPathModel.semanticHash).toBe(await page.evaluate(() => AnalysisWorkspace.getVerticalLoadPathModel().semanticHash));
  expect(exported.tributarySupportLoadScreening.semanticHash).toBe(result.screening.semanticHash);
  expect(exported.supportLoadScreeningAudit.semanticHash).toBe(result.audit.semanticHash);
  expect(content.endsWith('\n')).toBe(true);
  expect(await page.evaluate(() => globalThis.__w105UrlAudit)).toEqual({ created: 1, revoked: 1 });

  const after = await upstreamSnapshot(page);
  expect(after.snapshot.dataset.datasetId).toBe(before.snapshot.dataset.datasetId);
  expect(after.snapshot.selectedEntityId).toBe(before.snapshot.selectedEntityId);
  expect(after.snapshot.version).toBe(before.snapshot.version);
  expect(after.hashes).toEqual(before.hashes);
  expect(await page.evaluate(() => globalThis.__w105AnalysisStarts)).toBe(0);
});

test('clear and teardown remove path, screening and listeners', async ({ page }) => {
  let downloadCount = 0;
  page.on('download', () => { downloadCount += 1; });
  await page.goto('/');
  await uploadJson(page, 'w10.5-browser.json', STAGED_PACKAGE);
  await page.getByRole('button', { name: 'Run Tributary Screening' }).click();
  expect(await page.evaluate(() => AnalysisWorkspace.getSupportLoadScreening())).not.toBeNull();

  await page.locator('[data-action="clear-dataset"]').click();
  await expect(page.locator('[data-role="support-load-screening-card"]')).toContainText('Import a dataset');
  expect(await page.evaluate(() => AnalysisWorkspace.getVerticalLoadPathModel())).toBeNull();
  expect(await page.evaluate(() => AnalysisWorkspace.getSupportLoadScreening())).toBeNull();
  expect(await page.evaluate(() => AnalysisWorkspace.getSupportLoadScreeningAudit())).toBeNull();

  await uploadJson(page, 'w10.5-browser.json', STAGED_PACKAGE);
  await page.evaluate(() => AnalysisWorkspace.destroy());
  expect(await page.locator('#root').textContent()).toBe('');
  expect(await page.evaluate(() => AnalysisWorkspace.getVerticalLoadPathModel())).toBeNull();
  await page.evaluate(() => EventBus.publish('supportLoadScreening:exportRequested', {}));
  await page.waitForTimeout(100);
  expect(downloadCount).toBe(0);
  expect(await page.evaluate(() => globalThis.__w105UrlAudit)).toEqual({ created: 0, revoked: 0 });
});

function pipe(id, startPoint, endPoint) {
  return {
    id, name: id, type: 'PIPE', sourcePath: `/MODEL/PIPES/${id}`,
    sourceAttributes: {
      LINE_ID: 'LINE-W10.5', SYSTEM_ID: 'SYS-W10.5',
      UNIT_PIPE_WEIGHT_KG_PER_M: 10,
      INSULATION_THICKNESS_MM: 0,
      FLUID_WT_OPE_KG_M: 2,
      FLUID_WT_HYD_KG_M: 3,
    },
    nativeParams: { startPoint, endPoint },
  };
}

function support(id, position, attachedPortId) {
  return {
    id, name: id, type: 'SUPPORT', sourcePath: `/MODEL/SUPPORTS/${id}`,
    sourceAttributes: {
      LINE_ID: 'LINE-W10.5', SYSTEM_ID: 'SYS-W10.5',
      POS: { x: position[0], y: position[1], z: position[2] },
      ATTACHED_PORT_ID: attachedPortId,
      SUPPORT_TYPE: 'ANCHOR',
      VERTICAL_CAPABILITY: 'RESTRAINED',
    },
  };
}

async function uploadJson(page, name, payload) {
  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)),
  });
}

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
    },
  }));
}
