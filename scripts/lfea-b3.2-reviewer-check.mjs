#!/usr/bin/env node

/**
 * LFEA B-3.2 permanent reviewer regressions (section 15.5).
 *
 * Each case is a mistake a later edit could plausibly reintroduce into the
 * component layer: bend flexibility applied twice or dropped, unsupported
 * B31J geometry clamped instead of blocked, a branch classified by nominal
 * diameter, a second package claiming ownership of the same flexibility, the
 * pipe centreline moved to the support steel point, or a valve quietly
 * collapsed into a zero-length weight lump.
 */

import assert from 'node:assert/strict';
import * as pipingComponentPackage from '../src/core/linear-fea-piping-components/index.js';
import {
  applyBendingFlexibilityCorrection,
  assertSingleFlexibilityOwnership,
  bendFlexibilityDoubleCountGuard,
  branchFlexibilityGuard,
  compilePipingComponent,
  measurePureBendingRigidity,
} from '../src/core/linear-fea-piping-components/index.js';
import {
  bendFactorSet,
  bendInput,
  branchFactorSet,
  clone,
  compileFixtureBend,
  compileFixtureBranch,
  componentProfile,
  supportOffsetInput,
  valveInput,
} from './lfea-b3.2-piping-component-fixtures.mjs';

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

const bend = compileFixtureBend();
const branch = compileFixtureBranch();
const element = bend.elements[0].frameElement;
const length = element.geometry.length;
const rigidity = element.material.elasticModulus * element.section.secondMomentZ;
const guardInputs = {
  directChordLength: bend.flexibility.doubleCountGuard.directChordLength,
  segmentedLength: bend.flexibility.doubleCountGuard.segmentedLength,
  arcLength: bend.flexibility.doubleCountGuard.arcLength,
  bendingRigidity: rigidity,
  declaredFactor: bend.flexibility.factor,
  geometryBasis: 'ARC_GEOMETRY_EXCLUDED_V1',
  tolerance: bend.flexibility.doubleCountGuard.tolerance,
  toleranceSource: bend.flexibility.doubleCountGuard.toleranceSource,
};

/*
 * Regression 1 — bend flexibility applied twice.
 *
 * The correction is applied to an element that already carries it, exactly as
 * a later edit that calls the corrector inside a loop body would do. The guard
 * measures the resulting rigidity back off the matrix and refuses it.
 */
const twice = applyBendingFlexibilityCorrection(
  { ...clone(element), section: { ...clone(element.section), secondMomentY: element.section.secondMomentY / bend.flexibility.factor, secondMomentZ: element.section.secondMomentZ / bend.flexibility.factor } },
  bend.flexibility.factor,
);
assertExact(
  measurePureBendingRigidity(twice.localStiffness, length),
  rigidity / (bend.flexibility.factor ** 2),
  'the doubly corrected element must show k squared',
);
expectCode(
  () => bendFlexibilityDoubleCountGuard({
    ...guardInputs,
    measuredUncorrectedRigidity: rigidity,
    measuredCorrectedRigidity: measurePureBendingRigidity(twice.localStiffness, length),
  }),
  'PIPING_COMPONENT_BEND_FLEXIBILITY_DOUBLE_COUNT',
);

/*
 * Regression 2 — bend flexibility omitted.
 *
 * The element chain is generated but the correction never reaches the matrix.
 * The guard sees a correction ratio of one against a declared factor above one.
 */
expectCode(
  () => bendFlexibilityDoubleCountGuard({
    ...guardInputs,
    measuredUncorrectedRigidity: rigidity,
    measuredCorrectedRigidity: rigidity,
  }),
  'PIPING_COMPONENT_BEND_FLEXIBILITY_OMITTED',
);
expectCode(
  () => branchFlexibilityGuard({
    geometryBasis: 'JUNCTION_GEOMETRY_EXCLUDED_V1',
    declaredFactor: branch.flexibility.factor,
    measuredUncorrectedRigidity: rigidity,
    measuredCorrectedRigidity: rigidity,
    refinementElementCount: branch.elements.length,
    tolerance: branch.flexibility.doubleCountGuard.tolerance,
    toleranceSource: branch.flexibility.doubleCountGuard.toleranceSource,
  }),
  'PIPING_COMPONENT_BRANCH_FLEXIBILITY_OMITTED',
);

/*
 * Regression 3 — the geometry counted in both places.
 *
 * A factor defined against a straight tangent-to-tangent member, applied to an
 * arc that is already represented geometrically. The surplus is real and
 * measurable, so the refusal does not depend on reading the basis name alone.
 */
expectCode(
  () => bendFlexibilityDoubleCountGuard({
    ...guardInputs,
    geometryBasis: 'ARC_GEOMETRY_INCLUDED_V1',
    measuredUncorrectedRigidity: rigidity,
    measuredCorrectedRigidity: rigidity / bend.flexibility.factor,
  }),
  'PIPING_COMPONENT_BEND_FLEXIBILITY_DOUBLE_COUNT',
);
assert.ok(
  bend.flexibility.doubleCountGuard.segmentationSurplus > bend.flexibility.doubleCountGuard.tolerance,
  'the arc surplus must be large enough for the guard to be a real test',
);

/*
 * Regression 4 — unsupported B31J geometry silently clamped.
 *
 * Both outside-range verdicts must remain refusals, and the profile must have
 * no rule that turns them into a nearest-supported-geometry factor.
 */
for (const status of ['OUTSIDE_RANGE', 'USER_FACTOR_REQUIRED']) {
  assert.throws(() => compilePipingComponent(bendInput({
    factorSet: bendFactorSet({
      applicability: { status, ruleId: 'TABLE-1-1-APPLICABILITY', evaluatedBy: 'PROJECT-B31J-FACTOR-DATASET' },
    }),
  })));
}
expectCode(
  () => componentProfile({ outsideApplicabilityRule: 'NEAREST_SUPPORTED_GEOMETRY' }),
  'PIPING_COMPONENT_OUTSIDE_APPLICABILITY_RULE_NOT_IMPLEMENTED',
);

/*
 * Regression 5 — a branch classified by nominal diameter.
 *
 * The branch here is the largest bore and the run legs are the smallest. A
 * classifier that reached for diameter would name the wrong leg.
 */
const misleading = compileFixtureBranch({
  nominalDiameters: { 'LEG-RUN-A': 0.0603, 'LEG-RUN-B': 0.0603, 'LEG-BRANCH': 0.4064 },
});
assert.deepEqual([...misleading.classification.branchLegIds], ['LEG-BRANCH']);
assert.deepEqual([...misleading.classification.runLegIds].sort(), ['LEG-RUN-A', 'LEG-RUN-B']);
assert.equal(misleading.classification.diameterConsulted, false);

/*
 * Regression 6 — a second owner of the same flexibility.
 */
expectCode(
  () => assertSingleFlexibilityOwnership([bend.flexibilityOwnership, clone(bend.flexibilityOwnership)]),
  'PIPING_COMPONENT_FLEXIBILITY_OWNERSHIP_CONFLICT',
);
expectCode(
  () => assertSingleFlexibilityOwnership([{ ...clone(bend.flexibilityOwnership), ownerPackageId: 'LFEA-B4.0' }]),
  'PIPING_COMPONENT_FLEXIBILITY_OWNERSHIP_FOREIGN',
);
expectCode(
  () => compileFixtureBranch({ factorSet: branchFactorSet({ flexibilityGeometryBasis: 'JUNCTION_GEOMETRY_INCLUDED_V1' }) }),
  'PIPING_COMPONENT_BRANCH_FLEXIBILITY_DOUBLE_COUNT',
);

/*
 * Regression 7 — the pipe centreline moved to the support steel point, and a
 * valve collapsed into a zero-length weight lump that nobody selected.
 */
expectCode(
  () => compilePipingComponent(supportOffsetInput({ relocateCenterline: true })),
  'PIPING_COMPONENT_CENTERLINE_RELOCATION_PROHIBITED',
);
assert.deepEqual(
  compilePipingComponent(supportOffsetInput()).geometry.centerlinePosition,
  supportOffsetInput().centerlinePosition,
);
expectCode(
  () => compilePipingComponent(valveInput({ end: [0, 0, 0] })),
  'PIPING_COMPONENT_ZERO_LENGTH_WEIGHT_LUMP_NOT_SELECTED',
);

/*
 * Regression 8 — a ready-made profile or factor set shipped by the package.
 *
 * The subdivision limits, the tolerances and every B31J factor are project
 * declarations. A built-in one would become the number everybody uses without
 * ever declaring it.
 */
for (const [name, value] of Object.entries(pipingComponentPackage)) {
  if (typeof value !== 'object' || value === null) continue;
  assert.notEqual(value?.profileId, 'LINEAR-PIPING-COMPONENT-R1', `${name} exports a ready-made component profile`);
  assert.equal(
    Object.hasOwn(value, 'flexibilityFactor'),
    false,
    `${name} exports a ready-made flexibility factor; factors arrive declared with a source`,
  );
}

/*
 * Regression 9 — the segmented-bend disclosure lost, or an unconverged bend
 * quietly accepted.
 */
const disclosure = bend.approximations.find(
  (entry) => entry.code === 'PIPING_COMPONENT_APPROXIMATION_SEGMENTED_BEND',
);
assert.ok(disclosure, 'the segmented-bend approximation must remain disclosed');
assert.equal(disclosure.stiffnessRelevant, true);
const unconverged = compilePipingComponent(bendInput({
  profile: componentProfile({ convergenceRelativeTolerance: { value: 1e-15, source: 'PROJECT' } }),
}));
assert.equal(unconverged.acceptanceState, 'BLOCKED');

console.log('LFEA B-3.2 reviewer regression check PASS');
