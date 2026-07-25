import { expect, test } from '@playwright/test';

const SEGMENT_PACKAGE = workspacePackage('PHASE4-SEGMENT', {
  id: 'PIPE-PICK-SEGMENT',
  name: 'Pickable Segment',
  type: 'PIPE',
  sourcePath: '/AREA-A/LINE-1/PIPE-PICK-SEGMENT',
  nativeParams: {
    startPoint: { x: 0, y: 0, z: 0 },
    endPoint: { x: 100, y: 0, z: 0 },
  },
});

const POINT_PACKAGE = workspacePackage('PHASE4-POINT', {
  id: 'SUP-PICK-POINT',
  name: 'Pickable Support Point',
  type: 'GUIDE',
  sourcePath: '/AREA-A/LINE-1/SUP-PICK-POINT',
  nativeParams: { center: { x: 0, y: 0, z: 0 } },
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d';
  });
});

test('tree selection requests mutate canonical state and synchronize all panels', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'segment.json', SEGMENT_PACKAGE);
  await page.evaluate(() => {
    globalThis.__phase4SelectionRequests = [];
    EventBus.subscribe('viewport:selectionRequested', (payload) => {
      globalThis.__phase4SelectionRequests.push(payload);
    });
  });

  const treeEntity = page.locator('[data-entity-id="PIPE-PICK-SEGMENT"]');
  await treeEntity.click();

  await expect(treeEntity).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-role="viewport-selection"]')).toHaveText(
    'Selection: PIPE-PICK-SEGMENT',
  );
  await expect(page.locator('[data-role="properties-content"]')).toContainText(
    'PIPE-PICK-SEGMENT',
  );
  await expect(page.locator('[data-role="viewport-render-host"]')).toHaveAttribute(
    'data-selected-entity-id',
    'PIPE-PICK-SEGMENT',
  );

  const result = await page.evaluate(() => ({
    selectedEntityId: AnalysisWorkspace.getSnapshot().selectedEntityId,
    requests: globalThis.__phase4SelectionRequests,
  }));
  expect(result.selectedEntityId).toBe('PIPE-PICK-SEGMENT');
  expect(result.requests).toEqual([
    { entityId: 'PIPE-PICK-SEGMENT', source: 'tree' },
  ]);
});

test('canvas segment hit selects through WorkspaceState without replacing the canvas', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'segment.json', SEGMENT_PACKAGE);
  const canvas = page.locator('canvas[data-viewport-backend="canvas2d"]');
  await expect(canvas).toBeVisible();
  await page.evaluate(() => { globalThis.__phase4Canvas = document.querySelector('canvas'); });

  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width - 28, box.y + box.height - 28);

  await expect(page.locator('[data-entity-id="PIPE-PICK-SEGMENT"]')).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(page.locator('[data-role="properties-content"]')).toContainText(
    'Pickable Segment',
  );
  expect(await page.evaluate(() => AnalysisWorkspace.getSnapshot().selectedEntityId)).toBe(
    'PIPE-PICK-SEGMENT',
  );
  expect(await page.evaluate(() => globalThis.__phase4Canvas === document.querySelector('canvas'))).toBe(true);
});

test('canvas point hit selects and an empty-space click retains the selection', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'point.json', POINT_PACKAGE);
  const canvas = page.locator('canvas[data-viewport-backend="canvas2d"]');
  const box = await canvas.boundingBox();

  await page.mouse.click(box.x + 28, box.y + box.height - 28);
  expect(await page.evaluate(() => AnalysisWorkspace.getSnapshot().selectedEntityId)).toBe(
    'SUP-PICK-POINT',
  );
  await expect(page.locator('[data-entity-id="SUP-PICK-POINT"]')).toHaveAttribute(
    'aria-current',
    'true',
  );

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await page.evaluate(() => AnalysisWorkspace.getSnapshot().selectedEntityId)).toBe(
    'SUP-PICK-POINT',
  );
});

test('direct selected notification updates consumers but cannot mutate WorkspaceState', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'segment.json', SEGMENT_PACKAGE);

  await page.evaluate(() => {
    EventBus.publish('viewport:entitySelected', {
      entityId: 'DIRECT-COMPAT',
      type: 'pipe',
      properties: { compatibility: 'direct-notification' },
    });
  });

  await expect(page.locator('[data-role="properties-content"]')).toContainText('DIRECT-COMPAT');
  await expect(page.locator('[data-role="properties-content"]')).toContainText(
    'direct-notification',
  );
  expect(await page.evaluate(() => AnalysisWorkspace.getSnapshot().selectedEntityId)).toBe('');
  await expect(page.locator('[data-entity-id="PIPE-PICK-SEGMENT"]')).not.toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('clear and destroy remove selection, pick state, listeners, and canvas', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'point.json', POINT_PACKAGE);
  const canvas = page.locator('canvas[data-viewport-backend="canvas2d"]');
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + 28, box.y + box.height - 28);

  await page.locator('[data-action="clear-dataset"]').click();
  await expect(page.locator('[data-role="viewport-selection"]')).toHaveText('Selection: none');
  await expect(page.locator('[data-role="viewport-render-host"]')).toHaveAttribute(
    'data-selected-entity-id',
    '',
  );
  expect((await page.evaluate(() => AnalysisWorkspace.getSnapshot())).status).toBe('empty');

  await page.evaluate(() => AnalysisWorkspace.destroy());
  await expect(page.locator('#root')).toBeEmpty();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => EventBus.listenerCount('viewport:selectionRequested'))).toBe(0);
  expect(await page.evaluate(() => EventBus.listenerCount('viewport:entitySelected'))).toBe(0);
});

function workspacePackage(packageHash, entity) {
  const support = entity.type === 'GUIDE';
  return {
    schema: 'rvm-selected-geometry-workspace-package/v1',
    packageHash,
    geometry: {
      objects: support ? [] : [entity],
      supports: support ? [entity] : [],
      branches: [],
    },
  };
}

async function uploadJson(page, name, payload) {
  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}
