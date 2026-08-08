import { expect, test } from '@playwright/test';

const CONTROLLER_KEY = '__TOPOLOGY_EDIT_SNAP_TARGET_DIAGNOSTIC__';

test('records exact engineering target and indexed port evidence', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
  await installControllerProbe(page);
  await openProductionController(page);

  const context = await page.evaluate((controllerKey) => {
    const controller = globalThis[controllerKey];
    const topology = controller.session.currentTopology();
    const moving = topology.nodes.find((node) => node.portKeys?.includes('P-004:port:end'));
    const anchor = topology.nodes.find((node) => node.portKeys?.includes('P-005:port:end'));
    if (!moving || !anchor) throw new Error('Diagnostic P-004/P-005 nodes are unavailable.');
    controller.selectionCoordinator.requestCanonical(
      'REPLACE',
      [moving.id],
      'command',
      { primaryId: moving.id, anchorId: moving.id },
    );
    return {
      movingNodeId: moving.id,
      anchorNodeId: anchor.id,
      movingPosition: moving.position,
      anchorPosition: anchor.position,
    };
  }, CONTROLLER_KEY);

  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toHaveAttribute('data-topology-edit-selection-ids', context.movingNodeId);
  await expect(host).toHaveAttribute('data-topology-edit-gizmo-handle-count', '6');
  const drag = await deriveDragPoints(page, context.anchorNodeId);
  await page.mouse.move(drag.start.x, drag.start.y);
  await page.mouse.down();
  await page.mouse.move(drag.target.x, drag.target.y, { steps: 12 });
  await expect(host).toHaveAttribute('data-topology-edit-interaction-snap-status', 'RESOLVED');

  const diagnostic = await page.evaluate(({ controllerKey, targetId }) => {
    const controller = globalThis[controllerKey];
    const runtime = controller.interactionControllerRuntime;
    const target = controller.session.currentTopology().nodes.find((node) => node.id === targetId);
    const raw = runtime.lastDragEvidence?.targetPosition ?? null;
    const distanceToTarget = raw && target
      ? Math.hypot(
        raw.x - target.position.x,
        raw.y - target.position.y,
        raw.z - target.position.z,
      )
      : null;
    const pointFeatures = (runtime.snapIndex?.pointFeatures ?? [])
      .filter((feature) => feature.canonicalTargetIds?.includes(targetId))
      .map((feature) => ({
        featureId: feature.featureId,
        kind: feature.kind,
        worldPoint: feature.worldPoint,
        compatibility: feature.compatibility,
        hidden: feature.hidden,
        locked: feature.locked,
      }));
    const result = runtime.snapResult;
    return {
      targetPosition: target?.position ?? null,
      rawTargetPosition: raw,
      pointerScreen: runtime.lastDragEvidence?.pointerScreen ?? null,
      distanceToTarget,
      result: result ? {
        status: result.status,
        kind: result.kind,
        targetIds: result.targetIds,
        candidateCount: result.candidateCount,
        querySequence: result.querySequence,
        retainedByHysteresis: result.retainedByHysteresis,
        queryStats: result.queryStats,
        candidate: result.candidate ? {
          candidateId: result.candidate.candidateId,
          kind: result.candidate.kind,
          canonicalTargetIds: result.candidate.canonicalTargetIds,
          worldPoint: result.candidate.worldPoint,
          screenDistancePx: result.candidate.screenDistancePx,
          worldDistanceMm: result.candidate.worldDistanceMm,
          constraintError: result.candidate.constraintError,
          compatibility: result.candidate.compatibility,
          priority: result.candidate.priority,
          sourceFeatureId: result.candidate.sourceFeatureId,
        } : null,
      } : null,
      pointFeatures,
      preferences: runtime.snapStore?.preferences?.() ?? null,
    };
  }, { controllerKey: CONTROLLER_KEY, targetId: context.anchorNodeId });

  console.log(`SNAP_TARGET_DIAGNOSTIC ${JSON.stringify({ context, drag, diagnostic })}`);
  expect(diagnostic.pointFeatures.some((feature) => feature.kind === 'PORT')).toBe(true);
  expect(diagnostic.result?.status).toBe('RESOLVED');
  await page.mouse.up();
});

async function installControllerProbe(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (key) => {
    const moduleUrl = new URL(
      'src/workspace/topology-edit-3d-professional-controller.js',
      document.baseURI,
    ).href;
    const { TopologyEdit3DViewController } = await import(moduleUrl);
    const prototype = TopologyEdit3DViewController.prototype;
    if (prototype.__snapTargetDiagnosticWrapped) return;
    const activate = prototype.activate;
    prototype.activate = async function diagnosticActivate(...args) {
      globalThis[key] = this;
      return activate.apply(this, args);
    };
    Object.defineProperty(prototype, '__snapTargetDiagnosticWrapped', { value: true });
  }, CONTROLLER_KEY);
}

async function openProductionController(page) {
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await navigation.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.locator('[data-action="load-topology-edit-demo"]').click();
  await expect.poll(() => page.evaluate(() => (
    globalThis.AnalysisWorkspace?.getSnapshot?.()?.dataset?.entities?.length ?? 0
  ))).toBe(20);
  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible({ timeout: 60_000 });
  await expect(host).toHaveAttribute('data-topology-edit-clean-shell', 'true');
}

async function deriveDragPoints(page, targetNodeId) {
  return page.evaluate(({ controllerKey, targetId }) => {
    const controller = globalThis[controllerKey];
    const target = controller.session.currentTopology().nodes.find((node) => node.id === targetId);
    const runtime = controller.interactionControllerRuntime;
    const viewport = runtime.viewport;
    const gizmo = runtime.gizmo;
    const camera = controller.viewportBackend.activeCamera;
    const canvas = controller.viewportBackend.renderer.domElement;
    const root = controller.viewportBackend.engineeringRoot;
    root.updateMatrixWorld(true);
    const rect = canvas.getBoundingClientRect();
    const project = (point) => {
      const vector = camera.position.clone().set(point.x, point.y, point.z)
        .applyMatrix4(root.matrixWorld).project(camera);
      return {
        x: rect.left + ((vector.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - vector.y) / 2) * rect.height,
      };
    };
    const nominal = project({
      x: gizmo.anchorPosition.x + (gizmo.scaleMm * 0.7),
      y: gizmo.anchorPosition.y,
      z: gizmo.anchorPosition.z,
    });
    let start = null;
    for (let radius = 0; radius <= 48 && !start; radius += 2) {
      for (let dy = -radius; dy <= radius && !start; dy += 2) {
        for (let dx = -radius; dx <= radius; dx += 2) {
          const point = { x: nominal.x + dx, y: nominal.y + dy };
          if (viewport.pickHandleMode({ clientX: point.x, clientY: point.y }) === 'AXIS_X') {
            start = point;
            break;
          }
        }
      }
    }
    if (!start) throw new Error('No AXIS_X gizmo point was found.');
    return { start, target: project(target.position) };
  }, { controllerKey: CONTROLLER_KEY, targetId: targetNodeId });
}
