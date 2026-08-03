import { NON_FEA_STAGE_IDS, roundMilliseconds } from './contracts.mjs';

export function summarizeNonFeaStages(runs) {
  const byStage = new Map(NON_FEA_STAGE_IDS.map((stageId) => [stageId, []]));
  for (const run of runs) {
    for (const record of run.records || []) {
      if (record.status === 'PASS' && Number.isFinite(record.durationMs)) {
        byStage.get(record.stageId)?.push(record.durationMs);
      }
    }
  }
  return [...byStage.entries()].map(([stageId, values]) => ({
    stageId,
    sampleCount: values.length,
    medianMs: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    maxMs: values.length ? roundMilliseconds(Math.max(...values)) : null,
  }));
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return roundMilliseconds(sorted[index]);
}
