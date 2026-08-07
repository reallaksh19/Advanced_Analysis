import { expect, test } from '@playwright/test';
import { rectangularQ4Package } from '../scripts/lfea-005-fixtures.mjs';

async function importFixture(workbench) {
  const packageValue = rectangularQ4Package({});
  await workbench.locator('[data-role="lfea-import"]').setInputFiles({
    name: 'lfea-shell-v2-q4.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(packageValue)),
  });
  return packageValue;
}

test('Shell V2 renders as the embedded LFEA workbench with explicit blocked EnrichedSjson state', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-application-nav="LFEA"]').click();
  const workbench = page.locator('[data-role="lfea-workbench"]');

  await expect(workbench).toHaveClass(/lfea-shell-v2/u);
  await expect(workbench.locator('.lfea-shell-v2__navigator')).toBeVisible();
  await expect(workbench.locator('.lfea-shell-v2__viewport')).toBeVisible();
  await expect(workbench.locator('.lfea-shell-v2__inspector')).toBeVisible();
  await expect(workbench.locator('.lfea-shell-v2__pipeline')).toBeVisible();

  const blocked = workbench.locator('[data-role="lfea-enriched-sjson-capability"]');
  await expect(blocked).toHaveAttribute('data-status', 'BLOCKED');
  await expect(blocked).toContainText('LFEA_ENRICHED_SJSON_PIPING_ADAPTER_NOT_WIRED');
});

test('standalone LFEA entry mounts the same controller/store workbench', async ({ page }) => {
  await page.goto('/lfea.html');
  const workbench = page.locator('[data-role="lfea-workbench"]');
  await expect(workbench).toBeVisible();
  await expect(workbench).toHaveClass(/lfea-shell-v2/u);

  const packageValue = await importFixture(workbench);
  await expect(workbench.locator('.lfea-workbench__status')).toHaveText('READY');
  const state = await page.evaluate(() => globalThis.LfeaStandalone.getState());
  expect(state.packageValue.semanticHash).toBe(packageValue.semanticHash);
  expect(state.execution).toBeNull();

  await workbench.locator('[data-role="lfea-run"]').click();
  await expect(workbench.locator('.lfea-workbench__status')).toHaveText('QUALIFIED');
  await expect(workbench.locator('[data-role="lfea-export-evidence"]')).toBeEnabled();
  await expect(workbench.locator('.lfea-shell-v2__pipeline-step[data-state="COMPLETE"]')).toHaveCount(7);
});
