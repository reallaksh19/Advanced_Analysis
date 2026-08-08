import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const REPORT_DIR = 'reports/qualification';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1720, height: 1080 });
});

test('3D Demo is reachable through visible production controls only', async ({ page }, testInfo) => {
  const diagnostics = collectDiagnostics(page);
  const host = await openDataset(page, '3d-demo');
  const baseline = await visibleEvidence(host);
  await expect(host.locator('canvas')).toBeVisible();
  await expectEndpoint(page, 'P-001, TO');

  await page.getByRole('button', { name: 'P-001, TO', exact: true }).click();
  await page.keyboard.press('PageUp');
  await expect(host).toHaveAttribute('data-topology-edit-interaction-preview-hash', /.+/);
  const preview = await visibleEvidence(host);
  expect(preview.canonicalHash).toBe(baseline.canonicalHash);
  expect(preview.journalHash).toBe(baseline.journalHash);

  await page.keyboard.press('Enter');
  await expect(page.locator('[data-role="topology-edit-status"]'))
    .toContainText('MOVE_NODE accepted from exact preview');
  const moved = await visibleEvidence(host);
  expect(moved.canonicalHash).not.toBe(baseline.canonicalHash);
  expect(moved.activeCommandCount).toBe(1);

  await page.locator('[data-action="undo"]').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-canonical-hash'))
    .toBe(baseline.canonicalHash);
  await page.locator('[data-action="redo"]').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-canonical-hash'))
    .toBe(moved.canonicalHash);

  await selectObjectTreeItem(page, 'P-003', 'EDGE');
  const split = page.locator('[data-command-action="split-edge-half"]');
  await expect(split).toHaveAttribute('data-capability-status', 'AVAILABLE');
  await split.click();
  const splitState = await visibleEvidence(host);
  expect(splitState.activeCommandCount).toBe(2);

  await page.getByRole('button', { name: 'P-001, TO', exact: true }).click();
  await page.getByRole('button', { name: 'E-001, FROM', exact: true })
    .click({ modifiers: ['Shift'] });
  const exactGap = page.locator('[data-command-action="set-gap-3"]');
  await expect(exactGap).toHaveAttribute('data-capability-status', 'AVAILABLE');
  await exactGap.click();
  const twoEndpointState = await visibleEvidence(host);
  expect(twoEndpointState.activeCommandCount).toBe(3);

  await page.locator('[data-action="save-draft"]').click();
  await expect(page.locator('[data-role="topology-edit-status"]')).toContainText('Draft saved:');
  const saved = await visibleEvidence(host);
  await page.locator('[data-action="reload-draft"]').click();
  await expect(page.locator('[data-role="topology-edit-status"]'))
    .toContainText('Draft restored at session version');
  const restored = await visibleEvidence(host);
  expect(restored.canonicalHash).toBe(saved.canonicalHash);
  expect(restored.journalHash).toBe(saved.journalHash);

  await attachScreenshot(page, testInfo, 'real-user-3d-demo');
  await assertDiagnostics(diagnostics);
  await writeEvidence('topology-edit-real-user-3d-demo.json', {
    schema: 'TopologyEditRealUserReachability.v1',
    status: 'PASS_3D_DEMO_VISIBLE_USER',
    candidateHead: process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || null,
    backend: 'PRODUCTION_WEBGL',
    fixture: 'public/fixtures/topology-edit-20-element-demo.staged.json',
    baseline,
    preview,
    moved,
    splitState,
    twoEndpointState,
    saved,
    restored,
    diagnostics,
  });
});

test('XYZ Branch exposes truthful catalogue, endpoint and Table capability paths', async ({ page }, testInfo) => {
  const diagnostics = collectDiagnostics(page);
  const host = await openDataset(page, 'xyz');
  const baseline = await visibleEvidence(host);
  await expect(host.locator('canvas')).toBeVisible();

  for (const [tag, kind] of [
    ['S-006', 'SUPPORT'],
    ['S-007', 'SUPPORT'],
    ['V-002', 'EDGE'],
    ['F-002', 'EDGE'],
    ['R-002', 'EDGE'],
    ['O-002', 'JUNCTION'],
    ['P-012', 'EDGE'],
  ]) await selectObjectTreeItem(page, tag, kind);

  await selectObjectTreeItem(page, 'P-011', 'EDGE');
  await page.locator('[data-role="professional-operation-type"]')
    .selectOption('INSERT_INLINE_COMPONENT');
  await page.locator('[data-role="professional-center-distance-mm"]').fill('400');
  await page.locator('[data-role="professional-center-distance-mm"]').press('Tab');
  await page.locator('[data-role="professional-catalogue-record"]')
    .selectOption('VALVE-DN25-BALL-150-XYZ-B');
  await expect(page.locator('[data-role="topology-edit-professional-capability"]'))
    .toHaveAttribute('data-capability-status', 'AVAILABLE');
  await page.locator('[data-action="plan-professional-operation"]').click();
  await expect(page.locator('[data-action="validate-professional-operation"]')).toBeEnabled();
  await page.locator('[data-action="validate-professional-operation"]').click();
  await expect(page.locator('[data-action="apply-professional-operation"]')).toBeEnabled();
  await page.locator('[data-action="apply-professional-operation"]').click();
  const catalogueApplied = await visibleEvidence(host);
  expect(catalogueApplied.canonicalHash).not.toBe(baseline.canonicalHash);

  await expectEndpoint(page, 'P-012, TO');
  await page.getByRole('button', { name: 'P-012, TO', exact: true }).click();
  await page.keyboard.press('PageUp');
  await expect(host).toHaveAttribute('data-topology-edit-interaction-preview-hash', /.+/);
  await page.keyboard.press('Enter');
  const nudgeApplied = await visibleEvidence(host);
  expect(nudgeApplied.canonicalHash).not.toBe(catalogueApplied.canonicalHash);

  await openTable(page);
  await selectTableRow(page, 'E-003');
  await expect(page.locator('[data-table-capability-reason="TABLE_INTENT_NOT_CERTIFIED"]'))
    .toHaveCount(await countAtLeastOne(page, '[data-table-capability-reason="TABLE_INTENT_NOT_CERTIFIED"]'));
  await selectTableRow(page, 'S-006');
  await expect(page.locator('[data-table-capability-reason="SUPPORT_EDIT_NOT_CERTIFIED"]'))
    .toBeVisible();

  await selectTableRow(page, 'P-012');
  const length = page.locator('[data-table-edit-length]');
  await expect(length).toBeVisible();
  const currentLength = Number(await length.inputValue());
  await length.fill(String(currentLength - 50));
  await page.locator('[data-table-edit-anchor]').selectOption('FROM');
  await page.locator('[data-table-edit-propagation]').selectOption('DOWNSTREAM');
  await page.locator('[data-table-action="stage-pipe-length"]').click();
  await page.locator('[data-table-action="preview"]').click();
  await page.locator('[data-table-action="validate"]').click();
  await expect(page.locator('[data-table-action="apply"]')).toBeEnabled();
  const selectedBeforeApply = await host.getAttribute('data-topology-edit-selection-primary-id');
  await page.locator('[data-table-action="apply"]').click();
  const tableApplied = await visibleEvidence(host);
  expect(tableApplied.canonicalHash).not.toBe(nudgeApplied.canonicalHash);

  await page.locator('[data-action="undo"]').click();
  await page.locator('[data-action="redo"]').click();
  await expect(host).toHaveAttribute(
    'data-topology-edit-selection-primary-id',
    selectedBeforeApply || '',
  );
  const finalState = await visibleEvidence(host);
  expect(finalState.sourceHash).toBe(baseline.sourceHash);

  await attachScreenshot(page, testInfo, 'real-user-xyz-table');
  await assertDiagnostics(diagnostics);
  await writeEvidence('topology-edit-real-user-xyz.json', {
    schema: 'TopologyEditRealUserReachability.v1',
    status: 'PASS_XYZ_VISIBLE_USER',
    candidateHead: process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || null,
    backend: 'PRODUCTION_WEBGL',
    fixture: 'public/fixtures/topology-edit-20-element-demo.staged.json#XYZ-10-COMPONENT-BRANCH',
    baseline,
    catalogueApplied,
    nudgeApplied,
    tableApplied,
    finalState,
    diagnostics,
  });
});

async function openDataset(page, kind) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await navigation.getByRole('button', { name: 'Workspace', exact: true }).click();
  const action = kind === 'xyz'
    ? 'load-topology-edit-xyz-branch-demo'
    : 'load-topology-edit-demo';
  await page.locator(`[data-action="${action}"]`).click();
  await expect(page.locator('[data-role="summary-pipes"]'))
    .toContainText(kind === 'xyz' ? '25' : '15');
  await expect(page.locator('[data-role="summary-supports"]'))
    .toContainText(kind === 'xyz' ? '7' : '5');
  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible();
  await expect.poll(() => host.getAttribute('data-topology-edit-canonical-hash')).toBeTruthy();
  await expect.poll(() => Number(host.getAttribute('data-topology-edit-visible-endpoint-count')))
    .toBeGreaterThan(0);
  return host;
}

async function expectEndpoint(page, label) {
  await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
}

async function selectObjectTreeItem(page, tag, kind) {
  const panel = page.locator('details[data-panel-kind="topology-edit-object-tree"]');
  if ((await panel.getAttribute('open')) === null) await panel.locator(':scope > summary').click();
  const filter = page.locator('[data-role="topology-edit-object-tree-filter"]');
  await filter.fill(tag);
  const row = page.locator(`[data-object-kind="${kind}"]`).filter({ hasText: tag }).first();
  await expect(row).toBeVisible();
  await row.locator('[data-object-tree-select]').click();
}

async function openTable(page) {
  const panel = page.locator('details[data-panel-kind="table"]');
  await expect(panel).toBeVisible();
  if ((await panel.getAttribute('open')) === null) await panel.locator(':scope > summary').click();
  await expect(page.locator('[data-role="topology-edit-table"]')).toBeVisible();
}

async function selectTableRow(page, tag) {
  const filter = page.locator('[data-table-filter]');
  await filter.fill(tag);
  const row = page.locator('[data-role="topology-edit-table"] tbody tr').filter({ hasText: tag }).first();
  await expect(row).toBeVisible();
  await row.locator('[data-table-select]').click();
}

async function countAtLeastOne(page, selector) {
  await expect.poll(() => page.locator(selector).count()).toBeGreaterThan(0);
  return page.locator(selector).count();
}

async function visibleEvidence(host) {
  return {
    canonicalHash: await host.getAttribute('data-topology-edit-canonical-hash'),
    sourceHash: await host.getAttribute('data-topology-edit-source-hash'),
    journalHash: await host.getAttribute('data-topology-edit-journal-hash'),
    sessionVersion: Number(await host.getAttribute('data-topology-edit-session-version') || 0),
    activeCommandCount: Number(await host.getAttribute('data-topology-edit-active-command-count') || 0),
    capabilityStatus: await host.getAttribute('data-topology-edit-professional-capability-status'),
    capabilityReason: await host.getAttribute('data-topology-edit-professional-capability-reason'),
  };
}

function collectDiagnostics(page) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

async function assertDiagnostics(diagnostics) {
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleErrors.filter((message) => !message.includes('favicon'))).toEqual([]);
}

async function attachScreenshot(page, testInfo, name) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}

async function writeEvidence(fileName, evidence) {
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(`${REPORT_DIR}/${fileName}`, `${JSON.stringify(evidence, null, 2)}\n`);
}
