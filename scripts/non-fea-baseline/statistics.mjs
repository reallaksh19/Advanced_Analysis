import { NON_FEA_STAGE_IDS, codeUnitCompare, roundMilliseconds } from './contracts.mjs';

export function summarizeNonFeaStages(runs) {
  const groups = new Map();
  for (const run of runs) {
    const key = `${run.fixturePath}|${run.sampleKind}`;
    if (!groups.has(key)) {
      groups.set(key, {
        fixturePath: run.fixturePath,
        sampleKind: run.sampleKind,
        durations: new Map(NON_FEA_STAGE_IDS.map((stageId) => [stageId, []])),
      });
    }
    const group = groups.get(key);
    for (const record of run.records || []) {
      if (record.status === 'PASS' && Number.isFinite(record.durationMs)) {
        group.durations.get(record.stageId)?.push(record.durationMs);
      }
    }
  }
  return [...groups.values()]
    .sort((left, right) => codeUnitCompare(`${left.fixturePath}|${left.sampleKind}`, `${right.fixturePath}|${right.sampleKind}`))
    .flatMap((group) => NON_FEA_STAGE_IDS.map((stageId) => statistic(group, stageId)));
}

function statistic(group, stageId) {
  const values = group.durations.get(stageId) || [];
  return Object.freeze({
    fixturePath: group.fixturePath,
    sampleKind: group.sampleKind,
    stageId,
    sampleCount: values.length,
    medianMs: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    maxMs: values.length ? roundMilliseconds(Math.max(...values)) : null,
  });
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return roundMilliseconds(sorted[index]);
}
