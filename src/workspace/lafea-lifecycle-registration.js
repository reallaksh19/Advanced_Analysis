import {
  LAFEA_ARTIFACT_KINDS,
  LAFEA_ARTIFACT_REGISTRATION_SCHEMA,
  deepFreeze,
  lifecycleError,
  requireDefinition,
  requireHash,
  requireStage,
  requireText,
} from './lafea-lifecycle-contracts.js';
import {
  validateArtifactRecord,
  validateLifecycle,
} from './lafea-lifecycle-validation.js';

/** Register producer-owned evidence after exact lineage and prerequisite checks. */
export function registerLafeaArtifact(lifecycleValue, recordValue, registrationId) {
  const lifecycle = validateLifecycle(lifecycleValue);
  const record = validateArtifactRecord(recordValue);
  requireText(registrationId, 'registrationId');
  assertStageAuthority(lifecycle, record);
  assertRegistrationStatus(record);
  assertCurrentParents(lifecycle, record);
  assertPrerequisites(lifecycle, record);
  assertReportQualification(lifecycle, record);

  const current = lifecycle.artifacts[record.kind];
  const artifacts = cloneArtifacts(lifecycle.artifacts);
  artifacts[record.kind] = record;
  if (!artifactEquivalent(current, record)) {
    invalidateKinds(
      artifacts,
      requireDefinition(record.kind).descendants,
      'STALE',
    );
  }
  return validateLifecycle({
    ...structuredClone(lifecycle),
    artifacts,
    lastRegistration: createRegistration(lifecycle, record, registrationId),
    diagnostics: [],
  });
}

export function invalidateArtifactKinds(artifacts, kinds, status) {
  invalidateKinds(artifacts, kinds, status);
}

function assertStageAuthority(lifecycle, record) {
  const stage = requireStage(lifecycle.stageId);
  if (stage.engineState === 'ENGINE_NOT_IMPLEMENTED') {
    throw lifecycleError(
      'LAFEA_LIFECYCLE_ARTIFACT_NOT_AUTHORIZED',
      `${stage.stageId} cannot register engineering artifacts without a qualified stage engine.`,
    );
  }
  if (record.stageId !== lifecycle.stageId) {
    throw lifecycleError(
      'LAFEA_LIFECYCLE_STAGE_MISMATCH',
      'Artifact stage does not match lifecycle stage.',
    );
  }
}

function assertRegistrationStatus(record) {
  if (['CURRENT', 'BLOCKED'].includes(record.status)) return;
  throw lifecycleError(
    'LAFEA_ARTIFACT_REGISTRATION_STATUS_INVALID',
    'Only CURRENT or BLOCKED evidence may enter through artifact registration.',
  );
}

function assertCurrentParents(lifecycle, record) {
  const definition = requireDefinition(record.kind);
  for (const key of definition.parentKeys) {
    const value = record.parentHashes[key];
    if (definition.opaqueParentKeys.includes(key)) {
      requireHash(value, `${record.kind}.${key}`);
      continue;
    }
    if (value !== lifecycleHashForParent(lifecycle, key)) {
      throw lifecycleError(
        'LAFEA_ARTIFACT_PARENT_MISMATCH',
        `${record.kind}.${key} does not match current lifecycle lineage.`,
      );
    }
  }
}

function assertPrerequisites(lifecycle, record) {
  const definition = requireDefinition(record.kind);
  for (const [kind, qualification] of definition.prerequisites) {
    const prerequisite = lifecycle.artifacts[kind];
    if (prerequisite.status !== 'CURRENT'
      || prerequisite.qualification !== qualification) {
      throw lifecycleError(
        'LAFEA_ARTIFACT_PREREQUISITE_BLOCKED',
        `${record.kind} requires current ${qualification} ${kind} evidence.`,
      );
    }
  }
}

function assertReportQualification(lifecycle, record) {
  if (record.kind !== 'REPORT_EVIDENCE' || record.qualification !== 'PASS') return;
  const code = lifecycle.artifacts.CODE_ASSESSMENT;
  if (code.status === 'CURRENT' && code.qualification === 'PASS') return;
  throw lifecycleError(
    'LAFEA_REPORT_PASS_WITHOUT_CODE_READY',
    'PASS report evidence requires current PASS code-assessment evidence.',
  );
}

function lifecycleHashForParent(lifecycle, key) {
  if (key === 'sourceHash') return lifecycle.source.sourceHash;
  const kind = parentArtifactKind(key);
  const record = lifecycle.artifacts[kind];
  return record.status === 'ABSENT' ? null : record.artifactHash;
}

function parentArtifactKind(key) {
  const mapping = {
    canonicalModelHash: 'CANONICAL_MODEL',
    analysisGeometryHash: 'ANALYSIS_GEOMETRY',
    meshHash: 'ANALYSIS_MESH',
    executionHash: 'EXECUTION',
    recoveryHash: 'RECOVERY',
    convergenceHash: 'CONVERGENCE',
    codeAssessmentHash: 'CODE_ASSESSMENT',
  };
  const kind = mapping[key];
  if (!kind) {
    throw new TypeError(`No lifecycle parent binding is registered for ${key}.`);
  }
  return kind;
}

function invalidateKinds(artifacts, kinds, status) {
  for (const kind of kinds) {
    const record = artifacts[kind];
    if (record.status === 'ABSENT') continue;
    artifacts[kind] = deepFreeze({
      ...structuredClone(record),
      status,
    });
  }
}

function createRegistration(lifecycle, record, registrationId) {
  return {
    schema: LAFEA_ARTIFACT_REGISTRATION_SCHEMA,
    registrationId,
    stageId: lifecycle.stageId,
    kind: record.kind,
    artifactHash: record.artifactHash,
    status: record.status,
    producerRef: record.producerRef,
  };
}

function cloneArtifacts(value) {
  return Object.fromEntries(
    LAFEA_ARTIFACT_KINDS.map((kind) => [
      kind,
      structuredClone(value[kind]),
    ]),
  );
}

function artifactEquivalent(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
