#!/usr/bin/env node

/**
 * Shared analysis contract check.
 *
 * Covers `src/core/shared-analysis-contract/`, the primitives the centerline
 * beam (LFEA) and local shell (LAFEA) work packages both build on: declared
 * profile values with no defaults, limitation propagation, and orthonormal
 * right-handed basis qualification that never repairs a basis.
 */

import assert from 'node:assert/strict';
import {
  SharedAnalysisContractError,
  combine,
  cross,
  declaredLimitCheck,
  dot,
  mergeLimitations,
  norm,
  qualifyOrthonormalBasis,
  requireDeclaredValue,
  requireOrthonormalBasis,
  undeclaredCode,
} from '../src/core/shared-analysis-contract/index.js';

const IDENTITY_BASIS = Object.freeze({
  e1: { x: 1, y: 0, z: 0 },
  e2: { x: 0, y: 1, z: 0 },
  e3: { x: 0, y: 0, z: 1 },
});

console.log('\n--- Shared analysis contract check ---');
checkUndeclaredCodes();
checkDeclaredValues();
checkLimitPropagation();
checkLimitationPropagation();
checkBasisQualification();
checkBasisIsNeverRepaired();
checkVectorAlgebra();
console.log('\n✅ Shared analysis contract check passed.\n');

function checkUndeclaredCodes() {
  // The codes both plans quote by name must be derivable from the field name,
  // so a new profile field cannot invent a differently shaped code.
  assert.equal(undeclaredCode('spanSeedingLimit'), 'SPAN_SEEDING_LIMIT_NOT_DECLARED');
  assert.equal(undeclaredCode('contentsDensity'), 'CONTENTS_DENSITY_NOT_DECLARED');
  assert.equal(undeclaredCode('modelExtentAttenuationMultiple'), 'MODEL_EXTENT_ATTENUATION_MULTIPLE_NOT_DECLARED');
  console.log('✅ Undeclared-value codes match the names both plans quote.');
}

function checkDeclaredValues() {
  const profile = { spanSeedingLimit: { value: 3, source: 'PROJECT-PROFILE-1' } };
  const resolved = requireDeclaredValue(profile, 'spanSeedingLimit');
  assert.deepEqual({ ...resolved }, { field: 'spanSeedingLimit', value: 3, source: 'PROJECT-PROFILE-1' });

  // Absent means rejected, never substituted.
  assertRejects(() => requireDeclaredValue({}, 'spanSeedingLimit'), 'SPAN_SEEDING_LIMIT_NOT_DECLARED');
  // A bare number is not a declaration: the source is missing.
  assertRejects(() => requireDeclaredValue({ spanSeedingLimit: 3 }, 'spanSeedingLimit'), 'NOT_A_RECORD');
  assertRejects(
    () => requireDeclaredValue({ spanSeedingLimit: { value: 3 } }, 'spanSeedingLimit'),
    'MISSING_FIELD',
  );
  assertRejects(
    () => requireDeclaredValue({ spanSeedingLimit: { value: 3, source: '' } }, 'spanSeedingLimit'),
    'MISSING_DECLARATION',
  );
  console.log('✅ A profile value without a declared source is rejected, not defaulted.');
}

function checkLimitPropagation() {
  // A hard cap belongs to the method, not the project: the mesh growth ratio
  // above 1.5 degrades solution quality regardless of who wrote the profile.
  const profile = { meshGrowthRatioLimit: { value: 1.8, source: 'PROJECT-PROFILE-1' } };
  assertRejects(
    () => requireDeclaredValue(profile, 'meshGrowthRatioLimit', { maximum: 1.5 }),
    'DECLARED_VALUE_ABOVE_MAXIMUM',
  );

  const limit = requireDeclaredValue({ ratioMinimum: { value: 20, source: 'PROFILE' } }, 'ratioMinimum');
  const accepted = declaredLimitCheck('THIN_SHELL', 34, limit, 'AT_LEAST');
  const rejected = declaredLimitCheck('THIN_SHELL', 12, limit, 'AT_LEAST');
  assert.equal(accepted.accepted, true);
  assert.equal(rejected.accepted, false);
  // A check must carry the computed value, the limit and where the limit came from.
  for (const record of [accepted, rejected]) {
    assert.equal(record.limit, 20);
    assert.equal(record.limitSource, 'PROFILE');
    assert.equal(record.limitField, 'ratioMinimum');
    assert.equal(typeof record.actual, 'number');
  }
  console.log('✅ Limit checks carry value, limit and limit source; hard caps reject.');
}

function checkLimitationPropagation() {
  const merged = mergeLimitations(
    ['IN_PLANE_BENDING_ONLY', 'RESTING_SUPPORT_MODELLED_AS_BILATERAL'],
    ['PAD_MODELLED_AS_THICKNESS_STEP', 'IN_PLANE_BENDING_ONLY'],
  );
  assert.deepEqual([...merged], [
    'IN_PLANE_BENDING_ONLY',
    'PAD_MODELLED_AS_THICKNESS_STEP',
    'RESTING_SUPPORT_MODELLED_AS_BILATERAL',
  ]);
  assert.equal(Object.isFrozen(merged), true);
  assertRejects(() => mergeLimitations(['ok', '']), 'MISSING_DECLARATION');
  console.log('✅ Limitations propagate: the merge is a union and drops nothing.');
}

function checkBasisQualification() {
  const qualified = requireOrthonormalBasis(IDENTITY_BASIS, 1e-12, 'identity');
  assert.equal(qualified.accepted, true);
  assert.equal(qualified.tolerance, 1e-12);
  assert.equal(qualified.handedness, 1);

  // Left-handed triad: unit and orthogonal, but e1 x e2 = -e3.
  const leftHanded = { e1: { x: 1, y: 0, z: 0 }, e2: { x: 0, y: 1, z: 0 }, e3: { x: 0, y: 0, z: -1 } };
  assert.equal(qualifyOrthonormalBasis(leftHanded).handedness, -1);
  assertRejects(() => requireOrthonormalBasis(leftHanded, 1e-12, 'leftHanded'), 'BASIS_NOT_ORTHONORMAL_RIGHT_HANDED');

  const nonUnit = { e1: { x: 2, y: 0, z: 0 }, e2: { x: 0, y: 1, z: 0 }, e3: { x: 0, y: 0, z: 1 } };
  assertRejects(() => requireOrthonormalBasis(nonUnit, 1e-12, 'nonUnit'), 'BASIS_NOT_ORTHONORMAL_RIGHT_HANDED');

  const skewed = { e1: { x: 1, y: 0, z: 0 }, e2: { x: 0.1, y: 1, z: 0 }, e3: { x: 0, y: 0, z: 1 } };
  assertRejects(() => requireOrthonormalBasis(skewed, 1e-12, 'skewed'), 'BASIS_NOT_ORTHONORMAL_RIGHT_HANDED');

  // The tolerance is an engineering value; it has no default.
  assertRejects(() => requireOrthonormalBasis(IDENTITY_BASIS, 0, 'zeroTolerance'), 'BASIS_TOLERANCE_NOT_DECLARED');
  assertRejects(() => requireOrthonormalBasis(IDENTITY_BASIS, undefined, 'noTolerance'), 'NON_FINITE_VALUE');
  console.log('✅ Basis qualification rejects non-unit, skewed and left-handed triads by name.');
}

function checkBasisIsNeverRepaired() {
  const nonUnit = Object.freeze({
    e1: Object.freeze({ x: 2, y: 0, z: 0 }),
    e2: Object.freeze({ x: 0, y: 1, z: 0 }),
    e3: Object.freeze({ x: 0, y: 0, z: 1 }),
  });
  // Measuring must not mutate, and must not hand back a normalised copy.
  const measured = qualifyOrthonormalBasis(nonUnit);
  assert.equal(measured.unitDeviation.e1, 1);
  assert.equal(nonUnit.e1.x, 2);
  assert.equal(Object.keys(measured).includes('e1'), false);
  console.log('✅ A basis is measured, never re-normalised.');
}

function checkVectorAlgebra() {
  const rotated = {
    e1: { x: 0, y: 1, z: 0 },
    e2: { x: 0, y: 0, z: 1 },
    e3: { x: 1, y: 0, z: 0 },
  };
  requireOrthonormalBasis(rotated, 1e-12, 'rotated');
  // Components are combined with the supplied vectors, in order.
  assert.deepEqual({ ...combine(rotated, { a: 3, b: 5, c: 7 }) }, { x: 7, y: 3, z: 5 });
  assert.equal(dot({ x: 1, y: 2, z: 3 }, { x: 4, y: -5, z: 6 }), 12);
  assert.deepEqual({ ...cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }) }, { x: 0, y: 0, z: 1 });
  assert.equal(norm({ x: 3, y: 4, z: 0 }), 5);
  console.log('✅ Vector algebra composes components in the supplied basis order.');
}

function assertRejects(action, code) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof SharedAnalysisContractError, `Expected a SharedAnalysisContractError, got ${error.name}`);
    assert.equal(error.code, code, `Expected code ${code}, got ${error.code}`);
    return true;
  });
}
