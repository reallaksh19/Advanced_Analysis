export const STATUS_RANK = {
  ERROR: 100,
  FAILED: 90,
  MISSING_DATA: 80,
  UNSUPPORTED_GEOMETRY: 70,
  NOT_QUALIFIED: 60,
  BENCHMARK_NOT_CERTIFIED: 50,
  SCREENING_ONLY: 40,
  PENDING: 30,
  NOT_RUN: 20,
  PASSED: 10
};

export const CRITICAL_STATUSES = new Set([
  'ERROR',
  'FAILED',
  'MISSING_DATA',
  'UNSUPPORTED_GEOMETRY',
  'NOT_QUALIFIED'
]);

export function getWorstStatus(statuses = []) {
  const clean = statuses.filter(Boolean);
  if (!clean.length) return 'PASSED';
  return clean.reduce((worst, current) => {
    const worstRank = STATUS_RANK[worst] ?? 0;
    const currentRank = STATUS_RANK[current] ?? 0;
    return currentRank > worstRank ? current : worst;
  }, 'PASSED');
}

export function isCriticalStatus(status) {
  return CRITICAL_STATUSES.has(status);
}

export function statusTone(status) {
  if (CRITICAL_STATUSES.has(status)) return 'critical';
  if (['SCREENING_ONLY', 'BENCHMARK_NOT_CERTIFIED', 'PENDING', 'NOT_RUN'].includes(status)) return 'warning';
  return 'normal';
}
