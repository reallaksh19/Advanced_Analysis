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
  const canvas = host.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(host).toHaveAttribute('data-topology-edit-snap-engine', 'DETERMINISTIC_PHASE_B');
  expect(await hasRealWebGL(page)).toBe(true);
  evidence.realWebGL = 'PASS';

  const context = await gapContext(page, 'E-001:port:start', 'P-001:port:end');
  const before = await canonicalEvidence(page);
  await selectCanonicalNode(page, context.movingNodeId);
  await expect(host).toHaveAttribute('data-topology-edit-selection-ids', context.movingNodeId);
  await expect(host).toHaveAttribute('data-topology-edit-gizmo-handle-count', '6');

  const drag = await dragPoints(page, context.anchorNodeId, context.axis);
  await page.mouse.move(drag.start.x, drag.start.y);
  await page.mouse.down();
  await page.mouse.move(drag.target.x, drag.target.y, { steps: 8 });

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
  const exactQuerySequence = Number(
    await host.getAttribute('data-topology-edit-snap-query-sequence'),
  );
  const exactStats = await snapStatistics(host);
  expect(exactStats.sourceFeaturesVisited).toBeGreaterThan(0);
  expect(exactStats.candidatesGenerated).toBeGreaterThan(0);
  evidence.boundedQuery = exactStats;

  await page.mouse.move(drag.hysteresis.x, drag.hysteresis.y, { steps: 2 });
  await expect(host).toHaveAttribute(
    'data-topology-edit-snap-retained-by-hysteresis',
    'true',
  );
  await expect(host).toHaveAttribute(
    'data-topology-edit-interaction-snap-candidate-hash',
    firstCandidateHash,
  );
  expect(Number(await host.getAttribute('data-topology-edit-snap-query-sequence')))
    .toBeGreaterThan(exactQuerySequence);
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
    return controller.interactionControllerRuntime.snapStore.applyResult(
      result,
      {
        datasetSourceHash: changed.dataset.sourceHash,
        basisHash: changed.dataset.canonicalHash,
        sessionVersion: changed.dataset.sessionVersion,
        selectionRevision: changed.selection.revision,
        interactionId: result.interactionId,
        queryId: result.queryId,
        querySequence: result.querySequence,
      },
    );
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

async function gapContext(page, movingPortKey, anchorPortKey) {
  return page.evaluate(({ controllerKey, movingKey, anchorKey }) => {
    const controller = globalThis[controllerKey];
    const topology = controller.session.currentTopology();
    const moving = topology.nodes.find((node) => node.portKeys?.includes(movingKey));
    const anchor = topology.nodes.find((node) => node.portKeys?.includes(anchorKey));
    if (!moving || !anchor) throw new Error('Exact Phase B fixture ports are unavailable.');
    const delta = {
      x: anchor.position.x - moving.position.x,
      y: anchor.position.y - moving.position.y,
      z: anchor.position.z - moving.position.z,
    };
    const axis = ['x', 'y', 'z'].sort((left, right) => (
      Math.abs(delta[right]) - Math.abs(delta[left])
    ))[0].toUpperCase();
    return { movingNodeId: moving.id, anchorNodeId: anchor.id, axis };
  }, {
    controllerKey: CONTROLLER_KEY,
    movingKey: movingPortKey,
    anchorKey: anchorPortKey,
  });
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

async function dragPoints(page, targetNodeId, axis) {
  return page.evaluate(({ controllerKey, targetId, axisName }) => {
    const controller = globalThis[controllerKey];
    const topology = controller.session.currentTopology();
    const target = topology.nodes.find((node) => node.id === targetId);
    const gizmo = controller.interactionControllerRuntime.gizmo;
    const camera = controller.viewportBackend.activeCamera;
    const canvas = controller.viewportBackend.renderer.domElement;
    if (!target || !gizmo || !camera || !canvas) {
      throw new Error('Phase B gizmo drag context is unavailable.');
    }
    const axisVector = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[axisName];
    const anchor = gizmo.anchorPosition;
    const startWorld = {
      x: anchor.x + axisVector[0] * gizmo.scaleMm * 0.8,
      y: anchor.y + axisVector[1] * gizmo.scaleMm * 0.8,
      z: anchor.z + axisVector[2] * gizmo.scaleMm * 0.8,
    };
    const project = (position) => {
      const vector = camera.position.clone().set(
        position.x,
        position.y,
        position.z,
      ).project(camera);
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + ((vector.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - vector.y) / 2) * rect.height,
      };
    };
    const targetScreen = project(target.position);
    const directionScreen = project({
      x: target.position.x + axisVector[0] * 100,
      y: target.position.y + axisVector[1] * 100,
      z: target.position.z + axisVector[2] * 100,
    });
    const dx = directionScreen.x - targetScreen.x;
    const dy = directionScreen.y - targetScreen.y;
    const length = Math.hypot(dx, dy);
    if (!(length > 0)) throw new Error('Projected drag axis is degenerate.');
    return {
      start: project(startWorld),
      target: targetScreen,
      hysteresis: {
        x: targetScreen.x + (dx / length) * 12,
        y: targetScreen.y + (dy / length) * 12,
      },
    };
  }, { controllerKey: CONTROLLER_KEY, targetId: targetNodeId, axisName: axis });
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
