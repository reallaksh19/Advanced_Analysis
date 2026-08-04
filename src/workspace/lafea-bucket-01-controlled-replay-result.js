import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_RECEIPT_SCHEMA,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_ID,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_REVISION,
  LAFEA_BUCKET_01_REPLAY_CHECK_KEYS,
} from './lafea-bucket-01-replay-artifact-policy.js';
import {
  assertRegisteredLafeaBucket01ReplayArtifacts,
  isLafeaBucket01ControlledReplayResultRuntimeVerified,
  markLafeaBucket01ControlledReplayResultRuntimeVerified,
  registerLafeaBucket01ReplayArtifactReceiptInternal,
} from './lafea-bucket-01-controlled-replay-runtime.js';
import {
  deepFreeze,
  deriveChecks,
  exactKeys,
  gitSha,
  isDeepFrozen,
  replayError,
  requireNull,
  sha256,
  text,
  validateArtifactAncestry,
  validateArtifacts,
  validateCharacteristicH,
  validateExecutionEnvironment,
  validateFrozenInputHashes,
} from './lafea-bucket-01-controlled-replay-validation.js';

export const LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_INPUT_SCHEMA =
  'lafea-bucket-01-controlled-replay-result-input/v2';
export const LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_SCHEMA =
  'lafea-bucket-01-controlled-replay-result/v3';
export {
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_RECEIPT_SCHEMA,
};
export const LAFEA_BUCKET_01_CHARACTERISTIC_H_SCHEMA =
  'lafea-bucket-01-characteristic-h-evidence/v1';
export const LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_REVISION =
  'B01-CONTROLLED-REPLAY-RESULT.3';

const INPUT_KEYS = Object.freeze([
  'schema', 'routeId', 'routeKind', 'exactHeadSha', 'designHash',
  'codeRevisionHash', 'candidatePackageHash', 'candidateIntakeEvidenceHash',
  'independentCheckerEvidenceHash', 'frozenInputHashes', 'characteristicH',
  'executionEnvironment', 'artifacts',
]);
const ROUTE_KINDS = Object.freeze(new Set(['REFERENCE', 'CANDIDATE']));

export { registerLafeaBucket01ReplayArtifactReceiptInternal };

export function createLafeaBucket01ControlledReplayResult(input) {
  exactKeys(input, INPUT_KEYS, 'controlled replay result input');
  if (input.schema !== LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_INPUT_SCHEMA) {
    throw replayError('LAFEA_B01_REPLAY_RESULT_INPUT_SCHEMA_INVALID');
  }
  assertRegisteredLafeaBucket01ReplayArtifacts(input.artifacts);
  const routeId = text(input.routeId, 'routeId');
  const routeKind = text(input.routeKind, 'routeKind');
  if (!ROUTE_KINDS.has(routeKind)) {
    throw replayError('LAFEA_B01_REPLAY_ROUTE_KIND_INVALID');
  }
  const exactHeadSha = gitSha(input.exactHeadSha);
  const designHash = sha256(input.designHash, 'designHash');
  const codeRevisionHash = sha256(input.codeRevisionHash, 'codeRevisionHash');
  const candidatePackageHash = sha256(
    input.candidatePackageHash,
    'candidatePackageHash',
  );
  const candidateIntakeEvidenceHash = sha256(
    input.candidateIntakeEvidenceHash,
    'candidateIntakeEvidenceHash',
  );
  const independentCheckerEvidenceHash = routeKind === 'CANDIDATE'
    ? sha256(
      input.independentCheckerEvidenceHash,
      'independentCheckerEvidenceHash',
    )
    : requireNull(
      input.independentCheckerEvidenceHash,
      'reference independentCheckerEvidenceHash',
    );
  const frozenInputHashes = validateFrozenInputHashes(input.frozenInputHashes);
  const characteristicH = validateCharacteristicH(input.characteristicH);
  const executionEnvironment = validateExecutionEnvironment(
    input.executionEnvironment,
  );
  const artifacts = validateArtifacts({
    artifacts: input.artifacts,
    routeId,
    routeKind,
    exactHeadSha,
    designHash,
    candidatePackageHash,
    candidateIntakeEvidenceHash,
    independentCheckerEvidenceHash,
  });
  validateArtifactAncestry(artifacts, routeKind);
  const checks = deriveChecks(artifacts);
  const status = LAFEA_BUCKET_01_REPLAY_CHECK_KEYS.every(
    (key) => checks[key] === 'PASS',
  ) ? 'PASS' : 'BLOCKED';
  const reasons = status === 'PASS' ? [] : artifacts
    .filter((artifact) => artifact.validationStatus === 'BLOCKED')
    .flatMap((artifact) => artifact.validationReasons.length > 0
      ? artifact.validationReasons.map((reason) =>
        `${artifact.derivedCheck}:${artifact.artifactId}:${reason}`)
      : [`${artifact.derivedCheck}:${artifact.artifactId}:BLOCKED`]);
  const artifactManifestHash = canonicalLafeaSha256({
    schema: 'lafea-bucket-01-replay-artifact-manifest/v2',
    registryId: LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_ID,
    registryRevision: LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_REVISION,
    routeId,
    routeKind,
    exactHeadSha,
    designHash,
    artifacts,
  });
  const base = {
    schema: LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_REVISION,
    routeId,
    routeKind,
    exactHeadSha,
    designHash,
    codeRevisionHash,
    candidatePackageHash,
    candidateIntakeEvidenceHash,
    independentCheckerEvidenceHash,
    frozenInputHashes,
    characteristicH,
    executionEnvironment,
    artifactRegistry: {
      registryId: LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_ID,
      registryRevision: LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_REVISION,
      registeredArtifactCount: artifacts.length,
      registeredArtifactValidatorsExecuted: true,
      validationStatusesDerivedFromPayloads: true,
    },
    artifacts,
    artifactManifestHash,
    checks,
    status,
    reasons,
    authority: {
      artifactCustodyValidated: true,
      registeredArtifactValidatorsExecuted: true,
      statusesDerivedFromValidatedPayloads: true,
      statusesDerivedFromArtifacts: true,
      frozenInputsBound: true,
      characteristicHRetained: true,
      independentCheckerExecution: routeKind === 'CANDIDATE',
      productionSwitchAuthorized: false,
      productionSwitchApplied: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
  const result = deepFreeze({
    ...base,
    semanticHash: canonicalLafeaSha256(base),
  });
  return markLafeaBucket01ControlledReplayResultRuntimeVerified(result);
}

export function validateLafeaBucket01ControlledReplayResult(value) {
  try {
    if (!value
      || value.schema !== LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_SCHEMA
      || value.producerRevision
        !== LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_REVISION) {
      throw replayError('LAFEA_B01_REPLAY_RESULT_SCHEMA_INVALID');
    }
    if (!isLafeaBucket01ControlledReplayResultRuntimeVerified(value)) {
      throw replayError('LAFEA_B01_REPLAY_RESULT_NOT_RUNTIME_REVALIDATED');
    }
    const basis = { ...value };
    delete basis.semanticHash;
    if (canonicalLafeaSha256(basis) !== value.semanticHash) {
      throw replayError('LAFEA_B01_REPLAY_RESULT_HASH_TAMPERED');
    }
    if (value.artifactRegistry?.registeredArtifactValidatorsExecuted !== true
      || value.artifactRegistry?.validationStatusesDerivedFromPayloads !== true
      || value.authority?.registeredArtifactValidatorsExecuted !== true
      || value.authority?.statusesDerivedFromValidatedPayloads !== true
      || value.authority?.productionSwitchAuthorized !== false
      || value.authority?.productionSwitchApplied !== false
      || value.authority?.productionMeshAuthority !== false
      || value.authority?.stressAcceptanceAuthority !== false
      || value.authority?.qualificationAuthority !== false
      || value.authority?.bucketQualified !== false) {
      throw replayError('LAFEA_B01_REPLAY_RESULT_AUTHORITY_INVALID');
    }
    if (!isDeepFrozen(value)) {
      throw replayError('LAFEA_B01_REPLAY_RESULT_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_REPLAY_RESULT_INVALID'],
    });
  }
}
