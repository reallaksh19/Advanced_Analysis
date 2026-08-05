import { expect, test } from '@playwright/test';

const CONTROLLER_KEY = '__TOPOLOGY_EDIT_F2_SNAP_CONTROLLER__';

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('mounted real topology resolves exact elbow tangency or branch clocking without mutation', async ({ page }, testInfo) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const host = await openController(page);
  const before = await canonicalState(page);
  const evidence = await page.evaluate(async (key) => {
    const controller = globalThis[key];
    const topology = controller.session.currentTopology();
    const runtime = controller.interactionControllerRuntime;
    const index = runtime.ensureSnapIndex(topology);
    const feature = index.segmentFeatures.find((row) => (
      row.operationVariant === 'ELBOW_TANGENCY'
      || row.operationVariant === 'BRANCH_CLOCKING'
    ));
    if (!feature) {
      throw new Error('Real topology produced no exact elbow-tangency or branch-clocking feature.');
    }
    const contract = await import(new URL(
      'src/workspace/viewport-interaction/topology-edit-snap-contract.js',
      document.baseURI,
    ).href);
    const engine = await import(new URL(
      'src/workspace/viewport-interaction/topology-edit-deterministic-snap-engine.js',
      document.baseURI,
    ).href);
    const midpoint = {
      x: (feature.start.x + feature.end.x) / 2,
      y: (feature.start.y + feature.end.y) / 2,
      z: (feature.start.z + feature.end.z) / 2,
    };
    const worldHeightMm = Math.max(200, Math.hypot(
      feature.end.x - feature.start.x,
      feature.end.y - feature.start.y,
      feature.end.z - feature.start.z,
    ) * 4);
    const scale = 2 / worldHeightMm;
    const camera = {
      projectionType: 'ORTHOGRAPHIC',
      position: { x: midpoint.x, y: midpoint.y, z: midpoint.z + 100 },
      forward: { x: 0, y: 0, z: -1 },
      viewportWidthPx: 1000,
      viewportHeightPx: 1000,
      devicePixelRatio: 1,
      viewProjectionMatrix: [
        scale, 0, 0, 0,
        0, scale, 0, 0,
        0, 0, 1, 0,
        -scale * midpoint.x, -scale * midpoint.y, 0, 1,
      ],
      orthoHeightMm: worldHeightMm,
    };
    const rawWorldPoint = { x: midpoint.x + 0.5, y: midpoint.y, z: midpoint.z };
    const state = controller.editorStore.getState();
    const identity = {
      datasetSourceHash: state.dataset.sourceHash,
      basisHash: topology.canonicalTopologyHash,
      sessionVersion: state.dataset.sessionVersion,
      selectionRevision: state.selection.revision,
      interactionId: 'interaction:mounted-f2',
      queryId: 'query:mounted-f2',
      querySequence: 1,
    };
    const query = contract.createTopologyEditSnapQuery({
      ...identity,
      pointerScreen: engine.projectTopologyEditWorldToScreen(camera, rawWorldPoint),
      rawWorldPoint,
      camera,
      constraint: { mode: 'FREE', anchorWorld: rawWorldPoint },
      enabledKinds: ['CENTERLINE'],
      priorityKinds: ['CENTERLINE'],
      excludedCanonicalIds: [],
      hiddenCanonicalIds: [],
      lockedCanonicalIds: [],
      acquireRadiusPx: 20,
      releaseRadiusPx: 24,
      gridSpacingMm: 100,
    });
    const result = engine.resolveTopologyEditDeterministicSnap({
      index,
      query,
      expectedIdentity: identity,
    });
    return {
      authority: index.tangencyClockingFeatureAuthority,
      feature: {
        featureId: feature.featureId,
        operationVariant: feature.operationVariant,
        targetIds: feature.canonicalTargetIds,
      },
      result: {
        status: result.status,
        sourceFeatureId: result.candidate?.sourceFeatureId ?? null,
        operationVariant: result.candidate?.operationVariant ?? null,
        targetIds: result.targetIds,
      },
    };
  }, CONTROLLER_KEY);

  expect(
    evidence.authority.elbowTangencyCount + evidence.authority.branchClockingCount,
  ).toBeGreaterThan(0);
  expect(evidence.result).toMatchObject({
    status: 'RESOLVED',
    sourceFeatureId: evidence.feature.featureId,
    operationVariant: evidence.feature.operationVariant,
    targetIds: evidence.feature.targetIds,
  });
  await expect(host).toHaveAttribute(
    'data-topology-edit-tangency-clocking-authority',
    evidence.authority.authorityHash,
  );
  await expect(host).toHaveAttribute(
    'data-topology-edit-elbow-tangency-snap-count',
    String(evidence.authority.elbowTangencyCount),
  );
  await expect(host).toHaveAttribute(
    'data-topology-edit-branch-clocking-snap-count',
    String(evidence.authority.branchClockingCount),
  );
  expect(await canonicalState(page)).toEqual(before);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter(isCriticalConsoleError)).toEqual([]);
  await testInfo.attach('tangency-clocking-snapping', {
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
    const module = await import(new URL(
      'src/workspace/topology-edit-3d-professional-controller.js',
      document.baseURI,
    ).href);
    const prototype = module.TopologyEdit3DViewController.prototype;
    if (prototype.__f2SnapActivateWrapped) return;
    const activate = prototype.activate;
    prototype.activate = async function f2SnapActivate(...args) {
      globalThis[key] = this;
      return activate.apply(this, args);
    };
    Object.defineProperty(prototype, '__f2SnapActivateWrapped', { value: true });
  }, CONTROLLER_KEY);
  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible({ timeout: 60_000 });
  await expect(host).toHaveAttribute('data-topology-edit-clean-shell', 'true');
  return host;
}

async function canonicalState(page) {
  return page.evaluate((key) => {
    const controller = globalThis[key];
    return {
      canonicalHash: controller.session.currentTopology().canonicalTopologyHash,
      journalHash: controller.session.journal.journalHash,
      activeCommandCount: controller.session.journal.activeCommandIds.length,
    };
  }, CONTROLLER_KEY);
}

function isCriticalConsoleError(message) {
  return [
    /ReferenceError/iu,
    /Cannot access .* before initialization/iu,
    /does not provide an export named/iu,
    /Failed to fetch dynamically imported module/iu,
    /circular import/iu,
    /WebGL context lost/iu,
    /TopologyEditTangencyClockingSnapIndex/iu,
  ].some((pattern) => pattern.test(message));
}
