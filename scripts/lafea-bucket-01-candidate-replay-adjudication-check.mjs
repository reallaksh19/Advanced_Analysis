#!/usr/bin/env node

import assert from 'node:assert/strict';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_EVIDENCE_SCHEMA,
  LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_REVISION,
} from '../src/workspace/lafea-bucket-01-controlled-candidate-replay-proposal.js';
import {
  LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_INPUT_SCHEMA,
  evaluateLafeaBucket01CandidateReplayAdjudication,
  validateLafeaBucket01CandidateReplayAdjudicationEvidence,
} from '../src/workspace/lafea-bucket-01-candidate-replay-adjudication.js';

const exactHeadSha = 'a'.repeat(40);
const designHash = canonicalLafeaSha256({ design: 'V2' });
const proposal = proposalEvidence();
const reference = replay('UNIFORM_T6_REFERENCE', allPassChecks());
const candidate = replay('PROBE_STABLE_T6_CANDIDATE_REPLAY', allPassChecks());
const input = {
  schema: LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_INPUT_SCHEMA,
  exactHeadSha,
  designHash,
  proposalEvidence: proposal,
  referenceReplay: reference,
  candidateReplay: candidate,
};

const eligible = evaluateLafeaBucket01CandidateReplayAdjudication(input);
assert.equal(eligible.disposition, 'ELIGIBLE_FOR_PRODUCTION_SWITCH_REVIEW');
assert.equal(eligible.authority.candidateEligibleForProductionSwitchReview, true);
assert.equal(eligible.authority.productionSwitchAuthorized, false);
assert.equal(eligible.authority.productionMeshAuthority, false);
assert.equal(eligible.authority.qualificationAuthority, false);
assert.equal(eligible.authority.bucketQualified, false);
assert.equal(
  validateLafeaBucket01CandidateReplayAdjudicationEvidence(eligible).ok,
  true,
);

const stressBlocked = replay(
  'PROBE_STABLE_T6_CANDIDATE_REPLAY',
  { ...allPassChecks(), productionLugStress: 'BLOCKED' },
);
const diagnostic = evaluateLafeaBucket01CandidateReplayAdjudication({
  ...input,
  candidateReplay: stressBlocked,
});
assert.equal(diagnostic.disposition, 'RETAIN_CANDIDATE_FOR_DIAGNOSTIC_USE_ONLY');
assert.equal(diagnostic.authority.candidateEligibleForProductionSwitchReview, false);

const qualityBlocked = replay(
  'PROBE_STABLE_T6_CANDIDATE_REPLAY',
  { ...allPassChecks(), meshQuality: 'BLOCKED' },
);
const rejected = evaluateLafeaBucket01CandidateReplayAdjudication({
  ...input,
  candidateReplay: qualityBlocked,
});
assert.equal(rejected.disposition, 'REJECT_CANDIDATE_MESH_FAMILY');

const mismatched = clone(candidate);
mismatched.frozenInputHashes.loads = canonicalLafeaSha256({ changed: true });
rehash(mismatched);
assert.throws(
  () => evaluateLafeaBucket01CandidateReplayAdjudication({
    ...input,
    candidateReplay: mismatched,
  }),
  hasCode('LAFEA_B01_REPLAY_FROZEN_INPUT_HASH_MISMATCH'),
);

console.log('PASS LAFEA Bucket-01 candidate replay adjudication checks');

function proposalEvidence() {
  const base = {
    schema: LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_REVISION,
    exactHeadSha,
    designId: 'B01-PROBE-STABLE-POLAR-V2',
    designHash,
    candidateIntakeEvidenceHash: canonicalLafeaSha256({ intake: 1 }),
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
    requiredReplayOutputs: [
      'MESH_QUALITY_EVIDENCE',
      'SOLVER_AND_EQUILIBRIUM_EVIDENCE',
      'GLOBAL_RESPONSE_CONVERGENCE',
      'KIRSCH_FIXED_PROBE_EVIDENCE',
      'PRODUCTION_LUG_FIXED_LOCATION_AND_PATH_EVIDENCE',
      'PROBE_TOPOLOGY_AUDIT_EVIDENCE',
      'BUILD_IMPORT_PATCH_AND_WORKTREE_CHECKS',
    ],
    status: 'CONTROLLED_CANDIDATE_REPLAY_PROPOSAL_READY',
    reasons: [],
    authority: {
      candidateIntakeVerified: true,
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

function replay(routeId, checks) {
  const status = Object.values(checks).every((value) => value === 'PASS')
    ? 'PASS' : 'BLOCKED';
  const base = {
    schema: 'lafea-bucket-01-controlled-replay-result/v1',
    routeId,
    exactHeadSha,
    designHash,
    frozenInputHashes: frozenInputHashes(),
    checks,
    status,
    reasons: status === 'PASS' ? [] : ['REPLAY_CHECK_BLOCKED'],
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

function allPassChecks() {
  return {
    meshQuality: 'PASS',
    solverAndEquilibrium: 'PASS',
    globalResponseConvergence: 'PASS',
    kirschFixedProbes: 'PASS',
    productionLugStress: 'PASS',
    probeTopologyAudit: 'PASS',
    repositoryGate: 'PASS',
  };
}

function frozenInputHashes() {
  return {
    coordinates: canonicalLafeaSha256({ coordinates: 1 }),
    stressTolerances: canonicalLafeaSha256({ stressTolerances: 1 }),
    loads: canonicalLafeaSha256({ loads: 1 }),
    supports: canonicalLafeaSha256({ supports: 1 }),
    material: canonicalLafeaSha256({ material: 1 }),
    solverPolicy: canonicalLafeaSha256({ solverPolicy: 1 }),
    codeBasisBoundary: canonicalLafeaSha256({ codeBasisBoundary: 1 }),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function rehash(value) {
  delete value.semanticHash;
  value.semanticHash = canonicalLafeaSha256(value);
  return value;
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
function hasCode(code) {
  return (error) => error?.code === code;
}
