#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  LAFEA_BUCKET_01_PRODUCTION_RESPONSE_INPUT_SCHEMA,
  evaluateLafeaBucket01ProductionResponse,
  validateLafeaBucket01ProductionResponseEvidence,
} from '../src/workspace/lafea-bucket-01-production-response.js';

const baseInput = {
  schema: LAFEA_BUCKET_01_PRODUCTION_RESPONSE_INPUT_SCHEMA,
  exactHeadSha: 'a'.repeat(40),
  specHash: `sha256:${'b'.repeat(64)}`,
  locationDefinitionHash: `sha256:${'c'.repeat(64)}`,
  expectedAppliedForce: { x: 1000, y: 250 },
  expectedAppliedMomentZ: 10000,
  levels: [
    level(1, 64, 1 / 16, 96, '1', 'DETERMINISTIC_CHOLESKY'),
    level(2, 256, 1 / 32, 99, '2', 'DETERMINISTIC_CHOLESKY'),
    level(3, 1024, 1 / 64, 99.75, '3', 'DETERMINISTIC_JACOBI_PCG'),
    level(4, 4096, 1 / 128, 99.9375, '4', 'DETERMINISTIC_JACOBI_PCG'),
  ],
  tolerances: {
    loadResultantRelative: 1e-8,
    forceEquilibriumRelative: 1e-4,
    loadMomentRelative: 1e-8,
    momentEquilibriumRelative: 1e-4,
    energyReconstructionRelative: 1e-8,
    strainEnergyGci: 0.02,
    minimumObservedOrder: null,
    asymptoticRatioBounds: { minimum: 0.85, maximum: 1.15 },
  },
};

const evidence = evaluateLafeaBucket01ProductionResponse(baseInput);
assert.equal(evidence.status, 'PASS');
assert.equal(evidence.energyConvergence.status, 'PASS');
assert.equal(evidence.energyConvergence.classification, 'MONOTONIC');
assert.deepEqual(evidence.energyConvergenceLevelOrdinals, [2, 3, 4]);
assert.deepEqual(evidence.energyConvergenceElementCounts, [256, 1024, 4096]);
assert.deepEqual(evidence.energyConvergence.meshSizes, [1 / 32, 1 / 64, 1 / 128]);
assert.equal(evidence.momentConvergence.status, 'PASS');
assert.equal(
  evidence.momentConvergence.classification,
  'ORACLE_BOUND_MESH_INVARIANT',
);
assert.deepEqual(
  evidence.levelEvidence.map((row) => row.elementCount),
  [64, 256, 1024, 4096],
);
assert.deepEqual(
  evidence.levelEvidence.map((row) => row.solverMethod),
  [
    'DETERMINISTIC_CHOLESKY',
    'DETERMINISTIC_CHOLESKY',
    'DETERMINISTIC_JACOBI_PCG',
    'DETERMINISTIC_JACOBI_PCG',
  ],
);
assert.equal(
  evidence.levelEvidence.every((row) => row.status === 'PASS'),
  true,
);
assert.equal(validateLafeaBucket01ProductionResponseEvidence(evidence).ok, true);

const oscillatory = evaluateLafeaBucket01ProductionResponse({
  ...baseInput,
  levels: [
    level(1, 64, 1 / 16, 96, '5', 'DETERMINISTIC_CHOLESKY'),
    level(2, 256, 1 / 32, 100, '6', 'DETERMINISTIC_CHOLESKY'),
    level(3, 1024, 1 / 64, 99.75, '7', 'DETERMINISTIC_JACOBI_PCG'),
    level(4, 4096, 1 / 128, 100.125, '8', 'DETERMINISTIC_JACOBI_PCG'),
  ],
});
assert.equal(oscillatory.status, 'BLOCKED');
assert.equal(oscillatory.energyConvergence.classification, 'OSCILLATORY');

const momentFailure = evaluateLafeaBucket01ProductionResponse({
  ...baseInput,
  levels: baseInput.levels.map((row, index) => index === 3
    ? { ...row, reactionMomentZ: -9980 }
    : row),
});
assert.equal(momentFailure.status, 'BLOCKED');
assert.ok(momentFailure.reasons.includes('LEVEL_4_MOMENT_EQUILIBRIUM_FAILED'));

assert.throws(
  () => evaluateLafeaBucket01ProductionResponse({
    ...baseInput,
    levels: baseInput.levels.map((row, index) => index === 3
      ? { ...row, solverMethod: 'DETERMINISTIC_CHOLESKY' }
      : row),
  }),
  (error) => error?.code
    === 'LAFEA_B01_PRODUCTION_RESPONSE_SOLVER_POLICY_INVALID',
);

assert.throws(
  () => evaluateLafeaBucket01ProductionResponse({
    ...baseInput,
    levels: baseInput.levels.slice(0, 3),
  }),
  (error) => error?.code
    === 'LAFEA_B01_PRODUCTION_RESPONSE_GOVERNED_LADDER_REQUIRED',
);

const tampered = structuredClone(evidence);
tampered.levelEvidence[3].totalStrainEnergy = 1;
assert.equal(
  validateLafeaBucket01ProductionResponseEvidence(tampered).ok,
  false,
);

console.log('Bucket-01 governed four-level force, moment, solver-policy and finest-three strain-energy convergence contract checks passed.');

function level(
  ordinal,
  elementCount,
  meshSize,
  energy,
  digit,
  solverMethod,
) {
  return {
    ordinal,
    elementCount,
    meshSize,
    meshHash: `sha256:${digit.repeat(64)}`,
    recoveryHash: `sha256:${digit.repeat(64)}`,
    resultHash: `sha256:${digit.repeat(64)}`,
    solverMethod,
    freeDofCount: elementCount,
    appliedForce: { x: 1000, y: 250 },
    reactionForce: { x: -1000, y: -250 },
    appliedMomentZ: 10000,
    reactionMomentZ: -10000,
    totalStrainEnergy: energy,
    halfExternalWork: energy,
    energyQualificationAccepted: true,
  };
}
