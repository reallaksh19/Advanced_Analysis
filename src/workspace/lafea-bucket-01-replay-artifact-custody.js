import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_ARTIFACT_MANIFEST_SCHEMA,
} from './lafea-bucket-01-independent-candidate-verification.js';
import {
  CHECK_ROLE_MAP,
  INPUT_KEYS,
  LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_SCHEMA,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_EVIDENCE_SCHEMA,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_INPUT_SCHEMA,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_REVISION,
  REQUIRED_ROLES,
  assertCustodyAuthority,
  classifyArtifact,
  custodyAuthority,
  custodyError,
  deepFreeze,
  deriveFrozenInputHashes,
  exactKeys,
  gitSha,
  isDeepFrozen,
  sha256,
  text,
  validateArtifact,
  validateStageMappingAncestry,
  validateTypedManifestEntries,
  verifyFullHash,
} from './lafea-bucket-01-replay-artifact-custody-internal.js';

export {
  LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_SCHEMA,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_EVIDENCE_SCHEMA,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_INPUT_SCHEMA,
  LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_REVISION,
};

export function deriveLafeaBucket01ControlledReplayFromArtifacts(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'replay artifact custody input');
  if (inputValue.schema !== LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_INPUT_SCHEMA) {
    throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_INPUT_SCHEMA_INVALID');
  }
  const routeId = text(inputValue.routeId, 'routeId');
  const exactHeadSha = gitSha(inputValue.exactHeadSha, 'exactHeadSha');
  const designId = text(inputValue.designId, 'designId');
  const designHash = sha256(inputValue.designHash, 'designHash');
  const candidateArtifactHeadSha = gitSha(
    inputValue.candidateArtifactHeadSha,
    'candidateArtifactHeadSha',
  );
  const mergeBaseSha = gitSha(inputValue.mergeBaseSha, 'mergeBaseSha');
  if (inputValue.candidateArtifactHeadIsAncestor !== true
    || mergeBaseSha !== candidateArtifactHeadSha) {
    throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_ANCESTRY_INVALID');
  }
  if (!Array.isArray(inputValue.artifacts)
    || inputValue.artifacts.length !== REQUIRED_ROLES.length) {
    throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_COUNT_INVALID');
  }
  const artifacts = inputValue.artifacts.map(validateArtifact);
  if (new Set(artifacts.map((row) => row.role)).size !== REQUIRED_ROLES.length
    || REQUIRED_ROLES.some((role) => !artifacts.some((row) => row.role === role))) {
    throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_ROLE_SET_INVALID');
  }
  const byRole = new Map(artifacts.map((row) => [row.role, row]));
  for (const artifact of artifacts) {
    if (artifact.exactHeadSha !== exactHeadSha
      || artifact.designHash !== designHash
      || artifact.routeId !== routeId) {
      throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_HEAD_DESIGN_OR_ROUTE_STALE');
    }
  }
  validateStageMappingAncestry(
    byRole.get('STAGE_DOCUMENT_AND_MAPPING_ANCESTRY'),
    byRole.get('SOLVER_AND_EQUILIBRIUM_EVIDENCE'),
    exactHeadSha,
    designHash,
  );
  const frozenInputHashes = deriveFrozenInputHashes(
    byRole.get('FROZEN_INPUT_DEFINITION').payload,
    exactHeadSha,
    designHash,
  );
  const checks = Object.fromEntries(Object.entries(CHECK_ROLE_MAP).map(
    ([checkId, role]) => [checkId, classifyArtifact(role, byRole.get(role).payload)],
  ));
  const status = Object.values(checks).every((row) => row === 'PASS')
    ? 'PASS' : 'BLOCKED';
  const reasons = Object.entries(checks)
    .filter(([, value]) => value !== 'PASS')
    .map(([key]) => `ARTIFACT_BLOCKED:${key}`);
  const manifestEntries = artifacts.map((artifact) => deepFreeze({
    artifactId: artifact.artifactId,
    artifactScope: artifact.artifactScope,
    schema: artifact.payload.schema ?? null,
    producerRevision: artifact.payload.producerRevision ?? null,
    routeId: artifact.routeId,
    levelOrdinal: artifact.levelOrdinal,
    exactHeadSha: artifact.exactHeadSha,
    designHash: artifact.designHash,
    parentArtifactHashes: artifact.parentArtifactHashes,
    semanticHash: canonicalLafeaSha256(artifact.payload),
    rawFileHash: artifact.computedRawFileHash,
    relativePath: artifact.relativePath,
    validationStatus: ['FROZEN_INPUT_DEFINITION', 'STAGE_DOCUMENT_AND_MAPPING_ANCESTRY']
      .includes(artifact.role)
      ? 'PASS' : classifyArtifact(artifact.role, artifact.payload),
  }));
  const manifestBase = {
    schema: LAFEA_BUCKET_01_ARTIFACT_MANIFEST_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_REVISION,
    exactHeadSha,
    designId,
    designHash,
    ancestry: {
      candidateArtifactHeadSha,
      verificationHeadSha: exactHeadSha,
      mergeBaseSha,
      candidateArtifactHeadIsAncestor: true,
    },
    artifacts: manifestEntries,
    status,
    reasons,
    authority: custodyAuthority(),
  };
  const artifactManifest = deepFreeze({
    ...manifestBase,
    semanticHash: canonicalLafeaSha256(manifestBase),
  });
  const replayBase = {
    schema: LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_SCHEMA,
    routeId,
    exactHeadSha,
    designHash,
    frozenInputHashes,
    checks,
    status,
    reasons,
  };
  const replayResult = deepFreeze({
    ...replayBase,
    semanticHash: canonicalLafeaSha256(replayBase),
  });
  const custodyBase = {
    schema: LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_REVISION,
    routeId,
    exactHeadSha,
    designId,
    designHash,
    artifactManifestHash: artifactManifest.semanticHash,
    replayResultHash: replayResult.semanticHash,
    derivedChecks: checks,
    derivedStatus: status,
    reasons,
    authority: custodyAuthority(),
  };
  const custodyEvidence = deepFreeze({
    ...custodyBase,
    semanticHash: canonicalLafeaSha256(custodyBase),
  });
  return deepFreeze({ artifactManifest, replayResult, custodyEvidence });
}

export function validateLafeaBucket01ReplayArtifactCustody(
  artifactManifest,
  replayResult,
  custodyEvidence,
) {
  try {
    if (!artifactManifest
      || artifactManifest.schema !== LAFEA_BUCKET_01_ARTIFACT_MANIFEST_SCHEMA
      || artifactManifest.producerRevision
        !== LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_REVISION
      || !replayResult
      || replayResult.schema !== LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_SCHEMA
      || !custodyEvidence
      || custodyEvidence.schema
        !== LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_EVIDENCE_SCHEMA
      || custodyEvidence.producerRevision
        !== LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_REVISION) {
      throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_EVIDENCE_SCHEMA_INVALID');
    }
    verifyFullHash(artifactManifest, 'LAFEA_B01_REPLAY_ARTIFACT_MANIFEST_TAMPERED');
    verifyFullHash(replayResult, 'LAFEA_B01_REPLAY_ARTIFACT_RESULT_TAMPERED');
    verifyFullHash(custodyEvidence, 'LAFEA_B01_REPLAY_ARTIFACT_CUSTODY_TAMPERED');
    if (custodyEvidence.artifactManifestHash !== artifactManifest.semanticHash
      || custodyEvidence.replayResultHash !== replayResult.semanticHash
      || custodyEvidence.exactHeadSha !== replayResult.exactHeadSha
      || custodyEvidence.designHash !== replayResult.designHash
      || custodyEvidence.derivedStatus !== replayResult.status
      || JSON.stringify(custodyEvidence.derivedChecks)
        !== JSON.stringify(replayResult.checks)) {
      throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_EVIDENCE_MISMATCH');
    }
    validateTypedManifestEntries(artifactManifest.artifacts);
    assertCustodyAuthority(artifactManifest.authority);
    assertCustodyAuthority(custodyEvidence.authority);
    if (!isDeepFrozen(artifactManifest)
      || !isDeepFrozen(replayResult)
      || !isDeepFrozen(custodyEvidence)) {
      throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_EVIDENCE_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_REPLAY_ARTIFACT_EVIDENCE_INVALID'],
    });
  }
}
