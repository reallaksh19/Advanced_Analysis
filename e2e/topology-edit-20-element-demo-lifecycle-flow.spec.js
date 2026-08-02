import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'advanced_topology_edit_draft_v2';
const REPORT_PATH = 'reports/qualification/topology-edit-demo-lifecycle.json';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript(() => {
    globalThis.localStorage?.clear();
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d';
  });
});

test('repaired demo saves, reloads, exports, commits, and reopens exactly', async ({ page }, testInfo) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const host = await openFreshDemo(page);
  const initialWorkspace = await workspaceEvidence(page);
  await repairAllFixtureDefects(page);
  const repaired = await evidence(host);
  expect(repaired.activeCommandCount).toBe(4);

  const selectedNodeId = await selectPort(page, 'P-004:port:start', false);
  await page.locator('[data-action="hide-selected"]').click();
  await expect(page.locator('[data-role="presentation-visibility-status"]'))
    .toHaveText('Hidden: 1');

  await page.locator('[data-action="save-draft"]').click();
  await expect(page.locator('[data-role="topology-edit-status"]'))
    .toContainText('Draft saved:');
  const saved = await persistedDraft(page);
  expect(saved.schema).toBe('TopologyEditDraftPackage.v2');
  expect(saved.authority.activeCanonicalTopologyHash).toBe(repaired.canonicalHash);
  expect(saved.journal.journalHash).toBe(repaired.journalHash);
  expect(saved.journal.activeCommandIds).toHaveLength(4);
  expect(saved.viewState.selection).toEqual({
    nodeIds: [selectedNodeId],
    edgeId: null,
  });
  await expect(host).toHaveAttribute(
    'data-topology-edit-draft-package-hash',
    saved.packageHash,
  );

  await page.locator('[data-action="clear-inspection"]').click();
  await page.locator('[data-action="show-all"]').click();
  await expect(page.locator('[data-action="hide-selected"]')).toBeDisabled();
  await expect(page.locator('[data-role="presentation-visibility-status"]'))
    .toHaveText('Visibility: all');

  await page.locator('[data-action="reload-draft"]').click();
  await expect(page.locator('[data-role="topology-edit-status"]'))
    .toContainText('Draft restored at session version');
  const restored = await evidence(host);
  expect(restored.canonicalHash).toBe(repaired.canonicalHash);
  expect(restored.journalHash).toBe(repaired.journalHash);
  expect(restored.activeCommandCount).toBe(4);
  await expect(page.locator(`[data-inspection-node="${selectedNodeId}"]`)).toBeVisible();
  await expect(page.locator('[data-action="hide-selected"]')).toBeEnabled();
  await expect(page.locator('[data-role="presentation-visibility-status"]'))
    .toHaveText('Hidden: 1');

  const firstExport = await exportAudit(page);
  const secondExport = await exportAudit(page);
  expect(secondExport.fileName).toBe(firstExport.fileName);
  expect(secondExport.text).toBe(firstExport.text);
  const audit = JSON.parse(firstExport.text);
  expect(audit.schema).toBe('TopologyEditAuditPackage.v2');
  expect(audit.summary.totalCommands).toBe(4);
  expect(audit.preparedExport.draftCanonicalTopologyHash).toBe(repaired.canonicalHash);
  expect(audit.preparedExport.journalHash).toBe(repaired.journalHash);
  expect(audit.preparedExport.stagedJson.journalProjection.activeCommandIds)
    .toHaveLength(4);
  await expect(host).toHaveAttribute('data-topology-edit-export-sealed-hash', audit.sealedHash);
  await attachScreenshot(page, testInfo, 'repaired-draft-restored-and-exported');

  const preCommit = await workspaceEvidence(page);
  await page.locator('[data-action="commit-draft"]').click();
  await expect(page.locator('[data-role="topology-edit-status"]'))
    .toContainText('Workspace commit verified at dataset version 1; persisted draft cleared');
  const postCommit = await workspaceEvidence(page);
  const committed = await evidence(host);

  expect(postCommit.snapshotVersion).toBeGreaterThan(preCommit.snapshotVersion);
  expect(postCommit.datasetVersion).toBe(1);
  expect(postCommit.entityCount).toBe(21);
  expect(postCommit.pipeCount).toBe(16);
  expect(postCommit.supportCount).toBe(5);
  expect(postCommit.sourceHash).toBe(initialWorkspace.sourceHash);
  expect(postCommit.calculationFreshness).toBe('STALE');
  expect(postCommit.editAudit.draftCanonicalTopologyHash).toBe(repaired.canonicalHash);
  expect(postCommit.editAudit.journalHash).toBe(repaired.journalHash);
  expect(postCommit.editAudit.preparedOutputHash)
    .toBe(audit.preparedExport.preparedOutputHash);
  expect(postCommit.flangeStart).toEqual({ x: 7510, y: 0, z: 1750 });
  expect(postCommit.syntheticPipeCount).toBe(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  expect(committed.activeCommandCount).toBe(0);
  expect(committed.commitDisposition).toBe('COMMITTED');
  expect(committed.commitReceiptHash).not.toBe('');
  expect(committed.draftPackageHash).toBe('');
  await expect(targetedSnapIssues(page)).toHaveCount(0);
  await expect(targetedOverlapIssue(page)).toHaveCount(0);
  await attachScreenshot(page, testInfo, 'workspace-commit-verified');

  await page.getByRole('button', { name: 'Dataset Table', exact: true }).click();
  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const reopenedHost = page.locator('[data-role="topology-edit-render-host"]');
  await expect(reopenedHost).toBeVisible();
  await expect(reopenedHost).toHaveAttribute('data-topology-edit-active-command-count', '0');
  await expect(targetedSnapIssues(page)).toHaveCount(0);
  await expect(targetedOverlapIssue(page)).toHaveCount(0);

  await selectPort(page, 'P-003:port:end', false);
  await selectPort(page, 'R-001:port:start', true);
  await page.locator('[data-action="build-route-trace"]').click();
  expect(await definitionValue(
    page.locator('[data-role="topology-edit-route-trace"]'),
    'Total length',
  )).toBe('250 mm');
  await attachScreenshot(page, testInfo, 'committed-workspace-reopened');

  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter(isCriticalConsoleError)).toEqual([]);

  const report = {
    schema: 'TopologyEditDemoLifecycleEvidence.v1',
    status: 'PASS_REPAIRED_DEMO_LIFECYCLE',
    candidateHead: process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || null,
    fixture: 'public/fixtures/topology-edit-20-element-demo.staged.json',
    activeCommandCount: 4,
    savedPackageHash: saved.packageHash,
    repairedCanonicalHash: repaired.canonicalHash,
    repairedJournalHash: repaired.journalHash,
    sealedHash: audit.sealedHash,
    preparedOutputHash: audit.preparedExport.preparedOutputHash,
    commitReceiptHash: committed.commitReceiptHash,
    committedDatasetVersion: postCommit.datasetVersion,
    committedEntityCount: postCommit.entityCount,
    persistedDraftCleared: true,
    reopenedRouteLengthMm: 250,
  };
  await mkdir('reports/qualification', { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
});

async function repairAllFixtureDefects(page) {
  await selectPort(page, 'P-001:port:end', false);
  await selectPort(page, 'E-001:port:start', true);
  await page.locator('[data-command-action="set-gap-3"]').click();
  const snap = page.locator('[data-issue-kind="SNAP_GAP"]').filter({ hasText: '3.00mm' });
  await snap.getByRole('button', { name: 'Preview MERGE_NODES' }).click();
  await page.locator('[data-action="accept-autofix"]').click();

  await selectPort(page, 'P-003:port:end', false);
  await selectPort(page, 'R-001:port:start', true);
  await page.locator('[data-command-action="bridge-gap"]').click();

  const overlap = targetedOverlapIssue(page);
  await overlap.getByRole('button', { name: 'Preview TRIM_EDGE' }).click();
  await page.locator('[data-action="accept-autofix"]').click();
  await expect(page.locator('[data-role="topology-edit-render-host"]'))
    .toHaveAttribute('data-topology-edit-active-command-count', '4');
}

async function openFreshDemo(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await navigation.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.locator('[data-action="load-topology-edit-demo"]').click();
  await expect.poll(() => page.evaluate(() => {
    const snapshot = globalThis.AnalysisWorkspace?.getSnapshot?.();
    return {
      status: snapshot?.status ?? null,
      count: snapshot?.dataset?.entities?.length ?? 0,
    };
  })).toEqual({ status: 'ready', count: 20 });
  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible();
  await expect(page.locator('[data-role="topology-edit-search-input"]')).toBeEnabled();
  return host;
}

async function selectPort(page, portKey, additive) {
  const input = page.locator('[data-role="topology-edit-search-input"]');
  await input.fill(portKey);
  const result = page.locator('[data-search-object-kind="node"]');
  await expect(result).toHaveCount(1);
  const canonicalId = await result.getAttribute('data-search-canonical-id');
  await result.click({ modifiers: additive ? ['Shift'] : [] });
  return canonicalId;
}

function targetedSnapIssues(page) {
  return page.locator('[data-issue-kind="SNAP_GAP"]').filter({
    hasText: /(?:3\.00|10\.00|20\.00)mm/,
  });
}

function targetedOverlapIssue(page) {
  return page.locator('[data-issue-kind="OVERLAPPING_ELEMENTS"]')
    .filter({ hasText: '150.00mm' });
}

async function persistedDraft(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
}

async function exportAudit(page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-action="export-draft"]').click(),
  ]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return {
    fileName: download.suggestedFilename(),
    text: Buffer.concat(chunks).toString('utf8'),
  };
}

async function workspaceEvidence(page) {
  return page.evaluate(() => {
    const snapshot = globalThis.AnalysisWorkspace?.getSnapshot?.();
    const dataset = snapshot?.dataset;
    const flange = dataset?.entities?.find((entity) => entity.entityId === 'F-001');
    const syntheticPipes = dataset?.entities?.filter((entity) => (
      entity.category === 'pipe'
      && entity.properties?.attributes?.TOPOLOGY_EDIT_SESSION_ID
      && !/^P-|^E-|^R-|^T-|^V-|^F-|^O-/u.test(entity.entityId)
    )) ?? [];
    return {
      snapshotVersion: Number(snapshot?.version ?? 0),
      datasetVersion: Number(dataset?.version ?? 0),
      entityCount: dataset?.entities?.length ?? 0,
      pipeCount: dataset?.summary?.pipes ?? 0,
      supportCount: dataset?.summary?.supports ?? 0,
      sourceHash: dataset?.sourceSnapshot?.sourceSemanticHash ?? null,
      calculationFreshness: dataset?.calculationFreshness ?? null,
      editAudit: dataset?.editAudit ?? null,
      flangeStart: flange?.properties?.geometry?.start ?? null,
      syntheticPipeCount: syntheticPipes.length,
    };
  });
}

async function evidence(host) {
  return host.evaluate((element) => ({
    canonicalHash: element.dataset.topologyEditCanonicalHash || '',
    journalHash: element.dataset.topologyEditJournalHash || '',
    activeCommandCount: Number(element.dataset.topologyEditActiveCommandCount || 0),
    draftPackageHash: element.dataset.topologyEditDraftPackageHash || '',
    exportSealedHash: element.dataset.topologyEditExportSealedHash || '',
    commitReceiptHash: element.dataset.topologyEditCommitReceiptHash || '',
    commitDisposition: element.dataset.topologyEditCommitDisposition || '',
  }));
}

async function definitionValue(root, label) {
  const term = root.locator('dt').filter({ hasText: new RegExp(`^${label}$`) });
  await expect(term).toHaveCount(1);
  return term.evaluate((element) => element.nextElementSibling?.textContent?.trim() || '');
}

async function attachScreenshot(page, testInfo, name) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}

function isCriticalConsoleError(message) {
  return [
    /ReferenceError/i,
    /Cannot access .* before initialization/i,
    /does not provide an export named/i,
    /Failed to fetch dynamically imported module/i,
    /circular import/i,
    /WebGL context lost/i,
  ].some((pattern) => pattern.test(message));
}
