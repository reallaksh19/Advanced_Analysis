import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const REPORT = 'reports/qualification/connect-existing-ends-authoring.json';
const PIPE_RECORD = 'PIPE-DN100-SCH40-A';
const PIPE_POLICY = Object.freeze({
  catalogueRecordId: PIPE_RECORD,
  minimumLengthMm: '6', overlapToleranceMm: '0.001',
});

test.describe.configure({ mode: 'serial' });

test('production HUD connects two exact existing ends through certified worker authority', async ({ page }, testInfo) => {
  const pageErrors = []; const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
  const host = await openProductionController(page);
  await openAuthoringPanel(page);

  const startNodeId = await seedStartRoute(page, {
    start: [50000, 50000, 50000], end: [51000, 50000, 50000],
  });
  const endNodeId = await seedStartRoute(page, {
    start: [53000, 53000, 50000], end: [53000, 52000, 50000],
  });
  const before = await controllerEvidence(page);

  await configureConnect(page, startNodeId, endNodeId);
  await page.locator('[data-action="preview-authoring-operation"]').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-connect-preview-hash')).toBeTruthy();
  const preview = await controllerEvidence(page);
  expect(preview.canonicalHash).toBe(before.canonicalHash);
  expect(preview.journalHash).toBe(before.journalHash);
  expect(preview.ghostChildCount).toBeGreaterThan(0);
  expect(preview.connectPhase).toBe('PREVIEW_READY');
  expect(preview.connectOperationHash).toBeTruthy();
  expect(preview.connectElbowBindingHashes).toBeTruthy();

  await page.locator('[data-action="cancel-authoring-operation"]').click();
  await expect.poll(() => controllerEvidence(page).then((row) => row.canonicalHash)).toBe(before.canonicalHash);
  const cancelled = await controllerEvidence(page);
  expect(cancelled.journalHash).toBe(before.journalHash);
  expect(cancelled.ghostChildCount).toBe(0);

  await configureConnect(page, startNodeId, endNodeId);
  await page.locator('[data-action="preview-authoring-operation"]').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-connect-preview-hash')).toBeTruthy();
  await page.locator('[data-action="validate-authoring-operation"]').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-authoring-phase')).toBe('READY_TO_APPLY');
  await expect.poll(() => host.getAttribute('data-topology-edit-connect-validation-hash')).toBeTruthy();

  await page.locator('[data-action="apply-authoring-operation"]').click();
  await expect.poll(() => controllerEvidence(page).then((row) => row.activeCommandCount))
    .toBe(before.activeCommandCount + 4);
  const applied = await controllerEvidence(page);
  expect(applied.nodeCount).toBe(before.nodeCount + 1);
  expect(applied.edgeCount).toBe(before.edgeCount + 2);
  expect(applied.bendCount).toBe(before.bendCount + 1);
  expect(applied.commandTypes.slice(-4)).toEqual([
    'CREATE_NODE', 'INSERT_PIPE_SEGMENT', 'INSERT_PIPE_SEGMENT', 'ADD_BEND_DEFINITION',
  ]);
  expect(applied.transactionCommandCount).toBe(4);
  expect(applied.ghostChildCount).toBe(0);
  expect(applied.rendererCanvasCount).toBe(1);
  expect(applied.webglContextPresent).toBe(true);

  await page.locator('[data-action="undo-connect-ends-operation"]').click();
  await expect.poll(() => controllerEvidence(page).then((row) => row.canonicalHash)).toBe(before.canonicalHash);
  const undone = await controllerEvidence(page);
  expect(undone.activeLedgerHash).toBe(before.activeLedgerHash);
  expect(undone.nodeCount).toBe(before.nodeCount);
  expect(undone.edgeCount).toBe(before.edgeCount);
  expect(undone.bendCount).toBe(before.bendCount);

  await page.locator('[data-action="redo-connect-ends-operation"]').click();
  await expect.poll(() => controllerEvidence(page).then((row) => row.canonicalHash)).toBe(applied.canonicalHash);
  const redone = await controllerEvidence(page);
  expect(redone.activeLedgerHash).toBe(applied.activeLedgerHash);
  expect(redone.activeCommandCount).toBe(applied.activeCommandCount);
  expect(redone.bendCount).toBe(applied.bendCount);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((message) => !message.includes('favicon'))).toEqual([]);
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach('connect-existing-ends-production-hud', { body: screenshot, contentType: 'image/png' });
  await mkdir('reports/qualification', { recursive: true });
  await writeFile(REPORT, `${JSON.stringify({
    schema: 'TopologyEditConnectExistingEndsProductionHudEvidence.v1',
    candidateHead: process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || null,
    status: 'PASS_PRODUCTION_HUD_CERTIFIED_WORKER_APPLY_UNDO_REDO',
    evidence: { startNodeId, endNodeId, before, preview, cancelled, applied, undone, redone },
  }, null, 2)}\n`);
});

async function openProductionController(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await navigation.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.locator('[data-action="load-topology-edit-demo"]').click();
  await expect.poll(() => page.evaluate(() => (
    globalThis.AnalysisWorkspace?.getSnapshot?.()?.dataset?.entities?.length ?? 0
  ))).toBe(20);
  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(
    document.querySelector('[data-role="topology-edit-render-host"]')?.__topologyEditAuthoringController
  ))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(
    document.querySelector('[data-role="topology-edit-render-host"]')
      ?.__topologyEditAuthoringController?.professionalRuntime?.catalogue
  ))).toBe(true);
  return host;
}
async function openAuthoringPanel(page) {
  const details = page.locator('details[data-panel-kind="authoring"]');
  if (!(await details.evaluate((element) => element.open))) await details.locator(':scope > summary').click();
  await expect.poll(() => details.evaluate((element) => element.open)).toBe(true);
}

async function seedStartRoute(page, points) {
  await page.locator('[data-action="activate-authoring-start-route"]').click();
  await expect.poll(() => page.locator('[data-start-route-field="catalogueRecordId"] option').count())
    .toBeGreaterThan(1);
  const values = {
    inputMode: 'TYPED',
    startX: String(points.start[0]), startY: String(points.start[1]), startZ: String(points.start[2]),
    endX: String(points.end[0]), endY: String(points.end[1]), endZ: String(points.end[2]),
    axisLock: 'FREE', ...PIPE_POLICY,
  };
  await page.evaluate((input) => {
    for (const [key, value] of Object.entries(input)) {
      const control = document.querySelector(`[data-start-route-field="${key}"]`);
      if (!control) throw new Error(`Missing Start Route field ${key}.`);
      control.value = value;
    }
    document.querySelector('[data-start-route-field="overlapToleranceMm"]')
      ?.dispatchEvent(new Event('change', { bubbles: true }));
  }, values);
  await page.locator('[data-action="preview-authoring-operation"]').click();
  await page.locator('[data-action="validate-authoring-operation"]').click();
  await expect.poll(() => page.locator('[data-role="topology-edit-render-host"]')
    .getAttribute('data-topology-edit-authoring-phase')).toBe('READY_TO_APPLY');
  await page.locator('[data-action="apply-authoring-operation"]').click();
  return page.evaluate(() => {
    const controller = document.querySelector('[data-role="topology-edit-render-host"]')
      ?.__topologyEditAuthoringController;
    const nodeIds = controller?.selection?.nodeIds ?? [];
    if (nodeIds.length !== 1) throw new Error('Start Route did not select its created end node.');
    return nodeIds[0];
  });
}

async function configureConnect(page, startNodeId, endNodeId) {
  await page.locator('[data-action="activate-authoring-connect-ends"]').click();
  await setControllerSelection(page, startNodeId);
  await page.locator('[data-action="capture-connect-start"]').click();
  await setControllerSelection(page, endNodeId);
  await page.locator('[data-action="capture-connect-end"]').click();
  await expect.poll(() => page.locator('[data-connect-field="catalogueRecordId"] option').count())
    .toBeGreaterThan(1);
  await page.evaluate((policy) => {
    for (const [key, value] of Object.entries(policy)) {
      const control = document.querySelector(`[data-connect-field="${key}"]`);
      if (!control) throw new Error(`Missing Connect field ${key}.`);
      if (control.type === 'checkbox') control.checked = Boolean(value);
      else control.value = String(value);
    }
    document.querySelector('[data-connect-field="maxAlternatives"]')
      ?.dispatchEvent(new Event('change', { bubbles: true }));
  }, { ...PIPE_POLICY, allowDirect: true, allowOrthogonal: true, maxAlternatives: 5 });
  await page.locator('[data-action="plan-connect-alternatives"]').click();
  await expect.poll(() => page.locator('[data-connect-field="alternativeId"] option').count()).toBeGreaterThan(1);
  const alternativeId = await page.locator('[data-connect-field="alternativeId"] option')
    .filter({ hasText: 'x>y' }).first().getAttribute('value');
  expect(alternativeId).toBeTruthy();
  await page.locator('[data-connect-field="alternativeId"]').selectOption(alternativeId);
  await expect(page.getByText('UNIQUE EXACT')).toBeVisible();
}
async function setControllerSelection(page, nodeId) {
  await page.evaluate((id) => {
    const controller = document.querySelector('[data-role="topology-edit-render-host"]')
      ?.__topologyEditAuthoringController;
    controller.selection = { nodeIds: [id], edgeId: null };
    controller.authoringRuntime.selectionChanged();
  }, nodeId);
}

async function controllerEvidence(page) {
  return page.evaluate(() => {
    const host = document.querySelector('[data-role="topology-edit-render-host"]');
    const controller = host?.__topologyEditAuthoringController;
    const runtime = controller?.authoringRuntime;
    const session = controller?.session; const topology = session?.currentTopology?.();
    const journal = session?.journal; const renderer = controller?.viewportBackend?.renderer;
    return {
      canonicalHash: topology?.canonicalTopologyHash ?? null,
      journalHash: journal?.journalHash ?? null,
      activeLedgerHash: journal?.activeLedgerHash ?? null,
      nodeCount: topology?.nodes?.length ?? 0,
      edgeCount: topology?.edges?.length ?? 0,
      bendCount: topology?.bends?.length ?? 0,
      activeCommandCount: journal?.activeCommandIds?.length ?? 0,
      commandTypes: (journal?.history ?? []).map((row) => row.request?.commandType),
      transactionHash: runtime?.transaction?.transactionHash ?? null,
      transactionCommandCount: runtime?.transaction?.commandCount ?? 0,
      connectPhase: runtime?.connectPhase?.() ?? null,
      connectOperationHash: host?.dataset?.topologyEditConnectOperationHash ?? '',
      connectElbowBindingHashes: host?.dataset?.topologyEditConnectElbowBindingHashes ?? '',
      ghostChildCount: controller?.viewportBackend?.groups?.ghostGroup?.children?.length ?? 0,
      rendererCanvasCount: renderer?.domElement ? 1 : 0,
      webglContextPresent: Boolean(renderer?.getContext?.()),
    };
  });
}
