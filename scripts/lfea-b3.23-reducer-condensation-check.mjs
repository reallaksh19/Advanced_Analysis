#!/usr/bin/env node
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { frameLocalStiffness } from '../src/core/linear-fea-frame-element/index.js';
import {
  REDUCER_CONDENSATION_REQUEST_SCHEMA,
  REDUCER_SAMPLING_RULE,
  ReducerCondensationError,
  compileTenCylinderReducerAuthority,
  computeReducerCondensationRequestSemanticHash,
  sealReducerCondensationRequest,
} from '../src/core/linear-fea-reducer-condensation/index.js';

function close(actual, expected, message, relativeTolerance = 1e-9, absoluteTolerance = 1e-8) {
  const tolerance = Math.max(absoluteTolerance, relativeTolerance * Math.max(1, Math.abs(expected)));
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} != ${expected} within ${tolerance}`);
}

function request(overrides = {}) {
  const draft = {
    schema: REDUCER_CONDENSATION_REQUEST_SCHEMA,
    reducerId: 'REDUCER-CONDENSATION-01',
    length: 1.5,
    fromSection: { outerDiameter: 0.32385, wallThickness: 0.0127 },
    toSection: { outerDiameter: 0.2191, wallThickness: 0.00818 },
    segmentCount: 10,
    samplingRule: REDUCER_SAMPLING_RULE,
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
      fluidDensity: 850,
      insulationThickness: 0.05,
      insulationDensity: 120,
    },
    thermal: { installationTemperature: 20, operatingTemperature: 220 },
    sourceEvidence: {
      sourceId: 'HEXAGON-REDUCER-TEN-CYLINDER',
      sourceRevision: 'VERSION-12-14',
      sourceSemanticHash: semanticHash({ rule: 'ten-cylinders', status: 'public-doc' }),
    },
    semanticHash: '',
    ...overrides,
  };
  draft.semanticHash = computeReducerCondensationRequestSemanticHash(draft);
  return draft;
}

function annulus(outer, wall) {
  const inner = outer - 2 * wall;
  const area = Math.PI * (outer ** 2 - inner ** 2) / 4;
  const I = Math.PI * (outer ** 4 - inner ** 4) / 64;
  return { area, I, J: 2 * I };
}

console.log('\n--- LFEA B-3.23 ten-cylinder reducer condensation ---');

const accepted = sealReducerCondensationRequest({ ...request(), semanticHash: '' });
const authority = compileTenCylinderReducerAuthority(accepted);
assert.equal(authority.schema, 'fea-linear-reducer-condensation-authority/v1');
assert.equal(authority.parityStatus, 'CANDIDATE_PENDING_SECTION_SAMPLING_VERIFICATION');
assert.equal(authority.segments.length, 10);
assert.equal(authority.structuralParticipation.condensedInternalStationCount, 9);
assert.equal(authority.condensed.localStiffness.length, 144);
assert.equal(authority.condensed.gravityLocalVector.length, 12);
assert.equal(authority.condensed.thermalInitialStrainLocalVector.length, 12);
assert.equal(Object.isFrozen(authority), true);

let axialCompliance = 0;
let torsionalCompliance = 0;
for (const segment of authority.segments) {
  axialCompliance += segment.length / (accepted.material.elasticModulus * segment.section.area);
  torsionalCompliance += segment.length / (accepted.material.shearModulus * segment.section.polarMoment);
}
close(authority.condensed.localStiffness[0], 1 / axialCompliance, 'series axial stiffness', 2e-9, 1e-4);
close(authority.condensed.localStiffness[3 * 12 + 3], 1 / torsionalCompliance, 'series torsional stiffness', 2e-9, 1e-4);

const gravity = authority.condensed.gravityLocalVector;
close(gravity[1] + gravity[7], -authority.gravity.totalWeight, 'gravity resultant', 2e-9, 1e-6);
const boundaryFirstMoment = gravity[5] + gravity[11] + accepted.length * gravity[7];
close(boundaryFirstMoment, -authority.gravity.firstMomentFromEnd, 'gravity first moment', 2e-8, 1e-5);
close(authority.gravity.centroidFromEnd, authority.gravity.firstMomentFromEnd / authority.gravity.totalWeight, 'reported center of gravity');

const thermal = authority.condensed.thermalInitialStrainLocalVector;
close(thermal[0] + thermal[6], 0, 'thermal axial resultant', 1e-9, 1e-5);
assert.ok(thermal[0] < 0 && thermal[6] > 0);

const uniformRequest = sealReducerCondensationRequest({
  ...request({
    reducerId: 'REDUCER-CONDENSATION-UNIFORM',
    toSection: { outerDiameter: 0.32385, wallThickness: 0.0127 },
    gravity: { ...request().gravity, enabled: false },
    thermal: { installationTemperature: 20, operatingTemperature: 20 },
  }),
  semanticHash: '',
});
const uniform = compileTenCylinderReducerAuthority(uniformRequest);
const properties = annulus(0.32385, 0.0127);
const direct = frameLocalStiffness({
  elasticModulus: 200e9,
  shearModulus: 77e9,
  area: properties.area,
  secondMomentY: properties.I,
  secondMomentZ: properties.I,
  polarMoment: properties.J,
  length: 1.5,
  shearDeformation: false,
}).matrix;
for (let index = 0; index < 144; index += 1) {
  close(uniform.condensed.localStiffness[index], direct[index], `uniform condensed stiffness[${index}]`, 2e-8, 1e-3);
}
assert.deepEqual(uniform.condensed.gravityLocalVector, new Array(12).fill(0));

assert.deepEqual(compileTenCylinderReducerAuthority(accepted), authority);
assert.throws(
  () => compileTenCylinderReducerAuthority({ ...accepted, length: 2 }),
  (error) => error instanceof ReducerCondensationError && error.code === 'REDUCER_CONDENSATION_HASH_MISMATCH',
);
assert.throws(
  () => sealReducerCondensationRequest({ ...request({ samplingRule: 'UNVERIFIED-ENDPOINT' }), semanticHash: '' }),
  (error) => error instanceof ReducerCondensationError && error.code === 'REDUCER_CONDENSATION_SAMPLING_RULE_INVALID',
);

console.log(JSON.stringify({
  check: 'lfea-b3.23-reducer-condensation',
  status: 'PASS',
  authorityHash: authority.semanticHash,
  totalWeight: authority.gravity.totalWeight,
  centroidFromEnd: authority.gravity.centroidFromEnd,
  parityStatus: authority.parityStatus,
}, null, 2));
console.log('LFEA B-3.23 ten-cylinder reducer condensation PASS');
