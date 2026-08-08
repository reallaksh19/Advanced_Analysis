#!/usr/bin/env node
import assert from 'node:assert/strict';
import { normalizeUnilateralDeclarations } from '../src/core/linear-fea-unilateral-solver/index.js';
import { solveBm4InputXmlConditioned } from './lfea-m034-bm4-solve-runtime.mjs';
import { buildBm4M035FeatureAuthorities } from './lfea-m035-bm4-feature-solve-runtime.mjs';
import { analyseM035M036Case, buildM035M036Inventory } from './lfea-m035-m036-bm4-integration-runtime.mjs';
import { BM4_M038_FORCMNT_AUTHORITY, BM4_M038_FORCMNT_NODE_IDS } from './lfea-m038-bm4-forcmnt-authority.mjs';

const SPARSE = 'FEA_SPARSE_DIRECT_CHOLESKY_LDLT_V1';
const DENSE = 'FEA_DENSE_DIRECT_CHOLESKY_LDLT_V1';

function nodalPrimitives(loadCase) { return loadCase.primitives.filter((row) => row.kind === 'NODAL_FORCE_MOMENT'); }
function primitiveVector(row) { return [row.force.fx, row.force.fy, row.force.fz, row.moment.mx, row.moment.my, row.moment.mz]; }
function mechanicalRows(loadCase, prefix) {
  return nodalPrimitives(loadCase).map((row) => ({ sourceNodeId: row.nodeId.replace(prefix, ''), vector: primitiveVector(row) }))
    .sort((a, b) => a.sourceNodeId.localeCompare(b.sourceNodeId));
}
function assertMembership(label, loadCase, prefix) {
  const rows = mechanicalRows(loadCase, prefix);
  assert.equal(rows.length, 12, `${label} must contain exactly 12 BM4 FORCMNT primitives.`);
  assert.deepEqual(rows.map((row) => row.sourceNodeId), [...BM4_M038_FORCMNT_NODE_IDS]);
  return rows;
}
function assertSameMechanicalSet(label, left, right) {
  assert.deepEqual(left, right, `${label} FORCMNT mechanics must be identical.`);
  for (let row = 0; row < left.length; row += 1) for (let component = 0; component < 6; component += 1) {
    assert.equal(right[row].vector[component] - left[row].vector[component], 0,
      `${label} algebraic cancellation failed at ${left[row].sourceNodeId} component ${component}.`);
  }
}
function assertBourdonDisabled(loadCase) {
  for (const pressure of loadCase.primitives.filter((row) => row.kind === 'PRESSURE')) {
    assert.equal(pressure.authorizedEffects.bourdon, false, 'M038 FORCMNT must not silently authorize Bourdon mechanics.');
  }
}
function initialActiveState(inventory) {
  const normalized = normalizeUnilateralDeclarations(inventory.unilateral);
  const active = normalized.filter((row) => row.initiallyEngaged);
  return Object.freeze({ normalized, declarations: Object.freeze([...inventory.base, ...active.map((row) => row.constraintDeclaration)]),
    movements: Object.freeze(active.map((row) => row.prescribedMovement).filter((row) => row !== null)) });
}
function qualificationSummary(analysis) {
  const f = analysis.execution.factorization;
  return Object.freeze({ status: analysis.execution.status, stiffnessStateHash: analysis.compilation.stiffnessStateHash,
    diagnostics: analysis.execution.diagnostics,
    factorization: { backend: f.backend, scaling: f.scaling, kind: f.kind, pivotStatistics: f.pivotStatistics,
      conditionEstimate: f.conditionEstimate, conditionEstimateMethod: f.conditionEstimateMethod },
    nodalForcePrimitiveCount: analysis.execution.nodalForceDiagnostics.length });
}

const baseline = solveBm4InputXmlConditioned();
const baselineSus = assertMembership('M034 SUS', baseline.sustained.loadCase, 'BM4.N');
const baselineOpe = assertMembership('M034 OPE', baseline.operating.loadCase, 'BM4.N');
assertSameMechanicalSet('M034 SUS/OPE', baselineSus, baselineOpe);
assertBourdonDisabled(baseline.sustained.loadCase);
assertBourdonDisabled(baseline.operating.loadCase);

const authorities = buildBm4M035FeatureAuthorities();
const inventory = buildM035M036Inventory(authorities);
const initial = initialActiveState(inventory);

function solveDiagnostic(label, thermal, backend, includeForcmnt) {
  return analyseM035M036Case(authorities, initial.declarations, label, thermal, initial.movements,
    { skipRecovery: true, includeForcmnt, backend });
}

const susLegacySparse = solveDiagnostic('M038-SUS-LEGACY-SPARSE', false, SPARSE, false);
const susCorrectedSparse = solveDiagnostic('M038-SUS-CORRECTED-SPARSE', false, SPARSE, true);
const susCorrectedDense = solveDiagnostic('M038-SUS-CORRECTED-DENSE', false, DENSE, true);
const opeCorrectedSparse = solveDiagnostic('M038-OPE-CORRECTED-SPARSE', true, SPARSE, true);
const opeCorrectedDense = solveDiagnostic('M038-OPE-CORRECTED-DENSE', true, DENSE, true);

assert.equal(susLegacySparse.compilation.stiffnessStateHash, susCorrectedSparse.compilation.stiffnessStateHash);
assert.equal(susCorrectedSparse.compilation.stiffnessStateHash, susCorrectedDense.compilation.stiffnessStateHash);
assert.equal(opeCorrectedSparse.compilation.stiffnessStateHash, opeCorrectedDense.compilation.stiffnessStateHash);
assert.equal(nodalPrimitives(susLegacySparse.loadCase).length, 0);

const combinedSus = assertMembership('M035+M036 corrected SUS', susCorrectedSparse.loadCase, 'BM4M035.N');
const combinedOpe = assertMembership('M035+M036 corrected OPE', opeCorrectedSparse.loadCase, 'BM4M035.N');
assertSameMechanicalSet('M035+M036 SUS/OPE', combinedSus, combinedOpe);
assertBourdonDisabled(susCorrectedSparse.loadCase);
assertBourdonDisabled(opeCorrectedSparse.loadCase);

console.log(JSON.stringify({
  schema: 'm038-bm4-forcmnt-check/v1', authority: BM4_M038_FORCMNT_AUTHORITY,
  mechanics: { realVectorRows: combinedSus.length, nodeIds: combinedSus.map((row) => row.sourceNodeId),
    susOpeMembershipIdentical: true, expansionCancellationExact: true, bourdonStillDisabled: true },
  initialContactState: { unilateralCount: initial.normalized.length,
    initiallyEngagedCount: initial.normalized.filter((row) => row.initiallyEngaged).length,
    initiallyReleasedCount: initial.normalized.filter((row) => !row.initiallyEngaged).length },
  numericalExperiment: {
    statement: 'All corrected variants use identical mechanics, model, constraints and stiffness state; backend is the only numerical variable.',
    SUS: { legacySparse: qualificationSummary(susLegacySparse), correctedSparse: qualificationSummary(susCorrectedSparse), correctedDense: qualificationSummary(susCorrectedDense) },
    OPE: { correctedSparse: qualificationSummary(opeCorrectedSparse), correctedDense: qualificationSummary(opeCorrectedDense) },
  },
}, null, 2));

assert.notEqual(susCorrectedDense.execution.status, 'BLOCKED', 'Dense reference backend also blocks corrected SUS; backend swap alone is not sufficient.');
assert.notEqual(opeCorrectedDense.execution.status, 'BLOCKED', 'Dense reference backend also blocks corrected OPE; backend swap alone is not sufficient.');
