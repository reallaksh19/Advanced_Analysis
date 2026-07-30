#!/usr/bin/env node

/**
 * LAFEA upgrade spec §11.1 tolerance table check.
 *
 * Covers `residual-evidence.js`, `energy-evidence.js`, `condition-
 * estimate.js`: one assertion per §11.1 row — normalized residual default
 * <=1e-9 (warn 1e-9..1e-7, block >1e-7), global force equilibrium <=max(1e-
 * 6*applied resultant, absolute floor), energy balance default relative
 * mismatch <=1e-7, and condition estimate always reported.
 */

import assert from 'node:assert/strict';
import {
  assembleSparseSymmetric,
  computeEnergyEvidence,
  computeResidualEvidence,
  estimateConditionNumber,
  qualifyEnergyBalance,
  qualifyGlobalEquilibrium,
  qualifyNormalizedResidual,
  sparseCholeskyFactorize,
  sparseCholeskySolve,
} from '../src/core/lafea-linear-solve/index.js';
import { partitionSparseSystem, reconstructFullDisplacement } from '../src/core/lafea-linear-solve/bc-elimination.js';

console.log('\n--- LAFEA §11.1 tolerance table check ---');
checkNormalizedResidualThresholds();
checkGlobalForceEquilibriumThreshold();
checkEnergyBalanceThreshold();
checkConditionEstimateAlwaysReported();
console.log('\n✅ LAFEA §11.1 tolerance table check passed.\n');

function solvedSystem() {
  const A = [[10, 1, 0, 2], [1, 8, 0.5, 0], [0, 0.5, 6, 1], [2, 0, 1, 12]];
  const matrix = assembleSparseSymmetric(4, [{ indices: [0, 1, 2, 3], localMatrix: A }]);
  const force = [1, 2, 3, 4];
  const prescribed = new Map([[0, 0.25]]);
  const { freeMatrix, freeIndices, rightHandSide } = partitionSparseSystem(matrix, force, prescribed);
  const factor = sparseCholeskyFactorize(freeMatrix, 1e-10);
  const freeSolution = sparseCholeskySolve(factor, rightHandSide);
  const displacement = reconstructFullDisplacement(4, freeIndices, freeSolution, prescribed);
  return { matrix, force, prescribed, freeIndices, displacement, factor, freeMatrix };
}

function checkNormalizedResidualThresholds() {
  const { matrix, force, displacement, freeIndices } = solvedSystem();
  const evidence = computeResidualEvidence(matrix, displacement, force, freeIndices);
  const accepted = qualifyNormalizedResidual(evidence.normalizedResidual);
  assert.equal(accepted.status, 'OK', `A converged solve should be well within the 1e-9 default: got ${evidence.normalizedResidual}`);

  const warnCase = qualifyNormalizedResidual(5e-8);
  assert.equal(warnCase.status, 'WARNING');
  const blockCase = qualifyNormalizedResidual(5e-6);
  assert.equal(blockCase.status, 'BLOCK');
  const exactAcceptBoundary = qualifyNormalizedResidual(1e-9);
  assert.equal(exactAcceptBoundary.status, 'OK');
  const exactBlockBoundary = qualifyNormalizedResidual(1e-7);
  assert.equal(exactBlockBoundary.status, 'WARNING');
  console.log('✅ Normalized residual: OK<=1e-9, WARNING in (1e-9,1e-7], BLOCK>1e-7.');
}

function checkGlobalForceEquilibriumThreshold() {
  const applied = 1000;
  const withinLimit = qualifyGlobalEquilibrium(applied, -999.999, { relativeLimit: 1e-6, absoluteFloor: 1e-6 });
  assert.equal(withinLimit.accepted, true);
  const outsideLimit = qualifyGlobalEquilibrium(applied, -990, { relativeLimit: 1e-6, absoluteFloor: 1e-6 });
  assert.equal(outsideLimit.accepted, false);
  // Absolute floor governs when the applied resultant itself is tiny.
  const tinyApplied = qualifyGlobalEquilibrium(1e-9, -1e-9 + 5e-7, { relativeLimit: 1e-6, absoluteFloor: 1e-6 });
  assert.equal(tinyApplied.accepted, true, 'The absolute floor must govern, not an unreachable relative limit near zero');
  console.log('✅ Global force equilibrium uses max(relativeLimit*appliedResultant, absoluteFloor), including the floor for tiny resultants.');
}

function checkEnergyBalanceThreshold() {
  const { matrix, force, displacement, prescribed, freeIndices } = solvedSystem();
  const evidence = computeEnergyEvidence(matrix, displacement, force, [...prescribed.keys()], freeIndices);
  const qualified = qualifyEnergyBalance(evidence);
  assert.equal(qualified.relativeLimit, 1e-7);
  assert.equal(qualified.accepted, true, `A converged linear-static solve should balance energy within 1e-7: got ${evidence.relativeImbalance}`);
  assert.equal(evidence.signConvention, 'HALF_LOAD_DISPLACEMENT_PRODUCT_INTERNAL_EQUALS_EXTERNAL_PLUS_PRESCRIBED_WORK');
  console.log('✅ Energy balance defaults to a 1e-7 relative-mismatch limit for a converged linear-static solve.');
}

function checkConditionEstimateAlwaysReported() {
  const { freeMatrix, factor } = solvedSystem();
  const solve = (rhs) => sparseCholeskySolve(factor, rhs);
  const estimate = estimateConditionNumber(freeMatrix, solve);
  assert.ok(Number.isFinite(estimate.conditionEstimate));
  assert.ok(typeof estimate.largestConverged === 'boolean');
  assert.ok(typeof estimate.smallestConverged === 'boolean');
  console.log('✅ A condition estimate is always reported, with convergence evidence alongside it.');
}
