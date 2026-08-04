#!/usr/bin/env node

import assert from 'node:assert/strict';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_UNEQUAL_H_CONVERGENCE_INPUT_SCHEMA,
  evaluateLafeaBucket01UnequalHConvergence,
  validateLafeaBucket01UnequalHConvergenceEvidence,
} from '../src/workspace/lafea-bucket-01-unequal-h-convergence.js';

const hValues = [4, 2.5, 1.4, 0.8];
const exactValue = 10;
const coefficient = 0.2;
const order = 2;
const observations = hValues.map((hValue) =>
  exactValue + coefficient * hValue ** order);
const topologySignature = hash('stable-topology');
const input = {
  schema: LAFEA_BUCKET_01_UNEQUAL_H_CONVERGENCE_INPUT_SCHEMA,
  quantityId: 'TOTAL_STRAIN_ENERGY',
  samplingAuthority: 'FIXED_GLOBAL_RESPONSE',
  locationId: 'C2D_LUG_PINHOLE_FULL_MODEL_LC1',
  locationDefinitionHash: hash('location'),
  units: 'N*mm',
  hValues,
  observations,
  topologySignatures: Array(4).fill(topologySignature),
  gciTolerance: 0.05,
  minimumObservedOrder: null,
  asymptoticRatioBounds: { minimum: 0.999999, maximum: 1.000001 },
};
const evidence = evaluateLafeaBucket01UnequalHConvergence(input);
assert.equal(evidence.status, 'PASS');
assert.equal(evidence.classification, 'MONOTONIC');
assert.ok(Math.abs(evidence.observedOrder - order) < 1e-9);
assert.ok(Math.abs(evidence.extrapolatedValue - exactValue) < 1e-9);
assert.ok(Math.abs(evidence.errorCoefficient - coefficient) < 1e-9);
assert.ok(Math.abs(evidence.coarseTrendRatio - 1) < 1e-9);
assert.equal(evidence.coarseTrendAccepted, true);
assert.equal(evidence.constantRefinementRatioAssumed, false);
assert.deepEqual(
  evidence.hRatiosToPrevious,
  [null, 1.6, 2.5 / 1.4, 1.4 / 0.8],
);
assert.equal(evidence.authority.actualHValuesUsed, true);
assert.equal(evidence.authority.finestThreeUsedForOrderAndExtrapolation, true);
assert.equal(evidence.authority.coarsestLevelUsedForIndependentTrendAudit, true);
assert.equal(evidence.authority.equalRatioSubstitutionUsed, false);
assert.equal(evidence.authority.productionMeshAuthority, false);
assert.equal(evidence.authority.qualificationAuthority, false);
assert.equal(evidence.authority.bucketQualified, false);
assert.equal(validateLafeaBucket01UnequalHConvergenceEvidence(evidence).ok, true);

const oscillatory = evaluateLafeaBucket01UnequalHConvergence({
  ...input,
  observations: [10, 12, 11, 11.5],
  asymptoticRatioBounds: { minimum: 0.5, maximum: 1.5 },
});
assert.equal(oscillatory.status, 'BLOCKED');
assert.equal(oscillatory.classification, 'OSCILLATORY');
assert.equal(oscillatory.observedOrder, null);
assert.equal(oscillatory.fineGridGci, null);
assert.equal(oscillatory.authority.gciClaimed, false);
assert.ok(oscillatory.reasons.includes(
  'OSCILLATORY_CONVERGENCE_REQUIRES_ADDITIONAL_LEVEL_OR_BOUND',
));

const topologyChanged = evaluateLafeaBucket01UnequalHConvergence({
  ...input,
  topologySignatures: [
    topologySignature,
    topologySignature,
    hash('changed-topology'),
    topologySignature,
  ],
});
assert.equal(topologyChanged.status, 'BLOCKED');
assert.equal(topologyChanged.classification, 'TOPOLOGY_INCOMPATIBLE');
assert.ok(topologyChanged.reasons.includes('TOPOLOGY_SIGNATURE_CHANGED'));

const coarseTrendChanged = [...observations];
coarseTrendChanged[0] += 1;
const coarseAudit = evaluateLafeaBucket01UnequalHConvergence({
  ...input,
  observations: coarseTrendChanged,
});
assert.equal(coarseAudit.status, 'BLOCKED');
assert.equal(coarseAudit.classification, 'MONOTONIC');
assert.equal(coarseAudit.coarseTrendAccepted, false);
assert.ok(coarseAudit.reasons.includes('COARSE_LEVEL_TREND_AUDIT_FAILED'));

assert.throws(
  () => evaluateLafeaBucket01UnequalHConvergence({
    ...input,
    hValues: [4, 2.5, 2.5, 0.8],
  }),
  hasCode('LAFEA_B01_UNEQUAL_H_NOT_STRICTLY_REFINED'),
);

const tampered = JSON.parse(JSON.stringify(evidence));
tampered.hRatiosToPrevious[1] = 2;
assert.equal(validateLafeaBucket01UnequalHConvergenceEvidence(tampered).ok, false);

console.log('PASS LAFEA Bucket-01 unequal-h convergence checks');

function hash(label) {
  return canonicalLafeaSha256({ schema: 'unequal-h-test/v1', label });
}
function hasCode(code) {
  return (error) => error?.code === code;
}
