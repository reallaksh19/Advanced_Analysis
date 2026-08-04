import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { canonicalPrettyStringify } from '../src/core/shared-piping-model/canonical-json.js';
import { percentile, roundMilliseconds } from '../scripts/p1/p1-contracts.mjs';
import { requireP1BrowserEvidence } from '../scripts/p1/p1-report-validator.mjs';
import { requireP1BrowserRunEvidence } from '../scripts/p1/p1-browser-run-validator.mjs';
import { installP1Observer } from './p1-browser-observer.js';
import {
  armAction,
  clearReloadAction,
  contextRestoreAction,
  endAction,
  eventAction,
  masterDataAction,
  modelZoneAction,
  orbitPanSamples,
  projectDataAction,
  selectionSamples,
  waitForMeasuredRender,
} from './p1-current-main-performance-helpers.js';

const CONFIG = Object.freeze({
  executionId: process.env.P1_EXECUTION_ID || '',
  exactHeadSha: process.env.P1_EXACT_HEAD_SHA || '',
  fixtureRole: process.env.P1_FIXTURE_ROLE || 'LARGE_MODEL_4884_ENTITY',
  fixturePath: process.env.P1_FIXTURE_PATH || '',
  sourceSha256: process.env.P1_SOURCE_SHA256 || '',
  output: process.env.P1_BROWSER_EVIDENCE_OUTPUT || 'reports/p1-browser-evidence.json',
});
const CONFIGURED = Boolean(
  CONFIG.executionId
  && /^[0-9a-f]{40}$/u.test(CONFIG.exactHeadSha)
  && CONFIG.fixturePath
  && /^[0-9a-f]{64}$/u.test(CONFIG.sourceSha256),
);

test.skip(!CONFIGURED, 'P1 exact-head fixture and execution variables are required.');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript(() => {
    globalThis.localStorage?.clear();
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'webgl';
    globalThis.__P1_LONG_TASKS__ = [];
    if (typeof PerformanceObserver !== 'function') return;
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => globalThis.__P1_LONG_TASKS__.push({
          startTimeMs: entry.startTime,
          durationMs: entry.duration,
        }));
      });
      observer.observe({ type: 'longtask', buffered: true });
      globalThis.__P1_LONG_TASK_OBSERVER__ = observer;
    } catch {
      globalThis.__P1_LONG_TASK_OBSERVER__ = null;
    }
  });
});

test('records exact-head P1 browser timing and invalidation evidence', async ({ page, browserName }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const bytes = await readFile(CONFIG.fixturePath);
  expect(sha256(bytes)).toBe(CONFIG.sourceSha256);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await installP1Observer(page, CONFIG);
  await armAction(page, 'INITIAL_IMPORT', { sample: 0 }, 'DATASET_FILE_CHANGE');
  await page.locator('[data-role="dataset-file"]').setInputFiles(CONFIG.fixturePath);
  await expect.poll(() => page.evaluate(() => {
    const snapshot = globalThis.AnalysisWorkspace?.getSnapshot?.();
    const host = document.querySelector('[data-role="viewport-render-host"]');
    return snapshot?.status === 'ready' && Number(host?.dataset?.renderableCount || 0) > 0;
  }), { timeout: 120_000 }).toBe(true);
  await waitForMeasuredRender(page, 120_000);
  const initialImport = await endAction(page);

  const selectionSamplesMs = await selectionSamples(page, 12);
  const orbitPanFrameSamplesMs = await orbitPanSamples(page, 20);
  await eventAction(page, 'CALCULATED_EVENT', 'calculated');
  await masterDataAction(page);
  await projectDataAction(page);
  await modelZoneAction(page);
  await contextRestoreAction(page);
  await clearReloadAction(page, CONFIG.fixturePath);

  const runtime = await page.evaluate(() => ({
    invalidationEvidence: globalThis.__P1_Q0_OBSERVER__.snapshot(),
    renderOwnerCount: globalThis.__P1_Q0_OBSERVER__.renderOwnerCount(),
    detailedStageMeasurements:
      globalThis.__P1_Q0_OBSERVER__.detailedStageMeasurements(),
    observabilityGaps: globalThis.__P1_Q0_OBSERVER__.observabilityGaps(),
    longTaskSupport: Boolean(globalThis.__P1_LONG_TASK_OBSERVER__),
    longTasks: [...(globalThis.__P1_LONG_TASKS__ || [])],
    normalizationStartMs:
      globalThis.__P1_Q0_OBSERVER__.firstInvocationStart.NORMALIZATION_REQUEST ?? null,
    canvasCount: document.querySelectorAll('canvas').length,
    webglCanvasCount:
      document.querySelectorAll('canvas[data-viewport-backend="webgl"]').length,
    viewport: {
      width: globalThis.innerWidth,
      height: globalThis.innerHeight,
      devicePixelRatio: globalThis.devicePixelRatio,
    },
  }));
  expect(initialImport.counts.THREE_SCENE_INSTALL).toBeGreaterThan(0);
  expect(initialImport.counts.RENDER_FRAME).toBeGreaterThan(0);
  expect(initialImport.metadata.timingBasis)
    .toBe('NATIVE_TRIGGER_TO_FIRST_COMMITTED_RENDER_END');

  const firstMeaningfulFrameMs = initialImport.durationMs;
  const initialEnd = initialImport.startedAtMs + initialImport.durationMs;
  const postParseTasks = runtime.longTasks.filter((row) => (
    runtime.normalizationStartMs !== null
    && row.startTimeMs >= runtime.normalizationStartMs
    && row.startTimeMs <= initialEnd
  ));
  const postParseMax = postParseTasks.length
    ? Math.max(...postParseTasks.map((row) => row.durationMs))
    : 0;
  const selectionP95Ms = percentile(selectionSamplesMs, 0.95);
  const orbitPanP95Ms = percentile(orbitPanFrameSamplesMs, 0.95);
  const evidence = {
    schema: 'non-fea-p1-browser-evidence/v1',
    executionId: CONFIG.executionId,
    exactHeadSha: CONFIG.exactHeadSha,
    fixtureRole: CONFIG.fixtureRole,
    fixturePath: CONFIG.fixturePath,
    sourceSha256: CONFIG.sourceSha256,
    browser: browserName,
    os: process.platform,
    viewport: runtime.viewport,
    sampleCounts: {
      selection: selectionSamplesMs.length,
      orbitPan: orbitPanFrameSamplesMs.length,
    },
    stageMeasurements: [
      { stageId: 'FILE_SELECTION_TO_FIRST_MEANINGFUL_FRAME', durationMs: firstMeaningfulFrameMs },
      { stageId: 'POST_PARSE_MAIN_THREAD_TASK', durationMs: roundMilliseconds(postParseMax) },
      { stageId: 'SELECTION', durationMs: selectionP95Ms },
      { stageId: 'ORBIT_PAN', durationMs: orbitPanP95Ms },
    ],
    detailedStageMeasurements: runtime.detailedStageMeasurements,
    selectionSamplesMs,
    orbitPanFrameSamplesMs,
    selectionP95Ms,
    orbitPanP95Ms,
    fileSelectionToFirstMeaningfulFrameMs: firstMeaningfulFrameMs,
    postParseMainThreadTaskMaxMs: roundMilliseconds(postParseMax),
    pageErrors,
    longTaskSupport: runtime.longTaskSupport,
    longTasks: runtime.longTasks.map((row) => ({
      startTimeMs: roundMilliseconds(row.startTimeMs),
      durationMs: roundMilliseconds(row.durationMs),
    })),
    canvasCount: runtime.canvasCount,
    webglCanvasCount: runtime.webglCanvasCount,
    renderOwnerCount: runtime.renderOwnerCount,
    observabilityGaps: [...runtime.observabilityGaps].sort(),
    invalidationEvidence: runtime.invalidationEvidence,
  };
  requireP1BrowserEvidence(evidence);
  requireP1BrowserRunEvidence(evidence);
  await mkdir(path.dirname(CONFIG.output), { recursive: true });
  await writeFile(CONFIG.output, canonicalPrettyStringify(evidence), 'utf8');
  expect(pageErrors).toEqual([]);
});

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
