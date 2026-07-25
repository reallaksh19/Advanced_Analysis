import fs from 'node:fs';
import { expect, test } from '@playwright/test';

const STAGED_PACKAGE = {
  schema: 'inputxml-managed-stage/v1',
  packageHash: 'W10.2-BROWSER',
  unit: 'mm',
  objects: [{
    id: 'ROOT', name: 'Model', type: 'BRANCH', children: [
      pipe('PIPE-A', [0, 0, 0], [1000, 0, 0]),
      pipe('PIPE-B', [1000, 0, 0], [2000, 0, 0]),
      pipe('PIPE-C', [2000.5, 0, 0], [3000, 0, 0]),
    ],
  }],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d';
    globalThis.__topologyUrlAudit = { created: 0, revoked: 0 };
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      globalThis.__topologyUrlAudit.created += 1;
      return create(blob);
    };
    URL.revokeObjectURL = (url) => {
      globalThis.__topologyUrlAudit.revoked += 1;
      return revoke(url);
    };
  });
});

test('imports, rebuilds exact/tolerance topology, retains invalid input, and exports explicitly', async ({ page }) => {
  let downloadCount = 0;
  page.on('download', () => { downloadCount += 1; });
  await page.goto('/');
  await page.evaluate(() => {
    globalThis.__topologyAnalysisStarts = 0;
    EventBus.subscribe('analysis:started', () => { globalThis.__topologyAnalysisStarts += 1; });
  });
  await uploadJson(page, 'w10.2-browser.json', STAGED_PACKAGE);

  const card = page.locator('[data-role="topology-card"]');
  await expect(card).toContainText('Piping topology/v1');
  await expect(page.locator('[data-role="topology-active-profile"]')).toContainText('EXACT_ONLY_V1');
  await expect(card).toContainText('Connections');
  expect((await page.evaluate(() => AnalysisWorkspace.getTopologyGraph())).summary.connectionCount).toBe(1);
  expect((await page.evaluate(() => AnalysisWorkspace.getTopologyAudit())).exactConnections.length).toBe(1);
  await page.waitForTimeout(100);
  expect(downloadCount).toBe(0);
  expect(await page.evaluate(() => globalThis.__topologyAnalysisStarts)).toBe(0);

  await page.locator('[data-entity-id="PIPE-B"]').click();
  const before = await page.evaluate(() => ({
    snapshot: AnalysisWorkspace.getSnapshot(),
    sharedHash: AnalysisWorkspace.getSharedModel().semanticHash,
  }));

  await page.getByRole('button', { name: 'Rebuild Exact Topology' }).click();
  await expect(page.locator('[data-role="topology-status"]')).toContainText('EXACT_ONLY_V1');
  expect((await page.evaluate(() => AnalysisWorkspace.getTopologyGraph())).summary.connectionCount).toBe(1);

  const tolerance = page.locator('[data-role="topology-tolerance"]');
  await tolerance.fill('1');
  await page.getByRole('button', { name: 'Rebuild With Tolerance' }).click();
  await expect(page.locator('[data-role="topology-active-profile"]')).toContainText('TOLERANCE_EXPLICIT_V1');
  await expect(page.locator('[data-role="topology-active-profile"]')).toContainText('1 mm');
  const toleranceGraph = await page.evaluate(() => AnalysisWorkspace.getTopologyGraph());
  expect(toleranceGraph.summary.connectionCount).toBe(2);
  expect(toleranceGraph.summary.toleranceConnectionCount).toBe(1);

  await tolerance.fill('0');
  await page.getByRole('button', { name: 'Rebuild With Tolerance' }).click();
  await expect(page.locator('[data-role="topology-status"]')).toContainText('positive number');
  expect((await page.evaluate(() => AnalysisWorkspace.getTopologyGraph())).semanticHash).toBe(toleranceGraph.semanticHash);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Topology Graph' }).click(),
  ]);
  const content = fs.readFileSync(await download.path(), 'utf8');
  const exported = JSON.parse(content);
  expect(download.suggestedFilename()).toBe('piping-port-topology-w10.2-browser.json');
  expect(exported.schema).toBe('piping-port-topology-graph/v1');
  expect(exported.semanticHash).toBe(toleranceGraph.semanticHash);
  expect(content.endsWith('\n')).toBe(true);
  expect(await page.evaluate(() => globalThis.__topologyUrlAudit)).toEqual({ created: 1, revoked: 1 });

  const after = await page.evaluate(() => ({
    snapshot: AnalysisWorkspace.getSnapshot(),
    sharedHash: AnalysisWorkspace.getSharedModel().semanticHash,
  }));
  expect(after.snapshot.dataset.datasetId).toBe(before.snapshot.dataset.datasetId);
  expect(after.snapshot.selectedEntityId).toBe(before.snapshot.selectedEntityId);
  expect(after.snapshot.version).toBe(before.snapshot.version);
  expect(after.sharedHash).toBe(before.sharedHash);
  expect(await page.evaluate(() => globalThis.__topologyAnalysisStarts)).toBe(0);
});

test('clear and teardown remove topology state and listeners', async ({ page }) => {
  let downloadCount = 0;
  page.on('download', () => { downloadCount += 1; });
  await page.goto('/');
  await uploadJson(page, 'w10.2-browser.json', STAGED_PACKAGE);
  await expect(page.getByRole('button', { name: 'Export Topology Graph' })).toBeVisible();

  await page.locator('[data-action="clear-dataset"]').click();
  await expect(page.locator('[data-role="topology-card"]')).toContainText('Import a dataset');
  expect(await page.evaluate(() => AnalysisWorkspace.getTopologyGraph())).toBeNull();
  expect(await page.evaluate(() => AnalysisWorkspace.getTopologyAudit())).toBeNull();

  await uploadJson(page, 'w10.2-browser.json', STAGED_PACKAGE);
  await page.evaluate(() => AnalysisWorkspace.destroy());
  expect(await page.locator('#root').textContent()).toBe('');
  expect(await page.evaluate(() => AnalysisWorkspace.getTopologyGraph())).toBeNull();
  expect(await page.evaluate(() => AnalysisWorkspace.getTopologyAudit())).toBeNull();
  await page.evaluate(() => EventBus.publish('topology:exportRequested', {}));
  await page.waitForTimeout(100);
  expect(downloadCount).toBe(0);
  expect(await page.evaluate(() => globalThis.__topologyUrlAudit)).toEqual({ created: 0, revoked: 0 });
});

function pipe(id, startPoint, endPoint) {
  return {
    id,
    name: id,
    type: 'PIPE',
    sourcePath: `/MODEL/LINE-W10/${id}`,
    sourceAttributes: { LINE_ID: 'LINE-W10' },
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
