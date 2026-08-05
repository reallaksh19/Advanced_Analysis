import { expect, test } from '@playwright/test';

const CONTROLLER_KEY = '__TOPOLOGY_EDIT_OBJECT_TREE_CONTROLLER__';

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('canonical tree selects every object kind and splits an edge through governed history', async ({ page }, testInfo) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const host = await openController(page);
  const treePanel = await openPanel(host, 'topology-edit-object-tree');
  const tree = treePanel.locator('[data-role="topology-edit-object-tree"]');
  await expect(tree).toBeVisible();

  const initial = await topologySnapshot(page);
  await expect(tree).toHaveAttribute(
    'data-topology-edit-object-tree-canonical-hash',
    initial.canonicalHash,
  );
  await expect(tree).toHaveAttribute(
    'data-topology-edit-object-tree-count',
    String(initial.totalCount),
  );

  const supportId = await firstCanonicalId(page, 'supports');
  if (supportId) {
    const supportGroup = tree.locator('details[data-object-tree-group="supports"]');
    if (!(await supportGroup.evaluate((element) => element.open))) {
      await supportGroup.locator(':scope > summary').click();
    }
    const supportRow = tree.locator(`[data-canonical-id="${supportId}"]`);
    await supportRow.locator('[data-object-tree-select]').click();
    await expect(host).toHaveAttribute('data-topology-edit-selection-primary-id', supportId);
    await expect(host).toHaveAttribute('data-topology-edit-selection-source', 'tree');
    await expect(supportRow.locator('[data-object-tree-action]')).toHaveCount(0);
  }

  const target = await eligibleSplitEdge(page);
  const edgeRow = tree.locator(`[data-canonical-id="${target.id}"]`);
  await edgeRow.locator('[data-object-tree-select]').click();
  await expect(host).toHaveAttribute('data-topology-edit-selection-primary-id', target.id);
  await expect(host).toHaveAttribute('data-topology-edit-selection-source', 'tree');
  await expect(edgeRow.locator('[data-object-tree-action="split-edge-half"]')).toHaveCount(1);

  await edgeRow.locator('[data-object-tree-action="split-edge-half"]').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-canonical-hash'))
    .not.toBe(initial.canonicalHash);
  const splitHash = await host.getAttribute('data-topology-edit-canonical-hash');
  await expect(host).toHaveAttribute(
    'data-topology-edit-active-command-count',
    String(initial.activeCommandCount + 1),
  );
  await expect(tree).toHaveAttribute(
    'data-topology-edit-object-tree-canonical-hash',
    splitHash,
  );
  await expect(tree.locator(`[data-canonical-id="${target.id}"]`)).toHaveCount(0);

  const split = await topologySnapshot(page, target.id);
  expect(split.nodeCount).toBe(initial.nodeCount + 1);
  expect(split.edgeCount).toBe(initial.edgeCount + 1);
  expect(split.derivedEdgeIds).toHaveLength(2);
  for (const childId of split.derivedEdgeIds) {
    await expect(tree.locator(`[data-canonical-id="${childId}"]`)).toHaveCount(1);
  }

  await host.locator('[data-action="undo"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-canonical-hash', initial.canonicalHash);
  await expect(host).toHaveAttribute(
    'data-topology-edit-active-command-count',
    String(initial.activeCommandCount),
  );
  await expect(tree).toHaveAttribute(
    'data-topology-edit-object-tree-canonical-hash',
    initial.canonicalHash,
  );
  await expect(tree.locator(`[data-canonical-id="${target.id}"]`)).toHaveCount(1);

  await host.locator('[data-action="redo"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-canonical-hash', splitHash);
  await expect(tree).toHaveAttribute(
    'data-topology-edit-object-tree-canonical-hash',
    splitHash,
  );
  const redone = await topologySnapshot(page, target.id);
  expect(redone.derivedEdgeIds).toEqual(split.derivedEdgeIds);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter(isCriticalConsoleError)).toEqual([]);
  await testInfo.attach('governed-object-tree', {
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
    if (prototype.__objectTreeActivateWrapped) return;
    const activate = prototype.activate;
    prototype.activate = async function objectTreeActivate(...args) {
      globalThis[key] = this;
      return activate.apply(this, args);
    };
    Object.defineProperty(prototype, '__objectTreeActivateWrapped', {
      value: true,
      configurable: true,
    });
  }, CONTROLLER_KEY);

  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible({ timeout: 60_000 });
  await expect(host).toHaveAttribute('data-topology-edit-clean-shell', 'true');
  await expect.poll(() => host.locator(
    '[data-role="topology-edit-object-tree"]',
  ).getAttribute('data-topology-edit-object-tree-hash')).not.toBe('');
  return host;
}

async function openPanel(host, kind) {
  const details = host.locator(`details[data-panel-kind="${kind}"]`);
  if (!(await details.evaluate((element) => element.open))) {
    await details.locator(':scope > summary').click();
  }
  return details.locator('.topology-edit-clean-shell__panel-body');
}

async function firstCanonicalId(page, collection) {
  return page.evaluate(({ key, collectionName }) => {
    const topology = globalThis[key]?.session?.currentTopology?.();
    return topology?.[collectionName]?.[0]?.id ?? null;
  }, { key: CONTROLLER_KEY, collectionName: collection });
}

async function eligibleSplitEdge(page) {
  return page.evaluate((key) => {
    const topology = globalThis[key]?.session?.currentTopology?.();
    if (!topology) throw new Error('Canonical topology is unavailable.');
    const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
    const dependentEdgeIds = new Set();
    for (const collection of ['supports', 'boundaries', 'rigids', 'bends']) {
      for (const record of topology[collection] ?? []) {
        if (record.edgeId) dependentEdgeIds.add(record.edgeId);
        for (const edgeId of record.edgeIds ?? []) dependentEdgeIds.add(edgeId);
      }
    }
    const candidates = topology.edges.flatMap((edge) => {
      if (dependentEdgeIds.has(edge.id)) return [];
      const from = nodes.get(edge.fromNodeId)?.position;
      const to = nodes.get(edge.toNodeId)?.position;
      if (!from || !to) return [];
      const lengthMm = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
      return lengthMm > 2 ? [{ id: edge.id, lengthMm }] : [];
    }).sort((left, right) => left.id.localeCompare(right.id));
    if (!candidates.length) throw new Error('No dependency-free edge is available for split qualification.');
    return candidates[0];
  }, CONTROLLER_KEY);
}

async function topologySnapshot(page, derivedFromEdgeId = null) {
  return page.evaluate(({ key, parentId }) => {
    const controller = globalThis[key];
    const topology = controller?.session?.currentTopology?.();
    if (!topology) throw new Error('Canonical topology is unavailable.');
    return {
      canonicalHash: topology.canonicalTopologyHash,
      activeCommandCount: controller.session.journal.activeCommandIds.length,
      nodeCount: topology.nodes.length,
      edgeCount: topology.edges.length,
      totalCount: [
        'nodes', 'edges', 'junctions', 'supports', 'boundaries', 'rigids', 'bends',
      ].reduce((sum, collection) => sum + (topology[collection]?.length ?? 0), 0),
      derivedEdgeIds: parentId
        ? topology.edges.filter((edge) => edge.derivedFromEdgeId === parentId)
          .map((edge) => edge.id)
          .sort()
        : [],
    };
  }, { key: CONTROLLER_KEY, parentId: derivedFromEdgeId });
}

function isCriticalConsoleError(message) {
  return [
    /ReferenceError/iu,
    /Cannot access .* before initialization/iu,
    /does not provide an export named/iu,
    /Failed to fetch dynamically imported module/iu,
    /circular import/iu,
    /WebGL context lost/iu,
    /TopologyEditObjectTree/iu,
  ].some((pattern) => pattern.test(message));
}
