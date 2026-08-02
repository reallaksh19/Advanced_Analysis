import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const REPORT_PATH = 'reports/qualification/topology-edit-professional-integration.json';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('production 3D Edit applies and restores an atomic professional operation', async ({ page }, testInfo) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await openProductionDemo(page);
  const host = page.locator('[data-role="topology-edit-render-host"]');
  const panel = page.locator('[data-role="topology-edit-professional-operation"]');
  await expect(panel).toBeVisible();
  await expect(page.locator('[data-role="topology-edit-professional-interaction"]')).toBeVisible();
  await expect.poll(() => host.getAttribute(
    'data-topology-edit-professional-catalogue-hash',
  )).not.toBe('');

  const initialCanonicalHash = await host.getAttribute('data-topology-edit-canonical-hash');
  await panel.locator('[data-role="professional-operation-type"]')
    .selectOption('SPLIT_EDGE_FROM_DISTANCE');
  await panel.locator('[data-role="professional-edge-id"]').fill('edge:P-001');
  await panel.locator('[data-role="professional-endpoint"]').selectOption('FROM');
  await panel.locator('[data-role="professional-distance-mm"]').fill('100');
  await panel.locator('[data-action="plan-professional-operation"]').click();

  await expect.poll(() => host.getAttribute(
    'data-topology-edit-professional-plan-hash',
  )).not.toBe('');
  await expect.poll(() => host.getAttribute(
    'data-topology-edit-professional-candidate-hash',
  )).not.toBe('');
  const candidateTopologyHash = await host.getAttribute(
    'data-topology-edit-professional-candidate-topology-hash',
  );
  expect(candidateTopologyHash).not.toBe(initialCanonicalHash);

  await panel.locator('[data-action="validate-professional-operation"]').click();
  await expect.poll(() => host.getAttribute(
    'data-topology-edit-professional-validation-hash',
  ), { timeout: 30_000 }).not.toBe('');
  await expect.poll(() => host.getAttribute(
    'data-topology-edit-professional-transaction-preview-hash',
  )).not.toBe('');

  const previewHash = await host.getAttribute(
    'data-topology-edit-professional-transaction-preview-hash',
  );
  await panel.locator('[data-action="apply-professional-operation"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '1');
  await expect.poll(() => host.getAttribute(
    'data-topology-edit-professional-transaction-hash',
  )).not.toBe('');
  const transactionHash = await host.getAttribute(
    'data-topology-edit-professional-transaction-hash',
  );
  await expect(host).toHaveAttribute(
    'data-topology-edit-canonical-hash',
    candidateTopologyHash,
  );

  await panel.locator('[data-action="undo-professional-operation"]').click();
  await expect(host).toHaveAttribute(
    'data-topology-edit-canonical-hash',
    initialCanonicalHash,
  );
  await panel.locator('[data-action="redo-professional-operation"]').click();
  await expect(host).toHaveAttribute(
    'data-topology-edit-canonical-hash',
    candidateTopologyHash,
  );
  await expect(host).toHaveAttribute(
    'data-topology-edit-professional-transaction-hash',
    transactionHash,
  );

  await page.locator('[data-action="save-draft"]').click();
  await expect.poll(() => host.getAttribute(
    'data-topology-edit-draft-package-hash',
  )).not.toBe('');
  await page.locator('[data-action="reload-draft"]').click();
  await expect(host).toHaveAttribute(
    'data-topology-edit-canonical-hash',
    candidateTopologyHash,
  );
  await expect(host).toHaveAttribute(
    'data-topology-edit-professional-transaction-hash',
    transactionHash,
  );

  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter(isCriticalConsoleError)).toEqual([]);
  await testInfo.attach('professional-production-integration', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await mkdir('reports/qualification', { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify({
    schema: 'TopologyEditProfessionalIntegrationEvidence.v1',
    status: 'PASS_PROFESSIONAL_3D_INTEGRATION',
    candidateHead: process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || null,
    productionIntegrated: true,
    fixture: 'public/fixtures/topology-edit-20-element-demo.staged.json',
    operationType: 'SPLIT_EDGE_FROM_DISTANCE',
    edgeId: 'edge:P-001',
    distanceMm: 100,
    initialCanonicalHash,
    candidateTopologyHash,
    previewHash,
    transactionHash,
    persistenceRestored: true,
  }, null, 2)}\n`);
});

async function openProductionDemo(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await navigation.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.locator('[data-action="load-topology-edit-demo"]').click();
  await expect.poll(() => page.evaluate(() => (
    globalThis.AnalysisWorkspace?.getSnapshot?.()?.dataset?.entities?.length ?? 0
  ))).toBe(20);
  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  await expect(page.locator('[data-role="topology-edit-render-host"]')).toBeVisible();
}

function isCriticalConsoleError(message) {
  return [
    /ReferenceError/i,
    /Cannot access .* before initialization/i,
    /does not provide an export named/i,
    /Failed to fetch dynamically imported module/i,
    /circular import/i,
    /WebGL context lost/i,
    /TopologyEditProfessional/i,
  ].some((pattern) => pattern.test(message));
}
