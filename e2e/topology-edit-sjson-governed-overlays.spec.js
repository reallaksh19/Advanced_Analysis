import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SJSON_BYTES = readFileSync(new URL('../public/Sjson.json', import.meta.url));
const VIEWPORT = Object.freeze({ width: 1637, height: 869 });

test('SJSON uses one governed packet with exact tees, visible nodes and compact overlays', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(() => globalThis.localStorage?.clear());
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
  await expect(canvas).toHaveCount(1, { timeout: 60_000 });
  await expect.poll(() => canvas.evaluate((element) => Boolean(
    element.getContext('webgl2') || element.getContext('webgl'),
  )), { timeout: 60_000 }).toBe(true);

  await expect(host).toHaveAttribute('data-topology-edit-sjson-single-render-packet', 'true');
  await expect(host).toHaveAttribute('data-topology-edit-sjson-projection-schema', 'SjsonEditDraftProjection.v2');
  await expect(host).toHaveAttribute('data-topology-edit-active-rich-primitive-count', '0');
  await expect(host).toHaveAttribute('data-topology-edit-visible-route-solid-mesh-count', '0');
  await expect(host).toHaveAttribute('data-topology-edit-node-visual-and-pick-geometry-separated', 'true');
  await expect(host).toHaveAttribute('data-topology-edit-visible-node-marker-geometry', 'OCTAHEDRON_WIREFRAME');
  await expect(host).toHaveAttribute('data-topology-edit-support-overlay-depth-independent', 'true');
  await expect(host).toHaveAttribute(
    'data-topology-edit-sjson-issue-render-authority',
    'SJSON_COMPACT_WIREFRAME_ISSUE_OVERLAY_V2',
  );
  await expect(host).toHaveAttribute(
    'data-topology-edit-sjson-issue-marker-geometry',
    'OCTAHEDRON_WIREFRAME',
  );

  await expect.poll(() => integerAttribute(host, 'data-topology-edit-exact-tee-count')).toBe(3);
  await expect.poll(() => integerAttribute(host, 'data-topology-edit-exact-tee-segment-count')).toBe(9);
  await expect.poll(() => integerAttribute(host, 'data-topology-edit-visible-node-marker-count')).toBeGreaterThan(100);
  await expect.poll(() => numberAttribute(host, 'data-topology-edit-visible-node-marker-radius-mm')).toBeLessThanOrEqual(8);
  await expect.poll(() => numberAttribute(host, 'data-topology-edit-node-pick-proxy-radius-mm')).toBeGreaterThan(
    await numberAttribute(host, 'data-topology-edit-visible-node-marker-radius-mm'),
  );
  await expect.poll(() => integerAttribute(host, 'data-topology-edit-rendered-support-marker-count')).toBe(34);
  await expect.poll(() => integerAttribute(host, 'data-topology-edit-rendered-restraint-arrow-count')).toBe(47);
  await expect.poll(() => integerAttribute(host, 'data-topology-edit-visible-support-overlay-count')).toBe(81);
  await expect.poll(() => integerAttribute(host, 'data-topology-edit-sjson-visible-issue-marker-count'))
    .toBeGreaterThan(0);
  await expect.poll(() => numberAttribute(host, 'data-topology-edit-sjson-issue-marker-radius-mm'))
    .toBeLessThanOrEqual(8);

  await page.screenshot({
    path: testInfo.outputPath('sjson-governed-overlays.png'),
    fullPage: false,
  });
});

async function integerAttribute(locator, name) {
  return Number.parseInt(await locator.getAttribute(name) || '0', 10) || 0;
}

async function numberAttribute(locator, name) {
  const value = Number(await locator.getAttribute(name));
  return Number.isFinite(value) ? value : 0;
}
