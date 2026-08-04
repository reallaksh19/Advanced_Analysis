#!/usr/bin/env node

import assert from 'node:assert/strict';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_OSCILLATORY_BOUND_INPUT_SCHEMA,
  LAFEA_BUCKET_01_OSCILLATORY_BOUND_METHOD,
  evaluateLafeaBucket01OscillatoryBoundEligibility,
  validateLafeaBucket01OscillatoryBoundEligibilityEvidence,
} from '../src/workspace/lafea-bucket-01-oscillatory-bound-eligibility.js';

const topology = canonicalLafeaSha256({ topology: 'stable-B' });
const eligible = evaluateLafeaBucket01OscillatoryBoundEligibility({
  schema: LAFEA_BUCKET_01_OSCILLATORY_BOUND_INPUT_SCHEMA,
  locationId: 'SYNTHETIC_CONTRACTING_OSCILLATION',
  values: [1, 1.4, 1.16, 1.304],
  topologySignatures: [topology, topology, topology, topology],
});
assert.equal(eligible.disposition, 'ELIGIBLE_FOR_INDEPENDENT_BOUND_REVIEW');
assert.equal(eligible.methodClassification, LAFEA_BUCKET_01_OSCILLATORY_BOUND_METHOD);
assert.ok(eligible.conservativeAbsoluteTailBound > 0);
assert.ok(eligible.conservativeRelativeTailBound > 0);
assert.equal(eligible.authority.independentEngineeringAuthorityRequired, true);
assert.equal(eligible.authority.gciClaimed, false);
assert.equal(eligible.authority.observedOrderClaimed, false);
assert.equal(eligible.authority.stressAcceptanceAuthority, false);
assert.equal(eligible.authority.qualificationAuthority, false);
assert.equal(eligible.authority.bucketQualified, false);
assert.equal(
  validateLafeaBucket01OscillatoryBoundEligibilityEvidence(eligible).ok,
  true,
);

const retainedThreeLevelSequences = [
  ['LUG_NEAR_HOLE_PMAX', [1.7605570464013405, 2.0519303536803664, 2.0287840906975374]],
  ['LUG_RADIAL_PATH_THETA_67:R27', [1.783438646634265, 1.541664470433054, 1.6699643996837905]],
  ['LUG_RADIAL_PATH_THETA_67:R33', [1.251015773356692, 1.4128553746163197, 1.4011042673111866]],
  ['LUG_RADIAL_PATH_THETA_67:R47', [0.971423113514862, 0.9706766864529565, 0.9915806110940107]],
  ['LUG_RADIAL_PATH_THETA_67:R73', [0.40326178911182914, 0.4257384013962911, 0.42547775414405203]],
  ['LUG_RADIAL_PATH_THETA_67:R87', [0.24278110441356557, 0.24196195510314747, 0.2444763295574866]],
];
for (const [locationId, values] of retainedThreeLevelSequences) {
  const evidence = evaluateLafeaBucket01OscillatoryBoundEligibility({
    schema: LAFEA_BUCKET_01_OSCILLATORY_BOUND_INPUT_SCHEMA,
    locationId,
    values,
    topologySignatures: values.map(() => topology),
  });
  assert.equal(evidence.disposition, 'ADDITIONAL_LEVEL_REQUIRED');
  assert.equal(evidence.conservativeAbsoluteTailBound, null);
  assert.equal(evidence.conservativeRelativeTailBound, null);
  assert.equal(evidence.authority.gciClaimed, false);
}

const growing = evaluateLafeaBucket01OscillatoryBoundEligibility({
  schema: LAFEA_BUCKET_01_OSCILLATORY_BOUND_INPUT_SCHEMA,
  locationId: 'GROWING_OSCILLATION',
  values: [1, 1.1, 0.8, 1.4],
  topologySignatures: [topology, topology, topology, topology],
});
assert.equal(growing.disposition, 'OSCILLATION_NOT_CONTRACTING');
assert.equal(growing.conservativeRelativeTailBound, null);

const changedTopology = evaluateLafeaBucket01OscillatoryBoundEligibility({
  schema: LAFEA_BUCKET_01_OSCILLATORY_BOUND_INPUT_SCHEMA,
  locationId: 'TOPOLOGY_CHANGED',
  values: [1, 1.4, 1.16, 1.304],
  topologySignatures: [
    topology,
    topology,
    canonicalLafeaSha256({ topology: 'changed' }),
    topology,
  ],
});
assert.equal(
  changedTopology.disposition,
  'TOPOLOGY_INCOMPATIBLE_BOUND_FORBIDDEN',
);

console.log('PASS LAFEA Bucket-01 oscillatory bound eligibility checks');
