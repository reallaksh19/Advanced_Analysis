import { expect, test } from '@playwright/test';

const CONTROLLER_KEY = '__TOPOLOGY_EDIT_PICK_DIAGNOSTIC_CONTROLLER__';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('diagnose production WebGL edge picking', async ({ page }) => {
  await openProductionController(page);
  const probe = await probeCanonicalPick(page, 'edge:P-001');
  console.log(`TOPOLOGY_EDIT_PICK_DIAGNOSTIC ${JSON.stringify(probe)}`);

  expect(probe.targetFound).toBe(true);
  expect(probe.boundsFound).toBe(true);
  expect(probe.canvas.width).toBeGreaterThan(0);
  expect(probe.canvas.height).toBeGreaterThan(0);
  expect(probe.exactPoint, JSON.stringify(probe, null, 2)).not.toBeNull();

  await page.mouse.click(probe.exactPoint.x, probe.exactPoint.y);
  await expect.poll(() => page.evaluate((key) => ({
    nodeIds: [...(globalThis[key]?.selection?.nodeIds ?? [])],
    edgeId: globalThis[key]?.selection?.edgeId ?? null,
    status: globalThis[key]?.statusElement?.textContent ?? '',
  }), CONTROLLER_KEY)).toEqual({
    nodeIds: [],
    edgeId: 'edge:P-001',
    status: 'Selected edge edge:P-001.',
  });
});

async function openProductionController(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Application views' })
    .getByRole('button', { name: 'Workspace', exact: true }).click();
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
    if (!prototype.__pickDiagnosticActivateWrapped) {
      const activate = prototype.activate;
      prototype.activate = async function diagnosticActivate(...args) {
        globalThis[key] = this;
        return activate.apply(this, args);
      };
      Object.defineProperty(prototype, '__pickDiagnosticActivateWrapped', {
        value: true,
        configurable: true,
      });
    }
  }, CONTROLLER_KEY);

  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible();
  await expect.poll(() => page.evaluate((key) => (
    globalThis[key]?.viewportBackend?.constructor?.name ?? ''
  ), CONTROLLER_KEY)).toContain('NavigationHud');
}

async function probeCanonicalPick(page, canonicalId) {
  return page.evaluate(({ key, id }) => {
    const controller = globalThis[key];
    const backend = controller?.viewportBackend;
    const camera = backend?.activeCamera;
    const canvas = backend?.renderer?.domElement;
    if (!backend || !camera || !canvas) throw new Error('WebGL diagnostic context is unavailable.');

    let target = null;
    for (const groupName of ['draftGroup', 'sourceGroup']) {
      backend.groups?.[groupName]?.traverse?.((object) => {
        if (target) return;
        if (object.userData?.pickTarget?.objectId === id) target = object.userData.pickTarget;
        const match = object.userData?.pickTable?.find?.((row) => row?.objectId === id);
        if (!target && match) target = match;
      });
      if (target) break;
    }

    const rect = canvas.getBoundingClientRect();
    const canvasRecord = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      drawingBufferWidth: canvas.width,
      drawingBufferHeight: canvas.height,
    };
    if (!target) return { targetFound: false, boundsFound: false, canvas: canvasRecord };
    const bounds = backend.boundsForPick(target);
    if (!bounds || bounds.isEmpty()) {
      return { targetFound: true, boundsFound: false, target, canvas: canvasRecord };
    }

    const corners = [];
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const point = camera.position.clone().set(x, y, z).project(camera);
          corners.push({
            x: rect.left + ((point.x + 1) / 2) * rect.width,
            y: rect.top + ((1 - point.y) / 2) * rect.height,
          });
        }
      }
    }
    const minX = Math.max(rect.left, Math.min(...corners.map((row) => row.x)) - 20);
    const maxX = Math.min(rect.right, Math.max(...corners.map((row) => row.x)) + 20);
    const minY = Math.max(rect.top, Math.min(...corners.map((row) => row.y)) - 20);
    const maxY = Math.min(rect.bottom, Math.max(...corners.map((row) => row.y)) + 20);
    const center = bounds.getCenter(camera.position.clone()).project(camera);
    const centerPoint = {
      x: rect.left + ((center.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - center.y) / 2) * rect.height,
    };
    const centerPick = backend.pickAt(centerPoint.x, centerPoint.y);
    const identities = new Set();
    let exactPoint = null;
    let sampled = 0;
    for (let y = minY; y <= maxY && !exactPoint; y += 3) {
      for (let x = minX; x <= maxX; x += 3) {
        sampled += 1;
        const pick = backend.pickAt(x, y);
        if (pick?.objectId) identities.add(`${pick.objectKind}:${pick.objectId}:${pick.modelRole}`);
        if (pick?.objectId === id) {
          exactPoint = { x, y, pick };
          break;
        }
      }
    }
    return {
      targetFound: true,
      boundsFound: true,
      target,
      canvas: canvasRecord,
      bounds: {
        min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
        max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
      },
      projected: { minX, maxX, minY, maxY, centerPoint },
      centerPick,
      sampled,
      identities: [...identities].sort(),
      exactPoint,
      interactionMode: backend.hostElement?.dataset?.interactionMode ?? null,
      hasSelectionHandler: typeof backend.selectionRequestHandler === 'function',
    };
  }, { key: CONTROLLER_KEY, id: canonicalId });
}
