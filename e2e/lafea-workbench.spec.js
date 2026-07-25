import { expect, test } from '@playwright/test';
import { triangleSource } from '../scripts/lafea.3-fixtures.mjs';

test('LAFEA exposes five independent stages and runs editor-to-kernel evidence', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-application-nav="LAFEA"]').click();
  const workbench = page.locator('[data-role="lafea-workbench"]');
  await expect(workbench).toBeVisible();
  await expect(workbench.locator('[data-stage-id]')).toHaveCount(5);
  await workbench.getByRole('button', { name: /LAFEA\.3 2D continuum/u }).click();
  await workbench.locator('[data-role="lafea-import"]').setInputFiles({
    name: 'lafea-3-simulated.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(triangleSource())),
  });
  await expect(workbench.locator('.lafea-workbench__status')).toHaveText('READY');
  await expect(workbench.locator('.lafea-workbench-svg__node')).toHaveCount(3);
  await workbench.locator('[data-role="lafea-run"]').click();
  await expect(workbench.locator('.lafea-workbench__status')).toHaveText('QUALIFIED');
  await expect(workbench.locator('[data-role="lafea-result"]')).toContainText('"state": "ACCEPTED"');
});

test('LAFEA rejects malformed source without exposing a result', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-application-nav="LAFEA"]').click();
  const workbench = page.locator('[data-role="lafea-workbench"]');
  await workbench.locator('[data-role="lafea-import"]').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schema":"forged"}'),
  });
  await expect(workbench.locator('.lafea-workbench__status')).toHaveText('FAILED');
  await expect(workbench.locator('[data-role="lafea-diagnostics"]')).toContainText('schema');
  await expect(workbench.locator('[data-role="lafea-result"]')).toHaveCount(0);
});
