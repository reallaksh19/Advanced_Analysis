import fs from 'node:fs';
import { expect, test } from '@playwright/test';

const ENGINEERING_ATTRIBUTES = {
  LINE_NO: 'LINE-700',
  PIPE_OD: 168.3,
  WALL_THICKNESS_MM: 7.11,
  MATERIAL_DENSITY_KG_M3: 7850,
  FLUID_DENSITY_OPE_KG_M3: 800,
  FLUID_DENSITY_HYD_KG_M3: 1000,
  INSULATION_THICKNESS_MM: 40,
  INSULATION_DENSITY_KG_M3: 120,
  TEMP_EXP_C1: 200,
  REFERENCE_TEMP_C: 20,
  ALPHA_PER_C: 0.000012,
  E_MPA: 200000,
  SA_MPA: 100,
};

const COMPLETE_PACKAGE = {
  schema: 'rvm-selected-geometry-workspace-package/v1',
  packageHash: 'PHASE7-LEDGER',
  geometry: {
    objects: [
      pipe('PIPE-LEDGER-1', [0, 0, 0], [6000, 0, 0], ENGINEERING_ATTRIBUTES),
      pipe('PIPE-LEDGER-2', [6000, 0, 0], [6000, 3000, 0], { LINE_NO: 'LINE-700' }),
    ],
    supports: [],
    branches: [],
  },
};

const INCOMPLETE_PACKAGE = {
  schema: 'rvm-selected-geometry-workspace-package/v1',
  packageHash: 'PHASE7-FAILED',
  geometry: {
    objects: [pipe('PIPE-FAILED', [0, 0, 0], [1000, 0, 0], { LINE_NO: 'LINE-F' })],
    supports: [],
    branches: [],
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d';
  });
});

test('reviewed reruns archive once, compare, activate, and export stable reports', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'ledger.json', COMPLETE_PACKAGE);
  await page.locator('[data-entity-id="PIPE-LEDGER-1"]').click();
  await page.locator('[data-analysis-type="support-load"]').click();

  await page.getByRole('button', { name: 'Run reviewed analysis · support-load' }).click();
  await expect(page.locator('[data-role="analysis-ledger-count"]')).toHaveText('1 entries');
  await expect(page.locator('[data-entry-id="analysis-ledger-entry-1"]')).toContainText('analysis-1');

  const pipeOd = page.locator('[data-session-field="pipeOdMm"]');
  await pipeOd.fill('219.1');
  await pipeOd.blur();
  await page.getByRole('button', { name: 'Run reviewed analysis · support-load' }).click();
  await expect(page.locator('[data-role="analysis-ledger-count"]')).toHaveText('2 entries');
  await expect(page.locator('[data-entry-id="analysis-ledger-entry-2"]')).toContainText('analysis-2');
  await expect(page.locator('[data-entry-id="analysis-ledger-entry-2"]')).toHaveClass(/analysis-ledger-entry--active/);

  await page.getByRole('button', { name: 'Close input review' }).click();
  await expect(page.locator('[data-role="analysis-ledger-count"]')).toHaveText('2 entries');
  await page.locator('[data-entity-id="PIPE-LEDGER-2"]').click();
  await expect(page.locator('[data-role="analysis-ledger-count"]')).toHaveText('2 entries');
  await page.locator('[data-entity-id="PIPE-LEDGER-1"]').click();

  await ledgerAction(page, 'analysis-ledger-entry-1', 'compare-left');
  await ledgerAction(page, 'analysis-ledger-entry-2', 'compare-right');
  await expect(page.locator('[data-role="analysis-comparison-summary"]')).toContainText('changed');
  const ledger = await page.evaluate(() => AnalysisWorkspace.getAnalysisLedger());
  expect(ledger.comparison).toEqual({
    leftEntryId: 'analysis-ledger-entry-1',
    rightEntryId: 'analysis-ledger-entry-2',
  });

  await ledgerAction(page, 'analysis-ledger-entry-1', 'activate');
  await expect(page.locator('[data-entry-id="analysis-ledger-entry-1"]')).toHaveClass(/analysis-ledger-entry--active/);

  const json = await downloadReport(page, 'Export JSON');
  const csv = await downloadReport(page, 'Export CSV');
  const markdown = await downloadReport(page, 'Export Markdown');
  expect(json.filename).toBe('analysis-phase7-ledger-analysis-ledger-entry-1-vs-analysis-ledger-entry-2.json');
  expect(csv.filename).toMatch(/\.csv$/);
  expect(markdown.filename).toMatch(/\.md$/);
  expect(JSON.parse(json.content).schema).toBe('analysis-report/v1');
  expect(json.content).toContain('analysis-session-1');
  expect(json.content).not.toMatch(/createdAt|timestamp/i);
  expect(csv.content).toContain('comparison');
  expect(markdown.content).toContain('# Analysis Report');
  await expect(page.locator('[data-role="analysis-export-status"]')).toContainText('Exported');
});

test('failed reviewed execution archives and history clears only at explicit dataset boundaries', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'failed.json', INCOMPLETE_PACKAGE);
  await page.locator('[data-entity-id="PIPE-FAILED"]').click();
  await page.locator('[data-analysis-type="support-load"]').click();

  await page.evaluate(() => {
    const session = AnalysisWorkspace.getAnalysisSession().session;
    EventBus.publish('analysis:requested', {
      analysisType: session.analysisType,
      targetId: session.targetId,
      sessionId: session.sessionId,
    });
  });
  await expect(page.locator('[data-role="analysis-status"]')).toHaveText('support-load failed');
  await expect(page.locator('[data-role="analysis-ledger-count"]')).toHaveText('1 entries');
  await expect(page.locator('[data-entry-id="analysis-ledger-entry-1"]')).toContainText('failed');

  await page.getByRole('button', { name: 'Close input review' }).click();
  expect((await page.evaluate(() => AnalysisWorkspace.getAnalysisLedger())).entries).toHaveLength(1);

  await page.getByRole('button', { name: 'Clear history' }).click();
  const clearedHistory = await page.evaluate(() => AnalysisWorkspace.getAnalysisLedger());
  expect(clearedHistory.entries).toHaveLength(0);
  expect(clearedHistory.datasetId).toBe('PHASE7-FAILED');

  await page.locator('[data-action="clear-dataset"]').click();
  const clearedDataset = await page.evaluate(() => AnalysisWorkspace.getAnalysisLedger());
  expect(clearedDataset.entries).toHaveLength(0);
  expect(clearedDataset.datasetId).toBe('');
});

test('destroy removes every ledger and export listener', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => AnalysisWorkspace.destroy());
  const topics = [
    'analysis:ledgerChanged',
    'analysis:ledgerActiveRequested',
    'analysis:ledgerComparisonRequested',
    'analysis:ledgerComparisonResetRequested',
    'analysis:ledgerClearRequested',
    'analysis:ledgerFailed',
    'analysis:exportRequested',
    'analysis:exportCompleted',
    'analysis:exportFailed',
  ];
  for (const topic of topics) {
    expect(await page.evaluate((value) => EventBus.listenerCount(value), topic)).toBe(0);
  }
});

async function ledgerAction(page, entryId, action) {
  await page.locator(`[data-entry-id="${entryId}"] [data-ledger-action="${action}"]`).click();
}

async function downloadReport(page, buttonName) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: buttonName }).click(),
  ]);
  const filePath = await download.path();
  return {
    filename: download.suggestedFilename(),
    content: fs.readFileSync(filePath, 'utf8'),
  };
}

function pipe(id, startPoint, endPoint, sourceAttributes) {
  return {
    id,
    name: id,
    type: 'PIPE',
    sourcePath: `/AREA-7/LINE-700/${id}`,
    sourceAttributes,
    nativeParams: { startPoint, endPoint },
  };
}

async function uploadJson(page, name, payload) {
  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}
