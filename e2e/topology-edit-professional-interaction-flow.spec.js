import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const REPORT_PATH = 'reports/qualification/topology-edit-professional-interaction.json';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript(() => {
    globalThis.localStorage?.clear();
  });
});

test('visible viewport interaction completes exact 3 mm and 20 mm flows', async ({ page }, testInfo) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const scenarios = [];
  for (const gapMm of [3, 20]) {
    scenarios.push(await runGapScenario(page, testInfo, gapMm));
  }
  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter(isCriticalConsoleError)).toEqual([]);
  await mkdir('reports/qualification', { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify({
    schema: 'TopologyEditProfessionalInteractionEvidence.v1',
    status: 'PASS_TRACK_A_VISIBLE_INTERACTION',
    candidateHead: process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || null,
    fixture: 'public/fixtures/topology-edit-20-element-demo.staged.json',
    productionIntegrated: false,
    interactionController: 'standalone exported composition',
    scenarios,
  }, null, 2)}\n`);
});

async function runGapScenario(page, testInfo, gapMm) {
  const host = await openStandaloneInteractionDemo(page);
  const initial = await controllerEvidence(page);
  expect(initial.activeCommandCount).toBe(0);
  const target = await gapContext(page, 'E-001:port:start', 'P-001:port:end', gapMm);

  await clickCanonicalNodeInViewport(page, target.movingNodeId);
  await expect.poll(() => selectedNodeId(page)).toBe(target.movingNodeId);
  await expect(host).toHaveAttribute('data-topology-edit-gizmo-handle-count', '6');
  await expect(page.getByText(target.movingNodeId, { exact: true })).toBeVisible();

  const beforeDrag = await controllerEvidence(page);
  await dragDominantAxisHandleToNode(page, target.anchorNodeId, target.axis);
  await expect(host).toHaveAttribute('data-topology-edit-interaction-snap-status', 'RESOLVED');
  await expect(host).toHaveAttribute('data-topology-edit-interaction-snap-evidence', 'ENDPOINT');
  await expect(host).toHaveAttribute('data-topology-edit-interaction-snap-target', target.anchorNodeId);
  await expect(page.locator('[data-role="topology-edit-status"]')).toContainText('snap ENDPOINT');
  await page.keyboard.press('Escape');
  await expect(host).toHaveAttribute('data-topology-edit-interaction-preview-hash', '');
  expect((await controllerEvidence(page)).journalHash).toBe(beforeDrag.journalHash);
  expect((await controllerEvidence(page)).sessionVersion).toBe(beforeDrag.sessionVersion);

  await page.locator('[data-role="interaction-entry-mode"]').selectOption('ABSOLUTE');
  await fillExactTarget(page, target.targetPosition);
  await page.locator('[data-action="preview-professional-interaction"]').click();
  const cancelledPreview = await controllerEvidence(page);
  expect(cancelledPreview.previewHash).not.toBe('');
  expect(cancelledPreview.journalHash).toBe(beforeDrag.journalHash);
  expect(cancelledPreview.sessionVersion).toBe(beforeDrag.sessionVersion);
  await page.locator('[data-action="cancel-professional-interaction"]').click();
  expect((await controllerEvidence(page)).journalHash).toBe(beforeDrag.journalHash);

  await page.locator('[data-action="preview-professional-interaction"]').click();
  await page.locator('[data-action="apply-professional-interaction"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '1');
  const moved = await controllerEvidence(page);
  expect(moved.certificationHash).not.toBe('');
  expect(moved.candidateHash).not.toBe('');
  expect(moved.acceptanceHash).not.toBe('');
  expect(moved.canonicalHash).not.toBe(initial.canonicalHash);

  const snapIssue = page.locator('[data-issue-kind="SNAP_GAP"]')
    .filter({ hasText: `${gapMm.toFixed(2)}mm` });
  await expect(snapIssue).toHaveCount(1);
  const beforeAutofix = await controllerEvidence(page);
  await snapIssue.getByRole('button', { name: 'Preview MERGE_NODES' }).click();
  await page.locator('[data-action="cancel-autofix"]').click();
  const afterAutofixCancel = await controllerEvidence(page);
  expect(afterAutofixCancel.journalHash).toBe(beforeAutofix.journalHash);
  expect(afterAutofixCancel.sessionVersion).toBe(beforeAutofix.sessionVersion);

  await snapIssue.getByRole('button', { name: 'Preview MERGE_NODES' }).click();
  await page.locator('[data-action="accept-autofix"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '2');
  const merged = await controllerEvidence(page);
  expect(merged.canonicalHash).not.toBe(moved.canonicalHash);

  await page.locator('[data-action="undo"]').click();
  await expect.poll(() => controllerCanonicalHash(page)).toBe(moved.canonicalHash);
  await page.locator('[data-action="undo"]').click();
  await expect.poll(() => controllerCanonicalHash(page)).toBe(initial.canonicalHash);
  await page.locator('[data-action="redo"]').click();
  await expect.poll(() => controllerCanonicalHash(page)).toBe(moved.canonicalHash);
  await page.locator('[data-action="redo"]').click();
  await expect.poll(() => controllerCanonicalHash(page)).toBe(merged.canonicalHash);

  const manualGap = await manualGapEvidence(page);
  expect(manualGap.distanceMm).toBe(250);
  expect(manualGap.hasSnapGapIssue).toBe(false);
  await testInfo.attach(`track-a-${gapMm}mm`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await page.evaluate(() => globalThis.__TRACK_A_CONTROLLER__?.deactivate());
  return {
    gapMm,
    movingNodeId: target.movingNodeId,
    anchorNodeId: target.anchorNodeId,
    initialCanonicalHash: initial.canonicalHash,
    movedCanonicalHash: moved.canonicalHash,
    mergedCanonicalHash: merged.canonicalHash,
    acceptanceHash: moved.acceptanceHash,
    certificationHash: moved.certificationHash,
    candidateDraftHash: moved.candidateHash,
    journalHash: merged.journalHash,
    sessionVersion: merged.sessionVersion,
    manualGapMm: manualGap.distanceMm,
  };
}

async function openStandaloneInteractionDemo(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await navigation.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.locator('[data-action="load-topology-edit-demo"]').click();
  await expect.poll(() => page.evaluate(() => (
    globalThis.AnalysisWorkspace?.getSnapshot?.()?.dataset?.entities?.length ?? 0
  ))).toBe(20);
  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  await expect(page.locator('[data-role="topology-edit-render-host"]')).toBeVisible();
  await page.evaluate(async () => {
    const { APPLICATION_EVENTS } = await import('/src/workspace/event-topics.js');
    globalThis.EventBus.publish(APPLICATION_EVENTS.CHANGED, {
      state: { activeViewId: 'TRACK_A_QUALIFICATION' },
    });
    const { TopologyEdit3DViewController } = await import(
      '/src/workspace/topology-edit-3d-interaction-controller.js'
    );
    const controller = new TopologyEdit3DViewController(globalThis.EventBus);
    globalThis.__TRACK_A_CONTROLLER__ = controller;
    await controller.activate();
  });
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(page.locator('[data-role="topology-edit-professional-interaction"]')).toBeVisible();
  await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '0');
  return host;
}

async function gapContext(page, movingPortKey, anchorPortKey, gapMm) {
  return page.evaluate(({ movingPortKey: movingKey, anchorPortKey: anchorKey, gap }) => {
    const topology = globalThis.__TRACK_A_CONTROLLER__.session.currentTopology();
    const moving = topology.nodes.find((node) => node.portKeys?.includes(movingKey));
    const anchor = topology.nodes.find((node) => node.portKeys?.includes(anchorKey));
    if (!moving || !anchor) throw new Error('Exact fixture ports are unavailable.');
    const delta = {
      x: moving.position.x - anchor.position.x,
      y: moving.position.y - anchor.position.y,
      z: moving.position.z - anchor.position.z,
    };
    const length = Math.hypot(delta.x, delta.y, delta.z);
    if (!(length > 0)) throw new Error('Fixture gap direction is unavailable.');
    const axis = ['x', 'y', 'z'].sort((left, right) => (
      Math.abs(delta[right]) - Math.abs(delta[left])
    ))[0].toUpperCase();
    return {
      movingNodeId: moving.id,
      anchorNodeId: anchor.id,
      axis,
      targetPosition: {
        x: anchor.position.x + (delta.x / length) * gap,
        y: anchor.position.y + (delta.y / length) * gap,
        z: anchor.position.z + (delta.z / length) * gap,
      },
    };
  }, { movingPortKey, anchorPortKey, gap: gapMm });
}

async function clickCanonicalNodeInViewport(page, nodeId) {
  const point = await projectedNode(page, nodeId);
  await page.mouse.click(point.x, point.y);
}

async function dragDominantAxisHandleToNode(page, targetNodeId, axis) {
  const points = await page.evaluate(({ targetId, axisName }) => {
    const controller = globalThis.__TRACK_A_CONTROLLER__;
    const topology = controller.session.currentTopology();
    const target = topology.nodes.find((node) => node.id === targetId);
    const gizmo = controller.interactionControllerRuntime.gizmo;
    const camera = controller.viewportBackend.activeCamera;
    const canvas = controller.viewportBackend.renderer.domElement;
    if (!target || !gizmo || !camera || !canvas) throw new Error('Gizmo drag context unavailable.');
    const axisVector = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[axisName];
    const anchor = gizmo.anchorPosition;
    const startWorld = {
      x: anchor.x + axisVector[0] * gizmo.scaleMm * 0.8,
      y: anchor.y + axisVector[1] * gizmo.scaleMm * 0.8,
      z: anchor.z + axisVector[2] * gizmo.scaleMm * 0.8,
    };
    const project = (position) => {
      const vector = camera.position.clone().set(position.x, position.y, position.z).project(camera);
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + ((vector.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - vector.y) / 2) * rect.height,
      };
    };
    return { start: project(startWorld), end: project(target.position) };
  }, { targetId: targetNodeId, axisName: axis });
  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.end.x, points.end.y, { steps: 8 });
  await page.mouse.up();
}

async function projectedNode(page, nodeId) {
  return page.evaluate((id) => {
    const controller = globalThis.__TRACK_A_CONTROLLER__;
    const node = controller.session.currentTopology().nodes.find((row) => row.id === id);
    const camera = controller.viewportBackend.activeCamera;
    const canvas = controller.viewportBackend.renderer.domElement;
    if (!node || !camera || !canvas) throw new Error(`Cannot project ${id}.`);
    const vector = camera.position.clone()
      .set(node.position.x, node.position.y, node.position.z)
      .project(camera);
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + ((vector.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - vector.y) / 2) * rect.height,
    };
  }, nodeId);
}

async function fillExactTarget(page, point) {
  for (const axis of ['x', 'y', 'z']) {
    await page.locator(`[data-role="interaction-value-${axis}"]`).fill(String(point[axis]));
  }
}

async function manualGapEvidence(page) {
  return page.evaluate(() => {
    const controller = globalThis.__TRACK_A_CONTROLLER__;
    const topology = controller.session.currentTopology();
    const from = topology.nodes.find((node) => node.portKeys?.includes('P-003:port:end'));
    const to = topology.nodes.find((node) => node.portKeys?.includes('R-001:port:start'));
    const distanceMm = Math.hypot(
      from.position.x - to.position.x,
      from.position.y - to.position.y,
      from.position.z - to.position.z,
    );
    const hasSnapGapIssue = controller.issues.some((issue) => (
      issue.kind === 'SNAP_GAP'
      && issue.nodeIds?.includes(from.id)
      && issue.nodeIds?.includes(to.id)
    ));
    return { distanceMm, hasSnapGapIssue };
  });
}

async function selectedNodeId(page) {
  return page.evaluate(() => (
    globalThis.__TRACK_A_CONTROLLER__?.selection?.nodeIds?.[0] ?? null
  ));
}

async function controllerCanonicalHash(page) {
  return page.evaluate(() => (
    globalThis.__TRACK_A_CONTROLLER__?.session?.currentTopology?.()?.canonicalTopologyHash ?? ''
  ));
}

async function controllerEvidence(page) {
  return page.evaluate(() => {
    const controller = globalThis.__TRACK_A_CONTROLLER__;
    const host = controller.hostElement;
    return {
      canonicalHash: controller.session.currentTopology().canonicalTopologyHash,
      journalHash: controller.session.journal.journalHash,
      sessionVersion: controller.session.journal.sessionVersion,
      activeCommandCount: controller.session.journal.activeCommandIds.length,
      previewHash: host.dataset.topologyEditInteractionPreviewHash || '',
      acceptanceHash: host.dataset.topologyEditInteractionAcceptanceHash || '',
      certificationHash: host.dataset.topologyEditInteractionCertificationHash || '',
      candidateHash: host.dataset.topologyEditInteractionCandidateHash || '',
    };
  });
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
