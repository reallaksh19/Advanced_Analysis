import { expect, test } from '@playwright/test';

const VALVE_RECORD_ID = 'VALVE-DN100-GLOBE-600-B';
const UPSTREAM_FLANGE_ID = 'FLANGE-DN100-600-RF-A';
const DOWNSTREAM_FLANGE_ID = 'FLANGE-DN100-600-RF-B';

test.beforeEach(async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1680, height: 1100 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('production HUD authors one governed flange–valve–flange assembly atomically', async ({ page }, testInfo) => {
  const diagnostics = collectBrowserDiagnostics(page);
  const host = await openProductionController(page);
  const initial = await topologySnapshot(page);
  const target = await eligibleHostEdge(page, 100, 114.3, 740, 'P-005');

  await selectCanonicalEdgeFromTree(page, host, target.id);
  await page.locator('[data-action="activate-authoring-valve-assembly"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-authoring-tool', 'VALVE_ASSEMBLY');
  await expect(host).toHaveAttribute('data-topology-edit-authoring-catalogue-option-count', '8');
  await page.locator('[data-authoring-field="valveRecordId"]').selectOption(VALVE_RECORD_ID);
  await page.locator('[data-authoring-field="upstreamFlangeRecordId"]')
    .selectOption(UPSTREAM_FLANGE_ID);
  await page.locator('[data-authoring-field="downstreamFlangeRecordId"]')
    .selectOption(DOWNSTREAM_FLANGE_ID);
  await expect(page.locator('[data-authoring-field="faceToFaceMm"]')).toBeDisabled();
  await expect(page.locator('[data-authoring-field="assemblyLengthMm"]')).toBeDisabled();
  await expect(page.locator('[data-authoring-field="assemblyLengthMm"]')).toHaveValue('740');
  await expect(page.locator('[data-authoring-field="assemblyMassKg"]')).toHaveValue('179');

  const priorTransactionHash = await host.getAttribute(
    'data-topology-edit-authoring-transaction-hash',
  ) || '';
  await page.locator('[data-action="preview-authoring-operation"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-authoring-command-count', '3');
  await expect.poll(() => page.evaluate(() => (
    globalThis.__VALVE_ASSEMBLY_CONTROLLER__.viewportBackend.groups.ghostGroup.children.length
  ))).toBeGreaterThan(0);
  await page.locator('[data-action="validate-authoring-operation"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-authoring-phase', 'READY_TO_APPLY');
  await expect(host).toHaveAttribute('data-topology-edit-authoring-blocking-issue-count', '0');
  await page.locator('[data-action="apply-authoring-operation"]').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-authoring-transaction-hash'))
    .not.toBe(priorTransactionHash);

  const applied = await topologySnapshot(page);
  expect(applied.assembly).toHaveLength(3);
  expect(applied.roles).toEqual(['DOWNSTREAM_FLANGE', 'UPSTREAM_FLANGE', 'VALVE']);
  expect(applied.assembly.every((edge) => edge.assemblyLengthMm === 740)).toBe(true);
  expect(applied.assembly.every((edge) => edge.assemblyMassKg === 179)).toBe(true);
  expect(new Set(applied.assembly.map((edge) => edge.assemblyId)).size).toBe(1);
  expect(applied.faceMated).toBe(true);
  expect(applied.minimumEdgeLengthMm).toBeGreaterThan(0);

  const transactionHash = await host.getAttribute('data-topology-edit-authoring-transaction-hash');
  await page.locator('[data-action="undo"]').click();
  await expect.poll(() => controllerCanonicalHash(page)).toBe(initial.canonicalHash);
  expect((await topologySnapshot(page)).assembly).toHaveLength(0);
  await page.locator('[data-action="redo"]').click();
  await expect.poll(() => controllerCanonicalHash(page)).toBe(applied.canonicalHash);
  await expect(host).toHaveAttribute('data-topology-edit-authoring-transaction-hash', transactionHash);
  expect((await topologySnapshot(page)).faceMated).toBe(true);

  await assertBrowserDiagnostics(diagnostics);
  await testInfo.attach('topology-edit-valve-assembly-authoring', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

async function openProductionController(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await navigation.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.locator('[data-action="load-topology-edit-demo"]').click();
  await expect.poll(() => page.evaluate(() => (
    globalThis.AnalysisWorkspace?.getSnapshot?.()?.dataset?.entities?.length ?? 0
  ))).toBe(20);
  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => Boolean(
    document.querySelector('[data-role="topology-edit-render-host"]')
      ?.__topologyEditAuthoringController
      ?.professionalRuntime
      ?.catalogue
  ))).toBe(true);
  await page.evaluate(() => {
    const controller = document.querySelector('[data-role="topology-edit-render-host"]')
      ?.__topologyEditAuthoringController;
    if (!controller) throw new Error('Mounted production authoring controller is unavailable.');
    globalThis.__VALVE_ASSEMBLY_CONTROLLER__ = controller;
  });
  const panel = host.locator('details[data-panel-kind="authoring"]');
  if (!(await panel.evaluate((element) => element.open))) {
    await panel.locator(':scope > summary').click();
  }
  await expect(page.locator('[data-action="activate-authoring-valve-assembly"]')).toBeVisible();
  return host;
}

async function selectCanonicalEdgeFromTree(page, host, edgeId) {
  const panel = host.locator('details[data-panel-kind="topology-edit-object-tree"]');
  if (!(await panel.evaluate((element) => element.open))) {
    await panel.locator(':scope > summary').click();
  }
  const tree = panel.locator('[data-role="topology-edit-object-tree"]');
  const filter = tree.locator('[data-role="topology-edit-object-tree-filter"]');
  await filter.fill(edgeId);
  const row = tree.locator(`[data-canonical-id="${edgeId}"]`);
  await expect(row).toHaveCount(1);
  await row.locator('[data-object-tree-select]').click();
  await expect(host).toHaveAttribute('data-topology-edit-selection-primary-id', edgeId);
  await filter.fill('');
}

async function eligibleHostEdge(page, nominalSizeMm, outsideDiameterMm, assemblyLengthMm, componentKey) {
  return page.evaluate(({ nominal, outside, length, preferred }) => {
    const topology = globalThis.__VALVE_ASSEMBLY_CONTROLLER__.session.currentTopology();
    const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
    const dependentEdgeIds = new Set();
    for (const collection of ['junctions', 'supports', 'boundaries', 'rigids', 'bends']) {
      for (const record of topology[collection] ?? []) {
        if (record.edgeId) dependentEdgeIds.add(record.edgeId);
        for (const edgeId of record.edgeIds ?? []) dependentEdgeIds.add(edgeId);
      }
    }
    const matches = topology.edges.flatMap((edge) => {
      if (edge.componentKey !== preferred || dependentEdgeIds.has(edge.id)) return [];
      if (Math.abs(Number(edge.diameterMm) - nominal) > 1e-9) return [];
      if (Math.abs(Number(edge.outsideDiameterMm) - outside) > 1e-9) return [];
      const from = nodes.get(edge.fromNodeId)?.position;
      const to = nodes.get(edge.toNodeId)?.position;
      if (!from || !to) return [];
      const edgeLengthMm = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
      return edgeLengthMm > length + 2 ? [{ id: edge.id, lengthMm: edgeLengthMm }] : [];
    });
    if (matches.length !== 1) throw new Error(`Expected one eligible ${preferred} edge; received ${matches.length}.`);
    return matches[0];
  }, { nominal: nominalSizeMm, outside: outsideDiameterMm, length: assemblyLengthMm, preferred: componentKey });
}

async function controllerCanonicalHash(page) {
  return page.evaluate(() => (
    globalThis.__VALVE_ASSEMBLY_CONTROLLER__.session.currentTopology().canonicalTopologyHash
  ));
}

async function topologySnapshot(page) {
  return page.evaluate(() => {
    const controller = globalThis.__VALVE_ASSEMBLY_CONTROLLER__;
    const topology = controller.session.currentTopology();
    const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
    const assembly = topology.edges.filter((edge) => edge.assemblyId)
      .sort((left, right) => left.assemblyRole.localeCompare(right.assemblyRole));
    const byRole = new Map(assembly.map((edge) => [edge.assemblyRole, edge]));
    const upstream = byRole.get('UPSTREAM_FLANGE');
    const valve = byRole.get('VALVE');
    const downstream = byRole.get('DOWNSTREAM_FLANGE');
    const lengths = topology.edges.map((edge) => {
      const from = nodes.get(edge.fromNodeId).position;
      const to = nodes.get(edge.toNodeId).position;
      return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    });
    return {
      canonicalHash: topology.canonicalTopologyHash,
      journalHash: controller.session.journal.journalHash,
      activeCommandCount: controller.session.journal.activeCommandIds.length,
      assembly,
      roles: assembly.map((edge) => edge.assemblyRole),
      faceMated: Boolean(upstream && valve && downstream
        && upstream.toNodeId === valve.fromNodeId
        && downstream.fromNodeId === valve.toNodeId),
      minimumEdgeLengthMm: Math.min(...lengths),
    };
  });
}

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
    /ValveAssembly/iu,
  ].some((pattern) => pattern.test(message)))).toEqual([]);
}
