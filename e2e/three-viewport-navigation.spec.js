import { expect, test } from '@playwright/test';

const NAVIGATION_PACKAGE = {
  schema: 'rvm-selected-geometry-workspace-package/v1',
  packageHash: 'WP-NAV-REAL-WEBGL-DATASET',
  geometry: {
    objects: [
      {
        id: 'PIPE-NAV-1',
        name: 'Navigation Pipe 1',
        type: 'PIPE',
        sourcePath: '/AREA-N/LINE-N/PIPE-NAV-1',
        nativeParams: {
          startPoint: [0, 0, 0],
          endPoint: [1200, 300, 100],
        },
      },
      {
        id: 'PIPE-NAV-2',
        name: 'Navigation Pipe 2',
        type: 'PIPE',
        sourcePath: '/AREA-N/LINE-N/PIPE-NAV-2',
        nativeParams: {
          startPoint: [1200, 300, 100],
          endPoint: [1200, 900, 500],
        },
      },
    ],
    supports: [],
    branches: [],
  },
};

test('[REAL DATA] standard views and projection toggle retain a live WebGL viewport', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'webgl';
  });
  await page.goto('/');
  await uploadJson(page, 'wp-nav-real-webgl.json', NAVIGATION_PACKAGE);

  const host = page.locator('[data-role="viewport-render-host"]');
  const canvas = host.locator('canvas[data-viewport-backend="webgl"]');
  await expect(host).toHaveAttribute('data-viewport-backend', 'webgl');
  await expect(host).not.toHaveAttribute('data-viewport-blocked', 'true');
  await expect(host).toHaveAttribute('data-renderable-count', '2');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveCount(1);
  await canvas.evaluate((element) => { element.dataset.instanceToken = 'wp-nav-stable'; });

  const contextIsLive = await canvas.evaluate((element) => {
    const context = element.getContext('webgl2') || element.getContext('webgl');
    return Boolean(context && !context.isContextLost());
  });
  expect(contextIsLive).toBe(true);

  await page.locator('[data-viewport-action="view-front"]').click();
  await expect(host).toHaveAttribute('data-view-command', 'front');
  await page.locator('[data-viewport-action="view-right"]').click();
  await expect(host).toHaveAttribute('data-view-command', 'right');
  await page.locator('[data-viewport-action="toggle-projection"]').click();
  await page.locator('[data-viewport-action="view-top"]').click();
  await expect(host).toHaveAttribute('data-view-command', 'top');
  await expect(host.locator('canvas[data-instance-token="wp-nav-stable"]')).toHaveCount(1);
  expect(pageErrors).toEqual([]);

  await page.evaluate(() => AnalysisWorkspace.destroy());
  await expect(page.locator('.viewport-canvas')).toHaveCount(0);
});

async function uploadJson(page, name, payload) {
  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}
