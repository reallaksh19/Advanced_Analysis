#!/usr/bin/env node

import assert from 'node:assert/strict';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_CANDIDATE_LOCAL_H_DEFINITION,
  LAFEA_BUCKET_01_CANDIDATE_STRESS_INPUT_SCHEMA,
  evaluateLafeaBucket01CandidateStress,
  validateLafeaBucket01CandidateStressEvidence,
} from '../src/workspace/lafea-bucket-01-candidate-stress.js';

const head = 'a'.repeat(40);
const designHash = hash('design');
const probeSpecHash = hash('probe-spec');
const locations = Array.from({ length: 7 }, (_, index) => location(index));
const input = {
  schema: LAFEA_BUCKET_01_CANDIDATE_STRESS_INPUT_SCHEMA,
  exactHeadSha: head,
  designHash,
  probeSpecHash,
  localCharacteristicHDefinition:
    LAFEA_BUCKET_01_CANDIDATE_LOCAL_H_DEFINITION,
  locations,
  tolerances: {
    highGradientGciMax: 0.05,
    nonSingularGciMax: 0.03,
    minimumObservedOrder: null,
    asymptoticRatioBounds: { minimum: 0.999999, maximum: 1.000001 },
  },
};
const evidence = evaluateLafeaBucket01CandidateStress(input);
assert.equal(evidence.status, 'PASS');
assert.equal(evidence.locationEvidence.length, 7);
assert.deepEqual(evidence.blockingLocationIds, []);
assert.equal(evidence.authority.directT6PointRecoveryRequired, true);
assert.equal(evidence.authority.actualLocalCharacteristicHUsed, true);
assert.equal(evidence.authority.equalRefinementRatioAssumed, false);
assert.equal(evidence.authority.independentCheckerExecution, false);
assert.equal(evidence.authority.productionSwitchAuthorized, false);
assert.equal(evidence.authority.productionMeshAuthority, false);
assert.equal(evidence.authority.stressAcceptanceAuthority, false);
assert.equal(evidence.authority.qualificationAuthority, false);
assert.equal(evidence.authority.bucketQualified, false);
assert.equal(validateLafeaBucket01CandidateStressEvidence(evidence).ok, true);

const oscillatoryLocations = locations.map((row) => structuredClone(row));
oscillatoryLocations[0].observations = [10, 12, 11, 11.5];
const oscillatory = evaluateLafeaBucket01CandidateStress({
  ...input,
  locations: oscillatoryLocations,
});
assert.equal(oscillatory.status, 'BLOCKED');
assert.deepEqual(oscillatory.blockingLocationIds, ['PROBE-1']);
assert.equal(
  oscillatory.locationEvidence[0].convergence.classification,
  'OSCILLATORY',
);
assert.equal(oscillatory.locationEvidence[0].convergence.fineGridGci, null);
assert.equal(oscillatory.authority.stressAcceptanceAuthority, false);

const topologyChangedLocations = locations.map((row) => structuredClone(row));
topologyChangedLocations[2].topologySignatures[2] = hash('changed-topology');
const topologyChanged = evaluateLafeaBucket01CandidateStress({
  ...input,
  locations: topologyChangedLocations,
});
assert.equal(topologyChanged.status, 'BLOCKED');
assert.equal(
  topologyChanged.locationEvidence[2].convergence.classification,
  'TOPOLOGY_INCOMPATIBLE',
);

assert.throws(
  () => evaluateLafeaBucket01CandidateStress({
    ...input,
    locations: locations.slice(0, 6),
  }),
  hasCode('LAFEA_B01_CANDIDATE_STRESS_LOCATION_COUNT_INVALID'),
);
assert.throws(
  () => evaluateLafeaBucket01CandidateStress({
    ...input,
    locations: locations.map((row, index) => index === 1
      ? { ...row, locationId: 'PROBE-1' }
      : row),
  }),
  hasCode('LAFEA_B01_CANDIDATE_STRESS_LOCATION_DUPLICATE'),
);
assert.throws(
  () => evaluateLafeaBucket01CandidateStress({
    ...input,
    locations: locations.map((row, index) => index === 0
      ? { ...row, hValues: [4, 2, 2, 0.5] }
      : row),
  }),
  hasCode('LAFEA_B01_CANDIDATE_STRESS_H_NOT_REFINED'),
);

const tampered = JSON.parse(JSON.stringify(evidence));
tampered.locationEvidence[0].observations[0] += 1;
assert.equal(validateLafeaBucket01CandidateStressEvidence(tampered).ok, false);

console.log('PASS LAFEA Bucket-01 candidate direct-point stress checks');

function location(index) {
  const hValues = [4, 2, 1, 0.5];
  const exact = 100 + index;
  const observations = hValues.map((hValue) => exact + 0.001 * hValue ** 2);
  const topology = hash(`topology-${index}`);
  return {
    locationId: `PROBE-${index + 1}`,
    locationDefinitionHash: hash(`location-${index}`),
    component: index === 0 ? 'PRINCIPAL_MAXIMUM' : 'VON_MISES',
    units: 'MPa',
    zone: index < 3 ? 'HIGH_GRADIENT' : 'NON_SINGULAR',
    radius: 27 + index,
    angleDegrees: index === 0 ? 83 : 67,
    hValues,
    observations,
    topologySignatures: Array(4).fill(topology),
    probeEvidenceHashes: Array.from({ length: 4 }, (_, level) =>
      hash(`probe-${index}-${level}`)),
  };
}

function hash(label) {
  return canonicalLafeaSha256({ schema: 'candidate-stress-test/v1', label });
}
function hasCode(code) {
  return (error) => error?.code === code;
}
