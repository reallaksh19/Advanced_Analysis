import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SJSON_BYTES = readFileSync(new URL('../public/Sjson.json', import.meta.url));

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('production Sjson opens 3D Edit with typed inline geometry and support overlays', async ({ page }) => {
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
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible({ timeout: 60_000 });
  await expect(host).toHaveAttribute('data-topology-edit-clean-shell', 'true');
  await expect(host.locator('.topology-edit-3d-canvas canvas')).toHaveCount(1);

  await expect.poll(() => integerAttribute(host, 'data-topology-edit-typed-primitive-count'), {
    timeout: 60_000,
  }).toBeGreaterThan(0);
  await expect.poll(() => integerAttribute(host, 'data-topology-edit-flange-primitive-count'), {
    timeout: 60_000,
  }).toBeGreaterThan(0);
  await expect.poll(() => integerAttribute(host, 'data-topology-edit-valve-primitive-count'), {
    timeout: 60_000,
  }).toBeGreaterThan(0);
  await expect.poll(() => integerAttribute(host, 'data-topology-edit-support-overlay-count'), {
    timeout: 60_000,
  }).toBeGreaterThan(0);
  await expect.poll(() => integerAttribute(host, 'data-topology-edit-resolved-support-origin-count'), {
    timeout: 60_000,
  }).toBeGreaterThan(0);

  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain('TopologyEditCanonicalId:');
  await expect(host.locator('[data-role="topology-edit-status"]')).toContainText(/nodes, .*edges, .*supports/u);
});

async function integerAttribute(locator, name) {
  const value = await locator.getAttribute(name);
  return Number.parseInt(value || '0', 10) || 0;
}
