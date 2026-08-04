import { expect, test } from '@playwright/test';

const CONTROLLER_KEY = '__TOPOLOGY_EDIT_INLINE_INSERTION_CONTROLLER__';
const VALVE_RECORD_ID = 'VALVE-DN100-GATE-600-A';

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('exact valve insertion applies, renders, undoes, and redoes as one governed transaction', async ({ page }, testInfo) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const host = await openController(page);
  const canvasHost = host.locator('[data-role="topology-edit-canvas-mount"]');
  const panel = await openPanel(host, 'topology-edit-professional-operation');
  await expect(canvasHost.locator('canvas')).toHaveCount(1);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-valve-primitive-count',
  )).toBeGreaterThan(0);

  const initial = await topologySnapshot(page);
  const target = await eligibleHostEdge(page);
  const initialValveCount = await integerAttribute(
    canvasHost,
    'data-topology-edit-valve-primitive-count',
  );

  await panel.locator('[data-role="professional-operation-type"]')
    .selectOption('INSERT_INLINE_COMPONENT');
  await panel.locator('[data-role="professional-edge-id"]').fill(target.id);
  await panel.locator('[data-role="professional-center-distance-mm"]')
    .fill(String(target.lengthMm / 2));
  await panel.locator('[data-role="professional-insertion-length-mm"]').fill('');
  await panel.locator('[data-role="professional-inline-direction"]').selectOption('FROM_TO');
  await panel.locator('[data-role="professional-catalogue-record"]')
    .selectOption(VALVE_RECORD_ID);
  await panel.locator('[data-action="plan-professional-operation"]').click();

  await expect.poll(() => host.getAttribute(
    'data-topology-edit-professional-plan-hash',
  )).not.toBe('');
  await expect.poll(() => host.getAttribute(
    'data-topology-edit-professional-candidate-hash',
  )).not.toBe('');
  const candidateHash = await host.getAttribute(
    'data-topology-edit-professional-candidate-topology-hash',
  );
  expect(candidateHash).not.toBe(initial.canonicalHash);

  await panel.locator('[data-action="validate-professional-operation"]').click();
  await expect.poll(() => host.getAttribute(
    'data-topology-edit-professional-validation-hash',
  ), { timeout: 60_000 }).not.toBe('');
  await expect.poll(() => host.getAttribute(
    'data-topology-edit-professional-transaction-preview-hash',
  ), { timeout: 60_000 }).not.toBe('');

  await panel.locator('[data-action="apply-professional-operation"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-canonical-hash', candidateHash);
  await expect(host).toHaveAttribute(
    'data-topology-edit-active-command-count',
    String(initial.activeCommandCount + 1),
  );
  await expect.poll(() => host.getAttribute(
    'data-topology-edit-professional-transaction-hash',
  )).not.toBe('');
  const transactionHash = await host.getAttribute(
    'data-topology-edit-professional-transaction-hash',
  );

  const applied = await topologySnapshot(page);
  expect(applied.nodeCount).toBe(initial.nodeCount + 2);
  expect(applied.edgeCount).toBe(initial.edgeCount + 2);
  expect(applied.inserted).toMatchObject({
    entityType: 'VALVE',
    catalogueRecordId: VALVE_RECORD_ID,
    componentLengthMm: 600,
    valveFaceToFaceMm: 600,
    derivedFromEdgeId: target.id,
  });
  const catalogueHash = await host.getAttribute(
    'data-topology-edit-professional-catalogue-hash',
  );
  expect(applied.inserted.catalogueHash).toBe(catalogueHash);
  expect(applied.inserted.catalogueHash).toMatch(/^(?:fnv1a64|sha256):[0-9a-f]+$/u);
  expect(applied.inserted.catalogueRecordHash)
    .toMatch(/^(?:fnv1a64|sha256):[0-9a-f]+$/u);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-valve-primitive-count',
  )).toBeGreaterThan(initialValveCount);

  await panel.locator('[data-action="undo-professional-operation"]').click();
  await expect(host).toHaveAttribute(
    'data-topology-edit-canonical-hash',
    initial.canonicalHash,
  );
  await expect(host).toHaveAttribute(
    'data-topology-edit-active-command-count',
    String(initial.activeCommandCount),
  );
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-valve-primitive-count',
  )).toBe(initialValveCount);
  const undone = await topologySnapshot(page);
  expect(undone.nodeCount).toBe(initial.nodeCount);
  expect(undone.edgeCount).toBe(initial.edgeCount);
  expect(undone.inserted).toBeNull();

  await panel.locator('[data-action="redo-professional-operation"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-canonical-hash', candidateHash);
  await expect(host).toHaveAttribute(
    'data-topology-edit-professional-transaction-hash',
    transactionHash,
  );
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-valve-primitive-count',
  )).toBeGreaterThan(initialValveCount);
  const redone = await topologySnapshot(page);
  expect(redone.inserted?.catalogueRecordId).toBe(VALVE_RECORD_ID);
  expect(redone.canonicalHash).toBe(applied.canonicalHash);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter(isCriticalConsoleError)).toEqual([]);
  await testInfo.attach('inline-component-insertion', {
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
    if (prototype.__inlineInsertionActivateWrapped) return;
    const activate = prototype.activate;
    prototype.activate = async function inlineInsertionActivate(...args) {
      globalThis[key] = this;
      return activate.apply(this, args);
    };
    Object.defineProperty(prototype, '__inlineInsertionActivateWrapped', {
      value: true,
      configurable: true,
    });
  }, CONTROLLER_KEY);

  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible({ timeout: 60_000 });
  await expect(host).toHaveAttribute('data-topology-edit-clean-shell', 'true');
  await expect.poll(() => host.getAttribute(
    'data-topology-edit-professional-catalogue-hash',
  )).not.toBe('');
  return host;
}

async function eligibleHostEdge(page) {
  return page.evaluate((key) => {
    const topology = globalThis[key]?.session?.currentTopology?.();
    if (!topology) throw new Error('Canonical topology is unavailable.');
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
      if (Math.abs(Number(edge.diameterMm) - 100) > 1e-9) return [];
      if (Math.abs(Number(edge.outsideDiameterMm) - 114.3) > 1e-9) return [];
      const from = nodes.get(edge.fromNodeId)?.position;
      const to = nodes.get(edge.toNodeId)?.position;
      if (!from || !to) return [];
      const lengthMm = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
      return lengthMm > 600 ? [{ id: edge.id, lengthMm }] : [];
    }).sort((left, right) => left.id.localeCompare(right.id));
    if (!candidates.length) {
      throw new Error('No dependency-free DN100 straight host edge can accept a 600 mm valve.');
    }
    return candidates[0];
  }, CONTROLLER_KEY);
}

async function topologySnapshot(page) {
  return page.evaluate((key) => {
    const controller = globalThis[key];
    const topology = controller?.session?.currentTopology?.();
    if (!topology) throw new Error('Canonical topology is unavailable.');
    const insertedRows = topology.edges.filter((edge) => (
      edge.topologyOperation === 'INSERT_INLINE_COMPONENT'
    ));
    if (insertedRows.length > 1) {
      throw new Error(`Expected at most one inserted inline component, received ${insertedRows.length}.`);
    }
    return {
      canonicalHash: topology.canonicalTopologyHash,
      journalHash: controller.session.journal.journalHash,
      activeCommandCount: controller.session.journal.activeCommandIds.length,
      nodeCount: topology.nodes.length,
      edgeCount: topology.edges.length,
      inserted: insertedRows[0] ?? null,
    };
  }, CONTROLLER_KEY);
}

async function openPanel(host, kind) {
  const details = host.locator(`details[data-panel-kind="${kind}"]`);
  if (!(await details.evaluate((element) => element.open))) {
    await details.locator(':scope > summary').click();
  }
  return details.locator('[data-role="topology-edit-professional-operation"]');
}

async function integerAttribute(locator, name) {
  const value = await locator.getAttribute(name);
  return Number.parseInt(value || '0', 10) || 0;
}

function isCriticalConsoleError(message) {
  return [
    /ReferenceError/iu,
    /Cannot access .* before initialization/iu,
    /does not provide an export named/iu,
    /Failed to fetch dynamically imported module/iu,
    /circular import/iu,
    /WebGL context lost/iu,
    /TopologyEditInlineComponent/iu,
  ].some((pattern) => pattern.test(message));
}
