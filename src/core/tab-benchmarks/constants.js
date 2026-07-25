/**
 * Closed identifiers for tab qualification evidence.
 *
 * Results are intentionally limited to PASS/FAIL. A tab with no complete set
 * of required results is represented as Not Run by the suite qualification.
 */
export const TAB_BENCHMARK_RESULT_SCHEMA = 'tab-benchmark-result/v1';
export const TAB_BENCHMARK_SUITE_SCHEMA = 'tab-benchmark-suite/v1';
export const TAB_BENCHMARK_REGISTRY_SCHEMA = 'tab-benchmark-registry/v1';
export const ADVANCED_ANALYSIS_APP_ID = 'ADVANCED_ANALYSIS';

export const BENCHMARK_EVIDENCE_BASES = Object.freeze([
  'REAL_PROJECT',
  'ANALYTICAL',
  'REGRESSION',
  '[SIMULATED]',
]);

export const BENCHMARK_RESULT_STATUSES = Object.freeze(['PASS', 'FAIL']);
export const TAB_QUALIFICATION_STATUSES = Object.freeze(['Qualified', 'Failed', 'Not Run']);
