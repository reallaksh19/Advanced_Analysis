import { expect, test } from '@playwright/test';

const PACKAGE = {
  schema: 'inputxml-managed-stage/v1',
  packageHash: 'PHASE8-BROWSER',
  objects: [
    component('PIPE-8', 'PIPE', {
      nativeParams: { startPoint: [0, 0, 0], endPoint: [1000, 0, 0] },
      sourceAttributes: { PIPE_OD: 168.3 },
    }),
    component('ELBOW-8', 'ELBOW', {
      points: [point(1000, 0, 0, 168.3), point(1500, 500, 0, 168.3)],
      centrePoint: point(1000, 500, 0),
      sourceAttributes: { PIPE_OD: 168.3 },
    }),
    component('TEE-8', 'TEE', {
      points: [point(1500, 500, 0), point(2500, 500, 0), point(2000, 1100, 0)],
      centrePoint: point(2000, 500, 0),
      sourceAttributes: { PIPE_OD: 168.3, BRANCH_OD: 114.3 },
    }),
    component('REDUCER-8', 'REDUCER', {
      nativeParams: { startPoint: [2500, 500, 0], endPoint: [3000, 500, 0] },
      sourceAttributes: { OD1: 168.3, OD2: 114.3 },
    }),
    component('FLANGE-8', 'FLANGE', {
      nativeParams: { startPoint: [3000, 500, 0], endPoint: [3060, 500, 0] },
      sourceAttributes: { FLANGE_OD: 285, FLANGE_THICKNESS: 30 },
    }),
    component('VALVE-8', 'VALVE', {
      nativeParams: { startPoint: [3060, 500, 0], endPoint: [3560, 500, 0] },
      sourceAttributes: { BODY_DIAMETER: 260 },
    }),
    component('SUPPORT-8', 'GUIDE', {
      sourceAttributes: { CENTER: '2100 0 -250', SUPPORT_SIZE: 180 },
    }),
    component('PIPE-FALLBACK-8', 'PIPE', {
      nativeParams: { startPoint: [0, 1000, 0], endPoint: [800, 1000, 0] },
    }),
    component('VALVE-SKIPPED-8', 'VALVE', {}),
  ],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d';
  });
});

test('renders seven engineering kinds through the resolved geometry boundary', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'phase8.json', PACKAGE);

  const host = page.locator('[data-role="viewport-render-host"]');
  await expect(host).toHaveAttribute('data-viewport-backend', 'canvas2d');
  await expect(host).toHaveAttribute('data-renderable-count', '8');
  await expect(host).toHaveAttribute('data-resolved-count', '7');
  await expect(host).toHaveAttribute('data-fallback-count', '1');
  await expect(host).toHaveAttribute('data-skipped-count', '1');
  await expect(host).toHaveAttribute(
    'data-component-kinds',
    'ELBOW,FLANGE,PIPE,REDUCER,SUPPORT,TEE,VALVE',
  );
  await expect(page.locator('[data-role="viewport-status"]')).toContainText('7 resolved');
  await expect(page.locator('[data-role="viewport-status"]')).toContainText('1 fallback');
  await expect(page.locator('[data-role="viewport-status"]')).toContainText('1 skipped');
});

test('compound engineering components remain entity-selectable', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await uploadJson(page, 'phase8.json', PACKAGE);

  for (const entityId of ['ELBOW-8', 'TEE-8', 'REDUCER-8', 'FLANGE-8', 'VALVE-8', 'SUPPORT-8']) {
    await page.locator(`[data-entity-id="${entityId}"]`).click();
    await expect(page.locator('[data-role="viewport-render-host"]'))
      .toHaveAttribute('data-selected-entity-id', entityId);
    await expect(page.locator('[data-role="viewport-selection"]')).toHaveText(`Selection: ${entityId}`);
  }
});

test('invalid import retains resolved geometry and clear destroys derived viewport state', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'phase8.json', PACKAGE);
  await page.evaluate(() => {
    document.querySelector('[data-role="viewport-render-host"] canvas').dataset.instanceToken = 'phase8';
  });

  await uploadJson(page, 'invalid.json', { schema: 'unsupported/v1', objects: [] });
  const host = page.locator('[data-role="viewport-render-host"]');
  await expect(host).toHaveAttribute('data-renderable-count', '8');
  await expect(host).toHaveAttribute('data-resolved-count', '7');
  await expect(page.locator('canvas[data-instance-token="phase8"]')).toHaveCount(1);
  await expect(page.locator('[data-role="viewport-status"]')).toContainText('retained 8 rendered');

  await page.locator('[data-action="clear-dataset"]').click();
  await expect(host).toHaveAttribute('data-renderable-count', '0');
  await expect(host).toHaveAttribute('data-resolved-count', '0');
  await expect(host).toHaveAttribute('data-fallback-count', '0');
  await expect(host).toHaveAttribute('data-component-kinds', '');

  await page.evaluate(() => AnalysisWorkspace.destroy());
  await expect(page.locator('.viewport-canvas')).toHaveCount(0);
  await expect(page.locator('#root')).toBeEmpty();
});

function component(id, type, extras) {
  return { id, name: id, type, sourcePath: `/AREA-8/LINE-8/${id}`, ...extras };
}

function point(x, y, z, bore) {
  return { x, y, z, ...(bore ? { bore } : {}) };
}

async function uploadJson(page, name, payload) {
  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}
