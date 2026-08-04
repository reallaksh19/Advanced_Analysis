import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('3D Edit keeps the canvas primary and defers dense controls into inspector drawers', async ({ page }) => {
  await openProductionDemo(page);

  const host = page.locator('[data-role="topology-edit-render-host"]');
  const workspace = host.locator('[data-role="topology-edit-workspace"]');
  const canvas = host.locator('.topology-edit-3d-canvas');
  const sidecar = host.locator('[data-role="topology-edit-sidecar"]');
  const statusbar = host.locator('[data-role="topology-edit-statusbar"]');
  const compactDock = page.locator('[data-role="load-calc-consumer-root"]');

  await expect(host).toHaveAttribute('data-topology-edit-clean-shell', 'true');
  await expect(workspace).toBeVisible();
  await expect(canvas).toBeVisible();
  await expect(sidecar).toBeVisible();
  await expect(statusbar).toBeVisible();
  await expect(compactDock).toHaveClass(/load-calc-dock--compact/);

  const [workspaceBox, canvasBox, sidecarBox] = await Promise.all([
    workspace.boundingBox(),
    canvas.boundingBox(),
    sidecar.boundingBox(),
  ]);
  expect(workspaceBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  expect(sidecarBox).not.toBeNull();
  expect(canvasBox.width).toBeGreaterThan(sidecarBox.width * 1.5);
  expect(canvasBox.width / workspaceBox.width).toBeGreaterThan(0.6);
  expect(canvasBox.height).toBeGreaterThan(650);

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
  await expect(host.getByRole('button', { name: 'Save draft', exact: true })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Commit draft', exact: true })).toBeVisible();

  const footerText = await statusbar.locator('[data-role="topology-edit-status"]').innerText();
  expect(footerText).toMatch(/nodes, .*edges, .*supports/);
});

async function openProductionDemo(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await navigation.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.locator('[data-action="load-topology-edit-demo"]').click();
  await expect.poll(() => page.evaluate(() => (
    globalThis.AnalysisWorkspace?.getSnapshot?.()?.dataset?.entities?.length ?? 0
  ))).toBe(20);
  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  await expect(page.locator('[data-role="topology-edit-render-host"]')).toBeVisible();
}
