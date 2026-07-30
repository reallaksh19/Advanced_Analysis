#!/usr/bin/env node

/**
 * LAFEA upgrade spec §7.1/§17.4 Q8 element patch-test check.
 *
 * Covers `src/core/local-continuum/q8-element.js`: constant-strain and
 * rigid-body patch tests to the spec §17.4 <=1e-10 relative tolerance, on
 * an axis-aligned square and a general distorted convex quadrilateral, plus
 * rotation/translation/scaling invariance and rejection of a non-positive
 * Jacobian.
 */

import assert from 'node:assert/strict';
import { q8ElementEvidence, q8BMatrixAt } from '../src/core/local-continuum/q8-element.js';
import { QUALIFICATION_PROFILE, FORMULATIONS } from '../src/core/local-continuum/constants.js';

console.log('\n--- LAFEA §7.1/§17.4 Q8 patch-test check ---');
const material = Object.freeze({ materialId: 'M1', elasticModulus: 200000, poissonRatio: 0.3, sourceReference: 'src#M1' });

checkAxisAlignedSquare();
checkDistortedQuad();
checkRotationInvariance();
checkTranslationInvariance();
checkScalingInvariance();
checkNonPositiveJacobianRejected();
console.log('\n✅ LAFEA §7.1/§17.4 Q8 patch-test check passed.\n');

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

function distortedQuadCorners() {
  return [{ x: 0, y: 0 }, { x: 4, y: 0.5 }, { x: 5, y: 3 }, { x: 0.5, y: 3.5 }];
}

function withTrueMidsides(corners) {
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return [...corners, mid(corners[0], corners[1]), mid(corners[1], corners[2]), mid(corners[2], corners[3]), mid(corners[3], corners[0])];
}

function checkAxisAlignedSquare() {
  const nodes = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
  const evidence = q8ElementEvidence('E1', nodes, material, FORMULATIONS.PLANE_STRESS, 5, QUALIFICATION_PROFILE);
  assertPatchTestsPass(evidence, 'axis-aligned unit square');
  console.log('✅ Axis-aligned unit square passes constant-strain and rigid-body patch tests to <=1e-10 relative.');
}

function checkDistortedQuad() {
  const nodes = withTrueMidsides(distortedQuadCorners());
  const evidence = q8ElementEvidence('E2', nodes, material, FORMULATIONS.PLANE_STRAIN, 8, QUALIFICATION_PROFILE);
  assertPatchTestsPass(evidence, 'general distorted quadrilateral');
  console.log('✅ A general distorted convex quadrilateral passes both patch tests under plane strain.');
}

function rotate(nodes, angle) {
  const c = Math.cos(angle); const s = Math.sin(angle);
  return nodes.map((n) => ({ x: c * n.x - s * n.y, y: s * n.x + c * n.y }));
}

function checkRotationInvariance() {
  const nodes = rotate(withTrueMidsides(distortedQuadCorners()), Math.PI / 7);
  const evidence = q8ElementEvidence('ER', nodes, material, FORMULATIONS.PLANE_STRESS, 5, QUALIFICATION_PROFILE);
  assertPatchTestsPass(evidence, 'rotated distorted quadrilateral');
  console.log('✅ Patch tests remain exact after a proper rotation of the same element.');
}

function checkTranslationInvariance() {
  const nodes = withTrueMidsides(distortedQuadCorners()).map((n) => ({ x: n.x + 2000, y: n.y - 750 }));
  const evidence = q8ElementEvidence('ET', nodes, material, FORMULATIONS.PLANE_STRESS, 5, QUALIFICATION_PROFILE);
  assertPatchTestsPass(evidence, 'translated distorted quadrilateral');
  console.log('✅ Patch tests remain exact after a large rigid translation.');
}

function checkScalingInvariance() {
  const nodes = withTrueMidsides(distortedQuadCorners()).map((n) => ({ x: n.x * 0.001, y: n.y * 0.001 }));
  const evidence = q8ElementEvidence('ES', nodes, material, FORMULATIONS.PLANE_STRESS, 0.005, QUALIFICATION_PROFILE);
  assertPatchTestsPass(evidence, 'unit-scaled-down distorted quadrilateral');
  console.log('✅ Patch tests remain exact under a unit-scale change.');
}

function checkNonPositiveJacobianRejected() {
  const inverted = [{ x: -1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }];
  assert.throws(() => q8BMatrixAt(inverted, 0, 0), (error) => {
    assert.equal(error.code, 'Q8_NONPOSITIVE_JACOBIAN');
    return true;
  });
  console.log('✅ A non-positive Jacobian (inverted node winding) is rejected, never silently accepted.');
}
