import { expect, test } from '@playwright/test';
import { rectangularQ4Package } from '../scripts/lfea-005-fixtures.mjs';

test('LFEA edits a mesh package and runs through qualified evidence export', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-application-nav="LFEA"]').click();
  const workbench = page.locator('[data-role="lfea-workbench"]');
  await expect(workbench).toBeVisible();
  await workbench.locator('[data-role="lfea-import"]').setInputFiles({
    name: 'lfea-q4-simulated.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(rectangularQ4Package({}))),
  });
  await expect(workbench.locator('.lfea-workbench__status')).toHaveText('READY');
  await expect(workbench.locator('.lfea-workbench-svg__element')).toHaveCount(1);
  await workbench.locator('[data-role="lfea-run"]').click();
  await expect(workbench.locator('.lfea-workbench__status')).toHaveText('QUALIFIED');
  await expect(workbench.locator('[data-role="lfea-review-summary"]')).toContainText('QUALIFIED_EXPORT');
  await workbench.locator('[data-role="lfea-result-mode"]').selectOption('PROJECTED_STRESS');
  await expect(workbench.locator('.lfea-workbench__authority', { hasText: 'NON_AUTHORITATIVE' }).first()).toBeVisible();
});

test('LFEA rejects a stale semantic hash and does not run a solver fallback', async ({ page }) => {
  const forged = rectangularQ4Package({});
  forged.nodes[0].x += 0.01;
  await page.goto('/');
  await page.locator('[data-application-nav="LFEA"]').click();
  const workbench = page.locator('[data-role="lfea-workbench"]');
  await workbench.locator('[data-role="lfea-import"]').setInputFiles({
    name: 'forged-lfea.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(forged)),
  });
  await expect(workbench.locator('.lfea-workbench__status')).toHaveText('FAILED');
  await expect(workbench.locator('[data-role="lfea-diagnostics"]')).toContainText('semantic hash');
  await expect(workbench.locator('[data-role="lfea-review-summary"]')).toHaveCount(0);
});
