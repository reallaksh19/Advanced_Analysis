import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const REPORT_PATH = 'reports/qualification/topology-edit-tool-audit.json';
const CONTROLLER_KEY = '__TOPOLOGY_EDIT_TOOL_AUDIT_CONTROLLER__';

const EDGE_ACTIONS = Object.freeze([
  'split-edge-half',
  'disconnect-from',
  'disconnect-to',
  'delete-edge',
]);
const TWO_NODE_ACTIONS = Object.freeze([
  'set-gap-3',
  'set-gap-20',
  'merge-nodes',
  'bridge-gap',
  'add-straight',
]);

// This audit intentionally uses the real WebGL backend. Do not replace it with
// the canvas2d qualification fallback used by older walkthroughs.
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('real WebGL selection enables the exact governed edit tools', async ({ page }, testInfo) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const host = await openFinalAuditController(page);
  const editPanel = host.locator('details[data-panel-kind="commands"]');
  await editPanel.locator('summary').click();

  await expectAllDisabled(page, ['move-positive-z', ...TWO_NODE_ACTIONS, ...EDGE_ACTIONS]);

  await clickCanonicalObject(page, 'edge:P-001');
  await expect.poll(() => controllerSelection(page)).toEqual({ nodeIds: [], edgeId: 'edge:P-001' });
  await expectEnabled(page, EDGE_ACTIONS);
  await expectDisabled(page, ['move-positive-z', ...TWO_NODE_ACTIONS]);

  const singleNodeId = await nodeIdForPort(page, 'P-001:port:start');
  await clickCanonicalObject(page, singleNodeId);
  await expect.poll(() => controllerSelection(page)).toEqual({ nodeIds: [singleNodeId], edgeId: null });
  await expectEnabled(page, ['move-positive-z']);
  await expectDisabled(page, [...TWO_NODE_ACTIONS, ...EDGE_ACTIONS]);

  const anchorNodeId = await nodeIdForPort(page, 'P-001:port:end');
  const movingNodeId = await nodeIdForPort(page, 'E-001:port:start');
  await clickCanonicalObject(page, anchorNodeId);
  await clickCanonicalObject(page, movingNodeId, true);
  await expect.poll(() => controllerSelection(page)).toEqual({
    nodeIds: [anchorNodeId, movingNodeId],
    edgeId: null,
  });
  await expectEnabled(page, TWO_NODE_ACTIONS);
  await expectDisabled(page, ['move-positive-z', ...EDGE_ACTIONS]);

  const report = {
    schema: 'TopologyEditToolAuditEvidence.v1',
    status: 'PASS_WEBGL_SELECTION_ENABLEMENT',
    candidateHead: process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || process.env.GITHUB_SHA || null,
    fixture: 'public/fixtures/topology-edit-20-element-demo.staged.json',
    backend: await page.evaluate((key) => globalThis[key]?.viewportBackend?.constructor?.name ?? null, CONTROLLER_KEY),
    edgeSelection: 'edge:P-001',
    singleNodeSelection: singleNodeId,
    twoNodeSelection: [anchorNodeId, movingNodeId],
    enabledActions: {
      edge: EDGE_ACTIONS,
      singleNode: ['move-positive-z'],
      twoNode: TWO_NODE_ACTIONS,
    },
    pageErrors,
    consoleErrors,
  };
  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter(isCriticalConsoleError)).toEqual([]);
  await testInfo.attach('tool-enablement', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await mkdir('reports/qualification', { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
});

async function openFinalAuditController(page) {
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

  await page.evaluate(async (key) => {
    const { APPLICATION_EVENTS } = await import('/src/workspace/event-topics.js');
    globalThis.EventBus.publish(APPLICATION_EVENTS.CHANGED, {
      state: { activeViewId: 'TOPOLOGY_EDIT_TOOL_AUDIT' },
    });
    const { TopologyEdit3DViewController } = await import(
      '/src/workspace/topology-edit-3d-professional-controller.js'
    );
    const controller = new TopologyEdit3DViewController(globalThis.EventBus);
    globalThis[key] = controller;
    await controller.activate();
  }, CONTROLLER_KEY);

  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute('data-topology-edit-clean-shell', 'true');
  await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '0');
  await expect.poll(() => page.evaluate((key) => (
    globalThis[key]?.viewportBackend?.constructor?.name ?? ''
  ), CONTROLLER_KEY)).toContain('NavigationHud');
  return host;
}

async function nodeIdForPort(page, portKey) {
  return page.evaluate(({ key, port }) => {
    const topology = globalThis[key]?.session?.currentTopology?.();
    const node = topology?.nodes?.find((row) => row.portKeys?.includes(port));
    if (!node) throw new Error(`Canonical node for ${port} is unavailable.`);
    return node.id;
  }, { key: CONTROLLER_KEY, port: portKey });
}

async function clickCanonicalObject(page, canonicalId, additive = false) {
  const point = await page.evaluate(({ key, id }) => {
    const controller = globalThis[key];
    const backend = controller?.viewportBackend;
    const camera = backend?.activeCamera;
    const canvas = backend?.renderer?.domElement;
    if (!backend || !camera || !canvas) throw new Error('WebGL audit context is unavailable.');

    let target = null;
    for (const groupName of ['draftGroup', 'sourceGroup']) {
      const group = backend.groups?.[groupName];
      group?.traverse?.((object) => {
        if (target) return;
        const direct = object.userData?.pickTarget;
        if (direct?.objectId === id) target = direct;
        const table = object.userData?.pickTable;
        const match = Array.isArray(table) ? table.find((row) => row?.objectId === id) : null;
        if (!target && match) target = match;
      });
      if (target) break;
    }
    if (!target) throw new Error(`Pick target ${id} is unavailable.`);
    const bounds = backend.boundsForPick(target);
    if (!bounds || bounds.isEmpty()) throw new Error(`Pick bounds ${id} are unavailable.`);
    const center = bounds.getCenter(camera.position.clone()).project(camera);
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + ((center.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - center.y) / 2) * rect.height,
    };
  }, { key: CONTROLLER_KEY, id: canonicalId });

  if (additive) await page.keyboard.down('Shift');
  await page.mouse.click(point.x, point.y);
  if (additive) await page.keyboard.up('Shift');
}

async function controllerSelection(page) {
  return page.evaluate((key) => {
    const selection = globalThis[key]?.selection;
    return {
      nodeIds: [...(selection?.nodeIds ?? [])],
      edgeId: selection?.edgeId ?? null,
    };
  }, CONTROLLER_KEY);
}

async function expectAllDisabled(page, actionIds) {
  await expectDisabled(page, actionIds);
}

async function expectEnabled(page, actionIds) {
  for (const actionId of actionIds) {
    await expect(page.locator(`[data-command-action="${actionId}"]`)).toBeEnabled();
  }
}

async function expectDisabled(page, actionIds) {
  for (const actionId of actionIds) {
    await expect(page.locator(`[data-command-action="${actionId}"]`)).toBeDisabled();
  }
}

function isCriticalConsoleError(message) {
  return [
    /ReferenceError/i,
    /Cannot access .* before initialization/i,
    /does not provide an export named/i,
    /Failed to fetch dynamically imported module/i,
    /circular import/i,
    /WebGL context lost/i,
    /TOPOLOGY_EDIT/i,
  ].some((pattern) => pattern.test(message));
}
