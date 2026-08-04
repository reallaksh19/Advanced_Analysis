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
const COMMAND_SCENARIOS = Object.freeze([
  { actionId: 'move-positive-z', ports: ['P-001:port:start'] },
  { actionId: 'set-gap-3', ports: ['P-001:port:end', 'E-001:port:start'] },
  { actionId: 'set-gap-20', ports: ['P-001:port:end', 'E-001:port:start'] },
  { actionId: 'merge-nodes', ports: ['P-001:port:end', 'E-001:port:start'] },
  { actionId: 'bridge-gap', ports: ['P-003:port:end', 'R-001:port:start'] },
  { actionId: 'add-straight', ports: ['P-003:port:end', 'R-001:port:start'] },
  { actionId: 'split-edge-half', edgeId: 'edge:P-001' },
  { actionId: 'disconnect-from', edgeId: 'edge:P-001' },
  { actionId: 'disconnect-to', edgeId: 'edge:P-001' },
  { actionId: 'delete-edge', edgeId: 'edge:P-001' },
]);

// This audit intentionally uses the real WebGL backend. Do not replace it with
// the canvas2d qualification fallback used by older walkthroughs.
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('real WebGL selection enables the exact governed edit tools', async ({ page }) => {
  const host = await openFinalAuditController(page);
  await openPanel(host, 'commands');
  await expectDisabled(page, ALL_ACTIONS);

  await clickCanonicalObject(page, 'edge:P-001');
  await expect.poll(() => controllerSelection(page)).toEqual({
    nodeIds: [], edgeId: 'edge:P-001',
  });
  await expectEnabled(page, EDGE_ACTIONS);
  await expectDisabled(page, ['move-positive-z', ...TWO_NODE_ACTIONS]);

  const singleNodeId = await selectPort(page, 'P-001:port:start', false);
  await expect.poll(() => controllerSelection(page)).toEqual({
    nodeIds: [singleNodeId], edgeId: null,
  });
  await expectEnabled(page, ['move-positive-z']);
  await expectDisabled(page, [...TWO_NODE_ACTIONS, ...EDGE_ACTIONS]);

  const anchorNodeId = await selectPort(page, 'P-001:port:end', false);
  const movingNodeId = await selectPort(page, 'E-001:port:start', true);
  await expect.poll(() => controllerSelection(page)).toEqual({
    nodeIds: [anchorNodeId, movingNodeId], edgeId: null,
  });
  await expectEnabled(page, TWO_NODE_ACTIONS);
  await expectDisabled(page, ['move-positive-z', ...EDGE_ACTIONS]);
});

test('all ten governed edit tools execute independently on the 20-object sample', async ({ page }, testInfo) => {
  const executions = [];
  for (const scenario of COMMAND_SCENARIOS) {
    const host = await openFinalAuditController(page);
    await openPanel(host, 'commands');
    if (scenario.edgeId) await clickCanonicalObject(page, scenario.edgeId);
    else {
      for (let index = 0; index < scenario.ports.length; index += 1) {
        await selectPort(page, scenario.ports[index], index > 0);
      }
    }

    const button = page.locator(`[data-command-action="${scenario.actionId}"]`);
    await expect(button).toBeEnabled();
    const beforeHash = await host.getAttribute('data-topology-edit-canonical-hash');
    await button.click();
    await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '1');
    const afterHash = await host.getAttribute('data-topology-edit-canonical-hash');
    expect(afterHash).not.toBe(beforeHash);
    const status = await page.locator('[data-role="topology-edit-status"]').innerText();
    expect(status).toMatch(/accepted/i);
    executions.push({
      actionId: scenario.actionId,
      selection: await controllerSelection(page),
      beforeHash,
      afterHash,
      status,
    });
  }

  await testInfo.attach('all-tools-final-state', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await mkdir('reports/qualification', { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify({
    schema: 'TopologyEditToolAuditEvidence.v1',
    status: 'PASS_ALL_GOVERNED_EDIT_TOOLS',
    candidateHead: process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || process.env.GITHUB_SHA || null,
    fixture: 'public/fixtures/topology-edit-20-element-demo.staged.json',
    backend: 'TopologyEditNavigationHudViewportBackend',
    executionCount: executions.length,
    executions,
  }, null, 2)}\n`);
});

test('navigation, presentation, history, and draft controls remain operable', async ({ page }) => {
  const host = await openFinalAuditController(page);
  await openPanel(host, 'commands');
  await clickCanonicalObject(page, 'edge:P-001');

  for (const mode of ['select', 'orbit', 'pan', 'select']) {
    await page.locator(`[data-navigation-mode="${mode}"]`).click();
    await expect(host).toHaveAttribute('data-topology-edit-navigation-mode', mode);
  }
  await page.locator('[data-navigation-action="fit"]').click();
  await expect(page.locator('[data-role="topology-edit-status"]')).toContainText('View command: fit.');

  const views = host.locator('details[data-panel-kind="views"]');
  await views.locator('summary').click();
  for (const action of ['fit-selection', 'home', 'previous', 'pivot-selection']) {
    await page.locator(`[data-navigation-action="${action}"]`).click();
    await expect(page.locator('[data-role="topology-edit-status"]'))
      .toContainText(`View command: ${action}.`);
  }
  await page.locator('[data-navigation-action="projection"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-projection', /orthographic|perspective/);
  for (const view of ['iso', 'top', 'front', 'right']) {
    await page.locator(`[data-standard-view="${view}"]`).click();
    await expect(page.locator('[data-role="topology-edit-status"]'))
      .toContainText(`Standard view: ${view.toUpperCase()}.`);
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

  await selectPort(page, 'P-001:port:start', false);
  await page.locator('[data-command-action="move-positive-z"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '1');
  await page.locator('[data-action="undo"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '0');
  await page.locator('[data-action="redo"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '1');
  await page.locator('[data-action="save-draft"]').click();
  await expect(page.locator('[data-role="topology-edit-status"]')).toContainText('Draft saved:');
  await expect(host).not.toHaveAttribute('data-topology-edit-draft-package-hash', '');

  await openPanel(host, 'draft');
  await page.locator('[data-action="reload-draft"]').click();
  await expect(page.locator('[data-role="topology-edit-status"]'))
    .toContainText('Draft restored at session version');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-action="export-draft"]').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/topology-edit.*\.json$/i);
});

async function openFinalAuditController(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => globalThis.localStorage?.clear());
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
    if (!prototype.__toolAuditActivateWrapped) {
      const activate = prototype.activate;
      prototype.activate = async function auditedActivate(...args) {
        globalThis[key] = this;
        return activate.apply(this, args);
      };
      Object.defineProperty(prototype, '__toolAuditActivateWrapped', {
        value: true,
        configurable: true,
      });
    }
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
  if (!(await panel.evaluate((element) => element.open))) await panel.locator('summary').click();
  return panel;
}

async function selectPort(page, portKey, additive) {
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await openPanel(host, 'topology-edit-canonical-search');
  const input = page.locator('[data-role="topology-edit-search-input"]');
  await input.fill(portKey);
  const result = page.locator('[data-search-object-kind="node"]');
  await expect(result).toHaveCount(1);
  const canonicalId = await result.getAttribute('data-search-canonical-id');
  await result.click({ modifiers: additive ? ['Shift'] : [] });
  return canonicalId;
}

async function clickCanonicalObject(page, canonicalId, additive = false) {
  const point = await page.evaluate(({ key, id }) => {
    const backend = globalThis[key]?.viewportBackend;
    const canvas = backend?.renderer?.domElement;
    if (!backend || !canvas) throw new Error('WebGL audit context is unavailable.');
    const rect = canvas.getBoundingClientRect();
    for (let y = rect.top + 1; y < rect.bottom; y += 2) {
      for (let x = rect.left + 1; x < rect.right; x += 2) {
        const context = backend.pickContext(x, y);
        const pick = context ? backend.pickWithRaycaster(context.pointer) : null;
        if (pick?.objectId === id) return { x, y };
      }
    }
    throw new Error(`Visible ray pick target ${id} is unavailable.`);
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
