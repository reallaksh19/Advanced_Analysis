import {
  DISPLAY_KEYS,
  LAFEA_ARTIFACT_KINDS,
  LAFEA_ARTIFACT_RECORD_SCHEMA,
  LAFEA_LIFECYCLE_EVENT_SCHEMA,
  LAFEA_LIFECYCLE_SCHEMA,
  requireDefinition,
  requireHash,
  requireStage,
} from './lafea-lifecycle-contracts.js';
import {
  exactParentObject,
  validateArtifactRecord,
  validateDiagnostic,
  validateEvent,
  validateLifecycle,
} from './lafea-lifecycle-validation.js';

/** Create a lifecycle with current source and absent dependent artifacts. */
export function createLafeaLifecycle(stageId, sourceHash) {
  requireStage(stageId);
  requireHash(sourceHash, 'sourceHash');
  return validateLifecycle({
    schema: LAFEA_LIFECYCLE_SCHEMA,
    stageId,
    source: { status: 'CURRENT', sourceHash },
    artifacts: Object.fromEntries(
      LAFEA_ARTIFACT_KINDS.map((kind) => [kind, absentArtifact(stageId, kind)]),
    ),
    display: Object.fromEntries(DISPLAY_KEYS.map((key) => [key, null])),
    lastEvent: null,
    lastRegistration: null,
    diagnostics: [],
  });
}

/** Create one exact artifact record. */
export function createLafeaArtifactRecord(options) {
  const definition = requireDefinition(options?.kind);
  const parentHashes = exactParentObject(
    definition.parentKeys,
    options?.parentHashes ?? {},
  );
  return validateArtifactRecord({
    schema: LAFEA_ARTIFACT_RECORD_SCHEMA,
    stageId: options.stageId,
    kind: options.kind,
    status: options.status,
    artifactHash: options.artifactHash ?? null,
    parentHashes,
    qualification: options.qualification ?? 'NOT_EVALUATED',
    producerRef: options.producerRef ?? null,
    diagnostics: Object.freeze(
      [...(options.diagnostics ?? [])].map(validateDiagnostic),
    ),
  });
}

/** Create one exact lifecycle event. */
export function createLafeaLifecycleEvent(options) {
  return validateEvent({
    schema: LAFEA_LIFECYCLE_EVENT_SCHEMA,
    eventId: options.eventId,
    stageId: options.stageId,
    changeClass: options.changeClass,
    previousSourceHash: options.previousSourceHash ?? null,
    currentSourceHash: options.currentSourceHash ?? null,
    profileHash: options.profileHash ?? null,
    originRef: options.originRef,
  });
}

function absentArtifact(stageId, kind) {
  const definition = requireDefinition(kind);
  return createLafeaArtifactRecord({
    stageId,
    kind,
    status: 'ABSENT',
    artifactHash: null,
    parentHashes: Object.fromEntries(
      definition.parentKeys.map((key) => [key, null]),
    ),
    qualification: 'NOT_EVALUATED',
    producerRef: null,
    diagnostics: [],
  });
}
