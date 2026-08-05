import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SJSON_BYTES = readFileSync(new URL('../public/Sjson.json', import.meta.url));
const BENCHMARK_VIEWPORT = Object.freeze({ width: 1637, height: 869 });
const FIT_ALGORITHM = 'TOPO_VALIDATOR_ASPECT_SAFE_PERSPECTIVE_FIT_DIRECTION_1_1_0_8_V1';
const SUPPORT_RENDER_STYLE = 'TOPO_VALIDATOR_COMPACT';
const SUPPORT_RENDER_AUTHORITY = 'TOPO_VALIDATOR_SUPPORT_MARKER_AND_DIRECTION_GEOMETRY';
const NDC_LIMIT = 0.81;

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(BENCHMARK_VIEWPORT);
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('production Sjson compact support scene fits completely inside the WebGL viewport', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name: 'Sjson.json', mimeType: 'application/json', buffer: SJSON_BYTES,
  });
  await expect.poll(() => page.evaluate(() => {
    const snapshot = globalThis.AnalysisWorkspace?.getSnapshot?.();
    return snapshot?.status === 'ready' ? snapshot.dataset?.entities?.length || 0 : 0;
  }), { timeout: 60_000 }).toBeGreaterThan(253);
  await page.getByRole('button', { name: '3D Edit', exact: true }).click();

  const host = page.locator('[data-role="topology-edit-canvas-mount"]');
  const canvas = host.locator('canvas');
  await expect(canvas).toHaveCount(1);
  await expect.poll(() => host.getAttribute('data-topology-edit-benchmark-camera-fit-algorithm'), {
    timeout: 60_000,
  }).toBe(FIT_ALGORITHM);
  await expect(host).toHaveAttribute('data-topology-edit-support-render-style', SUPPORT_RENDER_STYLE);
  await expect(host).toHaveAttribute('data-topology-edit-support-render-authority', SUPPORT_RENDER_AUTHORITY);
  await expect.poll(async () => Number(await host.getAttribute('data-topology-edit-compact-support-marker-radius-mm')), {
    timeout: 60_000,
  }).toBeCloseTo(12.6, 6);

  const bounds = await host.evaluate((element) => {
    try { return JSON.parse(element.dataset.topologyEditBenchmarkScreenBounds || 'null'); }
    catch { return null; }
  });
  expect(bounds?.fitsViewport).toBe(true);
  expect(bounds?.minimum?.x).toBeGreaterThanOrEqual(-NDC_LIMIT);
  expect(bounds?.maximum?.x).toBeLessThanOrEqual(NDC_LIMIT);
  expect(bounds?.minimum?.y).toBeGreaterThanOrEqual(-NDC_LIMIT);
  expect(bounds?.maximum?.y).toBeLessThanOrEqual(NDC_LIMIT);
  expect(bounds?.minimum?.z).toBeGreaterThanOrEqual(-1.001);
  expect(bounds?.maximum?.z).toBeLessThanOrEqual(1.001);
  expect(bounds?.span?.x).toBeGreaterThan(0.35);
  expect(bounds?.span?.y).toBeGreaterThan(0.5);
});
