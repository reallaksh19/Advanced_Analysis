#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_EVIDENCE_SCHEMA,
  LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_REVISION,
} from '../src/workspace/lafea-bucket-01-controlled-candidate-replay-proposal.js';
import {
  LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_INPUT_SCHEMA,
  evaluateLafeaBucket01CandidateReplayAdjudication,
  validateLafeaBucket01CandidateReplayAdjudicationEvidence,
} from '../src/workspace/lafea-bucket-01-candidate-replay-adjudication.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  registeredCandidateReplayFixture as candidate,
  registeredReferenceReplayFixture as reference,
  registeredReplayDesignHash as designHash,
  registeredReplayExactHeadSha as exactHeadSha,
} from './lafea-bucket-01-replay-artifact-registry-contract-check.mjs';

const proposal = proposalEvidence();
const eligible = evaluateLafeaBucket01CandidateReplayAdjudication({
  schema: LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_INPUT_SCHEMA,
  exactHeadSha,
  designHash,
  proposalEvidence: proposal,
  referenceReplay: reference,
  candidateReplay: candidate,
});
assert.equal(eligible.disposition, 'ELIGIBLE_FOR_PRODUCTION_SWITCH_REVIEW');
assert.equal(eligible.statusesDerivedFromValidatedPayloads, true);
assert.equal(eligible.artifactRegistryRevision, '3');
assert.equal(eligible.authority.registeredArtifactValidatorsExecuted, true);
assert.equal(eligible.authority.candidateEligibleForProductionSwitchReview, true);
assert.equal(eligible.authority.productionSwitchAuthorized, false);
assert.equal(eligible.authority.productionSwitchApplied, false);
assert.equal(eligible.authority.productionMeshAuthority, false);
assert.equal(eligible.authority.stressAcceptanceAuthority, false);
assert.equal(eligible.authority.qualificationAuthority, false);
assert.equal(eligible.authority.bucketQualified, false);
assert.equal(
  validateLafeaBucket01CandidateReplayAdjudicationEvidence(eligible).ok,
  true,
);

const serializedCandidate = JSON.parse(JSON.stringify(candidate));
assert.throws(
  () => evaluateLafeaBucket01CandidateReplayAdjudication({
    schema: LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_INPUT_SCHEMA,
    exactHeadSha,
    designHash,
    proposalEvidence: proposal,
    referenceReplay: reference,
    candidateReplay: serializedCandidate,
  }),
  hasCode('LAFEA_B01_REPLAY_RESULT_INVALID'),
);

const serializedReference = JSON.parse(JSON.stringify(reference));
assert.throws(
  () => evaluateLafeaBucket01CandidateReplayAdjudication({
    schema: LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_INPUT_SCHEMA,
    exactHeadSha,
    designHash,
    proposalEvidence: proposal,
    referenceReplay: serializedReference,
    candidateReplay: candidate,
  }),
  hasCode('LAFEA_B01_REPLAY_RESULT_INVALID'),
);

const tamperedProposal = JSON.parse(JSON.stringify(proposal));
tamperedProposal.candidatePackageHash = canonicalLafeaSha256({ altered: true });
assert.throws(
  () => evaluateLafeaBucket01CandidateReplayAdjudication({
    schema: LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_INPUT_SCHEMA,
    exactHeadSha,
    designHash,
    proposalEvidence: tamperedProposal,
    referenceReplay: reference,
    candidateReplay: candidate,
  }),
  hasCode('LAFEA_B01_REPLAY_PROPOSAL_INVALID'),
);

assert.throws(
  () => evaluateLafeaBucket01CandidateReplayAdjudication({
    schema: LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_INPUT_SCHEMA,
    exactHeadSha: 'b'.repeat(40),
    designHash,
    proposalEvidence: proposal,
    referenceReplay: reference,
    candidateReplay: candidate,
  }),
  hasCode('LAFEA_B01_REPLAY_PROPOSAL_CUSTODY_OR_AUTHORITY_INVALID'),
);

console.log('PASS LAFEA Bucket-01 runtime-revalidated candidate replay adjudication');

function proposalEvidence() {
  const base = {
    schema: LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_REVISION,
    exactHeadSha,
    designId: 'B01-PROBE-STABLE-POLAR-V3',
    designHash,
    candidateIntakeEvidenceHash: candidate.candidateIntakeEvidenceHash,
    candidatePackageHash: candidate.candidatePackageHash,
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
    requiredFrozenInputHashes: Object.keys(candidate.frozenInputHashes),
    requiredArtifactCounts: {
      common: {
        ANALYSIS_MESH_EVIDENCE: 4,
        STAGE_DOCUMENT: 4,
        LOAD_MAPPING: 4,
        BOUNDARY_MAPPING: 4,
        MAPPING_PACKAGE: 4,
        EXECUTION_RECEIPT: 4,
        RESPONSE_EVIDENCE: 1,
        KIRSCH_EVIDENCE: 1,
        PRODUCTION_STRESS_EVIDENCE: 1,
        TOPOLOGY_AUDIT_EVIDENCE: 1,
        CONVERGENCE_EVIDENCE: 1,
        REPOSITORY_GATE_REPORT: 1,
        STDOUT_LOG: 1,
        STDERR_LOG: 1,
        PACKAGE_LOCK: 1,
        EXECUTION_ENVIRONMENT: 1,
      },
      reference: { REFERENCE_MESH_LADDER: 1 },
      candidate: {
        CANDIDATE_PACKAGE: 1,
        CANDIDATE_INTAKE: 1,
        INDEPENDENT_CHECKER_EVIDENCE: 1,
      },
    },
    requiredCharacteristicH: {
      fourGlobalLevelsRequired: true,
      sevenFrozenLocationsRequired: true,
      constantGlobalRatioAssumed: false,
      unequalRatioMethod: 'ACTUAL_H_VALUES_OR_BLOCK',
      localDefinition:
        'SQRT_DELTA_R_TIMES_RADIUS_TIMES_DELTA_THETA_RADIANS',
      topologyCompatibilityRequired: true,
    },
    executionIsolationPolicy: {
      referenceRunsFirst: true,
      separateOutputNamespacesRequired: true,
      mutableArtifactSharingForbidden: true,
      preAndPostTrackedStatusRequired: true,
      packageLockHashRequired: true,
      stdoutAndStderrHashesRequired: true,
      codeRevisionParityRequired: true,
    },
    status: 'CONTROLLED_CANDIDATE_REPLAY_PROPOSAL_READY',
    reasons: [],
    authority: {
      candidateIntakeVerified: true,
      candidateRecomputationVerified: true,
      independentCheckerRequiredBeforeAdjudication: true,
      artifactDerivedStatusesRequired: true,
      rollbackRouteVerified: true,
      referenceProductionRouteRetained: true,
      candidateReplayProposalReady: true,
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
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
function hasCode(code) {
  return (error) => error?.code === code;
}
