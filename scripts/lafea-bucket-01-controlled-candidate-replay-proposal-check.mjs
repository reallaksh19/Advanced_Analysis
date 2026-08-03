#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_EVIDENCE_SCHEMA,
  LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_REVISION,
} from '../src/workspace/lafea-bucket-01-probe-stable-candidate-intake.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_INPUT_SCHEMA,
  evaluateLafeaBucket01ControlledCandidateReplayProposal,
  validateLafeaBucket01ControlledCandidateReplayEvidence,
} from '../src/workspace/lafea-bucket-01-controlled-candidate-replay-proposal.js';

const exactHeadSha = 'a'.repeat(40);
const designHash = canonicalLafeaSha256({ design: 'B01-PROBE-STABLE-POLAR-V2' });
const intake = intakeEvidence();
const input = {
  schema: LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_INPUT_SCHEMA,
  exactHeadSha,
  designId: 'B01-PROBE-STABLE-POLAR-V2',
  designHash,
  candidateIntakeEvidence: intake,
  referenceProductionRoute: {
    routeId: 'UNIFORM_T6_REFERENCE',
    meshFamily: 'LAFEA_LUG_PINHOLE_UNIFORM_T6',
    entrypoint: 'scripts/lafea-bucket-01-production-replay.mjs',
    retained: true,
  },
  candidateReplayRoute: {
    routeId: 'PROBE_STABLE_T6_CANDIDATE_REPLAY',
    meshFamily: 'LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_V2',
    entrypoint: 'scripts/lafea-bucket-01-probe-stable-production-replay.mjs',
    retained: false,
  },
  rollbackRoute: {
    routeId: 'UNIFORM_T6_REFERENCE',
    meshFamily: 'LAFEA_LUG_PINHOLE_UNIFORM_T6',
    entrypoint: 'scripts/lafea-bucket-01-production-replay.mjs',
    retained: true,
  },
};
const evidence = evaluateLafeaBucket01ControlledCandidateReplayProposal(input);
assert.equal(evidence.status, 'CONTROLLED_CANDIDATE_REPLAY_PROPOSAL_READY');
assert.equal(evidence.authority.candidateReplayProposalReady, true);
assert.equal(evidence.authority.productionSwitchAuthorized, false);
assert.equal(evidence.authority.productionSwitchApplied, false);
assert.equal(evidence.authority.productionMeshAuthority, false);
assert.equal(evidence.authority.qualificationAuthority, false);
assert.equal(evidence.authority.bucketQualified, false);
assert.equal(
  validateLafeaBucket01ControlledCandidateReplayEvidence(evidence).ok,
  true,
);

assert.throws(
  () => evaluateLafeaBucket01ControlledCandidateReplayProposal({
    ...input,
    exactHeadSha: 'b'.repeat(40),
  }),
  hasCode('LAFEA_B01_CANDIDATE_REPLAY_CUSTODY_MISMATCH'),
);
assert.throws(
  () => evaluateLafeaBucket01ControlledCandidateReplayProposal({
    ...input,
    rollbackRoute: {
      ...input.rollbackRoute,
      routeId: 'DIFFERENT_ROUTE',
    },
  }),
  hasCode('LAFEA_B01_CANDIDATE_REPLAY_ROLLBACK_INVALID'),
);
const escalated = clone(intake);
escalated.authority.productionSwitchAuthorized = true;
rehash(escalated);
assert.throws(
  () => evaluateLafeaBucket01ControlledCandidateReplayProposal({
    ...input,
    candidateIntakeEvidence: deepFreeze(escalated),
  }),
  hasCode('LAFEA_B01_CANDIDATE_REPLAY_INTAKE_AUTHORITY_ESCALATED'),
);

console.log('PASS LAFEA Bucket-01 controlled candidate replay proposal checks');

function intakeEvidence() {
  const base = {
    schema: LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_REVISION,
    exactHeadSha,
    designHash,
    candidatePackageHash: canonicalLafeaSha256({ package: 1 }),
    topologyReportHash: canonicalLafeaSha256({ topology: 1 }),
    candidateValidationEvidenceHash: canonicalLafeaSha256({ candidate: 1 }),
    topologyValidationEvidenceHash: canonicalLafeaSha256({ validation: 1 }),
    expectedLocationCount: 7,
    minimumCandidateNaturalMargin: 0.05,
    levels: [],
    status: 'CANDIDATE_ACCEPTED_FOR_PHASE_2C_INTEGRATION_REVIEW',
    reasons: [],
    authority: {
      candidatePackageVerified: true,
      topologyProofVerified: true,
      candidateRebuildValidationExecuted: true,
      topologyRecomputationExecuted: true,
      exactHeadBound: true,
      designHashBound: true,
      productionSwitchAuthorized: false,
      productionSwitchApplied: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function rehash(value) {
  delete value.semanticHash;
  value.semanticHash = canonicalLafeaSha256(value);
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
function hasCode(code) {
  return (error) => error?.code === code;
}
