import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { canonicalPrettyStringify } from '../src/core/shared-piping-model/canonical-json.js';
import { requireNonFeaBrowserEvidence } from '../scripts/non-fea-baseline/browser-baseline.mjs';
import { percentile, roundMilliseconds } from '../scripts/p1/p1-contracts.mjs';
import { installP1Observer } from './p1-browser-observer.js';
import {
  armAction,
  endAction,
  orbitPanSamples,
  selectionSamples,
  waitForMeasuredRender,
} from './p1-current-main-performance-helpers.js';

const CONFIG = Object.freeze({
  executionId: process.env.P0_EXECUTION_ID || '',
  exactHeadSha: process.env.P0_EXACT_HEAD_SHA || '',
  fixtureRole: 'LARGE_MODEL_4884_ENTITY',
  fixturePath: process.env.P0_FIXTURE_PATH || '',
  sourceSha256: process.env.P0_SOURCE_SHA256 || '',
  output: process.env.P0_BROWSER_EVIDENCE_OUTPUT
    || 'artifacts/p0/non-fea-browser-baseline.json',
});
const CONFIGURED = Boolean(
  CONFIG.executionId
  && /^[0-9a-f]{40}$/u.test(CONFIG.exactHeadSha)
  && CONFIG.fixturePath
  && /^[0-9a-f]{64}$/u.test(CONFIG.sourceSha256),
);

test.skip(!CONFIGURED, 'P0 exact-head fixture and execution variables are required.');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript(() => {
    globalThis.localStorage?.clear();
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'webgl';
    globalThis.__NON_FEA_P0_LONG_TASKS__ = [];
    if (typeof PerformanceObserver !== 'function') return;
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          globalThis.__NON_FEA_P0_LONG_TASKS__.push({
            startTimeMs: entry.startTime,
            durationMs: entry.duration,
          });
        });
      });
      observer.observe({ type: 'longtask', buffered: true });
      globalThis.__NON_FEA_P0_LONG_TASK_OBSERVER__ = observer;
    } catch {
      globalThis.__NON_FEA_P0_LONG_TASK_OBSERVER__ = null;
    }
  });
});

test('writes exact-head P0 browser evidence', async ({ page, browserName }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const fixtureAbsolutePath = path.resolve(CONFIG.fixturePath);
  const sourceBytes = await readFile(fixtureAbsolutePath);
  expect(sha256(sourceBytes)).toBe(CONFIG.sourceSha256);

  await page.goto('/?nonFeaP0Evidence=1', { waitUntil: 'domcontentloaded' });
  await installP1Observer(page, CONFIG);
  await armAction(page, 'INITIAL_IMPORT', { sample: 0 }, 'DATASET_FILE_CHANGE');
  await page.locator('[data-role="dataset-file"]').setInputFiles(fixtureAbsolutePath);
  await expect.poll(() => page.evaluate(() => {
    const snapshot = globalThis.AnalysisWorkspace?.getSnapshot?.();
    const host = document.querySelector('[data-role="viewport-render-host"]');
    return snapshot?.status === 'ready'
      && Number(host?.dataset?.renderableCount || 0) > 0;
  }), { timeout: 120_000 }).toBe(true);
  await waitForMeasuredRender(page, 120_000);
  const initialImport = await endAction(page);

  const selectionDurations = await selectionSamples(page, 12);
  const orbitDurations = await orbitPanSamples(page, 20);
  const runtime = await page.evaluate(async () => {
    const timingModule = await import('/src/workspace/non-fea-p0-observability.js');
    return {
      stageDurations: timingModule.readNonFeaP0StageDurations(),
      renderOwnerCount: globalThis.__P1_Q0_OBSERVER__.renderOwnerCount(),
      longTaskSupport: Boolean(globalThis.__NON_FEA_P0_LONG_TASK_OBSERVER__),
      longTasks: [...(globalThis.__NON_FEA_P0_LONG_TASKS__ || [])],
      canvasCount: document.querySelectorAll('canvas').length,
      webglCanvasCount: document.querySelectorAll(
        'canvas[data-viewport-backend="webgl"]',
      ).length,
      devicePixelRatio: globalThis.devicePixelRatio,
      viewport: { width: globalThis.innerWidth, height: globalThis.innerHeight },
    };
  });

  ['THREE_MATERIALIZATION', 'GPU_SCENE_INSTALL', 'FIT'].forEach((stageId) => {
    expect(runtime.stageDurations[stageId], `${stageId} must be measured`)
      .toBeGreaterThanOrEqual(0);
  });
  const evidence = {
    schema: 'non-fea-browser-baseline/v1',
    executionId: CONFIG.executionId,
    exactHeadSha: CONFIG.exactHeadSha,
    fixtureRole: CONFIG.fixtureRole,
    fixturePath: CONFIG.fixturePath.replaceAll('\\', '/'),
    sourceSha256: CONFIG.sourceSha256,
    browser: browserName,
    os: process.platform,
    devicePixelRatio: runtime.devicePixelRatio,
    viewport: runtime.viewport,
    workers: 1,
    pageErrors,
    longTaskSupport: runtime.longTaskSupport,
    longTasks: runtime.longTasks.map((row) => ({
      startTimeMs: roundMilliseconds(row.startTimeMs),
      durationMs: roundMilliseconds(row.durationMs),
    })),
    stageMeasurements: [
      row('THREE_MATERIALIZATION', runtime.stageDurations.THREE_MATERIALIZATION),
      row('GPU_SCENE_INSTALL', runtime.stageDurations.GPU_SCENE_INSTALL),
      row('FIT', runtime.stageDurations.FIT),
      row('FIRST_MEANINGFUL_FRAME', initialImport.durationMs),
      row('SELECTION', percentile(selectionDurations, 0.95)),
      row('ORBIT_PAN', percentile(orbitDurations, 0.95)),
    ],
    canvasCount: runtime.canvasCount,
    webglCanvasCount: runtime.webglCanvasCount,
    renderOwnerCount: runtime.renderOwnerCount,
  };
  requireNonFeaBrowserEvidence(evidence, {
    executionId: CONFIG.executionId,
    exactHeadSha: CONFIG.exactHeadSha,
    fixtureRole: CONFIG.fixtureRole,
  });
  await mkdir(path.dirname(CONFIG.output), { recursive: true });
  await writeFile(CONFIG.output, canonicalPrettyStringify(evidence), 'utf8');
  expect(pageErrors).toEqual([]);
});

function row(stageId, durationMs) {
  return { stageId, durationMs: roundMilliseconds(durationMs) };
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
