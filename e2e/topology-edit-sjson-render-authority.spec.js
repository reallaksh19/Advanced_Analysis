import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SJSON_BYTES = readFileSync(new URL('../public/Sjson.json', import.meta.url));
const REPORTED_CANDIDATE_SHA = '8754ea4f7ff839d5085ceffa845ded9c81557149';
const EXECUTING_CANDIDATE_SHA = process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA
  || process.env.GITHUB_SHA
  || 'UNKNOWN';

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('production Sjson opens 3D Edit with complete typed fittings and spatially distinct supports', async ({ page }, testInfo) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name: 'Sjson.json',
    mimeType: 'application/json',
    buffer: SJSON_BYTES,
  });

  await expect.poll(() => page.evaluate(() => {
    const snapshot = globalThis.AnalysisWorkspace?.getSnapshot?.();
    return snapshot?.status === 'ready' ? snapshot.dataset?.entities?.length || 0 : 0;
  }), { timeout: 60_000 }).toBeGreaterThan(253);
  await expect(page.locator('[data-role="tree-error"]')).toBeHidden();

  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const shell = page.locator('[data-role="topology-edit-render-host"]');
  const canvasHost = shell.locator('[data-role="topology-edit-canvas-mount"]');
  const canvas = canvasHost.locator('canvas');
  await expect(shell).toBeVisible({ timeout: 60_000 });
  await expect(shell).toHaveAttribute('data-topology-edit-clean-shell', 'true');
  await expect(canvas).toHaveCount(1);
  await expect.poll(() => canvas.evaluate((element) => (
    element.width > 0
    && element.height > 0
    && Boolean(element.getContext('webgl2') || element.getContext('webgl'))
  )), { timeout: 60_000 }).toBe(true);

  await expect.poll(() => integerAttribute(canvasHost, 'data-topology-edit-typed-primitive-count'), {
    timeout: 60_000,
  }).toBeGreaterThan(100);
  await expect.poll(() => integerAttribute(canvasHost, 'data-topology-edit-pipe-primitive-count'), {
    timeout: 60_000,
  }).toBeGreaterThanOrEqual(40);
  await expect.poll(() => integerAttribute(canvasHost, 'data-topology-edit-elbow-primitive-count'), {
    timeout: 60_000,
  }).toBeGreaterThanOrEqual(10);
  await expect.poll(() => integerAttribute(canvasHost, 'data-topology-edit-flange-primitive-count'), {
    timeout: 60_000,
  }).toBeGreaterThanOrEqual(18);
  await expect.poll(() => integerAttribute(canvasHost, 'data-topology-edit-valve-primitive-count'), {
    timeout: 60_000,
  }).toBeGreaterThanOrEqual(4);
  await expect.poll(() => integerAttribute(canvasHost, 'data-topology-edit-reducer-primitive-count'), {
    timeout: 60_000,
  }).toBeGreaterThanOrEqual(4);
  await expect.poll(() => integerAttribute(canvasHost, 'data-topology-edit-tee-primitive-count'), {
    timeout: 60_000,
  }).toBeGreaterThanOrEqual(3);
  await expect.poll(() => integerAttribute(canvasHost, 'data-topology-edit-olet-primitive-count'), {
    timeout: 60_000,
  }).toBeGreaterThanOrEqual(10);
  await expect.poll(() => integerAttribute(canvasHost, 'data-topology-edit-support-overlay-count'), {
    timeout: 60_000,
  }).toBeGreaterThan(0);
  await expect.poll(() => integerAttribute(canvasHost, 'data-topology-edit-exact-support-origin-count'), {
    timeout: 60_000,
  }).toBeGreaterThanOrEqual(37);
  await expect.poll(() => integerAttribute(canvasHost, 'data-topology-edit-distinct-support-origin-count'), {
    timeout: 60_000,
  }).toBeGreaterThanOrEqual(37);
  await expect.poll(() => integerAttribute(canvasHost, 'data-topology-edit-visual-proxy-warning-count'), {
    timeout: 60_000,
  }).toBeGreaterThan(0);
  await expect.poll(() => integerAttribute(canvasHost, 'data-topology-edit-geometry-diagnostic-count'), {
    timeout: 60_000,
  }).toBe(0);

  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain('TopologyEditCanonicalId:');
  await expect(shell.locator('[data-role="topology-edit-status"]')).toContainText(/nodes, .*edges, .*supports/u);

  const ledger = await canvasHost.evaluate((element, {
    baseCandidateSha,
    executingCandidateSha,
  }) => ({
    schema: 'topology-edit-sjson-webgl-ledger/v1',
    baseCandidateSha,
    executingCandidateSha,
    browserBuildSha: globalThis.__BUILD_SHA__ || null,
    sourceHash: element.closest('[data-role="topology-edit-render-host"]')?.dataset.topologyEditDatasetSourceHash || '',
    canonicalHash: element.closest('[data-role="topology-edit-render-host"]')?.dataset.topologyEditDatasetCanonicalHash || '',
    visualModelHash: element.dataset.topologyEditVisualModelHash || '',
    supportProjectionHash: element.dataset.topologyEditSupportProjectionHash || '',
    journalHash: element.dataset.topologyEditJournalHash || '',
    typedPrimitiveCount: Number(element.dataset.topologyEditTypedPrimitiveCount || 0),
    geometryDiagnosticCount: Number(element.dataset.topologyEditGeometryDiagnosticCount || 0),
    primitiveCounts: {
      pipe: Number(element.dataset.topologyEditPipePrimitiveCount || 0),
      elbow: Number(element.dataset.topologyEditElbowPrimitiveCount || 0),
      flange: Number(element.dataset.topologyEditFlangePrimitiveCount || 0),
      valve: Number(element.dataset.topologyEditValvePrimitiveCount || 0),
      reducer: Number(element.dataset.topologyEditReducerPrimitiveCount || 0),
      tee: Number(element.dataset.topologyEditTeePrimitiveCount || 0),
      olet: Number(element.dataset.topologyEditOletPrimitiveCount || 0),
      diagnostic: Number(element.dataset.topologyEditDiagnosticPrimitiveCount || 0),
    },
    supportCounts: {
      overlay: Number(element.dataset.topologyEditSupportOverlayCount || 0),
      exactOrigin: Number(element.dataset.topologyEditExactSupportOriginCount || 0),
      distinctOrigin: Number(element.dataset.topologyEditDistinctSupportOriginCount || 0),
    },
  }), {
    baseCandidateSha: REPORTED_CANDIDATE_SHA,
    executingCandidateSha: EXECUTING_CANDIDATE_SHA,
  });

  expect(ledger.executingCandidateSha).not.toBe('UNKNOWN');
  expect(ledger.sourceHash).not.toBe('');
  expect(ledger.canonicalHash).not.toBe('');
  expect(ledger.visualModelHash).not.toBe('');
  expect(ledger.supportProjectionHash).not.toBe('');

  const ledgerPath = testInfo.outputPath('sjson-3d-edit-render-ledger.json');
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  await page.screenshot({
    path: testInfo.outputPath('sjson-3d-edit-fittings-supports.png'),
    fullPage: true,
  });
  await testInfo.attach('sjson-3d-edit-render-ledger', {
    path: ledgerPath,
    contentType: 'application/json',
  });
});

async function integerAttribute(locator, name) {
  const value = await locator.getAttribute(name);
  return Number.parseInt(value || '0', 10) || 0;
}
