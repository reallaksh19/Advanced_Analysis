import assert from 'node:assert/strict';
import {
  COMPONENT_GEOMETRY_SCHEMA,
  FACTOR_CALCULATION_REQUEST_SCHEMA,
  calculateB31Factors,
} from '../src/core/linear-fea-b31-factor-calculator/index.js';

const mapping = Object.freeze({ inPlaneField: 'my', outOfPlaneField: 'mz' });
const sourceEvidence = Object.freeze({
  sourceId: 'LFEA-B3.19-FACTORY-GEOMETRY',
  sourceRevision: '01',
});

function request({ calculationId, componentId, editionProfileId, componentType, geometry }) {
  return {
    schema: FACTOR_CALCULATION_REQUEST_SCHEMA,
    calculationId,
    componentId,
    editionProfileId,
    componentType,
    geometry: { schema: COMPONENT_GEOMETRY_SCHEMA, componentType, lengthUnit: 'm', ...geometry },
    momentDirectionMapping: mapping,
    semanticHash: '',
  };
}

function approximately(actual, expected, relativeTolerance = 1e-12) {
  const scale = Math.max(Math.abs(expected), 1);
  assert.ok(
    Math.abs(actual - expected) <= relativeTolerance * scale,
    `${actual} does not match ${expected} within ${relativeTolerance}.`,
  );
}

console.log('\n--- LFEA B-3.19 runtime B31 factor calculator ---');

const bendRequest = request({
  calculationId: 'B31-CALC-BEND-01',
  componentId: 'BEND-APP-S-01',
  editionProfileId: 'B31_3_2018_APPENDIX_D',
  componentType: 'BEND',
  geometry: {
    outerDiameter: 0.4064,
    wallThickness: 0.00953,
    bendRadius: 0.6096,
    pressure: 3.45e6,
    elasticModulus: 203.4e9,
    sourceEvidence,
  },
});
const bend = calculateB31Factors(bendRequest);
assert.equal(bend.status, 'QUALIFIED');
assert.equal(bend.componentFactorSet.schema, 'fea-linear-component-factor-set/v1');
assert.equal(bend.stressFactorSets.length, 1);
approximately(bend.factors.flexibilityCharacteristic, 0.14753712217178722);
approximately(bend.factors.flexibility.inPlane, 9.506141774188135);
approximately(bend.factors.displacementSifs.inPlaneBending, 2.619611948608015);
approximately(bend.factors.displacementSifs.outOfPlaneBending, 2.1830099571733457);
assert.equal(bend.factors.pressureCorrection.applied, true);
assert.equal(bend.factors.sustainedCorrection.applied, false);

const unpressurized = calculateB31Factors({
  ...bendRequest,
  calculationId: 'B31-CALC-BEND-UNPRESSURIZED',
  geometry: { ...bendRequest.geometry, pressure: 0 },
});
assert.equal(unpressurized.status, 'QUALIFIED');
assert.equal(unpressurized.factors.pressureCorrection.applied, false);
assert.ok(unpressurized.factors.flexibility.inPlane > bend.factors.flexibility.inPlane);
assert.ok(unpressurized.factors.displacementSifs.inPlaneBending
  > bend.factors.displacementSifs.inPlaneBending);

const thinWall2023 = calculateB31Factors(request({
  calculationId: 'B31-CALC-BEND-2023-DT60',
  componentId: 'BEND-DT60',
  editionProfileId: 'B31_3_2024_B31J_2023',
  componentType: 'BEND',
  geometry: {
    outerDiameter: 0.6,
    wallThickness: 0.01,
    bendRadius: 0.9,
    pressure: 0,
    elasticModulus: 200e9,
    sourceEvidence,
  },
}));
assert.equal(thinWall2023.status, 'QUALIFIED');
assert.equal(thinWall2023.factors.sustainedCorrection.applied, true);
approximately(thinWall2023.factors.sustainedCorrection.denominator, 0.94);
assert.ok(thinWall2023.factors.sustainedIndices.inPlaneBending
  > thinWall2023.factors.displacementSifs.inPlaneBending);

const tee = calculateB31Factors(request({
  calculationId: 'B31-CALC-TEE-01',
  componentId: 'TEE-B31J-01',
  editionProfileId: 'B31_3_2020_B31J_2017',
  componentType: 'WELDING_TEE',
  geometry: {
    runOuterDiameter: 0.6096,
    runWallThickness: 0.00953,
    branchOuterDiameter: 0.508,
    branchWallThickness: 0.00953,
    fittingQuality: 'VERIFIED_B16_9',
    sourceEvidence,
  },
}));
assert.equal(tee.status, 'QUALIFIED');
assert.equal(tee.componentFactorSet, null);
assert.equal(tee.stressFactorSets.length, 2);
approximately(tee.factors.flexibility.run.inPlane, 1.1244011302440957);
approximately(tee.factors.flexibility.branch.outOfPlane, 7.308143416543065);
approximately(tee.factors.displacementSifs.run.inPlaneBending, 2.8677973028391186);
approximately(tee.factors.displacementSifs.branch.inPlaneBending, 3.182232930985084);
approximately(tee.factors.displacementSifs.run.axial, tee.factors.displacementSifs.run.outOfPlaneBending);
approximately(tee.factors.displacementSifs.branch.axial, tee.factors.displacementSifs.branch.outOfPlaneBending);
assert.ok(tee.diagnostics.some(
  (entry) => entry.code === 'B31J_TEE_DIRECTIONAL_FLEXIBILITY_NOT_SEALED_FOR_B3_2',
));

const unverifiedTee = calculateB31Factors(request({
  calculationId: 'B31-CALC-TEE-UNVERIFIED',
  componentId: 'TEE-B31J-UNVERIFIED',
  editionProfileId: 'B31_3_2022_B31J_2017',
  componentType: 'WELDING_TEE',
  geometry: {
    runOuterDiameter: 0.32385,
    runWallThickness: 0.009525,
    branchOuterDiameter: 0.2191,
    branchWallThickness: 0.00818,
    fittingQuality: 'UNVERIFIED',
    sourceEvidence,
  },
}));
assert.equal(unverifiedTee.status, 'BLOCKED');
assert.equal(unverifiedTee.componentFactorSet, null);
assert.deepEqual(unverifiedTee.stressFactorSets, []);
assert.ok(unverifiedTee.applicability.violations.some((entry) => entry.field === 'fittingQuality'));

const reducerRequest = request({
  calculationId: 'B31-CALC-REDUCER-01',
  componentId: 'REDUCER-B31J-01',
  editionProfileId: 'B31_3_2020_B31J_2017',
  componentType: 'REDUCER',
  geometry: {
    largeEndOuterDiameter: 0.8,
    largeEndWallThickness: 0.011,
    smallEndOuterDiameter: 0.7,
    smallEndWallThickness: 0.01,
    coneAngleDegrees: 20,
    smallEndTransitionRadius: 0.0567,
    smallEndCylinderLength: 0,
    bodyMinimumWallThickness: 0.011,
    sourceEvidence,
  },
});
const reducer = calculateB31Factors(reducerRequest);
assert.equal(reducer.status, 'QUALIFIED');
assert.equal(reducer.componentFactorSet, null);
assert.equal(reducer.stressFactorSets.length, 1);
assert.equal(reducer.factors.flexibility, null);
assert.equal(reducer.matchingPipeApplication.lengthUnit, 'm');
assert.equal(reducer.matchingPipeApplication.largeEnd.outerDiameter, 0.8);
assert.equal(reducer.matchingPipeApplication.smallEnd.wallThickness, 0.01);
assert.ok(reducer.factors.displacementSifs.torsional > 1);
approximately(reducer.factors.displacementSifs.axial, reducer.factors.displacementSifs.outOfPlaneBending);

const equalThicknessReducer = calculateB31Factors({
  ...reducerRequest,
  calculationId: 'B31-CALC-REDUCER-EQUAL-THICKNESS',
  componentId: 'REDUCER-B31J-EQUAL-THICKNESS',
  geometry: {
    ...reducerRequest.geometry,
    largeEndWallThickness: reducerRequest.geometry.smallEndWallThickness,
    bodyMinimumWallThickness: reducerRequest.geometry.smallEndWallThickness,
  },
});
assert.equal(equalThicknessReducer.status, 'BLOCKED');
assert.ok(equalThicknessReducer.applicability.violations.some((entry) => entry.field === 'T1/T2'));

const outOfDomainReducer = calculateB31Factors({
  ...reducerRequest,
  calculationId: 'B31-CALC-REDUCER-OUTSIDE',
  componentId: 'REDUCER-B31J-OUTSIDE',
  geometry: { ...reducerRequest.geometry, coneAngleDegrees: 60 },
});
assert.equal(outOfDomainReducer.status, 'BLOCKED');
assert.equal(outOfDomainReducer.factors, null);
assert.equal(outOfDomainReducer.componentFactorSet, null);
assert.deepEqual(outOfDomainReducer.stressFactorSets, []);
assert.ok(outOfDomainReducer.applicability.violations.some(
  (entry) => entry.field === 'coneAngleDegrees',
));

assert.throws(
  () => calculateB31Factors({ ...bendRequest, editionProfileId: 'B31J_2022' }),
  (error) => error?.code === 'B31_FACTOR_EDITION_PROFILE_NOT_IMPLEMENTED',
);
assert.throws(
  () => calculateB31Factors({
    ...bendRequest,
    geometry: { ...bendRequest.geometry, lengthUnit: 'mm' },
  }),
  (error) => error?.code === 'B31_FACTOR_LENGTH_UNIT_NOT_NORMALIZED',
);

const repeat = calculateB31Factors(bendRequest);
assert.equal(repeat.semanticHash, bend.semanticHash);
assert.deepEqual(repeat, bend);

console.log(JSON.stringify({
  status: 'PASS',
  bendK: bend.factors.flexibility.inPlane,
  bendInPlaneSif: bend.factors.displacementSifs.inPlaneBending,
  teeRunInPlaneSif: tee.factors.displacementSifs.run.inPlaneBending,
  teeBranchInPlaneSif: tee.factors.displacementSifs.branch.inPlaneBending,
  reducerTorsionalSif: reducer.factors.displacementSifs.torsional,
  blockedReducerViolations: outOfDomainReducer.applicability.violations.length,
}, null, 2));
