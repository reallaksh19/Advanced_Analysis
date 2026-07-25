import { test, expect } from '@playwright/test';

const SUPPORT_PACKAGE = {
  schema: 'rvm-selected-geometry-workspace-package/v1',
  packageHash: 'U7-SUPPORT-DATASET',
  geometry: {
    objects: [
      {
        id: 'PIPE-201',
        name: 'Pipe 201',
        type: 'PIPE',
        sourcePath: '/LINE-1/PIPE-201',
        sourceAttributes: {
          LINE_NO: 'LINE-1',
          PIPE_OD: 168.3,
          WALL_THICKNESS_MM: 7.11,
          MATERIAL_DENSITY_KG_M3: 7850,
          FLUID_DENSITY_OPE_KG_M3: 800,
          FLUID_DENSITY_HYD_KG_M3: 1000,
          INSULATION_THICKNESS_MM: 40,
          INSULATION_DENSITY_KG_M3: 120,
          TEMP_EXP_C1: 200,
        },
        nativeParams: { startPoint: [0, 0, 0], endPoint: [6000, 0, 0] },
      },
    ],
    supports: [
      {
        id: 'SUP-201',
        name: 'Guide Support 201',
        type: 'GUIDE',
        sourcePath: '/LINE-1/SUP-201',
        sourceAttributes: { SUPPORT_TYPE: 'Guide', PIPE_ID: 'PIPE-201', LINE_NO: 'LINE-1' },
        nativeParams: { center: [3000, 0, 0] },
      },
    ],
    branches: [],
  },
};

test.describe('Consolidated Analysis Workspace browser smoke', () => {
  test('loads the three-panel shell without legacy top navigation', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Simplified Analysis/i);
    await expect(page.locator('[data-panel="tree"]')).toHaveCount(1);
    await expect(page.locator('[data-panel="viewport"]')).toHaveCount(1);
    await expect(page.locator('[data-panel="properties"]')).toHaveCount(1);
    await expect(page.locator('nav')).toHaveCount(0);
  });

  test('direct EventBus selection updates properties without tree coupling', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      EventBus.publish('viewport:entitySelected', {
        entityId: 'PIPE-102',
        properties: { material: 'Steel' },
      });
    });

    const propertiesPanel = page.locator('[data-panel="properties"]');
    await expect(propertiesPanel).toContainText('PIPE-102');
    await expect(propertiesPanel).toContainText('material');
    await expect(propertiesPanel).toContainText('Steel');
  });

  test('tree selection reviews and runs contextual analysis without global routing', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-role="dataset-file"]').setInputFiles({
      name: 'support.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(SUPPORT_PACKAGE)),
    });

    await page.locator('[data-entity-id="SUP-201"]').click();
    await expect(page.locator('[data-panel="properties"]')).toContainText('SUP-201');
    await page.locator('[data-analysis-type="support-load"]').click();
    await expect(page.locator('[data-role="analysis-session-readiness"]')).toHaveText(
      'Ready for reviewed execution',
    );
    await page.getByRole('button', { name: 'Run reviewed analysis · support-load' }).click();
    await expect(page.locator('[data-role="analysis-status"]')).toHaveText(
      'support-load completed · CALCULATED',
    );
    await expect(page.locator('[data-role="viewport-selection"]')).toHaveText(
      'Selection: SUP-201',
    );
  });
});
