import { expect, test } from '@playwright/test';

const BRANCH_IDS = [
  'E-003',
  'P-009',
  'E-004',
  'P-010',
  'R-002',
  'P-011',
  'V-002',
  'F-002',
  'O-002',
  'P-012',
];

const SUPPORT_IDS = ['S-006', 'S-007'];

test.beforeEach(async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1680, height: 1100 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('3D Edit loads and renders the governed 10-element XYZ branch with separate rest and guide', async ({ page }, testInfo) => {
  const diagnostics = collectBrowserDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await navigation.getByRole('button', { name: 'Workspace', exact: true }).click();

  const loader = page.locator('[data-action="load-topology-edit-xyz-branch-demo"]');
  await expect(loader).toBeVisible();
  await expect(loader).toHaveAttribute('aria-label', 'Load 10-element XYZ branch demo');
  await loader.click();
  await expect.poll(() => page.evaluate(() => (
    globalThis.AnalysisWorkspace?.getSnapshot?.()?.dataset?.entities?.length ?? 0
  ))).toBe(32);

  const datasetEvidence = await page.evaluate(({ branchIds, supportIds }) => {
    const snapshot = globalThis.AnalysisWorkspace.getSnapshot();
    const entities = snapshot.dataset.entities;
    const byId = new Map(entities.map((row) => [row.entityId, row]));
    const axes = new Set();
    for (const id of branchIds) {
      const entity = byId.get(id);
      if (!entity) throw new Error(`Missing XYZ branch entity ${id}.`);
      const start = entity.properties.nativeParams.startPoint;
      const end = entity.properties.nativeParams.endPoint;
      ['X', 'Y', 'Z'].forEach((axis, index) => {
        if (Math.abs(Number(end[index]) - Number(start[index])) > 1e-9) axes.add(axis);
      });
    }
    const supports = supportIds.map((id) => {
      const entity = byId.get(id);
      if (!entity) throw new Error(`Missing XYZ branch support ${id}.`);
      return {
        id,
        type: entity.entityType,
        attached: entity.properties.attributes.ATTACHED_COMPONENT_ID,
      };
    });
    return {
      sourceName: snapshot.dataset.sourceName,
      summary: snapshot.dataset.summary,
      axes: [...axes].sort(),
      branchTypes: [...new Set(branchIds.map((id) => byId.get(id).entityType))].sort(),
      supports,
    };
  }, { branchIds: BRANCH_IDS, supportIds: SUPPORT_IDS });

  expect(datasetEvidence.sourceName).toBe('topology-edit-xyz-10-element-branch.staged.json');
  expect(datasetEvidence.summary).toMatchObject({
    nodeCount: 32,
    pipes: 25,
    supports: 7,
  });
  expect(datasetEvidence.axes).toEqual(['X', 'Y', 'Z']);
  expect(datasetEvidence.branchTypes).toEqual([
    'ELBO',
    'FLANGE',
    'OLET',
    'PIPE',
    'REDUCER',
    'VALVE',
  ]);
  expect(datasetEvidence.supports).toEqual([
    { id: 'S-006', type: 'REST', attached: 'P-009' },
    { id: 'S-007', type: 'GUIDE', attached: 'P-011' },
  ]);

  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => Boolean(
    document.querySelector('[data-role="topology-edit-render-host"]')
      ?.__topologyEditAuthoringController
      ?.session
      ?.currentTopology?.()
  ))).toBe(true);

  const topologyEvidence = await page.evaluate(({ branchIds }) => {
    const controller = document.querySelector('[data-role="topology-edit-render-host"]')
      .__topologyEditAuthoringController;
    const topology = controller.session.currentTopology();
    const edgeByComponent = new Map(topology.edges.map((edge) => [edge.componentKey, edge]));
    const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
    const lengths = topology.edges.map((edge) => {
      const from = nodes.get(edge.fromNodeId).position;
      const to = nodes.get(edge.toNodeId).position;
      return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    });
    const exactEdge = (componentKey) => {
      const edge = edgeByComponent.get(componentKey);
      if (!edge) throw new Error(`Missing canonical XYZ edge ${componentKey}.`);
      return edge;
    };
    const sharedNode = (left, right) => (
      [left.fromNodeId, left.toNodeId].find((nodeId) => (
        nodeId === right.fromNodeId || nodeId === right.toNodeId
      )) ?? null
    );
    const incidentKeys = (nodeId) => topology.edges
      .filter((edge) => edge.fromNodeId === nodeId || edge.toNodeId === nodeId)
      .map((edge) => edge.componentKey)
      .sort();

    const hostPipe = exactEdge('P-011');
    const valve = exactEdge('V-002');
    const olet = exactEdge('O-002');
    const branchPipe = exactEdge('P-012');
    const oletHostNodeId = sharedNode(hostPipe, olet);
    const valveHostNodeId = sharedNode(valve, olet);
    const oletBranchFaceNodeId = sharedNode(olet, branchPipe);
    if (!oletHostNodeId || !oletBranchFaceNodeId) {
      throw new Error('XYZ Olet canonical node connectivity is incomplete.');
    }

    return {
      representedBranchIds: branchIds.filter((id) => edgeByComponent.has(id)).sort(),
      supportCount: topology.supports.length,
      resolvedSupportCount: topology.supports.filter((row) => row.resolved).length,
      junctionCount: topology.junctions.length,
      oletHostNodeMatchesValve: oletHostNodeId === valveHostNodeId,
      oletHostIncidentKeys: incidentKeys(oletHostNodeId),
      oletBranchFaceIncidentKeys: incidentKeys(oletBranchFaceNodeId),
      distinctOletNodes: oletHostNodeId !== oletBranchFaceNodeId,
      minimumEdgeLengthMm: Math.min(...lengths),
      canonicalHash: topology.canonicalTopologyHash,
    };
  }, { branchIds: BRANCH_IDS });

  expect(topologyEvidence.representedBranchIds).toEqual([...BRANCH_IDS].sort());
  expect(topologyEvidence.supportCount).toBe(7);
  expect(topologyEvidence.resolvedSupportCount).toBe(7);
  expect(topologyEvidence.junctionCount).toBeGreaterThanOrEqual(1);
  expect(topologyEvidence.oletHostNodeMatchesValve).toBe(true);
  expect(topologyEvidence.oletHostIncidentKeys).toEqual(['O-002', 'P-011', 'V-002']);
  expect(topologyEvidence.oletBranchFaceIncidentKeys).toEqual(['O-002', 'P-012']);
  expect(topologyEvidence.distinctOletNodes).toBe(true);
  expect(topologyEvidence.minimumEdgeLengthMm).toBeGreaterThan(0);
  expect(topologyEvidence.canonicalHash).toBeTruthy();

  await assertBrowserDiagnostics(diagnostics);
  await testInfo.attach('topology-edit-xyz-10-element-branch', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

function collectBrowserDiagnostics(page) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

async function assertBrowserDiagnostics(diagnostics) {
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleErrors.filter((message) => [
    /ReferenceError/iu,
    /Cannot access .* before initialization/iu,
    /does not provide an export named/iu,
    /Failed to fetch dynamically imported module/iu,
    /circular import/iu,
    /WebGL context lost/iu,
    /XYZ branch/iu,
  ].some((pattern) => pattern.test(message)))).toEqual([]);
}
