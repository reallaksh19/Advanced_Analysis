#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  LAFEA_BUCKET_01_CONVERGENCE_INPUT_SCHEMA,
  evaluateLafeaBucket01Convergence,
  validateLafeaBucket01ConvergenceEvidence,
} from '../src/workspace/lafea-bucket-01-convergence.js';

const input = {
  schema: LAFEA_BUCKET_01_CONVERGENCE_INPUT_SCHEMA,
  quantityId: 'FIXED_PROBE_SIGMA_YY',
  units: 'MPa',
  meshSizes: [0.4, 0.2, 0.1],
  observations: [10.16, 10.04, 10.01],
  gciTolerance: 0.005,
  minimumObservedOrder: 1.5,
  asymptoticRatioBounds: { minimum: 0.85, maximum: 1.15 },
};

const passEvidence = evaluateLafeaBucket01Convergence(input);
assert.equal(passEvidence.status, 'PASS');
assert.equal(passEvidence.classification, 'MONOTONIC');
assert.ok(Math.abs(passEvidence.observedOrder - 2) <= 1e-12);
assert.ok(Math.abs(passEvidence.richardsonExtrapolation - 10) <= 1e-12);
assert.equal(passEvidence.asymptoticRangeAccepted, true);
assert.equal(validateLafeaBucket01ConvergenceEvidence(passEvidence).ok, true);

const oscillatoryEvidence = evaluateLafeaBucket01Convergence({
  ...input,
  observations: [10.16, 9.96, 10.01],
});
assert.equal(oscillatoryEvidence.status, 'BLOCKED');
assert.equal(oscillatoryEvidence.classification, 'OSCILLATORY');

const invariantEvidence = evaluateLafeaBucket01Convergence({
  ...input,
  observations: [0, 0, 0],
});
assert.equal(invariantEvidence.status, 'BLOCKED');
assert.equal(invariantEvidence.classification, 'MESH_INSENSITIVE_OR_EXACT');

const alteredEvidence = structuredClone(passEvidence);
alteredEvidence.fineGridGci = 0;
assert.equal(
  validateLafeaBucket01ConvergenceEvidence(alteredEvidence).ok,
  false,
);

console.log('Bucket-01 three-level convergence checks passed.');
