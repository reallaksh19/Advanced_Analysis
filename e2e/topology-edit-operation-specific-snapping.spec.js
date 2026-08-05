import { expect, test } from '@playwright/test';

const CONTROLLER_KEY = '__TOPOLOGY_EDIT_OPERATION_SNAP_CONTROLLER__';

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('mounted real topology indexes and resolves an exact component connection face', async ({ page }, testInfo) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const host = await openController(page);
  const before = await page.evaluate((key) => {
    const controller = globalThis[key];
    return {
      canonicalHash: controller.session.currentTopology().canonicalTopologyHash,
      journalHash: controller.session.journal.journalHash,
      activeCommandCount: controller.session.journal.activeCommandIds.length,
    };
  }, CONTROLLER_KEY);

  const evidence = await page.evaluate(async (key) => {
    const controller = globalThis[key];
    const topology = controller.session.currentTopology();
    const runtime = controller.interactionControllerRuntime;
    const index = runtime.ensureSnapIndex(topology);
    const face = index.pointFeatures.find((feature) => (
      feature.operationVariant === 'COMPONENT_FACE'
    ));
    if (!face) throw new Error('Real topology produced no component-face snap feature.');
    const contractUrl = new URL(
      'src/workspace/viewport-interaction/topology-edit-snap-contract.js',
      document.baseURI,
    ).href;
    const engineUrl = new URL(
      'src/workspace/viewport-interaction/topology-edit-deterministic-snap-engine.js',
      document.baseURI,
    ).href;
    const indexUrl = new URL(
      'src/workspace/viewport-interaction/topology-edit-snap-spatial-index.js',
      document.baseURI,
    ).href;
    const [contract, engine, indexModule] = await Promise.all([
      import(contractUrl),
      import(engineUrl),
      import(indexUrl),
    ]);
    indexModule.assertTopologyEditSnapSpatialIndex(index);
    const worldHeightMm = 200;
    const scale = 2 / worldHeightMm;
    const camera = {
      projectionType: 'ORTHOGRAPHIC',
      position: { x: face.worldPoint.x, y: face.worldPoint.y, z: face.worldPoint.z + 100 },
      forward: { x: 0, y: 0, z: -1 },
      viewportWidthPx: 1000,
      viewportHeightPx: 1000,
      devicePixelRatio: 1,
      viewProjectionMatrix: [
        scale, 0, 0, 0,
        0, scale, 0, 0,
        0, 0, 1, 0,
        -scale * face.worldPoint.x,
        -scale * face.worldPoint.y,
        0,
        1,
      ],
      orthoHeightMm: worldHeightMm,
    };
    const rawWorldPoint = {
      x: face.worldPoint.x + 0.5,
      y: face.worldPoint.y,
      z: face.worldPoint.z,
    };
    const pointerScreen = engine.projectTopologyEditWorldToScreen(camera, rawWorldPoint);
    const state = controller.editorStore.getState();
    const identity = {
      datasetSourceHash: state.dataset.sourceHash,
      basisHash: topology.canonicalTopologyHash,
      sessionVersion: state.dataset.sessionVersion,
      selectionRevision: state.selection.revision,
      interactionId: 'interaction:mounted-operation-face',
      queryId: 'query:mounted-operation-face',
      querySequence: 1,
    };
    const query = contract.createTopologyEditSnapQuery({
      ...identity,
      pointerScreen,
      rawWorldPoint,
      camera,
      constraint: { mode: 'FREE', anchorWorld: rawWorldPoint },
      enabledKinds: ['PORT'],
      priorityKinds: ['PORT'],
      excludedCanonicalIds: [],
      hiddenCanonicalIds: [],
      lockedCanonicalIds: [],
      acquireRadiusPx: 20,
      releaseRadiusPx: 24,
      gridSpacingMm: 100,
    });
    const result = engine.resolveTopologyEditDeterministicSnap({
      query,
      index,
      expectedIdentity: identity,
    });
    return {
      installed: runtime.__operationSnapIndexInstalled === true,
      indexHash: index.indexHash,
      authorityHash: index.operationFeatureAuthority.authorityHash,
      componentFaceCount: index.operationFeatureAuthority.componentFaceCount,
      supportAxisCount: index.operationFeatureAuthority.supportAxisCount,
      faceFeatureId: face.featureId,
      faceTargetIds: face.canonicalTargetIds,
      result: {
        status: result.status,
        kind: result.kind,
        sourceFeatureId: result.candidate?.sourceFeatureId ?? null,
        targetIds: result.targetIds,
        resultHash: result.resultHash,
      },
    };
  }, CONTROLLER_KEY);

  expect(evidence.installed).toBe(true);
  expect(evidence.indexHash).toMatch(/^(?:fnv1a64|sha256):/u);
  expect(evidence.authorityHash).toMatch(/^(?:fnv1a64|sha256):/u);
  expect(evidence.componentFaceCount).toBeGreaterThan(0);
  expect(evidence.supportAxisCount).toBeGreaterThanOrEqual(0);
  expect(evidence.result).toMatchObject({
    status: 'RESOLVED',
    kind: 'PORT',
    sourceFeatureId: evidence.faceFeatureId,
    targetIds: evidence.faceTargetIds,
  });
  expect(evidence.result.resultHash).toMatch(/^(?:fnv1a64|sha256):/u);
  await expect(host).toHaveAttribute(
    'data-topology-edit-snap-feature-authority',
    evidence.authorityHash,
  );
  await expect(host).toHaveAttribute(
    'data-topology-edit-component-face-snap-count',
    String(evidence.componentFaceCount),
  );
  await expect(host).toHaveAttribute(
    'data-topology-edit-support-axis-snap-count',
    String(evidence.supportAxisCount),
  );

  const after = await page.evaluate((key) => {
    const controller = globalThis[key];
    return {
      canonicalHash: controller.session.currentTopology().canonicalTopologyHash,
      journalHash: controller.session.journal.journalHash,
      activeCommandCount: controller.session.journal.activeCommandIds.length,
    };
  }, CONTROLLER_KEY);
  expect(after).toEqual(before);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter(isCriticalConsoleError)).toEqual([]);
  await testInfo.attach('operation-specific-snapping', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

async function openController(page) {
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
    if (prototype.__operationSnapActivateWrapped) return;
    const activate = prototype.activate;
    prototype.activate = async function operationSnapActivate(...args) {
      globalThis[key] = this;
      return activate.apply(this, args);
    };
    Object.defineProperty(prototype, '__operationSnapActivateWrapped', {
      value: true,
      configurable: true,
    });
  }, CONTROLLER_KEY);

  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible({ timeout: 60_000 });
  await expect(host).toHaveAttribute('data-topology-edit-clean-shell', 'true');
  return host;
}

function isCriticalConsoleError(message) {
  return [
    /ReferenceError/iu,
    /Cannot access .* before initialization/iu,
    /does not provide an export named/iu,
    /Failed to fetch dynamically imported module/iu,
    /circular import/iu,
    /WebGL context lost/iu,
    /TopologyEditOperationSnapIndex/iu,
  ].some((pattern) => pattern.test(message));
}
