import { expect, test } from '@playwright/test';
import {
  copyFileSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  compareCanvasVisuals,
} from './topology-edit-sjson-visual-comparison.js';

const EXPECTED_URL = fileURLToPath(new URL(
  '../Temp/3D EDIT RENDER/EXPECTED.png',
  import.meta.url,
));
const EXPECTED_BYTES = readFileSync(EXPECTED_URL);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('production SJSON uses Edit Draft bends, compact fittings and visible supports in Chromium', async ({ page }, testInfo) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await navigation.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.locator('[data-action="load-sjson"]').click();
  await page.getByRole('button', { name: '3D Edit', exact: true }).click();

  const host = page.locator('[data-role="topology-edit-render-host"]');
  const canvasHost = host.locator('.topology-edit-3d-canvas');
  const canvas = canvasHost.locator('canvas');
  await expect(host).toBeVisible();
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvasHost.getAttribute(
    'data-topology-edit-sjson-governed-renderer',
  ), { timeout: 60_000 }).toBe('true');

  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-route-visible-envelope-count',
  ), { timeout: 60_000 }).toBeGreaterThan(0);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-route-acquisition-proxy-count',
  ), { timeout: 60_000 }).toBeGreaterThan(0);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-typed-equipment-count',
  ), { timeout: 60_000 }).toBeGreaterThan(0);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-flange-count',
  ), { timeout: 60_000 }).toBeGreaterThan(0);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-valve-count',
  ), { timeout: 60_000 }).toBeGreaterThan(0);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-instrument-count',
  ), { timeout: 60_000 }).toBeGreaterThan(0);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-support-count',
  ), { timeout: 60_000 }).toBeGreaterThan(0);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-node-marker-count',
  ), { timeout: 60_000 }).toBeGreaterThan(0);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-issue-marker-count',
  ), { timeout: 60_000 }).toBeGreaterThan(0);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-legacy-line-count',
  ), { timeout: 60_000 }).toBe(0);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-rich-primitive-count',
  ), { timeout: 60_000 }).toBe(0);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-rich-support-count',
  ), { timeout: 60_000 }).toBe(0);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-rich-node-count',
  ), { timeout: 60_000 }).toBe(0);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-typed-node-count',
  ), { timeout: 60_000 }).toBe(0);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-typed-support-count',
  ), { timeout: 60_000 }).toBe(0);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-typed-restraint-count',
  ), { timeout: 60_000 }).toBe(0);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-generic-support-count',
  ), { timeout: 60_000 }).toBe(0);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-generic-restraint-count',
  ), { timeout: 60_000 }).toBe(0);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-generic-node-count',
  ), { timeout: 60_000 }).toBe(0);
  await expect.poll(() => numberAttribute(
    canvasHost,
    'data-topology-edit-rendered-node-marker-radius-mm',
  ), { timeout: 60_000 }).toBeCloseTo(4.2, 6);
  await expect.poll(() => numberAttribute(
    canvasHost,
    'data-topology-edit-base-support-marker-radius-mm',
  ), { timeout: 60_000 }).toBeCloseTo(12.6, 6);
  await expect.poll(() => numberAttribute(
    canvasHost,
    'data-topology-edit-rendered-support-marker-radius-mm',
  ), { timeout: 60_000 }).toBeCloseTo(37.8, 6);
  await expect.poll(() => numberAttribute(
    canvasHost,
    'data-topology-edit-support-display-scale',
  ), { timeout: 60_000 }).toBeCloseTo(3, 6);
  await expect.poll(() => numberAttribute(
    canvasHost,
    'data-topology-edit-rendered-support-marker-opacity',
  ), { timeout: 60_000 }).toBeCloseTo(0.15, 6);
  await expect.poll(() => numberAttribute(
    canvasHost,
    'data-topology-edit-rendered-restraint-opacity',
  ), { timeout: 60_000 }).toBeCloseTo(0.5, 6);

  const screenshotPath = testInfo.outputPath('sjson-edit-draft-visual.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const candidateBytes = readFileSync(screenshotPath);
  const expectedPath = testInfo.outputPath('EXPECTED.png');
  copyFileSync(EXPECTED_URL, expectedPath);
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  const visualMetrics = await compareCanvasVisuals(
    page,
    EXPECTED_BYTES,
    candidateBytes,
    rect,
  );

  expect(visualMetrics.candidate.brightPixelRatio)
    .toBeGreaterThanOrEqual(visualMetrics.expected.brightPixelRatio * 0.45);
  // The production left model panel now remains visible during 3D Edit. The
  // narrower canvas changes fitted model density but not governed geometry.
  expect(visualMetrics.candidate.brightPixelRatio)
    .toBeLessThanOrEqual(visualMetrics.expected.brightPixelRatio * 1.85);
  expect(visualMetrics.candidate.saturatedPixelRatio)
    .toBeLessThanOrEqual((visualMetrics.expected.saturatedPixelRatio * 3) + 0.0005);
  expect(visualMetrics.candidate.largestSaturatedComponent)
    .toBeLessThanOrEqual(Math.max(
      visualMetrics.expected.largestSaturatedComponent * 4,
      160,
    ));

  const metricsPath = testInfo.outputPath('sjson-edit-draft-visual-metrics.json');
  writeFileSync(metricsPath, `${JSON.stringify(visualMetrics, null, 2)}\n`, 'utf8');
  await testInfo.attach('expected-3d-edit-render-benchmark', {
    path: expectedPath,
    contentType: 'image/png',
  });
  await testInfo.attach('sjson-edit-draft-visual-metrics', {
    path: metricsPath,
    contentType: 'application/json',
  });
});

async function integerAttribute(locator, name) {
  return Number.parseInt(await locator.getAttribute(name) || '0', 10) || 0;
}

async function numberAttribute(locator, name) {
  return Number(await locator.getAttribute(name)) || 0;
}
