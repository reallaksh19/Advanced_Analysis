import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const CONTROLLER_KEY = '__TOPOLOGY_EDIT_DRAG_DIAGNOSTIC_CONTROLLER__';
const DIAGNOSTIC_KEY = '__TOPOLOGY_EDIT_DRAG_DIAGNOSTIC__';
const REPORT_PATH = 'reports/qualification/topology-edit-drag-lifecycle-diagnostic.json';

test('records the first lifecycle transition during a physical gizmo drag', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
  await installLifecycleProbe(page);
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
    return { movingNodeId: moving.id, anchorNodeId: anchor.id };
  }, CONTROLLER_KEY);

  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toHaveAttribute('data-topology-edit-selection-ids', context.movingNodeId);
  await expect(host).toHaveAttribute('data-topology-edit-gizmo-handle-count', '6');
  const drag = await deriveDragPoints(page, context.anchorNodeId);
  const states = [];
  states.push(await captureState(page, 'before-mouse-down'));

  await page.mouse.move(drag.start.x, drag.start.y);
  await page.mouse.down();
  states.push(await captureState(page, 'after-mouse-down'));

  for (let step = 1; step <= 12; step += 1) {
    const fraction = step / 12;
    await page.mouse.move(
      drag.start.x + ((drag.target.x - drag.start.x) * fraction),
      drag.start.y + ((drag.target.y - drag.start.y) * fraction),
    );
    states.push(await captureState(page, `move-${step}`));
    if (states.at(-1).deactivateCount > 0 || !states.at(-1).hostConnected) break;
  }
  await page.mouse.up();
  states.push(await captureState(page, 'after-mouse-up'));

  const diagnostic = await page.evaluate((key) => globalThis[key], DIAGNOSTIC_KEY);
  const report = { context, drag, states, diagnostic };
  await mkdir('reports/qualification', { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`DRAG_LIFECYCLE_DIAGNOSTIC ${JSON.stringify(report)}`);
  expect(states.some((state) => state.activeMode === 'AXIS_X')).toBe(true);
});

async function installLifecycleProbe(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ controllerKey, diagnosticKey }) => {
    const [controllerModule, busModule, topicsModule] = await Promise.all([
      import(new URL('src/workspace/topology-edit-3d-professional-controller.js', document.baseURI).href),
      import(new URL('src/workspace/event-bus.js', document.baseURI).href),
      import(new URL('src/workspace/event-topics.js', document.baseURI).href),
    ]);
    const prototype = controllerModule.TopologyEdit3DViewController.prototype;
    const diagnostic = globalThis[diagnosticKey] = {
      activateCount: 0,
      deactivateCount: 0,
      applicationEvents: [],
      workspaceEvents: [],
    };
    if (!prototype.__dragDiagnosticWrapped) {
      const activate = prototype.activate;
      const deactivate = prototype.deactivate;
      prototype.activate = async function diagnosticActivate(...args) {
        diagnostic.activateCount += 1;
        globalThis[controllerKey] = this;
        return activate.apply(this, args);
      };
      prototype.deactivate = function diagnosticDeactivate(...args) {
        diagnostic.deactivateCount += 1;
        diagnostic.lastDeactivateActiveMode = this.interactionControllerRuntime?.activeMode ?? null;
        diagnostic.lastDeactivateSelection = this.selection?.nodeIds ?? [];
        return deactivate.apply(this, args);
      };
      Object.defineProperty(prototype, '__dragDiagnosticWrapped', { value: true });
    }
    busModule.EventBus.subscribe(topicsModule.APPLICATION_EVENTS.CHANGED, ({ state }) => {
      diagnostic.applicationEvents.push({ activeViewId: state?.activeViewId ?? null });
    });
    busModule.EventBus.subscribe(topicsModule.EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, ({ snapshot }) => {
      diagnostic.workspaceEvents.push({
        version: snapshot?.version ?? null,
        selectedEntityId: snapshot?.selectedEntityId ?? null,
      });
    });
  }, { controllerKey: CONTROLLER_KEY, diagnosticKey: DIAGNOSTIC_KEY });
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
    const topology = controller.session.currentTopology();
    const target = topology.nodes.find((node) => node.id === targetId);
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

async function captureState(page, label) {
  return page.evaluate(({ controllerKey, diagnosticKey, stateLabel }) => {
    const controller = globalThis[controllerKey];
    const host = document.querySelector('[data-role="topology-edit-render-host"]');
    const diagnostic = globalThis[diagnosticKey];
    return {
      label: stateLabel,
      activateCount: diagnostic.activateCount,
      deactivateCount: diagnostic.deactivateCount,
      hostConnected: Boolean(host?.isConnected),
      hostChildCount: host?.childElementCount ?? -1,
      activeMode: controller?.interactionControllerRuntime?.activeMode ?? null,
      selectionIds: controller?.selection?.nodeIds ?? [],
      interactionError: controller?.interactionError ?? null,
      snapQueryId: host?.dataset?.topologyEditSnapQueryId ?? null,
      snapStatus: host?.dataset?.topologyEditInteractionSnapStatus ?? null,
      appEventCount: diagnostic.applicationEvents.length,
      workspaceEventCount: diagnostic.workspaceEvents.length,
    };
  }, { controllerKey: CONTROLLER_KEY, diagnosticKey: DIAGNOSTIC_KEY, stateLabel: label });
}
