import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const GAP_CASES = Object.freeze([
  Object.freeze({ actionId: 'set-gap-3', gapMm: 3 }),
  Object.freeze({ actionId: 'set-gap-20', gapMm: 20 }),
]);
const REPORT_PATH = 'reports/qualification/topology-edit-demo-walkthrough.json';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript(() => {
    globalThis.localStorage?.clear();
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d';
  });
});

test('20-object demo creates, detects, previews, repairs, and replays 3 mm and 20 mm gaps', async ({ page }, testInfo) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const cases = [];
  for (const gapCase of GAP_CASES) {
    const host = await openFreshDemo(page);
    const baseline = await evidence(host);
    await expectSnapIssue(page, 10);
    await selectPort(page, 'P-001:port:end', false);
    await selectPort(page, 'E-001:port:start', true);
    await expect(page.locator('[data-role="topology-edit-status"]'))
      .toContainText('Selected nodes 1=');

    const moveButton = page.locator(`[data-command-action="${gapCase.actionId}"]`);
    await expect(moveButton).toBeEnabled();
    await moveButton.click();
    await expect(page.locator('[data-role="topology-edit-status"]'))
      .toContainText('MOVE_NODE accepted');
    const moved = await evidence(host);
    expect(moved.activeCommandCount).toBe(1);
    expect(moved.canonicalHash).not.toBe(baseline.canonicalHash);
    await expectSnapIssue(page, gapCase.gapMm);

    const beforePreview = await evidence(host);
    await previewSnapRepair(page, gapCase.gapMm);
    const firstPreview = await evidence(host);
    expect(firstPreview.journalHash).toBe(beforePreview.journalHash);
    expect(firstPreview.canonicalHash).toBe(beforePreview.canonicalHash);
    expect(firstPreview.previewHash).not.toBe('');
    expect(firstPreview.previewCertificationHash).not.toBe('');
    await attachScreenshot(page, testInfo, `${gapCase.gapMm}mm-preview`);

    await page.locator('[data-action="cancel-autofix"]').click();
    const cancelled = await evidence(host);
    expect(cancelled.journalHash).toBe(beforePreview.journalHash);
    expect(cancelled.canonicalHash).toBe(beforePreview.canonicalHash);
    expect(cancelled.previewHash).toBe('');
    await expectSnapIssue(page, gapCase.gapMm);

    await previewSnapRepair(page, gapCase.gapMm);
    const secondPreview = await evidence(host);
    expect(secondPreview.previewHash).toBe(firstPreview.previewHash);
    expect(secondPreview.previewCertificationHash)
      .toBe(firstPreview.previewCertificationHash);
    await page.locator('[data-action="accept-autofix"]').click();
    await expect(page.locator('[data-role="topology-edit-status"]'))
      .toContainText('MERGE_NODES accepted from the exact certified preview');
    const accepted = await evidence(host);
    expect(accepted.activeCommandCount).toBe(2);
    expect(accepted.previewHash).toBe('');
    expect(accepted.canonicalHash).not.toBe(moved.canonicalHash);
    await expect(snapIssue(page, gapCase.gapMm)).toHaveCount(0);
    await attachScreenshot(page, testInfo, `${gapCase.gapMm}mm-accepted`);

    await page.locator('[data-action="undo"]').click();
    const undoMerge = await evidence(host);
    expect(undoMerge.activeCommandCount).toBe(1);
    expect(undoMerge.canonicalHash).toBe(moved.canonicalHash);
    await expectSnapIssue(page, gapCase.gapMm);

    await page.locator('[data-action="undo"]').click();
    const undoMove = await evidence(host);
    expect(undoMove.activeCommandCount).toBe(0);
    expect(undoMove.canonicalHash).toBe(baseline.canonicalHash);
    await expectSnapIssue(page, 10);

    await page.locator('[data-action="redo"]').click();
    await expectSnapIssue(page, gapCase.gapMm);
    await page.locator('[data-action="redo"]').click();
    const replayed = await evidence(host);
    expect(replayed.activeCommandCount).toBe(2);
    expect(replayed.canonicalHash).toBe(accepted.canonicalHash);
    await expect(snapIssue(page, gapCase.gapMm)).toHaveCount(0);

    cases.push(Object.freeze({
      requestedGapMm: gapCase.gapMm,
      sourceHash: baseline.sourceHash,
      baselineCanonicalHash: baseline.canonicalHash,
      movedCanonicalHash: moved.canonicalHash,
      previewHash: firstPreview.previewHash,
      previewCertificationHash: firstPreview.previewCertificationHash,
      acceptedCanonicalHash: accepted.canonicalHash,
      replayedCanonicalHash: replayed.canonicalHash,
      finalJournalHash: replayed.journalHash,
    }));
  }

  expect(cases[0].previewHash).not.toBe(cases[1].previewHash);
  expect(cases[0].movedCanonicalHash).not.toBe(cases[1].movedCanonicalHash);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter(isCriticalConsoleError)).toEqual([]);

  const report = {
    schema: 'TopologyEditDemoWalkthroughEvidence.v1',
    status: 'PASS_EXACT_GAP_USER_WALKTHROUGH',
    candidateHead: process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || null,
    fixture: 'public/fixtures/topology-edit-20-element-demo.staged.json',
    objectCount: 20,
    snapGapToleranceMm: 25,
    authority: {
      deliberateMoveCommand: 'MOVE_NODE',
      repairCommand: 'MERGE_NODES',
      workspaceMutationByPreview: false,
    },
    cases,
  };
  await mkdir('reports/qualification', { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
});

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
  await expect(page.locator('[data-role="summary-pipes"]')).toContainText('15');
  await expect(page.locator('[data-role="summary-supports"]')).toContainText('5');

  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible();
  await expect(page.locator('[data-role="topology-edit-search-input"]')).toBeEnabled();
  await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '0');
  await expect(host).toHaveAttribute('data-topology-edit-canonical-hash', /.+/);
  return host;
}

async function selectPort(page, portKey, additive) {
  const input = page.locator('[data-role="topology-edit-search-input"]');
  await input.fill(portKey);
  const results = page.locator('[data-search-object-kind="node"]');
  await expect(results).toHaveCount(1);
  await results.first().click({ modifiers: additive ? ['Shift'] : [] });
}

function snapIssue(page, distanceMm) {
  return page.locator('[data-issue-kind="SNAP_GAP"]')
    .filter({ hasText: `${Number(distanceMm).toFixed(2)}mm` });
}

async function expectSnapIssue(page, distanceMm) {
  await expect(snapIssue(page, distanceMm)).toHaveCount(1);
}

async function previewSnapRepair(page, distanceMm) {
  const issue = snapIssue(page, distanceMm);
  await issue.getByRole('button', { name: 'Preview MERGE_NODES' }).click();
  await expect(page.locator('[data-role="topology-edit-status"]'))
    .toContainText('MERGE_NODES preview certified');
  await expect(page.locator('[data-action="accept-autofix"]')).toBeEnabled();
  await expect(page.locator('[data-action="cancel-autofix"]')).toBeEnabled();
}

async function evidence(host) {
  return host.evaluate((element) => ({
    canonicalHash: element.dataset.topologyEditCanonicalHash || '',
    sourceHash: element.dataset.topologyEditSourceHash || '',
    journalHash: element.dataset.topologyEditJournalHash || '',
    sessionVersion: Number(element.dataset.topologyEditSessionVersion || 0),
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
