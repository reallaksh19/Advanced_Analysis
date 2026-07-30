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
