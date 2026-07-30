#!/usr/bin/env node

/**
 * LAFEA upgrade spec §10.4 convergence-quantities check.
 *
 * Covers `src/core/lafea-meshing/mesh-convergence-framework.js`: only the
 * six declared convergence quantities are accepted (never a raw singular
 * peak), the default §10.3 acceptance table thresholds classify a synthetic
 * two-finest-level relative change correctly, and MONOTONIC/OSCILLATORY/
 * NON_CONVERGENT behavior is classified from the full quantity history.
 */

import assert from 'node:assert/strict';
import {
  CONVERGENCE_QUANTITIES,
  LafeaMeshingError,
  canonicalQuantityHistory,
  qualifyConvergence,
  qualifyConvergenceSet,
  rejectRawSingularPeakAsConvergenceQuantity,
} from '../src/core/lafea-meshing/index.js';

console.log('\n--- LAFEA §10.4 convergence quantities check ---');
checkSixAcceptedQuantities();
checkRawSingularPeakRejected();
checkDefaultAcceptanceLimitsPerQuantity();
checkMonotonicOscillatoryNonConvergentClassification();
checkConvergenceSetAggregation();
checkMinimumThreeLevelsRequired();
console.log('\n✅ LAFEA §10.4 convergence quantities check passed.\n');

function checkSixAcceptedQuantities() {
  assert.equal(CONVERGENCE_QUANTITIES.length, 6);
  for (const quantity of CONVERGENCE_QUANTITIES) assert.equal(rejectRawSingularPeakAsConvergenceQuantity(quantity), quantity);
  console.log('✅ Exactly the six declared quantities are accepted convergence quantities.');
}

function checkRawSingularPeakRejected() {
  assert.throws(() => rejectRawSingularPeakAsConvergenceQuantity('RAW_SINGULAR_PEAK_STRESS'), (error) => {
    assert.ok(error instanceof LafeaMeshingError);
    assert.equal(error.code, 'UNACCEPTED_CONVERGENCE_QUANTITY');
    return true;
  });
  assert.throws(() => rejectRawSingularPeakAsConvergenceQuantity('NODAL_PEAK'), (error) => {
    assert.equal(error.code, 'UNACCEPTED_CONVERGENCE_QUANTITY');
    return true;
  });
  console.log('✅ A raw singular peak is rejected as a convergence quantity, never silently coerced.');
}

function checkDefaultAcceptanceLimitsPerQuantity() {
  // Energy: default limit 2%. 100 -> 101.9 is 1.86% change: accepted.
  const energyOk = canonicalQuantityHistory('STRAIN_ENERGY', [110, 103, 101.9, 100]).valuesByLevel;
  const energyResultOk = qualifyConvergence(canonicalQuantityHistory('STRAIN_ENERGY', energyOk));
  assert.equal(energyResultOk.limit, 0.02);
  assert.ok(energyResultOk.relativeChange < 0.02);
  assert.equal(energyResultOk.accepted, true);

  // Energy 100 -> 103 is 3% change: rejected (limit 2%).
  const energyBad = qualifyConvergence(canonicalQuantityHistory('STRAIN_ENERGY', [120, 110, 103, 100]));
  assert.ok(energyBad.relativeChange > 0.02);
  assert.equal(energyBad.accepted, false);

  // Displacement: default limit 1%.
  const dispOk = qualifyConvergence(canonicalQuantityHistory('SELECTED_DISPLACEMENT', [1.05, 1.005, 1.0]));
  assert.equal(dispOk.limit, 0.01);
  assert.equal(dispOk.accepted, true);

  // Reaction equilibrium: default limit 0.5%.
  const reactionOk = qualifyConvergence(canonicalQuantityHistory('REACTION_EQUILIBRIUM', [1.01, 1.003, 1.0]));
  assert.equal(reactionOk.limit, 0.005);
  assert.equal(reactionOk.accepted, true);

  // SCL membrane / membrane+bending: default limit 3%.
  const sclOk = qualifyConvergence(canonicalQuantityHistory('SCL_MEMBRANE_STRESS', [110, 102, 100]));
  assert.equal(sclOk.limit, 0.03);
  assert.equal(sclOk.accepted, true);
  const sclBendingOk = qualifyConvergence(canonicalQuantityHistory('SCL_MEMBRANE_PLUS_BENDING_STRESS', [110, 102, 100]));
  assert.equal(sclBendingOk.limit, 0.03);

  // Weld structural stress: default limit 5%.
  const structuralOk = qualifyConvergence(canonicalQuantityHistory('WELD_STRUCTURAL_STRESS', [115, 104, 100]));
  assert.equal(structuralOk.limit, 0.05);
  assert.equal(structuralOk.accepted, true);

  // A caller-supplied override replaces the default.
  const overridden = qualifyConvergence(canonicalQuantityHistory('STRAIN_ENERGY', [120, 110, 103, 100]), 0.05);
  assert.equal(overridden.limit, 0.05);
  assert.equal(overridden.accepted, true);

  console.log('✅ Default §10.3 acceptance limits (2%/1%/0.5%/3%/3%/5%) apply per quantity and are overridable.');
}

function checkMonotonicOscillatoryNonConvergentClassification() {
  const monotonic = qualifyConvergence(canonicalQuantityHistory('STRAIN_ENERGY', [130, 115, 105, 100]));
  assert.equal(monotonic.behavior, 'MONOTONIC');

  const oscillatory = qualifyConvergence(canonicalQuantityHistory('STRAIN_ENERGY', [100, 108, 103, 101]));
  assert.equal(oscillatory.behavior, 'OSCILLATORY');
  assert.equal(oscillatory.accepted, false, 'Oscillatory behavior must never be accepted even if the last delta is small');

  const nonConvergent = qualifyConvergence(canonicalQuantityHistory('STRAIN_ENERGY', [100, 90, 130, 80]));
  assert.equal(nonConvergent.behavior, 'NON_CONVERGENT');
  assert.equal(nonConvergent.accepted, false);
  console.log('✅ MONOTONIC/OSCILLATORY/NON_CONVERGENT behavior is classified from the full history, not just the last two levels.');
}

function checkConvergenceSetAggregation() {
  const histories = [
    canonicalQuantityHistory('STRAIN_ENERGY', [110, 103, 101.9, 100]),
    canonicalQuantityHistory('SELECTED_DISPLACEMENT', [1.05, 1.005, 1.0]),
  ];
  const set = qualifyConvergenceSet(histories);
  assert.equal(set.accepted, true);
  assert.equal(set.results.length, 2);

  const badHistories = [...histories, canonicalQuantityHistory('WELD_STRUCTURAL_STRESS', [100, 90, 130, 80])];
  const badSet = qualifyConvergenceSet(badHistories);
  assert.equal(badSet.accepted, false, 'One non-convergent quantity blocks the whole set from auto-acceptance');
  console.log('✅ A single non-convergent quantity blocks auto-acceptance of the whole convergence set.');
}

function checkMinimumThreeLevelsRequired() {
  assert.throws(() => canonicalQuantityHistory('STRAIN_ENERGY', [100, 99]), (error) => {
    assert.equal(error.code, 'INSUFFICIENT_MESH_LEVELS');
    return true;
  });
  console.log('✅ A quantity history with fewer than 3 mesh levels is rejected.');
}
