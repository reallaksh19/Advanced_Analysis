const QUERY_PARAMETER = 'nonFeaP0Evidence';
const MEASURE_PREFIX = 'workspace:p0:';

export function isNonFeaP0ObservabilityEnabled() {
  const search = globalThis.location?.search;
  if (typeof search !== 'string' || !search) return false;
  return new URLSearchParams(search).get(QUERY_PARAMETER) === '1';
}

export function measureNonFeaP0Stage(stageId, callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('P0 stage measurement requires a callback.');
  }
  if (!isNonFeaP0ObservabilityEnabled() || !hasUserTiming()) return callback();
  const startedAtMs = globalThis.performance.now();
  try {
    return callback();
  } finally {
    recordNonFeaP0Duration(stageId, globalThis.performance.now() - startedAtMs);
  }
}

export function recordNonFeaP0Duration(stageId, durationMs) {
  if (!isNonFeaP0ObservabilityEnabled() || !hasUserTiming()) return;
  if (typeof stageId !== 'string' || !/^[A-Z0-9_]+$/u.test(stageId)) {
    throw new TypeError('P0 stage ID must use uppercase identifier syntax.');
  }
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new TypeError('P0 stage duration must be finite and non-negative.');
  }
  const endAtMs = globalThis.performance.now();
  globalThis.performance.measure(`${MEASURE_PREFIX}${stageId}`, {
    start: Math.max(0, endAtMs - durationMs),
    end: endAtMs,
  });
}

export function readNonFeaP0StageDurations() {
  if (!hasUserTiming()) return Object.freeze({});
  const totals = {};
  for (const entry of globalThis.performance.getEntriesByType('measure')) {
    if (!entry.name.startsWith(MEASURE_PREFIX)) continue;
    const stageId = entry.name.slice(MEASURE_PREFIX.length);
    totals[stageId] = (totals[stageId] ?? 0) + entry.duration;
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(totals).map(([stageId, durationMs]) => [
      stageId,
      Number(durationMs.toFixed(3)),
    ]),
  ));
}

function hasUserTiming() {
  return typeof globalThis.performance?.now === 'function'
    && typeof globalThis.performance?.measure === 'function';
}
