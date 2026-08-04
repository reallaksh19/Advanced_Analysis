import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const CONTROLLER_KEY = '__TOPOLOGY_EDIT_SELECTION_FOUNDATION_CONTROLLER__';
const REPORT_PATH = 'reports/qualification/topology-edit-selection-foundation.json';
const evidence = {
  schema: 'TopologyEditSelectionFoundationQualification.v1',
  candidateHead: process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || process.env.GITHUB_SHA || null,
  fixture: 'public/fixtures/topology-edit-20-element-demo.staged.json',
  backend: 'TopologyEditNavigationHudViewportBackend',
  selection: { viewport: 'NOT_RUN', tree: 'NOT_RUN', search: 'NOT_RUN', hud: 'NOT_RUN' },
  modifiers: 'NOT_RUN',
  datasetReset: 'NOT_RUN',
  rejectedActionIds: [],
};

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await mkdir('reports/qualification', { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('tree, search, HUD, and real WebGL share one canonical selection authority', async ({ page }) => {
  const host = await openProductionController(page);

  const firstTreeRow = treeEntity(page, 'P-001');
  await expect(firstTreeRow).toBeVisible();
  await firstTreeRow.click();
  await expect(host).toHaveAttribute('data-topology-edit-selection-source', 'tree');
  await expect(host).toHaveAttribute('data-topology-edit-selection-ids', 'edge:P-001');
  await expect(firstTreeRow).toHaveAttribute('aria-selected', 'true');
  await openPanel(host, 'topology-edit-professional-operation');
  await expect(page.locator('[data-role="professional-edge-id"]')).toHaveValue('edge:P-001');

  await selectBySearch(page, host, 'edge:P-003', true);
  await expect(host).toHaveAttribute(
    'data-topology-edit-selection-ids',
    'edge:P-001,edge:P-003',
  );
  await expect(host).toHaveAttribute('data-topology-edit-selection-source', 'search');
  await expect(treeEntity(page, 'P-001')).toHaveAttribute('aria-selected', 'true');
  await expect(treeEntity(page, 'P-003')).toHaveAttribute('aria-selected', 'true');

  await selectBySearch(page, host, 'edge:P-004');
  await expect(host).toHaveAttribute('data-topology-edit-selection-ids', 'edge:P-004');
  await expect(page.locator('[data-role="professional-edge-id"]')).toHaveValue('edge:P-004');

  const viewportTarget = await visiblePickPoint(page, 'edge:P-004');
  await page.mouse.click(viewportTarget.x, viewportTarget.y);
  await expect(host).toHaveAttribute('data-topology-edit-selection-source', 'viewport');
  await expect(host).toHaveAttribute('data-topology-edit-selection-ids', 'edge:P-004');
  await expect(page.locator('[data-role="professional-edge-id"]')).toHaveValue('edge:P-004');
  await expect(treeEntity(page, 'P-004')).toHaveAttribute('aria-selected', 'true');
  evidence.selection = { viewport: 'PASS', tree: 'PASS', search: 'PASS', hud: 'PASS' };
});

test('tree modifier selection is deterministic and dataset replacement clears it', async ({ page }) => {
  const host = await openProductionController(page);
  const rows = page.locator(
    '[data-role="tree-list"] [data-action="select-entity"]',
  );
  await expect.poll(() => rows.count()).toBeGreaterThan(3);

  await rows.nth(0).click();
  const revisionBefore = Number(
    await host.getAttribute('data-topology-edit-selection-revision'),
  );
  await rows.nth(3).click({ modifiers: ['Shift'] });
  const selectedIds = selectionIds(await host.getAttribute(
    'data-topology-edit-selection-ids',
  ));
  const sorted = [...selectedIds].sort((left, right) => left.localeCompare(right));
  expect(selectedIds).toEqual(sorted);
  expect(selectedIds.length).toBeGreaterThan(2);
  expect(Number(await host.getAttribute('data-topology-edit-selection-revision')))
    .toBe(revisionBefore + 1);

  await rows.nth(1).click({ modifiers: ['Control'] });
  const toggledIds = selectionIds(await host.getAttribute(
    'data-topology-edit-selection-ids',
  ));
  expect(toggledIds).toHaveLength(selectedIds.length - 1);

  await page.locator('[data-action="load-topology-edit-demo"]').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-selection-ids')).toBe('');
  evidence.modifiers = 'PASS';
  evidence.datasetReset = 'PASS';
});

async function openProductionController(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Application views' })
    .getByRole('button', { name: 'Workspace', exact: true }).click();
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
    if (prototype.__selectionFoundationActivateWrapped) return;
    const activate = prototype.activate;
    prototype.activate = async function selectionFoundationActivate(...args) {
      globalThis[key] = this;
      return activate.apply(this, args);
    };
    Object.defineProperty(prototype, '__selectionFoundationActivateWrapped', {
      value: true,
      configurable: true,
    });
  }, CONTROLLER_KEY);

  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute('data-topology-edit-clean-shell', 'true');
  await expect(host).toHaveAttribute('data-topology-edit-selection-revision', '0');
  return host;
}

async function openPanel(host, kind) {
  const panel = host.locator(`details[data-panel-kind="${kind}"]`);
  if (!(await panel.evaluate((element) => element.open))) {
    await panel.locator(':scope > summary').click();
  }
  return panel;
}

async function selectBySearch(page, host, canonicalId, additive = false) {
  await openPanel(host, 'topology-edit-canonical-search');
  const input = page.locator('[data-role="topology-edit-search-input"]');
  await input.fill(canonicalId);
  const result = page.locator(`[data-search-canonical-id="${canonicalId}"]`);
  await expect(result).toHaveCount(1);
  await result.click({ modifiers: additive ? ['Shift'] : [] });
}

function treeEntity(page, entityId) {
  return page.locator(
    `[data-role="tree-list"] [data-entity-id="${entityId}"][data-action="select-entity"]`,
  );
}

function selectionIds(value) {
  return String(value || '').split(',').filter(Boolean);
}

async function visiblePickPoint(page, canonicalId) {
  return page.evaluate(({ key, id }) => {
    const backend = globalThis[key]?.viewportBackend;
    const canvas = backend?.renderer?.domElement;
    if (!backend || !canvas) throw new Error('Selection viewport is unavailable.');
    const rect = canvas.getBoundingClientRect();
    for (let y = rect.top + 2; y < rect.bottom; y += 3) {
      for (let x = rect.left + 2; x < rect.right; x += 3) {
        const context = backend.pickContext(x, y);
        const pick = context ? backend.pickWithRaycaster(context.pointer) : null;
        if (pick?.objectId === id) return { x, y };
      }
    }
    throw new Error(`No visible pick point was found for ${id}.`);
  }, { key: CONTROLLER_KEY, id: canonicalId });
}
