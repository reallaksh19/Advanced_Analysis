import { expect, test } from '@playwright/test';

const REAL_PACKAGE = {
  schema: 'rvm-selected-geometry-workspace-package/v1',
  packageHash: 'REAL-DATASET-001',
  source: { sourceFileName: 'real-workspace.json' },
  geometry: {
    objects: [
      {
        id: 'PIPE-REAL-1',
        name: 'Real Pipe 1',
        type: 'PIPE',
        sourcePath: '/AREA-A/LINE-100/PIPE-REAL-1',
        sourceAttributes: { MATERIAL: 'A106-B', LINE_NO: 'LINE-100' },
        attributes: { OD_MM: 168.3, WT_MM: 7.11 },
        nativeParams: { startPoint: [0, 0, 0], endPoint: [1200, 0, 0] },
      },
    ],
    supports: [
      {
        id: 'SUP-REAL-1',
        name: 'Real Guide 1',
        type: 'GUIDE',
        sourcePath: '/AREA-A/LINE-100/SUP-REAL-1',
        sourceAttributes: { GAP_MM: 5, SUPPORT_TYPE: 'GUIDE', CENTER: '600 100 0' },
      },
    ],
    branches: [],
  },
};

test('imports a real package and drives panels through state and EventBus', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'real-workspace.json', REAL_PACKAGE);

  await expect(page.locator('[data-role="tree-status"]')).toContainText('REAL-DATASET-001');
  await expect(page.locator('[data-role="tree-status"]')).toContainText('2 entities');
  await expect(page.locator('[data-entity-id="PIPE-REAL-1"]')).toBeVisible();
  await expect(page.locator('[data-entity-id="SUP-REAL-1"]')).toBeVisible();
  await expect(page.locator('[data-role="viewport-status"]')).toContainText('2 rendered');

  await page.locator('[data-entity-id="PIPE-REAL-1"]').click();
  await expect(page.locator('[data-role="viewport-selection"]')).toHaveText('Selection: PIPE-REAL-1');
  const properties = page.locator('[data-role="properties-content"]');
  await expect(properties).toContainText('PIPE-REAL-1');
  await expect(properties).toContainText('sourceAttributes.MATERIAL');
  await expect(properties).toContainText('A106-B');

  const snapshot = await page.evaluate(() => AnalysisWorkspace.getSnapshot());
  expect(snapshot.dataset.datasetId).toBe('REAL-DATASET-001');
  expect(snapshot.selectedEntityId).toBe('PIPE-REAL-1');
});

test('invalid import preserves the previous valid dataset and shows a scoped error', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'real-workspace.json', REAL_PACKAGE);
  await expect(page.locator('[data-entity-id="PIPE-REAL-1"]')).toBeVisible();

  await uploadJson(page, 'invalid.json', { schema: 'unsupported/v1', objects: [] });

  await expect(page.locator('[data-role="tree-error"]')).toBeVisible();
  await expect(page.locator('[data-role="tree-error"]')).toContainText('Unsupported workspace package schema');
  await expect(page.locator('[data-entity-id="PIPE-REAL-1"]')).toBeVisible();
  await expect(page.locator('[data-role="tree-status"]')).toContainText('retained 2 entities');
  await expect(page.locator('[data-role="viewport-status"]')).toContainText('retained 2 rendered');

  const snapshot = await page.evaluate(() => AnalysisWorkspace.getSnapshot());
  expect(snapshot.dataset.datasetId).toBe('REAL-DATASET-001');
});

test('clear removes dataset state without cross-panel mutation', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'real-workspace.json', REAL_PACKAGE);
  await page.locator('[data-entity-id="SUP-REAL-1"]').click();

  await page.locator('[data-action="clear-dataset"]').click();

  await expect(page.locator('[data-role="tree-status"]')).toHaveText('No dataset loaded');
  await expect(page.locator('[data-role="viewport-status"]')).toHaveText('No dataset loaded');
  await expect(page.locator('[data-role="viewport-selection"]')).toHaveText('Selection: none');
  await expect(page.locator('[data-role="viewport-render-host"]')).toHaveAttribute('data-renderable-count', '0');
  expect((await page.evaluate(() => AnalysisWorkspace.getSnapshot())).status).toBe('empty');
});

async function uploadJson(page, name, payload) {
  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}
