import { expect, test } from '@playwright/test';
import { triangleSource } from '../scripts/lafea.3-fixtures.mjs';

test('P0-E01 LFEA and LAFEA mount in distinct unique views', async ({ page }) => {
  await page.goto('/');
  const lafeaRoot = page.locator('[data-role="lafea-consumer-root"]');
  const lfeaRoot = page.locator('[data-role="lfea-consumer-root"]');
  await expect(lafeaRoot).toHaveCount(1);
  await expect(lfeaRoot).toHaveCount(1);
  expect(await page.evaluate(() =>
    document.querySelector('[data-role="lafea-consumer-root"]')
      === document.querySelector('[data-role="lfea-consumer-root"]'))).toBe(false);

  const lafeaView = page.locator('[data-application-view="LAFEA"]');
  const lfeaView = page.locator('[data-application-view="LFEA"]');
  await expect(lafeaView.locator('[data-role="lafea-workbench"]')).toHaveCount(1);
  await expect(lafeaView.locator('[data-role="lfea-workbench"]')).toHaveCount(0);
  await expect(lfeaView.locator('[data-role="lfea-workbench"]')).toHaveCount(1);
  await expect(lfeaView.locator('[data-role="lafea-workbench"]')).toHaveCount(0);

  // Each workbench controller destroys only its own named root by replacing
  // that root's children. Exercise that DOM boundary against the built app;
  // source-level controller ownership is independently enforced by the P0
  // containment check.
  const isolated = await page.evaluate(() => {
    const isolatedLafeaRoot = document.querySelector('[data-role="lafea-consumer-root"]');
    const isolatedLfeaRoot = document.querySelector('[data-role="lfea-consumer-root"]');
    isolatedLfeaRoot.replaceChildren();
    return {
      lafeaStillMounted: Boolean(isolatedLafeaRoot.querySelector('[data-role="lafea-workbench"]')),
      lfeaCleared: isolatedLfeaRoot.childElementCount === 0,
    };
  });
  expect(isolated).toEqual({ lafeaStillMounted: true, lfeaCleared: true });
});

test('P0-E02 switching tabs shows only the correct workbench', async ({ page }) => {
  await page.goto('/');
  const lafeaView = page.locator('[data-application-view="LAFEA"]');
  const lfeaView = page.locator('[data-application-view="LFEA"]');

  await page.locator('[data-application-nav="LAFEA"]').click();
  await expect(lafeaView).toBeVisible();
  await expect(lfeaView).toBeHidden();
  await expect(lafeaView.locator('[data-role="lafea-workbench"]')).toBeVisible();

  await page.locator('[data-application-nav="LFEA"]').click();
  await expect(lfeaView).toBeVisible();
  await expect(lafeaView).toBeHidden();
  await expect(lfeaView.locator('[data-role="lfea-workbench"]')).toBeVisible();
});

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
