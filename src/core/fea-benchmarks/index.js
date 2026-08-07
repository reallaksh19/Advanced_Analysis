/**
 * FEA benchmark suite — public API.
 *
 * Verification tiers:
 *   T1_CLOSED_FORM   an exact analytical answer exists (patch test, Lame, uniaxial)
 *   T2_CONVERGENCE   no exact single-mesh answer; refinement behaviour is verified
 *   T3_INVARIANT     no reference needed; a physical or architectural law must hold
 *   T4_PRESENTATION  the displayed value must equal the published kernel evidence
 *   T5_PERFORMANCE   declared cost budgets
 */
export {
  BENCHMARK_REPORT_SCHEMA, CASE_STATUS, compareBenchmarkReports, runBenchmarks,
} from './runner.js';
export {
  BENCHMARK_ENTITY_KINDS,
  BENCHMARK_QUALIFICATION_REPORT_SCHEMA,
  BENCHMARK_RESULT_ROW_SCHEMA,
  BENCHMARK_ROW_STATUSES,
  benchmarkResultRowIdentity,
  normalizeBenchmarkResultRows,
  requireGovernedBenchmarkRecord,
  sealBenchmarkQualificationReport,
} from './qualification-contract.js';
export { compareBenchmarkResultRows } from './qualification-comparison.js';
export { normalizeLinearSolverBenchmarkResult } from './qualification-normalization.js';
export { runGovernedBenchmarkQualification } from './qualification-pipeline.js';
export {
  BM4_QUALIFICATION_ADAPTER_ID,
  BM4_QUALIFICATION_CASE_IDS,
  createBm4QualificationAdapter,
  normalizeBm4ReferenceCase,
} from './adapters/bm4.js';
export { kernelBenchmarkCases } from './cases-kernel.js';
export { presentationBenchmarkCases } from './cases-presentation.js';
export { performanceBenchmarkCases } from './cases-performance.js';

import { kernelBenchmarkCases } from './cases-kernel.js';
import { presentationBenchmarkCases } from './cases-presentation.js';
import { performanceBenchmarkCases } from './cases-performance.js';

export const BENCHMARK_TIERS = Object.freeze([
  'T1_CLOSED_FORM', 'T2_CONVERGENCE', 'T3_INVARIANT', 'T4_PRESENTATION', 'T5_PERFORMANCE',
]);

/**
 * Every registered benchmark case, in deterministic order.
 *
 * @returns {Array<Record<string, unknown>>} Case definitions.
 */
export function allBenchmarkCases() {
  return [
    ...kernelBenchmarkCases(),
    ...presentationBenchmarkCases(),
    ...performanceBenchmarkCases(),
  ];
}

/**
 * Cases attached to a given workbench surface.
 *
 * @param {string} surface 'LFEA' or 'LAFEA'.
 * @returns {Array<Record<string, unknown>>} Case definitions.
 */
export function benchmarkCasesForSurface(surface) {
  if (surface === 'LFEA') return allBenchmarkCases();
  if (surface === 'LAFEA') {
    return allBenchmarkCases().filter((row) => row.kernel !== 'lfea-workbench');
  }
  throw new TypeError(`Unknown benchmark surface: ${surface}.`);
}
