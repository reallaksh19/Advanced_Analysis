import { expect, test } from '@playwright/test';

const SUPPORT_PACKAGE = {
  schema: 'rvm-selected-geometry-workspace-package/v1',
  packageHash: 'PHASE1-SUPPORT-DATASET',
  geometry: {
    objects: [],
    supports: [
      {
        id: 'SUP-201',
        name: 'Guide Support 201',
        type: 'GUIDE',
        sourcePath: '/LINE-1/SUP-201',
        sourceAttributes: { SUPPORT_TYPE: 'Guide' },
      },
    ],
    branches: [],
  },
};

test('publishes selection without left-panel coupling and detaches on destroy', async ({ page }) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await expect(navigation).toHaveCount(1);
  await navigation.getByRole('button', { name: 'Workspace', exact: true }).click();

  await expect(page.locator('.workspace-shell')).toBeVisible();
  await expect(page.locator('[data-panel="tree"]')).toHaveCount(1);
  await expect(page.locator('[data-panel="viewport"]')).toHaveCount(1);
  await expect(page.locator('[data-panel="properties"]')).toHaveCount(1);

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

  expect(await page.evaluate(() => EventBus.listenerCount('viewport:entitySelected'))).toBe(4);
  expect(await page.evaluate(() => EventBus.listenerCount('viewport:selectionRequested'))).toBe(1);

  await page.evaluate(() => AnalysisWorkspace.destroy());

  const topics = [
    'dataset:loadRequested',
    'dataset:clearRequested',
    'dataset:loaded',
    'dataset:loadFailed',
    'dataset:cleared',
    'workspace:snapshotChanged',
    'viewport:selectionRequested',
    'viewport:entitySelected',
    'analysis:capabilitiesChanged',
    'analysis:sessionOpenRequested',
    'analysis:sessionOverrideRequested',
    'analysis:sessionResetRequested',
    'analysis:sessionCloseRequested',
    'analysis:sessionChanged',
    'analysis:requested',
    'analysis:started',
    'analysis:completed',
    'analysis:failed',
  ];
  for (const topic of topics) {
    expect(await page.evaluate((value) => EventBus.listenerCount(value), topic)).toBe(0);
  }
});

test('tree selection remains event-driven when no analysis capability is applicable', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name: 'support.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(SUPPORT_PACKAGE)),
  });

  const support = page.locator('[data-entity-id="SUP-201"]');
  await support.click();
  await expect(support).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-panel="properties"]')).toContainText('SUP-201');
  await expect(page.locator('[data-panel="properties"]')).toContainText('Guide');
  await expect(page.locator('[data-role="viewport-selection"]')).toHaveText('Selection: SUP-201');

  const supportLoad = page.locator('[data-analysis-type="support-load"]');
  await expect(supportLoad).toBeDisabled();
  await expect(page.locator('[data-readiness-analysis-type="support-load"]')).toHaveAttribute(
    'data-qualification-status',
    'NOT_APPLICABLE',
  );
  await page.evaluate(() => {
    EventBus.publish('analysis:sessionOpenRequested', {
      analysisType: 'support-load',
      targetId: 'SUP-201',
    });
  });
  expect(await page.evaluate(() => AnalysisWorkspace.getAnalysisSession().session)).toBeNull();
});
