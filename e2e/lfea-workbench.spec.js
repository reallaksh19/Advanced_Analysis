import { expect, test } from '@playwright/test';
import { rectangularQ4Package } from '../scripts/lfea-005-fixtures.mjs';
import { runLfeaPipelineStages } from '../src/workspace/lfea-pipeline-stages.js';

async function installControlledWorker(page) {
  await page.addInitScript(() => {
    class ControlledWorker extends EventTarget {
      constructor(url) {
        super();
        this.url = String(url);
        this.messages = [];
        this.terminated = false;
        globalThis.__lfeaWorkers ??= [];
        globalThis.__lfeaWorkers.push(this);
      }

      postMessage(message) {
        this.messages.push(structuredClone(message));
      }

      terminate() {
        this.terminated = true;
      }

      emit(message) {
        this.dispatchEvent(new MessageEvent('message', {
          data: structuredClone(message),
        }));
      }
    }
    globalThis.Worker = ControlledWorker;
  });
}

async function openControlledWorkbench(page) {
  await installControlledWorker(page);
  await page.goto('/');
  await page.locator('[data-application-nav="LFEA"]').click();
  const workbench = page.locator('[data-role="lfea-workbench"]');
  await workbench.locator('[data-role="lfea-import"]').setInputFiles({
    name: 'lfea-q4-simulated.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(rectangularQ4Package({}))),
  });
  await expect(workbench.locator('.lfea-workbench__status')).toHaveText('READY');
  return workbench;
}

async function requestAt(page, workerIndex) {
  await expect.poll(() => page.evaluate((index) =>
    globalThis.__lfeaWorkers?.[index]?.messages.length ?? 0, workerIndex)).toBe(1);
  return page.evaluate((index) =>
    structuredClone(globalThis.__lfeaWorkers[index].messages[0]), workerIndex);
}

async function emitWorkerMessage(page, workerIndex, message) {
  await page.evaluate(({ index, value }) => {
    globalThis.__lfeaWorkers[index].emit(value);
  }, { index: workerIndex, value: message });
}

function executionForRequest(_page, request) {
  return runLfeaPipelineStages({
    ...request.input,
    onProgress: undefined,
  });
}

async function completeRequest(page, workerIndex, request) {
  const execution = await executionForRequest(page, request);
  await emitWorkerMessage(page, workerIndex, {
    type: 'COMPLETE',
    requestId: request.requestId,
    runId: request.runId,
    inputSemanticHash: request.inputSemanticHash,
    inputModelVersion: request.inputModelVersion,
    execution,
  });
  return execution;
}

async function applyPackageDelta(workbench, delta = 0.01) {
  const textarea = workbench.locator('[data-role="lfea-package-json"]');
  const value = JSON.parse(await textarea.inputValue());
  value.nodes[0].x += delta;
  await textarea.fill(JSON.stringify(value));
  await workbench.getByRole('button', { name: 'Apply and reseal local edit' }).click();
}

test('LFEA edits a mesh package and runs through qualified evidence export', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-application-nav="LFEA"]').click();
  const workbench = page.locator('[data-role="lfea-workbench"]');
  await expect(workbench).toBeVisible();
  await workbench.locator('[data-role="lfea-import"]').setInputFiles({
    name: 'lfea-q4-simulated.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(rectangularQ4Package({}))),
  });
  await expect(workbench.locator('.lfea-workbench__status')).toHaveText('READY');
  await expect(workbench.locator('.lfea-workbench-svg__element')).toHaveCount(1);
  await workbench.locator('[data-role="lfea-run"]').click();
  await expect(workbench.locator('.lfea-workbench__status')).toHaveText('QUALIFIED');
  await expect(workbench.locator('[data-role="lfea-review-summary"]')).toContainText('QUALIFIED_EXPORT');
  await workbench.locator('[data-role="lfea-result-mode"]').selectOption('PROJECTED_STRESS');
  await expect(workbench.locator('.lfea-workbench__authority', { hasText: 'NON_AUTHORITATIVE' }).first()).toBeVisible();
});

test('LFEA rejects a stale semantic hash and does not run a solver fallback', async ({ page }) => {
  const forged = rectangularQ4Package({});
  forged.nodes[0].x += 0.01;
  await page.goto('/');
  await page.locator('[data-application-nav="LFEA"]').click();
  const workbench = page.locator('[data-role="lfea-workbench"]');
  await workbench.locator('[data-role="lfea-import"]').setInputFiles({
    name: 'forged-lfea.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(forged)),
  });
  await expect(workbench.locator('.lfea-workbench__status')).toHaveText('FAILED');
  await expect(workbench.locator('[data-role="lfea-diagnostics"]')).toContainText('semantic hash');
  await expect(workbench.locator('[data-role="lfea-review-summary"]')).toHaveCount(0);
});

test('P0-E03 late completion from an old run is rejected', async ({ page }) => {
  const workbench = await openControlledWorkbench(page);
  await workbench.locator('[data-role="lfea-run"]').click();
  const first = await requestAt(page, 0);
  await applyPackageDelta(workbench);
  await expect(workbench.locator('.lfea-workbench__status')).toHaveText('READY');

  await workbench.locator('[data-role="lfea-run"]').click();
  const second = await requestAt(page, 1);
  const oldExecution = await executionForRequest(page, first);
  await emitWorkerMessage(page, 0, {
    type: 'COMPLETE',
    requestId: first.requestId,
    runId: first.runId,
    inputSemanticHash: first.inputSemanticHash,
    inputModelVersion: first.inputModelVersion,
    execution: oldExecution,
  });

  const rejected = await page.evaluate(() => globalThis.AnalysisWorkspace.getLfeaWorkbenchState());
  expect(rejected.status).toBe('RUNNING');
  expect(rejected.activeRun.runId).toBe(second.runId);
  expect(rejected.execution).toBeNull();
  expect(rejected.diagnostics[0].code).toBe('LFEA_RUN_ID_MISMATCH');
  await expect(workbench.locator('[data-role="lfea-export-evidence"]')).toBeDisabled();

  await completeRequest(page, 1, second);
  await expect(workbench.locator('.lfea-workbench__status')).toHaveText('QUALIFIED');
});

test('P0-E04 old progress event is ignored', async ({ page }) => {
  const workbench = await openControlledWorkbench(page);
  await workbench.locator('[data-role="lfea-run"]').click();
  const first = await requestAt(page, 0);
  await applyPackageDelta(workbench);
  await workbench.locator('[data-role="lfea-run"]').click();
  const second = await requestAt(page, 1);

  await emitWorkerMessage(page, 0, {
    type: 'PROGRESS',
    requestId: first.requestId,
    runId: first.runId,
    inputSemanticHash: first.inputSemanticHash,
    inputModelVersion: first.inputModelVersion,
    progress: { stage: 'OLD_STAGE', index: 99, total: 99 },
  });
  const state = await page.evaluate(() => globalThis.AnalysisWorkspace.getLfeaWorkbenchState());
  expect(state.activeRun.runId).toBe(second.runId);
  expect(state.progress.runId).toBe(second.runId);
  expect(state.progress.stage).toBe('QUEUED');
  expect(state.diagnostics[0].code).toBe('LFEA_RUN_ID_MISMATCH');
  await workbench.getByRole('button', { name: 'Cancel run' }).click();
});

test('P0-E05 commit node edit during run cancels the run', async ({ page }) => {
  const workbench = await openControlledWorkbench(page);
  const before = await page.evaluate(() => globalThis.AnalysisWorkspace.getLfeaWorkbenchState());
  await workbench.locator('[data-role="lfea-run"]').click();
  await requestAt(page, 0);
  const marker = workbench.locator('.lfea-workbench-svg__node circle').first();
  const nodeId = await marker.locator('xpath=..').getAttribute('data-node-id');
  await marker.press('ArrowRight');
  await workbench.getByRole('button', { name: `Apply ${nodeId}` }).click();

  const after = await page.evaluate(() => globalThis.AnalysisWorkspace.getLfeaWorkbenchState());
  expect(after.status).toBe('READY');
  expect(after.activeRun).toBeNull();
  expect(after.execution).toBeNull();
  expect(after.packageValue.semanticHash).not.toBe(before.packageValue.semanticHash);
  expect(after.diagnostics[0].code).toBe('LFEA_RUN_CANCELLED_MODEL_CHANGED');
  expect(await page.evaluate(() => globalThis.__lfeaWorkers[0].terminated)).toBe(true);
  await expect(workbench.locator('[data-role="lfea-export-evidence"]')).toBeDisabled();
});

test('P0-E06 undo during run cancels the run', async ({ page }) => {
  const workbench = await openControlledWorkbench(page);
  const originalHash = (await page.evaluate(() =>
    globalThis.AnalysisWorkspace.getLfeaWorkbenchState())).packageValue.semanticHash;
  await applyPackageDelta(workbench, 0.02);
  await workbench.locator('[data-role="lfea-run"]').click();
  await requestAt(page, 0);
  await workbench.getByRole('button', { name: 'Undo' }).click();

  const state = await page.evaluate(() => globalThis.AnalysisWorkspace.getLfeaWorkbenchState());
  expect(state.status).toBe('READY');
  expect(state.activeRun).toBeNull();
  expect(state.execution).toBeNull();
  expect(state.packageValue.semanticHash).toBe(originalHash);
  expect(state.diagnostics[0].code).toBe('LFEA_RUN_CANCELLED_MODEL_CHANGED');
  expect(await page.evaluate(() => globalThis.__lfeaWorkers[0].terminated)).toBe(true);
});

test('P0-E07 preview-only node movement does not commit a mutation', async ({ page }) => {
  const workbench = await openControlledWorkbench(page);
  await workbench.locator('[data-role="lfea-run"]').click();
  const request = await requestAt(page, 0);
  const before = await page.evaluate(() => globalThis.AnalysisWorkspace.getLfeaWorkbenchState());
  await workbench.locator('.lfea-workbench-svg__node circle').first().press('ArrowRight');
  const after = await page.evaluate(() => globalThis.AnalysisWorkspace.getLfeaWorkbenchState());

  expect(after.status).toBe('RUNNING');
  expect(after.activeRun.runId).toBe(request.runId);
  expect(after.packageValue.semanticHash).toBe(before.packageValue.semanticHash);
  expect(after.modelVersion).toBe(before.modelVersion);
  expect(after.nodeDraft).not.toBeNull();
  expect(await page.evaluate(() => globalThis.__lfeaWorkers[0].terminated)).toBe(false);
  await workbench.getByRole('button', { name: 'Revert preview' }).click();
  await workbench.getByRole('button', { name: 'Cancel run' }).click();
});

test('P0-E08 DEFORMED is disabled before solve', async ({ page }) => {
  const workbench = await openControlledWorkbench(page);
  await expect(workbench.locator('[data-role="lfea-result-mode"] option[value="DEFORMED"]')).toBeDisabled();
  await expect(workbench.locator('[data-role="lfea-deformation-scale"]')).toHaveCount(0);
});

test('P0-E09 DEFORMED renders after qualified solve', async ({ page }) => {
  const workbench = await openControlledWorkbench(page);
  await workbench.locator('[data-role="lfea-run"]').click();
  const request = await requestAt(page, 0);
  await completeRequest(page, 0, request);
  await expect(workbench.locator('.lfea-workbench__status')).toHaveText('QUALIFIED');
  await expect(workbench.locator('[data-role="lfea-result-mode"] option[value="DEFORMED"]')).toBeEnabled();
  await expect(workbench.locator('[data-role="lfea-deformation-scale"]')).toBeVisible();
  await workbench.locator('[data-role="lfea-result-mode"]').selectOption('DEFORMED');
  await expect(workbench.locator('[data-role="lfea-geometry-state"]')).toHaveText('DEFORMED ×10');
});

test('P0-E10 invalid deformation scale is rejected without render failure', async ({ page }) => {
  const workbench = await openControlledWorkbench(page);
  await workbench.locator('[data-role="lfea-run"]').click();
  const request = await requestAt(page, 0);
  await completeRequest(page, 0, request);
  await workbench.locator('[data-role="lfea-result-mode"]').selectOption('DEFORMED');
  const scale = workbench.locator('[data-role="lfea-deformation-scale"]');
  await scale.fill('0');
  await scale.press('Tab');

  await expect(workbench.locator('[data-role="lfea-diagnostics"]')).toContainText('LFEA_DEFORMATION_SCALE_INVALID');
  await expect(workbench.locator('.lfea-workbench__status')).toHaveText('QUALIFIED');
  await expect(workbench.locator('.lfea-workbench__svg svg')).toHaveCount(1);
  await expect(workbench.locator('[data-role="lfea-geometry-state"]')).toHaveText('DEFORMED ×10');
});

test('P0-E11 display-scale change does not change package hash', async ({ page }) => {
  const workbench = await openControlledWorkbench(page);
  await workbench.locator('[data-role="lfea-run"]').click();
  const request = await requestAt(page, 0);
  await completeRequest(page, 0, request);
  const before = await page.evaluate(() => globalThis.AnalysisWorkspace.getLfeaWorkbenchState());
  const scale = workbench.locator('[data-role="lfea-deformation-scale"]');
  await scale.fill('25');
  await scale.press('Tab');
  const after = await page.evaluate(() => globalThis.AnalysisWorkspace.getLfeaWorkbenchState());

  expect(after.packageValue.semanticHash).toBe(before.packageValue.semanticHash);
  expect(after.modelVersion).toBe(before.modelVersion);
  expect(after.past.length).toBe(before.past.length);
  expect(after.execution.runId).toBe(before.execution.runId);
  expect(after.display.deformationScale).toBe(25);
  await workbench.locator('[data-role="lfea-result-mode"]').selectOption('DEFORMED');
  await expect(workbench.locator('[data-role="lfea-geometry-state"]')).toHaveText('DEFORMED ×25');
});

test('P0-E12 evidence export remains disabled for stale results', async ({ page }) => {
  const workbench = await openControlledWorkbench(page);
  await workbench.locator('[data-role="lfea-run"]').click();
  const request = await requestAt(page, 0);
  const execution = await executionForRequest(page, request);
  await applyPackageDelta(workbench);
  await emitWorkerMessage(page, 0, {
    type: 'COMPLETE',
    requestId: request.requestId,
    runId: request.runId,
    inputSemanticHash: request.inputSemanticHash,
    inputModelVersion: request.inputModelVersion,
    execution,
  });

  const state = await page.evaluate(() => globalThis.AnalysisWorkspace.getLfeaWorkbenchState());
  expect(state.status).toBe('READY');
  expect(state.activeRun).toBeNull();
  expect(state.execution).toBeNull();
  expect(state.diagnostics[0].code).toBe('LFEA_STALE_RESULT_REJECTED');
  await expect(workbench.locator('[data-role="lfea-export-evidence"]')).toBeDisabled();
  await expect(workbench.locator('[data-role="lfea-result-mode"] option[value="DEFORMED"]')).toBeDisabled();
});
