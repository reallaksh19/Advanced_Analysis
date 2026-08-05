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

  const nodePoint = await projectedPickPoint(page, 'node');
  await page.mouse.click(nodePoint.x, nodePoint.y);
  await expect(renderHost).toHaveAttribute('data-topology-edit-selection-source', 'viewport');
  await expect(renderHost).toHaveAttribute('data-topology-edit-selection-primary-id', /^node:/);
  await expect(renderHost.locator(
    'details[data-panel-kind="topology-edit-professional-interaction"]',
  )).toHaveAttribute('open', '');

  const componentPoint = await projectedPickPoint(page, 'component');
  await page.mouse.click(componentPoint.x, componentPoint.y);
  await expect(renderHost).toHaveAttribute('data-topology-edit-selection-source', 'viewport');
  await expect(renderHost).toHaveAttribute('data-topology-edit-selection-primary-id', /^edge:/);
  await expect(renderHost.locator(
    'details[data-panel-kind="topology-edit-professional-operation"]',
  )).toHaveAttribute('open', '');
  await expect(page.locator('[data-role="professional-edge-id"]')).toHaveValue(/^edge:/);

  const before = await clippingSnapshot(page);
  const rect = await canvas.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.wheel(0, -900);
  await expect.poll(() => clippingSnapshot(page), { timeout: 15_000 }).not.toEqual(before);
  const zoomed = await clippingSnapshot(page);
  expect(zoomed.mode).toBe('AUTO');
  expect(zoomed.near).toBeGreaterThan(0);
  expect(zoomed.near).toBeLessThan(zoomed.nearestDepth);

  const displayPanel = renderHost.locator('details[data-panel-kind="display"]');
  if (!(await displayPanel.evaluate((element) => element.open))) {
    await displayPanel.locator(':scope > summary').click();
  }
  await displayPanel.locator('[data-role="sjson-node-radius-mm"]').fill('7');
  await displayPanel.locator('[data-role="sjson-camera-auto-clipping"]').uncheck();
  await displayPanel.locator('[data-role="sjson-camera-near-mm"]').fill('2');
  await displayPanel.locator('[data-role="sjson-camera-far-mm"]').fill('250000');
  await displayPanel.getByRole('button', { name: 'Apply viewport settings' }).click();
  await expect(canvasMount).toHaveAttribute('data-topology-edit-camera-clipping-mode', 'MANUAL');
  await expect.poll(() => Number(canvasMount.getAttribute('data-topology-edit-camera-near-mm'))).toBe(2);
  await expect.poll(() => Number(canvasMount.getAttribute('data-topology-edit-camera-far-mm'))).toBe(250000);
  await expect.poll(() => Number(canvasMount.getAttribute('data-topology-edit-visible-node-marker-radius-mm'))).toBe(7);

  await displayPanel.locator('[data-role="sjson-camera-auto-clipping"]').check();
  await displayPanel.getByRole('button', { name: 'Apply viewport settings' }).click();
  await expect(canvasMount).toHaveAttribute('data-topology-edit-camera-clipping-mode', 'AUTO');

  await page.screenshot({
    path: testInfo.outputPath('sjson-interaction-clipping.png'),
    fullPage: false,
  });
});

async function projectedPickPoint(page, kind) {
  return page.evaluate(({ key, objectKind }) => {
    const backend = globalThis[key]?.viewportBackend;
    const canvas = backend?.renderer?.domElement;
    if (!backend || !canvas) throw new Error('SJSON viewport backend is unavailable.');
    let target = null;
    backend.groups.draftGroup.traverse((object) => {
      if (target || !object.isMesh) return;
      const pick = object.userData?.pickTarget;
      if (!pick || pick.objectKind !== objectKind) return;
      if (objectKind === 'component' && !String(pick.objectId).startsWith('edge:')) return;
      if (objectKind === 'component' && object.geometry?.type !== 'CylinderGeometry') return;
      target = object;
    });
    if (!target) throw new Error(`No ${objectKind} pick proxy was found.`);
    const point = target.getWorldPosition(new backend.activeCamera.position.constructor());
    point.project(backend.activeCamera);
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + ((point.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - point.y) / 2) * rect.height,
    };
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
