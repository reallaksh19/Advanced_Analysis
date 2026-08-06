import { expect, test } from '@playwright/test';

const RECORD_ID = 'BLIND-FLANGE-DN50-150-RF-A';

test.beforeEach(async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1680, height: 1100 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('production HUD closes one graph-open pipe endpoint with an exact governed blind flange', async ({ page }, testInfo) => {
  const diagnostics = collectBrowserDiagnostics(page);
  const host = await openProductionController(page);
  const initial = await topologySnapshot(page);
  const target = await eligibleBlindFlangeEndpoint(page);

  await page.locator('[data-action="activate-authoring-blind-flange"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-authoring-tool', 'BLIND_FLANGE');
  await selectCanonicalNodeFromTree(page, host, target.nodeId);
  await expect(host).toHaveAttribute('data-topology-edit-authoring-catalogue-option-count', '1');

  const selector = page.locator('[data-authoring-field="catalogueRecordId"]');
  await expect(selector).toBeVisible();
  await selector.selectOption(RECORD_ID);
  await expect(selector).toHaveValue(RECORD_ID);
  for (const key of [
    'nominalSizeMm',
    'pressureClass',
    'facing',
    'thicknessMm',
    'componentMassKg',
  ]) {
    await expect(page.locator(`[data-authoring-field="${key}"]`)).toBeDisabled();
  }
  await expect(page.locator('[data-authoring-field="nominalSizeMm"]')).toHaveValue('50');
  await expect(page.locator('[data-authoring-field="pressureClass"]')).toHaveValue('150');
  await expect(page.locator('[data-authoring-field="facing"]')).toHaveValue('RF');
  await expect(page.locator('[data-authoring-field="thicknessMm"]')).toHaveValue('24');
  await expect(page.locator('[data-authoring-field="componentMassKg"]')).toHaveValue('5.6');
  await expect(host).toHaveAttribute('data-topology-edit-authoring-blind-flange-facing', 'RF');
  await expect(host).toHaveAttribute(
    'data-topology-edit-authoring-blind-flange-thickness-mm',
    '24',
  );

  const priorTransactionHash = await host.getAttribute(
    'data-topology-edit-authoring-transaction-hash',
  ) || '';
  await page.locator('[data-action="preview-authoring-operation"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-authoring-command-count', '1');
  await expect.poll(() => page.evaluate(() => (
    globalThis.__BLIND_FLANGE_CONTROLLER__.viewportBackend.groups.ghostGroup.children.length
  ))).toBeGreaterThan(0);
  await page.locator('[data-action="validate-authoring-operation"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-authoring-phase', 'READY_TO_APPLY');
  await expect(host).toHaveAttribute('data-topology-edit-authoring-blocking-issue-count', '0');
  await page.locator('[data-action="apply-authoring-operation"]').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-authoring-transaction-hash'))
    .not.toBe(priorTransactionHash);

  const applied = await topologySnapshot(page, target.nodeId);
  expect(applied.nodeCount).toBe(initial.nodeCount + 1);
  expect(applied.edgeCount).toBe(initial.edgeCount + 1);
  expect(applied.blindFlanges).toHaveLength(1);
  const blind = applied.blindFlanges[0];
  expect(blind).toMatchObject({
    entityType: 'FLANGE',
    flangeType: 'BLIND',
    catalogueRecordId: RECORD_ID,
    componentLengthMm: 24,
    componentMassKg: 5.6,
    flangeThicknessMm: 24,
    flangeOutsideDiameterMm: 165,
    boltCircleDiameterMm: 127,
    boltHoleCount: 4,
    boltHoleDiameterMm: 19.05,
    pressureClass: '150',
    pipingClass: 'DEMO-150',
  });
  expect(blind.inlinePlacement).toBe(target.placement);
  expect(blind.insertionDirection).toBe(target.direction);
  expect(blind.catalogueRecordHash).toBeTruthy();
  expect(blind.catalogueHash).toBeTruthy();
  expect(blind.catalogueSourceHash).toMatch(/^sha256:/u);
  expect(applied.terminalIncidentIds).toEqual([blind.id]);
  if (target.placement === 'FROM_BOUNDARY') {
    expect(blind.endConnectionFrom).toBe('CLOSED_RF');
    expect(blind.endConnectionTo).toBe('PIPE_TERMINAL');
  } else {
    expect(blind.endConnectionFrom).toBe('PIPE_TERMINAL');
    expect(blind.endConnectionTo).toBe('CLOSED_RF');
  }
  expect(applied.minimumEdgeLengthMm).toBeGreaterThan(0);

  const transactionHash = await host.getAttribute('data-topology-edit-authoring-transaction-hash');
  await page.locator('[data-action="undo"]').click();
  await expect.poll(() => controllerCanonicalHash(page)).toBe(initial.canonicalHash);
  expect((await topologySnapshot(page)).blindFlanges).toHaveLength(0);
  await page.locator('[data-action="redo"]').click();
  await expect.poll(() => controllerCanonicalHash(page)).toBe(applied.canonicalHash);
  await expect(host).toHaveAttribute(
    'data-topology-edit-authoring-transaction-hash',
    transactionHash,
  );
  expect((await topologySnapshot(page, target.nodeId)).terminalIncidentIds)
    .toEqual([blind.id]);

  await assertBrowserDiagnostics(diagnostics);
  await testInfo.attach('topology-edit-blind-flange-authoring', {
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
    globalThis.__BLIND_FLANGE_CONTROLLER__ = controller;
  });
  const panel = host.locator('details[data-panel-kind="authoring"]');
  await expect(panel.locator(':scope > summary')).toContainText('Blind flange');
  if (!(await panel.evaluate((element) => element.open))) {
    await panel.locator(':scope > summary').click();
  }
  await expect(page.locator('[data-action="activate-authoring-blind-flange"]')).toBeVisible();
  return host;
}

async function selectCanonicalNodeFromTree(page, host, nodeId) {
  const panel = host.locator('details[data-panel-kind="topology-edit-object-tree"]');
  if (!(await panel.evaluate((element) => element.open))) {
    await panel.locator(':scope > summary').click();
  }
  const tree = panel.locator('[data-role="topology-edit-object-tree"]');
  const filter = tree.locator('[data-role="topology-edit-object-tree-filter"]');
  await filter.fill(nodeId);
  const row = tree.locator(`[data-canonical-id="${nodeId}"]`);
  await expect(row).toHaveCount(1);
  await row.locator('[data-object-tree-select]').click();
  await expect(host).toHaveAttribute('data-topology-edit-selection-primary-id', nodeId);
  await expect(host).toHaveAttribute('data-topology-edit-selection-source', 'tree');
  await filter.fill('');
}

async function eligibleBlindFlangeEndpoint(page) {
  return page.evaluate(() => {
    const topology = globalThis.__BLIND_FLANGE_CONTROLLER__.session.currentTopology();
    const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
    const degrees = new Map(topology.nodes.map((node) => [node.id, 0]));
    topology.edges.forEach((edge) => {
      degrees.set(edge.fromNodeId, (degrees.get(edge.fromNodeId) ?? 0) + 1);
      degrees.set(edge.toNodeId, (degrees.get(edge.toNodeId) ?? 0) + 1);
    });
    const dependentEdgeIds = new Set();
    const dependentNodeIds = new Set();
    for (const collection of ['junctions', 'supports', 'boundaries', 'rigids', 'bends']) {
      for (const record of topology[collection] ?? []) {
        if (record.edgeId) dependentEdgeIds.add(record.edgeId);
        for (const edgeId of record.edgeIds ?? []) dependentEdgeIds.add(edgeId);
        for (const key of ['nodeId', 'fromNodeId', 'toNodeId']) {
          if (record[key]) dependentNodeIds.add(record[key]);
        }
        for (const key of ['nodeIds', 'fromNodeIds', 'toNodeIds']) {
          for (const nodeId of record[key] ?? []) dependentNodeIds.add(nodeId);
        }
      }
    }
    const candidates = topology.edges.flatMap((edge) => {
      const type = String(edge.entityType ?? '').toUpperCase();
      if (!['PIPE', 'STRAIGHT', 'STRAIGHT_ELEMENT'].includes(type)) return [];
      if (Number(edge.diameterMm) !== 50 || Number(edge.outsideDiameterMm) !== 60.3) return [];
      if (String(edge.pipingClass ?? '').toUpperCase() !== 'DEMO-150') return [];
      if (dependentEdgeIds.has(edge.id)) return [];
      const from = nodes.get(edge.fromNodeId);
      const to = nodes.get(edge.toNodeId);
      const lengthMm = Math.hypot(
        to.position.x - from.position.x,
        to.position.y - from.position.y,
        to.position.z - from.position.z,
      );
      if (!(lengthMm > 24)) return [];
      const endpoints = [
        {
          nodeId: edge.fromNodeId,
          placement: 'FROM_BOUNDARY',
          direction: 'TO_FROM',
        },
        {
          nodeId: edge.toNodeId,
          placement: 'TO_BOUNDARY',
          direction: 'FROM_TO',
        },
      ];
      return endpoints.filter((row) => (
        degrees.get(row.nodeId) === 1 && !dependentNodeIds.has(row.nodeId)
      )).map((row) => ({ ...row, edgeId: edge.id, lengthMm }));
    }).sort((left, right) => (
      right.lengthMm - left.lengthMm
      || left.nodeId.localeCompare(right.nodeId)
    ));
    if (!candidates.length) {
      throw new Error('No dependency-free graph-open DN50 endpoint is available.');
    }
    return candidates[0];
  });
}

async function topologySnapshot(page, terminalNodeId = null) {
  return page.evaluate((selectedTerminalNodeId) => {
    const controller = globalThis.__BLIND_FLANGE_CONTROLLER__;
    const topology = controller.session.currentTopology();
    const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
    const blindFlanges = topology.edges.filter((edge) => (
      edge.entityType === 'FLANGE' && edge.flangeType === 'BLIND'
    ));
    const lengths = topology.edges.map((edge) => {
      const from = nodes.get(edge.fromNodeId);
      const to = nodes.get(edge.toNodeId);
      return Math.hypot(
        to.position.x - from.position.x,
        to.position.y - from.position.y,
        to.position.z - from.position.z,
      );
    });
    const terminalIncidentIds = selectedTerminalNodeId
      ? topology.edges.filter((edge) => (
        edge.fromNodeId === selectedTerminalNodeId
        || edge.toNodeId === selectedTerminalNodeId
      )).map((edge) => edge.id).sort()
      : [];
    return {
      canonicalHash: topology.canonicalTopologyHash,
      journalHash: controller.session.journal.journalHash,
      nodeCount: topology.nodes.length,
      edgeCount: topology.edges.length,
      blindFlanges,
      terminalIncidentIds,
      minimumEdgeLengthMm: lengths.length ? Math.min(...lengths) : 0,
    };
  }, terminalNodeId);
}

async function controllerCanonicalHash(page) {
  return page.evaluate(() => (
    globalThis.__BLIND_FLANGE_CONTROLLER__.session.currentTopology().canonicalTopologyHash
  ));
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
  expect(diagnostics.consoleErrors.filter((message) => (
    !message.includes('favicon') && !message.includes('net::ERR_ABORTED')
  ))).toEqual([]);
}
