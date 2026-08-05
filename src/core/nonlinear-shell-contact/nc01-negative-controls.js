import { clonePlain, sealWithHash } from './contracts.js';
import { DEFAULT_SHELL_FORMULATION } from './shell-formulation-contract.js';
import { createSyntheticQualifiedShellEvidence, createSyntheticSolverBridgeBinding } from './nc01-fixtures.js';
import { evaluateShellQualification } from './shell-qualification-evaluator.js';

export function runNc01NegativeControls() {
  const head = '1111111111111111111111111111111111111111';
  const upstream = createSyntheticSolverBridgeBinding();
  const base = createSyntheticQualifiedShellEvidence(head);
  const controls = [
    ['CALLER_CREATED_PASS', (rows) => { rows[0].passed = true; }],
    ['STALE_EXACT_HEAD', (rows) => { rows[0].exactHeadSha = '2222222222222222222222222222222222222222'; }],
    ['DISPLAY_AVERAGED_STRESS', (rows) => { rows[0].recovery = 'DISPLAY_NODAL_AVERAGE'; }],
    ['NEAREST_NODE_PROBE', (rows) => { rows[0].recovery = 'NEAREST_NODE'; }],
    ['TAMPERED_REPORT', (rows) => { rows[0].observedError = 0.009; }],
    ['REFERENCE_UNCERTAINTY_UNDERSTATED', (rows) => { rows[0].referenceUncertainty = 0.02; }],
    ['ERROR_EXCEEDS_TOLERANCE', (rows) => { rows[0].observedError = 0.02; }],
    ['EQUILIBRIUM_FAILURE', (rows) => { rows[0].equilibriumResidual = 1e-3; }],
    ['ENERGY_FAILURE', (rows) => { rows[0].energyResidual = 1e-2; }],
    ['HOURGLASS_FAILURE', (rows) => { rows[0].hourglassEnergyRatio = 0.08; }],
    ['SHEAR_LOCKING_FAILURE', (rows) => { rows[0].transverseShearEnergyRatio = 0.15; }],
    ['MUTATION_NOT_DETECTED', (rows) => { rows[0].mutation.mutatedError = 0.005; }],
    ['NON_REFINING_GLOBAL_H', (rows) => { rows[0].meshLevels[2].globalH = 0.75; }],
    ['NON_REFINING_PROBE_H', (rows) => { rows[0].meshLevels[2].probeLocalH = 0.5; }],
    ['MISSING_BENCHMARK', (rows) => { rows.pop(); }],
    ['DUPLICATE_BENCHMARK', (rows) => { rows.push(clonePlain(rows[0])); }],
  ];
  return controls.map(([controlId, mutate]) => {
    const rows = base.map((row) => clonePlain(row));
    mutate(rows);
    rows.forEach((row, index) => {
      if (!Object.hasOwn(row, 'semanticHash')) return;
      if (controlId === 'TAMPERED_REPORT' || controlId === 'CALLER_CREATED_PASS') return;
      delete row.semanticHash;
      rows[index] = sealWithHash(row, 'semanticHash');
    });
    try {
      const report = evaluateShellQualification({ contract: DEFAULT_SHELL_FORMULATION, upstreamReceipt: upstream, candidateExactHeadSha: head, benchmarkEvidence: rows });
      return { controlId, passed: report.status === 'NC01_BLOCKED', reason: report.blockers.join('|') };
    } catch (error) {
      return { controlId, passed: true, reason: error.message };
    }
  });
}
