import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_EVIDENCE_SCHEMA,
  validateLafeaBucket01ProbeStableCandidateIntakeEvidence,
} from './lafea-bucket-01-probe-stable-candidate-intake.js';

export const LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_INPUT_SCHEMA =
  'lafea-bucket-01-controlled-candidate-replay-input/v1';
export const LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_EVIDENCE_SCHEMA =
  'lafea-bucket-01-controlled-candidate-replay-evidence/v1';
export const LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_REVISION =
  'B01-CANDIDATE-REPLAY-PROPOSAL.1';

const INPUT_KEYS = Object.freeze([
  'schema',
  'exactHeadSha',
  'designId',
  'designHash',
  'candidateIntakeEvidence',
  'referenceProductionRoute',
  'candidateReplayRoute',
  'rollbackRoute',
]);
const ROUTE_KEYS = Object.freeze([
  'routeId',
  'meshFamily',
  'entrypoint',
  'retained',
]);

export function evaluateLafeaBucket01ControlledCandidateReplayProposal(input) {
  exactKeys(input, INPUT_KEYS, 'controlled candidate replay input');
  if (input.schema !== LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_INPUT_SCHEMA) {
    throw proposalError('LAFEA_B01_CANDIDATE_REPLAY_INPUT_SCHEMA_INVALID');
  }
  const exactHeadSha = gitSha(input.exactHeadSha);
  const designId = requiredText(input.designId, 'designId');
  const designHash = sha256(input.designHash, 'designHash');
  const intake = input.candidateIntakeEvidence;
  if (!intake
    || intake.schema
      !== LAFEA_BUCKET_01_PROBE_STABLE_CANDIDATE_INTAKE_EVIDENCE_SCHEMA
    || validateLafeaBucket01ProbeStableCandidateIntakeEvidence(intake).ok
      !== true) {
    throw proposalError('LAFEA_B01_CANDIDATE_REPLAY_INTAKE_EVIDENCE_INVALID');
  }
  if (intake.exactHeadSha !== exactHeadSha
    || intake.designHash !== designHash
    || intake.status
      !== 'CANDIDATE_ACCEPTED_FOR_PHASE_2C_INTEGRATION_REVIEW') {
    throw proposalError('LAFEA_B01_CANDIDATE_REPLAY_CUSTODY_MISMATCH');
  }
  if (intake.authority?.productionSwitchAuthorized !== false
    || intake.authority?.productionSwitchApplied !== false
    || intake.authority?.productionMeshAuthority !== false
    || intake.authority?.stressAcceptanceAuthority !== false
    || intake.authority?.qualificationAuthority !== false
    || intake.authority?.bucketQualified !== false) {
    throw proposalError('LAFEA_B01_CANDIDATE_REPLAY_INTAKE_AUTHORITY_ESCALATED');
  }
  const referenceProductionRoute = validateRoute(
    input.referenceProductionRoute,
    'referenceProductionRoute',
    true,
  );
  const candidateReplayRoute = validateRoute(
    input.candidateReplayRoute,
    'candidateReplayRoute',
    false,
  );
  const rollbackRoute = validateRoute(
    input.rollbackRoute,
    'rollbackRoute',
    true,
  );
  if (referenceProductionRoute.routeId === candidateReplayRoute.routeId
    || rollbackRoute.routeId !== referenceProductionRoute.routeId
    || rollbackRoute.entrypoint !== referenceProductionRoute.entrypoint
    || rollbackRoute.meshFamily !== referenceProductionRoute.meshFamily) {
    throw proposalError('LAFEA_B01_CANDIDATE_REPLAY_ROLLBACK_INVALID');
  }
  const base = {
    schema: LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_REVISION,
    exactHeadSha,
    designId,
    designHash,
    candidateIntakeEvidenceHash: intake.semanticHash,
    referenceProductionRoute,
    candidateReplayRoute,
    rollbackRoute,
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

export function validateLafeaBucket01ControlledCandidateReplayEvidence(value) {
  try {
    if (!value
      || value.schema
        !== LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_EVIDENCE_SCHEMA
      || value.producerRevision
        !== LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_REVISION) {
      throw proposalError('LAFEA_B01_CANDIDATE_REPLAY_EVIDENCE_INVALID');
    }
    const basis = { ...value };
    delete basis.semanticHash;
    if (canonicalLafeaSha256(basis) !== value.semanticHash) {
      throw proposalError('LAFEA_B01_CANDIDATE_REPLAY_EVIDENCE_HASH_TAMPERED');
    }
    if (!isDeepFrozen(value)) {
      throw proposalError('LAFEA_B01_CANDIDATE_REPLAY_EVIDENCE_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_CANDIDATE_REPLAY_EVIDENCE_INVALID'],
    });
  }
}

function validateRoute(value, label, retained) {
  exactKeys(value, ROUTE_KEYS, label);
  const route = {
    routeId: requiredText(value.routeId, `${label}.routeId`),
    meshFamily: requiredText(value.meshFamily, `${label}.meshFamily`),
    entrypoint: requiredText(value.entrypoint, `${label}.entrypoint`),
    retained: value.retained,
  };
  if (route.retained !== retained) {
    throw proposalError('LAFEA_B01_CANDIDATE_REPLAY_ROUTE_RETENTION_INVALID');
  }
  return deepFreeze(route);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...expected].sort())) {
    throw proposalError('LAFEA_B01_CANDIDATE_REPLAY_EXACT_KEYS_INVALID', label);
  }
}

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw proposalError('LAFEA_B01_CANDIDATE_REPLAY_TEXT_REQUIRED', label);
  }
  return value;
}

function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw proposalError('LAFEA_B01_CANDIDATE_REPLAY_HEAD_INVALID');
  }
  return value;
}

function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw proposalError('LAFEA_B01_CANDIDATE_REPLAY_HASH_INVALID', label);
  }
  return value;
}

function proposalError(code, message = code) {
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
