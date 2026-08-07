import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const REPORT = 'reports/qualification/topology-edit-table-authority.json';

test('Table stays projection-only until certified pipe-length Apply', async ({ page }, testInfo) => {
  const pageErrors = []; const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.setViewportSize({ width: 1720, height: 1080 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
  const host = await openProductionController(page);
  const tablePanel = page.locator('details[data-panel-kind="table"]');
  await expect(tablePanel).toBeVisible();
  if (!(await tablePanel.evaluate((node) => node.open))) await tablePanel.locator(':scope > summary').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-table-projection-hash')).toBeTruthy();

  const before = await evidence(page);
  const projectionHash = await host.getAttribute('data-topology-edit-table-projection-hash');
  const table = page.locator('[data-role="topology-edit-table"]');
  const firstRow = table.locator('tbody tr').first();
  await expect(firstRow).toBeVisible();
  const firstCanonicalId = await firstRow.getAttribute('data-canonical-id');
  await firstRow.locator('[data-table-select]').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-selection-primary-id')).toBe(firstCanonicalId);

  await page.locator('[data-table-sort="elementType"]').click();
  const filter = page.locator('[data-table-filter]');
  await filter.fill('PIPE');
  await expect.poll(async () => Number(await host.getAttribute('data-topology-edit-table-visible-count'))).toBeGreaterThan(0);
  await tablePanel.locator(':scope > summary').click();
  await tablePanel.locator(':scope > summary').click();
  const afterPresentation = await evidence(page);
  expectAuthorityNoop(afterPresentation, before);
  expect(await host.getAttribute('data-topology-edit-table-projection-hash')).toBe(projectionHash);

  const editable = await chooseSafeTerminalPipe(page);
  await filter.fill(editable.tag);
  const row = table.locator(`[data-canonical-id="${editable.edgeId}"]`);
  await expect(row).toBeVisible();
  await row.locator('[data-table-select]').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-selection-primary-id')).toBe(editable.edgeId);
  await page.locator('[data-table-edit-length]').fill(String(editable.currentLengthMm - 120));
  await page.locator('[data-table-edit-anchor]').selectOption(editable.anchor);
  await page.locator('[data-table-edit-propagation]').selectOption(editable.propagation);
  await page.locator('[data-table-action="stage-pipe-length"]').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-table-batch-hash')).toBeTruthy();
  const staged = await evidence(page);
  expectAuthorityNoop(staged, before);

  await page.locator('[data-table-action="preview"]').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-table-preview-hash')).toBeTruthy();
  const preview = await evidence(page);
  expectAuthorityNoop(preview, before);
  expect(preview.ghostChildCount).toBeGreaterThan(0);

  await page.locator('[data-table-action="validate"]').click();
  await expect.poll(() => host.getAttribute('data-topology-edit-table-validation-hash')).toBeTruthy();
  const validationStatus = await host.getAttribute('data-topology-edit-table-validation-status');
  const blockerCodes = await host.getAttribute('data-topology-edit-table-validation-blockers');
  expect(validationStatus, `unexpected Table validation blockers: ${blockerCodes || '(none)'}`).toBe('READY_TO_APPLY');
  await expect(page.locator('[data-table-action="apply"]')).toBeEnabled();
  const validated = await evidence(page);
  expectAuthorityNoop(validated, before);

  await page.locator('[data-table-action="apply"]').click();
  await expect.poll(() => evidence(page).then((rowValue) => rowValue.canonicalHash)).not.toBe(before.canonicalHash);
  const applied = await evidence(page);
  expect(applied.activeCommandCount).toBeGreaterThan(before.activeCommandCount);
  expect(applied.rendererCount).toBe(1);
  expect(applied.sourceHash).toBe(before.sourceHash);

  await page.locator('[data-action="undo"]').click();
  await expect.poll(() => evidence(page).then((rowValue) => rowValue.canonicalHash)).toBe(before.canonicalHash);
  const undone = await evidence(page);
  expect(undone.journalHash).toBe(before.journalHash);
  expect(undone.activeLedgerHash).toBe(before.activeLedgerHash);
  expect(undone.rendererCount).toBe(1);

  await page.locator('[data-action="redo"]').click();
  await expect.poll(() => evidence(page).then((rowValue) => rowValue.canonicalHash)).toBe(applied.canonicalHash);
  const redone = await evidence(page);
  expect(redone.activeLedgerHash).toBe(applied.activeLedgerHash);
  expect(redone.rendererCount).toBe(1);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((message) => !message.includes('favicon'))).toEqual([]);
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach('topology-edit-table-canvas', { body: screenshot, contentType: 'image/png' });
  await mkdir('reports/qualification', { recursive: true });
  await writeFile(REPORT, `${JSON.stringify({
    schema: 'TopologyEditTableProductionAuthorityEvidence.v1',
    candidateHead: process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || null,
    status: 'PASS_TABLE_CANVAS_CERTIFIED_PIPE_LENGTH_LIFECYCLE',
    evidence: { editable, before, afterPresentation, staged, preview, validated, applied, undone, redone },
  }, null, 2)}\n`);
});

async function openProductionController(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await navigation.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.locator('[data-action="load-topology-edit-demo"]').click();
  await expect.poll(() => page.evaluate(() => globalThis.AnalysisWorkspace?.getSnapshot?.()?.dataset?.entities?.length ?? 0)).toBe(20);
  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(document.querySelector('[data-role="topology-edit-render-host"]')?.__topologyEditAuthoringController?.session))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(document.querySelector('[data-role="topology-edit-render-host"]')?.__topologyEditAuthoringController?.tableAdapter?.runtime))).toBe(true);
  return host;
}

async function chooseSafeTerminalPipe(page) {
  return page.evaluate(() => {
    const controller = document.querySelector('[data-role="topology-edit-render-host"]')?.__topologyEditAuthoringController;
    const topology = controller?.session?.currentTopology?.();
    const projection = controller?.tableAdapter?.runtime?.projection;
    const dataset = controller?.workspaceDataset;
    if (!topology || !projection || !dataset) throw new Error('Table production authority is unavailable.');
    const excludedComponents = new Set(['P-001', 'P-003', 'P-006']);
    for (const entity of dataset.entities ?? []) {
      const type = String(entity.entityType ?? entity.type ?? '').toUpperCase();
      if (!['REST', 'GUIDE', 'LINE_STOP', 'ANCHOR', 'SPRING', 'SUPPORT', 'RESTRAINT'].includes(type)) continue;
      const attributes = entity.properties?.sourceAttributes ?? entity.properties?.attributes ?? {};
      const attached = attributes.ATTACHED_COMPONENT_ID ?? attributes.SUPPORTED_COMPONENT_ID;
      if (attached) excludedComponents.add(String(attached));
    }
    const degree = new Map((topology.nodes ?? []).map((node) => [node.id, 0]));
    for (const edge of topology.edges ?? []) {
      degree.set(edge.fromNodeId, (degree.get(edge.fromNodeId) ?? 0) + 1);
      degree.set(edge.toNodeId, (degree.get(edge.toNodeId) ?? 0) + 1);
    }
    const candidates = (topology.edges ?? []).filter((edge) => (
      String(edge.entityType ?? '').toUpperCase() === 'PIPE'
      && !excludedComponents.has(String(edge.componentKey ?? '').replace(/^edge:/, ''))
    ));
    candidates.sort((left, right) => {
      if (left.componentKey === 'P-007') return -1;
      if (right.componentKey === 'P-007') return 1;
      return left.id.localeCompare(right.id);
    });
    for (const edge of candidates) {
      const row = projection.rows.find((candidate) => candidate.identity.canonicalId === edge.id);
      if (!row || !(row.fields.lengthMm > 240)) continue;
      if (degree.get(edge.toNodeId) === 1) return { edgeId: edge.id, tag: row.fields.tag, currentLengthMm: row.fields.lengthMm, anchor: 'FROM', propagation: 'DOWNSTREAM' };
      if (degree.get(edge.fromNodeId) === 1) return { edgeId: edge.id, tag: row.fields.tag, currentLengthMm: row.fields.lengthMm, anchor: 'TO', propagation: 'UPSTREAM' };
    }
    throw new Error('No safe graph-terminal canonical PIPE is available outside intentional defect/support zones.');
  });
}

async function evidence(page) {
  return page.evaluate(() => {
    const host = document.querySelector('[data-role="topology-edit-render-host"]');
    const controller = host?.__topologyEditAuthoringController;
    const session = controller?.session; const topology = session?.currentTopology?.(); const journal = session?.journal;
    return {
      canonicalHash: topology?.canonicalTopologyHash ?? null,
      journalHash: journal?.journalHash ?? null,
      activeLedgerHash: journal?.activeLedgerHash ?? null,
      sourceHash: controller?.workspaceDataset?.sourceSnapshot?.sourceSemanticHash ?? null,
      sourceByteHash: controller?.workspaceDataset?.sourceSnapshot?.sourceByteHash ?? null,
      activeCommandCount: journal?.activeCommandIds?.length ?? 0,
      rendererCount: controller?.viewportBackend?.renderer?.domElement ? 1 : 0,
      ghostChildCount: controller?.viewportBackend?.groups?.ghostGroup?.children?.length ?? 0,
      projectionHash: controller?.tableAdapter?.runtime?.projection?.projectionHash ?? null,
    };
  });
}
function expectAuthorityNoop(actual, expected) {
  expect(actual.canonicalHash).toBe(expected.canonicalHash);
  expect(actual.journalHash).toBe(expected.journalHash);
  expect(actual.activeLedgerHash).toBe(expected.activeLedgerHash);
  expect(actual.sourceHash).toBe(expected.sourceHash);
  expect(actual.sourceByteHash).toBe(expected.sourceByteHash);
  expect(actual.activeCommandCount).toBe(expected.activeCommandCount);
  expect(actual.rendererCount).toBe(expected.rendererCount);
}