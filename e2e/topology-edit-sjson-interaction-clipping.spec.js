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
  await expect.poll(async () => Number(
    await canvasMount.getAttribute('data-topology-edit-route-display-envelope-count'),
  )).toBeGreaterThan(0);

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
    const controller = globalThis[key];
    const backend = controller?.viewportBackend;
    const canvas = backend?.renderer?.domElement;
    const camera = backend?.activeCamera;
    const draftGroup = backend?.groups?.draftGroup;
    if (!backend || !canvas || !camera || !draftGroup) {
      throw new Error('SJSON viewport backend is unavailable.');
    }
    const rect = canvas.getBoundingClientRect();
    const candidates = [];
    const matchesCanonicalKind = (canonicalId) => (
      objectKind === 'node'
        ? canonicalId.startsWith('node:')
        : canonicalId.startsWith('edge:')
    );
    const appendCandidate = (object, worldMatrix, canonicalId) => {
      if (!matchesCanonicalKind(canonicalId)) return;
      object.geometry?.computeBoundingSphere?.();
      const center = object.geometry?.boundingSphere?.center?.clone?.()
        ?? object.position.clone();
      center.applyMatrix4(worldMatrix).project(camera);
      if (![center.x, center.y, center.z].every(Number.isFinite)) return;
      if (center.z < -1 || center.z > 1) return;
      const x = rect.left + ((center.x + 1) * 0.5 * rect.width);
      const y = rect.top + ((1 - center.y) * 0.5 * rect.height);
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
      candidates.push({ x, y, objectId: canonicalId });
    };

    draftGroup.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    draftGroup.traverse((object) => {
      if (!object.visible || !object.isMesh) return;
      const pickTable = object.userData?.pickTable;
      if (object.isInstancedMesh && Array.isArray(pickTable)) {
        for (let index = 0; index < pickTable.length; index += 1) {
          const canonicalId = String(pickTable[index]?.objectId || '');
          if (!matchesCanonicalKind(canonicalId)) continue;
          const instanceMatrix = object.matrixWorld.clone().identity();
          object.getMatrixAt(index, instanceMatrix);
          const worldMatrix = object.matrixWorld.clone().multiply(instanceMatrix);
          appendCandidate(object, worldMatrix, canonicalId);
        }
        return;
      }
      const canonicalId = String(object.userData?.pickTarget?.objectId || '');
      appendCandidate(object, object.matrixWorld, canonicalId);
    });

    const offsets = [
      [0, 0], [-4, 0], [4, 0], [0, -4], [0, 4],
      [-8, 0], [8, 0], [0, -8], [0, 8],
    ];
    for (const candidate of candidates) {
      for (const [dx, dy] of offsets) {
        const x = candidate.x + dx;
        const y = candidate.y + dy;
        const pick = backend.pickAt(x, y);
        const canonicalId = String(pick?.objectId || '');
        if (matchesCanonicalKind(canonicalId)) return { x, y, objectId: canonicalId };
      }
    }
    throw new Error(
      `No visible ${objectKind} production pick point was found from ${candidates.length} projected candidates.`,
    );
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
