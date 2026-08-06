import { expect, test } from '@playwright/test';

const FLANGE_RECORD_ID = 'FLANGE-DN100-600-RF-B';
const REDUCER_RECORD_ID = 'REDUCER-DN150-DN100-CONC-A';

test.beforeEach(async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1680, height: 1100 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('production HUD authors a governed flange with preview, validation, undo, and redo', async ({ page }, testInfo) => {
  const diagnostics = collectBrowserDiagnostics(page);
  const host = await openProductionController(page);
  const initial = await topologySnapshot(page);
  const target = await eligibleHostEdge(page, 100, 114.3, 120);

  await selectCanonicalEdgeFromTree(page, host, target.id);
  await page.locator('[data-action="activate-authoring-flange"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-authoring-tool', 'FLANGE');
  await expect(host).toHaveAttribute('data-topology-edit-authoring-catalogue-option-count', '2');
  await page.locator('[data-authoring-field="catalogueRecordId"]')
    .selectOption(FLANGE_RECORD_ID);
  await expect(page.locator('[data-authoring-field="flangeType"]')).toBeDisabled();
  await expect(page.locator('[data-authoring-field="componentLengthMm"]')).toHaveValue('120');

  const applied = await previewValidateApply(page, host, 1);
  expect(applied.inserted).toMatchObject({
    entityType: 'FLANGE',
    catalogueRecordId: FLANGE_RECORD_ID,
    componentLengthMm: 120,
    componentMassKg: 29.5,
    flangeType: 'WELD_NECK',
    derivedFromEdgeId: target.id,
  });
  expect(applied.inserted.catalogueBinding.materialSpecification).toBe('ASTM A105');
  await verifyUndoRedo(page, host, initial, applied);
  await assertBrowserDiagnostics(diagnostics);
  await attachScreenshot(page, testInfo, 'topology-edit-flange-authoring');
});

test('production HUD authors a governed reducer with preview, validation, undo, and redo', async ({ page }, testInfo) => {
  const diagnostics = collectBrowserDiagnostics(page);
  const host = await openProductionController(page);
  const initial = await topologySnapshot(page);
  const target = await eligibleHostEdge(page, 150, 168.3, 300, 'P-003');

  await selectCanonicalEdgeFromTree(page, host, target.id);
  await page.locator('[data-action="activate-authoring-reducer"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-authoring-tool', 'REDUCER');
  await page.locator('[data-authoring-field="catalogueRecordId"]')
    .selectOption(REDUCER_RECORD_ID);
  await expect(page.locator('[data-authoring-field="inlineDirection"]')).toHaveValue('FROM_TO');
  await expect(page.locator('[data-authoring-field="fromNominalSizeMm"]')).toHaveValue('150');
  await expect(page.locator('[data-authoring-field="toNominalSizeMm"]')).toHaveValue('100');

  const applied = await previewValidateApply(page, host, 1);
  expect(applied.inserted).toMatchObject({
    entityType: 'REDUCER',
    catalogueRecordId: REDUCER_RECORD_ID,
    componentLengthMm: 300,
    componentMassKg: 11.8,
    reducerType: 'CONCENTRIC',
    insertionDirection: 'FROM_TO',
    derivedFromEdgeId: target.id,
  });
  expect(applied.inserted.catalogueBinding.secondaryNominalSizeMm).toBe(100);
  await verifyUndoRedo(page, host, initial, applied);
  await assertBrowserDiagnostics(diagnostics);
  await attachScreenshot(page, testInfo, 'topology-edit-reducer-authoring');
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
    globalThis.__COMPONENT_AUTHORING_CONTROLLER__ = controller;
  });
  const panel = host.locator('details[data-panel-kind="authoring"]');
  await expect(panel.locator(':scope > summary')).toContainText('Flange · Reducer');
  if (!(await panel.evaluate((element) => element.open))) {
    await panel.locator(':scope > summary').click();
  }
  await expect(page.locator('[data-role="topology-edit-authoring"]')).toBeVisible();
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
  await expect(host).toHaveAttribute('data-topology-edit-selection-source', 'tree');
  await filter.fill('');
}

async function eligibleHostEdge(
  page,
  nominalSizeMm,
  outsideDiameterMm,
  componentLengthMm,
  preferredComponentKey = null,
) {
  return page.evaluate(({ nominal, outside, length, preferred }) => {
    const topology = globalThis.__COMPONENT_AUTHORING_CONTROLLER__.session.currentTopology();
    const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
    const dependentEdgeIds = new Set();
    for (const collection of ['junctions', 'supports', 'boundaries', 'rigids', 'bends']) {
      for (const record of topology[collection] ?? []) {
        if (record.edgeId) dependentEdgeIds.add(record.edgeId);
        for (const edgeId of record.edgeIds ?? []) dependentEdgeIds.add(edgeId);
      }
    }
    const candidates = topology.edges.flatMap((edge) => {
      const type = String(edge.entityType ?? '').toUpperCase();
      if (!['PIPE', 'STRAIGHT', 'STRAIGHT_ELEMENT'].includes(type)) return [];
      if (dependentEdgeIds.has(edge.id)) return [];
      if (preferred && edge.componentKey !== preferred) return [];
      if (Math.abs(Number(edge.diameterMm) - nominal) > 1e-9) return [];
      if (Math.abs(Number(edge.outsideDiameterMm) - outside) > 1e-9) return [];
      const from = nodes.get(edge.fromNodeId)?.position;
      const to = nodes.get(edge.toNodeId)?.position;
      if (!from || !to) return [];
      const edgeLengthMm = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
      return edgeLengthMm > length + 2 ? [{ id: edge.id, lengthMm: edgeLengthMm }] : [];
    }).sort((left, right) => left.id.localeCompare(right.id));
    if (!candidates.length) {
      throw new Error(`No dependency-free DN${nominal} host edge accepts ${length} mm.`);
    }
    return candidates[0];
  }, {
    nominal: nominalSizeMm,
    outside: outsideDiameterMm,
    length: componentLengthMm,
    preferred: preferredComponentKey,
  });
}

async function previewValidateApply(page, host, commandCount) {
  const priorTransactionHash = await host.getAttribute(
    'data-topology-edit-authoring-transaction-hash',
  ) || '';
  await page.locator('[data-action="preview-authoring-operation"]').click();
  await expect(host).toHaveAttribute(
    'data-topology-edit-authoring-command-count',
    String(commandCount),
  );
  await expect.poll(() => page.evaluate(() => (
    globalThis.__COMPONENT_AUTHORING_CONTROLLER__.viewportBackend.groups.ghostGroup.children.length
  ))).toBeGreaterThan(0);
  await page.locator('[data-action="validate-authoring-operation"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-authoring-phase', 'READY_TO_APPLY');
  await expect(host).toHaveAttribute('data-topology-edit-authoring-blocking-issue-count', '0');
  await page.locator('[data-action="apply-authoring-operation"]').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-authoring-transaction-hash'))
    .not.toBe(priorTransactionHash);
  return topologySnapshot(page);
}

async function verifyUndoRedo(page, host, prior, applied) {
  const transactionHash = await host.getAttribute('data-topology-edit-authoring-transaction-hash');
  await page.locator('[data-action="undo"]').click();
  await expect.poll(() => controllerCanonicalHash(page)).toBe(prior.canonicalHash);
  expect((await topologySnapshot(page)).inserted).toBeNull();
  await page.locator('[data-action="redo"]').click();
  await expect.poll(() => controllerCanonicalHash(page)).toBe(applied.canonicalHash);
  await expect(host).toHaveAttribute('data-topology-edit-authoring-transaction-hash', transactionHash);
  expect((await topologySnapshot(page)).inserted?.catalogueRecordId)
    .toBe(applied.inserted.catalogueRecordId);
}

async function controllerCanonicalHash(page) {
  return page.evaluate(() => (
    globalThis.__COMPONENT_AUTHORING_CONTROLLER__.session.currentTopology().canonicalTopologyHash
  ));
}

async function topologySnapshot(page) {
  return page.evaluate(() => {
    const controller = globalThis.__COMPONENT_AUTHORING_CONTROLLER__;
    const topology = controller.session.currentTopology();
    const insertedRows = topology.edges.filter((edge) => (
      edge.topologyOperation === 'INSERT_INLINE_COMPONENT'
    ));
    if (insertedRows.length > 1) {
      throw new Error(`Expected at most one inserted component, received ${insertedRows.length}.`);
    }
    return {
      canonicalHash: topology.canonicalTopologyHash,
      journalHash: controller.session.journal.journalHash,
      activeCommandCount: controller.session.journal.activeCommandIds.length,
      nodeCount: topology.nodes.length,
      edgeCount: topology.edges.length,
      inserted: insertedRows[0] ?? null,
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
  expect(diagnostics.consoleErrors.filter(isCriticalConsoleError)).toEqual([]);
}

async function attachScreenshot(page, testInfo, name) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}

function isCriticalConsoleError(message) {
  return [
    /ReferenceError/iu,
    /Cannot access .* before initialization/iu,
    /does not provide an export named/iu,
    /Failed to fetch dynamically imported module/iu,
    /circular import/iu,
    /WebGL context lost/iu,
    /TopologyEditAuthoringInlineComponent/iu,
  ].some((pattern) => pattern.test(message));
}
