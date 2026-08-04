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
const designHash = canonicalLafeaSha256({ design: 'B01-PROBE-STABLE-POLAR-V3' });
const intake = intakeEvidence();
const input = {
  schema: LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_INPUT_SCHEMA,
  exactHeadSha,
  designId: 'B01-PROBE-STABLE-POLAR-V3',
  designHash,
  candidateIntakeEvidence: intake,
  referenceProductionRoute: {
    routeId: 'UNIFORM_T6_REFERENCE',
    meshFamily: 'LAFEA_LUG_PINHOLE_UNIFORM_T6',
    entrypoint: 'scripts/lafea-bucket-01-production-replay.mjs',
    retained: true,
  },
  candidateReplayRoute: {
    routeId: 'PROBE_STABLE_T6_V3_CANDIDATE_REPLAY',
    meshFamily: 'LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_V3',
    entrypoint: 'scripts/lafea-bucket-01-probe-stable-v3-controlled-replay.mjs',
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
assert.equal(evidence.designId, 'B01-PROBE-STABLE-POLAR-V3');
assert.equal(evidence.requiredFrozenInputHashes.length, 18);
assert.equal(evidence.requiredArtifactCounts.common.ANALYSIS_MESH_EVIDENCE, 4);
assert.equal(evidence.requiredArtifactCounts.candidate.INDEPENDENT_CHECKER_EVIDENCE, 1);
assert.equal(evidence.requiredCharacteristicH.constantGlobalRatioAssumed, false);
assert.equal(
  evidence.requiredCharacteristicH.unequalRatioMethod,
  'ACTUAL_H_VALUES_OR_BLOCK',
);
assert.equal(evidence.executionIsolationPolicy.referenceRunsFirst, true);
assert.equal(evidence.executionIsolationPolicy.codeRevisionParityRequired, true);
assert.equal(evidence.authority.candidateReplayProposalReady, true);
assert.equal(evidence.authority.artifactDerivedStatusesRequired, true);
assert.equal(evidence.authority.independentCheckerRequiredBeforeAdjudication, true);
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
    designId: 'B01-PROBE-STABLE-POLAR-V2',
  }),
  hasCode('LAFEA_B01_CANDIDATE_REPLAY_DESIGN_V3_REQUIRED'),
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
assert.throws(
  () => evaluateLafeaBucket01ControlledCandidateReplayProposal({
    ...input,
    candidateReplayRoute: {
      ...input.candidateReplayRoute,
      meshFamily: 'LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_V2',
    },
  }),
  hasCode('LAFEA_B01_CANDIDATE_REPLAY_CANDIDATE_ROUTE_INVALID'),
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
const checkerNotRequired = clone(intake);
checkerNotRequired.authority.independentCheckerRequiredBeforeReplayAdjudication = false;
rehash(checkerNotRequired);
assert.throws(
  () => evaluateLafeaBucket01ControlledCandidateReplayProposal({
    ...input,
    candidateIntakeEvidence: deepFreeze(checkerNotRequired),
  }),
  hasCode('LAFEA_B01_CANDIDATE_REPLAY_INTAKE_AUTHORITY_ESCALATED'),
);

console.log('PASS LAFEA Bucket-01 Design V3 controlled replay proposal checks');

function intakeEvidence() {
  const candidatePackageHash = canonicalLafeaSha256({ package: 3 });
  const base = {
    schema: LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_REVISION,
    exactHeadSha,
    designHash,
    candidatePackageHash,
    topologyReportHash: canonicalLafeaSha256({ topology: 3 }),
    candidateValidationEvidenceHash: canonicalLafeaSha256({ candidate: 3 }),
    topologyValidationEvidenceHash: canonicalLafeaSha256({ validation: 3 }),
    expectedLocationCount: 7,
    minimumCandidateNaturalMargin: 0.05,
    levels: [
      [1, 12, 20, 480],
      [2, 17, 35, 1190],
      [3, 30, 68, 4080],
      [4, 54, 132, 14256],
    ].map(([ordinal, radialCellCount, circumferentialCellCount, elementCount]) => ({
      ordinal,
      radialCellCount,
      circumferentialCellCount,
      elementCount,
      meshHash: canonicalLafeaSha256({ mesh: ordinal }),
      mappingWindowHash: canonicalLafeaSha256({ mapping: ordinal }),
      topologyMinimumNaturalMargin: 0.1,
      status: 'PASS',
    })),
    status: 'CANDIDATE_ACCEPTED_FOR_PHASE_2C_INTEGRATION_REVIEW',
    reasons: [],
    authority: {
      candidatePackageVerified: true,
      topologyProofVerified: true,
      candidateRebuildValidationExecuted: true,
      topologyRecomputationExecuted: true,
      mappingWindowRecomputed: true,
      executedRecomputation: true,
      independentCheckerExecution: false,
      independentCheckerRequiredBeforeReplayAdjudication: true,
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
