import { expect, test } from '@playwright/test';
import {
  pressure,
  rectangularQ4Package,
  resealPackage,
  traction,
} from '../scripts/lfea-005-fixtures.mjs';

const EDITOR_PATHS = [
  'nodes',
  'elements',
  'materials',
  'regions',
  'boundaries',
  'points',
  'analysisDefinition.materialAssignments',
  'analysisDefinition.thicknessAssignments',
  'analysisDefinition.loadCase.pointForces',
  'analysisDefinition.loadCase.boundaryTractions',
  'analysisDefinition.loadCase.boundaryPressures',
  'analysisDefinition.constraints',
];
const RESULT_VIEWS = [
  'OVERVIEW',
  'DISPLACEMENTS',
  'REACTIONS',
  'RAW_STRESS',
  'PROJECTED_STRESS',
  'MESH_QUALITY',
  'REVIEW',
];

async function importFixture(workbench, packageValue = rectangularQ4Package({})) {
  await workbench.locator('[data-role="lfea-import"]').setInputFiles({
    name: 'lfea-shell-v2-q4.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(packageValue)),
  });
  return packageValue;
}

function editorCoveragePackage() {
  const value = structuredClone(rectangularQ4Package({}));
  value.analysisDefinition.loadCase.boundaryTractions = [
    traction('T_UI2', 'B_RIGHT', 1.5, -0.25),
  ];
  value.analysisDefinition.loadCase.boundaryPressures = [
    pressure('P_UI2', 'B_TOP', 2.25),
  ];
  return resealPackage(value);
}

function captureBrowserErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    errors.push(`requestfailed: ${request.url()} — ${request.failure()?.errorText ?? 'unknown'}`);
  });
  return errors;
}

async function openEmbeddedShell(page) {
  const errors = captureBrowserErrors(page);
  await page.goto('/');
  await page.waitForTimeout(750);
  const nav = page.locator('[data-application-nav="LFEA"]');
  const navCount = await nav.count();
  if (navCount !== 1) {
    throw new Error(await bootFailure(page, 'Embedded shell', `LFEA nav count=${navCount}`, errors));
  }
  await nav.click();
}

async function openStandaloneShell(page) {
  const errors = captureBrowserErrors(page);
  await page.goto('/Advanced_Analysis/lfea.html');
  await page.waitForTimeout(750);
  const workbench = page.locator('[data-role="lfea-workbench"]');
  const count = await workbench.count();
  if (count !== 1) {
    throw new Error(await bootFailure(page, 'Standalone LFEA', `workbench count=${count}`, errors));
  }
  return workbench;
}

async function bootFailure(page, label, detail, errors) {
  const body = (await page.locator('body').innerText()).slice(0, 3000);
  return `${label} failed to boot; ${detail}.\n${errors.join('\n')}\nBODY:\n${body}`;
}

async function runAndOpenResults(workbench) {
  await workbench.locator('[data-role="lfea-run"]').click();
  await expect(workbench.locator('.lfea-workbench__status')).toHaveText('QUALIFIED');
  await workbench.locator('[data-navigator-item="RESULTS"]').click();
  await expect(workbench.locator('[data-role="lfea-results-explorer"]')).toBeVisible();
}

test('Shell V2 renders as the embedded LFEA workbench with explicit blocked EnrichedSjson state', async ({ page }) => {
  await openEmbeddedShell(page);
  const workbench = page.locator('[data-role="lfea-workbench"]');

  await expect(workbench).toHaveClass(/lfea-shell-v2/u);
  await expect(workbench.locator('.lfea-shell-v2__navigator')).toBeVisible();
  await expect(workbench.locator('.lfea-shell-v2__viewport')).toBeVisible();
  await expect(workbench.locator('.lfea-shell-v2__inspector')).toBeVisible();
  await expect(workbench.locator('.lfea-shell-v2__pipeline')).toBeVisible();

  const blocked = workbench.locator('[data-role="lfea-enriched-sjson-capability"]');
  await expect(blocked).toHaveAttribute('data-status', 'BLOCKED');
  await expect(blocked).toContainText('LFEA_ENRICHED_SJSON_PIPING_ADAPTER_NOT_WIRED');
  await expect(workbench.locator('[data-role="lfea-enriched-sjson-import"]')).toBeDisabled();
});

test('standalone LFEA entry mounts the same controller/store workbench', async ({ page }) => {
  const workbench = await openStandaloneShell(page);
  await expect(workbench).toBeVisible();
  await expect(workbench).toHaveClass(/lfea-shell-v2/u);

  const packageValue = await importFixture(workbench);
  await expect(workbench.locator('.lfea-workbench__status')).toHaveText('READY');
  const state = await page.evaluate(() => globalThis.LfeaStandalone.getState());
  expect(state.packageValue.semanticHash).toBe(packageValue.semanticHash);
  expect(state.execution).toBeNull();

  await workbench.locator('[data-role="lfea-run"]').click();
  await expect(workbench.locator('.lfea-workbench__status')).toHaveText('QUALIFIED');
  await expect(workbench.locator('[data-role="lfea-export-evidence"]')).toBeEnabled();
  await expect(workbench.locator('.lfea-shell-v2__pipeline-step[data-state="COMPLETE"]')).toHaveCount(7);
});

test('UI-2 structured editors round-trip every existing editable collection without semantic drift', async ({ page }) => {
  const workbench = await openStandaloneShell(page);
  await importFixture(workbench, editorCoveragePackage());

  for (const path of EDITOR_PATHS) {
    await workbench.locator('[data-role="lfea-collection-path"]').selectOption(path);
    const rows = workbench.locator('.lfea-workbench__table tr[role="row"]');
    expect(await rows.count(), `${path} fixture coverage`).toBeGreaterThan(0);
    await rows.first().click();

    const before = await page.evaluate(() => globalThis.LfeaStandalone.getState());
    await expect(workbench.locator('[data-role="lfea-structured-record-editor"]')).toBeVisible();
    await expect(workbench.locator('[data-role="lfea-record-json"]')).toHaveCount(0);
    await workbench.getByRole('button', { name: 'Apply changes' }).click();
    const after = await page.evaluate(() => globalThis.LfeaStandalone.getState());

    expect(after.packageValue.semanticHash, path).toBe(before.packageValue.semanticHash);
    expect(after.modelVersion, path).toBe(before.modelVersion + 1);
    expect(after.execution, path).toBeNull();
  }
});

test('UI-2 invalid structured material edit fails closed without mutating the package', async ({ page }) => {
  const workbench = await openStandaloneShell(page);
  await importFixture(workbench);
  await workbench.locator('[data-role="lfea-collection-path"]').selectOption('materials');
  await workbench.locator('.lfea-workbench__table tr[role="row"]').first().click();

  const before = await page.evaluate(() => globalThis.LfeaStandalone.getState());
  await workbench.locator('[data-field="nu"]').fill('0.75');
  await workbench.getByRole('button', { name: 'Apply changes' }).click();
  const after = await page.evaluate(() => globalThis.LfeaStandalone.getState());

  expect(after.packageValue.semanticHash).toBe(before.packageValue.semanticHash);
  expect(after.modelVersion).toBe(before.modelVersion);
  expect(after.diagnostics.length).toBeGreaterThan(0);
});

test('UI-2 stale detached editor cannot overwrite a newer package identity', async ({ page }) => {
  const workbench = await openStandaloneShell(page);
  const original = await importFixture(workbench);
  await workbench.locator('[data-role="lfea-collection-path"]').selectOption('nodes');
  await workbench.locator('.lfea-workbench__table tr[role="row"]').first().click();
  const staleApply = await workbench.getByRole('button', { name: 'Apply changes' }).elementHandle();

  const newer = structuredClone(original);
  newer.nodes[0].x += 0.25;
  const resealed = resealPackage(newer);
  await page.evaluate((value) => globalThis.LfeaStandalone.importDocument(value), resealed);
  await staleApply.evaluate((button) => button.click());

  const after = await page.evaluate(() => globalThis.LfeaStandalone.getState());
  expect(after.packageValue.semanticHash).toBe(resealed.semanticHash);
  expect(after.packageValue.nodes[0].x).toBe(resealed.nodes[0].x);
});

test('UI-3 results explorer separates raw/projected authority and preserves lossless table controls', async ({ page }) => {
  const workbench = await openStandaloneShell(page);
  await importFixture(workbench);
  await runAndOpenResults(workbench);

  await expect(workbench.locator('[data-role="lfea-results-view"]')).toHaveCount(7);
  for (const viewId of RESULT_VIEWS) {
    await workbench.locator(`[data-role="lfea-results-view"][data-view="${viewId}"]`).click();
    await expect(workbench.locator('[data-role="lfea-results-view-body"]')).toHaveAttribute('data-view', viewId);
  }

  await workbench.locator('[data-role="lfea-results-view"][data-view="RAW_STRESS"]').click();
  await expect(workbench.locator('[data-role="lfea-results-authority"]')).toContainText('AUTHORITATIVE_RAW_ELEMENT_OR_INTEGRATION_POINT_STRESS');
  await workbench.locator('[data-role="lfea-results-view"][data-view="PROJECTED_STRESS"]').click();
  await expect(workbench.locator('[data-role="lfea-results-authority"]')).toContainText('NON_AUTHORITATIVE_REVIEW_PROJECTION');

  await workbench.locator('[data-role="lfea-results-view"][data-view="DISPLACEMENTS"]').click();
  const sourceCount = await page.evaluate(() => globalThis.LfeaStandalone.getState().execution.result.nodalDisplacements.length);
  await expect(workbench.locator('[data-role="lfea-results-row-count"]')).toContainText(`${sourceCount} of ${sourceCount} rows`);
  await workbench.locator('[data-role="lfea-results-filter"]').fill('UX');
  await expect(workbench.locator('[data-role="lfea-results-row-count"]')).not.toContainText(`${sourceCount} of ${sourceCount} rows`);
  await workbench.locator('[data-role="lfea-results-sort-key"]').selectOption('value');
  await workbench.locator('[data-role="lfea-results-sort-direction"]').selectOption('desc');
  await workbench.locator('[data-role="lfea-results-reset"]').click();
  await expect(workbench.locator('[data-role="lfea-results-filter"]')).toHaveValue('');
  await expect(workbench.locator('[data-role="lfea-results-sort-key"]')).toHaveValue('');
  await expect(workbench.locator('[data-role="lfea-results-row-count"]')).toContainText(`${sourceCount} of ${sourceCount} rows`);
});

test('UI-3 explorer is shared by embedded host and resets after model identity changes', async ({ page }) => {
  await openEmbeddedShell(page);
  const embedded = page.locator('[data-role="lfea-workbench"]');
  await importFixture(embedded);
  await runAndOpenResults(embedded);
  await expect(embedded.locator('[data-role="lfea-results-view"]')).toHaveCount(7);
  await embedded.locator('[data-role="lfea-results-view"][data-view="RAW_STRESS"]').click();
  await expect(embedded.locator('[data-role="lfea-results-authority"]')).toContainText('AUTHORITATIVE_RAW_ELEMENT_OR_INTEGRATION_POINT_STRESS');

  const standalone = await openStandaloneShell(page);
  await importFixture(standalone);
  await runAndOpenResults(standalone);
  await standalone.locator('[data-role="lfea-results-view"][data-view="DISPLACEMENTS"]').click();
  await standalone.locator('[data-role="lfea-results-filter"]').fill('UX');
  await standalone.locator('[data-role="lfea-results-sort-key"]').selectOption('value');

  await standalone.locator('[data-navigator-item="MODEL"]').click();
  await standalone.locator('[data-role="lfea-collection-path"]').selectOption('nodes');
  await standalone.locator('.lfea-workbench__table tr[role="row"]').first().click();
  const x = standalone.locator('[data-field="x"]');
  await x.fill(String(Number(await x.inputValue()) + 0.01));
  await standalone.getByRole('button', { name: 'Apply changes' }).click();
  await standalone.locator('[data-role="lfea-run"]').click();
  await expect(standalone.locator('.lfea-workbench__status')).toHaveText('QUALIFIED');
  await standalone.locator('[data-navigator-item="RESULTS"]').click();

  await expect(standalone.locator('[data-role="lfea-results-view-body"]')).toHaveAttribute('data-view', 'OVERVIEW');
  await standalone.locator('[data-role="lfea-results-view"][data-view="DISPLACEMENTS"]').click();
  await expect(standalone.locator('[data-role="lfea-results-filter"]')).toHaveValue('');
  await expect(standalone.locator('[data-role="lfea-results-sort-key"]')).toHaveValue('');
});
