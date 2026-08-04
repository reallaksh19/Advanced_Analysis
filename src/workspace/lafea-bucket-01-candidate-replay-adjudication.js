import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_CONTROLLED_CANDIDATE_REPLAY_EVIDENCE_SCHEMA,
  validateLafeaBucket01ControlledCandidateReplayEvidence,
} from './lafea-bucket-01-controlled-candidate-replay-proposal.js';
import {
  LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_SCHEMA,
  validateLafeaBucket01ControlledReplayResult,
} from './lafea-bucket-01-controlled-replay-result.js';
import {
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_ID,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_REVISION,
} from './lafea-bucket-01-replay-artifact-policy.js';

export const LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_INPUT_SCHEMA =
  'lafea-bucket-01-candidate-replay-adjudication-input/v3';
export const LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_EVIDENCE_SCHEMA =
  'lafea-bucket-01-candidate-replay-adjudication-evidence/v3';
export const LAFEA_BUCKET_01_CANDIDATE_REPLAY_ADJUDICATION_REVISION =
  'B01-CANDIDATE-REPLAY-ADJUDICATION.3';

const INPUT_KEYS = Object.freeze([
  'schema', 'exactHeadSha', 'designHash', 'proposalEvidence',
  'referenceReplay', 'candidateReplay',
]);
const HARD_REJECTION_CHECKS = Object.freeze([
  'meshQuality', 'solverAndEquilibrium', 'kirschFixedProbes',
  'probeTopologyAudit', 'repositoryGate',
]);
const DIAGNOSTIC_ONLY_CHECKS = Object.freeze([
  'globalResponseConvergence', 'productionLugStress',
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
    'REFERENCE',
    exactHeadSha,
    designHash,
    'reference replay',
  );
  const candidateReplay = validateReplay(
    input.candidateReplay,
    proposal.candidateReplayRoute.routeId,
    'CANDIDATE',
    exactHeadSha,
    designHash,
    'candidate replay',
  );
  if (referenceReplay.status !== 'PASS') {
    throw adjudicationError('LAFEA_B01_REFERENCE_REPLAY_NOT_PASS');
  }
  if (referenceReplay.codeRevisionHash !== candidateReplay.codeRevisionHash) {
    throw adjudicationError('LAFEA_B01_REPLAY_CODE_REVISION_MISMATCH');
  }
  if (referenceReplay.candidatePackageHash !== proposal.candidatePackageHash
    || candidateReplay.candidatePackageHash !== proposal.candidatePackageHash
    || referenceReplay.candidateIntakeEvidenceHash
      !== proposal.candidateIntakeEvidenceHash
    || candidateReplay.candidateIntakeEvidenceHash
      !== proposal.candidateIntakeEvidenceHash) {
    throw adjudicationError('LAFEA_B01_REPLAY_CANDIDATE_CUSTODY_MISMATCH');
  }
  if (candidateReplay.authority?.independentCheckerExecution !== true
    || candidateReplay.independentCheckerEvidenceHash === null) {
    throw adjudicationError('LAFEA_B01_REPLAY_INDEPENDENT_CHECKER_REQUIRED');
  }
  const frozenInputKeys = proposal.requiredFrozenInputHashes;
  const frozenInputsMatch = frozenInputKeys.every((key) =>
    referenceReplay.frozenInputHashes[key]
      === candidateReplay.frozenInputHashes[key]);
  if (!frozenInputsMatch) {
    throw adjudicationError('LAFEA_B01_REPLAY_FROZEN_INPUT_HASH_MISMATCH');
  }
  const environmentKeys = [
    'packageLockHash', 'nodeVersion', 'npmVersion', 'platform', 'architecture',
    'allowlistedEnvironmentHash',
  ];
  const executionEnvironmentCompatible = environmentKeys.every((key) =>
    referenceReplay.executionEnvironment[key]
      === candidateReplay.executionEnvironment[key]);
  if (!executionEnvironmentCompatible) {
    throw adjudicationError('LAFEA_B01_REPLAY_EXECUTION_ENVIRONMENT_MISMATCH');
  }
  if (referenceReplay.executionEnvironment.isolatedOutputNamespace
    === candidateReplay.executionEnvironment.isolatedOutputNamespace) {
    throw adjudicationError('LAFEA_B01_REPLAY_OUTPUT_NAMESPACE_NOT_ISOLATED');
  }

  const hardBlockingChecks = HARD_REJECTION_CHECKS.filter(
    (key) => candidateReplay.checks[key] !== 'PASS',
  );
  const diagnosticBlockingChecks = DIAGNOSTIC_ONLY_CHECKS.filter(
    (key) => candidateReplay.checks[key] !== 'PASS',
  );
  let disposition;
  if (hardBlockingChecks.length > 0) {
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
    codeRevisionHash: candidateReplay.codeRevisionHash,
    proposalEvidenceHash: proposal.semanticHash,
    candidatePackageHash: proposal.candidatePackageHash,
    candidateIntakeEvidenceHash: proposal.candidateIntakeEvidenceHash,
    independentCheckerEvidenceHash:
      candidateReplay.independentCheckerEvidenceHash,
    referenceReplayHash: referenceReplay.semanticHash,
    candidateReplayHash: candidateReplay.semanticHash,
    referenceArtifactManifestHash: referenceReplay.artifactManifestHash,
    candidateArtifactManifestHash: candidateReplay.artifactManifestHash,
    artifactRegistryId: LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_ID,
    artifactRegistryRevision:
      LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_REVISION,
    frozenInputsMatch,
    executionEnvironmentCompatible,
    isolatedOutputNamespacesVerified: true,
    statusesDerivedFromValidatedPayloads: true,
    statusesDerivedFromArtifacts: true,
    hardBlockingChecks,
    diagnosticBlockingChecks,
    disposition,
    reasons: [
      ...hardBlockingChecks.map((key) => `HARD_BLOCK:${key}`),
      ...diagnosticBlockingChecks.map((key) => `DIAGNOSTIC_BLOCK:${key}`),
    ],
    authority: {
      comparisonExecuted: true,
      artifactCustodyCompared: true,
      registeredArtifactValidatorsExecuted: true,
      statusesDerivedFromValidatedPayloads: true,
      frozenInputsVerified: true,
      codeRevisionParityVerified: true,
      independentCheckerVerified: true,
      executionIsolationVerified: true,
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
    if (value.statusesDerivedFromValidatedPayloads !== true
      || value.statusesDerivedFromArtifacts !== true
      || value.authority?.artifactCustodyCompared !== true
      || value.authority?.registeredArtifactValidatorsExecuted !== true
      || value.authority?.statusesDerivedFromValidatedPayloads !== true
      || value.authority?.independentCheckerVerified !== true
      || value.authority?.productionSwitchAuthorized !== false
      || value.authority?.productionSwitchApplied !== false
      || value.authority?.productionMeshAuthority !== false
      || value.authority?.stressAcceptanceAuthority !== false
      || value.authority?.qualificationAuthority !== false
      || value.authority?.bucketQualified !== false) {
      throw adjudicationError('LAFEA_B01_REPLAY_ADJUDICATION_AUTHORITY_INVALID');
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
    || value.designId !== 'B01-PROBE-STABLE-POLAR-V3'
    || value.status !== 'CONTROLLED_CANDIDATE_REPLAY_PROPOSAL_READY'
    || value.authority?.artifactDerivedStatusesRequired !== true
    || value.authority?.independentCheckerRequiredBeforeAdjudication !== true
    || value.authority?.productionSwitchAuthorized !== false
    || value.authority?.productionSwitchApplied !== false
    || value.authority?.productionMeshAuthority !== false
    || value.authority?.qualificationAuthority !== false
    || value.authority?.bucketQualified !== false) {
    throw adjudicationError(
      'LAFEA_B01_REPLAY_PROPOSAL_CUSTODY_OR_AUTHORITY_INVALID',
    );
  }
  return value;
}

function validateReplay(value, expectedRouteId, expectedRouteKind,
  exactHeadSha, designHash, label) {
  if (!value
    || value.schema !== LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_SCHEMA
    || validateLafeaBucket01ControlledReplayResult(value).ok !== true) {
    throw adjudicationError('LAFEA_B01_REPLAY_RESULT_INVALID', label);
  }
  if (value.routeId !== expectedRouteId
    || value.routeKind !== expectedRouteKind
    || value.exactHeadSha !== exactHeadSha
    || value.designHash !== designHash
    || value.artifactRegistry?.registryId
      !== LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_ID
    || value.artifactRegistry?.registryRevision
      !== LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_REVISION
    || value.artifactRegistry?.registeredArtifactValidatorsExecuted !== true
    || value.artifactRegistry?.validationStatusesDerivedFromPayloads !== true
    || value.authority?.artifactCustodyValidated !== true
    || value.authority?.registeredArtifactValidatorsExecuted !== true
    || value.authority?.statusesDerivedFromValidatedPayloads !== true
    || value.authority?.statusesDerivedFromArtifacts !== true
    || value.authority?.productionSwitchAuthorized !== false
    || value.authority?.productionMeshAuthority !== false
    || value.authority?.qualificationAuthority !== false
    || value.authority?.bucketQualified !== false) {
    throw adjudicationError('LAFEA_B01_REPLAY_RESULT_CUSTODY_INVALID', label);
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...expected].sort())) {
    throw adjudicationError(
      'LAFEA_B01_REPLAY_ADJUDICATION_EXACT_KEYS_INVALID',
      label,
    );
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
