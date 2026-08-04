import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const FIXTURE_BYTES = readFileSync(
  new URL('../public/fixtures/topology-edit-20-element-demo.staged.json', import.meta.url),
);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('uploaded SJSON survives 3D Edit leave and re-entry with the clean canvas shell', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const fileInput = page.locator('[data-role="dataset-file"]');
  await expect(fileInput).toHaveAttribute('accept', /\.sjson/);
  await fileInput.setInputFiles({
    name: 'Sjon.sjson',
    mimeType: 'application/json',
    buffer: FIXTURE_BYTES,
  });

  await expect.poll(() => page.evaluate(() => (
    globalThis.AnalysisWorkspace?.getSnapshot?.()?.dataset?.entities?.length ?? 0
  ))).toBe(20);
  await expect(page.locator('[data-role="tree-error"]')).toBeHidden();

  const editTab = page.getByRole('button', { name: '3D Edit', exact: true });
  await editTab.click();

  const host = page.locator('[data-role="topology-edit-render-host"]');
  const sidecar = host.locator('[data-role="topology-edit-sidecar"]');
  await assertCleanTopologyEditShell(host, sidecar);

  await page.getByRole('button', { name: 'Load Evaluation', exact: true }).click();
  await expect(host).toBeHidden();

  await editTab.click();
  await assertCleanTopologyEditShell(host, sidecar);

  await expect(host.locator(':scope > [data-role="topology-edit-canonical-search"]')).toHaveCount(0);
  await expect(sidecar.locator('[data-role="topology-edit-canonical-search"]')).toHaveCount(1);
  await expect(host.getByText('Find canonical object', { exact: true })).toBeHidden();

  const editPanel = sidecar.locator('details[data-panel-kind="commands"]');
  const displayPanel = sidecar.locator('details[data-panel-kind="display"]');
  await expect(editPanel).toBeVisible();
  await expect(displayPanel).toBeVisible();
  await expect(editPanel).not.toHaveAttribute('open', '');
  await expect(displayPanel).not.toHaveAttribute('open', '');
});

async function assertCleanTopologyEditShell(host, sidecar) {
  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute('data-topology-edit-clean-shell', 'true');
  await expect(host.locator('[data-role="topology-edit-workspace"]')).toBeVisible();
  await expect(sidecar).toBeVisible();
  await expect(host.locator('.topology-edit-3d-canvas canvas')).toHaveCount(1);
}
