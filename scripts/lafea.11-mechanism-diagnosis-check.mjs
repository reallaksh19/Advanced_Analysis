#!/usr/bin/env node

/**
 * LAFEA upgrade spec §11 mechanism diagnosis check.
 *
 * Covers `src/core/lafea-linear-solve/mechanism-diagnosis.js` against 5
 * curated broken fixtures, each naming the exact offending node/DOF/
 * constraint identity — never a generic "singular matrix".
 */

import assert from 'node:assert/strict';
import {
  LafeaLinearSolveError,
  assembleSparseSymmetric,
  diagnoseMechanisms,
  diagnoseNearZeroPivot,
  findConstraintConflicts,
  requireMechanismFree,
  sparseCholeskyFactorize,
} from '../src/core/lafea-linear-solve/index.js';

console.log('\n--- LAFEA §11 mechanism diagnosis check ---');
checkDisconnectedIslandNamed();
checkUnrestrainedRigidBodyNamed();
checkDuplicateConstraintNamed();
checkConflictingPrescribedDisplacementNamed();
checkNearZeroPivotNamed();
checkMechanismFreeSystemPasses();
console.log('\n✅ LAFEA §11 mechanism diagnosis check passed.\n');

function checkDisconnectedIslandNamed() {
  // DOFs 4,5 ("N3:UX","N3:UY") are never referenced by any element -> a disconnected island.
  const contributions = [{ indices: [0, 1, 2, 3], localMatrix: [[4, 1, 0, 0], [1, 4, 0, 0], [0, 0, 4, 1], [0, 0, 1, 4]] }];
  const matrix = assembleSparseSymmetric(6, contributions);
  const dofIdentities = ['N1:UX', 'N1:UY', 'N2:UX', 'N2:UY', 'N3:UX', 'N3:UY'];
  const diagnosis = diagnoseMechanisms(matrix, dofIdentities, [], new Set([0, 1]));
  const disconnected = diagnosis.diagnostics.find((d) => d.code === 'DISCONNECTED_COMPONENTS');
  assert.ok(disconnected);
  const islandDofs = disconnected.components.flatMap((c) => c.dofIdentities);
  assert.ok(islandDofs.includes('N3:UX') && islandDofs.includes('N3:UY'), 'The disconnected island must name N3, not just report a count');
  console.log('✅ A disconnected DOF island is diagnosed by exact node identity (N3), not a generic count.');
}

function checkUnrestrainedRigidBodyNamed() {
  const contributions = [
    { indices: [0, 1], localMatrix: [[4, 1], [1, 4]] },
    { indices: [2, 3], localMatrix: [[5, 2], [2, 5]] },
  ];
  const matrix = assembleSparseSymmetric(4, contributions);
  const dofIdentities = ['N1:UX', 'N1:UY', 'N2:UX', 'N2:UY'];
  const diagnosis = diagnoseMechanisms(matrix, dofIdentities, [], new Set([0])); // only N1:UX restrained
  const unrestrained = diagnosis.diagnostics.find((d) => d.code === 'UNRESTRAINED_RIGID_BODY_COMPONENT');
  assert.ok(unrestrained);
  assert.deepEqual([...unrestrained.components[0].dofIdentities], ['N2:UX', 'N2:UY']);
  console.log('✅ An unrestrained component is diagnosed by exact node identity (N2), never a bare mechanism count.');
}

function checkDuplicateConstraintNamed() {
  const conflicts = findConstraintConflicts([
    { dofIdentity: 'N1:UX', value: 0 },
    { dofIdentity: 'N1:UX', value: 0.5 },
    { dofIdentity: 'N2:UY', value: 1 },
    { dofIdentity: 'N2:UY', value: 1 }, // duplicate but consistent -> not a conflict
  ]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].dofIdentity, 'N1:UX');
  assert.deepEqual([...conflicts[0].declaredValues], [0, 0.5]);
  console.log('✅ A genuinely conflicting duplicate constraint is named by DOF identity; a consistent duplicate is not flagged.');
}

function checkConflictingPrescribedDisplacementNamed() {
  const contributions = [{ indices: [0, 1], localMatrix: [[4, 1], [1, 4]] }];
  const matrix = assembleSparseSymmetric(2, contributions);
  const dofIdentities = ['N1:UX', 'N1:UY'];
  const constraints = [{ dofIdentity: 'N1:UX', value: 0 }, { dofIdentity: 'N1:UX', value: 1 }];
  const diagnosis = diagnoseMechanisms(matrix, dofIdentities, constraints, new Set([0]));
  const conflict = diagnosis.diagnostics.find((d) => d.code === 'CONFLICTING_PRESCRIBED_DISPLACEMENT');
  assert.ok(conflict);
  assert.equal(conflict.conflicts[0].dofIdentity, 'N1:UX');
  assert.throws(() => requireMechanismFree(diagnosis), (error) => {
    assert.ok(error instanceof LafeaLinearSolveError);
    assert.equal(error.code, 'MECHANISM_DETECTED');
    return true;
  });
  console.log('✅ A conflicting prescribed-displacement declaration is diagnosed and blocks acceptance.');
}

function checkNearZeroPivotNamed() {
  const dofIdentities = ['N1:UX', 'N1:UY'];
  try {
    const matrix = assembleSparseSymmetric(2, [{ indices: [0, 1], localMatrix: [[4, 2], [2, 1]] }]); // singular: det=0
    sparseCholeskyFactorize(matrix, 1e-9);
    assert.fail('Expected a non-positive pivot rejection');
  } catch (error) {
    const named = diagnoseNearZeroPivot(error.evidence.value, error.evidence.pivotTolerance, error.evidence.row, dofIdentities);
    assert.ok(named);
    assert.equal(named.dofIdentity, 'N1:UY');
    console.log('✅ A near-zero/negative pivot is attributed to its exact DOF identity (N1:UY), not a row index alone.');
  }
}

function checkMechanismFreeSystemPasses() {
  const contributions = [{ indices: [0, 1], localMatrix: [[4, 1], [1, 4]] }];
  const matrix = assembleSparseSymmetric(2, contributions);
  const dofIdentities = ['N1:UX', 'N1:UY'];
  const diagnosis = diagnoseMechanisms(matrix, dofIdentities, [], new Set([0, 1]));
  assert.equal(diagnosis.mechanismFree, true);
  assert.equal(requireMechanismFree(diagnosis), diagnosis);
  console.log('✅ A genuinely mechanism-free, fully-restrained system passes diagnosis cleanly.');
}
