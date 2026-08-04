import { canonicalStringify } from '../../src/core/shared-piping-model/canonical-json.js';
import {
  P1_ACTION_IDS,
  P1_BROWSER_EVIDENCE_SCHEMA,
  P1_BROWSER_STAGE_IDS,
  P1_INVOCATION_IDS,
  P1_REQUIRED_STAGE_OBSERVABILITY_IDS,
  codeUnitCompare,
  percentile,
  requireExactKeys,
  requireFiniteNonNegative,
  requireIntegerNonNegative,
  requireNullableFiniteNonNegative,
  requireSha1,
  requireSha256,
  requireString,
} from './p1-contracts.mjs';
import { requireP1InvalidationEvidence } from './p1-invalidation-recorder.mjs';

const BROWSER_KEYS = [
  'schema', 'executionId', 'exactHeadSha', 'fixtureRole', 'fixturePath',
  'sourceSha256', 'browser', 'os', 'viewport', 'sampleCounts',
  'stageMeasurements', 'detailedStageMeasurements', 'selectionSamplesMs',
  'orbitPanFrameSamplesMs', 'selectionP95Ms', 'orbitPanP95Ms',
  'fileSelectionToFirstMeaningfulFrameMs', 'postParseMainThreadTaskMaxMs',
  'pageErrors', 'longTaskSupport', 'longTasks', 'canvasCount',
  'webglCanvasCount', 'renderOwnerCount', 'observabilityGaps',
  'invalidationEvidence',
];
const SINGLE_RUN_ACTIONS = Object.freeze([
  'INITIAL_IMPORT',
  'MODEL_ZONE_CHANGE',
  'CALCULATED_EVENT',
  'MASTER_DATA_CHANGED',
  'PROJECT_DATA_CHANGED',
  'CLEAR_RELOAD',
  'CONTEXT_RESTORATION',
]);
const NATIVE_RENDER_TIMING = 'NATIVE_TRIGGER_TO_FIRST_COMMITTED_RENDER_END';

export function requireP1BrowserEvidence(value) {
  requireExactKeys(value, BROWSER_KEYS, 'p1BrowserEvidence');
  if (value.schema !== P1_BROWSER_EVIDENCE_SCHEMA) fail('P1_BROWSER_SCHEMA_INVALID');
  requireString(value.executionId, 'browser.executionId');
  requireSha1(value.exactHeadSha, 'browser.exactHeadSha');
  requireString(value.fixtureRole, 'browser.fixtureRole');
  requireString(value.fixturePath, 'browser.fixturePath');
  requireSha256(value.sourceSha256, 'browser.sourceSha256');
  requireString(value.browser, 'browser.browser');
  requireString(value.os, 'browser.os');
  requireViewport(value.viewport);
  requireSampleCounts(value.sampleCounts);
  requireSummaryStages(value.stageMeasurements);
  requireDetailedStages(value.detailedStageMeasurements, value.observabilityGaps);
  requireSamples(value.selectionSamplesMs, 'browser.selectionSamplesMs');
  requireSamples(value.orbitPanFrameSamplesMs, 'browser.orbitPanFrameSamplesMs');
  requireNullableFiniteNonNegative(value.selectionP95Ms, 'browser.selectionP95Ms');
  requireNullableFiniteNonNegative(value.orbitPanP95Ms, 'browser.orbitPanP95Ms');
  requireNullableFiniteNonNegative(value.fileSelectionToFirstMeaningfulFrameMs,
    'browser.fileSelectionToFirstMeaningfulFrameMs');
  requireNullableFiniteNonNegative(value.postParseMainThreadTaskMaxMs,
    'browser.postParseMainThreadTaskMaxMs');
  requireStringArray(value.pageErrors, 'P1_BROWSER_PAGE_ERRORS_INVALID');
  if (value.longTaskSupport !== true) fail('P1_BROWSER_LONG_TASK_SUPPORT_INVALID');
  requireTimingRows(value.longTasks);
  requireIntegerNonNegative(value.canvasCount, 'browser.canvasCount');
  requireIntegerNonNegative(value.webglCanvasCount, 'browser.webglCanvasCount');
  requireIntegerNonNegative(value.renderOwnerCount, 'browser.renderOwnerCount');
  requireP1InvalidationEvidence(value.invalidationEvidence);
  validateBrowserSummaries(value);
  return value;
}

export function requireP1BrowserRunEvidence(value) {
  requireP1BrowserEvidence(value);
  const runs = value.invalidationEvidence.runs;
  validateSequence(runs);
  const byAction = new Map(P1_ACTION_IDS.map((id) => [id, []]));
  runs.forEach((row) => byAction.get(row.actionId)?.push(row));
  SINGLE_RUN_ACTIONS.forEach((actionId) => {
    if (byAction.get(actionId).length !== 1) fail(`P1_BROWSER_${actionId}_COVERAGE_INVALID`);
  });

  requireSampleCoverage(byAction.get('SELECTION_ONLY'), value.sampleCounts.selection,
    value.selectionSamplesMs, 'SELECTION');
  requireSampleCoverage(byAction.get('ORBIT_PAN'), value.sampleCounts.orbitPan,
    value.orbitPanFrameSamplesMs, 'ORBIT_PAN');

  const initial = byAction.get('INITIAL_IMPORT')[0];
  requirePass(initial, 'INITIAL_IMPORT');
  requireNativeTiming(initial, 'INITIAL_IMPORT');
  requireInvocations(initial, [
    'NORMALIZATION_REQUEST', 'ENGINEERING_MODEL_REBUILD', 'VIEWPORT_PIPELINE',
    'THREE_SCENE_INSTALL', 'RENDER_FRAME',
  ]);
  if (initial.durationMs !== value.fileSelectionToFirstMeaningfulFrameMs) {
    fail('P1_BROWSER_INITIAL_IMPORT_DURATION_MISMATCH');
  }

  const calculated = byAction.get('CALCULATED_EVENT')[0];
  requirePass(calculated, 'CALCULATED_EVENT');
  if (calculated.metadata?.reason !== 'calculated') {
    fail('P1_BROWSER_CALCULATED_EVENT_REASON_INVALID');
  }

  const masterData = byAction.get('MASTER_DATA_CHANGED')[0];
  requirePass(masterData, 'MASTER_DATA_CHANGED');
  if (masterData.metadata?.method !== 'masterDataController.setFieldMap') {
    fail('P1_BROWSER_MASTER_DATA_ROUTE_NOT_PRODUCTION_API');
  }

  const projectData = byAction.get('PROJECT_DATA_CHANGED')[0];
  requirePass(projectData, 'PROJECT_DATA_CHANGED');
  if (projectData.metadata?.method !== 'projectDataStore.restoreApprovedProfile') {
    fail('P1_BROWSER_PROJECT_DATA_ROUTE_NOT_PRODUCTION_API');
  }
  requireInvocations(projectData, [
    'ENGINEERING_MODEL_REBUILD', 'VIEWPORT_PIPELINE',
    'THREE_SCENE_INSTALL', 'RENDER_FRAME',
  ]);

  const modelZone = byAction.get('MODEL_ZONE_CHANGE')[0];
  if (modelZone.status === 'SKIPPED') {
    if (modelZone.metadata?.reason !== 'NO_EXPLICIT_MODEL_ZONES') {
      fail('P1_BROWSER_MODEL_ZONE_SKIP_INVALID');
    }
  } else {
    requirePass(modelZone, 'MODEL_ZONE_CHANGE');
    requireInvocations(modelZone, ['VIEWPORT_PIPELINE', 'THREE_SCENE_INSTALL', 'RENDER_FRAME']);
  }

  const clearReload = byAction.get('CLEAR_RELOAD')[0];
  requirePass(clearReload, 'CLEAR_RELOAD');
  requireInvocations(clearReload, [
    'NORMALIZATION_REQUEST', 'ENGINEERING_MODEL_REBUILD', 'VIEWPORT_PIPELINE',
    'THREE_SCENE_INSTALL', 'RENDER_FRAME',
  ]);

  const context = byAction.get('CONTEXT_RESTORATION')[0];
  requirePass(context, 'CONTEXT_RESTORATION');
  if (context.metadata?.extension !== 'WEBGL_lose_context'
      || context.metadata?.contextStatus !== 'RESTORED') {
    fail('P1_BROWSER_CONTEXT_RESTORATION_NOT_EMPIRICAL');
  }
  requireInvocations(context, ['THREE_SCENE_INSTALL', 'RENDER_FRAME']);
  return value;
}

function requireViewport(value) {
  requireExactKeys(value, ['width', 'height', 'devicePixelRatio'], 'browser.viewport');
  if (!Number.isInteger(value.width) || value.width <= 0
      || !Number.isInteger(value.height) || value.height <= 0) {
    fail('P1_BROWSER_VIEWPORT_INVALID');
  }
  if (!Number.isFinite(value.devicePixelRatio) || value.devicePixelRatio <= 0) {
    fail('P1_BROWSER_DPR_INVALID');
  }
}
function requireSampleCounts(value) {
  requireExactKeys(value, ['selection', 'orbitPan'], 'browser.sampleCounts');
  requireIntegerNonNegative(value.selection, 'browser.sampleCounts.selection');
  requireIntegerNonNegative(value.orbitPan, 'browser.sampleCounts.orbitPan');
}
function requireSummaryStages(rows) {
  if (!Array.isArray(rows)) fail('P1_BROWSER_STAGE_MEASUREMENTS_INVALID');
  const ids = rows.map((row) => row.stageId);
  requireExactCoverage(ids, P1_BROWSER_STAGE_IDS, 'P1_BROWSER_STAGE');
  rows.forEach((row) => {
    requireExactKeys(row, ['stageId', 'durationMs'], 'browser.stageMeasurement');
    requireFiniteNonNegative(row.durationMs, `browser.stage:${row.stageId}`);
  });
}
function requireDetailedStages(rows, gaps) {
  if (!Array.isArray(rows)) fail('P1_BROWSER_DETAILED_STAGES_INVALID');
  const ids = rows.map((row) => row.stageId);
  requireExactCoverage(ids, P1_REQUIRED_STAGE_OBSERVABILITY_IDS,
    'P1_BROWSER_DETAILED_STAGE');
  rows.forEach((row) => {
    requireExactKeys(row, ['stageId', 'durationMs'], 'browser.detailedStageMeasurement');
    requireNullableFiniteNonNegative(row.durationMs, `browser.detailedStage:${row.stageId}`);
  });
  requireStringArray(gaps, 'P1_BROWSER_OBSERVABILITY_GAPS_INVALID');
  requireExactCoverage(gaps, rows.filter((row) => row.durationMs === null).map((row) => row.stageId),
    'P1_BROWSER_OBSERVABILITY_GAP');
}
function validateBrowserSummaries(value) {
  if (value.sampleCounts.selection !== value.selectionSamplesMs.length
      || value.sampleCounts.orbitPan !== value.orbitPanFrameSamplesMs.length) {
    fail('P1_BROWSER_SAMPLE_COUNT_MISMATCH');
  }
  if (value.selectionP95Ms !== percentile(value.selectionSamplesMs, 0.95)
      || value.orbitPanP95Ms !== percentile(value.orbitPanFrameSamplesMs, 0.95)) {
    fail('P1_BROWSER_PERCENTILE_MISMATCH');
  }
  const stages = new Map(value.stageMeasurements.map((row) => [row.stageId, row.durationMs]));
  if (stages.get('FILE_SELECTION_TO_FIRST_MEANINGFUL_FRAME')
      !== value.fileSelectionToFirstMeaningfulFrameMs
      || stages.get('POST_PARSE_MAIN_THREAD_TASK') !== value.postParseMainThreadTaskMaxMs
      || stages.get('SELECTION') !== value.selectionP95Ms
      || stages.get('ORBIT_PAN') !== value.orbitPanP95Ms) {
    fail('P1_BROWSER_STAGE_SUMMARY_MISMATCH');
  }
}
function requireSampleCoverage(runs, expectedCount, samples, label) {
  if (runs.length !== expectedCount || samples.length !== expectedCount || expectedCount < 1) {
    fail(`P1_BROWSER_${label}_RUN_COUNT_INVALID`);
  }
  const ordered = [...runs].sort((left, right) => left.sequence - right.sequence);
  ordered.forEach((row) => {
    requirePass(row, label);
    requireNativeTiming(row, label);
    requireInvocation(row, 'RENDER_FRAME');
  });
  if (canonicalStringify(ordered.map((row) => row.durationMs))
      !== canonicalStringify(samples)) fail(`P1_BROWSER_${label}_SAMPLE_LEDGER_MISMATCH`);
}
function validateSequence(runs) {
  const sequences = runs.map((row) => row.sequence);
  if (new Set(sequences).size !== sequences.length) fail('P1_BROWSER_RUN_SEQUENCE_DUPLICATE');
  const ordered = [...sequences].sort((left, right) => left - right);
  if (ordered.some((value, index) => value !== index + 1)) {
    fail('P1_BROWSER_RUN_SEQUENCE_NONCONTIGUOUS');
  }
}
function requireExactCoverage(actual, expected, prefix) {
  if (new Set(actual).size !== actual.length) fail(`${prefix}_DUPLICATE`);
  const a = [...actual].sort(codeUnitCompare);
  const e = [...expected].sort(codeUnitCompare);
  if (canonicalStringify(a) !== canonicalStringify(e)) fail(`${prefix}_COVERAGE_INVALID`);
}
function requireTimingRows(rows) {
  if (!Array.isArray(rows)) fail('P1_BROWSER_LONG_TASKS_INVALID');
  rows.forEach((row) => {
    requireExactKeys(row, ['startTimeMs', 'durationMs'], 'browser.longTask');
    requireFiniteNonNegative(row.startTimeMs, 'browser.longTask.startTimeMs');
    requireFiniteNonNegative(row.durationMs, 'browser.longTask.durationMs');
  });
}
function requireSamples(rows, label) {
  if (!Array.isArray(rows)) fail('P1_BROWSER_SAMPLES_INVALID');
  rows.forEach((value, index) => requireFiniteNonNegative(value, `${label}[${index}]`));
}
function requireStringArray(rows, code) {
  if (!Array.isArray(rows) || rows.some((row) => typeof row !== 'string' || !row)) fail(code);
}
function requirePass(row, label) {
  if (row?.status !== 'PASS') fail(`P1_BROWSER_${label}_STATUS_INVALID`);
}
function requireNativeTiming(row, label) {
  if (row.metadata?.timingBasis !== NATIVE_RENDER_TIMING) {
    fail(`P1_BROWSER_${label}_TIMING_BASIS_INVALID`);
  }
}
function requireInvocations(row, ids) { ids.forEach((id) => requireInvocation(row, id)); }
function requireInvocation(row, invocationId) {
  if (Number(row.counts?.[invocationId] || 0) < 1) {
    fail(`P1_BROWSER_${row.actionId}_${invocationId}_MISSING`);
  }
}
function fail(code) { const error = new Error(code); error.code = code; throw error; }
