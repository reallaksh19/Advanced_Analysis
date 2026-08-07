import { readFile, stat } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';

test('CSV and XLSX export the certified Table projection without changing authority', async ({ page }) => {
  const pageErrors = []; const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.setViewportSize({ width: 1720, height: 1080 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
  const host = await openProductionController(page);
  await expect.poll(() => host.getAttribute('data-topology-edit-table-projection-hash')).toBeTruthy();
  const before = await authority(page);

  const csvButton = page.locator('[data-table-action="export-csv"]');
  const xlsxButton = page.locator('[data-table-action="export-xlsx"]');
  await expect(csvButton).toBeVisible();
  await expect(csvButton).toBeEnabled();
  await expect(xlsxButton).toBeVisible();
  await expect(xlsxButton).toBeEnabled();

  const [csvDownload] = await Promise.all([
    page.waitForEvent('download'),
    csvButton.click(),
  ]);
  expect(csvDownload.suggestedFilename()).toMatch(/-3d-edit-[a-f0-9]+\.csv$/iu);
  const csvPath = await csvDownload.path();
  const csv = await readFile(csvPath, 'utf8');
  expect(csv).toContain('Tag,Type,Line,Connect From,Connect To');
  expect(csv).toContain('Canonical ID');
  await expect.poll(() => host.getAttribute('data-topology-edit-table-last-export-format')).toBe('CSV');
  const csvHash = await host.getAttribute('data-topology-edit-table-last-export-hash');
  expect(csvHash).toBeTruthy();
  expectAuthorityNoop(await authority(page), before);

  const [xlsxDownload] = await Promise.all([
    page.waitForEvent('download'),
    xlsxButton.click(),
  ]);
  expect(xlsxDownload.suggestedFilename()).toMatch(/-3d-edit-[a-f0-9]+\.xlsx$/iu);
  const xlsxPath = await xlsxDownload.path();
  expect((await stat(xlsxPath)).size).toBeGreaterThan(1000);
  const workbook = XLSX.read(await readFile(xlsxPath), { type: 'buffer' });
  expect(workbook.SheetNames).toEqual([
    'Elements', 'Connections', 'Source Mapping', 'Catalogue Evidence', 'Export Metadata',
  ]);
  const metadata = XLSX.utils.sheet_to_json(workbook.Sheets['Export Metadata'], { header: 1, raw: true });
  const metadataMap = new Map(metadata.slice(1).map((row) => [row[0], row[1]]));
  expect(metadataMap.get('Canonical Hash')).toBe(before.canonicalHash);
  expect(metadataMap.get('Source Hash')).toBe(before.sourceHash);
  expect(metadataMap.get('Journal Hash')).toBe(before.journalHash);
  expect(metadataMap.get('Active Ledger Hash')).toBe(before.activeLedgerHash);
  await expect.poll(() => host.getAttribute('data-topology-edit-table-last-export-format')).toBe('XLSX');
  expect(await host.getAttribute('data-topology-edit-table-last-export-hash')).toBe(csvHash);
  expectAuthorityNoop(await authority(page), before);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((message) => !message.includes('favicon'))).toEqual([]);
});

async function openProductionController(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await navigation.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.locator('[data-action="load-topology-edit-demo"]').click();
  await expect.poll(() => page.evaluate(() => globalThis.AnalysisWorkspace?.getSnapshot?.()?.dataset?.entities?.length ?? 0)).toBe(20);
  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(
    document.querySelector('[data-role="topology-edit-render-host"]')?.__topologyEditAuthoringController?.tableAdapter?.runtime,
  ))).toBe(true);
  const tablePanel = page.locator('details[data-panel-kind="table"]');
  await expect(tablePanel).toBeVisible();
  if (!(await tablePanel.evaluate((element) => element.open))) {
    await tablePanel.locator('summary').click();
  }
  await expect(tablePanel).toHaveJSProperty('open', true);
  return host;
}

async function authority(page) {
  return page.evaluate(() => {
    const controller = document.querySelector('[data-role="topology-edit-render-host"]')?.__topologyEditAuthoringController;
    const session = controller?.session; const journal = session?.journal;
    return {
      canonicalHash: session?.currentTopology?.()?.canonicalTopologyHash ?? null,
      journalHash: journal?.journalHash ?? null,
      activeLedgerHash: journal?.activeLedgerHash ?? null,
      activeCommandIds: [...(journal?.activeCommandIds ?? [])],
      sessionVersion: journal?.sessionVersion ?? null,
      sourceHash: controller?.workspaceDataset?.sourceSnapshot?.sourceSemanticHash ?? null,
      sourceByteHash: controller?.workspaceDataset?.sourceSnapshot?.sourceByteHash ?? null,
      rendererCount: controller?.viewportBackend?.renderer?.domElement ? 1 : 0,
    };
  });
}
function expectAuthorityNoop(actual, expected) {
  expect(actual.canonicalHash).toBe(expected.canonicalHash);
  expect(actual.journalHash).toBe(expected.journalHash);
  expect(actual.activeLedgerHash).toBe(expected.activeLedgerHash);
  expect(actual.activeCommandIds).toEqual(expected.activeCommandIds);
  expect(actual.sessionVersion).toBe(expected.sessionVersion);
  expect(actual.sourceHash).toBe(expected.sourceHash);
  expect(actual.sourceByteHash).toBe(expected.sourceByteHash);
  expect(actual.rendererCount).toBe(expected.rendererCount);
}
