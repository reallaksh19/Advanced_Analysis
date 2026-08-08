import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('empty workspace creates a governed model and applies its first pipe from the table', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Application views' })
    .getByRole('button', { name: 'Workspace', exact: true })
    .click();

  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const dialog = page.locator('[data-role="native-model-dialog"]');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Model key').fill('FIRST-PIPE-QUALIFICATION');
  await dialog.getByLabel('Document ID').fill('FIRST-PIPE-001');
  await dialog.getByLabel('Revision').fill('A');
  await dialog.getByRole('button', { name: 'Create and open 3D Edit' }).click();

  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute('data-topology-edit-clean-shell', 'true');
  await expect(page.locator('[data-role="topbar-dataset"]')).toContainText('native-dataset:');

  await host.getByRole('button', { name: 'Engineering table', exact: true }).click();
  const table = host.locator('[data-role="topology-edit-table"]');
  await expect(table.getByText('Create first pipe', { exact: true })).toBeVisible();
  const preview = table.getByRole('button', { name: 'Preview first pipe', exact: true });
  await expect(preview).toBeEnabled();
  await preview.click();
  await expect(table.locator('output')).toContainText('Start Route preview ready');

  await table.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(table.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
  await table.getByRole('button', { name: 'Apply', exact: true }).click();

  await expect(table.locator('[data-table-row-id]')).toHaveCount(1);
  await expect(host.locator('[data-role="topology-edit-status"]'))
    .toContainText('Atomic three-command Start Route operation accepted');
});

test('support selection opens canonical inspection and can be focused', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Application views' })
    .getByRole('button', { name: 'Workspace', exact: true })
    .click();
  await page.locator('[data-action="load-topology-edit-demo"]').click();
  await expect.poll(() => page.evaluate(() => (
    globalThis.AnalysisWorkspace?.getSnapshot?.()?.dataset?.entities?.length ?? 0
  ))).toBe(20);
  await page.getByRole('button', { name: '3D Edit', exact: true }).click();

  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute('data-topology-edit-clean-shell', 'true');
  await expect(host).toHaveAttribute('data-topology-edit-render-item-count', /[1-9]\d*/);
  await expect(host).toHaveAttribute('data-topology-edit-table-projection-hash', /.+/);
  const support = page.locator(
    '[data-role="tree-list"] [data-entity-id="S-004"][data-action="select-entity"]',
  );
  await support.click();

  await expect(host).toHaveAttribute('data-topology-edit-selection-ids', 'support:S-004');
  await expect(host.locator('[data-inspection-entity="support:S-004"]')).toContainText('ANCHOR');
  const fitSelection = host.getByRole('button', { name: 'Fit selection', exact: true });
  await expect(fitSelection).toBeEnabled();
  await fitSelection.click();
  await expect(host.locator('[data-role="topology-edit-status"]')).toContainText('Focused');

  const restraintId = await page.evaluate(async () => {
    const moduleUrl = new URL(
      'src/workspace/topology-edit/topology-edit-source-adapter.js',
      document.baseURI,
    ).href;
    const { buildCanonicalTopologyFromWorkspaceDataset } = await import(moduleUrl);
    const canonical = buildCanonicalTopologyFromWorkspaceDataset(
      globalThis.AnalysisWorkspace.getSnapshot().dataset,
      globalThis.AnalysisWorkspace.getTopologyGraph(),
      globalThis.AnalysisWorkspace.getSupportAttachmentModel(),
      globalThis.AnalysisWorkspace.getRestraintCapabilityModel(),
    );
    const supportRow = canonical.supports.find((row) => row.id === 'support:S-004');
    const restraint = supportRow?.restraint?.restraints?.[0] ?? supportRow?.restraint;
    const id = restraint?.id ?? restraint?.restraintId;
    if (!id) throw new Error('Anchor restraint identity is unavailable.');
    globalThis.EventBus.publish('topologyEditSelection:requested', {
      action: 'REPLACE',
      source: 'inspector',
      canonicalIds: [id],
      workspaceEntityIds: [],
      primaryId: id,
      anchorId: id,
    });
    return id;
  });
  await expect(host).toHaveAttribute('data-topology-edit-selection-ids', restraintId);
  await expect(host.locator(`[data-inspection-entity="${restraintId}"]`)).toContainText('ANCHOR');
});
