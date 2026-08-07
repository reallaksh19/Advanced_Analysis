import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const FIXTURE = resolve('public/fixtures/topology-edit-table-q3-exact.staged.json');
const BALL = Object.freeze({
  catalogueHash: 'sha256:q3-valves-v2',
  sourceHash: 'sha256:q3-valves-source-v2',
  recordId: 'BALL-DN80-C150',
  recordHash: 'sha256:q3-ball-80-150',
  componentType: 'VALVE',
  nominalSizeMm: 80,
  outsideDiameterMm: 88.9,
  pipingClass: 'PCL-80',
  pressureClass: '150',
  materialSpecification: 'A216-WCB',
  componentMassKg: 24,
  endConnectionFrom: 'FLANGED',
  endConnectionTo: 'FLANGED',
  valveType: 'BALL',
  valveFaceToFaceMm: 300,
  sourceReference: { documentId: 'Q3-VALVES', revision: 'R2', path: '/BALL/80/150' },
});

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1720, height: 1080 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
  await page.route('**/fixtures/topology-edit-20-element-demo.staged.json', (route) => route.fulfill({
    path: FIXTURE,
    contentType: 'application/json',
  }));
});

test('Q3 M04 M06 M10 completes one certified production Table transaction', async ({ page }) => {
  const host = await openQ3(page);
  const q3 = await q3Authority(page);
  const before = await evidence(page);

  await stagePipe(page, q3.m04Id, 3000);
  await selectTableRow(page, q3.m06Id);
  await page.locator('[data-table-edit-valve-catalogue]').fill(JSON.stringify(BALL));
  await page.locator('[data-table-edit-anchor]').selectOption('FROM');
  await page.locator('[data-table-edit-propagation]').selectOption('DOWNSTREAM');
  await page.locator('[data-table-action="stage-valve-replacement"]').click();

  await selectTableRow(page, q3.teeId);
  await page.locator('[data-table-edit-tee-branch-port]').selectOption(q3.branchPortKey);
  await page.locator('[data-table-edit-tee-reducer]').selectOption(q3.reducerId);
  await page.locator('[data-table-edit-tee-run-dn]').fill('150');
  await page.locator('[data-table-edit-tee-branch-dn]').fill('100');
  await page.locator('[data-table-edit-tee-downstream-dn]').fill('80');
  await page.locator('[data-table-action="stage-tee-reducer-relation"]').click();

  await expect.poll(() => tableState(page).then((state) => state.intentCount)).toBe(3);
  await page.locator('[data-table-action="preview"]').click();
  await expect.poll(() => tableState(page).then((state) => state.commandCount)).toBe(5);
  expect((await evidence(page)).canonicalHash).toBe(before.canonicalHash);

  await page.locator('[data-table-action="validate"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-table-validation-status', 'READY_TO_APPLY');
  await page.locator('[data-table-action="apply"]').click();
  await expect.poll(() => evidence(page).then((row) => row.canonicalHash)).not.toBe(before.canonicalHash);
  const applied = await evidence(page);
  const engineering = await q3EngineeringEvidence(page, q3);
  expect(engineering.m04LengthMm).toBe(3000);
  expect(engineering.m06LengthMm).toBe(300);
  expect(engineering.tailLengthMm).toBe(1000);
  expect(engineering.valveType).toBe('BALL');
  expect(engineering.reducerRecordHash).toBe('sha256:q3-red-100-80');
  expect(applied.sourceHash).toBe(before.sourceHash);
  expect(applied.sourceOpaqueToken).toBe('KEEP-Q3-OPAQUE');
  expect(applied.rendererCount).toBe(1);

  await page.locator('[data-action="undo"]').click();
  await expect.poll(() => evidence(page).then((row) => row.canonicalHash)).toBe(before.canonicalHash);
  await page.locator('[data-action="redo"]').click();
  await expect.poll(() => evidence(page).then((row) => row.canonicalHash)).toBe(applied.canonicalHash);
});

test('R42 rebases disjoint Canvas edits and R43 fails closed on overlapping dependency', async ({ page }) => {
  const host = await openQ3(page);
  const q3 = await q3Authority(page);
  await stagePipe(page, q3.m04Id, 2800);
  const firstBatch = await host.getAttribute('data-topology-edit-table-batch-hash');

  await moveNodeViaCanvas(page, host, q3.disjointEndpointId, { deltaX: 75, deltaY: 0, deltaZ: 0 });
  await expect.poll(() => tableState(page).then((state) => state.batchHash)).not.toBe(firstBatch);
  const rebased = await tableState(page);
  expect(rebased.staleDisposition).toBe('');
  expect(rebased.batchBasisHash).toBe(rebased.canonicalHash);
  expect(rebased.message).toContain('rebased safely');
  await page.locator('[data-table-action="preview"]').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-table-preview-hash')).toBeTruthy();

  await page.locator('[data-table-action="discard"]').click();
  await stagePipe(page, q3.m04Id, 2900);
  await moveNodeViaCanvas(page, host, q3.tailEndpointId, { deltaX: 0, deltaY: 75, deltaZ: 0 });
  await expect(host).toHaveAttribute('data-topology-edit-table-stale-disposition', 'STALE_CONFLICT');
  const conflict = await tableState(page);
  expect(conflict.reasonCodes).toContain('DEPENDENCY_REVISION_CHANGED');
  await expect(page.locator('[data-table-action="preview"]')).toBeDisabled();
  expect(conflict.intentCount).toBe(1);
});

async function openQ3(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Application views' })
    .getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.locator('[data-action="load-topology-edit-demo"]').click();
  await expect.poll(() => page.evaluate(() => (
    globalThis.AnalysisWorkspace?.getSnapshot?.()?.dataset?.entities?.length ?? 0
  ))).toBe(8);
  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(
    document.querySelector('[data-role="topology-edit-render-host"]')
      ?.__topologyEditAuthoringController?.tableAdapter?.runtime?.projection
  ))).toBe(true);
  const tablePanel = host.locator('details[data-panel-kind="table"]');
  if (!(await tablePanel.evaluate((node) => node.open))) await tablePanel.locator(':scope > summary').click();
  return host;
}

async function q3Authority(page) {
  return page.evaluate(() => {
    const controller = document.querySelector('[data-role="topology-edit-render-host"]')
      ?.__topologyEditAuthoringController;
    const topology = controller.session.currentTopology();
    const rows = controller.tableAdapter.runtime.projection.rows;
    const row = (key) => rows.find((item) => item.identity.componentKey === key);
    const edge = (key) => topology.edges.find((item) => item.componentKey === key);
    const tee = row('T-001'); const reducer = edge('R-001');
    const branch = tee.identity.portBindings.find((item) => item.nodeId === reducer.fromNodeId);
    return {
      m04Id: row('P-M04').identity.canonicalId,
      m06Id: row('V-M06').identity.canonicalId,
      teeId: tee.identity.canonicalId,
      reducerId: row('R-001').identity.canonicalId,
      branchPortKey: branch.portKey,
      disjointEndpointId: edge('P-R42').toNodeId,
      tailEndpointId: edge('P-TAIL').toNodeId,
    };
  });
}

async function selectTableRow(page, canonicalId) {
  const row = page.locator(`[data-role="topology-edit-table"] [data-canonical-id="${canonicalId}"]`);
  await expect(row).toBeVisible();
  await row.locator('[data-table-select]').click();
}

async function stagePipe(page, canonicalId, lengthMm) {
  await selectTableRow(page, canonicalId);
  await page.locator('[data-table-edit-length]').fill(String(lengthMm));
  await page.locator('[data-table-edit-anchor]').selectOption('FROM');
  await page.locator('[data-table-edit-propagation]').selectOption('DOWNSTREAM');
  await page.locator('[data-table-action="stage-pipe-length"]').click();
}

async function moveNodeViaCanvas(page, host, nodeId, fields) {
  const treePanel = host.locator('details[data-panel-kind="topology-edit-object-tree"]');
  if (!(await treePanel.evaluate((node) => node.open))) await treePanel.locator(':scope > summary').click();
  const filter = treePanel.locator('[data-role="topology-edit-object-tree-filter"]');
  await filter.fill(nodeId);
  await treePanel.locator(`[data-canonical-id="${nodeId}"] [data-object-tree-select]`).click();
  await expect(host).toHaveAttribute('data-topology-edit-selection-primary-id', nodeId);
  await filter.fill('');

  const authoring = host.locator('details[data-panel-kind="authoring"]');
  if (!(await authoring.evaluate((node) => node.open))) await authoring.locator(':scope > summary').click();
  await page.locator('[data-action="activate-authoring-move"]').click();
  for (const [key, value] of Object.entries(fields)) {
    await page.locator(`[data-authoring-field="${key}"]`).fill(String(value));
  }
  const priorHash = await evidence(page).then((row) => row.canonicalHash);
  await page.locator('[data-action="preview-authoring-operation"]').click();
  await page.locator('[data-action="validate-authoring-operation"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-authoring-phase', 'READY_TO_APPLY');
  await page.locator('[data-action="apply-authoring-operation"]').click();
  await expect.poll(() => evidence(page).then((row) => row.canonicalHash)).not.toBe(priorHash);
}

async function tableState(page) {
  return page.evaluate(() => {
    const host = document.querySelector('[data-role="topology-edit-render-host"]');
    const controller = host.__topologyEditAuthoringController;
    const runtime = controller.tableAdapter.runtime;
    return {
      canonicalHash: controller.session.currentTopology().canonicalTopologyHash,
      batchHash: runtime.batch?.batchHash ?? '',
      batchBasisHash: runtime.batch?.authority?.priorDraftHash ?? '',
      intentCount: runtime.batch?.intentCount ?? 0,
      commandCount: runtime.preview?.candidate?.commandCount ?? 0,
      staleDisposition: runtime.staleResult?.disposition ?? '',
      reasonCodes: runtime.staleResult?.reasons?.map((row) => row.code) ?? [],
      message: runtime.message ?? '',
    };
  });
}

async function q3EngineeringEvidence(page, q3) {
  return page.evaluate((ids) => {
    const topology = document.querySelector('[data-role="topology-edit-render-host"]')
      .__topologyEditAuthoringController.session.currentTopology();
    const edge = (id) => topology.edges.find((row) => row.id === id);
    const length = (value) => {
      const a = topology.nodes.find((row) => row.id === value.fromNodeId).position;
      const b = topology.nodes.find((row) => row.id === value.toNodeId).position;
      return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    };
    const m04 = edge(ids.m04Id); const valve = edge(ids.m06Id);
    const tail = topology.edges.find((row) => row.componentKey === 'P-TAIL');
    const tee = topology.junctions.find((row) => row.id === ids.teeId);
    return {
      m04LengthMm: length(m04), m06LengthMm: length(valve), tailLengthMm: length(tail),
      valveType: valve.valveType, reducerRecordHash: tee.branchRelation?.reducerRecordHash ?? null,
    };
  }, q3);
}

async function evidence(page) {
  return page.evaluate(() => {
    const host = document.querySelector('[data-role="topology-edit-render-host"]');
    const controller = host.__topologyEditAuthoringController;
    return {
      canonicalHash: controller.session.currentTopology().canonicalTopologyHash,
      sourceHash: controller.workspaceDataset.sourceSnapshot.sourceSemanticHash,
      sourceOpaqueToken: controller.workspaceDataset.sourceSnapshot.sourcePackage.vendorTopLevel?.opaqueToken ?? null,
      rendererCount: controller.viewportBackend?.renderer?.domElement ? 1 : 0,
    };
  });
}
