import {
  DIAGNOSTIC_KEYS,
  DISPLAY_CHANGE_CLASSES,
  DISPLAY_KEYS,
  EVENT_KEYS,
  LAFEA_ARTIFACT_KINDS,
  LAFEA_ARTIFACT_RECORD_SCHEMA,
  LAFEA_ARTIFACT_REGISTRATION_SCHEMA,
  LAFEA_ARTIFACT_STATUSES,
  LAFEA_LIFECYCLE_CHANGE_CLASSES,
  LAFEA_LIFECYCLE_EVENT_SCHEMA,
  LAFEA_LIFECYCLE_SCHEMA,
  LAFEA_QUALIFICATION_STATES,
  LIFECYCLE_KEYS,
  RECORD_KEYS,
  REGISTRATION_KEYS,
  SOURCE_CHANGE_CLASSES,
  SOURCE_KEYS,
  deepFreeze,
  exactKeys,
  requireDefinition,
  requireHash,
  requireNullableHash,
  requireStage,
  requireText,
} from './lafea-lifecycle-contracts.js';

export function validateLifecycle(value) {
  exactKeys(value, LIFECYCLE_KEYS, 'LAFEA lifecycle');
  requireLifecycleIdentity(value);
  validateLifecycleSource(value.source);
  validateLifecycleArtifacts(value);
  validateLifecycleDisplay(value.display);
  if (value.lastEvent !== null) validateEvent(value.lastEvent);
  if (value.lastRegistration !== null) validateRegistration(value.lastRegistration);
  validateDiagnostics(value.diagnostics, 'Lifecycle');
  return deepFreeze(structuredClone(value));
}

export function validateArtifactRecord(value) {
  exactKeys(value, RECORD_KEYS, 'LAFEA artifact record');
  requireArtifactIdentity(value);
  const definition = requireDefinition(value.kind);
  validateArtifactEnums(value);
  exactKeys(value.parentHashes, definition.parentKeys, `${value.kind} parent hashes`);
  validateDiagnostics(value.diagnostics, value.kind);
  if (value.status === 'ABSENT') validateAbsentArtifact(value);
  else validatePresentArtifact(value, definition);
  validateArtifactStatusQualification(value);
  return deepFreeze(structuredClone(value));
}

export function validateEvent(value) {
  exactKeys(value, EVENT_KEYS, 'LAFEA lifecycle event');
  if (value.schema !== LAFEA_LIFECYCLE_EVENT_SCHEMA) {
    throw new TypeError('Lifecycle event schema is invalid.');
  }
  requireText(value.eventId, 'eventId');
  requireStage(value.stageId);
  if (!LAFEA_LIFECYCLE_CHANGE_CLASSES.includes(value.changeClass)) {
    throw new TypeError('Lifecycle changeClass is invalid.');
  }
  requireNullableHash(value.previousSourceHash, 'previousSourceHash');
  requireNullableHash(value.currentSourceHash, 'currentSourceHash');
  requireNullableHash(value.profileHash, 'profileHash');
  requireText(value.originRef, 'originRef');
  validateEventAuthority(value);
  return deepFreeze(structuredClone(value));
}

export function validateRegistration(value) {
  exactKeys(value, REGISTRATION_KEYS, 'LAFEA artifact registration');
  if (value.schema !== LAFEA_ARTIFACT_REGISTRATION_SCHEMA) {
    throw new TypeError('Artifact registration schema is invalid.');
  }
  requireText(value.registrationId, 'registrationId');
  requireStage(value.stageId);
  requireDefinition(value.kind);
  requireHash(value.artifactHash, 'artifactHash');
  if (!['CURRENT', 'BLOCKED'].includes(value.status)) {
    throw new TypeError('Registration status is invalid.');
  }
  requireText(value.producerRef, 'producerRef');
  return deepFreeze(structuredClone(value));
}

export function validateDiagnostic(value) {
  exactKeys(value, DIAGNOSTIC_KEYS, 'LAFEA lifecycle diagnostic');
  if (!['INFO', 'WARNING', 'ERROR', 'BLOCK'].includes(value.severity)) {
    throw new TypeError('Diagnostic severity is invalid.');
  }
  requireText(value.code, 'diagnostic.code');
  if (value.path !== null) requireText(value.path, 'diagnostic.path');
  requireText(value.message, 'diagnostic.message');
  return deepFreeze(structuredClone(value));
}

export function exactParentObject(keys, value) {
  exactKeys(value, keys, 'Artifact parentHashes');
  return deepFreeze(Object.fromEntries(keys.map((key) => [key, value[key]])));
}

function requireLifecycleIdentity(value) {
  if (value.schema !== LAFEA_LIFECYCLE_SCHEMA) {
    throw new TypeError('LAFEA lifecycle schema is invalid.');
  }
  requireStage(value.stageId);
}

function validateLifecycleSource(value) {
  exactKeys(value, SOURCE_KEYS, 'LAFEA lifecycle source');
  if (value.status !== 'CURRENT') {
    throw new TypeError('Lifecycle source must be CURRENT.');
  }
  requireHash(value.sourceHash, 'source.sourceHash');
}

function validateLifecycleArtifacts(value) {
  exactKeys(value.artifacts, LAFEA_ARTIFACT_KINDS, 'LAFEA lifecycle artifacts');
  for (const kind of LAFEA_ARTIFACT_KINDS) {
    const record = validateArtifactRecord(value.artifacts[kind]);
    if (record.stageId !== value.stageId || record.kind !== kind) {
      throw new TypeError(`${kind} lifecycle slot identity is invalid.`);
    }
  }
}

function validateLifecycleDisplay(value) {
  exactKeys(value, DISPLAY_KEYS, 'LAFEA lifecycle display state');
  for (const key of DISPLAY_KEYS) requireNullableHash(value[key], `display.${key}`);
}

function requireArtifactIdentity(value) {
  if (value.schema !== LAFEA_ARTIFACT_RECORD_SCHEMA) {
    throw new TypeError('Artifact record schema is invalid.');
  }
  requireStage(value.stageId);
}

function validateArtifactEnums(value) {
  if (!LAFEA_ARTIFACT_STATUSES.includes(value.status)) {
    throw new TypeError(`${value.kind} status is invalid.`);
  }
  if (!LAFEA_QUALIFICATION_STATES.includes(value.qualification)) {
    throw new TypeError(`${value.kind} qualification is invalid.`);
  }
}

function validateDiagnostics(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} diagnostics must be an array.`);
  value.forEach(validateDiagnostic);
}

function validateAbsentArtifact(value) {
  if (value.artifactHash !== null || value.producerRef !== null
    || value.qualification !== 'NOT_EVALUATED') {
    throw new TypeError(`${value.kind} ABSENT record must not claim evidence or qualification.`);
  }
  Object.values(value.parentHashes).forEach((hash) => {
    if (hash !== null) {
      throw new TypeError(`${value.kind} ABSENT parent hashes must be null.`);
    }
  });
}

function validatePresentArtifact(value, definition) {
  requireHash(value.artifactHash, `${value.kind}.artifactHash`);
  requireText(value.producerRef, `${value.kind}.producerRef`);
  for (const key of definition.parentKeys) {
    requireNullableHash(value.parentHashes[key], `${value.kind}.${key}`);
  }
}

function validateArtifactStatusQualification(value) {
  if (value.status === 'CURRENT' && value.qualification === 'BLOCK') {
    throw new TypeError(`${value.kind} CURRENT evidence cannot have BLOCK qualification.`);
  }
  if (value.status === 'BLOCKED' && value.qualification !== 'BLOCK') {
    throw new TypeError(`${value.kind} BLOCKED evidence requires BLOCK qualification.`);
  }
}

function validateEventAuthority(value) {
  if (SOURCE_CHANGE_CLASSES.has(value.changeClass)) {
    requireHash(value.previousSourceHash, 'previousSourceHash');
    requireHash(value.currentSourceHash, 'currentSourceHash');
    if (value.profileHash !== null) {
      throw new TypeError('Source-change event profileHash must be null.');
    }
    return;
  }
  if (DISPLAY_CHANGE_CLASSES.has(value.changeClass)
    || ['ANALYSIS_MESH_PROFILE', 'RECOVERY_PROFILE', 'CODE_PROFILE'].includes(value.changeClass)) {
    requireHash(value.profileHash, 'profileHash');
    if (value.previousSourceHash !== null || value.currentSourceHash !== null) {
      throw new TypeError('Profile/display event source hashes must be null.');
    }
  }
}
