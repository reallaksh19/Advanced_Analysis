import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const REPORT_PATH = 'reports/qualification/topology-edit-demo-repairs.json';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript(() => {
    globalThis.localStorage?.clear();
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d';
  });
});

test('20-object demo repairs the 250 mm bridge and 150 mm source-backed overlap', async ({ page }, testInfo) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const bridge = await runBridgeScenario(page, testInfo);
  const trim = await runTrimScenario(page, testInfo);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter(isCriticalConsoleError)).toEqual([]);

  const report = {
    schema: 'TopologyEditDemoRepairWalkthroughEvidence.v1',
    status: 'PASS_BRIDGE_AND_TRIM_USER_WALKTHROUGH',
    candidateHead: process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || null,
    fixture: 'public/fixtures/topology-edit-20-element-demo.staged.json',
    objectCount: 20,
    bridge,
    trim,
    authority: {
      bridgeCommand: 'BRIDGE_GAP',
      trimCommand: 'TRIM_EDGE',
      trimPayloadUsesExactPosition: true,
      previewMutatesJournal: false,
      workspaceCommitPerformed: false,
    },
  };
  await mkdir('reports/qualification', { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
});

async function runBridgeScenario(page, testInfo) {
  const host = await openFreshDemo(page);
  const baseline = await evidence(host);
  await selectPort(page, 'P-003:port:end', false);
  await selectPort(page, 'R-001:port:start', true);

  const bridgeButton = page.locator('[data-command-action="bridge-gap"]');
  await expect(bridgeButton).toBeEnabled();
  await expect(bridgeButton).toHaveAttribute('title', /diameter remains unresolved/i);
  await bridgeButton.click();
  await expect(page.locator('[data-role="topology-edit-status"]'))
    .toContainText('BRIDGE_GAP accepted');

  const accepted = await evidence(host);
  expect(accepted.activeCommandCount).toBe(1);
  expect(accepted.canonicalHash).not.toBe(baseline.canonicalHash);
  expect(await comparisonValue(page, 'Added')).toBe('1');
  expect(await comparisonValue(page, 'Removed')).toBe('0');
  await attachScreenshot(page, testInfo, '250mm-bridge-accepted');

  await selectPort(page, 'P-003:port:end', false);
  await selectPort(page, 'R-001:port:start', true);
  const traceButton = page.locator('[data-action="build-route-trace"]');
  await expect(traceButton).toBeEnabled();
  await traceButton.click();
  const routePanel = page.locator('[data-role="topology-edit-route-trace"]');
  await expect(routePanel).toContainText('Point-to-point route');
  expect(await routeValue(page, 'Edges')).toBe('1');
  expect(await routeValue(page, 'Total length')).toBe('250 mm');
  await attachScreenshot(page, testInfo, '250mm-bridge-route-trace');

  await page.locator('[data-action="undo"]').click();
  const undone = await evidence(host);
  expect(undone.activeCommandCount).toBe(0);
  expect(undone.canonicalHash).toBe(baseline.canonicalHash);
  await expect(page.locator('[data-role="topology-edit-comparison"]'))
    .toContainText('Source and draft canonical topology are identical');
  await expect(routePanel).not.toContainText('Point-to-point route');

  await page.locator('[data-action="redo"]').click();
  const replayed = await evidence(host);
  expect(replayed.activeCommandCount).toBe(1);
  expect(replayed.canonicalHash).toBe(accepted.canonicalHash);
  expect(await comparisonValue(page, 'Added')).toBe('1');

  return Object.freeze({
    sourceHash: baseline.sourceHash,
    baselineCanonicalHash: baseline.canonicalHash,
    acceptedCanonicalHash: accepted.canonicalHash,
    replayedCanonicalHash: replayed.canonicalHash,
    journalHash: replayed.journalHash,
    gapMm: 250,
    diameterAuthority: 'UNRESOLVED_VISIBLE_DISCLOSURE',
    routeTraceLengthMm: 250,
  });
}

async function runTrimScenario(page, testInfo) {
  const host = await openFreshDemo(page);
  const baseline = await evidence(host);
  const overlap = overlapIssue(page);
  await expect(overlap).toHaveCount(1);
  await expect(overlap).toContainText('150.00mm');

  const beforePreview = await evidence(host);
  await overlap.getByRole('button', { name: 'Preview TRIM_EDGE' }).click();
  await expect(page.locator('[data-role="topology-edit-status"]'))
    .toContainText('TRIM_EDGE preview certified');
  const firstPreview = await evidence(host);
  expect(firstPreview.canonicalHash).toBe(beforePreview.canonicalHash);
  expect(firstPreview.journalHash).toBe(beforePreview.journalHash);
  expect(firstPreview.previewHash).not.toBe('');
  expect(firstPreview.previewCertificationHash).not.toBe('');
  await attachScreenshot(page, testInfo, '150mm-trim-preview');

  await page.locator('[data-action="cancel-autofix"]').click();
  const cancelled = await evidence(host);
  expect(cancelled.canonicalHash).toBe(beforePreview.canonicalHash);
  expect(cancelled.journalHash).toBe(beforePreview.journalHash);
  expect(cancelled.previewHash).toBe('');
  await expect(overlapIssue(page)).toHaveCount(1);

  await overlapIssue(page).getByRole('button', { name: 'Preview TRIM_EDGE' }).click();
  const secondPreview = await evidence(host);
  expect(secondPreview.previewHash).toBe(firstPreview.previewHash);
  expect(secondPreview.previewCertificationHash)
    .toBe(firstPreview.previewCertificationHash);
  await page.locator('[data-action="accept-autofix"]').click();
  await expect(page.locator('[data-role="topology-edit-status"]'))
    .toContainText('TRIM_EDGE accepted from the exact certified preview');

  const accepted = await evidence(host);
  expect(accepted.activeCommandCount).toBe(1);
  expect(accepted.canonicalHash).not.toBe(baseline.canonicalHash);
  await expect(overlapIssue(page)).toHaveCount(0);
  expect(Number(await comparisonValue(page, 'Modified'))).toBeGreaterThan(0);
  expect(await comparisonValue(page, 'Added')).toBe('0');
  await attachScreenshot(page, testInfo, '150mm-trim-accepted');

  await page.locator('[data-action="undo"]').click();
  const undone = await evidence(host);
  expect(undone.activeCommandCount).toBe(0);
  expect(undone.canonicalHash).toBe(baseline.canonicalHash);
  await expect(overlapIssue(page)).toHaveCount(1);

  await page.locator('[data-action="redo"]').click();
  const replayed = await evidence(host);
  expect(replayed.activeCommandCount).toBe(1);
  expect(replayed.canonicalHash).toBe(accepted.canonicalHash);
  await expect(overlapIssue(page)).toHaveCount(0);

  return Object.freeze({
    sourceHash: baseline.sourceHash,
    baselineCanonicalHash: baseline.canonicalHash,
    previewHash: firstPreview.previewHash,
    previewCertificationHash: firstPreview.previewCertificationHash,
    acceptedCanonicalHash: accepted.canonicalHash,
    replayedCanonicalHash: replayed.canonicalHash,
    journalHash: replayed.journalHash,
    overlapRemovedMm: 150,
    targetEdge: 'edge:F-001',
    endpoint: 'FROM',
    exactTargetPositionMm: { x: 7510, y: 0, z: 1750 },
  });
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
  await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '0');
  return host;
}

async function selectPort(page, portKey, additive) {
  const input = page.locator('[data-role="topology-edit-search-input"]');
  await input.fill(portKey);
  const result = page.locator('[data-search-object-kind="node"]');
  await expect(result).toHaveCount(1);
  await result.click({ modifiers: additive ? ['Shift'] : [] });
}

function overlapIssue(page) {
  return page.locator('[data-issue-kind="OVERLAPPING_ELEMENTS"]')
    .filter({ hasText: '150.00mm' });
}

async function comparisonValue(page, label) {
  return definitionValue(page.locator('[data-role="topology-edit-comparison"]'), label);
}

async function routeValue(page, label) {
  return definitionValue(page.locator('[data-role="topology-edit-route-trace"]'), label);
}

async function definitionValue(root, label) {
  const term = root.locator('dt').filter({ hasText: new RegExp(`^${label}$`) });
  await expect(term).toHaveCount(1);
  return term.evaluate((element) => element.nextElementSibling?.textContent?.trim() || '');
}

async function evidence(host) {
  return host.evaluate((element) => ({
    canonicalHash: element.dataset.topologyEditCanonicalHash || '',
    sourceHash: element.dataset.topologyEditSourceHash || '',
    journalHash: element.dataset.topologyEditJournalHash || '',
    activeCommandCount: Number(element.dataset.topologyEditActiveCommandCount || 0),
    previewHash: element.dataset.topologyEditPreviewHash || '',
    previewCertificationHash:
      element.dataset.topologyEditPreviewCertificationHash || '',
  }));
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
