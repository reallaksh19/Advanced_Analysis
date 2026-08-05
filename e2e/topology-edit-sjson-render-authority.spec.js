import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SJSON_BYTES = readFileSync(new URL('../public/Sjson.json', import.meta.url));
const EXPECTED_BENCHMARK_URL = new URL('../Temp/3D EDIT RENDER/EXPECTED.png', import.meta.url);
const EXPECTED_BENCHMARK_BYTES = readFileSync(EXPECTED_BENCHMARK_URL);
const REPORTED_CANDIDATE_SHA = '8754ea4f7ff839d5085ceffa845ded9c81557149';
const EXECUTING_CANDIDATE_SHA = process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA
  || process.env.GITHUB_SHA
  || 'UNKNOWN';
const BENCHMARK_VIEWPORT = Object.freeze({ width: 1637, height: 869 });
const BENCHMARK_CAMERA_AUTHORITY =
  'TOPO_VALIDATOR_FIT_BOX_SIZE_0_9_PLUS_200_DIRECTION_1_1_0_8';

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(BENCHMARK_VIEWPORT);
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
  await expect.poll(() => integerAttribute(canvasHost, 'data-topology-edit-parent-branch-diameter-count'), {
    timeout: 60_000,
  }).toBeGreaterThanOrEqual(100);
  await expect.poll(() => integerAttribute(canvasHost, 'data-topology-edit-referenced-branch-diameter-count'), {
    timeout: 60_000,
  }).toBeGreaterThanOrEqual(13);
  await expect.poll(() => integerAttribute(canvasHost, 'data-topology-edit-support-parent-branch-diameter-count'), {
    timeout: 60_000,
  }).toBeGreaterThanOrEqual(100);
  await expect.poll(() => canvasHost.getAttribute('data-topology-edit-benchmark-camera-authority'), {
    timeout: 60_000,
  }).toBe(BENCHMARK_CAMERA_AUTHORITY);
  await expect.poll(() => integerAttribute(canvasHost, 'data-topology-edit-geometry-diagnostic-count'), {
    timeout: 60_000,
  }).toBe(0);

  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain('TopologyEditCanonicalId:');
  await expect(shell.locator('[data-role="topology-edit-status"]')).toContainText(/nodes, .*edges, .*supports/u);

  const screenshotPath = testInfo.outputPath('sjson-3d-edit-fittings-supports.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const candidateScreenshotBytes = readFileSync(screenshotPath);
  const expectedPath = testInfo.outputPath('EXPECTED.png');
  copyFileSync(EXPECTED_BENCHMARK_URL, expectedPath);

  const ledger = await canvasHost.evaluate((element, args) => {
    const parseJson = (value) => {
      try { return JSON.parse(value || 'null'); } catch { return null; }
    };
    const canvasElement = element.querySelector('canvas');
    const canvasRect = canvasElement?.getBoundingClientRect();
    return {
      schema: 'topology-edit-sjson-webgl-ledger/v1',
      baseCandidateSha: args.baseCandidateSha,
      executingCandidateSha: args.executingCandidateSha,
      browserBuildSha: globalThis.__BUILD_SHA__ || null,
      benchmark: {
        path: 'Temp/3D EDIT RENDER/EXPECTED.png',
        viewport: args.benchmarkViewport,
        sha256: args.benchmarkSha256,
        candidateScreenshotSha256: args.candidateScreenshotSha256,
      },
      canvas: canvasRect ? {
        left: canvasRect.left,
        top: canvasRect.top,
        width: canvasRect.width,
        height: canvasRect.height,
        pixelWidth: canvasElement.width,
        pixelHeight: canvasElement.height,
      } : null,
      camera: {
        authority: element.dataset.topologyEditBenchmarkCameraAuthority || '',
        engineeringDirection: parseJson(
          element.dataset.topologyEditBenchmarkCameraEngineeringDirection,
        ),
        renderDirection: parseJson(element.dataset.topologyEditBenchmarkCameraRenderDirection),
        bounds: parseJson(element.dataset.topologyEditBenchmarkBounds),
      },
      sourceHash: element.closest('[data-role="topology-edit-render-host"]')?.dataset.topologyEditDatasetSourceHash || '',
      canonicalHash: element.closest('[data-role="topology-edit-render-host"]')?.dataset.topologyEditDatasetCanonicalHash || '',
      visualModelHash: element.dataset.topologyEditVisualModelHash || '',
      supportProjectionHash: element.dataset.topologyEditSupportProjectionHash || '',
      journalHash: element.dataset.topologyEditJournalHash || '',
      typedPrimitiveCount: Number(element.dataset.topologyEditTypedPrimitiveCount || 0),
      geometryDiagnosticCount: Number(element.dataset.topologyEditGeometryDiagnosticCount || 0),
      diameterAuthorityCounts: {
        parentBranch: Number(element.dataset.topologyEditParentBranchDiameterCount || 0),
        referencedBranch: Number(element.dataset.topologyEditReferencedBranchDiameterCount || 0),
        supportParentBranch: Number(element.dataset.topologyEditSupportParentBranchDiameterCount || 0),
        visualProxy: Number(element.dataset.topologyEditVisualProxyWarningCount || 0),
      },
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
    };
  }, {
    baseCandidateSha: REPORTED_CANDIDATE_SHA,
    executingCandidateSha: EXECUTING_CANDIDATE_SHA,
    benchmarkViewport: BENCHMARK_VIEWPORT,
    benchmarkSha256: sha256(EXPECTED_BENCHMARK_BYTES),
    candidateScreenshotSha256: sha256(candidateScreenshotBytes),
  });

  expect(ledger.executingCandidateSha).not.toBe('UNKNOWN');
  expect(ledger.sourceHash).not.toBe('');
  expect(ledger.canonicalHash).not.toBe('');
  expect(ledger.visualModelHash).not.toBe('');
  expect(ledger.supportProjectionHash).not.toBe('');
  expect(ledger.camera.authority).toBe(BENCHMARK_CAMERA_AUTHORITY);
  expect(ledger.camera.engineeringDirection).toEqual({
    x: 0.6154574548966636,
    y: 0.6154574548966636,
    z: 0.49236596391733095,
  });
  expect(ledger.camera.bounds?.diagonalMm).toBeGreaterThan(0);
  expect(ledger.canvas?.width).toBeGreaterThan(500);
  expect(ledger.canvas?.height).toBeGreaterThan(450);
  expect(ledger.diameterAuthorityCounts.parentBranch).toBeGreaterThanOrEqual(100);
  expect(ledger.diameterAuthorityCounts.referencedBranch).toBeGreaterThanOrEqual(13);
  expect(ledger.diameterAuthorityCounts.supportParentBranch).toBeGreaterThanOrEqual(100);

  const ledgerPath = testInfo.outputPath('sjson-3d-edit-render-ledger.json');
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  await testInfo.attach('expected-3d-edit-render-benchmark', {
    path: expectedPath,
    contentType: 'image/png',
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

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
