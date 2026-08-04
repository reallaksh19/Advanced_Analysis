#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  APPENDIX_S3_SOURCE,
  BRANCH_OUTER_DIAMETER,
  COLD_ALLOWABLE,
  CYCLE_REDUCTION_FACTOR,
  HEADER_OUTER_DIAMETER,
  HOT_ALLOWABLE,
  INSTALLATION_TEMPERATURE,
  JUNCTION_POINTS,
  MASS_DENSITY,
  METER_DERIVATION,
  METER_LENGTH,
  METER_WEIGHT,
  NOMINAL_WALL_THICKNESS,
  OPERATING_PRESSURE,
  OPERATING_TEMPERATURE,
  PUBLISHED_CASE_1,
  PUBLISHED_CASE_2,
  PUBLISHED_CASE_RANGE,
  PUBLISHED_DISPLACEMENT_ALLOWABLE,
  PUBLISHED_EXPANSION_ALLOWABLE,
  PUBLISHED_SUSTAINED_STRESS,
  TEE_DERIVATION,
  THERMAL_EXPANSION_COEFFICIENT,
  solveAppendixS3,
} from './lfea-b3.14-appendix-s-example3-fixtures.mjs';
import {
  ACTION_RELATIVE_TOLERANCE,
  ALLOWABLE_TOLERANCE,
  STRESS_RELATIVE_TOLERANCE,
  SUSTAINED_RELATIVE_TOLERANCE,
  SYMMETRY_TOLERANCE,
  TEE_LABELS,
  ZERO_FORCE_FLOOR_N,
  ZERO_MOMENT_FLOOR_NM,
  assertClose,
  assertWithin,
  compileRangeResult,
  packageRegistrationEvidence,
  publishedConventionAction,
  relativeErrorScore,
  resultByLabel,
  sustainedApplication,
  teeApplication,
} from './lfea-b3.14-appendix-s-example3-check-helpers.mjs';

console.log('\n--- LFEA B-3.14 ASME B31.3 Appendix S Example 3 ---');

assert.equal(THERMAL_EXPANSION_COEFFICIENT, 1.1530758226037196e-5);
assert.equal(TEE_DERIVATION.flexibilityCharacteristic, 0.09846517906244273);
assert.equal(TEE_DERIVATION.flexibilityFactor, 1);
assert.equal(TEE_DERIVATION.outOfPlaneSif, 4.220728265475877);
assert.equal(TEE_DERIVATION.inPlaneSif, 3.415546199106908);
assert.equal(COLD_ALLOWABLE, 137.85733333333334e6);
assert.equal(HOT_ALLOWABLE, 138.04666666666665e6);
assert.equal(CYCLE_REDUCTION_FACTOR, 1.20);
assert.equal(METER_DERIVATION.equivalentWallThickness, 0.05329793662923343);
assertClose(
  MASS_DENSITY * METER_DERIVATION.equivalentArea * METER_LENGTH * 9.80665,
  METER_WEIGHT,
  1e-12,
  'equivalent meter section must reproduce the published 2,000-lb/8,890-N body weight',
);
assert.equal(BRANCH_OUTER_DIAMETER, 0.5080);
assert.equal(HEADER_OUTER_DIAMETER, 0.6096);
assert.equal(NOMINAL_WALL_THICKNESS, 0.00953);
assert.equal(JUNCTION_POINTS['APP-S3.T20'][1], 0);
assert.equal(JUNCTION_POINTS['APP-S3.T320'][1], 0);

const derived = solveAppendixS3();
for (const [caseKey, analysis] of Object.entries(derived.analyses)) {
  assert.ok(['QUALIFIED', 'CONDITIONAL'].includes(analysis.execution.status), `${caseKey} execution must be usable`);
  assert.equal(analysis.generatedGravityPrimitives.length, derived.compilation.model.elements.length);
  analysis.generatedGravityPrimitives.forEach((primitive) => {
    assert.equal(primitive.startIntensity.fx, 0);
    assert.ok(primitive.startIntensity.fy < 0, `${primitive.primitiveId} must act in global -Y`);
    assert.equal(primitive.startIntensity.fz, 0);
    assert.deepEqual(primitive.endIntensity, primitive.startIntensity);
  });
  assert.equal(
    analysis.loadCase.primitives.some((primitive) => primitive.kind === 'DISTRIBUTED_WEIGHT'),
    false,
    `${caseKey} must use PIPE_WALL gravity only; no contents/insulation declaration is permitted`,
  );
}
assert.equal(derived.material.materialState.materialId, 'CS-A53B-APPENDIX-S3');
assert.notEqual(derived.material.materialState.materialId, 'CS-A106B-APPENDIX-S');
derived.compilation.model.nodes.forEach((node) => assert.equal(node.position.y, 0));
for (const caseKey of ['CASE1', 'CASE2', 'SUS1', 'SUS2']) {
  const pressures = derived.analyses[caseKey].loadCase.primitives.filter((primitive) => primitive.kind === 'PRESSURE');
  assert.equal(pressures.length, derived.compilation.model.elements.length);
  pressures.forEach((primitive) => {
    assert.equal(primitive.authorizedEffects.codeStress, true);
    assert.equal(primitive.authorizedEffects.pressureStiffening, false);
    assert.equal(primitive.authorizedEffects.axialThrust, false);
    assert.equal(primitive.authorizedEffects.bourdon, false);
  });
}
for (const nodeId of ['APP-S3.N110', 'APP-S3.N140', 'APP-S3.N210', 'APP-S3.N240']) {
  const displacement = derived.analyses.CASE1.execution.displacement.find(
    (entry) => entry.nodeId === nodeId && entry.dof === 'UY',
  );
  assert.notEqual(displacement, undefined);
  assert.equal(displacement.value, 0, `${nodeId} Y support must hold UY exactly zero`);
}

const case1TeeApplication = teeApplication(derived, 'DISPLACEMENT_STRESS_RANGE', 'INSTALL', 'CASE1');
const case2TeeApplication = teeApplication(derived, 'DISPLACEMENT_STRESS_RANGE', 'INSTALL', 'CASE2');
const expansionTeeApplication = teeApplication(derived, 'EXPANSION_RANGE_ENVELOPE', 'CASE2', 'CASE1');

const case1Evidence = [];
const case2Evidence = [];
const expansionEvidence = [];
for (const [rows, caseKey, fromKey, toKey, application, category, evidence] of [
  [PUBLISHED_CASE_1, 'CASE1', 'INSTALL', 'CASE1', case1TeeApplication, 'DISPLACEMENT_STRESS_RANGE', case1Evidence],
  [PUBLISHED_CASE_2, 'CASE2', 'INSTALL', 'CASE2', case2TeeApplication, 'DISPLACEMENT_STRESS_RANGE', case2Evidence],
  [PUBLISHED_CASE_RANGE, 'CASE1-CASE2', 'CASE2', 'CASE1', expansionTeeApplication, 'EXPANSION_RANGE_ENVELOPE', expansionEvidence],
]) {
  for (const expected of rows) {
    const toAction = publishedConventionAction(derived.analyses[toKey], expected.label);
    const fromAction = publishedConventionAction(derived.analyses[fromKey], expected.label);
    const actualAction = {
      fx: toAction.fx - fromAction.fx,
      my: toAction.my - fromAction.my,
    };
    assertWithin(
      actualAction.fx,
      expected.fx,
      ACTION_RELATIVE_TOLERANCE,
      ZERO_FORCE_FLOOR_N,
      `${caseKey} node ${expected.label} signed Fx`,
    );
    assertWithin(
      actualAction.my,
      expected.my,
      ACTION_RELATIVE_TOLERANCE,
      ZERO_MOMENT_FLOOR_NM,
      `${caseKey} node ${expected.label} signed My`,
    );
    const codeResult = expected.kind === 'TEE'
      ? resultByLabel(application, category, expected.label)
      : compileRangeResult(derived, expected.label, category, fromKey, toKey);
    assertWithin(
      codeResult.calculatedStress,
      expected.stress,
      STRESS_RELATIVE_TOLERANCE,
      1000,
      `${caseKey} node ${expected.label} S_E`,
    );
    const expectedAllowable = category === 'EXPANSION_RANGE_ENVELOPE'
      ? PUBLISHED_EXPANSION_ALLOWABLE
      : PUBLISHED_DISPLACEMENT_ALLOWABLE;
    assertClose(codeResult.allowableStress, expectedAllowable, ALLOWABLE_TOLERANCE, `${caseKey} allowable`);
    if (expected.kind === 'TEE') {
      const direct = compileRangeResult(derived, expected.label, category, fromKey, toKey);
      assertClose(
        codeResult.calculatedStress,
        direct.calculatedStress,
        1e-12,
        `${caseKey} node ${expected.label} CASE_RANGE application/direct equivalence`,
      );
    }
    evidence.push({
      label: expected.label,
      actualFx: actualAction.fx,
      expectedFx: expected.fx,
      actualMy: actualAction.my,
      expectedMy: expected.my,
      actualStress: codeResult.calculatedStress,
      expectedStress: expected.stress,
      allowableStress: codeResult.allowableStress,
      utilization: codeResult.utilization,
    });
  }
}

for (const row1 of case1Evidence) {
  const row2 = case2Evidence.find((entry) => entry.label === row1.label);
  assert.notEqual(row2, undefined);
  assertWithin(row1.actualFx + row2.actualFx, 0, 0, SYMMETRY_TOLERANCE, `node ${row1.label} Fx mirror`);
  assertWithin(row1.actualMy + row2.actualMy, 0, 0, SYMMETRY_TOLERANCE, `node ${row1.label} My mirror`);
  assertClose(row1.actualStress, row2.actualStress, 1e-10, `node ${row1.label} S_E mirror`);
}

for (const label of ['20', '320']) {
  const result = expansionEvidence.find((entry) => entry.label === label);
  assert.notEqual(result, undefined);
  assert.ok(result.actualStress > result.allowableStress, `node ${label} must reproduce the published Eq. (1b) failure`);
  assert.ok(result.utilization > 1, `node ${label} utilization must exceed one`);
}
for (const row of expansionEvidence.filter((entry) => !['20', '320'].includes(entry.label))) {
  assert.ok(row.actualStress < row.allowableStress, `node ${row.label} must remain below the Eq. (1b) allowable`);
}

const sustained1 = sustainedApplication(derived, 'SUS1');
const sustained2 = sustainedApplication(derived, 'SUS2');
const sustainedEvidence = [];
for (const label of ['20', '320']) {
  const result1 = sustained1.results.find((entry) => entry.checkId === `APP-S3-SUSTAINED-SUS1-${label}`).codeResult;
  const result2 = sustained2.results.find((entry) => entry.checkId === `APP-S3-SUSTAINED-SUS2-${label}`).codeResult;
  assertWithin(
    result1.calculatedStress,
    PUBLISHED_SUSTAINED_STRESS,
    SUSTAINED_RELATIVE_TOLERANCE,
    1000,
    `SUS1 node ${label} S_L`,
  );
  assertWithin(
    result2.calculatedStress,
    PUBLISHED_SUSTAINED_STRESS,
    SUSTAINED_RELATIVE_TOLERANCE,
    1000,
    `SUS2 node ${label} S_L`,
  );
  assertClose(result1.calculatedStress, result2.calculatedStress, 1e-12, `node ${label} sustained scenario symmetry`);
  assert.ok(result1.stressTerms.pressure > 0);
  sustainedEvidence.push({ label, case1: result1.calculatedStress, case2: result2.calculatedStress });
}

const realTeeErrors = [];
const unityTeeErrors = [];
for (const expected of PUBLISHED_CASE_RANGE.filter((row) => row.kind === 'TEE')) {
  const real = compileRangeResult(derived, expected.label, 'EXPANSION_RANGE_ENVELOPE', 'CASE2', 'CASE1');
  const unity = compileRangeResult(derived, expected.label, 'EXPANSION_RANGE_ENVELOPE', 'CASE2', 'CASE1', true);
  realTeeErrors.push({ actual: real.calculatedStress, expected: expected.stress });
  unityTeeErrors.push({ actual: unity.calculatedStress, expected: expected.stress });
}
const realTeeErrorScore = relativeErrorScore(realTeeErrors);
const unityTeeErrorScore = relativeErrorScore(unityTeeErrors);
assert.ok(
  unityTeeErrorScore > realTeeErrorScore * 3,
  `forced-unity tee SIFs must fit materially worse: real=${realTeeErrorScore}, unity=${unityTeeErrorScore}`,
);

const registration = packageRegistrationEvidence();

console.log(JSON.stringify({
  check: 'lfea-b3.14-appendix-s-example3',
  status: 'PASS',
  source: APPENDIX_S3_SOURCE,
  tolerances: {
    actionRelative: ACTION_RELATIVE_TOLERANCE,
    stressRelative: STRESS_RELATIVE_TOLERANCE,
    sustainedRelative: SUSTAINED_RELATIVE_TOLERANCE,
  },
  authorities: {
    operatingPressure: OPERATING_PRESSURE,
    installationTemperature: INSTALLATION_TEMPERATURE,
    operatingTemperature: OPERATING_TEMPERATURE,
    coldAllowable: COLD_ALLOWABLE,
    hotAllowable: HOT_ALLOWABLE,
    tee: TEE_DERIVATION,
    meter: METER_DERIVATION,
  },
  case1Evidence,
  case2Evidence,
  expansionEvidence,
  sustainedEvidence,
  teeSifRegression: { realTeeErrorScore, unityTeeErrorScore },
  registration,
}));
