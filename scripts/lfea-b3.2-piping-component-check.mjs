#!/usr/bin/env node

/**
 * LFEA B-3.2 piping-component check.
 *
 * Covers `src/core/linear-fea-piping-components/`: the section 3.4 subdivision
 * authority table, the section 3.5 bend subdivision defaults and double-count
 * proof, the section 4.3 component stiffness profiles, the section 10.4
 * ownership rule, the section 11 approximation register, and the section 15.2
 * benchmarks BEND-01 (90-degree elbow subdivision/flexibility convergence) and
 * BRANCH-01 (tee direction classification and factor ownership).
 */

import assert from 'node:assert/strict';
import { canonicalStringify } from '../src/core/shared-piping-model/canonical-json.js';
import { DOF_ORDER } from '../src/core/linear-fea-contract/conventions.js';
import {
  PIPING_COMPONENT_RECORD_KEYS,
  assertSingleFlexibilityOwnership,
  bendFlexibilityDoubleCountGuard,
  classifyBranchLegs,
  compilePipingComponent,
  evaluateBendSubdivisionConvergence,
  measurePureBendingRigidity,
  requirePipingComponent,
  resolveBendSubdivision,
  resolvePipingComponentPolicies,
} from '../src/core/linear-fea-piping-components/index.js';
import {
  BEND_RADIUS,
  bendFactorSet,
  bendInput,
  branchFactorSet,
  branchInput,
  clone,
  compileFixtureBend,
  compileFixtureBranch,
  componentProfile,
  materialResolution,
  reducedSectionResolution,
  reducerInput,
  rigidLinkInput,
  sectionResolution,
  supportOffsetInput,
  timoshenkoProfile,
  valveInput,
} from './lfea-b3.2-piping-component-fixtures.mjs';

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
}

function expectCode(body, expectedCode) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, expectedCode, `expected ${expectedCode}, received ${error?.code}`);
    return true;
  });
}

function assertClose(actual, expected, relativeTolerance, message) {
  const scale = Math.max(Math.abs(expected), 1e-300);
  assert.ok(
    Math.abs(actual - expected) <= relativeTolerance * scale,
    `${message}: ${actual} differs from ${expected} beyond ${relativeTolerance} relative`,
  );
}

function assertDeepFrozen(value, path = '$') {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, `${path} is not frozen`);
  if (Array.isArray(value)) value.forEach((child, index) => assertDeepFrozen(child, `${path}[${index}]`));
  else Object.entries(value).forEach(([key, child]) => assertDeepFrozen(child, `${path}.${key}`));
}

console.log('\n--- LFEA B-3.2 piping component check ---');

const profile = componentProfile();
const policies = resolvePipingComponentPolicies(profile);
const bend = compileFixtureBend();
const branch = compileFixtureBranch();

test('B32-T01', 'Compilation produces a sealed immutable component record', () => {
  assert.deepEqual(Object.keys(bend).sort(), [...PIPING_COMPONENT_RECORD_KEYS].sort());
  assert.equal(bend.schema, 'fea-linear-piping-component/v1');
  assert.equal(bend.componentType, 'BEND');
  assert.equal(bend.formulationId, 'PIPE_BEND_CORRECTED_FRAME_V1');
  assert.equal(bend.profileSemanticHash, profile.semanticHash);
  assertDeepFrozen(bend);
  assert.equal(requirePipingComponent(clone(bend)).semanticHash, bend.semanticHash);
});

test('B32-T02', 'The component profile is exact-keyed, frozen by identity and fully declared', () => {
  expectCode(() => componentProfile({ bendFormulation: 'PIPE_BEND_ELASTIC_CENTRE_V1' }), 'PIPING_COMPONENT_PROFILE_INVALID');
  expectCode(() => componentProfile({ branchClassificationRule: 'NOMINAL_DIAMETER_V1' }), 'PIPING_COMPONENT_PROFILE_INVALID');
  expectCode(
    () => componentProfile({ outsideApplicabilityRule: 'CLAMP' }),
    'PIPING_COMPONENT_OUTSIDE_APPLICABILITY_RULE_NOT_IMPLEMENTED',
  );
  expectCode(() => componentProfile({ bendMaxAngleDegrees: null }), 'BEND_MAX_ANGLE_DEGREES_NOT_DECLARED');
  expectCode(() => componentProfile({ bendMinimumElements: null }), 'BEND_MINIMUM_ELEMENTS_NOT_DECLARED');
  expectCode(
    () => componentProfile({ flexibilityDoubleCountTolerance: { value: 1e-9, source: 'DEFAULT' } }),
    'PIPING_COMPONENT_PROFILE_SOURCE_NOT_TRACEABLE',
  );
  expectCode(
    () => componentProfile({ bendMinimumElements: { value: 4.5, source: 'PROJECT' } }),
    'PIPING_COMPONENT_PROFILE_INVALID',
  );
  const stale = { ...clone(profile), semanticHash: 'fnv1a64:0000000000000000' };
  expectCode(() => compilePipingComponent(bendInput({ profile: stale })), 'PIPING_COMPONENT_HASH_MISMATCH');
});

test('B32-T03', 'The flexibility factor set arrives declared, traceable and hash-bound', () => {
  expectCode(
    () => bendFactorSet({ sourceIdentity: { standard: 'ASSUMED', edition: '2023', ruleId: 'R', sourceRevision: '1', sourceSemanticHash: 'fnv1a64:6666666666666666' } }),
    'PIPING_COMPONENT_FACTOR_SOURCE_NOT_TRACEABLE',
  );
  expectCode(() => bendFactorSet({ flexibilityFactor: null }), 'FLEXIBILITY_FACTOR_NOT_DECLARED');
  expectCode(() => bendFactorSet({ flexibilityGeometryBasis: 'JUNCTION_GEOMETRY_EXCLUDED_V1' }), 'PIPING_COMPONENT_FACTOR_SET_INVALID');
  expectCode(
    () => compilePipingComponent(bendInput({ factorSet: branchFactorSet() })),
    'PIPING_COMPONENT_FACTOR_SET_COMPONENT_MISMATCH',
  );
  expectCode(() => compilePipingComponent(bendInput({ factorSet: null })), 'PIPING_COMPONENT_FACTOR_SET_REQUIRED');
  const stale = { ...clone(bendFactorSet()), semanticHash: 'fnv1a64:0000000000000000' };
  expectCode(() => compilePipingComponent(bendInput({ factorSet: stale })), 'PIPING_COMPONENT_HASH_MISMATCH');
});

test('B32-T04', 'BEND-01 arc subdivision follows the declared authority and never relaxes it', () => {
  assert.equal(bend.subdivision.governingRule, 'MAX_CENTRAL_ANGLE');
  assert.equal(bend.subdivision.elementCount % 2, 0, 'the element count must be even');
  assert.equal(bend.elements.length, bend.subdivision.elementCount);
  assert.ok(
    bend.subdivision.segmentAngle <= bend.subdivision.maximumSegmentAngle,
    'no segment may exceed the declared maximum central angle',
  );
  assert.equal(bend.subdivision.declared.bendMaxAngleDegrees, 5);
  assert.equal(bend.subdivision.subdivisionPurpose, 'STRESS_RECOVERY_V1');

  /* The minimum element count governs when the angle limit is slack. */
  const coarse = resolveBendSubdivision(Math.PI / 2, resolvePipingComponentPolicies(
    componentProfile({ bendMaxAngleDegrees: { value: 45, source: 'PROJECT' } }),
  ));
  assert.equal(coarse.governingRule, 'MINIMUM_ELEMENTS');
  assert.equal(coarse.elementCount, 4);

  /* The tangent-to-mid-arc station separation governs when it is the strictest. */
  const stationDriven = resolveBendSubdivision(Math.PI / 2, resolvePipingComponentPolicies(componentProfile({
    bendMaxAngleDegrees: { value: 45, source: 'PROJECT' },
    bendMinimumElementsBetweenStations: { value: 4, source: 'PROJECT' },
  })));
  assert.equal(stationDriven.governingRule, 'TANGENT_TO_MID_ARC_STATION_SEPARATION');
  assert.equal(stationDriven.elementCount, 8);
});

test('B32-T05', 'BEND-01 code stations sit on nodes with at least two elements to the mid-arc', () => {
  const kinds = bend.codeStations.map((station) => station.kind);
  assert.deepEqual(kinds, ['BEND_TANGENT_START', 'BEND_MID_ARC', 'BEND_TANGENT_END']);
  const [start, mid, end] = bend.codeStations;
  assert.deepEqual(start.position, bend.geometry.tangentStart);
  end.position.forEach((value, axis) => assertClose(
    value === 0 ? 1 : value,
    bend.geometry.tangentEnd[axis] === 0 ? 1 : bend.geometry.tangentEnd[axis],
    1e-12,
    'the last chain point must be the second tangent point',
  ));
  assert.equal(mid.arcFraction, 0.5);
  const elementsToMidArc = bend.subdivision.elementCount / 2;
  assert.ok(
    elementsToMidArc >= policies.bendMinimumElementsBetweenStations.value,
    'at least two elements must separate the tangent and mid-arc stations',
  );
  /* The mid-arc station is on the arc, at the declared radius from the centre. */
  const radial = Math.hypot(
    mid.position[0] - bend.geometry.centre[0],
    mid.position[1] - bend.geometry.centre[1],
    mid.position[2] - bend.geometry.centre[2],
  );
  assertClose(radial, BEND_RADIUS, 1e-12, 'the mid-arc station must lie on the arc');
});

test('B32-T06', 'BEND-01 applies the declared flexibility factor to bending rigidity exactly once', () => {
  const first = bend.elements[0];
  const length = first.frameElement.geometry.length;
  const uncorrected = measurePureBendingRigidity(first.frameElement.localStiffness, length);
  const corrected = measurePureBendingRigidity(first.stiffnessCorrection.localStiffness, length);
  const rigidity = first.frameElement.material.elasticModulus * first.frameElement.section.secondMomentZ;
  assertClose(uncorrected, rigidity, 1e-12, 'the uncorrected element must carry E*I');
  assertClose(corrected, rigidity / 4.5, 1e-12, 'the corrected element must carry E*I/k');
  assert.deepEqual(first.stiffnessCorrection.appliedTo, ['BENDING_Y', 'BENDING_Z']);
  assert.deepEqual(first.effectiveLocalStiffness, first.stiffnessCorrection.localStiffness);
  /* Axial and torsional rigidity are untouched by a bending flexibility factor. */
  assert.equal(first.effectiveLocalStiffness[0], first.frameElement.localStiffness[0]);
  assert.equal(first.effectiveLocalStiffness[3 * 12 + 3], first.frameElement.localStiffness[3 * 12 + 3]);
  assert.equal(bend.flexibility.factor, 4.5);
  assert.equal(bend.flexibility.sourceIdentity.standard, 'ASME_B31J_2023');
  assert.equal(bend.flexibility.pressureStiffeningRule, 'BEND_PRESSURE_STIFFENING_EXCLUDED_V1');
});

test('B32-T07', 'The double-count guard measures segmentation and correction separately', () => {
  const guard = bend.flexibility.doubleCountGuard;
  assert.equal(guard.guardId, 'BEND_FLEXIBILITY_SINGLE_APPLICATION_V1');
  assert.equal(guard.accepted, true);
  assertClose(guard.appliedCorrectionRatio, 4.5, 1e-12, 'the measured correction must reproduce the declared factor');
  /* The arc's own developed length is what segmentation contributes: pi/2 * R against the chord R*sqrt(2). */
  assertClose(
    guard.geometricFlexibilityRatio,
    guard.segmentedLength / guard.directChordLength,
    1e-12,
    'the geometric surplus must be the developed-length ratio',
  );
  assert.ok(guard.segmentationSurplus > 0, 'a 90-degree arc is longer than its chord');
  assertClose(
    guard.totalFlexibilityRatio,
    guard.geometricFlexibilityRatio * guard.appliedCorrectionRatio,
    1e-12,
    'the total must factor into geometry times correction',
  );
  assertClose(guard.arcLength, (Math.PI / 2) * BEND_RADIUS, 1e-9, 'the arc length must match the true arc');
});

test('B32-T08', 'A factor whose basis already contains the arc geometry is refused, not applied', () => {
  expectCode(
    () => compilePipingComponent(bendInput({
      factorSet: bendFactorSet({ flexibilityGeometryBasis: 'ARC_GEOMETRY_INCLUDED_V1' }),
    })),
    'PIPING_COMPONENT_BEND_FLEXIBILITY_DOUBLE_COUNT',
  );
});

test('B32-T09', 'BEND-01 reports convergence against a finer arc subdivision', () => {
  const report = bend.convergence;
  assert.equal(report.schema, 'fea-linear-bend-convergence-report/v1');
  assert.equal(report.refined.elementCount, report.base.elementCount * report.refinementFactor);
  assert.equal(report.accepted, true);
  assert.ok(report.displacementRelativeDelta > 0, 'a coarser arc must differ from a finer one');
  assert.ok(report.displacementRelativeDelta <= report.tolerance);
  assert.equal(report.endMomentRelativeDelta, 0, 'the cantilever end moment is statically determinate');

  /* Refining the base subdivision must reduce the residual delta. */
  const finer = evaluateBendSubdivisionConvergence({
    tangentStart: bend.geometry.tangentStart,
    tangentEnd: bend.geometry.tangentEnd,
    centre: bend.geometry.centre,
    elementCount: report.base.elementCount * 2,
    bendingRigidity: bend.elements[0].frameElement.material.elasticModulus
      * bend.elements[0].frameElement.section.secondMomentZ,
    planeNormal: bend.geometry.planeNormal,
    policies,
  });
  assert.ok(
    finer.displacementRelativeDelta < report.displacementRelativeDelta,
    'the subdivision must converge, not merely differ',
  );
});

test('B32-T10', 'An unconverged bend is disclosed as UNRESOLVED and blocks acceptance', () => {
  const strict = compilePipingComponent(bendInput({
    profile: componentProfile({ convergenceRelativeTolerance: { value: 1e-14, source: 'PROJECT' } }),
  }));
  assert.equal(strict.convergence.accepted, false);
  const disclosure = strict.approximations.find((entry) => entry.code === 'PIPING_COMPONENT_APPROXIMATION_SEGMENTED_BEND');
  assert.equal(disclosure.status, 'UNRESOLVED');
  assert.equal(strict.acceptanceState, 'BLOCKED');
  assert.equal(bend.acceptanceState, 'ACCEPTED');
});

test('B32-T11', 'Unsupported B31J geometry blocks; it is never clamped', () => {
  expectCode(
    () => compilePipingComponent(bendInput({
      factorSet: bendFactorSet({
        applicability: { status: 'OUTSIDE_RANGE', ruleId: 'TABLE-1-1-APPLICABILITY', evaluatedBy: 'PROJECT-B31J-FACTOR-DATASET' },
      }),
    })),
    'PIPING_COMPONENT_B31J_APPLICABILITY_EXCEEDED',
  );
  expectCode(
    () => compilePipingComponent(bendInput({
      factorSet: bendFactorSet({
        applicability: { status: 'USER_FACTOR_REQUIRED', ruleId: 'TABLE-1-1-APPLICABILITY', evaluatedBy: 'PROJECT-B31J-FACTOR-DATASET' },
      }),
    })),
    'PIPING_COMPONENT_USER_FACTOR_REQUIRED',
  );
  expectCode(
    () => bendFactorSet({
      applicability: { status: 'USER_FACTOR_REQUIRED', ruleId: 'R', evaluatedBy: 'PROJECT' },
      userOverride: { reason: 'Geometry outside table', source: 'PROJECT-CALC-114', sourceRevision: '02', approver: '' },
    }),
    'PIPING_COMPONENT_USER_OVERRIDE_INCOMPLETE',
  );
  const overridden = compilePipingComponent(bendInput({
    factorSet: bendFactorSet({
      applicability: { status: 'USER_FACTOR_REQUIRED', ruleId: 'TABLE-1-1-APPLICABILITY', evaluatedBy: 'PROJECT-B31J-FACTOR-DATASET' },
      userOverride: { reason: 'Bend radius below the table range', source: 'PROJECT-CALC-114', sourceRevision: '02', approver: 'LEAD-STRESS-ENGINEER' },
    }),
  }));
  assert.equal(overridden.acceptanceState, 'CONDITIONAL');
  assert.ok(overridden.approximations.some((entry) => entry.code === 'PIPING_COMPONENT_APPROXIMATION_USER_FLEXIBILITY_OVERRIDE'));
  assert.notEqual(overridden.semanticHash, bend.semanticHash, 'an override must carry its own semantic identity');
});

test('B32-T12', 'Pressure stiffening and directional factors are declared, never reconciled', () => {
  expectCode(
    () => compilePipingComponent(bendInput({
      factorSet: bendFactorSet({ pressureCorrectionApplied: true, pressureBasis: 'DESIGN-PRESSURE-STATE-1' }),
    })),
    'PIPING_COMPONENT_PRESSURE_STIFFENING_RULE_MISMATCH',
  );
  const pressured = compilePipingComponent(bendInput({
    profile: componentProfile({ bendPressureStiffeningRule: 'BEND_PRESSURE_STIFFENING_DECLARED_FACTOR_V1' }),
    factorSet: bendFactorSet({ pressureCorrectionApplied: true, pressureBasis: 'DESIGN-PRESSURE-STATE-1' }),
  }));
  assert.equal(pressured.flexibility.pressureBasis, 'DESIGN-PRESSURE-STATE-1');
  expectCode(
    () => bendFactorSet({
      directionalFlexibilityFactors: {
        inPlane: { value: 4.5, source: 'PROJECT' },
        outOfPlane: { value: 3.1, source: 'PROJECT' },
      },
    }),
    'PIPING_COMPONENT_DIRECTIONAL_FLEXIBILITY_NOT_IMPLEMENTED',
  );
});

test('B32-T13', 'BRANCH-01 classifies run and branch from direction vectors, not diameter', () => {
  assert.equal(branch.classification.rule, 'DIRECTION_VECTOR_TOPOLOGY_V1');
  assert.deepEqual([...branch.classification.runLegIds].sort(), ['LEG-RUN-A', 'LEG-RUN-B']);
  assert.deepEqual([...branch.classification.branchLegIds], ['LEG-BRANCH']);
  assert.equal(branch.classification.diameterConsulted, false);

  /* The branch leg is the largest bore here; the classification must not move. */
  const misleading = compileFixtureBranch({
    nominalDiameters: { 'LEG-RUN-A': 0.1143, 'LEG-RUN-B': 0.1143, 'LEG-BRANCH': 0.3239 },
  });
  assert.deepEqual([...misleading.classification.branchLegIds], ['LEG-BRANCH']);

  /* A leg order permutation is not a classification input either. */
  const reordered = compileFixtureBranch({
    legs: [...branchInput().legs].reverse(),
  });
  assert.deepEqual([...reordered.classification.runLegIds].sort(), ['LEG-RUN-A', 'LEG-RUN-B']);
});

test('B32-T14', 'An unresolvable junction blocks instead of guessing a run', () => {
  const legs = branchInput().legs;
  expectCode(
    () => compileFixtureBranch({ legs: [legs[0], legs[2]] }),
    'PIPING_COMPONENT_BRANCH_LEG_COUNT_INVALID',
  );
  expectCode(
    () => compileFixtureBranch({
      legs: [
        { ...legs[0], endPoint: [0.5, 0, 0] },
        { ...legs[1], endPoint: [0, 0.5, 0] },
        { ...legs[2], endPoint: [0, 0, 0.5] },
      ],
    }),
    'PIPING_COMPONENT_BRANCH_RUN_NOT_IDENTIFIED',
  );
  expectCode(
    () => compileFixtureBranch({
      legs: [
        ...legs,
        { legId: 'LEG-CROSS', endPoint: [0, 0, -0.4], material: materialResolution(), section: reducedSectionResolution() },
      ],
    }),
    'PIPING_COMPONENT_BRANCH_CLASSIFICATION_AMBIGUOUS',
  );
  const classified = classifyBranchLegs(legs, [0, 0, 0], { value: 1e-9, source: 'PROJECT' });
  assert.equal(Object.isFrozen(classified.runLegIds), true, 'classification evidence must be immutable');
});

test('B32-T15', 'BRANCH-01 applies junction flexibility to the branch leg under one owner', () => {
  const branchLeg = branch.elements.find((entry) => entry.role === 'BRANCH_REFINEMENT');
  const runLegs = branch.elements.filter((entry) => entry.role === 'RUN_REFINEMENT');
  assert.equal(runLegs.length, 2);
  assert.ok(runLegs.every((entry) => entry.stiffnessCorrection === null), 'run legs carry no junction correction');
  assert.notEqual(branchLeg.stiffnessCorrection, null);
  const length = branchLeg.frameElement.geometry.length;
  assertClose(
    measurePureBendingRigidity(branchLeg.stiffnessCorrection.localStiffness, length),
    measurePureBendingRigidity(branchLeg.frameElement.localStiffness, length) / 2.25,
    1e-12,
    'the branch leg must carry E*I/k',
  );
  assert.equal(branch.flexibility.doubleCountGuard.guardId, 'BRANCH_FLEXIBILITY_SINGLE_APPLICATION_V1');
  assert.deepEqual(branch.flexibilityOwnership.flexibilityTargets, ['TEE-001:BRANCH_ROTATIONAL']);
  assert.equal(branch.flexibilityOwnership.ownerPackageId, 'LFEA-B3.2');
  expectCode(
    () => compileFixtureBranch({ factorSet: branchFactorSet({ flexibilityGeometryBasis: 'JUNCTION_GEOMETRY_INCLUDED_V1' }) }),
    'PIPING_COMPONENT_BRANCH_FLEXIBILITY_DOUBLE_COUNT',
  );
});

test('B32-T16', 'Flexibility ownership is single, machine-readable and verifiable', () => {
  const registry = assertSingleFlexibilityOwnership([bend.flexibilityOwnership, branch.flexibilityOwnership]);
  assert.equal(registry.ownerPackageId, 'LFEA-B3.2');
  assert.deepEqual(registry.appliedComponentIds, ['BEND-001', 'TEE-001']);
  expectCode(
    () => assertSingleFlexibilityOwnership([branch.flexibilityOwnership, clone(branch.flexibilityOwnership)]),
    'PIPING_COMPONENT_FLEXIBILITY_OWNERSHIP_CONFLICT',
  );
  expectCode(
    () => assertSingleFlexibilityOwnership([{ ...clone(branch.flexibilityOwnership), ownerPackageId: 'LFEA-B4.0' }]),
    'PIPING_COMPONENT_FLEXIBILITY_OWNERSHIP_FOREIGN',
  );
  const unowned = compileFixtureBranch({
    profile: componentProfile({ branchFlexibilityMethod: 'BRANCH_FLEXIBILITY_NOT_APPLIED_V1' }),
    factorSet: null,
  });
  assert.equal(unowned.flexibilityOwnership.applied, false);
  assert.deepEqual(unowned.flexibilityOwnership.flexibilityTargets, []);
  expectCode(
    () => compileFixtureBranch({ profile: componentProfile({ branchFlexibilityMethod: 'BRANCH_FLEXIBILITY_NOT_APPLIED_V1' }) }),
    'PIPING_COMPONENT_FACTOR_SET_NOT_APPLICABLE',
  );
});

test('B32-T17', 'The reducer maps stated stations to sections and discloses the approximation', () => {
  const reducer = compilePipingComponent(reducerInput());
  assert.equal(reducer.elements.length, 2);
  assert.deepEqual(
    reducer.sectionMapping.map((entry) => [entry.startFraction, entry.endFraction, entry.sectionStateId]),
    [[0, 0.5, 'SEC-NPS6-SCH40'], [0.5, 1, 'SEC-NPS4-SCH40']],
  );
  assert.equal(reducer.elements[0].frameElement.section.sectionStateId, 'SEC-NPS6-SCH40');
  assert.equal(reducer.elements[1].frameElement.section.sectionStateId, 'SEC-NPS4-SCH40');
  const disclosure = reducer.approximations.find((entry) => entry.code === 'PIPING_COMPONENT_APPROXIMATION_REDUCER_SECTION');
  assert.equal(disclosure.status, 'CONDITIONAL');
  assert.equal(disclosure.stiffnessRelevant, true);
  expectCode(
    () => compilePipingComponent(reducerInput({ profile: componentProfile({ reducerRule: 'REDUCER_TAPERED_SECTION_V1' }) })),
    'PIPING_COMPONENT_REDUCER_TAPERED_NOT_IMPLEMENTED',
  );
  expectCode(
    () => compilePipingComponent(reducerInput({
      stations: [{ fraction: 0.5, section: sectionResolution() }, { fraction: 0.2, section: reducedSectionResolution() }],
    })),
    'PIPING_COMPONENT_REDUCER_STATIONS_INVALID',
  );
});

test('B32-T18', 'The valve/flange keeps finite length, weight, CG and end-connection identity', () => {
  const valve = compilePipingComponent(valveInput());
  assert.equal(valve.elements.length, 1);
  assertClose(valve.geometry.length, 0.36, 1e-12, 'the body keeps its real length');
  assert.equal(valve.massProperties.mass, 145);
  assert.equal(valve.massProperties.massSource, 'PROJECT-VALVE-DATASHEET');
  assertClose(valve.massProperties.centreOfGravityFraction, 0.5, 1e-12, 'the CG projects to mid-body');
  assert.equal(valve.endConnections.I.portId, 'VLV-001-P1');
  assert.equal(valve.endConnections.J.connectionType, 'FLANGED');
  const correction = valve.elements[0].stiffnessCorrection;
  assert.equal(correction.kind, 'BODY_RIGIDITY_MULTIPLIER_V1');
  assertClose(
    valve.elements[0].effectiveLocalStiffness[0],
    valve.elements[0].frameElement.localStiffness[0] * 1000,
    1e-9,
    'the rigid body multiplies axial stiffness by the declared multiplier',
  );
  expectCode(
    () => compilePipingComponent(valveInput({ end: [0, 0, 0] })),
    'PIPING_COMPONENT_ZERO_LENGTH_WEIGHT_LUMP_NOT_SELECTED',
  );
  expectCode(
    () => compilePipingComponent(valveInput({
      massProperties: { mass: { value: 145, source: 'PROJECT-VALVE-DATASHEET' }, centreOfGravity: [0.5, 0, 0] },
    })),
    'PIPING_COMPONENT_CENTRE_OF_GRAVITY_OUTSIDE_BODY',
  );
  expectCode(
    () => compilePipingComponent(valveInput({ bodyStiffnessMultiplier: { value: 50, source: 'PROJECT' } })),
    'PIPING_COMPONENT_BODY_MULTIPLIER_CONFLICT',
  );
  const semiRigid = compilePipingComponent(valveInput({
    profile: componentProfile({ valveBodyRule: 'VALVE_SEMI_RIGID_BODY_V1' }),
    bodyStiffnessMultiplier: { value: 25, source: 'VENDOR-STIFFNESS-REPORT-7' },
  }));
  assert.equal(semiRigid.elements[0].stiffnessCorrection.factor, 25);
  expectCode(
    () => compilePipingComponent(valveInput({ profile: componentProfile({ valveBodyRule: 'VALVE_SEMI_RIGID_BODY_V1' }) })),
    'BODY_STIFFNESS_MULTIPLIER_NOT_DECLARED',
  );
  const lump = compilePipingComponent(valveInput({
    profile: componentProfile({ weightLumpRule: 'ZERO_LENGTH_WEIGHT_LUMP_EXPLICITLY_SELECTED_V1' }),
    end: [0, 0, 0],
    massProperties: { mass: { value: 145, source: 'PROJECT-VALVE-DATASHEET' }, centreOfGravity: [0, 0, 0] },
  }));
  assert.equal(lump.elements.length, 0);
  assert.equal(lump.massProperties.lumped, true);
});

test('B32-T19', 'The rigid link is a kinematic relation carrying no code stress', () => {
  const link = compilePipingComponent(rigidLinkInput());
  assert.equal(link.elements.length, 0, 'a rigid link is not a stiff beam');
  assert.equal(link.kinematicRelations.length, 1);
  const relation = link.kinematicRelations[0];
  assert.equal(relation.method, 'RIGID_BODY_KINEMATIC_RELATION_V1');
  assert.equal(relation.codeStressEligible, false);
  assert.deepEqual(relation.coupledDofs, [...DOF_ORDER]);
  assert.equal(link.codeStations.length, 0, 'a rigid link defines no code point');
  expectCode(
    () => compilePipingComponent(rigidLinkInput({ slaveNodeId: 'N-001000' })),
    'PIPING_COMPONENT_RIGID_LINK_DEGENERATE',
  );
  expectCode(
    () => compilePipingComponent(rigidLinkInput({ coupledDofs: [] })),
    'PIPING_COMPONENT_RIGID_LINK_DOF_INVALID',
  );
  const forged = { ...clone(link), kinematicRelations: [{ ...clone(relation), codeStressEligible: true }] };
  expectCode(() => requirePipingComponent(forged), 'PIPING_COMPONENT_RIGID_RELATION_CODE_STRESS_PROHIBITED');
});

test('B32-T20', 'The support offset transfers to the steel point without moving the centreline', () => {
  const offset = compilePipingComponent(supportOffsetInput());
  assert.deepEqual(offset.geometry.centerlinePosition, [1.5, 0, 0]);
  assert.equal(offset.geometry.centerlineRetained, true);
  assert.deepEqual(offset.geometry.offset, [0, 0, -0.4]);
  assert.equal(offset.kinematicRelations[0].masterNodeId, 'N-002000');
  assert.equal(offset.kinematicRelations[0].codeStressEligible, false);
  expectCode(
    () => compilePipingComponent(supportOffsetInput({ relocateCenterline: true })),
    'PIPING_COMPONENT_CENTERLINE_RELOCATION_PROHIBITED',
  );
  expectCode(
    () => compilePipingComponent(supportOffsetInput({ supportPointPosition: [1.5, 0, 0] })),
    'PIPING_COMPONENT_SUPPORT_OFFSET_DEGENERATE',
  );
  expectCode(
    () => compilePipingComponent(supportOffsetInput({ profile: componentProfile({ supportOffsetRule: 'EXPLICIT_BEAM_LINK_V1' }) })),
    'PIPING_COMPONENT_SUPPORT_OFFSET_LINK_INCOMPLETE',
  );
  const beamLink = compilePipingComponent(supportOffsetInput({
    profile: componentProfile({ supportOffsetRule: 'EXPLICIT_BEAM_LINK_V1' }),
    material: materialResolution(),
    section: sectionResolution(),
  }));
  assert.equal(beamLink.elements.length, 1);
  assert.equal(beamLink.kinematicRelations.length, 0);
  assert.deepEqual(beamLink.geometry.centerlinePosition, [1.5, 0, 0]);
  assert.equal(beamLink.acceptanceState, 'ACCEPTED');
});

test('B32-T21', 'The guard refuses a correction it cannot measure back off the matrices', () => {
  const shared = {
    directChordLength: 1,
    segmentedLength: 1.1,
    arcLength: 1.11,
    bendingRigidity: 1e6,
    declaredFactor: 4.5,
    geometryBasis: 'ARC_GEOMETRY_EXCLUDED_V1',
    tolerance: 1e-9,
    toleranceSource: 'PROJECT',
  };
  expectCode(
    () => bendFlexibilityDoubleCountGuard({
      ...shared,
      measuredUncorrectedRigidity: 1e6,
      measuredCorrectedRigidity: 1e6,
    }),
    'PIPING_COMPONENT_BEND_FLEXIBILITY_OMITTED',
  );
  expectCode(
    () => bendFlexibilityDoubleCountGuard({
      ...shared,
      measuredUncorrectedRigidity: 1e6,
      measuredCorrectedRigidity: 1e6 / (4.5 * 4.5),
    }),
    'PIPING_COMPONENT_BEND_FLEXIBILITY_DOUBLE_COUNT',
  );
  const accepted = bendFlexibilityDoubleCountGuard({
    ...shared,
    measuredUncorrectedRigidity: 1e6,
    measuredCorrectedRigidity: 1e6 / 4.5,
  });
  assert.equal(accepted.accepted, true);
});

test('B32-T22', 'Compilation is deterministic and the sealed record is tamper-evident', () => {
  assert.equal(canonicalStringify(compileFixtureBend()), canonicalStringify(bend));
  assert.equal(canonicalStringify(compileFixtureBranch()), canonicalStringify(branch));
  const tampered = { ...clone(bend) };
  tampered.flexibility = { ...tampered.flexibility, factor: 1 };
  expectCode(() => requirePipingComponent(tampered), 'PIPING_COMPONENT_HASH_MISMATCH');
  const misStated = { ...clone(bend), acceptanceState: 'ACCEPTED' };
  misStated.approximations = misStated.approximations.map((entry) => ({ ...entry, status: 'UNRESOLVED' }));
  expectCode(() => requirePipingComponent(misStated), 'PIPING_COMPONENT_ACCEPTANCE_STATE_INCONSISTENT');
});

test('B32-T23', 'The component consumes the B-3.1 element under either declared formulation', () => {
  const shear = compileFixtureBend({ frameElementProfile: timoshenkoProfile() });
  assert.equal(shear.elements[0].frameElement.formulationId, 'PIPE_FRAME3D_TIMOSHENKO_V1');
  assert.equal(shear.elements[0].frameElement.shearDeformation, true);
  const length = shear.elements[0].frameElement.geometry.length;
  assertClose(
    measurePureBendingRigidity(shear.elements[0].stiffnessCorrection.localStiffness, length),
    measurePureBendingRigidity(shear.elements[0].frameElement.localStiffness, length) / 4.5,
    1e-12,
    'the measured correction must be exact under Timoshenko too',
  );
  assert.equal(shear.flexibility.doubleCountGuard.accepted, true);
  assert.ok(
    shear.elements[0].frameElement.limitations.some(
      (entry) => entry.code === 'FRAME_ELEMENT_LIMITATION_STRAIGHT_BEAM_APPROXIMATION',
    ),
    'the B-3.1 element disclosures survive inside the component',
  );
});

test('B32-T24', 'The generated chain reproduces the arc geometry end to end', () => {
  const total = bend.elements.reduce((sum, entry) => sum + entry.frameElement.geometry.length, 0);
  assertClose(total, bend.geometry.chordChainLength, 1e-9, 'the element lengths must sum to the chord chain');
  assert.ok(
    bend.geometry.chordChainLength < bend.geometry.arcLength,
    'chords are shorter than the arc they approximate',
  );
  assert.ok(bend.geometry.lengthErrorFraction > 0, 'the segmentation error is reported, not hidden');
  assertClose(bend.geometry.radius, BEND_RADIUS, 1e-12, 'the resolved radius must match the declared one');
  expectCode(
    () => compilePipingComponent(bendInput({
      arc: { tangentStart: [0, 0, 0], tangentEnd: [BEND_RADIUS, BEND_RADIUS, 0], incomingDirection: [1, 0, 0], declaredRadius: 0.5 },
    })),
    'PIPING_COMPONENT_BEND_RADIUS_CONFLICT',
  );
  expectCode(
    () => compilePipingComponent(bendInput({
      arc: { tangentStart: [0, 0, 0], tangentEnd: [1, 0, 0], incomingDirection: [1, 0, 0], declaredRadius: 0.25 },
    })),
    'PIPING_COMPONENT_BEND_ARC_DEGENERATE',
  );
});

test('B32-T25', 'Unknown component fields and unsupported types are refused', () => {
  expectCode(
    () => compilePipingComponent({ ...bendInput(), extra: true }),
    'PIPING_COMPONENT_INPUT_INVALID',
  );
  expectCode(
    () => compilePipingComponent({ ...bendInput(), componentType: 'EXPANSION_JOINT' }),
    'PIPING_COMPONENT_INPUT_INVALID',
  );
  const missing = bendInput();
  delete missing.factorSet;
  expectCode(() => compilePipingComponent(missing), 'PIPING_COMPONENT_INPUT_INVALID');
  expectCode(
    () => compilePipingComponent(bendInput({ arc: { tangentStart: [0, 0], tangentEnd: [1, 1, 0], incomingDirection: [1, 0, 0], declaredRadius: 0.25 } })),
    'PIPING_COMPONENT_INPUT_INVALID',
  );
});

console.log('\nLFEA B-3.2 piping component check PASS');
