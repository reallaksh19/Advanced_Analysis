#!/usr/bin/env node

/**
 * LAFEA upgrade spec §7.1/§17.4 T6 element patch-test check.
 *
 * Covers `src/core/local-continuum/t6-element.js`: constant-strain and
 * rigid-body patch tests to the spec §17.4 <=1e-10 relative tolerance, on
 * both axis-aligned and generally distorted (non-right, obtuse) triangles
 * — the concrete regression guard for a real inverse-Jacobian sign bug this
 * module was built against (it passed on an axis-aligned fixture where the
 * bug's two swapped terms both happened to be zero, and failed clearly on
 * any distorted one). Also verifies rotation/translation/scaling
 * invariance and rejection of a non-positive Jacobian.
 */

import assert from 'node:assert/strict';
import { t6ElementEvidence, t6BMatrixAt } from '../src/core/local-continuum/t6-element.js';
import { QUALIFICATION_PROFILE, FORMULATIONS } from '../src/core/local-continuum/constants.js';

console.log('\n--- LAFEA §7.1/§17.4 T6 patch-test check ---');
const material = Object.freeze({ materialId: 'M1', elasticModulus: 200000, poissonRatio: 0.3, sourceReference: 'src#M1' });

checkAxisAlignedTriangle();
checkDistortedTriangle();
checkObtuseTriangle();
checkRotationInvariance();
checkTranslationInvariance();
checkScalingInvariance();
checkNonPositiveJacobianRejected();
console.log('\n✅ LAFEA §7.1/§17.4 T6 patch-test check passed.\n');

function relativeResidual(evidence) {
  const rigidRelative = evidence.rigidBodyQualification.maximumStrainResidual / evidence.rigidBodyQualification.scale;
  const affineRelative = evidence.affinePatchQualification.maximumStressResidual / evidence.affinePatchQualification.scale;
  return { rigidRelative, affineRelative };
}

function assertPatchTestsPass(evidence, label) {
  assert.equal(evidence.stiffnessSymmetry.accepted, true, `${label}: stiffness must be symmetric`);
  assert.equal(evidence.rigidBodyQualification.accepted, true, `${label}: rigid-body patch test must pass`);
  assert.equal(evidence.affinePatchQualification.accepted, true, `${label}: affine (constant-strain) patch test must pass`);
  const { rigidRelative, affineRelative } = relativeResidual(evidence);
  assert.ok(rigidRelative <= 1e-10, `${label}: rigid-body relative residual ${rigidRelative} exceeds 1e-10`);
  assert.ok(affineRelative <= 1e-10, `${label}: affine relative residual ${affineRelative} exceeds 1e-10`);
}

function checkAxisAlignedTriangle() {
  const nodes = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }, { x: 0, y: 0.5 }];
  const evidence = t6ElementEvidence('E1', nodes, material, FORMULATIONS.PLANE_STRESS, 5, QUALIFICATION_PROFILE);
  assertPatchTestsPass(evidence, 'axis-aligned right triangle');
  console.log('✅ Axis-aligned unit right triangle passes constant-strain and rigid-body patch tests to <=1e-10 relative.');
}

function checkDistortedTriangle() {
  const nodes = [{ x: 0, y: 0 }, { x: 3, y: 0.5 }, { x: 1, y: 2 }, { x: 1.5, y: 0.25 }, { x: 2, y: 1.25 }, { x: 0.5, y: 1 }];
  const evidence = t6ElementEvidence('E2', nodes, material, FORMULATIONS.PLANE_STRESS, 5, QUALIFICATION_PROFILE);
  assertPatchTestsPass(evidence, 'general distorted triangle');
  console.log('✅ A general (non-right, distorted) triangle passes both patch tests — the inverse-Jacobian regression guard.');
}

function checkObtuseTriangle() {
  const nodes = [{ x: 0, y: 0 }, { x: 5, y: 1 }, { x: -1, y: 4 }, { x: 2.5, y: 0.5 }, { x: 2, y: 2.5 }, { x: -0.5, y: 2 }];
  const evidence = t6ElementEvidence('E3', nodes, material, FORMULATIONS.PLANE_STRAIN, 8, QUALIFICATION_PROFILE);
  assertPatchTestsPass(evidence, 'obtuse triangle, plane strain');
  console.log('✅ An obtuse triangle under plane strain also passes both patch tests.');
}

function rotate(nodes, angle) {
  const c = Math.cos(angle); const s = Math.sin(angle);
  return nodes.map((n) => ({ x: c * n.x - s * n.y, y: s * n.x + c * n.y }));
}

function checkRotationInvariance() {
  const base = [{ x: 0, y: 0 }, { x: 3, y: 0.5 }, { x: 1, y: 2 }, { x: 1.5, y: 0.25 }, { x: 2, y: 1.25 }, { x: 0.5, y: 1 }];
  const rotated = rotate(base, Math.PI / 5);
  const evidenceRotated = t6ElementEvidence('ER', rotated, material, FORMULATIONS.PLANE_STRESS, 5, QUALIFICATION_PROFILE);
  assertPatchTestsPass(evidenceRotated, 'rotated distorted triangle');
  console.log('✅ Patch tests remain exact after a proper rotation of the same element (rotation covariance).');
}

function checkTranslationInvariance() {
  const base = [{ x: 0, y: 0 }, { x: 3, y: 0.5 }, { x: 1, y: 2 }, { x: 1.5, y: 0.25 }, { x: 2, y: 1.25 }, { x: 0.5, y: 1 }];
  const translated = base.map((n) => ({ x: n.x + 1000, y: n.y - 500 }));
  const evidence = t6ElementEvidence('ET', translated, material, FORMULATIONS.PLANE_STRESS, 5, QUALIFICATION_PROFILE);
  assertPatchTestsPass(evidence, 'translated distorted triangle');
  console.log('✅ Patch tests remain exact after a large rigid translation.');
}

function checkScalingInvariance() {
  const base = [{ x: 0, y: 0 }, { x: 3, y: 0.5 }, { x: 1, y: 2 }, { x: 1.5, y: 0.25 }, { x: 2, y: 1.25 }, { x: 0.5, y: 1 }];
  const scaled = base.map((n) => ({ x: n.x * 0.001, y: n.y * 0.001 }));
  const evidence = t6ElementEvidence('ES', scaled, material, FORMULATIONS.PLANE_STRESS, 0.005, QUALIFICATION_PROFILE);
  assertPatchTestsPass(evidence, 'unit-scaled-down distorted triangle');
  console.log('✅ Patch tests remain exact under a unit-scale change (mm-to-m-like rescaling).');
}

function checkNonPositiveJacobianRejected() {
  // Inverted node winding (CW corners) produces a negative Jacobian at every Gauss point.
  const inverted = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0 }];
  assert.throws(() => t6BMatrixAt(inverted, 1 / 6, 1 / 6), (error) => {
    assert.equal(error.code, 'T6_NONPOSITIVE_JACOBIAN');
    return true;
  });
  console.log('✅ A non-positive Jacobian (inverted element) is rejected, never silently accepted.');
}
