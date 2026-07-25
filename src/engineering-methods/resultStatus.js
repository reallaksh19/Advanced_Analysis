/**
 * Enumeration of result statuses used across the simplified analysis
 * application.  Solver modules and QA infrastructure should emit one of
 * these codes to indicate the outcome of a calculation.
 */

export const ResultStatus = {
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  PENDING: 'PENDING',
  NOT_QUALIFIED: 'NOT_QUALIFIED',
  UNSUPPORTED_GEOMETRY: 'UNSUPPORTED_GEOMETRY',
  MISSING_DATA: 'MISSING_DATA',
  BENCHMARK_NOT_CERTIFIED: 'BENCHMARK_NOT_CERTIFIED',
  SCREENING_ONLY: 'SCREENING_ONLY'
};

export default ResultStatus;