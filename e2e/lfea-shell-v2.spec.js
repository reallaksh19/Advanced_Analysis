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

async function openEmbeddedShell(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    errors.push(`requestfailed: ${request.url()} — ${request.failure()?.errorText ?? 'unknown'}`);
  });
  await page.goto('/');
  await page.waitForTimeout(750);
  const nav = page.locator('[data-application-nav="LFEA"]');
  const navCount = await nav.count();
  if (navCount !== 1) {
    const body = (await page.locator('body').innerText()).slice(0, 3000);
    throw new Error(
      `Embedded shell failed to boot; LFEA nav count=${navCount}.\n`
      + `${errors.join('\n')}\nBODY:\n${body}`,
    );
  }
  await nav.click();
}

test('Shell V2 renders as the embedded LFEA workbench with explicit blocked EnrichedSjson state', async ({ page }) => {
  await openEmbeddedShell(page);
  const workbench = page.locator('[data-role="lfea-workbench"]');

  await expect(workbench).toHaveClass(/lfea-shell-v2/u);
  await expect(workbench.locator('.lfea-shell-v2__navigator')).toBeVisible();
  await expect(workbench.locator('.lfea-shell-v2__viewport')).toBeVisible();
  await expect(workbench.locator('.lfea-shell-v2__inspector')).toBeVisible();
  await expect(workbench.locator('.lfea-shell-v2__pipeline')).toBeVisible();

  const blocked = workbench.locator('[data-role="lfea-enriched-sjson-capability"]');
  await expect(blocked).toHaveAttribute('data-status', 'BLOCKED');
  await expect(blocked).toContainText('LFEA_ENRICHED_SJSON_PIPING_ADAPTER_NOT_WIRED');
  await expect(workbench.locator('[data-role="lfea-enriched-sjson-import"]')).toBeDisabled();
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
