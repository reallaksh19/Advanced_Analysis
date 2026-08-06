import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const REPORT = 'reports/qualification/start-route-authoring-core.json';
const PIPE_RECORD = 'PIPE-DN100-SCH40-A';
const ROUTE_VALUES = Object.freeze({
  inputMode: 'TYPED',
  startX: '50000', startY: '50000', startZ: '50000',
  endX: '51000', endY: '50000', endZ: '50000',
  axisLock: 'FREE', catalogueRecordId: PIPE_RECORD,
  minimumLengthMm: '6', overlapToleranceMm: '0.001',
});

test.describe.configure({ mode: 'serial' });

test('production HUD completes certified Start Route lifecycle', async ({ page }, testInfo) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
  const host = await openProductionController(page);
  const before = await controllerEvidence(page);

  await openAuthoringPanel(page);
  await activateAndConfigure(page);
  await page.locator('[data-action="preview-authoring-operation"]').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-start-route-preview-hash'))
    .toBeTruthy();
  const preview = await controllerEvidence(page);
  expect(preview.canonicalHash).toBe(before.canonicalHash);
  expect(preview.journalHash).toBe(before.journalHash);
  expect(preview.ghostChildCount).toBeGreaterThan(0);
  expect(preview.startRoutePhase).toBe('PREVIEW_READY');

  await page.locator('[data-action="cancel-authoring-operation"]').click();
  await expect.poll(() => controllerEvidence(page).then((row) => row.canonicalHash))
    .toBe(before.canonicalHash);
  const cancelled = await controllerEvidence(page);
  expect(cancelled.journalHash).toBe(before.journalHash);
  expect(cancelled.ghostChildCount).toBe(0);

  await activateAndConfigure(page);
  await page.locator('[data-action="preview-authoring-operation"]').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-start-route-preview-hash'))
    .toBeTruthy();
  await page.locator('[data-action="validate-authoring-operation"]').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-authoring-phase'))
    .toBe('READY_TO_APPLY');
  await expect.poll(() => host.getAttribute('data-topology-edit-start-route-validation-hash'))
    .toBeTruthy();

  await page.locator('[data-action="apply-authoring-operation"]').click();
  await expect.poll(() => controllerEvidence(page).then((row) => row.activeCommandCount))
    .toBe(before.activeCommandCount + 3);
  const applied = await controllerEvidence(page);
  expect(applied.nodeCount).toBe(before.nodeCount + 2);
  expect(applied.edgeCount).toBe(before.edgeCount + 1);
  expect(applied.commandTypes.slice(-3)).toEqual([
    'CREATE_NODE', 'CREATE_NODE', 'INSERT_PIPE_SEGMENT',
  ]);
  expect(applied.transactionCommandCount).toBe(3);
  expect(applied.ghostChildCount).toBe(0);
  expect(applied.rendererCanvasCount).toBe(1);
  expect(applied.webglContextPresent).toBe(true);

  await page.locator('[data-action="undo-start-route-operation"]').click();
  await expect.poll(() => controllerEvidence(page).then((row) => row.canonicalHash))
    .toBe(before.canonicalHash);
  const undone = await controllerEvidence(page);
  expect(undone.journalHash).toBe(before.journalHash);
  expect(undone.nodeCount).toBe(before.nodeCount);
  expect(undone.edgeCount).toBe(before.edgeCount);

  await page.locator('[data-action="redo-start-route-operation"]').click();
  await expect.poll(() => controllerEvidence(page).then((row) => row.canonicalHash))
    .toBe(applied.canonicalHash);
  const redone = await controllerEvidence(page);
  expect(redone.journalHash).toBe(applied.journalHash);
  expect(redone.nodeCount).toBe(applied.nodeCount);
  expect(redone.edgeCount).toBe(applied.edgeCount);
  expect(redone.activeCommandCount).toBe(applied.activeCommandCount);

  await expect(host).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((message) => !message.includes('favicon'))).toEqual([]);
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach('start-route-production-hud', {
    body: screenshot,
    contentType: 'image/png',
  });
  await mkdir('reports/qualification', { recursive: true });
  await writeFile(REPORT, `${JSON.stringify({
    schema: 'TopologyEditStartRouteProductionHudEvidence.v3',
    candidateHead: process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || null,
    status: 'PASS_PRODUCTION_HUD_CERTIFIED_WORKER_APPLY_UNDO_REDO',
    evidence: { before, preview, cancelled, applied, undone, redone },
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
    document.querySelector('[data-role="topology-edit-render-host"]')
      ?.__topologyEditAuthoringController
  ))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(
    document.querySelector('[data-role="topology-edit-render-host"]')
      ?.__topologyEditAuthoringController?.professionalRuntime?.catalogue
  ))).toBe(true);
  return host;
}

async function openAuthoringPanel(page) {
  const details = page.locator('details[data-panel-kind="authoring"]');
  if (!(await details.evaluate((element) => element.open))) {
    await details.locator(':scope > summary').click();
  }
  await expect.poll(() => details.evaluate((element) => element.open)).toBe(true);
}

async function activateAndConfigure(page) {
  await page.locator('[data-action="activate-authoring-start-route"]').click();
  await expect.poll(() => page.locator(
    '[data-start-route-field="catalogueRecordId"] option',
  ).count()).toBeGreaterThan(1);
  await page.evaluate((values) => {
    for (const [key, value] of Object.entries(values)) {
      const control = document.querySelector(`[data-start-route-field="${key}"]`);
      if (!control) throw new Error(`Missing Start Route HUD field ${key}.`);
      control.value = value;
    }
    document.querySelector('[data-start-route-field="overlapToleranceMm"]')
      ?.dispatchEvent(new Event('change', { bubbles: true }));
  }, ROUTE_VALUES);
  await expect(page.locator('[data-start-route-field="catalogueRecordId"]'))
    .toHaveValue(PIPE_RECORD);
}

async function controllerEvidence(page) {
  return page.evaluate(() => {
    const host = document.querySelector('[data-role="topology-edit-render-host"]');
    const controller = host?.__topologyEditAuthoringController;
    const runtime = controller?.authoringRuntime;
    const session = controller?.session;
    const topology = session?.currentTopology?.();
    const journal = session?.journal;
    const renderer = controller?.viewportBackend?.renderer;
    return {
      canonicalHash: topology?.canonicalTopologyHash ?? null,
      journalHash: journal?.journalHash ?? null,
      nodeCount: topology?.nodes?.length ?? 0,
      edgeCount: topology?.edges?.length ?? 0,
      activeCommandCount: journal?.activeCommandIds?.length ?? 0,
      commandTypes: (journal?.history ?? []).map((row) => row.request?.commandType),
      transactionHash: runtime?.transaction?.transactionHash ?? null,
      transactionCommandCount: runtime?.transaction?.commandCount ?? 0,
      startRoutePhase: runtime?.startRouteRuntime?.phase ?? null,
      ghostChildCount: controller?.viewportBackend?.groups?.ghostGroup?.children?.length ?? 0,
      rendererCanvasCount: renderer?.domElement ? 1 : 0,
      webglContextPresent: Boolean(renderer?.getContext?.()),
    };
  });
}
