import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SJSON_BYTES = readFileSync(new URL('../public/Sjson.json', import.meta.url));
const CONTROLLER_KEY = '__SJSON_INTERACTION_CLIPPING_CONTROLLER__';

test('SJSON nodes and components select the right editor while clipping follows zoom', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1637, height: 869 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (key) => {
    const moduleUrl = new URL(
      'src/workspace/topology-edit-3d-sjson-fidelity-controller.js',
      document.baseURI,
    ).href;
    const { TopologyEdit3DViewController } = await import(moduleUrl);
    const prototype = TopologyEdit3DViewController.prototype;
    if (prototype.__interactionClippingWrapped) return;
    const activate = prototype.activate;
    prototype.activate = async function interactionClippingActivate(...args) {
      globalThis[key] = this;
      return activate.apply(this, args);
    };
    Object.defineProperty(prototype, '__interactionClippingWrapped', {
      value: true,
      configurable: true,
    });
  }, CONTROLLER_KEY);

  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name: 'Sjson.json', mimeType: 'application/json', buffer: SJSON_BYTES,
  });
  await expect.poll(() => page.evaluate(() => (
    globalThis.AnalysisWorkspace?.getSnapshot?.()?.dataset?.entities?.length || 0
  )), { timeout: 60_000 }).toBeGreaterThan(253);
  await page.getByRole('button', { name: '3D Edit', exact: true }).click();

  const renderHost = page.locator('[data-role="topology-edit-render-host"]');
  const canvasMount = page.locator('[data-role="topology-edit-canvas-mount"]');
  const canvas = canvasMount.locator('canvas');
  await expect(canvas).toHaveCount(1, { timeout: 60_000 });
  await expect.poll(() => canvasMount.getAttribute('data-topology-edit-visible-node-marker-count'))
    .not.toBeNull();

  const nodePoint = await visiblePickPoint(page, 'node');
  await page.mouse.click(nodePoint.x, nodePoint.y);
  await expect(renderHost).toHaveAttribute('data-topology-edit-selection-source', 'viewport');
  await expect(renderHost).toHaveAttribute('data-topology-edit-selection-primary-id', /^node:/);
  await expect(renderHost.locator(
    'details[data-panel-kind="topology-edit-professional-interaction"]',
  )).toHaveAttribute('open', '');

  const componentPoint = await visiblePickPoint(page, 'component');
  await page.mouse.click(componentPoint.x, componentPoint.y);
  await expect(renderHost).toHaveAttribute('data-topology-edit-selection-source', 'viewport');
  await expect(renderHost).toHaveAttribute('data-topology-edit-selection-primary-id', /^edge:/);
  await expect(renderHost.locator(
    'details[data-panel-kind="topology-edit-professional-operation"]',
  )).toHaveAttribute('open', '');
  await expect(page.locator('[data-role="professional-edge-id"]')).toHaveValue(/^edge:/);

  const before = await clippingSnapshot(page);
  expect(before).not.toBeNull();
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error('SJSON canvas has no visible bounding box.');
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.wheel(0, -900);
  await expect.poll(async () => {
    const current = await clippingSnapshot(page);
    return Boolean(current && (
      Math.abs(current.near - before.near) > 1e-6
      || Math.abs(current.far - before.far) > 1e-6
    ));
  }, { timeout: 15_000 }).toBe(true);
  const zoomed = await clippingSnapshot(page);
  expect(zoomed.mode).toBe('AUTO');
  expect(zoomed.near).toBeGreaterThan(0);
  expect(zoomed.nearestDepth).toBeGreaterThan(zoomed.near);

  const displayPanel = renderHost.locator('details[data-panel-kind="display"]');
  if (!(await displayPanel.evaluate((element) => element.open))) {
    await displayPanel.locator(':scope > summary').click();
  }
  await displayPanel.locator('[data-role="sjson-node-radius-mm"]').evaluate((element) => {
    element.value = '7';
  });
  await displayPanel.locator('[data-role="sjson-camera-auto-clipping"]').uncheck();
  await displayPanel.locator('[data-role="sjson-camera-near-mm"]').fill('2');
  await displayPanel.locator('[data-role="sjson-camera-far-mm"]').fill('250000');
  await displayPanel.getByRole('button', { name: 'Apply viewport settings' }).click();
  await expect(canvasMount).toHaveAttribute('data-topology-edit-camera-clipping-mode', 'MANUAL');
  await expect.poll(async () => Number(
    await canvasMount.getAttribute('data-topology-edit-camera-near-mm'),
  )).toBe(2);
  await expect.poll(async () => Number(
    await canvasMount.getAttribute('data-topology-edit-camera-far-mm'),
  )).toBe(250000);
  await expect.poll(async () => Number(
    await canvasMount.getAttribute('data-topology-edit-visible-node-marker-radius-mm'),
  )).toBe(7);

  await displayPanel.locator('[data-role="sjson-camera-auto-clipping"]').check();
  await displayPanel.getByRole('button', { name: 'Apply viewport settings' }).click();
  await expect(canvasMount).toHaveAttribute('data-topology-edit-camera-clipping-mode', 'AUTO');

  await page.screenshot({
    path: testInfo.outputPath('sjson-interaction-clipping.png'),
    fullPage: false,
  });
});

async function visiblePickPoint(page, kind) {
  return page.evaluate(({ key, objectKind }) => {
    const backend = globalThis[key]?.viewportBackend;
    const canvas = backend?.renderer?.domElement;
    if (!backend || !canvas) throw new Error('SJSON viewport backend is unavailable.');
    const rect = canvas.getBoundingClientRect();
    for (let y = rect.top + 2; y < rect.bottom - 1; y += 3) {
      for (let x = rect.left + 2; x < rect.right - 1; x += 3) {
        const context = backend.pickContext(x, y);
        const pick = context ? backend.pickWithRaycaster(context.pointer) : null;
        if (!pick?.objectId) continue;
        const matchesNode = objectKind === 'node' && String(pick.objectId).startsWith('node:');
        const matchesComponent = objectKind === 'component'
          && String(pick.objectId).startsWith('edge:');
        if (matchesNode || matchesComponent) return { x, y, objectId: pick.objectId };
      }
    }
    throw new Error(`No visible ${objectKind} pick point was found.`);
  }, { key: CONTROLLER_KEY, objectKind: kind });
}

async function clippingSnapshot(page) {
  return page.evaluate((key) => {
    const backend = globalThis[key]?.viewportBackend;
    const row = backend?.governedCameraClippingSnapshot?.();
    return row ? {
      mode: row.mode,
      near: row.appliedNearMm,
      far: row.appliedFarMm,
      nearestDepth: row.nearestDepthMm,
    } : null;
  }, CONTROLLER_KEY);
}
