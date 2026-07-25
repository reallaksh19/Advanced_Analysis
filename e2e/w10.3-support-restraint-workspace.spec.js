import fs from 'node:fs';
import { expect, test } from '@playwright/test';

const STAGED_PACKAGE = {
  schema: 'inputxml-managed-stage/v1',
  packageHash: 'W10.3-BROWSER',
  unit: 'mm',
  objects: [
    {
      id: 'PIPES',
      name: 'Pipes',
      type: 'BRANCH',
      children: [
        pipe('PIPE-A', [0, 0, 0], [1000, 0, 0]),
        pipe('PIPE-B', [1000, 0, 0], [2000, 0, 0]),
      ],
    },
    {
      id: 'SUPPORTS',
      name: 'Supports',
      type: 'GROUP',
      children: [
        support('SUP-EXPLICIT', [10, 0, 0], {
          ATTACHED_PORT_ID: 'PIPE-A:port:start',
          SUPPORT_TYPE: 'ANCHOR',
          VERTICAL_CAPABILITY: 'RESTRAINED',
          LATERAL_CAPABILITY: 'RESTRAINED',
          LONGITUDINAL_CAPABILITY: 'RESTRAINED',
          ROTATIONAL_CAPABILITY: 'RESTRAINED',
        }),
        support('SUP-PROJECT', [500, 0.5, 0], {
          SUPPORT_TYPE: 'GUIDE',
        }),
      ],
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d';
    globalThis.__supportRestraintUrlAudit = { created: 0, revoked: 0 };
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      globalThis.__supportRestraintUrlAudit.created += 1;
      return create(blob);
    };
    URL.revokeObjectURL = (url) => {
      globalThis.__supportRestraintUrlAudit.revoked += 1;
      return revoke(url);
    };
  });
});

test('builds evidence attachment, projects explicitly, retains invalid input, and exports', async ({ page }) => {
  let downloadCount = 0;
  page.on('download', () => { downloadCount += 1; });
  await page.goto('/');
  await page.evaluate(() => {
    globalThis.__w103AnalysisStarts = 0;
    EventBus.subscribe('analysis:started', () => { globalThis.__w103AnalysisStarts += 1; });
  });
  await uploadJson(page, 'w10.3-browser.json', STAGED_PACKAGE);

  const card = page.locator('[data-role="support-restraint-card"]');
  await expect(card).toContainText('Attachment & Restraint Health');
  await expect(page.locator('[data-role="support-restraint-active-profiles"]')).toContainText('EVIDENCE_ONLY_V1');
  const evidenceModel = await page.evaluate(() => AnalysisWorkspace.getSupportAttachmentModel());
  const evidenceRestraint = await page.evaluate(() => AnalysisWorkspace.getRestraintCapabilityModel());
  expect(evidenceModel.summary.supportCount).toBe(2);
  expect(evidenceModel.summary.attachedCount).toBe(1);
  expect(evidenceModel.summary.unattachedCount).toBe(1);
  expect(evidenceRestraint.summary.explicitlyResolvedCount).toBe(1);
  expect(downloadCount).toBe(0);
  expect(await page.evaluate(() => globalThis.__w103AnalysisStarts)).toBe(0);

  await page.locator('[data-entity-id="SUP-PROJECT"]').click();
  const before = await page.evaluate(() => ({
    snapshot: AnalysisWorkspace.getSnapshot(),
    sharedHash: AnalysisWorkspace.getSharedModel().semanticHash,
    topologyHash: AnalysisWorkspace.getTopologyGraph().semanticHash,
  }));

  const tolerance = page.locator('[data-role="support-restraint-tolerance"]');
  await tolerance.fill('1');
  await page.getByRole('button', { name: 'Rebuild With Projection' }).click();
  await expect(page.locator('[data-role="support-restraint-active-profiles"]')).toContainText('GEOMETRIC_PROJECTION_EXPLICIT_V1');
  const projected = await page.evaluate(() => AnalysisWorkspace.getSupportAttachmentModel());
  const projectedRestraint = await page.evaluate(() => AnalysisWorkspace.getRestraintCapabilityModel());
  expect(projected.summary.attachedCount).toBe(2);
  expect(projected.attachments.some((row) => row.evidenceType === 'GEOMETRIC_PROJECTION_EXPLICIT')).toBe(true);
  expect(projectedRestraint.summary.typeClassifiedCount).toBe(1);

  await tolerance.fill('0');
  await page.getByRole('button', { name: 'Rebuild With Projection' }).click();
  await expect(page.locator('[data-role="support-restraint-status"]')).toContainText('positive number');
  expect((await page.evaluate(() => AnalysisWorkspace.getSupportAttachmentModel())).semanticHash).toBe(projected.semanticHash);
  expect((await page.evaluate(() => AnalysisWorkspace.getRestraintCapabilityModel())).semanticHash).toBe(projectedRestraint.semanticHash);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Support/Restraint Model' }).click(),
  ]);
  const content = fs.readFileSync(await download.path(), 'utf8');
  const exported = JSON.parse(content);
  expect(download.suggestedFilename()).toBe('support-restraint-w10.3-browser.json');
  expect(exported.schema).toBe('support-restraint-export/v1');
  expect(exported.supportAttachmentModel.semanticHash).toBe(projected.semanticHash);
  expect(exported.restraintCapabilityModel.semanticHash).toBe(projectedRestraint.semanticHash);
  expect(content.endsWith('\n')).toBe(true);
  expect(await page.evaluate(() => globalThis.__supportRestraintUrlAudit)).toEqual({
    created: 1,
    revoked: 1,
  });

  const after = await page.evaluate(() => ({
    snapshot: AnalysisWorkspace.getSnapshot(),
    sharedHash: AnalysisWorkspace.getSharedModel().semanticHash,
    topologyHash: AnalysisWorkspace.getTopologyGraph().semanticHash,
  }));
  expect(after.snapshot.dataset.datasetId).toBe(before.snapshot.dataset.datasetId);
  expect(after.snapshot.selectedEntityId).toBe(before.snapshot.selectedEntityId);
  expect(after.snapshot.version).toBe(before.snapshot.version);
  expect(after.sharedHash).toBe(before.sharedHash);
  expect(after.topologyHash).toBe(before.topologyHash);
  expect(await page.evaluate(() => globalThis.__w103AnalysisStarts)).toBe(0);
});

test('clear and teardown remove support/restraint models and listeners', async ({ page }) => {
  let downloadCount = 0;
  page.on('download', () => { downloadCount += 1; });
  await page.goto('/');
  await uploadJson(page, 'w10.3-browser.json', STAGED_PACKAGE);
  await expect(page.getByRole('button', { name: 'Export Support/Restraint Model' })).toBeVisible();

  await page.locator('[data-action="clear-dataset"]').click();
  await expect(page.locator('[data-role="support-restraint-card"]')).toContainText('Import a dataset');
  expect(await page.evaluate(() => AnalysisWorkspace.getSupportAttachmentModel())).toBeNull();
  expect(await page.evaluate(() => AnalysisWorkspace.getSupportAttachmentAudit())).toBeNull();
  expect(await page.evaluate(() => AnalysisWorkspace.getRestraintCapabilityModel())).toBeNull();
  expect(await page.evaluate(() => AnalysisWorkspace.getRestraintCapabilityAudit())).toBeNull();

  await uploadJson(page, 'w10.3-browser.json', STAGED_PACKAGE);
  await page.evaluate(() => AnalysisWorkspace.destroy());
  expect(await page.locator('#root').textContent()).toBe('');
  expect(await page.evaluate(() => AnalysisWorkspace.getSupportAttachmentModel())).toBeNull();
  await page.evaluate(() => EventBus.publish('supportRestraint:exportRequested', {}));
  await page.waitForTimeout(100);
  expect(downloadCount).toBe(0);
  expect(await page.evaluate(() => globalThis.__supportRestraintUrlAudit)).toEqual({
    created: 0,
    revoked: 0,
  });
});

function pipe(id, startPoint, endPoint) {
  return {
    id,
    name: id,
    type: 'PIPE',
    sourcePath: `/MODEL/PIPES/${id}`,
    sourceAttributes: { LINE_ID: 'LINE-W10.3', SYSTEM_ID: 'SYS-W10.3' },
    nativeParams: { startPoint, endPoint },
  };
}

function support(id, position, sourceAttributes) {
  return {
    id,
    name: id,
    type: 'SUPPORT',
    sourcePath: `/MODEL/SUPPORTS/${id}`,
    sourceAttributes: {
      LINE_ID: 'LINE-W10.3',
      SYSTEM_ID: 'SYS-W10.3',
      POS: { x: position[0], y: position[1], z: position[2] },
      ...sourceAttributes,
    },
  };
}

async function uploadJson(page, name, payload) {
  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}
