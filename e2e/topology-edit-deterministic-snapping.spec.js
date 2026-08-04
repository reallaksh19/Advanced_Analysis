import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const CONTROLLER_KEY = '__TOPOLOGY_EDIT_PHASE_B_CONTROLLER__';
const STALE_RESULT_KEY = '__TOPOLOGY_EDIT_PHASE_B_STALE_RESULT__';
const REPORT_PATH = 'reports/qualification/topology-edit-deterministic-snapping.json';
const evidence = {
  schema: 'TopologyEditDeterministicSnappingQualification.v1',
  candidateHead: process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || process.env.GITHUB_SHA || null,
  fixture: 'public/fixtures/topology-edit-20-element-demo.staged.json',
  backend: 'TopologyEditNavigationHudViewportBackend',
  engine: 'DETERMINISTIC_PHASE_B',
  realWebGL: 'NOT_RUN',
  pointerCameraEvidence: 'NOT_RUN',
  portSnap: 'NOT_RUN',
  hysteresis: 'NOT_RUN',
  cycling: 'NOT_RUN',
  staleResultRejection: 'NOT_RUN',
  cancelZeroCanonicalChange: 'NOT_RUN',
  boundedQuery: null,
  dragFixture: null,
  rejectedActionIds: [],
};

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await mkdir('reports/qualification', { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('production WebGL drag uses deterministic snapping without canonical preview mutation', async ({ page }, testInfo) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const host = await openProductionController(page);
  await expect(host.locator('canvas')).toBeVisible();
  await expect(host).toHaveAttribute('data-topology-edit-snap-engine', 'DETERMINISTIC_PHASE_B');
  expect(await hasRealWebGL(page)).toBe(true);
  evidence.realWebGL = 'PASS';

  const context = await screenResolvedPortDragContext(page);
  evidence.dragFixture = context;
  const before = await canonicalEvidence(page);
  await selectCanonicalNode(page, context.movingNodeId);
  await expect(host).toHaveAttribute('data-topology-edit-selection-ids', context.movingNodeId);
  await expect(host).toHaveAttribute('data-topology-edit-gizmo-handle-count', '6');

  const drag = await dragPoints(page, context.anchorNodeId, context.mode);
  await page.mouse.move(drag.start.x, drag.start.y);
  await page.mouse.down();
  await page.mouse.move(drag.target.x, drag.target.y, { steps: 12 });

  await expect(host).toHaveAttribute('data-topology-edit-interaction-snap-status', 'RESOLVED');
  await expect(host).toHaveAttribute('data-topology-edit-interaction-snap-evidence', 'PORT');
  await expect(host).toHaveAttribute('data-topology-edit-interaction-snap-target', context.anchorNodeId);
  await expect(host).toHaveAttribute('data-topology-edit-snap-index-hash', /.+/);
  await expect(host).toHaveAttribute('data-topology-edit-snap-result-hash', /.+/);
  await expect(host).toHaveAttribute('data-topology-edit-snap-query-id', /.+/);
  await expect.poll(async () => Number(
    await host.getAttribute('data-topology-edit-snap-query-sequence'),
  )).toBeGreaterThan(0);
  await expect.poll(async () => Number(
    await host.getAttribute('data-topology-edit-snap-candidate-count'),
  )).toBeGreaterThan(1);
  evidence.pointerCameraEvidence = 'PASS';
  evidence.portSnap = 'PASS';

  const firstCandidateHash = await host.getAttribute(
    'data-topology-edit-interaction-snap-candidate-hash',
  );
  const exactSequence = Number(
    await host.getAttribute('data-topology-edit-snap-query-sequence'),
  );
  const exactStats = await snapStatistics(host);
  expect(exactStats.sourceFeaturesVisited).toBeGreaterThan(0);
  expect(exactStats.candidatesGenerated).toBeGreaterThan(0);
  evidence.boundedQuery = exactStats;

  await page.mouse.move(drag.hysteresis.x, drag.hysteresis.y, { steps: 2 });
  await expect(host).toHaveAttribute('data-topology-edit-snap-retained-by-hysteresis', 'true');
  await expect(host).toHaveAttribute(
    'data-topology-edit-interaction-snap-candidate-hash',
    firstCandidateHash,
  );
  expect(Number(await host.getAttribute('data-topology-edit-snap-query-sequence')))
    .toBeGreaterThan(exactSequence);
  evidence.hysteresis = 'PASS';

  await page.keyboard.press('Tab');
  await expect.poll(async () => host.getAttribute(
    'data-topology-edit-interaction-snap-candidate-hash',
  )).not.toBe(firstCandidateHash);
  await expect(host).toHaveAttribute('data-topology-edit-snap-cycle-index', '1');
  evidence.cycling = 'PASS';

  await page.evaluate(({ controllerKey, staleResultKey }) => {
    globalThis[staleResultKey] = globalThis[controllerKey]
      ?.interactionControllerRuntime?.snapResult ?? null;
  }, { controllerKey: CONTROLLER_KEY, staleResultKey: STALE_RESULT_KEY });

  await page.mouse.up();
  await expect(host).toHaveAttribute('data-topology-edit-interaction-preview-hash', /.+/);
  expect(await canonicalEvidence(page)).toEqual(before);

  await page.keyboard.press('Escape');
  await expect(host).toHaveAttribute('data-topology-edit-interaction-preview-hash', '');
  expect(await canonicalEvidence(page)).toEqual(before);
  evidence.cancelZeroCanonicalChange = 'PASS';

  const stale = await page.evaluate(({ controllerKey, staleResultKey }) => {
    const controller = globalThis[controllerKey];
    const result = globalThis[staleResultKey];
    const current = controller.editorStore.getState();
    const alternative = controller.session.currentTopology().nodes
      .find((node) => node.id !== current.selection.primaryId);
    controller.selectionCoordinator.requestCanonical(
      'REPLACE',
      [alternative.id],
      'command',
      { primaryId: alternative.id, anchorId: alternative.id },
    );
    const changed = controller.editorStore.getState();
    return controller.interactionControllerRuntime.snapStore.applyResult(result, {
      datasetSourceHash: changed.dataset.sourceHash,
      basisHash: changed.dataset.canonicalHash,
      sessionVersion: changed.dataset.sessionVersion,
      selectionRevision: changed.selection.revision,
      interactionId: result.interactionId,
      queryId: result.queryId,
      querySequence: result.querySequence,
    });
  }, { controllerKey: CONTROLLER_KEY, staleResultKey: STALE_RESULT_KEY });
  expect(stale.disposition).toBe('STALE');
  expect(stale.staleFields).toContain('selectionRevision');
  evidence.staleResultRejection = 'PASS';

  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter(isCriticalConsoleError)).toEqual([]);
  await testInfo.attach('phase-b-deterministic-snapping', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
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
    if (prototype.__phaseBActivateWrapped) return;
    const activate = prototype.activate;
    prototype.activate = async function phaseBActivate(...args) {
      globalThis[key] = this;
      return activate.apply(this, args);
    };
    Object.defineProperty(prototype, '__phaseBActivateWrapped', {
      value: true,
      configurable: true,
    });
  }, CONTROLLER_KEY);

  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible();
  await expect(host.locator('canvas')).toBeVisible();
  await expect(host).toHaveAttribute('data-topology-edit-clean-shell', 'true');
  await expect(host).toHaveAttribute('data-topology-edit-dataset-source-hash', /.+/);
  return host;
}

async function hasRealWebGL(page) {
  return page.evaluate((controllerKey) => {
    const renderer = globalThis[controllerKey]?.viewportBackend?.renderer;
    const context = renderer?.getContext?.();
    return Boolean(context && context.drawingBufferWidth > 0 && context.drawingBufferHeight > 0);
  }, CONTROLLER_KEY);
}

async function screenResolvedPortDragContext(page) {
  return page.evaluate((controllerKey) => {
    const controller = globalThis[controllerKey];
    const topology = controller.session.currentTopology();
    const camera = controller.viewportBackend.activeCamera;
    const canvas = controller.viewportBackend.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const nodes = topology.nodes
      .filter((node) => node.portKeys?.length)
      .sort((left, right) => left.id.localeCompare(right.id));
    const epsilon = 1e-7;
    const modeFor = (left, right) => {
      const dx = right.x - left.x;
      const dy = right.y - left.y;
      const dz = right.z - left.z;
      if (Math.hypot(dx, dy, dz) <= epsilon) return null;
      if (Math.abs(dy) <= epsilon && Math.abs(dz) <= epsilon) return 'AXIS_X';
      if (Math.abs(dx) <= epsilon && Math.abs(dz) <= epsilon) return 'AXIS_Y';
      if (Math.abs(dx) <= epsilon && Math.abs(dy) <= epsilon) return 'AXIS_Z';
      if (Math.abs(dz) <= epsilon) return 'PLANE_XY';
      if (Math.abs(dx) <= epsilon) return 'PLANE_YZ';
      if (Math.abs(dy) <= epsilon) return 'PLANE_XZ';
      return null;
    };
    const project = (point) => {
      const vector = camera.position.clone().set(point.x, point.y, point.z).project(camera);
      return {
        x: ((vector.x + 1) / 2) * rect.width,
        y: ((1 - vector.y) / 2) * rect.height,
      };
    };
    const inside = (point) => (
      point.x >= 40 && point.x <= rect.width - 40
      && point.y >= 40 && point.y <= rect.height - 40
    );
    const candidates = [];
    for (const moving of nodes) {
      for (const anchor of nodes) {
        if (moving.id === anchor.id) continue;
        const mode = modeFor(moving.position, anchor.position);
        if (!mode) continue;
        const movingScreen = project(moving.position);
        const anchorScreen = project(anchor.position);
        const screenDistancePx = Math.hypot(
          anchorScreen.x - movingScreen.x,
          anchorScreen.y - movingScreen.y,
        );
        if (!inside(movingScreen) || !inside(anchorScreen) || screenDistancePx < 60) continue;
        candidates.push({
          movingNodeId: moving.id,
          anchorNodeId: anchor.id,
          movingPortKey: [...moving.portKeys].sort()[0],
          anchorPortKey: [...anchor.portKeys].sort()[0],
          mode,
          screenDistancePx,
          distanceMm: Math.hypot(
            anchor.position.x - moving.position.x,
            anchor.position.y - moving.position.y,
            anchor.position.z - moving.position.z,
          ),
        });
      }
    }
    candidates.sort((left, right) => (
      Number(left.mode.startsWith('PLANE_')) - Number(right.mode.startsWith('PLANE_'))
      || Math.abs(left.screenDistancePx - 160) - Math.abs(right.screenDistancePx - 160)
      || left.movingNodeId.localeCompare(right.movingNodeId)
      || left.anchorNodeId.localeCompare(right.anchorNodeId)
    ));
    if (!candidates.length) {
      throw new Error('No screen-resolved constraint-compatible port drag exists.');
    }
    return candidates[0];
  }, CONTROLLER_KEY);
}

async function selectCanonicalNode(page, nodeId) {
  await page.evaluate(({ controllerKey, id }) => {
    const controller = globalThis[controllerKey];
    const result = controller.selectionCoordinator.requestCanonical(
      'REPLACE',
      [id],
      'command',
      { primaryId: id, anchorId: id },
    );
    if (!['CHANGED', 'UNCHANGED'].includes(result.disposition)) {
      throw new Error(`Canonical selection setup failed: ${result.disposition}.`);
    }
  }, { controllerKey: CONTROLLER_KEY, id: nodeId });
}

async function dragPoints(page, targetNodeId, mode) {
  return page.evaluate(({ controllerKey, targetId, dragMode }) => {
    const controller = globalThis[controllerKey];
    const topology = controller.session.currentTopology();
    const target = topology.nodes.find((node) => node.id === targetId);
    const gizmo = controller.interactionControllerRuntime.gizmo;
    const camera = controller.viewportBackend.activeCamera;
    const canvas = controller.viewportBackend.renderer.domElement;
    if (!target || !gizmo || !camera || !canvas) {
      throw new Error('Phase B gizmo drag context is unavailable.');
    }
    const vectors = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
    const anchor = gizmo.anchorPosition;
    let startWorld;
    let direction;
    if (dragMode.startsWith('AXIS_')) {
      direction = vectors[dragMode.slice(-1)];
      startWorld = {
        x: anchor.x + direction[0] * gizmo.scaleMm * 0.8,
        y: anchor.y + direction[1] * gizmo.scaleMm * 0.8,
        z: anchor.z + direction[2] * gizmo.scaleMm * 0.8,
      };
    } else {
      const axes = dragMode.slice(-2).split('');
      const first = vectors[axes[0]];
      const second = vectors[axes[1]];
      direction = first;
      startWorld = {
        x: anchor.x + (first[0] + second[0]) * gizmo.scaleMm * 0.22,
        y: anchor.y + (first[1] + second[1]) * gizmo.scaleMm * 0.22,
        z: anchor.z + (first[2] + second[2]) * gizmo.scaleMm * 0.22,
      };
    }
    const rect = canvas.getBoundingClientRect();
    const project = (point) => {
      const vector = camera.position.clone().set(point.x, point.y, point.z).project(camera);
      return {
        x: rect.left + ((vector.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - vector.y) / 2) * rect.height,
      };
    };
    const targetScreen = project(target.position);
    const directionScreen = project({
      x: target.position.x + direction[0] * 100,
      y: target.position.y + direction[1] * 100,
      z: target.position.z + direction[2] * 100,
    });
    const dx = directionScreen.x - targetScreen.x;
    const dy = directionScreen.y - targetScreen.y;
    const length = Math.hypot(dx, dy);
    if (!(length > 0)) throw new Error('Projected drag direction is degenerate.');
    return {
      start: project(startWorld),
      target: targetScreen,
      hysteresis: {
        x: targetScreen.x + (dx / length) * 12,
        y: targetScreen.y + (dy / length) * 12,
      },
    };
  }, { controllerKey: CONTROLLER_KEY, targetId: targetNodeId, dragMode: mode });
}

async function canonicalEvidence(page) {
  return page.evaluate((controllerKey) => {
    const controller = globalThis[controllerKey];
    return {
      canonicalHash: controller.session.currentTopology().canonicalTopologyHash,
      journalHash: controller.session.journal.journalHash,
      sessionVersion: controller.session.journal.sessionVersion,
      activeCommandCount: controller.session.journal.activeCommandIds.length,
    };
  }, CONTROLLER_KEY);
}

async function snapStatistics(host) {
  return {
    pointCellsVisited: Number(
      await host.getAttribute('data-topology-edit-snap-point-cells-visited'),
    ),
    segmentCellsVisited: Number(
      await host.getAttribute('data-topology-edit-snap-segment-cells-visited'),
    ),
    sourceFeaturesVisited: Number(
      await host.getAttribute('data-topology-edit-snap-source-features-visited'),
    ),
    candidatesGenerated: Number(
      await host.getAttribute('data-topology-edit-snap-candidates-generated'),
    ),
  };
}

function isCriticalConsoleError(message) {
  return [
    /ReferenceError/i,
    /Cannot access .* before initialization/i,
    /does not provide an export named/i,
    /Failed to fetch dynamically imported module/i,
    /circular import/i,
    /WebGL context lost/i,
  ].some((pattern) => pattern.test(message));
}
