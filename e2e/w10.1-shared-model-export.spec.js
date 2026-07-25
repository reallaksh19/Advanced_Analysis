import fs from 'node:fs';
import { expect, test } from '@playwright/test';

const STAGED_PACKAGE = {
  schema: 'inputxml-managed-stage/v1',
  packageHash: 'W10.1-BROWSER',
  unit: 'mm',
  objects: [{
    id: 'ROOT', name: 'Model', type: 'BRANCH', children: [
      {
        id: 'PIPE-BROWSER', name: 'Browser Pipe', type: 'PIPE',
        sourcePath: '/MODEL/LINE-B/PIPE-BROWSER',
        sourceAttributes: { LINE_ID: 'LINE-B', LENGTH_MM: 1000 },
        enrichedAttributes: { pipeOdMm: 168.3, wallThicknessMm: 7.11 },
        nativeParams: { startPoint: [0, 0, 0], endPoint: [1000, 0, 0] },
      },
      {
        id: 'SUP-BROWSER', name: 'Browser Support', type: 'SUPPORT',
        sourcePath: '/MODEL/LINE-B/SUP-BROWSER',
        sourceAttributes: { LINE_ID: 'LINE-B', POS: { x: 500, y: 0, z: 0 } },
      },
    ],
  }],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d';
    globalThis.__sharedModelUrlAudit = { created: 0, revoked: 0 };
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      globalThis.__sharedModelUrlAudit.created += 1;
      return create(blob);
    };
    URL.revokeObjectURL = (url) => {
      globalThis.__sharedModelUrlAudit.revoked += 1;
      return revoke(url);
    };
  });
});

test('imports staged JSON, shows shared-model summary, and exports only on explicit activation', async ({ page }) => {
  let downloadCount = 0;
  page.on('download', () => { downloadCount += 1; });
  await page.goto('/');
  await uploadJson(page, 'w10.1-browser.json', STAGED_PACKAGE);

  const card = page.locator('[data-role="shared-model-card"]');
  await expect(card).toContainText('Shared piping model/v1');
  await expect(card).toContainText('Components');
  await expect(card).toContainText('1');
  await expect(card).toContainText('Supports');
  await expect(card).toContainText('Semantic hash: fnv1a64:');
  await page.waitForTimeout(100);
  expect(downloadCount).toBe(0);

  await page.locator('[data-entity-id="PIPE-BROWSER"]').click();
  const beforeExportState = await page.evaluate(() => AnalysisWorkspace.getSnapshot());
  const getterModel = await page.evaluate(() => AnalysisWorkspace.getSharedModel());
  expect(getterModel.schema).toBe('shared-piping-model/v1');
  expect(getterModel.summary.componentCount).toBe(1);
  expect(getterModel.summary.supportCount).toBe(1);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Shared Model' }).click(),
  ]);
  const content = fs.readFileSync(await download.path(), 'utf8');
  const exported = JSON.parse(content);
  expect(download.suggestedFilename()).toBe('shared-piping-model-w10.1-browser.json');
  expect(exported.schema).toBe('shared-piping-model/v1');
  expect(exported.semanticHash).toBe(getterModel.semanticHash);
  expect(exported.summary).toEqual(getterModel.summary);
  expect(content.endsWith('\n')).toBe(true);
  await expect(page.locator('[data-role="shared-model-export-status"]')).toContainText('Exported');
  expect(await page.evaluate(() => globalThis.__sharedModelUrlAudit)).toEqual({ created: 1, revoked: 1 });
  const afterExportState = await page.evaluate(() => AnalysisWorkspace.getSnapshot());
  expect(afterExportState.dataset.datasetId).toBe(beforeExportState.dataset.datasetId);
  expect(afterExportState.selectedEntityId).toBe(beforeExportState.selectedEntityId);
  expect(afterExportState.version).toBe(beforeExportState.version);
});

test('clear and teardown remove shared-model state and export listeners', async ({ page }) => {
  let downloadCount = 0;
  page.on('download', () => { downloadCount += 1; });
  await page.goto('/');
  await uploadJson(page, 'w10.1-browser.json', STAGED_PACKAGE);
  await expect(page.getByRole('button', { name: 'Export Shared Model' })).toBeVisible();

  await page.locator('[data-action="clear-dataset"]').click();
  await expect(page.locator('[data-role="shared-model-card"]')).toContainText('Import a dataset');
  expect(await page.evaluate(() => AnalysisWorkspace.getSharedModel())).toBeNull();

  await uploadJson(page, 'w10.1-browser.json', STAGED_PACKAGE);
  await page.evaluate(() => AnalysisWorkspace.destroy());
  expect(await page.locator('#root').textContent()).toBe('');
  expect(await page.evaluate(() => AnalysisWorkspace.getSharedModel())).toBeNull();
  await page.evaluate(() => EventBus.publish('sharedModel:exportRequested', {}));
  await page.waitForTimeout(100);
  expect(downloadCount).toBe(0);
  expect(await page.evaluate(() => globalThis.__sharedModelUrlAudit)).toEqual({ created: 0, revoked: 0 });
});

async function uploadJson(page, name, payload) {
  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}
