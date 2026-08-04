export const NON_FEA_BROWSER_EVIDENCE_SCHEMA = 'non-fea-browser-baseline/v1';
export const NON_FEA_BROWSER_STAGE_IDS = Object.freeze([
  'THREE_MATERIALIZATION',
  'GPU_SCENE_INSTALL',
  'FIT',
  'FIRST_MEANINGFUL_FRAME',
  'SELECTION',
  'ORBIT_PAN',
]);

export function installNonFeaBrowserBaseline({
  executionId,
  exactHeadSha,
  fixtureRole,
  fixturePath,
  sourceSha256,
}) {
  requireString(executionId, 'executionId');
  requireSha1(exactHeadSha, 'exactHeadSha');
  requireString(fixtureRole, 'fixtureRole');
  requireString(fixturePath, 'fixturePath');
  requireSha256(sourceSha256, 'sourceSha256');
  const longTasks = [];
  let observer = null;
  if (typeof PerformanceObserver === 'function') {
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.push({ startTimeMs: entry.startTime, durationMs: entry.duration });
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch {
      observer = null;
    }
  }
  const prefix = `non-fea:${executionId}:${fixtureRole}`;
  return Object.freeze({
    mark(stageId) {
      requireBrowserStage(stageId);
      performance.mark(`${prefix}:${stageId}`);
    },
    measure(stageId, startStageId, endStageId) {
      requireBrowserStage(stageId);
      return performance.measure(
        `${prefix}:${stageId}`,
        `${prefix}:${startStageId}`,
        `${prefix}:${endStageId}`,
      );
    },
    snapshot(environment = {}) {
      const measures = performance.getEntriesByType('measure')
        .filter((entry) => entry.name.startsWith(`${prefix}:`))
        .map((entry) => ({
          stageId: entry.name.slice(prefix.length + 1),
          durationMs: roundMilliseconds(entry.duration),
        }));
      return requireNonFeaBrowserEvidence({
        schema: NON_FEA_BROWSER_EVIDENCE_SCHEMA,
        executionId,
        exactHeadSha,
        fixtureRole,
        fixturePath,
        sourceSha256,
        browser: environment.browser ?? null,
        os: environment.os ?? null,
        devicePixelRatio: globalThis.devicePixelRatio,
        viewport: {
          width: globalThis.innerWidth,
          height: globalThis.innerHeight,
        },
        workers: environment.workers ?? 1,
        pageErrors: environment.pageErrors ?? [],
        longTaskSupport: Boolean(observer),
        longTasks: longTasks.map((row) => ({
          startTimeMs: roundMilliseconds(row.startTimeMs),
          durationMs: roundMilliseconds(row.durationMs),
        })),
        stageMeasurements: measures,
        canvasCount: document.querySelectorAll('canvas').length,
        webglCanvasCount: document.querySelectorAll('canvas[data-viewport-backend="webgl"]').length,
        renderOwnerCount: environment.renderOwnerCount ?? null,
      });
    },
    destroy() {
      observer?.disconnect();
      observer = null;
      performance.clearMarks(prefix);
      performance.clearMeasures(prefix);
    },
  });
}

export function requireNonFeaBrowserEvidence(value, expected = {}) {
  const keys = [
    'schema', 'executionId', 'exactHeadSha', 'fixtureRole', 'fixturePath',
    'sourceSha256', 'browser', 'os', 'devicePixelRatio', 'viewport', 'workers',
    'pageErrors', 'longTaskSupport', 'longTasks', 'stageMeasurements',
    'canvasCount', 'webglCanvasCount', 'renderOwnerCount',
  ];
  requireExactKeys(value, keys, 'browserEvidence');
  if (value.schema !== NON_FEA_BROWSER_EVIDENCE_SCHEMA) fail('P0_BROWSER_SCHEMA_INVALID');
  requireString(value.executionId, 'executionId');
  requireSha1(value.exactHeadSha, 'exactHeadSha');
  requireString(value.fixtureRole, 'fixtureRole');
  requireString(value.fixturePath, 'fixturePath');
  requireSha256(value.sourceSha256, 'sourceSha256');
  if (expected.executionId && value.executionId !== expected.executionId) fail('P0_BROWSER_EXECUTION_ID_MISMATCH');
  if (expected.exactHeadSha && value.exactHeadSha !== expected.exactHeadSha) fail('P0_BROWSER_HEAD_SHA_MISMATCH');
  if (expected.fixtureRole && value.fixtureRole !== expected.fixtureRole) fail('P0_BROWSER_FIXTURE_ROLE_MISMATCH');
  requireOptionalString(value.browser, 'browser');
  requireOptionalString(value.os, 'os');
  if (!Number.isFinite(value.devicePixelRatio) || value.devicePixelRatio <= 0) fail('P0_BROWSER_DPR_INVALID');
  requireExactKeys(value.viewport, ['width', 'height'], 'browserEvidence.viewport');
  if (!Number.isInteger(value.viewport.width) || value.viewport.width <= 0
      || !Number.isInteger(value.viewport.height) || value.viewport.height <= 0) {
    fail('P0_BROWSER_VIEWPORT_INVALID');
  }
  if (!Number.isInteger(value.workers) || value.workers !== 1) fail('P0_BROWSER_WORKER_COUNT_INVALID');
  if (!Array.isArray(value.pageErrors) || value.pageErrors.some((row) => typeof row !== 'string')) {
    fail('P0_BROWSER_PAGE_ERRORS_INVALID');
  }
  if (value.pageErrors.length) fail('P0_BROWSER_PAGE_ERRORS_PRESENT');
  if (typeof value.longTaskSupport !== 'boolean') fail('P0_BROWSER_LONG_TASK_SUPPORT_INVALID');
  requireTimingRows(value.longTasks, ['startTimeMs', 'durationMs'], 'P0_BROWSER_LONG_TASK_INVALID');
  requireStageMeasurements(value.stageMeasurements);
  if (value.canvasCount !== 1 || value.webglCanvasCount !== 1) fail('P0_BROWSER_CANVAS_COUNT_INVALID');
  if (value.renderOwnerCount !== 1) fail('P0_BROWSER_RENDER_OWNER_COUNT_INVALID');
  return deepFreeze(value);
}

function requireStageMeasurements(rows) {
  if (!Array.isArray(rows)) fail('P0_BROWSER_STAGE_MEASUREMENTS_INVALID');
  const ids = rows.map((row) => row.stageId);
  if (new Set(ids).size !== ids.length) fail('P0_BROWSER_STAGE_DUPLICATE');
  const expected = [...NON_FEA_BROWSER_STAGE_IDS].sort(codeUnitCompare);
  if (JSON.stringify([...ids].sort(codeUnitCompare)) !== JSON.stringify(expected)) {
    fail('P0_BROWSER_STAGE_COVERAGE_INVALID');
  }
  rows.forEach((row) => {
    requireExactKeys(row, ['stageId', 'durationMs'], 'browserEvidence.stageMeasurement');
    requireBrowserStage(row.stageId);
    if (!Number.isFinite(row.durationMs) || row.durationMs < 0) fail('P0_BROWSER_STAGE_DURATION_INVALID');
  });
}

function requireTimingRows(rows, keys, code) {
  if (!Array.isArray(rows)) fail(code);
  rows.forEach((row) => {
    requireExactKeys(row, keys, 'browserEvidence.timing');
    keys.forEach((key) => {
      if (!Number.isFinite(row[key]) || row[key] < 0) fail(code);
    });
  });
}
function requireBrowserStage(stageId) {
  if (!NON_FEA_BROWSER_STAGE_IDS.includes(stageId)) fail('P0_BROWSER_STAGE_ID_INVALID');
}
function requireExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('P0_BROWSER_OBJECT_INVALID');
  const actual = Object.keys(value).sort(codeUnitCompare);
  const wanted = [...expected].sort(codeUnitCompare);
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(`P0_BROWSER_${label.toUpperCase().replaceAll('.', '_')}_KEYS_INVALID`);
}
function requireString(value, label) {
  if (typeof value !== 'string' || !value || value.trim() !== value) fail(`P0_BROWSER_${label.toUpperCase()}_INVALID`);
}
function requireOptionalString(value, label) {
  if (value !== null && (typeof value !== 'string' || !value.trim())) fail(`P0_BROWSER_${label.toUpperCase()}_INVALID`);
}
function requireSha1(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) fail(`P0_BROWSER_${label.toUpperCase()}_INVALID`);
}
function requireSha256(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) fail(`P0_BROWSER_${label.toUpperCase()}_INVALID`);
}
function roundMilliseconds(value) { return Number(Number(value).toFixed(3)); }
function codeUnitCompare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
function fail(code) { const error = new Error(code); error.code = code; throw error; }
