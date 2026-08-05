import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SJSON_BYTES = readFileSync(new URL('../public/Sjson.json', import.meta.url));
const EXPECTED_URL = new URL('../Temp/3D EDIT RENDER/EXPECTED.png', import.meta.url);
const EXPECTED_BYTES = readFileSync(EXPECTED_URL);
const VIEWPORT = Object.freeze({ width: 1637, height: 869 });
const ROUTE_STYLE = 'TOPO_VALIDATOR_EDIT_DRAFT_COMPACT';
const ROUTE_AUTHORITY = 'TOPO_VALIDATOR_EDIT_DRAFT_APOS_POS_LPOS_COMPACT_GEOMETRY_V1';
const ELBOW_AUTHORITY = 'TOPO_VALIDATOR_EDIT_DRAFT_TANGENT_INTERSECTION_CUBIC_BEZIER_V1';
const SUPPORT_AUTHORITY =
  'TOPO_VALIDATOR_SUPPORT_MARKER_AND_DIRECTION_GEOMETRY';

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('production SJSON uses Edit Draft bends, compact fittings and visible supports in Chromium', async ({ page }, testInfo) => {
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

  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const canvasHost = page.locator('[data-role="topology-edit-canvas-mount"]');
  const canvas = canvasHost.locator('canvas');
  await expect(canvas).toHaveCount(1, { timeout: 60_000 });
  await expect.poll(() => canvas.evaluate((element) => (
    element.width > 0
    && element.height > 0
    && Boolean(element.getContext('webgl2') || element.getContext('webgl'))
  )), { timeout: 60_000 }).toBe(true);

  await expect.poll(() => canvasHost.getAttribute('data-topology-edit-route-render-style'), {
    timeout: 60_000,
  }).toBe(ROUTE_STYLE);
  await expect.poll(() => canvasHost.getAttribute('data-topology-edit-route-render-authority'), {
    timeout: 60_000,
  }).toBe(ROUTE_AUTHORITY);
  await expect.poll(() => canvasHost.getAttribute('data-topology-edit-edit-draft-render-authority'), {
    timeout: 60_000,
  }).toBe(ROUTE_AUTHORITY);
  await expect.poll(() => canvasHost.getAttribute('data-topology-edit-edit-draft-elbow-authority'), {
    timeout: 60_000,
  }).toBe(ELBOW_AUTHORITY);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-edit-draft-source-tangent-elbow-count',
  ), { timeout: 60_000 }).toBe(14);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-compact-route-elbow-count',
  ), { timeout: 60_000 }).toBe(14);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-compact-route-segment-count',
  ), { timeout: 60_000 }).toBeGreaterThan(100);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rich-typed-primitive-render-count',
  ), { timeout: 60_000 }).toBe(0);
  await expect.poll(() => numberAttribute(
    canvasHost,
    'data-topology-edit-edit-draft-max-start-tangent-error',
  ), { timeout: 60_000 }).toBeLessThanOrEqual(1e-12);
  await expect.poll(() => numberAttribute(
    canvasHost,
    'data-topology-edit-edit-draft-max-end-tangent-error',
  ), { timeout: 60_000 }).toBeLessThanOrEqual(1e-12);

  const firstElbow = await jsonAttribute(canvasHost, 'data-topology-edit-edit-draft-first-elbow');
  expect(firstElbow?.authority).toBe(ELBOW_AUTHORITY);
  expect(finitePoint(firstElbow?.sourceStart)).toBe(true);
  expect(finitePoint(firstElbow?.tangentIntersection)).toBe(true);
  expect(finitePoint(firstElbow?.sourceEnd)).toBe(true);
  const startTangentLength = pointDistance(
    firstElbow.sourceStart,
    firstElbow.tangentIntersection,
  );
  const endTangentLength = pointDistance(
    firstElbow.tangentIntersection,
    firstElbow.sourceEnd,
  );
  expect(firstElbow.radiusMm).toBeCloseTo(
    Math.min(startTangentLength, endTangentLength),
    6,
  );
  expect(firstElbow.tangentIntersection).not.toEqual(firstElbow.sourceStart);
  expect(firstElbow.tangentIntersection).not.toEqual(firstElbow.sourceEnd);
  expect(firstElbow.startTangentError).toBeLessThanOrEqual(1e-12);
  expect(firstElbow.endTangentError).toBeLessThanOrEqual(1e-12);

  await expect.poll(() => canvasHost.getAttribute('data-topology-edit-support-render-authority'), {
    timeout: 60_000,
  }).toBe(SUPPORT_AUTHORITY);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-support-marker-count',
  ), { timeout: 60_000 }).toBe(34);
  await expect.poll(() => integerAttribute(
    canvasHost,
    'data-topology-edit-rendered-restraint-arrow-count',
  ), { timeout: 60_000 }).toBe(47);
  await expect.poll(() => numberAttribute(
    canvasHost,
    'data-topology-edit-rendered-support-base-marker-radius-mm',
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
  expect(visualMetrics.candidate.brightPixelRatio)
    .toBeLessThanOrEqual(visualMetrics.expected.brightPixelRatio * 1.75);
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

async function compareCanvasVisuals(page, expectedBytes, candidateBytes, rect) {
  return page.evaluate(async ({ expectedBase64, candidateBase64, crop }) => {
    const largestComponent = (mask, width, height) => {
      const visited = new Uint8Array(mask.length);
      const queue = new Int32Array(mask.length);
      let largest = 0;
      for (let start = 0; start < mask.length; start += 1) {
        if (!mask[start] || visited[start]) continue;
        let head = 0;
        let tail = 0;
        let size = 0;
        queue[tail++] = start;
        visited[start] = 1;
        while (head < tail) {
          const current = queue[head++];
          size += 1;
          const x = current % width;
          const y = Math.floor(current / width);
          const neighbors = [
            x > 0 ? current - 1 : -1,
            x + 1 < width ? current + 1 : -1,
            y > 0 ? current - width : -1,
            y + 1 < height ? current + width : -1,
          ];
          for (const neighbor of neighbors) {
            if (neighbor >= 0 && mask[neighbor] && !visited[neighbor]) {
              visited[neighbor] = 1;
              queue[tail++] = neighbor;
            }
          }
        }
        largest = Math.max(largest, size);
      }
      return largest;
    };
    const metrics = async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const width = Math.max(1, Math.round(crop.width));
      const height = Math.max(1, Math.round(crop.height));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(
        bitmap,
        Math.round(crop.x),
        Math.round(crop.y),
        width,
        height,
        0,
        0,
        width,
        height,
      );
      bitmap.close();
      const pixels = context.getImageData(0, 0, width, height).data;
      const saturated = new Uint8Array(width * height);
      let brightPixelCount = 0;
      let saturatedPixelCount = 0;
      for (let index = 0; index < width * height; index += 1) {
        const offset = index * 4;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        const luminance = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
        const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
        if (luminance > 50) brightPixelCount += 1;
        if (saturation > 80 && luminance > 20) {
          saturated[index] = 1;
          saturatedPixelCount += 1;
        }
      }
      return {
        width,
        height,
        brightPixelRatio: brightPixelCount / (width * height),
        saturatedPixelRatio: saturatedPixelCount / (width * height),
        largestSaturatedComponent: largestComponent(saturated, width, height),
      };
    };
    return {
      crop,
      expected: await metrics(expectedBase64),
      candidate: await metrics(candidateBase64),
    };
  }, {
    expectedBase64: expectedBytes.toString('base64'),
    candidateBase64: candidateBytes.toString('base64'),
    crop: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
  });
}

function finitePoint(value) {
  return Boolean(
    value
    && [value.x, value.y, value.z].every((coordinate) => Number.isFinite(Number(coordinate))),
  );
}

function pointDistance(left, right) {
  return Math.hypot(
    Number(right.x) - Number(left.x),
    Number(right.y) - Number(left.y),
    Number(right.z) - Number(left.z),
  );
}

async function integerAttribute(locator, name) {
  const value = await locator.getAttribute(name);
  return Number.parseInt(value || '0', 10) || 0;
}

async function numberAttribute(locator, name) {
  const value = Number(await locator.getAttribute(name));
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

async function jsonAttribute(locator, name) {
  const value = await locator.getAttribute(name);
  try { return JSON.parse(value || 'null'); } catch { return null; }
}
