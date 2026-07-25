import { expect, test } from '@playwright/test';

const RENDER_PACKAGE = {
  schema: 'rvm-selected-geometry-workspace-package/v1',
  packageHash: 'PHASE3-RENDER-DATASET',
  geometry: {
    objects: [
      {
        id: 'PIPE-RENDER-1',
        name: 'Render Pipe 1',
        type: 'PIPE',
        sourcePath: '/AREA-R/LINE-R/PIPE-RENDER-1',
        nativeParams: { startPoint: [0, 0, 0], endPoint: [1000, 200, 0] },
      },
      {
        id: 'VALVE-SKIPPED-1',
        name: 'Valve Without Coordinates',
        type: 'VALVE',
        sourcePath: '/AREA-R/LINE-R/VALVE-SKIPPED-1',
      },
    ],
    supports: [
      {
        id: 'SUP-RENDER-1',
        name: 'Render Support 1',
        type: 'GUIDE',
        sourcePath: '/AREA-R/LINE-R/SUP-RENDER-1',
        sourceAttributes: { CENTER: '500 100 120' },
      },
    ],
    branches: [],
  },
};

test('renders the versioned model with deterministic canvas fallback', async ({ page }) => {
  await forceCanvasBackend(page);
  await page.goto('/');
  await uploadJson(page, 'phase3-render.json', RENDER_PACKAGE);

  const host = page.locator('[data-role="viewport-render-host"]');
  await expect(host).toHaveAttribute('data-viewport-backend', 'canvas2d');
  await expect(host).toHaveAttribute('data-renderable-count', '2');
  await expect(host).toHaveAttribute('data-skipped-count', '1');
  await expect(page.locator('canvas[data-viewport-backend="canvas2d"]')).toBeVisible();
  await expect(page.locator('[data-role="viewport-status"]')).toContainText('2 rendered');
  await expect(page.locator('[data-role="viewport-status"]')).toContainText('1 skipped');
});

test('selection highlights without replacing the rendered canvas', async ({ page }) => {
  await forceCanvasBackend(page);
  await page.goto('/');
  await uploadJson(page, 'phase3-render.json', RENDER_PACKAGE);

  await page.evaluate(() => {
    document.querySelector('[data-role="viewport-render-host"] canvas').dataset.instanceToken = 'stable';
  });
  await page.locator('[data-entity-id="PIPE-RENDER-1"]').click();

  const host = page.locator('[data-role="viewport-render-host"]');
  await expect(host).toHaveAttribute('data-selected-entity-id', 'PIPE-RENDER-1');
  await expect(page.locator('[data-role="viewport-selection"]')).toHaveText('Selection: PIPE-RENDER-1');
  await expect(page.locator('canvas[data-instance-token="stable"]')).toHaveCount(1);
});

test('fit and reset commands remain scoped to the viewport', async ({ page }) => {
  await forceCanvasBackend(page);
  await page.goto('/');
  await uploadJson(page, 'phase3-render.json', RENDER_PACKAGE);

  await page.getByRole('button', { name: 'Fit View' }).click();
  await expect(page.locator('[data-role="viewport-render-host"]')).toHaveAttribute('data-view-command', 'fit');
  await page.getByRole('button', { name: 'Reset View' }).click();
  await expect(page.locator('[data-role="viewport-render-host"]')).toHaveAttribute('data-view-command', 'reset');
});

test('invalid import retains the rendered model and canvas instance', async ({ page }) => {
  await forceCanvasBackend(page);
  await page.goto('/');
  await uploadJson(page, 'phase3-render.json', RENDER_PACKAGE);
  await page.evaluate(() => {
    document.querySelector('[data-role="viewport-render-host"] canvas').dataset.instanceToken = 'retained';
  });

  await uploadJson(page, 'invalid.json', { schema: 'unsupported/v1', objects: [] });

  const host = page.locator('[data-role="viewport-render-host"]');
  await expect(host).toHaveAttribute('data-renderable-count', '2');
  await expect(host).toHaveAttribute('data-skipped-count', '1');
  await expect(page.locator('canvas[data-instance-token="retained"]')).toHaveCount(1);
  await expect(page.locator('[data-role="viewport-status"]')).toContainText('retained 2 rendered');
});

test('clear and destroy dispose visible viewport state', async ({ page }) => {
  await forceCanvasBackend(page);
  await page.goto('/');
  await uploadJson(page, 'phase3-render.json', RENDER_PACKAGE);

  await page.locator('[data-action="clear-dataset"]').click();
  await expect(page.locator('[data-role="viewport-render-host"]')).toHaveAttribute('data-renderable-count', '0');
  await expect(page.locator('[data-role="viewport-status"]')).toHaveText('No dataset loaded');

  await page.evaluate(() => AnalysisWorkspace.destroy());
  await expect(page.locator('.viewport-canvas')).toHaveCount(0);
  await expect(page.locator('#root')).toBeEmpty();
});

test('automatic backend selection creates a usable canvas', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'phase3-render.json', RENDER_PACKAGE);

  const host = page.locator('[data-role="viewport-render-host"]');
  await expect(host).toHaveAttribute('data-viewport-backend', /^(webgl|canvas2d)$/);
  await expect(host.locator('canvas')).toBeVisible();
  await expect(host).toHaveAttribute('data-renderable-count', '2');
});

async function forceCanvasBackend(page) {
  await page.addInitScript(() => {
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d';
  });
}

async function uploadJson(page, name, payload) {
  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}
