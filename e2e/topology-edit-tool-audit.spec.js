import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const REPORT_PATH = 'reports/qualification/topology-edit-tool-audit.json';
const CONTROLLER_KEY = '__TOPOLOGY_EDIT_TOOL_AUDIT_CONTROLLER__';
const EDGE_ACTIONS = Object.freeze([
  'split-edge-half', 'disconnect-from', 'disconnect-to', 'delete-edge',
]);
const TWO_NODE_ACTIONS = Object.freeze([
  'set-gap-3', 'set-gap-20', 'merge-nodes', 'bridge-gap', 'add-straight',
]);
const ALL_ACTIONS = Object.freeze([
  'move-positive-z', ...TWO_NODE_ACTIONS, ...EDGE_ACTIONS,
]);
const QUALIFIED_GAP_PORTS = Object.freeze([
  'P-001:port:end',
  'E-001:port:start',
]);
const COMMAND_SCENARIOS = Object.freeze([
  { actionId: 'move-positive-z', kind: 'single-node' },
  { actionId: 'set-gap-3', kind: 'two-node' },
  { actionId: 'set-gap-20', kind: 'two-node' },
  { actionId: 'merge-nodes', kind: 'two-node' },
  { actionId: 'bridge-gap', kind: 'two-node' },
  { actionId: 'add-straight', kind: 'two-node' },
  { actionId: 'split-edge-half', kind: 'edge' },
  { actionId: 'disconnect-from', kind: 'edge' },
  { actionId: 'disconnect-to', kind: 'any-edge' },
  { actionId: 'delete-edge', kind: 'edge' },
]);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('real WebGL picks enable the exact governed edit tools', async ({ page }) => {
  const host = await openFinalAuditController(page);
  await openPanel(host, 'commands');
  await expectDisabled(page, ALL_ACTIONS);
  const targets = await visibleSelectionTargets(page);

  await selectVisibleTarget(page, targets, 'edge');
  await expect(statusOutput(page)).toContainText(`Selected edge ${targets.edge.id}.`);
  await expectEnabled(page, EDGE_ACTIONS);
  await expectDisabled(page, ['move-positive-z', ...TWO_NODE_ACTIONS]);

  await selectVisibleTarget(page, targets, 'single-node');
  await expect(statusOutput(page)).toContainText(`Selected node ${targets.singleNode.id}.`);
  await expectEnabled(page, ['move-positive-z']);
  await expectDisabled(page, [...TWO_NODE_ACTIONS, ...EDGE_ACTIONS]);

  await selectVisibleTarget(page, targets, 'two-node');
  await expect(statusOutput(page)).toContainText('Selected nodes 1=');
  await expectEnabled(page, TWO_NODE_ACTIONS);
  await expectDisabled(page, ['move-positive-z', ...EDGE_ACTIONS]);
});

test('canonical search replaces the active selection and refreshes command enablement', async ({ page }) => {
  const host = await openFinalAuditController(page);
  await openPanel(host, 'commands');
  const targets = await visibleSelectionTargets(page);
  await selectVisibleTarget(page, targets, 'edge');
  await expectEnabled(page, EDGE_ACTIONS);

  const nodeId = await canonicalNodeForPort(page, 'P-001:port:start');
  await selectBySearch(page, host, nodeId);
  await expect(statusOutput(page)).toContainText(`Selected node ${nodeId}.`);
  await expectEnabled(page, ['move-positive-z']);
  await expectDisabled(page, [...TWO_NODE_ACTIONS, ...EDGE_ACTIONS]);
});

test('all ten governed edit tools execute independently on fresh 20-object samples', async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const executions = [];

  for (const scenario of COMMAND_SCENARIOS) {
    const host = await openFinalAuditController(page);
    await openPanel(host, 'commands');
    const baseHash = await host.getAttribute('data-topology-edit-canonical-hash');

    if (scenario.kind === 'any-edge') {
      executions.push(await executeAgainstAnyEdge(page, host, scenario.actionId, baseHash));
      continue;
    }
    if (scenario.kind === 'two-node') {
      await selectQualifiedGapBySearch(page, host);
    } else {
      const targets = await visibleSelectionTargets(page);
      await selectVisibleTarget(page, targets, scenario.kind);
    }
    executions.push(await executeSelectedAction(page, host, scenario.actionId, baseHash));
  }

  const rejected = executions.filter((row) => !row.accepted);
  await testInfo.attach('all-tools-final-state', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await mkdir('reports/qualification', { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify({
    schema: 'TopologyEditToolAuditEvidence.v1',
    status: rejected.length
      ? 'FAIL_GOVERNED_EDIT_TOOL_EXECUTION'
      : 'PASS_ALL_GOVERNED_EDIT_TOOLS',
    candidateHead: process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || process.env.GITHUB_SHA || null,
    fixture: 'public/fixtures/topology-edit-20-element-demo.staged.json',
    qualifiedGapPorts: QUALIFIED_GAP_PORTS,
    backend: 'TopologyEditNavigationHudViewportBackend',
    executionCount: executions.length,
    rejectedActionIds: rejected.map((row) => row.actionId),
    executions,
  }, null, 2)}\n`);

  expect(rejected, JSON.stringify(executions, null, 2)).toEqual([]);
});

test('navigation, presentation, history, and draft controls remain operable', async ({ page }) => {
  test.setTimeout(90_000);
  const host = await openFinalAuditController(page);
  await openPanel(host, 'commands');
  const targets = await visibleSelectionTargets(page);
  await selectVisibleTarget(page, targets, 'edge');

  for (const mode of ['select', 'orbit', 'pan', 'select']) {
    await page.locator(`[data-navigation-mode="${mode}"]`).click();
    await expect(host).toHaveAttribute('data-topology-edit-navigation-mode', mode);
  }
  await page.locator('[data-navigation-action="fit"]').click();
  await expect(statusOutput(page)).toContainText('View command: fit.');

  const views = host.locator('details[data-panel-kind="views"]');
  await views.locator(':scope > summary').click();
  for (const action of ['fit-selection', 'home', 'previous', 'pivot-selection']) {
    await page.locator(`[data-navigation-action="${action}"]`).click();
    await expect(statusOutput(page)).toContainText(`View command: ${action}.`);
  }
  await page.locator('[data-navigation-action="projection"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-projection', /orthographic|perspective/i);
  for (const view of ['iso', 'top', 'front', 'right']) {
    await page.locator(`[data-standard-view="${view}"]`).click();
    await expect(statusOutput(page)).toContainText(`Standard view: ${view.toUpperCase()}.`);
  }

  await openPanel(host, 'display');
  await page.locator('[data-action="hide-selected"]').click();
  await expect(page.locator('[data-role="presentation-visibility-status"]')).toHaveText('Hidden: 1');
  await page.locator('[data-action="show-all"]').click();
  await expect(page.locator('[data-role="presentation-visibility-status"]')).toHaveText('Visibility: all');
  await page.locator('[data-action="isolate-selected"]').click();
  await expect(page.locator('[data-role="presentation-visibility-status"]')).toHaveText('Isolated: 1');
  await page.locator('[data-action="reset-presentation"]').click();
  await expect(page.locator('[data-role="presentation-visibility-status"]')).toHaveText('Visibility: all');

  const nodeId = await canonicalNodeForPort(page, 'P-001:port:start');
  await selectBySearch(page, host, nodeId);
  await expectEnabled(page, ['move-positive-z']);
  await page.locator('[data-command-action="move-positive-z"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '1');
  await page.locator('[data-action="undo"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '0');
  await page.locator('[data-action="redo"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '1');
  await page.locator('[data-action="save-draft"]').click();
  await expect(statusOutput(page)).toContainText('Draft saved:');
  await expect.poll(() => host.getAttribute('data-topology-edit-draft-package-hash')).not.toBe('');

  await openPanel(host, 'draft');
  await page.locator('[data-action="reload-draft"]').click();
  await expect(statusOutput(page)).toContainText('Draft restored at session version');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-action="export-draft"]').click(),
  ]);
  expect(download.suggestedFilename()).toContain('.json');
});

async function openFinalAuditController(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await navigation.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.locator('[data-action="load-topology-edit-demo"]').click();
  await expect.poll(() => page.evaluate(() => (
    globalThis.AnalysisWorkspace?.getSnapshot?.()?.dataset?.entities?.length ?? 0
  ))).toBe(20);

  await page.evaluate(async (key) => {
    const moduleUrl = new URL(
      'src/workspace/topology-edit-3d-professional-controller.js',
      document.baseURI,
    ).href;
    const { TopologyEdit3DViewController } = await import(moduleUrl);
    const prototype = TopologyEdit3DViewController.prototype;
    if (prototype.__toolAuditActivateWrapped) return;
    const activate = prototype.activate;
    prototype.activate = async function auditedActivate(...args) {
      globalThis[key] = this;
      return activate.apply(this, args);
    };
    Object.defineProperty(prototype, '__toolAuditActivateWrapped', {
      value: true,
      configurable: true,
    });
  }, CONTROLLER_KEY);

  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute('data-topology-edit-clean-shell', 'true');
  await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '0');
  await expect.poll(() => page.evaluate((key) => (
    globalThis[key]?.viewportBackend?.constructor?.name ?? ''
  ), CONTROLLER_KEY)).toContain('NavigationHud');
  return host;
}

async function openPanel(host, kind) {
  const panel = host.locator(`details[data-panel-kind="${kind}"]`);
  if (!(await panel.evaluate((element) => element.open))) {
    await panel.locator(':scope > summary').click();
  }
  return panel;
}

async function visibleSelectionTargets(page) {
  return page.evaluate(async (key) => {
    const controller = globalThis[key];
    const backend = controller?.viewportBackend;
    const topology = controller?.session?.currentTopology?.();
    const canvas = backend?.renderer?.domElement;
    if (!backend || !topology || !canvas) throw new Error('Visible selection audit context is unavailable.');
    const moduleUrl = new URL(
      'src/workspace/topology-edit/topology-edit-command-ui.js',
      document.baseURI,
    ).href;
    const { topologyEditExactGapContext } = await import(moduleUrl);
    const rect = canvas.getBoundingClientRect();
    const points = new Map();
    for (let y = rect.top + 1; y < rect.bottom; y += 3) {
      for (let x = rect.left + 1; x < rect.right; x += 3) {
        const context = backend.pickContext(x, y);
        const pick = context ? backend.pickWithRaycaster(context.pointer) : null;
        if (!pick?.objectId || points.has(pick.objectId)) continue;
        points.set(pick.objectId, { x, y });
      }
    }
    const edgeId = points.has('edge:P-001')
      ? 'edge:P-001'
      : [...points.keys()].find((id) => id.startsWith('edge:'));
    const nodeIds = [...points.keys()].filter((id) => id.startsWith('node:'));
    let pair = null;
    for (let left = 0; left < nodeIds.length && !pair; left += 1) {
      for (let right = left + 1; right < nodeIds.length; right += 1) {
        const selection = { nodeIds: [nodeIds[left], nodeIds[right]], edgeId: null };
        if (topologyEditExactGapContext(selection, topology)) {
          pair = selection.nodeIds;
          break;
        }
      }
    }
    if (!edgeId || !nodeIds.length || !pair) {
      throw new Error(`Visible governed selection targets are incomplete: ${JSON.stringify({ edgeId, nodeIds, pair })}`);
    }
    return {
      edge: { id: edgeId, point: points.get(edgeId) },
      singleNode: { id: nodeIds[0], point: points.get(nodeIds[0]) },
      twoNode: pair.map((id) => ({ id, point: points.get(id) })),
    };
  }, CONTROLLER_KEY);
}

async function currentVisiblePointForCanonicalId(page, target) {
  return page.evaluate(({ key, canonicalId, preferredPoint }) => {
    const backend = globalThis[key]?.viewportBackend;
    const canvas = backend?.renderer?.domElement;
    if (!backend || !canvas) throw new Error('Current production picking context is unavailable.');
    const rect = canvas.getBoundingClientRect();
    const candidates = [];
    if (Number.isFinite(preferredPoint?.x) && Number.isFinite(preferredPoint?.y)) {
      candidates.push(preferredPoint);
    }
    for (let y = rect.top + 1; y < rect.bottom; y += 3) {
      for (let x = rect.left + 1; x < rect.right; x += 3) {
        candidates.push({ x, y });
      }
    }
    for (const point of candidates) {
      const context = backend.pickContext(point.x, point.y);
      const direct = context ? backend.pickWithRaycaster(context.pointer) : null;
      if (direct?.objectId !== canonicalId) continue;
      const production = backend.pickAt(point.x, point.y);
      if (production?.objectId === canonicalId) return point;
    }
    throw new Error(`Current projection cannot resolve ${canonicalId} through both direct and production picking.`);
  }, {
    key: CONTROLLER_KEY,
    canonicalId: target.id,
    preferredPoint: target.point,
  });
}

async function canonicalNodeForPort(page, portKey) {
  return page.evaluate(({ key, port }) => {
    const node = globalThis[key]?.session?.currentTopology?.()?.nodes
      ?.find((row) => row.portKeys?.includes(port));
    if (!node) throw new Error(`Canonical node for ${port} is unavailable.`);
    return node.id;
  }, { key: CONTROLLER_KEY, port: portKey });
}

async function canonicalEdgeIds(page) {
  return page.evaluate((key) => (
    globalThis[key]?.session?.currentTopology?.()?.edges
      ?.map((edge) => edge.id).sort() ?? []
  ), CONTROLLER_KEY);
}

async function executeAgainstAnyEdge(page, host, actionId, baseHash) {
  const attempts = [];
  for (const edgeId of await canonicalEdgeIds(page)) {
    await selectBySearch(page, host, edgeId);
    const result = await executeSelectedAction(page, host, actionId, baseHash, edgeId);
    attempts.push({
      edgeId,
      outcomeStatus: result.outcomeStatus,
      accepted: result.accepted,
    });
    if (result.accepted) return { ...result, attempts };
  }
  return {
    actionId,
    accepted: false,
    targetId: null,
    selectionStatus: 'No certifiable edge target found.',
    outcomeStatus: attempts.at(-1)?.outcomeStatus ?? 'No canonical edges available.',
    activeCommandCount: 0,
    baseHash,
    afterHash: baseHash,
    attempts,
  };
}

async function executeSelectedAction(page, host, actionId, baseHash, targetId = null) {
  const button = page.locator(`[data-command-action="${actionId}"]`);
  await expect(button).toBeEnabled();
  const selectionStatus = await statusOutput(page).innerText();
  await button.click();
  const outcomeStatus = await statusOutput(page).innerText();
  const activeCommandCount = Number(
    await host.getAttribute('data-topology-edit-active-command-count') || 0,
  );
  const afterHash = await host.getAttribute('data-topology-edit-canonical-hash');
  const accepted = /accepted/i.test(outcomeStatus)
    && activeCommandCount === 1
    && afterHash !== baseHash;
  return {
    actionId,
    targetId,
    selectionStatus,
    outcomeStatus,
    accepted,
    activeCommandCount,
    baseHash,
    afterHash,
  };
}

async function selectQualifiedGapBySearch(page, host) {
  const first = await canonicalNodeForPort(page, QUALIFIED_GAP_PORTS[0]);
  const second = await canonicalNodeForPort(page, QUALIFIED_GAP_PORTS[1]);
  await selectBySearch(page, host, first);
  await selectBySearch(page, host, second, true);
  await expect(statusOutput(page)).toContainText('Selected nodes 1=');
}

async function selectBySearch(page, host, canonicalId, additive = false) {
  await openPanel(host, 'topology-edit-canonical-search');
  const input = page.locator('[data-role="topology-edit-search-input"]');
  await input.fill(canonicalId);
  const result = page.locator(`[data-search-canonical-id="${canonicalId}"]`);
  await expect(result).toHaveCount(1);
  await result.click({ modifiers: additive ? ['Shift'] : [] });
}

async function selectVisibleTarget(page, targets, kind) {
  if (kind === 'edge') {
    await clickCanonicalVisibleTarget(page, targets.edge);
    return;
  }
  if (kind === 'single-node') {
    await clickCanonicalVisibleTarget(page, targets.singleNode);
    return;
  }
  await clickCanonicalVisibleTarget(page, targets.twoNode[0]);
  await clickCanonicalVisibleTarget(page, targets.twoNode[1], true);
}

async function clickCanonicalVisibleTarget(page, target, additive = false) {
  const point = await currentVisiblePointForCanonicalId(page, target);
  await clickPoint(page, point, additive);
}

async function clickPoint(page, point, additive = false) {
  if (additive) await page.keyboard.down('Shift');
  await page.mouse.click(point.x, point.y);
  if (additive) await page.keyboard.up('Shift');
}

function statusOutput(page) {
  return page.locator('[data-role="topology-edit-status"]');
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
