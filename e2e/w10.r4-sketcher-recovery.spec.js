import { expect, test } from '@playwright/test';

const NAVIGATION = ['Home','Workspace','Load Calc','PCF','Sketcher','3D Calc','Pipe Solver','Reports','QA','Settings','Debug'];
const WORKSPACE_FIXTURE = {
  schema: 'inputxml-managed-stage/v1',
  units: { length: 'mm' },
  objects: [
    { id: 'PIPE-A', sourceId: 'PIPE-A', name: 'Pipe A', type: 'PIPE', points: [{ x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 }] },
    { id: 'PIPE-B', sourceId: 'PIPE-B', name: 'Pipe B', type: 'PIPE', points: [{ x: 1000, y: 0, z: 0 }, { x: 1000, y: 1000, z: 0 }] },
  ],
};

async function openSketcher(page) {
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  const button = navigation.getByRole('button', { name: 'Sketcher', exact: true });
  await expect(button).toHaveAttribute('aria-disabled', 'false');
  await button.click();
  await expect(page.getByRole('heading', { name: 'Sketcher', exact: true })).toBeVisible();
}

async function clickSurface(page, x, y) {
  const surface = page.locator('[data-role="sketcher-surface"]');
  const box = await surface.boundingBox();
  if (!box) throw new Error('Sketcher surface is unavailable.');
  await surface.click({ position: { x: box.width * x / 1000, y: box.height * y / 620 } });
}

test('Sketcher is dataset-independent and supports deterministic editing, history, validation and JSON round-trip', async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__sketcherDownloadBlob = null;
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { globalThis.__sketcherDownloadBlob = blob; return original(blob); };
  });
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await expect(navigation.getByRole('button')).toHaveText(NAVIGATION);
  expect((await page.evaluate(() => AnalysisWorkspace.getSnapshot())).status).toBe('empty');
  await openSketcher(page);
  expect(await page.locator('[data-webgl-host]').count()).toBe(1);
  expect(await page.locator('[data-application-view="SKETCHER"] canvas').count()).toBe(0);

  const plane = page.locator('[data-role="sketcher-plane"]');
  for (const value of ['XZ','YZ','XY']) {
    await plane.selectOption(value);
    expect((await page.evaluate(() => AnalysisWorkspace.getSketcherDraftDocument())).workingPlane).toBe(value);
  }

  await page.getByRole('button', { name: 'Draw Pipe' }).click();
  await clickSurface(page, 200, 400);
  await clickSurface(page, 400, 400);
  await page.locator('[data-node-id="N002"]').click();
  await clickSurface(page, 400, 250);
  let draft = await page.evaluate(() => AnalysisWorkspace.getSketcherDraftDocument());
  expect(draft.nodes).toHaveLength(3);
  expect(draft.segments).toHaveLength(2);
  expect(draft.segments[1].startNodeId).toBe('N002');

  await page.locator('[data-node-id="N001"]').click();
  await page.locator('[data-node-id="N001"]').click();
  await expect(page.locator('[data-role="sketcher-status"]')).toContainText(/zero-length|same node|self-loop/i);
  expect((await page.evaluate(() => AnalysisWorkspace.getSketcherDraftDocument())).segments).toHaveLength(2);
  await page.locator('[data-node-id="N001"]').click();
  await page.locator('[data-node-id="N002"]').click();
  await expect(page.locator('[data-role="sketcher-status"]')).toContainText(/duplicate/i);

  await page.getByRole('button', { name: 'Move Node' }).click();
  await page.locator('[data-node-id="N003"]').click();
  const beforeMove = await page.evaluate(() => AnalysisWorkspace.getSketcherDraftDocument());
  await clickSurface(page, 500, 200);
  const moved = await page.evaluate(() => AnalysisWorkspace.getSketcherDraftDocument());
  expect(moved.nodes.find((row) => row.nodeId === 'N003')).not.toEqual(beforeMove.nodes.find((row) => row.nodeId === 'N003'));
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await page.evaluate(() => AnalysisWorkspace.getSketcherDraftDocument())).semanticHash).toBe(beforeMove.semanticHash);
  await page.getByRole('button', { name: 'Redo' }).click();
  expect((await page.evaluate(() => AnalysisWorkspace.getSketcherDraftDocument())).semanticHash).toBe(moved.semanticHash);

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.locator('[data-node-id="N002"]').click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('[data-role="sketcher-status"]')).toContainText('referenced');
  expect((await page.evaluate(() => AnalysisWorkspace.getSketcherDraftDocument())).semanticHash).toBe(moved.semanticHash);

  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.locator('[data-role="sketcher-diagnostics"]')).toContainText('CONNECTED_COMPONENT_COUNT');
  await expect(page.locator('[data-role="sketcher-diagnostics"]')).toContainText('DANGLING_ENDPOINT');

  const exportedHash = moved.semanticHash;
  await page.getByRole('button', { name: 'Save Draft JSON' }).click();
  const exportedText = await page.evaluate(async () => globalThis.__sketcherDownloadBlob.text());
  await page.getByRole('button', { name: 'New Draft' }).click();
  await page.locator('[data-role="sketcher-file"]').setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(exportedText) });
  await expect.poll(async () => (await page.evaluate(() => AnalysisWorkspace.getSketcherDraftDocument())).semanticHash).toBe(exportedHash);

  const surface = page.locator('[data-role="sketcher-surface"]');
  await surface.focus();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  await expect(surface).toBeFocused();
});

test('Workspace import and successful adoption use the existing dataset boundary exactly once', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((rawPackage) => EventBus.publish('dataset:loadRequested', { rawPackage, sourceName: 'w10-r4-workspace.json' }), WORKSPACE_FIXTURE);
  await expect.poll(async () => (await page.evaluate(() => AnalysisWorkspace.getSnapshot())).status).toBe('ready');
  await openSketcher(page);
  const importButton = page.getByRole('button', { name: 'Import Workspace' });
  await expect(importButton).toBeEnabled();
  await importButton.click();
  await expect.poll(async () => (await page.evaluate(() => AnalysisWorkspace.getSketcherReviewModel())).source.fidelity).toBe('FULL_FIDELITY');
  const imported = await page.evaluate(() => AnalysisWorkspace.getSketcherDraftDocument());
  expect(imported.segments).toHaveLength(2);
  expect(imported.nodes).toHaveLength(3);

  await page.evaluate(() => {
    globalThis.__w10r4Counts = { loads: 0, analyses: 0, exports: 0 };
    EventBus.subscribe('dataset:loadRequested', () => { globalThis.__w10r4Counts.loads += 1; });
    EventBus.subscribe('analysis:requested', () => { globalThis.__w10r4Counts.analyses += 1; });
    EventBus.subscribe('analysis:exportRequested', () => { globalThis.__w10r4Counts.exports += 1; });
  });
  await page.getByRole('button', { name: 'Adopt to Workspace' }).click();
  await expect.poll(async () => (await page.evaluate(() => AnalysisWorkspace.getApplicationViewState())).activeViewId).toBe('WORKSPACE');
  expect(await page.evaluate(() => globalThis.__w10r4Counts)).toEqual({ loads: 1, analyses: 0, exports: 0 });
  const adoption = await page.evaluate(() => AnalysisWorkspace.getSketcherWorkspaceAdoption());
  expect(adoption.schema).toBe('sketcher-workspace-adoption/v1');
  expect(adoption.draftSemanticHash).toBe(imported.semanticHash);
  expect((await page.evaluate(() => AnalysisWorkspace.getSnapshot())).dataset.sharedModel.components).toHaveLength(2);
});

test('blocking import loss fails closed and preserves the active dataset and draft', async ({ page }) => {
  const partialFixture = {
    schema: 'inputxml-managed-stage/v1', units: { length: 'mm' }, objects: [
      ...WORKSPACE_FIXTURE.objects,
      { id: 'VALVE-X', sourceId: 'VALVE-X', name: 'Unsupported Valve', type: 'VALVE', points: [{ x: 1000, y: 1000, z: 0 }, { x: 1200, y: 1000, z: 0 }] },
    ],
  };
  await page.goto('/');
  await page.evaluate((rawPackage) => EventBus.publish('dataset:loadRequested', { rawPackage, sourceName: 'w10-r4-partial.json' }), partialFixture);
  await expect.poll(async () => (await page.evaluate(() => AnalysisWorkspace.getSnapshot())).status).toBe('ready');
  await openSketcher(page);
  await page.getByRole('button', { name: 'Import Workspace' }).click();
  await expect(page.locator('[data-role="sketcher-diagnostics"]')).toContainText('UNSUPPORTED_WORKSPACE_ENTITY');
  await expect(page.getByRole('button', { name: 'Adopt to Workspace' })).toBeDisabled();
  const before = await page.evaluate(() => ({ datasetId: AnalysisWorkspace.getSnapshot().dataset.datasetId, draftHash: AnalysisWorkspace.getSketcherDraftDocument().semanticHash }));
  await page.evaluate(() => EventBus.publish('sketcher:adoptionRequested', {}));
  const after = await page.evaluate(() => ({ datasetId: AnalysisWorkspace.getSnapshot().dataset.datasetId, draftHash: AnalysisWorkspace.getSketcherDraftDocument().semanticHash, activeViewId: AnalysisWorkspace.getApplicationViewState().activeViewId }));
  expect(after).toEqual({ ...before, activeViewId: 'SKETCHER' });
  await expect(page.locator('[data-role="sketcher-status"]')).toContainText('SKETCHER_ADOPTION_BLOCKED');

  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await expect(navigation.getByRole('button', { name: 'QA', exact: true })).toHaveAttribute('aria-disabled', 'true');
  await expect(navigation.getByRole('button', { name: 'Debug', exact: true })).toHaveAttribute('aria-disabled', 'true');
  await navigation.getByRole('button', { name: 'Sketcher', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(navigation.getByRole('button', { name: '3D Calc', exact: true })).toBeFocused();
});
