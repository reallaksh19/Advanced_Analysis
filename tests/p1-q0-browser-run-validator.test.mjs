import assert from 'node:assert/strict';
import test from 'node:test';
import {
  P1_ACTION_IDS,
  P1_INVOCATION_IDS,
  P1_REQUIRED_STAGE_OBSERVABILITY_IDS,
} from '../scripts/p1/p1-contracts.mjs';
import { requireP1BrowserRunEvidence } from '../scripts/p1/p1-browser-run-validator.mjs';

const HEAD = 'a'.repeat(40);
const SHA = 'b'.repeat(64);

function counts(overrides = {}) {
  return Object.fromEntries(P1_INVOCATION_IDS.map((id) => [id, overrides[id] || 0]));
}
function durations(overrides = {}) {
  return Object.fromEntries(P1_INVOCATION_IDS.map((id) => [
    id,
    Array.from({ length: overrides[id] || 0 }, () => 1),
  ]));
}
function run(sequence, actionId, durationMs = 10, metadata = {}, overrides = {}, status = 'PASS') {
  return {
    sequence,
    actionId,
    status,
    durationMs,
    metadata,
    counts: counts(overrides),
    durations: durations(overrides),
  };
}
function evidence() {
  const native = { timingBasis: 'NATIVE_TRIGGER_TO_FIRST_COMMITTED_RENDER_END' };
  const importCounts = {
    NORMALIZATION_REQUEST: 1,
    ENGINEERING_MODEL_REBUILD: 1,
    VIEWPORT_PIPELINE: 1,
    THREE_SCENE_INSTALL: 1,
    RENDER_FRAME: 1,
  };
  const projectCounts = {
    ENGINEERING_MODEL_REBUILD: 1,
    VIEWPORT_PIPELINE: 1,
    THREE_SCENE_INSTALL: 1,
    RENDER_FRAME: 1,
  };
  const runs = [
    run(1, 'INITIAL_IMPORT', 50, native, importCounts),
    run(2, 'SELECTION_ONLY', 8, native, { RENDER_FRAME: 1 }),
    run(3, 'SELECTION_ONLY', 9, native, { RENDER_FRAME: 1 }),
    run(4, 'ORBIT_PAN', 12, native, { RENDER_FRAME: 1 }),
    run(5, 'ORBIT_PAN', 13, native, { RENDER_FRAME: 1 }),
    run(6, 'MODEL_ZONE_CHANGE', 1,
      { reason: 'NO_EXPLICIT_MODEL_ZONES' }, {}, 'SKIPPED'),
    run(7, 'CALCULATED_EVENT', 1, { reason: 'calculated' }),
    run(8, 'MASTER_DATA_CHANGED', 1, { method: 'masterDataController.setFieldMap' }),
    run(9, 'PROJECT_DATA_CHANGED', 1,
      { method: 'projectDataStore.restoreApprovedProfile' }, projectCounts),
    run(10, 'CLEAR_RELOAD', 70, native, importCounts),
    run(11, 'CONTEXT_RESTORATION', 2, {
      extension: 'WEBGL_lose_context', contextStatus: 'RESTORED',
    }, { THREE_SCENE_INSTALL: 1, RENDER_FRAME: 1 }),
  ];
  return {
    schema: 'non-fea-p1-browser-evidence/v1',
    executionId: 'p1-browser-test',
    exactHeadSha: HEAD,
    fixtureRole: 'LARGE_MODEL_4884_ENTITY',
    fixturePath: 'cache/large-model.json',
    sourceSha256: SHA,
    browser: 'chromium',
    os: 'linux',
    viewport: { width: 1600, height: 1000, devicePixelRatio: 1 },
    sampleCounts: { selection: 2, orbitPan: 2 },
    stageMeasurements: [
      { stageId: 'FILE_SELECTION_TO_FIRST_MEANINGFUL_FRAME', durationMs: 50 },
      { stageId: 'POST_PARSE_MAIN_THREAD_TASK', durationMs: 20 },
      { stageId: 'SELECTION', durationMs: 9 },
      { stageId: 'ORBIT_PAN', durationMs: 13 },
    ],
    detailedStageMeasurements: P1_REQUIRED_STAGE_OBSERVABILITY_IDS.map((stageId) => ({
      stageId,
      durationMs: 1,
    })),
    selectionSamplesMs: [8, 9],
    orbitPanFrameSamplesMs: [12, 13],
    selectionP95Ms: 9,
    orbitPanP95Ms: 13,
    fileSelectionToFirstMeaningfulFrameMs: 50,
    postParseMainThreadTaskMaxMs: 20,
    pageErrors: [],
    longTaskSupport: true,
    longTasks: [],
    canvasCount: 1,
    webglCanvasCount: 1,
    renderOwnerCount: 1,
    observabilityGaps: [],
    invalidationEvidence: {
      schema: 'non-fea-p1-invalidation-evidence/v1',
      executionId: 'p1-browser-test',
      exactHeadSha: HEAD,
      fixtureRole: 'LARGE_MODEL_4884_ENTITY',
      viewportRoute: 'WORKSPACE_STANDARD_VIEWPORT',
      actionIds: P1_ACTION_IDS,
      invocationIds: P1_INVOCATION_IDS,
      runs,
    },
  };
}

test('accepts complete native-trigger browser run custody', () => {
  assert.equal(requireP1BrowserRunEvidence(evidence()).sampleCounts.selection, 2);
});
test('rejects Playwright-wait timing masquerading as selection latency', () => {
  const value = evidence();
  value.invalidationEvidence.runs[1].metadata.timingBasis = 'ACTION_TO_OBSERVER_END';
  assert.throws(() => requireP1BrowserRunEvidence(value),
    /P1_BROWSER_SELECTION_TIMING_BASIS_INVALID/u);
});
test('rejects synthetic context restoration evidence', () => {
  const value = evidence();
  value.invalidationEvidence.runs.at(-1).metadata.extension = 'SYNTHETIC_EVENT';
  assert.throws(() => requireP1BrowserRunEvidence(value),
    /P1_BROWSER_CONTEXT_RESTORATION_NOT_EMPIRICAL/u);
});
test('rejects context restoration without a committed restored frame', () => {
  const value = evidence();
  const row = value.invalidationEvidence.runs.at(-1);
  row.counts.RENDER_FRAME = 0;
  row.durations.RENDER_FRAME = [];
  assert.throws(() => requireP1BrowserRunEvidence(value),
    /P1_BROWSER_CONTEXT_RESTORATION_RENDER_FRAME_MISSING/u);
});
test('rejects failed production publications', () => {
  const value = evidence();
  value.invalidationEvidence.runs[7].status = 'FAIL';
  assert.throws(() => requireP1BrowserRunEvidence(value),
    /P1_BROWSER_MASTER_DATA_CHANGED_STATUS_INVALID/u);
});
test('rejects sample arrays detached from action runs', () => {
  const value = evidence();
  value.selectionSamplesMs[1] = 99;
  assert.throws(() => requireP1BrowserRunEvidence(value),
    /P1_BROWSER_PERCENTILE_MISMATCH|P1_BROWSER_SELECTION_SAMPLE_LEDGER_MISMATCH/u);
});
test('rejects missing detailed stage evidence without a matching gap', () => {
  const value = evidence();
  value.detailedStageMeasurements[0].durationMs = null;
  assert.throws(() => requireP1BrowserRunEvidence(value),
    /P1_BROWSER_OBSERVABILITY_GAP_COVERAGE_INVALID/u);
});
