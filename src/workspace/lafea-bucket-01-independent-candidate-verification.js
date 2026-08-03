import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  EXPECTED_LEVELS,
  INPUT_KEYS,
  LAFEA_BUCKET_01_ARTIFACT_MANIFEST_SCHEMA,
  LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_EVIDENCE_SCHEMA,
  LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_INPUT_SCHEMA,
  LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_REVISION,
  NATURAL_MARGIN_TARGET,
  assertIndependentAuthority,
  deepFreeze,
  exactKeys,
  fullSemanticHash,
  gitSha,
  independentAuthority,
  isDeepFrozen,
  manifestEntry,
  validateTypedManifestEntries,
  verificationError,
  verifyFullSemanticHash,
} from './lafea-bucket-01-independent-candidate-verification-internal.js';
import {
  recomputeLevelEvidence,
  recomputeLocationHistories,
  recomputeQuality,
} from './lafea-bucket-01-independent-candidate-verification-recompute.js';
import {
  validateArtifactEnvelope,
  validateCandidateIntakeEvidence,
  validateCandidateIntakeLevels,
  validateDesign,
  validatePackageCustody,
  validateProbeSpec,
  validateProductionSpec,
  validateSuppliedArtifactManifest,
} from './lafea-bucket-01-independent-candidate-verification-validation.js';

export {
  LAFEA_BUCKET_01_ARTIFACT_MANIFEST_SCHEMA,
  LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_EVIDENCE_SCHEMA,
  LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_INPUT_SCHEMA,
  LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_REVISION,
};

export function evaluateLafeaBucket01IndependentCandidateVerification(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'independent candidate verification input');
  if (inputValue.schema !== LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_INPUT_SCHEMA) {
    throw verificationError('LAFEA_B01_INDEPENDENT_INPUT_SCHEMA_INVALID');
  }
  const verificationHeadSha = gitSha(inputValue.verificationHeadSha, 'verificationHeadSha');
  const candidateArtifactHeadSha = gitSha(
    inputValue.candidateArtifactHeadSha,
    'candidateArtifactHeadSha',
  );
  const mergeBaseSha = gitSha(inputValue.mergeBaseSha, 'mergeBaseSha');
  if (inputValue.candidateArtifactHeadIsAncestor !== true
    || mergeBaseSha !== candidateArtifactHeadSha) {
    throw verificationError('LAFEA_B01_INDEPENDENT_ANCESTRY_INVALID');
  }

  const replayArtifactManifestArtifact = validateArtifactEnvelope(
    inputValue.replayArtifactManifestArtifact,
    'REPLAY_ARTIFACT_MANIFEST',
    'REPOSITORY_REGRESSION',
  );
  const candidateIntakeEvidenceArtifact = validateArtifactEnvelope(
    inputValue.candidateIntakeEvidenceArtifact,
    'CANDIDATE_INTAKE_EVIDENCE',
    'CANDIDATE_MESH_BOUND',
  );
  const designArtifact = validateArtifactEnvelope(
    inputValue.designArtifact,
    'DESIGN',
    'CANDIDATE_MESH_BOUND',
  );
  const probeSpecArtifact = validateArtifactEnvelope(
    inputValue.probeSpecArtifact,
    'FROZEN_PROBE_SPEC',
    'CANDIDATE_MESH_BOUND',
  );
  const productionResponseSpecArtifact = validateArtifactEnvelope(
    inputValue.productionResponseSpecArtifact,
    'PRODUCTION_RESPONSE_SPEC',
    'CANDIDATE_MESH_BOUND',
  );
  if (!Array.isArray(inputValue.levelArtifacts)
    || inputValue.levelArtifacts.length !== EXPECTED_LEVELS.length) {
    throw verificationError('LAFEA_B01_INDEPENDENT_LEVEL_ARTIFACT_COUNT_INVALID');
  }
  const levelArtifacts = inputValue.levelArtifacts.map((artifact, index) =>
    validateArtifactEnvelope(
      artifact,
      `CANDIDATE_LEVEL_${index + 1}`,
      'CANDIDATE_MESH_BOUND',
    ));

  const design = designArtifact.payload;
  const probeSpec = probeSpecArtifact.payload;
  const productionSpec = productionResponseSpecArtifact.payload;
  validateDesign(design);
  validateProbeSpec(probeSpec, design);
  validateProductionSpec(productionSpec, design);
  const designHash = canonicalLafeaSha256(design);
  const boundArtifacts = [
    candidateIntakeEvidenceArtifact,
    designArtifact,
    probeSpecArtifact,
    productionResponseSpecArtifact,
    ...levelArtifacts,
  ];
  for (const artifact of [replayArtifactManifestArtifact, ...boundArtifacts]) {
    if (artifact.exactHeadSha !== candidateArtifactHeadSha
      || artifact.designHash !== designHash) {
      throw verificationError('LAFEA_B01_INDEPENDENT_ARTIFACT_HEAD_OR_DESIGN_STALE');
    }
  }
  validateSuppliedArtifactManifest({
    value: replayArtifactManifestArtifact.payload,
    candidateArtifactHeadSha,
    designHash,
    artifacts: boundArtifacts,
  });
  validateCandidateIntakeEvidence(
    candidateIntakeEvidenceArtifact.payload,
    candidateArtifactHeadSha,
    designHash,
  );

  const reasons = [];
  const levels = [];
  const packages = [];
  for (let index = 0; index < levelArtifacts.length; index += 1) {
    const expected = EXPECTED_LEVELS[index];
    const packageValue = validatePackageCustody(
      levelArtifacts[index].payload,
      expected,
      design,
    );
    packages.push(packageValue);
    const levelEvidence = recomputeLevelEvidence({
      packageValue,
      expected,
      design,
      productionSpec,
    });
    levels.push(levelEvidence);
    reasons.push(...levelEvidence.reasons);
  }
  validateCandidateIntakeLevels(candidateIntakeEvidenceArtifact.payload, packages);
  const locationHistories = recomputeLocationHistories(packages, probeSpec, design);
  for (const history of locationHistories) reasons.push(...history.reasons);

  const uniqueReasons = [...new Set(reasons)].sort();
  const status = uniqueReasons.length === 0 ? 'PASS' : 'BLOCKED';
  const artifactEntries = [
    manifestEntry(
      replayArtifactManifestArtifact,
      fullSemanticHash(replayArtifactManifestArtifact.payload),
    ),
    manifestEntry(
      candidateIntakeEvidenceArtifact,
      fullSemanticHash(candidateIntakeEvidenceArtifact.payload),
    ),
    manifestEntry(designArtifact, designHash),
    manifestEntry(probeSpecArtifact, canonicalLafeaSha256(probeSpec)),
    manifestEntry(productionResponseSpecArtifact, canonicalLafeaSha256(productionSpec)),
    ...levelArtifacts.map((artifact, index) => manifestEntry(
      artifact,
      packages[index].semanticHash,
      levels[index].status,
    )),
  ];
  const manifestBase = {
    schema: LAFEA_BUCKET_01_ARTIFACT_MANIFEST_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_REVISION,
    exactHeadSha: verificationHeadSha,
    designId: design.designId,
    designHash,
    ancestry: {
      candidateArtifactHeadSha,
      verificationHeadSha,
      mergeBaseSha,
      candidateArtifactHeadIsAncestor: true,
    },
    artifacts: artifactEntries,
    status,
    reasons: uniqueReasons,
    authority: independentAuthority(),
  };
  const artifactManifest = deepFreeze({
    ...manifestBase,
    semanticHash: canonicalLafeaSha256(manifestBase),
  });
  const evidenceBase = {
    schema: LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_REVISION,
    exactHeadSha: verificationHeadSha,
    candidateArtifactHeadSha,
    designId: design.designId,
    designHash,
    suppliedArtifactManifestHash:
      fullSemanticHash(replayArtifactManifestArtifact.payload),
    candidateIntakeEvidenceHash:
      fullSemanticHash(candidateIntakeEvidenceArtifact.payload),
    artifactManifestHash: artifactManifest.semanticHash,
    candidateNaturalMarginTarget: NATURAL_MARGIN_TARGET,
    loadAndRestraintWindow: {
      radiusStart: productionSpec.load.selectedSegmentRadiusStart,
      radiusEnd: productionSpec.load.selectedSegmentRadiusEnd,
      units: productionSpec.units.length,
    },
    levels,
    locationHistories,
    status,
    reasons: uniqueReasons,
    authority: independentAuthority(),
  };
  return deepFreeze({
    evidence: {
      ...evidenceBase,
      semanticHash: canonicalLafeaSha256(evidenceBase),
    },
    artifactManifest,
  });
}

export function recomputeLafeaBucket01IndependentCandidateQuality(packageValue) {
  return recomputeQuality(packageValue).metrics;
}

export function validateLafeaBucket01IndependentCandidateVerification(
  evidenceValue,
  manifestValue,
) {
  try {
    if (!evidenceValue
      || evidenceValue.schema !== LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_EVIDENCE_SCHEMA
      || evidenceValue.producerRevision !== LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_REVISION
      || !manifestValue
      || manifestValue.schema !== LAFEA_BUCKET_01_ARTIFACT_MANIFEST_SCHEMA
      || manifestValue.producerRevision !== LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_REVISION) {
      throw verificationError('LAFEA_B01_INDEPENDENT_EVIDENCE_SCHEMA_INVALID');
    }
    verifyFullSemanticHash(evidenceValue, 'LAFEA_B01_INDEPENDENT_EVIDENCE_HASH_TAMPERED');
    verifyFullSemanticHash(manifestValue, 'LAFEA_B01_INDEPENDENT_MANIFEST_HASH_TAMPERED');
    if (evidenceValue.artifactManifestHash !== manifestValue.semanticHash
      || evidenceValue.exactHeadSha !== manifestValue.exactHeadSha
      || evidenceValue.designHash !== manifestValue.designHash
      || evidenceValue.status !== manifestValue.status
      || JSON.stringify(evidenceValue.reasons) !== JSON.stringify(manifestValue.reasons)) {
      throw verificationError('LAFEA_B01_INDEPENDENT_MANIFEST_EVIDENCE_MISMATCH');
    }
    validateTypedManifestEntries(manifestValue.artifacts);
    assertIndependentAuthority(evidenceValue.authority);
    assertIndependentAuthority(manifestValue.authority);
    if (!isDeepFrozen(evidenceValue) || !isDeepFrozen(manifestValue)) {
      throw verificationError('LAFEA_B01_INDEPENDENT_EVIDENCE_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_INDEPENDENT_EVIDENCE_INVALID'],
    });
  }
}
