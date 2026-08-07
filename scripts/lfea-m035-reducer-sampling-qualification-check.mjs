#!/usr/bin/env node
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  REDUCER_CONDENSATION_REQUEST_SCHEMA,
  REDUCER_SAMPLING_RULES,
  compileTenCylinderReducerAuthority,
  predictReducerBoundaryActions,
  qualifyReducerSamplingRules,
  sealReducerCondensationRequest,
} from '../src/core/linear-fea-reducer-condensation/index.js';

const TRUE_RULE = 'J_END_LINEAR_INTERPOLATION_CANDIDATE_V1';

function request(index, geometry) {
  return sealReducerCondensationRequest({
    schema: REDUCER_CONDENSATION_REQUEST_SCHEMA,
    reducerId: `M035-REDUCER-${index + 1}`,
    length: 0.7 + 0.09 * index,
    fromSection: { outerDiameter: geometry[0], wallThickness: geometry[1] },
    toSection: { outerDiameter: geometry[2], wallThickness: geometry[3] },
    segmentCount: 10,
    samplingRule: TRUE_RULE,
    material: {
      elasticModulus: 200e9,
      shearModulus: 77e9,
      massDensity: 7850,
      thermalExpansionCoefficient: 12e-6,
    },
    gravity: {
      enabled: true,
      acceleration: 9.80665,
      directionLocal: [0, -1, 0],
      fluidDensity: 700 + 20 * index,
      insulationThickness: 0.03 + 0.002 * index,
      insulationDensity: 110,
    },
    thermal: { installationTemperature: 20, operatingTemperature: 120 + 15 * index },
    sourceEvidence: {
      sourceId: 'M035-REDUCER-SAMPLING-QUALIFICATION',
      sourceRevision: `R${index + 1}`,
      sourceSemanticHash: semanticHash({ index, geometry }),
    },
    semanticHash: '',
  });
}

function displacement(index) {
  const scale = index + 1;
  return [
    0, 0, 0, 0, 0, 0,
    1.2e-4 * scale,
    -2.5e-4 * (1 + index / 3),
    1.8e-4 * (1 + index / 5),
    3e-4 * scale,
    -5e-4 * (1 + index / 4),
    4e-4 * (1 + index / 6),
  ];
}

console.log('\n--- M035 reducer section-sampling qualification ---');

const geometries = [
  [0.32385, 0.0127, 0.2191, 0.00818],
  [0.27305, 0.0127, 0.1683, 0.01097],
  [0.2191, 0.01509, 0.1683, 0.01097],
  [0.4064, 0.015, 0.27305, 0.0127],
  [0.3556, 0.014, 0.2191, 0.0105],
  [0.27305, 0.011, 0.1143, 0.006],
  [0.2191, 0.010, 0.0889, 0.0055],
];

const cases = geometries.map((geometry, index) => {
  const req = request(index, geometry);
  const authority = compileTenCylinderReducerAuthority(req);
  const d = displacement(index);
  return {
    caseId: `R${index + 1}`,
    request: req,
    displacement: d,
    referenceAction: predictReducerBoundaryActions({ authority, displacement: d }),
  };
});

const result = qualifyReducerSamplingRules({
  cases,
  samplingRules: REDUCER_SAMPLING_RULES,
  absoluteTolerance: 1e-7,
  relativeTolerance: 1e-11,
});
assert.equal(result.status, 'QUALIFIED');
assert.equal(result.qualifiedSamplingRule, TRUE_RULE);
assert.equal(result.caseCount, 7);
assert.equal(result.policy.arbitraryFractionFittingAllowed, false);
assert.equal(result.policy.singleRuleRequiredAcrossCases, true);
assert.equal(result.evaluations.filter((row) => row.passed).length, 1);
assert.ok(result.evaluations.find((row) => row.samplingRule === TRUE_RULE).cases.every((row) => row.passed));
assert.ok(result.evaluations.filter((row) => row.samplingRule !== TRUE_RULE).some((row) => !row.passed));

for (const rule of REDUCER_SAMPLING_RULES) {
  const fractions = compileTenCylinderReducerAuthority(sealReducerCondensationRequest({
    ...cases[0].request,
    samplingRule: rule,
    semanticHash: '',
  })).segments.map((row) => row.representativeFraction);
  assert.equal(fractions.length, 10);
  assert.ok(fractions.every((value, index) => value >= index / 10 && value <= (index + 1) / 10));
}

assert.throws(
  () => qualifyReducerSamplingRules({
    cases,
    samplingRules: ['FITTED_FRACTION_0.37'],
    absoluteTolerance: 1,
    relativeTolerance: 0.01,
  }),
  /Unsupported reducer sampling rule/,
);

console.log(JSON.stringify({
  check: 'm035-reducer-sampling-qualification',
  status: 'PASS',
  caseCount: result.caseCount,
  qualifiedSamplingRule: result.qualifiedSamplingRule,
  evaluations: result.evaluations.map((row) => ({
    samplingRule: row.samplingRule,
    passed: row.passed,
    worstNormalizedResidual: Math.max(...row.cases.map((entry) => entry.maxNormalizedResidual)),
  })),
  semanticHash: result.semanticHash,
}, null, 2));
console.log('M035 reducer section-sampling qualification PASS');
