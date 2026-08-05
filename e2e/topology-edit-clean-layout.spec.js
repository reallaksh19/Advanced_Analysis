import { expect, test } from '@playwright/test';

const CONTROLLER_KEY = '__TOPOLOGY_EDIT_PRODUCTIVITY_CONTROLLER__';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('3D Edit keeps the left model tree visible while the canvas remains primary', async ({ page }) => {
  await openProductionDemo(page);

  const outerShell = page.locator('.workspace-shell');
  const treePanel = outerShell.locator('.tree-panel');
  const propertiesPanel = outerShell.locator('.properties-panel');
  const host = page.locator('[data-role="topology-edit-render-host"]');
  const workspace = host.locator('[data-role="topology-edit-workspace"]');
  const canvas = host.locator('.topology-edit-3d-canvas');
  const sidecar = host.locator('[data-role="topology-edit-sidecar"]');
  const statusbar = host.locator('[data-role="topology-edit-statusbar"]');
  const compactDock = page.locator('[data-role="load-calc-consumer-root"]');
  const canonicalTree = host.locator('[data-role="topology-edit-object-tree"]');

  await expect(host).toHaveAttribute('data-topology-edit-clean-shell', 'true');
  await expect(host).toHaveAttribute('data-topology-edit-inspector-open', 'true');
  await expect(host).toHaveAttribute('data-topology-edit-inspector-width-px', '320');
  await expect(outerShell).toHaveAttribute('data-topology-edit-focus-layout', 'true');
  await expect(outerShell).toHaveAttribute('data-topology-edit-left-panel-visible', 'true');
  await expect(treePanel).not.toHaveClass(/workspace-panel--collapsed/);
  await expect(treePanel).toBeVisible();
  await expect(propertiesPanel).toHaveClass(/workspace-panel--collapsed/);
  await expect(workspace).toBeVisible();
  await expect(canvas).toBeVisible();
  await expect(sidecar).toBeVisible();
  await expect(statusbar).toBeVisible();
  await expect(compactDock).toHaveClass(/load-calc-dock--compact/);

  const [outerBox, treeBox, workspaceBox, canvasBox, sidecarBox] = await Promise.all([
    outerShell.boundingBox(),
    treePanel.boundingBox(),
    workspace.boundingBox(),
    canvas.boundingBox(),
    sidecar.boundingBox(),
  ]);
  expect(outerBox).not.toBeNull();
  expect(treeBox).not.toBeNull();
  expect(workspaceBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  expect(sidecarBox).not.toBeNull();
  expect(treeBox.width).toBeGreaterThan(250);
  expect(workspaceBox.width / outerBox.width).toBeGreaterThan(0.7);
  expect(canvasBox.width).toBeGreaterThan(sidecarBox.width * 2.5);
  expect(canvasBox.width / workspaceBox.width).toBeGreaterThan(0.7);
  expect(canvasBox.height).toBeGreaterThan(650);

  await expect(host).toHaveAttribute('data-topology-edit-gpu-first-picking', 'true');
  await expect(host).toHaveAttribute('data-topology-edit-large-model-tier', /STANDARD|LARGE|MASSIVE/);
  const [requestedRatio, appliedRatio, renderItems] = await Promise.all([
    numberAttribute(host, 'data-topology-edit-requested-pixel-ratio'),
    numberAttribute(host, 'data-topology-edit-applied-pixel-ratio'),
    integerAttribute(host, 'data-topology-edit-render-item-count'),
  ]);
  expect(appliedRatio).toBeGreaterThan(0);
  expect(appliedRatio).toBeLessThanOrEqual(requestedRatio);
  expect(renderItems).toBeGreaterThan(0);

  const [treeTotal, treeRows] = await Promise.all([
    integerAttribute(canonicalTree, 'data-topology-edit-object-tree-count'),
    integerAttribute(canonicalTree, 'data-topology-edit-object-tree-rendered-row-count'),
  ]);
  expect(treeTotal).toBeGreaterThan(0);
  expect(treeRows).toBeGreaterThan(0);
  expect(treeRows).toBeLessThanOrEqual(treeTotal);

  await expect(compactDock.locator('.empirical-load-calc__facts')).toBeHidden();
  await expect(compactDock.locator('.empirical-load-calc__actions')).toBeHidden();
  await expect(compactDock.locator('[data-load-calc-pane]')).toBeHidden();

  const editPanel = sidecar.locator('details[data-panel-kind="commands"]');
  const displayPanel = sidecar.locator('details[data-panel-kind="display"]');
  await expect(editPanel).not.toHaveAttribute('open', '');
  await expect(displayPanel).not.toHaveAttribute('open', '');
  await expect(page.getByRole('button', { name: 'Move +Z 100 mm', exact: true })).toBeHidden();

  await editPanel.locator('summary').click();
  await expect(page.getByRole('button', { name: 'Move +Z 100 mm', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set gap 3 mm', exact: true })).toBeVisible();

  await expect(host.getByRole('button', { name: 'Select', exact: true })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Fit', exact: true })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Fit selection', exact: true })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Save draft', exact: true })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Commit draft', exact: true })).toBeVisible();

  const footerText = await statusbar.locator('[data-role="topology-edit-status"]').innerText();
  expect(footerText).toMatch(/nodes, .*edges, .*supports/);

  await page.getByRole('button', { name: '3D WebGL', exact: true }).click();
  await expect(outerShell).toHaveAttribute('data-topology-edit-focus-layout', 'false');
  await expect(treePanel).not.toHaveClass(/workspace-panel--collapsed/);
  await expect(propertiesPanel).not.toHaveClass(/workspace-panel--collapsed/);
});

test('3D Edit provides resizable persistent inspector, selection focus, status badges, and keyboard help', async ({ page }) => {
  const host = await openProductionDemo(page);
  const canvas = host.locator('canvas');
  const sidecar = host.locator('[data-role="topology-edit-sidecar"]');
  const resizer = host.locator('[data-role="topology-edit-sidecar-resizer"]');
  const fitSelection = host.getByRole('button', { name: 'Fit selection', exact: true });
  const clearSelection = host.getByRole('button', { name: 'Clear', exact: true });
  const shortcuts = host.locator('[data-role="topology-edit-shortcuts"]');

  await expect(resizer).toBeVisible();
  await expect(fitSelection).toBeDisabled();
  await expect(clearSelection).toBeDisabled();
  await expect(host.locator('[data-role="topology-edit-draft-state"]')).toHaveText('Clean · 0 edits');

  await resizer.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(host).toHaveAttribute('data-topology-edit-inspector-width-px', '336');

  await host.getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(host).toHaveAttribute('data-topology-edit-inspector-open', 'false');
  await expect(sidecar).toBeHidden();
  await host.focus();
  await page.keyboard.press('i');
  await expect(host).toHaveAttribute('data-topology-edit-inspector-open', 'true');
  await expect(sidecar).toBeVisible();

  await host.focus();
  await page.keyboard.press('Shift+/');
  await expect(shortcuts).toBeVisible();
  await expect(shortcuts).toContainText('Double-click');
  await page.keyboard.press('Escape');
  await expect(shortcuts).toBeHidden();

  const nodeId = await selectQualifiedNode(page);
  await expect(host).toHaveAttribute('data-topology-edit-selection-count', '1');
  await expect(host.locator('[data-role="topology-edit-selection-summary"]')).toHaveAttribute('title', nodeId);
  await expect(fitSelection).toBeEnabled();
  await expect(clearSelection).toBeEnabled();
  await expect(host.locator('details[data-panel-kind="topology-edit-inspection"]')).toHaveAttribute('open', '');
  await expect(host.locator('details[data-panel-kind="topology-edit-professional-interaction"]')).toHaveAttribute('open', '');

  await canvas.dispatchEvent('dblclick');
  await expect(host.locator('[data-role="topology-edit-status"]')).toContainText('View command: fit-selection.');

  const issueCount = await integerAttribute(host, 'data-topology-edit-visible-issue-count');
  expect(issueCount).toBeGreaterThan(0);
  const issuePanel = host.locator('details[data-panel-kind="topology-edit-checker"]');
  await expect(issuePanel).toHaveAttribute('open', '');
  await expect(issuePanel.locator('[data-role="topology-edit-panel-badge"]')).toBeVisible();

  const displayPanel = host.locator('details[data-panel-kind="display"]');
  if (!(await displayPanel.evaluate((element) => element.open))) {
    await displayPanel.locator(':scope > summary').click();
  }
  const commandPanel = host.locator('details[data-panel-kind="commands"]');
  if (!(await commandPanel.evaluate((element) => element.open))) {
    await commandPanel.locator(':scope > summary').click();
  }
  await expect(host).toHaveAttribute('data-topology-edit-source-visual-cache', 'MISS');
  await host.locator('[data-command-action="move-positive-z"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '1');
  await expect(host).toHaveAttribute('data-topology-edit-draft-state', 'saved');
  await expect(host).toHaveAttribute('data-topology-edit-source-visual-cache', 'HIT');
  await expect(host.locator('[data-role="topology-edit-draft-state"]')).toHaveText('Saved · 1 edit');

  await resizer.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(host).toHaveAttribute('data-topology-edit-inspector-width-px', '304');
  await displayPanel.locator(':scope > summary').click();
  await expect(displayPanel).not.toHaveAttribute('open', '');

  const draftPanel = host.locator('details[data-panel-kind="draft"]');
  if (!(await draftPanel.evaluate((element) => element.open))) {
    await draftPanel.locator(':scope > summary').click();
  }
  await host.locator('[data-action="reload-draft"]').click();
  await expect(host.locator('[data-role="topology-edit-status"]')).toContainText('Draft restored at session version');
  await expect(host).toHaveAttribute('data-topology-edit-inspector-width-px', '336');
  await expect(displayPanel).toHaveAttribute('open', '');
  await expect(draftPanel).toHaveAttribute('open', '');

  await host.focus();
  await page.keyboard.press('Escape');
  await expect(host).toHaveAttribute('data-topology-edit-selection-count', '0');
  await expect(fitSelection).toBeDisabled();
});

async function openProductionDemo(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await navigation.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.locator('[data-action="load-topology-edit-demo"]').click();
  await expect.poll(() => page.evaluate(() => (
    globalThis.AnalysisWorkspace?.getSnapshot?.()?.dataset?.entities?.length ?? 0
  ))).toBe(20);

  await page.evaluate(async (key) => {
    const moduleUrl = new URL(
      'src/workspace/topology-edit-3d-sjson-fidelity-controller.js',
      document.baseURI,
    ).href;
    const { TopologyEdit3DViewController } = await import(moduleUrl);
    const prototype = TopologyEdit3DViewController.prototype;
    if (prototype.__productivityActivateWrapped) return;
    const activate = prototype.activate;
    prototype.activate = async function productivityActivate(...args) {
      globalThis[key] = this;
      return activate.apply(this, args);
    };
    Object.defineProperty(prototype, '__productivityActivateWrapped', {
      value: true,
      configurable: true,
    });
  }, CONTROLLER_KEY);

  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible();
  await expect.poll(() => page.evaluate((key) => Boolean(globalThis[key]?.session), CONTROLLER_KEY)).toBe(true);
  await expect(host).toHaveAttribute('data-topology-edit-render-item-count', /[1-9]\d*/);
  return host;
}

async function selectQualifiedNode(page) {
  return page.evaluate((key) => {
    const controller = globalThis[key];
    const topology = controller.session.currentTopology();
    const node = topology.nodes.find((row) => row.portKeys?.includes('P-001:port:start'))
      ?? topology.nodes[0];
    controller.selectionCoordinator.requestCanonical(
      'REPLACE',
      [node.id],
      'search',
      { primaryId: node.id, anchorId: node.id },
    );
    return node.id;
  }, CONTROLLER_KEY);
}

async function integerAttribute(locator, name) {
  return Number.parseInt(await locator.getAttribute(name) || '0', 10) || 0;
}

async function numberAttribute(locator, name) {
  return Number(await locator.getAttribute(name)) || 0;
}
