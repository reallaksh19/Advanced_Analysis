#!/usr/bin/env node

/**
 * LFEA B-3.1 permanent reviewer regressions (section 15.5).
 *
 * Each case is a mistake a later edit could plausibly reintroduce into the
 * element formulation: swapped bending planes, a bending inertia used for
 * torsion, the transformation identity reversed, a full end release accepted
 * as a mechanism, a shear correction factor invented as a default, or a
 * geometry-based formulation switch.
 */

import assert from 'node:assert/strict';
import * as frameElementPackage from '../src/core/linear-fea-frame-element/index.js';
import {
  frameLocalStiffness,
  frameTransformationMatrix,
  transformStiffnessToGlobal,
} from '../src/core/linear-fea-frame-element/index.js';
import {
  axisResult,
  compileFixtureElement,
  matrixAt,
  timoshenkoProfile,
} from './lfea-b3.1-frame-element-fixtures.mjs';

function expectCode(body, expectedCode) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, expectedCode, `expected ${expectedCode}, received ${error?.code}`);
    return true;
  });
}

function assertExact(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) <= 1e-12 * Math.max(Math.abs(expected), 1),
    `${message}: ${actual} != ${expected}`,
  );
}

/*
 * Regression 1 — swapped local bending planes.
 *
 * A circular pipe hides an Iy/Iz swap because the two inertias are equal, so
 * the plane assignment is pinned on the kernel with deliberately unequal
 * inertias: local-y deflection (DOF UY) bends about z on Iz, local-z
 * deflection (DOF UZ) bends about y on Iy. A swap flips both diagonals.
 */
const distinct = frameLocalStiffness({
  elasticModulus: 2e11,
  shearModulus: 7.7e10,
  area: 3e-3,
  secondMomentY: 4e-6,
  secondMomentZ: 9e-6,
  polarMoment: 1.3e-5,
  length: 2,
  shearDeformation: false,
});
assertExact(matrixAt(distinct.matrix, 1, 1), (12 * 2e11 * 9e-6) / 8, 'UY bending must use Iz');
assertExact(matrixAt(distinct.matrix, 2, 2), (12 * 2e11 * 4e-6) / 8, 'UZ bending must use Iy');
assertExact(matrixAt(distinct.matrix, 5, 5), (4 * 2e11 * 9e-6) / 2, 'RZ rotation must use Iz');
assertExact(matrixAt(distinct.matrix, 4, 4), (4 * 2e11 * 4e-6) / 2, 'RY rotation must use Iy');

/*
 * Regression 2 — a bending inertia standing in for the torsion constant.
 *
 * J is declared distinct from Iy, Iz and their sum above, so `GJ/L` built from
 * any inertia would miss this exact value.
 */
assertExact(matrixAt(distinct.matrix, 3, 3), (7.7e10 * 1.3e-5) / 2, 'torsion must use the polar moment');
assert.notEqual(matrixAt(distinct.matrix, 3, 3), (7.7e10 * 4e-6) / 2);
assert.notEqual(matrixAt(distinct.matrix, 3, 3), (7.7e10 * 9e-6) / 2);

/*
 * Regression 3 — the transformation identity reversed.
 *
 * For an element along global Y, `K_global = transpose(T) K_local T` places
 * the axial stiffness EA/L on the global UY diagonal. The reversed composition
 * `T K transpose(T)` puts it elsewhere; both facts are pinned.
 */
const alongY = compileFixtureElement({ nodeJ: [0, 2, 0], axisResult: axisResult([0, 0, 0], [0, 2, 0], [0, 0, 1]) });
const axial = (alongY.material.elasticModulus * alongY.section.area) / 2;
assertExact(matrixAt(alongY.globalStiffness, 1, 1), axial, 'axial stiffness must land on global UY');
const transformation = frameTransformationMatrix(alongY.localAxes.axes);
const reversedTransformation = Array.from({ length: 144 }, (_, flat) => {
  const row = Math.floor(flat / 12);
  const column = flat % 12;
  return transformation[column * 12 + row];
});
const reversed = transformStiffnessToGlobal(alongY.localStiffness, reversedTransformation);
assert.notEqual(
  matrixAt(reversed, 1, 1).toPrecision(6),
  matrixAt(alongY.globalStiffness, 1, 1).toPrecision(6),
  'reversing the transform identity must not be invisible',
);

/*
 * Regression 4 — mechanisms accepted through the release path.
 */
expectCode(
  () => compileFixtureElement({
    releases: ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => ({ end: 'I', dof })),
  }),
  'FRAME_ELEMENT_RELEASE_MECHANISM',
);
expectCode(
  () => compileFixtureElement({
    releases: [{ end: 'I', dof: 'RX' }, { end: 'J', dof: 'RX' }],
  }),
  'FRAME_ELEMENT_RELEASE_SINGULAR',
);

/*
 * Regression 5 — a shear correction factor invented as a default.
 *
 * `{value, source: 'DEFAULT'}` is the shape this profile is most likely to
 * acquire, because kappa for a thin annulus feels like a constant. It is
 * refused, an undeclared factor is refused by name, and the package exports
 * no ready-made formulation profile a caller could lean on.
 */
expectCode(
  () => timoshenkoProfile({ shearCorrectionFactorY: { value: 0.53, source: 'DEFAULT' } }),
  'FRAME_ELEMENT_PROFILE_SOURCE_NOT_TRACEABLE',
);
expectCode(
  () => timoshenkoProfile({ shearCorrectionFactorZ: null }),
  'SHEAR_CORRECTION_FACTOR_Z_NOT_DECLARED',
);
for (const [name, value] of Object.entries(frameElementPackage)) {
  if (typeof value !== 'object' || value === null) continue;
  assert.notEqual(
    value?.profileId,
    'LINEAR-FRAME-ELEMENT-R1',
    `${name} exports a ready-made formulation profile; the profile must come from the project`,
  );
}

/*
 * Regression 6 — a geometry-based formulation switch.
 *
 * Section 5.2: EULER_BERNOULLI or TIMOSHENKO is declared, never inferred from
 * slenderness. Under the Euler-Bernoulli profile a deep element and a slender
 * element must both produce the exact phi = 0 bending diagonal.
 */
for (const length of [0.2, 40]) {
  const element = compileFixtureElement({ nodeJ: [length, 0, 0] });
  const expected = (12 * element.material.elasticModulus * element.section.secondMomentZ) / length ** 3;
  assertExact(
    matrixAt(element.localStiffness, 1, 1),
    expected,
    `Euler-Bernoulli must stay exact at length ${length}`,
  );
  assert.equal(element.shearDeformation, false);
  assert.equal(
    element.limitations.some((entry) => entry.code === 'FRAME_ELEMENT_LIMITATION_NO_SHEAR_DEFORMATION'),
    true,
    'the no-shear disclosure must survive',
  );
}

/*
 * Regression 7 — the straight-beam approximation disclosure lost.
 */
const disclosure = compileFixtureElement().limitations.find(
  (entry) => entry.code === 'FRAME_ELEMENT_LIMITATION_STRAIGHT_BEAM_APPROXIMATION',
);
assert.ok(disclosure, 'the straight-beam approximation must remain disclosed');
assert.equal(disclosure.stiffnessRelevant, true);

console.log('LFEA B-3.1 reviewer regression check PASS');
