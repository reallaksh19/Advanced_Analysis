/**
 * Fail-closed, stage-profiled LAFEA lifecycle and lineage contracts.
 *
 * Hashes remain opaque producer-owned references. This module validates exact
 * profile authority, lineage, invalidation and readiness; it creates no
 * engineering evidence and does not promote retained calculations.
 */
import {
  requireLafeaLifecycleArtifactDefinition,
  requireLafeaLifecycleProfileForStage,
} from './lafea-lifecycle-profiles.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';

export const LAFEA_LIFECYCLE_SCHEMA = 'lafea-analysis-lifecycle/v2';
export const LAFEA_LEGACY_LIFECYCLE_SCHEMA = 'lafea-analysis-lifecycle/v1';
export const LAFEA_ARTIFACT_RECORD_SCHEMA = 'lafea-artifact-record/v2';
export const LAFEA_LEGACY_ARTIFACT_RECORD_SCHEMA = 'lafea-artifact-record/v1';
export const LAFEA_LIFECYCLE_EVENT_SCHEMA = 'lafea-lifecycle-event/v1';
export const LAFEA_ARTIFACT_REGISTRATION_SCHEMA = 'lafea-artifact-registration/v2';
export const LAFEA_LEGACY_ARTIFACT_REGISTRATION_SCHEMA = 'lafea-artifact-registration/v1';

export const LAFEA_ARTIFACT_KINDS = Object.freeze([
  'CANONICAL_MODEL', 'ANALYSIS_GEOMETRY', 'ANALYSIS_MESH', 'EXECUTION',
  'RESULT_EVIDENCE', 'RECOVERY', 'CONVERGENCE', 'SCREENING_ASSESSMENT',
  'CODE_ASSESSMENT', 'REPORT_EVIDENCE',
]);
export const LAFEA_LEGACY_ARTIFACT_KINDS = Object.freeze([
  'CANONICAL_MODEL', 'ANALYSIS_GEOMETRY', 'ANALYSIS_MESH', 'EXECUTION',
  'RECOVERY', 'CONVERGENCE', 'CODE_ASSESSMENT', 'REPORT_EVIDENCE',
]);
export const LAFEA_ARTIFACT_STATUSES = Object.freeze([
  'ABSENT', 'CURRENT', 'STALE', 'REVALIDATION_REQUIRED', 'BLOCKED',
]);
export const LAFEA_QUALIFICATION_STATES = Object.freeze([
  'NOT_EVALUATED', 'PASS', 'FAIL', 'BLOCK',
]);
export const LAFEA_LIFECYCLE_CHANGE_CLASSES = Object.freeze([
  'MATERIAL_PROPERTY', 'GEOMETRY', 'LOAD_OR_BC', 'MODEL_METADATA',
  'ANALYSIS_MESH_PROFILE', 'RECOVERY_PROFILE', 'CODE_PROFILE',
  'DISPLAY_MESH_DENSITY', 'CONTOUR_PALETTE', 'REPORT_RENDER_PROFILE',
]);

const DISPLAY_CHANGES = new Set([
  'DISPLAY_MESH_DENSITY', 'CONTOUR_PALETTE', 'REPORT_RENDER_PROFILE',
]);
const SOURCE_CHANGES = new Set([
  'MATERIAL_PROPERTY', 'GEOMETRY', 'LOAD_OR_BC', 'MODEL_METADATA',
]);
const LIFECYCLE_KEYS = [
  'schema', 'stageId', 'profileId', 'source', 'artifacts', 'display',
  'lastEvent', 'lastRegistration', 'diagnostics',
];
const LEGACY_LIFECYCLE_KEYS = [
  'schema', 'stageId', 'source', 'artifacts', 'display', 'lastEvent',
  'lastRegistration', 'diagnostics',
];
const SOURCE_KEYS = ['status', 'sourceHash'];
const DISPLAY_KEYS = [
  'displayMeshDensityHash', 'contourPaletteHash', 'reportRenderProfileHash',
];
const EVENT_KEYS = [
  'schema', 'eventId', 'stageId', 'changeClass', 'previousSourceHash',
  'currentSourceHash', 'profileHash', 'originRef',
];
const RECORD_KEYS = [
  'schema', 'stageId', 'profileId', 'kind', 'status', 'artifactHash',
  'parentHashes', 'qualification', 'producerRef', 'diagnostics',
];
const LEGACY_RECORD_KEYS = [
  'schema', 'stageId', 'kind', 'status', 'artifactHash', 'parentHashes',
  'qualification', 'producerRef', 'diagnostics',
];
const REGISTRATION_KEYS = [
  'schema', 'registrationId', 'stageId', 'profileId', 'kind', 'artifactHash',
  'status', 'producerRef',
];
const LEGACY_REGISTRATION_KEYS = [
  'schema', 'registrationId', 'stageId', 'kind', 'artifactHash',
  'status', 'producerRef',
];

export function createLafeaLifecycle(stageId, sourceHash) {
  requireLafeaStageRegistryEntry(stageId);
  requireHash(sourceHash, 'sourceHash');
  const profile = requireLafeaLifecycleProfileForStage(stageId);
  return validateLifecycle({
    schema: LAFEA_LIFECYCLE_SCHEMA,
    stageId,
    profileId: profile.profileId,
    source: { status: 'CURRENT', sourceHash },
    artifacts: Object.fromEntries(
      profile.artifactKinds.map((kind) => [kind, absentArtifact(stageId, kind)]),
    ),
    display: {
      displayMeshDensityHash: null,
      contourPaletteHash: null,
      reportRenderProfileHash: null,
    },
    lastEvent: null,
    lastRegistration: null,
    diagnostics: [],
  });
}

export function createLafeaArtifactRecord(options) {
  const stageId = options?.stageId;
  requireLafeaStageRegistryEntry(stageId);
  const profile = requireLafeaLifecycleProfileForStage(stageId);
  if (options?.profileId !== undefined && options.profileId !== profile.profileId) {
    throw lifecycleError('LAFEA_LIFECYCLE_PROFILE_MISMATCH',
      `${stageId} requires lifecycle profile ${profile.profileId}.`);
  }
  const definition = requireLafeaLifecycleArtifactDefinition(stageId, options?.kind);
  return validateRecord({
    schema: LAFEA_ARTIFACT_RECORD_SCHEMA,
    stageId,
    profileId: profile.profileId,
    kind: options.kind,
    status: options.status,
    artifactHash: options.artifactHash ?? null,
    parentHashes: exactParentObject(definition.parentKeys, options.parentHashes ?? {}),
    qualification: options.qualification ?? 'NOT_EVALUATED',
    producerRef: options.producerRef ?? null,
    diagnostics: [...(options.diagnostics ?? [])].map(validateDiagnostic),
  });
}

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

export function migrateLafeaLifecycleV1(value) {
  const legacy = validateLegacyLifecycle(value);
  const profile = requireLafeaLifecycleProfileForStage(legacy.stageId);
  for (const kind of LAFEA_LEGACY_ARTIFACT_KINDS) {
    if (!profile.artifactKinds.includes(kind) && legacy.artifacts[kind].status !== 'ABSENT') {
      throw migrationError(legacy.stageId, kind,
        'Legacy evidence is not authorized by the stage-correct profile.');
    }
  }
  const artifacts = {};
  for (const kind of profile.artifactKinds) {
    const old = legacy.artifacts[kind];
    if (!old || old.status === 'ABSENT') {
      artifacts[kind] = absentArtifact(legacy.stageId, kind);
      continue;
    }
    const definition = requireLafeaLifecycleArtifactDefinition(legacy.stageId, kind);
    if (!sameKeys(Object.keys(old.parentHashes), definition.parentKeys)) {
      throw migrationError(legacy.stageId, kind,
        'Legacy parent lineage differs from the stage-correct profile.');
    }
    artifacts[kind] = createLafeaArtifactRecord({
      ...old,
      profileId: profile.profileId,
    });
  }
  let lastRegistration = null;
  if (legacy.lastRegistration) {
    const old = legacy.lastRegistration;
    if (!profile.artifactKinds.includes(old.kind)
      || artifacts[old.kind]?.status === 'ABSENT') {
      throw migrationError(legacy.stageId, old.kind,
        'Legacy registration does not identify retained profile-authorized evidence.');
    }
    lastRegistration = {
      ...old,
      schema: LAFEA_ARTIFACT_REGISTRATION_SCHEMA,
      profileId: profile.profileId,
    };
  }
  return validateLifecycle({
    schema: LAFEA_LIFECYCLE_SCHEMA,
    stageId: legacy.stageId,
    profileId: profile.profileId,
    source: legacy.source,
    artifacts,
    display: legacy.display,
    lastEvent: legacy.lastEvent,
    lastRegistration,
    diagnostics: legacy.diagnostics,
  });
}

export function registerLafeaArtifact(lifecycleValue, recordValue, registrationId) {
  const lifecycle = validateLifecycle(lifecycleValue);
  const record = validateRecord(recordValue);
  requireText(registrationId, 'registrationId');
  const stage = requireLafeaStageRegistryEntry(lifecycle.stageId);
  if (stage.engineState === 'ENGINE_NOT_IMPLEMENTED') {
    throw lifecycleError('LAFEA_LIFECYCLE_ARTIFACT_NOT_AUTHORIZED',
      `${stage.stageId} cannot register engineering artifacts without a qualified engine.`);
  }
  if (record.stageId !== lifecycle.stageId) {
    throw lifecycleError('LAFEA_LIFECYCLE_STAGE_MISMATCH',
      'Artifact stage does not match lifecycle stage.');
  }
  if (record.profileId !== lifecycle.profileId) {
    throw lifecycleError('LAFEA_LIFECYCLE_PROFILE_MISMATCH',
      'Artifact profile does not match lifecycle profile.');
  }
  if (!['CURRENT', 'BLOCKED'].includes(record.status)) {
    throw lifecycleError('LAFEA_ARTIFACT_REGISTRATION_STATUS_INVALID',
      'Only CURRENT or BLOCKED evidence may be registered.');
  }
  assertCurrentParents(lifecycle, record);
  assertPrerequisites(lifecycle, record);
  assertReportQualification(lifecycle, record);
  const artifacts = cloneArtifacts(lifecycle);
  const same = JSON.stringify(artifacts[record.kind]) === JSON.stringify(record);
  artifacts[record.kind] = record;
  if (!same) {
    const definition = requireLafeaLifecycleArtifactDefinition(record.stageId, record.kind);
    invalidateKinds(artifacts, definition.descendants, 'STALE');
  }
  return validateLifecycle({
    ...structuredClone(lifecycle),
    artifacts,
    lastRegistration: {
      schema: LAFEA_ARTIFACT_REGISTRATION_SCHEMA,
      registrationId,
      stageId: lifecycle.stageId,
      profileId: lifecycle.profileId,
      kind: record.kind,
      artifactHash: record.artifactHash,
      status: record.status,
      producerRef: record.producerRef,
    },
    diagnostics: [],
  });
}

export function applyLafeaLifecycleEvent(lifecycleValue, eventValue) {
  const lifecycle = validateLifecycle(lifecycleValue);
  const event = validateEvent(eventValue);
  if (event.stageId !== lifecycle.stageId) {
    throw lifecycleError('LAFEA_LIFECYCLE_STAGE_MISMATCH',
      'Lifecycle event stage does not match lifecycle stage.');
  }
  const stage = requireLafeaStageRegistryEntry(lifecycle.stageId);
  const profile = requireLafeaLifecycleProfileForStage(lifecycle.stageId);
  if (!DISPLAY_CHANGES.has(event.changeClass)
    && stage.engineState === 'ENGINE_NOT_IMPLEMENTED') {
    throw lifecycleError('LAFEA_LIFECYCLE_EDIT_NOT_AUTHORIZED',
      `${stage.stageId} engineering lifecycle edits are blocked.`);
  }
  const next = structuredClone(lifecycle);
  next.lastEvent = event;
  next.diagnostics = [];
  if (DISPLAY_CHANGES.has(event.changeClass)) {
    applyDisplayEvent(next.display, event);
    return validateLifecycle(next);
  }
  if (!profile.engineeringChangeClasses.includes(event.changeClass)) {
    throw lifecycleError('LAFEA_CHANGE_CLASS_NOT_AUTHORIZED_FOR_PROFILE',
      `${event.changeClass} is not authorized by ${profile.profileId}.`);
  }
  if (SOURCE_CHANGES.has(event.changeClass)) {
    if (event.previousSourceHash !== lifecycle.source.sourceHash) {
      throw lifecycleError('LAFEA_STALE_SOURCE_HASH',
        'Lifecycle event previousSourceHash is stale.');
    }
    if (event.currentSourceHash === event.previousSourceHash) {
      throw lifecycleError('LAFEA_SOURCE_HASH_UNCHANGED',
        'Engineering source events require a changed source hash.');
    }
    next.source = { status: 'CURRENT', sourceHash: event.currentSourceHash };
    invalidateForSourceChange(next.artifacts, profile, event.changeClass);
    return validateLifecycle(next);
  }
  if (event.changeClass === 'ANALYSIS_MESH_PROFILE') {
    invalidateFromKind(next.artifacts, lifecycle.stageId, 'ANALYSIS_MESH');
  } else if (event.changeClass === 'RECOVERY_PROFILE') {
    invalidateFromKind(next.artifacts, lifecycle.stageId, 'RECOVERY');
  } else if (event.changeClass === 'CODE_PROFILE') {
    invalidateFromKind(next.artifacts, lifecycle.stageId, 'CODE_ASSESSMENT');
  } else {
    throw lifecycleError('LAFEA_CHANGE_CLASS_UNSUPPORTED',
      `Unsupported lifecycle change: ${event.changeClass}.`);
  }
  return validateLifecycle(next);
}

export function lafeaLifecycleReadiness(lifecycleValue) {
  const lifecycle = validateLifecycle(lifecycleValue);
  const stage = requireLafeaStageRegistryEntry(lifecycle.stageId);
  const profile = requireLafeaLifecycleProfileForStage(lifecycle.stageId);
  const currentPass = (kind) => lifecycle.artifacts[kind]?.status === 'CURRENT'
    && lifecycle.artifacts[kind]?.qualification === 'PASS';
  const mesh = lifecycle.artifacts.ANALYSIS_MESH;
  const report = lifecycle.artifacts.REPORT_EVIDENCE;
  const resultReady = stage.engineState !== 'ENGINE_NOT_IMPLEMENTED'
    && profile.resultRequiredKinds.length > 0
    && profile.resultRequiredKinds.every(currentPass);
  const assessmentApplicable = profile.assessmentRequiredKinds.length > 0;
  const reasons = [];
  if (stage.engineState === 'ENGINE_NOT_IMPLEMENTED') reasons.push('STAGE_ENGINE_NOT_IMPLEMENTED');
  for (const kind of [...profile.resultRequiredKinds, ...profile.assessmentRequiredKinds]) {
    if (!currentPass(kind) && !reasons.includes(`${kind}_NOT_CURRENT_AND_QUALIFIED`)) {
      reasons.push(`${kind}_NOT_CURRENT_AND_QUALIFIED`);
    }
  }
  return deepFreeze({
    schema: 'lafea-lifecycle-readiness/v2',
    stageId: lifecycle.stageId,
    profileId: lifecycle.profileId,
    sourceCurrent: lifecycle.source.status === 'CURRENT',
    modelCurrent: currentPass('CANONICAL_MODEL'),
    meshApplicable: profile.meshApplicable,
    meshGenerated: profile.meshApplicable
      && !!mesh && ['CURRENT', 'BLOCKED'].includes(mesh.status),
    meshQualified: profile.meshApplicable && currentPass('ANALYSIS_MESH'),
    resultReady,
    assessmentApplicable,
    assessmentReady: assessmentApplicable
      && profile.assessmentRequiredKinds.every(currentPass),
    convergenceApplicable: profile.convergenceApplicable,
    convergenceReady: profile.convergenceApplicable && currentPass('CONVERGENCE'),
    codeAssessmentApplicable: profile.codeAssessmentApplicable,
    codeReady: profile.codeAssessmentApplicable && currentPass('CODE_ASSESSMENT'),
    reportCurrent: report?.status === 'CURRENT',
    reportQualified: currentPass('REPORT_EVIDENCE'),
    blockingReasons: Object.freeze(reasons),
  });
}

function validateLifecycle(value) {
  exactKeys(value, LIFECYCLE_KEYS, 'LAFEA lifecycle');
  if (value.schema !== LAFEA_LIFECYCLE_SCHEMA) throw new TypeError('LAFEA lifecycle schema is invalid.');
  requireLafeaStageRegistryEntry(value.stageId);
  const profile = requireLafeaLifecycleProfileForStage(value.stageId);
  if (value.profileId !== profile.profileId) throw new TypeError('Lifecycle profile is invalid for stage.');
  exactKeys(value.source, SOURCE_KEYS, 'LAFEA lifecycle source');
  if (value.source.status !== 'CURRENT') throw new TypeError('Lifecycle source must be CURRENT.');
  requireHash(value.source.sourceHash, 'source.sourceHash');
  exactKeys(value.artifacts, profile.artifactKinds, 'LAFEA lifecycle artifacts');
  for (const kind of profile.artifactKinds) {
    const record = validateRecord(value.artifacts[kind]);
    if (record.stageId !== value.stageId || record.profileId !== value.profileId
      || record.kind !== kind) throw new TypeError(`${kind} slot identity is invalid.`);
  }
  exactKeys(value.display, DISPLAY_KEYS, 'LAFEA lifecycle display state');
  DISPLAY_KEYS.forEach((key) => requireNullableHash(value.display[key], `display.${key}`));
  if (value.lastEvent) validateEvent(value.lastEvent);
  if (value.lastRegistration) validateRegistration(value.lastRegistration);
  if (!Array.isArray(value.diagnostics)) throw new TypeError('Lifecycle diagnostics must be an array.');
  value.diagnostics.forEach(validateDiagnostic);
  return deepFreeze(structuredClone(value));
}

function validateRecord(value) {
  exactKeys(value, RECORD_KEYS, 'LAFEA artifact record');
  if (value.schema !== LAFEA_ARTIFACT_RECORD_SCHEMA) throw new TypeError('Artifact record schema is invalid.');
  requireLafeaStageRegistryEntry(value.stageId);
  const profile = requireLafeaLifecycleProfileForStage(value.stageId);
  if (value.profileId !== profile.profileId) throw new TypeError('Artifact profile is invalid.');
  const definition = requireLafeaLifecycleArtifactDefinition(value.stageId, value.kind);
  if (!LAFEA_ARTIFACT_STATUSES.includes(value.status)) throw new TypeError(`${value.kind} status is invalid.`);
  if (!LAFEA_QUALIFICATION_STATES.includes(value.qualification)) throw new TypeError(`${value.kind} qualification is invalid.`);
  exactKeys(value.parentHashes, definition.parentKeys, `${value.kind} parent hashes`);
  if (!Array.isArray(value.diagnostics)) throw new TypeError(`${value.kind} diagnostics must be an array.`);
  value.diagnostics.forEach(validateDiagnostic);
  if (value.status === 'ABSENT') {
    if (value.artifactHash !== null || value.producerRef !== null
      || value.qualification !== 'NOT_EVALUATED'
      || Object.values(value.parentHashes).some((hash) => hash !== null)) {
      throw new TypeError(`${value.kind} ABSENT record claims evidence.`);
    }
  } else {
    requireHash(value.artifactHash, `${value.kind}.artifactHash`);
    requireText(value.producerRef, `${value.kind}.producerRef`);
    definition.parentKeys.forEach((key) => requireNullableHash(
      value.parentHashes[key], `${value.kind}.${key}`,
    ));
  }
  if (value.status === 'CURRENT' && value.qualification === 'BLOCK') {
    throw new TypeError(`${value.kind} CURRENT evidence cannot have BLOCK qualification.`);
  }
  if (value.status === 'BLOCKED' && value.qualification !== 'BLOCK') {
    throw new TypeError(`${value.kind} BLOCKED evidence requires BLOCK qualification.`);
  }
  return deepFreeze(structuredClone(value));
}

function validateEvent(value) {
  exactKeys(value, EVENT_KEYS, 'LAFEA lifecycle event');
  if (value.schema !== LAFEA_LIFECYCLE_EVENT_SCHEMA) throw new TypeError('Lifecycle event schema is invalid.');
  requireText(value.eventId, 'eventId');
  requireLafeaStageRegistryEntry(value.stageId);
  if (!LAFEA_LIFECYCLE_CHANGE_CLASSES.includes(value.changeClass)) throw new TypeError('Lifecycle changeClass is invalid.');
  requireNullableHash(value.previousSourceHash, 'previousSourceHash');
  requireNullableHash(value.currentSourceHash, 'currentSourceHash');
  requireNullableHash(value.profileHash, 'profileHash');
  requireText(value.originRef, 'originRef');
  if (SOURCE_CHANGES.has(value.changeClass)) {
    requireHash(value.previousSourceHash, 'previousSourceHash');
    requireHash(value.currentSourceHash, 'currentSourceHash');
    if (value.profileHash !== null) throw new TypeError('Source event profileHash must be null.');
  } else {
    requireHash(value.profileHash, 'profileHash');
    if (value.previousSourceHash !== null || value.currentSourceHash !== null) {
      throw new TypeError('Profile/display event source hashes must be null.');
    }
  }
  return deepFreeze(structuredClone(value));
}

function validateRegistration(value) {
  exactKeys(value, REGISTRATION_KEYS, 'LAFEA artifact registration');
  if (value.schema !== LAFEA_ARTIFACT_REGISTRATION_SCHEMA) throw new TypeError('Registration schema is invalid.');
  requireText(value.registrationId, 'registrationId');
  const profile = requireLafeaLifecycleProfileForStage(value.stageId);
  if (value.profileId !== profile.profileId) throw new TypeError('Registration profile is invalid.');
  requireLafeaLifecycleArtifactDefinition(value.stageId, value.kind);
  requireHash(value.artifactHash, 'artifactHash');
  if (!['CURRENT', 'BLOCKED'].includes(value.status)) throw new TypeError('Registration status is invalid.');
  requireText(value.producerRef, 'producerRef');
  return value;
}

function assertCurrentParents(lifecycle, record) {
  const definition = requireLafeaLifecycleArtifactDefinition(record.stageId, record.kind);
  for (const key of definition.parentKeys) {
    const value = record.parentHashes[key];
    if (definition.opaqueParentKeys.includes(key)) requireHash(value, `${record.kind}.${key}`);
    else if (value !== lifecycleHashForParent(lifecycle, key)) {
      throw lifecycleError('LAFEA_ARTIFACT_PARENT_MISMATCH',
        `${record.kind}.${key} does not match current lifecycle lineage.`);
    }
  }
}

function assertPrerequisites(lifecycle, record) {
  const definition = requireLafeaLifecycleArtifactDefinition(record.stageId, record.kind);
  for (const [kind, qualification] of definition.prerequisites) {
    const prerequisite = lifecycle.artifacts[kind];
    if (prerequisite?.status !== 'CURRENT'
      || prerequisite?.qualification !== qualification) {
      throw lifecycleError('LAFEA_ARTIFACT_PREREQUISITE_BLOCKED',
        `${record.kind} requires current ${qualification} ${kind} evidence.`);
    }
  }
}

function assertReportQualification(lifecycle, record) {
  if (record.kind !== 'REPORT_EVIDENCE' || record.qualification !== 'PASS') return;
  const profile = requireLafeaLifecycleProfileForStage(lifecycle.stageId);
  for (const kind of profile.reportPassRequiredKinds) {
    const prerequisite = lifecycle.artifacts[kind];
    if (prerequisite?.status !== 'CURRENT' || prerequisite?.qualification !== 'PASS') {
      throw lifecycleError('LAFEA_REPORT_PASS_WITHOUT_RESULT_READY',
        `PASS report requires current PASS ${kind} for ${profile.profileId}.`);
    }
  }
}

function lifecycleHashForParent(lifecycle, key) {
  if (key === 'sourceHash') return lifecycle.source.sourceHash;
  const kind = {
    canonicalModelHash: 'CANONICAL_MODEL',
    analysisGeometryHash: 'ANALYSIS_GEOMETRY',
    meshHash: 'ANALYSIS_MESH',
    executionHash: 'EXECUTION',
    resultEvidenceHash: 'RESULT_EVIDENCE',
    recoveryHash: 'RECOVERY',
    convergenceHash: 'CONVERGENCE',
    screeningAssessmentHash: 'SCREENING_ASSESSMENT',
    codeAssessmentHash: 'CODE_ASSESSMENT',
  }[key];
  if (!kind) throw new TypeError(`No lifecycle parent binding exists for ${key}.`);
  const record = lifecycle.artifacts[kind];
  return !record || record.status === 'ABSENT' ? null : record.artifactHash;
}

function invalidateForSourceChange(artifacts, profile, changeClass) {
  if (changeClass === 'GEOMETRY') {
    invalidateKinds(artifacts, profile.artifactKinds, 'STALE');
    return;
  }
  invalidateKinds(artifacts, ['CANONICAL_MODEL'], 'STALE');
  invalidateKinds(artifacts, ['ANALYSIS_GEOMETRY', 'ANALYSIS_MESH'], 'REVALIDATION_REQUIRED');
  invalidateKinds(artifacts, profile.artifactKinds.filter((kind) => ![
    'CANONICAL_MODEL', 'ANALYSIS_GEOMETRY', 'ANALYSIS_MESH',
  ].includes(kind)), 'STALE');
}

function invalidateFromKind(artifacts, stageId, kind) {
  const definition = requireLafeaLifecycleArtifactDefinition(stageId, kind);
  invalidateKinds(artifacts, [kind, ...definition.descendants], 'STALE');
}

function invalidateKinds(artifacts, kinds, status) {
  for (const kind of kinds) {
    const record = artifacts[kind];
    if (record && record.status !== 'ABSENT') {
      artifacts[kind] = deepFreeze({ ...structuredClone(record), status });
    }
  }
}

function applyDisplayEvent(display, event) {
  if (event.changeClass === 'DISPLAY_MESH_DENSITY') display.displayMeshDensityHash = event.profileHash;
  else if (event.changeClass === 'CONTOUR_PALETTE') display.contourPaletteHash = event.profileHash;
  else if (event.changeClass === 'REPORT_RENDER_PROFILE') display.reportRenderProfileHash = event.profileHash;
  else throw lifecycleError('LAFEA_DISPLAY_CHANGE_UNSUPPORTED',
    `Unsupported display change ${event.changeClass}.`);
}

function absentArtifact(stageId, kind) {
  const definition = requireLafeaLifecycleArtifactDefinition(stageId, kind);
  return createLafeaArtifactRecord({
    stageId,
    kind,
    status: 'ABSENT',
    artifactHash: null,
    parentHashes: Object.fromEntries(definition.parentKeys.map((key) => [key, null])),
    qualification: 'NOT_EVALUATED',
    producerRef: null,
    diagnostics: [],
  });
}

function cloneArtifacts(lifecycle) {
  const profile = requireLafeaLifecycleProfileForStage(lifecycle.stageId);
  return Object.fromEntries(profile.artifactKinds.map((kind) => [
    kind, structuredClone(lifecycle.artifacts[kind]),
  ]));
}

function validateLegacyLifecycle(value) {
  exactKeys(value, LEGACY_LIFECYCLE_KEYS, 'Legacy LAFEA lifecycle');
  if (value.schema !== LAFEA_LEGACY_LIFECYCLE_SCHEMA) throw new TypeError('Legacy lifecycle schema is invalid.');
  requireLafeaStageRegistryEntry(value.stageId);
  exactKeys(value.source, SOURCE_KEYS, 'Legacy lifecycle source');
  if (value.source.status !== 'CURRENT') throw new TypeError('Legacy source must be CURRENT.');
  requireHash(value.source.sourceHash, 'source.sourceHash');
  exactKeys(value.artifacts, LAFEA_LEGACY_ARTIFACT_KINDS, 'Legacy lifecycle artifacts');
  const artifacts = Object.fromEntries(LAFEA_LEGACY_ARTIFACT_KINDS.map((kind) => [
    kind, validateLegacyRecord(value.artifacts[kind], value.stageId, kind),
  ]));
  exactKeys(value.display, DISPLAY_KEYS, 'Legacy lifecycle display');
  DISPLAY_KEYS.forEach((key) => requireNullableHash(value.display[key], `display.${key}`));
  if (value.lastEvent) validateEvent(value.lastEvent);
  if (value.lastRegistration) validateLegacyRegistration(value.lastRegistration, value.stageId);
  if (!Array.isArray(value.diagnostics)) throw new TypeError('Legacy diagnostics must be an array.');
  value.diagnostics.forEach(validateDiagnostic);
  return deepFreeze({ ...structuredClone(value), artifacts });
}

function validateLegacyRecord(value, stageId, kind) {
  exactKeys(value, LEGACY_RECORD_KEYS, 'Legacy artifact record');
  if (value.schema !== LAFEA_LEGACY_ARTIFACT_RECORD_SCHEMA
    || value.stageId !== stageId || value.kind !== kind) {
    throw new TypeError('Legacy artifact identity is invalid.');
  }
  if (!LAFEA_ARTIFACT_STATUSES.includes(value.status)
    || !LAFEA_QUALIFICATION_STATES.includes(value.qualification)) {
    throw new TypeError('Legacy artifact state is invalid.');
  }
  if (!value.parentHashes || typeof value.parentHashes !== 'object'
    || Array.isArray(value.parentHashes)) throw new TypeError('Legacy parent hashes are invalid.');
  Object.values(value.parentHashes).forEach((hash) => requireNullableHash(hash, `${kind}.parentHash`));
  if (!Array.isArray(value.diagnostics)) throw new TypeError('Legacy diagnostics are invalid.');
  value.diagnostics.forEach(validateDiagnostic);
  if (value.status === 'ABSENT') {
    if (value.artifactHash !== null || value.producerRef !== null
      || value.qualification !== 'NOT_EVALUATED'
      || Object.values(value.parentHashes).some((hash) => hash !== null)) {
      throw new TypeError('Legacy ABSENT artifact claims evidence.');
    }
  } else {
    requireHash(value.artifactHash, `${kind}.artifactHash`);
    requireText(value.producerRef, `${kind}.producerRef`);
  }
  return deepFreeze(structuredClone(value));
}

function validateLegacyRegistration(value, stageId) {
  exactKeys(value, LEGACY_REGISTRATION_KEYS, 'Legacy registration');
  if (value.schema !== LAFEA_LEGACY_ARTIFACT_REGISTRATION_SCHEMA
    || value.stageId !== stageId
    || !LAFEA_LEGACY_ARTIFACT_KINDS.includes(value.kind)) {
    throw new TypeError('Legacy registration is invalid.');
  }
  requireText(value.registrationId, 'registrationId');
  requireHash(value.artifactHash, 'artifactHash');
  if (!['CURRENT', 'BLOCKED'].includes(value.status)) throw new TypeError('Legacy registration status is invalid.');
  requireText(value.producerRef, 'producerRef');
  return value;
}

function validateDiagnostic(value) {
  exactKeys(value, ['severity', 'code', 'path', 'message'], 'Lifecycle diagnostic');
  if (!['INFO', 'WARNING', 'ERROR', 'BLOCK'].includes(value.severity)) throw new TypeError('Diagnostic severity is invalid.');
  requireText(value.code, 'diagnostic.code');
  if (value.path !== null) requireText(value.path, 'diagnostic.path');
  requireText(value.message, 'diagnostic.message');
  return deepFreeze(structuredClone(value));
}

function migrationError(stageId, kind, message) {
  const error = lifecycleError('LAFEA_LIFECYCLE_V1_MIGRATION_REQUIRES_REVALIDATION',
    `${stageId} ${kind}: ${message}`);
  error.stageId = stageId;
  error.kind = kind;
  return error;
}

function exactParentObject(keys, value) {
  exactKeys(value, keys, 'Artifact parentHashes');
  return deepFreeze(Object.fromEntries(keys.map((key) => [key, value[key]])));
}
function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  if (!sameKeys(Object.keys(value), expected)) throw new TypeError(`${label} exact-key contract mismatch.`);
}
function sameKeys(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}
function requireHash(value, label) {
  requireText(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:+/-]*$/u.test(value)) throw new TypeError(`${label} is not a valid opaque hash reference.`);
}
function requireNullableHash(value, label) {
  if (value !== null) requireHash(value, label);
}
function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required.`);
}
function lifecycleError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
