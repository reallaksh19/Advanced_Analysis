import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_EVIDENCE_SCHEMA,
  validateLafeaBucket01ControlledCandidateReplayEvidence,
} from './lafea-bucket-01-controlled-candidate-replay-proposal.js';

export const LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_INPUT_SCHEMA =
  'lafea-bucket-01-candidate-replay-adjudication-input/v1';
export const LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_EVIDENCE_SCHEMA =
  'lafea-bucket-01-candidate-replay-adjudication-evidence/v1';
export const LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_REVISION =
  'B01-CANDIDATE-REPLAY-ADJUDICATION.1';

const INPUT_KEYS = Object.freeze([
  'schema',
  'exactHeadSha',
  'designHash',
  'proposalEvidence',
  'referenceReplay',
  'candidateReplay',
]);
const REPLAY_KEYS = Object.freeze([
  'schema',
  'routeId',
  'exactHeadSha',
  'designHash',
  'frozenInputHashes',
  'checks',
  'status',
  'reasons',
  'semanticHash',
]);
const FROZEN_HASH_KEYS = Object.freeze([
  'coordinates',
  'stressTolerances',
  'loads',
  'supports',
  'material',
  'solverPolicy',
  'codeBasisBoundary',
]);
const CHECK_KEYS = Object.freeze([
  'meshQuality',
  'solverAndEquilibrium',
  'globalResponseConvergence',
  'kirschFixedProbes',
  'productionLugStress',
  'probeTopologyAudit',
  'repositoryGate',
]);
const CHECK_STATUSES = Object.freeze(new Set(['PASS', 'BLOCKED']));
const HARD_REJECTION_CHECKS = Object.freeze([
  'meshQuality',
  'solverAndEquilibrium',
  'kirschFixedProbes',
  'probeTopologyAudit',
  'repositoryGate',
]);
const DIAGNOSTIC_ONLY_CHECKS = Object.freeze([
  'globalResponseConvergence',
  'productionLugStress',
]);

export function evaluateLafeaBucket01CandidateReplayAdjudication(input) {
  exactKeys(input, INPUT_KEYS, 'candidate replay adjudication input');
  if (input.schema
    !== LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_INPUT_SCHEMA) {
    throw adjudicationError('LAFEA_B01_REPLAY_ADJUDICATION_INPUT_SCHEMA_INVALID');
  }
  const exactHeadSha = gitSha(input.exactHeadSha);
  const designHash = sha256(input.designHash, 'designHash');
  const proposal = validateProposal(
    input.proposalEvidence,
    exactHeadSha,
    designHash,
  );
  const referenceReplay = validateReplay(
    input.referenceReplay,
    proposal.referenceProductionRoute.routeId,
    exactHeadSha,
    designHash,
    'reference replay',
  );
  const candidateReplay = validateReplay(
    input.candidateReplay,
    proposal.candidateReplayRoute.routeId,
    exactHeadSha,
    designHash,
    'candidate replay',
  );
  const frozenInputsMatch = FROZEN_HASH_KEYS.every((key) =>
    referenceReplay.frozenInputHashes[key]
      === candidateReplay.frozenInputHashes[key]);
  if (!frozenInputsMatch) {
    throw adjudicationError('LAFEA_B01_REPLAY_FROZEN_INPUT_HASH_MISMATCH');
  }

  const hardBlockingChecks = HARD_REJECTION_CHECKS.filter(
    (key) => candidateReplay.checks[key] !== 'PASS',
  );
  const diagnosticBlockingChecks = DIAGNOSTIC_ONLY_CHECKS.filter(
    (key) => candidateReplay.checks[key] !== 'PASS',
  );
  let disposition;
  if (hardBlockingChecks.length > 0
    || candidateReplay.status !== 'PASS'
      && candidateReplay.status !== 'BLOCKED') {
    disposition = 'REJECT_CANDIDATE_MESH_FAMILY';
  } else if (diagnosticBlockingChecks.length > 0
    || candidateReplay.status !== 'PASS') {
    disposition = 'RETAIN_CANDIDATE_FOR_DIAGNOSTIC_USE_ONLY';
  } else {
    disposition = 'ELIGIBLE_FOR_PRODUCTION_SWITCH_REVIEW';
  }

  const base = {
    schema: LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_REVISION,
    exactHeadSha,
    designHash,
    proposalEvidenceHash: proposal.semanticHash,
    referenceReplayHash: referenceReplay.semanticHash,
    candidateReplayHash: candidateReplay.semanticHash,
    frozenInputsMatch,
    hardBlockingChecks,
    diagnosticBlockingChecks,
    disposition,
    reasons: [
      ...hardBlockingChecks.map((key) => `HARD_BLOCK:${key}`),
      ...diagnosticBlockingChecks.map((key) => `DIAGNOSTIC_BLOCK:${key}`),
    ],
    authority: {
      comparisonExecuted: true,
      frozenInputsVerified: true,
      candidateEligibleForProductionSwitchReview:
        disposition === 'ELIGIBLE_FOR_PRODUCTION_SWITCH_REVIEW',
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

export function validateLafeaBucket01CandidateReplayAdjudicationEvidence(value) {
  try {
    if (!value
      || value.schema
        !== LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_EVIDENCE_SCHEMA
      || value.producerRevision
        !== LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_REVISION) {
      throw adjudicationError('LAFEA_B01_REPLAY_ADJUDICATION_EVIDENCE_INVALID');
    }
    const basis = { ...value };
    delete basis.semanticHash;
    if (canonicalLafeaSha256(basis) !== value.semanticHash) {
      throw adjudicationError('LAFEA_B01_REPLAY_ADJUDICATION_HASH_TAMPERED');
    }
    if (!isDeepFrozen(value)) {
      throw adjudicationError('LAFEA_B01_REPLAY_ADJUDICATION_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_REPLAY_ADJUDICATION_INVALID'],
    });
  }
}

function validateProposal(value, exactHeadSha, designHash) {
  if (!value
    || value.schema
      !== LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_EVIDENCE_SCHEMA
    || validateLafeaBucket01ControlledCandidateReplayEvidence(value).ok
      !== true) {
    throw adjudicationError('LAFEA_B01_REPLAY_PROPOSAL_INVALID');
  }
  if (value.exactHeadSha !== exactHeadSha
    || value.designHash !== designHash
    || value.status !== 'CONTROLLED_CANDIDATE_REPLAY_PROPOSAL_READY'
    || value.authority?.productionSwitchAuthorized !== false
    || value.authority?.productionSwitchApplied !== false
    || value.authority?.productionMeshAuthority !== false
    || value.authority?.qualificationAuthority !== false
    || value.authority?.bucketQualified !== false) {
    throw adjudicationError('LAFEA_B01_REPLAY_PROPOSAL_CUSTODY_OR_AUTHORITY_INVALID');
  }
  return value;
}

function validateReplay(value, expectedRouteId, exactHeadSha, designHash, label) {
  exactKeys(value, REPLAY_KEYS, label);
  if (value.schema !== 'lafea-bucket-01-controlled-replay-result/v1'
    || value.routeId !== expectedRouteId
    || value.exactHeadSha !== exactHeadSha
    || value.designHash !== designHash) {
    throw adjudicationError('LAFEA_B01_REPLAY_RESULT_CUSTODY_INVALID', label);
  }
  exactKeys(value.frozenInputHashes, FROZEN_HASH_KEYS, `${label} hashes`);
  for (const key of FROZEN_HASH_KEYS) {
    sha256(value.frozenInputHashes[key], `${label}.${key}`);
  }
  exactKeys(value.checks, CHECK_KEYS, `${label} checks`);
  for (const key of CHECK_KEYS) {
    if (!CHECK_STATUSES.has(value.checks[key])) {
      throw adjudicationError('LAFEA_B01_REPLAY_CHECK_STATUS_INVALID', key);
    }
  }
  if (!['PASS', 'BLOCKED'].includes(value.status)
    || !Array.isArray(value.reasons)) {
    throw adjudicationError('LAFEA_B01_REPLAY_RESULT_STATUS_INVALID', label);
  }
  const expectedStatus = CHECK_KEYS.every((key) => value.checks[key] === 'PASS')
    ? 'PASS' : 'BLOCKED';
  if (value.status !== expectedStatus
    || (value.status === 'PASS' && value.reasons.length !== 0)) {
    throw adjudicationError('LAFEA_B01_REPLAY_RESULT_STATUS_INCONSISTENT', label);
  }
  verifySemanticHash(value, 'LAFEA_B01_REPLAY_RESULT_HASH_TAMPERED');
  return value;
}

function verifySemanticHash(value, code) {
  const basis = { ...value };
  delete basis.semanticHash;
  if (canonicalLafeaSha256(basis) !== value.semanticHash) {
    throw adjudicationError(code);
  }
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...expected].sort())) {
    throw adjudicationError('LAFEA_B01_REPLAY_ADJUDICATION_EXACT_KEYS_INVALID', label);
  }
}

function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw adjudicationError('LAFEA_B01_REPLAY_ADJUDICATION_HEAD_INVALID');
  }
  return value;
}

function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw adjudicationError('LAFEA_B01_REPLAY_ADJUDICATION_HASH_INVALID', label);
  }
  return value;
}

function adjudicationError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}
