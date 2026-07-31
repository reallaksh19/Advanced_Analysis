/**
 * Fail-closed LAFEA analysis lifecycle and lineage contracts.
 *
 * Hash values are opaque producer-owned references. This module validates exact
 * lineage and state transitions; it does not invent engineering hashes, mesh,
 * solve, recovery, convergence, code or report evidence.
 */
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';

export const LAFEA_LIFECYCLE_SCHEMA = 'lafea-analysis-lifecycle/v1';
export const LAFEA_ARTIFACT_RECORD_SCHEMA = 'lafea-artifact-record/v1';
export const LAFEA_LIFECYCLE_EVENT_SCHEMA = 'lafea-lifecycle-event/v1';
export const LAFEA_ARTIFACT_REGISTRATION_SCHEMA = 'lafea-artifact-registration/v1';

export const LAFEA_ARTIFACT_KINDS = Object.freeze([
  'CANONICAL_MODEL',
  'ANALYSIS_GEOMETRY',
  'ANALYSIS_MESH',
  'EXECUTION',
  'RECOVERY',
  'CONVERGENCE',
  'CODE_ASSESSMENT',
  'REPORT_EVIDENCE',
]);

export const LAFEA_ARTIFACT_STATUSES = Object.freeze([
  'ABSENT',
  'CURRENT',
  'STALE',
  'REVALIDATION_REQUIRED',
  'BLOCKED',
]);

export const LAFEA_QUALIFICATION_STATES = Object.freeze([
  'NOT_EVALUATED',
  'PASS',
  'FAIL',
  'BLOCK',
]);

export const LAFEA_LIFECYCLE_CHANGE_CLASSES = Object.freeze([
  'MATERIAL_PROPERTY',
  'GEOMETRY',
  'LOAD_OR_BC',
  'MODEL_METADATA',
  'ANALYSIS_MESH_PROFILE',
  'RECOVERY_PROFILE',
  'CODE_PROFILE',
  'DISPLAY_MESH_DENSITY',
  'CONTOUR_PALETTE',
  'REPORT_RENDER_PROFILE',
]);

const DISPLAY_CHANGE_CLASSES = Object.freeze(new Set([
  'DISPLAY_MESH_DENSITY',
  'CONTOUR_PALETTE',
  'REPORT_RENDER_PROFILE',
]));
const SOURCE_CHANGE_CLASSES = Object.freeze(new Set([
  'MATERIAL_PROPERTY',
  'GEOMETRY',
  'LOAD_OR_BC',
  'MODEL_METADATA',
]));

const DEFINITIONS = deepFreeze({
  CANONICAL_MODEL: {
    parentKeys: ['sourceHash'],
    opaqueParentKeys: [],
    prerequisites: [],
    descendants: [
      'ANALYSIS_GEOMETRY', 'ANALYSIS_MESH', 'EXECUTION', 'RECOVERY',
      'CONVERGENCE', 'CODE_ASSESSMENT', 'REPORT_EVIDENCE',
    ],
  },
  ANALYSIS_GEOMETRY: {
    parentKeys: ['sourceHash', 'canonicalModelHash'],
    opaqueParentKeys: [],
    prerequisites: [['CANONICAL_MODEL', 'PASS']],
    descendants: [
      'ANALYSIS_MESH', 'EXECUTION', 'RECOVERY', 'CONVERGENCE',
      'CODE_ASSESSMENT', 'REPORT_EVIDENCE',
    ],
  },
  ANALYSIS_MESH: {
    parentKeys: ['analysisGeometryHash', 'meshProfileHash'],
    opaqueParentKeys: ['meshProfileHash'],
    prerequisites: [['ANALYSIS_GEOMETRY', 'PASS']],
    descendants: [
      'EXECUTION', 'RECOVERY', 'CONVERGENCE', 'CODE_ASSESSMENT',
      'REPORT_EVIDENCE',
    ],
  },
  EXECUTION: {
    parentKeys: [
      'canonicalModelHash', 'meshHash', 'physicalLoadCaseHash',
      'solverProfileHash',
    ],
    opaqueParentKeys: ['physicalLoadCaseHash', 'solverProfileHash'],
    prerequisites: [['CANONICAL_MODEL', 'PASS'], ['ANALYSIS_MESH', 'PASS']],
    descendants: ['RECOVERY', 'CONVERGENCE', 'CODE_ASSESSMENT', 'REPORT_EVIDENCE'],
  },
  RECOVERY: {
    parentKeys: ['executionHash', 'meshHash', 'recoveryProfileHash'],
    opaqueParentKeys: ['recoveryProfileHash'],
    prerequisites: [['EXECUTION', 'PASS'], ['ANALYSIS_MESH', 'PASS']],
    descendants: ['CONVERGENCE', 'CODE_ASSESSMENT', 'REPORT_EVIDENCE'],
  },
  CONVERGENCE: {
    parentKeys: ['recoveryHash', 'recoverySetHash', 'convergenceProfileHash'],
    opaqueParentKeys: ['recoverySetHash', 'convergenceProfileHash'],
    prerequisites: [['RECOVERY', 'PASS']],
    descendants: ['CODE_ASSESSMENT', 'REPORT_EVIDENCE'],
  },
  CODE_ASSESSMENT: {
    parentKeys: [
      'sourceHash', 'canonicalModelHash', 'meshHash', 'executionHash',
      'recoveryHash', 'convergenceHash', 'codeProfileHash',
      'allowableSourceHash', 'classificationProfileHash',
    ],
    opaqueParentKeys: [
      'codeProfileHash', 'allowableSourceHash', 'classificationProfileHash',
    ],
    prerequisites: [['RECOVERY', 'PASS'], ['CONVERGENCE', 'PASS']],
    descendants: ['REPORT_EVIDENCE'],
  },
  REPORT_EVIDENCE: {
    parentKeys: [
      'sourceHash', 'canonicalModelHash', 'meshHash', 'executionHash',
      'recoveryHash', 'convergenceHash', 'codeAssessmentHash',
      'reportProfileHash',
    ],
    opaqueParentKeys: ['reportProfileHash'],
    prerequisites: [],
    descendants: [],
  },
});

const LIFECYCLE_KEYS = Object.freeze([
  'schema', 'stageId', 'source', 'artifacts', 'display', 'lastEvent',
  'lastRegistration', 'diagnostics',
]);
const SOURCE_KEYS = Object.freeze(['status', 'sourceHash']);
const DISPLAY_KEYS = Object.freeze([
  'displayMeshDensityHash', 'contourPaletteHash', 'reportRenderProfileHash',
]);
const EVENT_KEYS = Object.freeze([
  'schema', 'eventId', 'stageId', 'changeClass', 'previousSourceHash',
  'currentSourceHash', 'profileHash', 'originRef',
]);
const RECORD_KEYS = Object.freeze([
  'schema', 'stageId', 'kind', 'status', 'artifactHash', 'parentHashes',
  'qualification', 'producerRef', 'diagnostics',
]);
const REGISTRATION_KEYS = Object.freeze([
  'schema', 'registrationId', 'stageId', 'kind', 'artifactHash',
  'status', 'producerRef',
]);

/** Create a lifecycle with current source and absent dependent artifacts. */
export function createLafeaLifecycle(stageId, sourceHash) {
  requireLafeaStageRegistryEntry(stageId);
  requireHash(sourceHash, 'sourceHash');
  const lifecycle = {
    schema: LAFEA_LIFECYCLE_SCHEMA,
    stageId,
    source: { status: 'CURRENT', sourceHash },
    artifacts: Object.fromEntries(
      LAFEA_ARTIFACT_KINDS.map((kind) => [kind, absentArtifact(stageId, kind)]),
    ),
    display: {
      displayMeshDensityHash: null,
      contourPaletteHash: null,
      reportRenderProfileHash: null,
    },
    lastEvent: null,
    lastRegistration: null,
    diagnostics: [],
  };
  return validateLifecycle(lifecycle);
}

/** Create one exact artifact record. */
export function createLafeaArtifactRecord(options) {
  const definition = requireDefinition(options?.kind);
  const parentHashes = exactParentObject(definition.parentKeys, options?.parentHashes ?? {});
  const record = {
    schema: LAFEA_ARTIFACT_RECORD_SCHEMA,
    stageId: options.stageId,
    kind: options.kind,
    status: options.status,
    artifactHash: options.artifactHash ?? null,
    parentHashes,
    qualification: options.qualification ?? 'NOT_EVALUATED',
    producerRef: options.producerRef ?? null,
    diagnostics: Object.freeze([...(options.diagnostics ?? [])].map(validateDiagnostic)),
  };
  return validateArtifactRecord(record);
}

/** Create one exact lifecycle event. */
export function createLafeaLifecycleEvent(options) {
  const event = {
    schema: LAFEA_LIFECYCLE_EVENT_SCHEMA,
    eventId: options.eventId,
    stageId: options.stageId,
    changeClass: options.changeClass,
    previousSourceHash: options.previousSourceHash ?? null,
    currentSourceHash: options.currentSourceHash ?? null,
    profileHash: options.profileHash ?? null,
    originRef: options.originRef,
  };
  return validateEvent(event);
}

/** Register producer-owned evidence after exact lineage and prerequisite checks. */
export function registerLafeaArtifact(lifecycleValue, recordValue, registrationId) {
  const lifecycle = validateLifecycle(lifecycleValue);
  const record = validateArtifactRecord(recordValue);
  requireText(registrationId, 'registrationId');
  const stage = requireLafeaStageRegistryEntry(lifecycle.stageId);
  if (stage.engineState === 'ENGINE_NOT_IMPLEMENTED') {
    throw lifecycleError(
      'LAFEA_LIFECYCLE_ARTIFACT_NOT_AUTHORIZED',
      `${stage.stageId} cannot register engineering artifacts without a qualified stage engine.`,
    );
  }
  if (record.stageId !== lifecycle.stageId) {
    throw lifecycleError('LAFEA_LIFECYCLE_STAGE_MISMATCH', 'Artifact stage does not match lifecycle stage.');
  }
  if (!['CURRENT', 'BLOCKED'].includes(record.status)) {
    throw lifecycleError(
      'LAFEA_ARTIFACT_REGISTRATION_STATUS_INVALID',
      'Only CURRENT or BLOCKED evidence may enter through artifact registration.',
    );
  }
  assertCurrentParents(lifecycle, record);
  assertPrerequisites(lifecycle, record);
  assertReportQualification(lifecycle, record);

  const current = lifecycle.artifacts[record.kind];
  const same = artifactEquivalent(current, record);
  const artifacts = cloneArtifacts(lifecycle.artifacts);
  artifacts[record.kind] = record;
  if (!same) invalidateKinds(artifacts, DEFINITIONS[record.kind].descendants, 'STALE');

  return validateLifecycle({
    ...structuredClone(lifecycle),
    artifacts,
    lastRegistration: {
      schema: LAFEA_ARTIFACT_REGISTRATION_SCHEMA,
      registrationId,
      stageId: lifecycle.stageId,
      kind: record.kind,
      artifactHash: record.artifactHash,
      status: record.status,
      producerRef: record.producerRef,
    },
    diagnostics: [],
  });
}

/** Apply one source/profile/display change using a fail-closed invalidation matrix. */
export function applyLafeaLifecycleEvent(lifecycleValue, eventValue) {
  const lifecycle = validateLifecycle(lifecycleValue);
  const event = validateEvent(eventValue);
  if (event.stageId !== lifecycle.stageId) {
    throw lifecycleError('LAFEA_LIFECYCLE_STAGE_MISMATCH', 'Lifecycle event stage does not match lifecycle stage.');
  }
  const stage = requireLafeaStageRegistryEntry(lifecycle.stageId);
  if (!DISPLAY_CHANGE_CLASSES.has(event.changeClass) && stage.engineState === 'ENGINE_NOT_IMPLEMENTED') {
    throw lifecycleError(
      'LAFEA_LIFECYCLE_EDIT_NOT_AUTHORIZED',
      `${stage.stageId} engineering lifecycle edits are blocked without a qualified stage engine.`,
    );
  }

  const next = structuredClone(lifecycle);
  next.lastEvent = event;
  next.diagnostics = [];

  if (DISPLAY_CHANGE_CLASSES.has(event.changeClass)) {
    applyDisplayEvent(next.display, event);
    return validateLifecycle(next);
  }

  if (SOURCE_CHANGE_CLASSES.has(event.changeClass)) {
    if (event.previousSourceHash !== lifecycle.source.sourceHash) {
      throw lifecycleError('LAFEA_STALE_SOURCE_HASH', 'Lifecycle event previousSourceHash is stale.');
    }
    requireHash(event.currentSourceHash, 'currentSourceHash');
    if (event.currentSourceHash === event.previousSourceHash) {
      throw lifecycleError('LAFEA_SOURCE_HASH_UNCHANGED', 'Engineering source events require a changed source hash.');
    }
    next.source = { status: 'CURRENT', sourceHash: event.currentSourceHash };
    invalidateForSourceChange(next.artifacts, event.changeClass);
    return validateLifecycle(next);
  }

  requireHash(event.profileHash, 'profileHash');
  if (event.changeClass === 'ANALYSIS_MESH_PROFILE') {
    invalidateKinds(next.artifacts, [
      'ANALYSIS_MESH', 'EXECUTION', 'RECOVERY', 'CONVERGENCE',
      'CODE_ASSESSMENT', 'REPORT_EVIDENCE',
    ], 'STALE');
  } else if (event.changeClass === 'RECOVERY_PROFILE') {
    invalidateKinds(next.artifacts, [
      'RECOVERY', 'CONVERGENCE', 'CODE_ASSESSMENT', 'REPORT_EVIDENCE',
    ], 'STALE');
  } else if (event.changeClass === 'CODE_PROFILE') {
    invalidateKinds(next.artifacts, ['CODE_ASSESSMENT', 'REPORT_EVIDENCE'], 'STALE');
  } else {
    throw lifecycleError('LAFEA_CHANGE_CLASS_UNSUPPORTED', `Unsupported lifecycle change: ${event.changeClass}.`);
  }
  return validateLifecycle(next);
}

/** Derive truthful UI/readiness states without promoting blocked or stale evidence. */
export function lafeaLifecycleReadiness(lifecycleValue) {
  const lifecycle = validateLifecycle(lifecycleValue);
  const stage = requireLafeaStageRegistryEntry(lifecycle.stageId);
  const artifact = (kind) => lifecycle.artifacts[kind];
  const currentPass = (kind) => artifact(kind).status === 'CURRENT'
    && artifact(kind).qualification === 'PASS';
  const mesh = artifact('ANALYSIS_MESH');
  const report = artifact('REPORT_EVIDENCE');
  const reasons = [];
  if (stage.engineState === 'ENGINE_NOT_IMPLEMENTED') reasons.push('STAGE_ENGINE_NOT_IMPLEMENTED');
  if (!currentPass('CANONICAL_MODEL')) reasons.push('MODEL_NOT_CURRENT_AND_QUALIFIED');
  if (!currentPass('ANALYSIS_MESH')) reasons.push('MESH_NOT_CURRENT_AND_QUALIFIED');
  if (!currentPass('EXECUTION')) reasons.push('EXECUTION_NOT_CURRENT_AND_QUALIFIED');
  if (!currentPass('RECOVERY')) reasons.push('RECOVERY_NOT_CURRENT_AND_QUALIFIED');
  if (!currentPass('CONVERGENCE')) reasons.push('CONVERGENCE_NOT_CURRENT_AND_QUALIFIED');
  if (!currentPass('CODE_ASSESSMENT')) reasons.push('CODE_ASSESSMENT_NOT_CURRENT_AND_QUALIFIED');

  const result = {
    schema: 'lafea-lifecycle-readiness/v1',
    stageId: lifecycle.stageId,
    sourceCurrent: lifecycle.source.status === 'CURRENT',
    modelCurrent: currentPass('CANONICAL_MODEL'),
    meshGenerated: ['CURRENT', 'BLOCKED'].includes(mesh.status),
    meshQualified: currentPass('ANALYSIS_MESH'),
    resultReady: currentPass('ANALYSIS_MESH')
      && currentPass('EXECUTION')
      && currentPass('RECOVERY'),
    codeReady: currentPass('ANALYSIS_MESH')
      && currentPass('EXECUTION')
      && currentPass('RECOVERY')
      && currentPass('CONVERGENCE')
      && currentPass('CODE_ASSESSMENT'),
    reportCurrent: report.status === 'CURRENT',
    blockingReasons: Object.freeze(reasons),
  };
  return deepFreeze(result);
}

function validateLifecycle(value) {
  exactKeys(value, LIFECYCLE_KEYS, 'LAFEA lifecycle');
  if (value.schema !== LAFEA_LIFECYCLE_SCHEMA) throw new TypeError('LAFEA lifecycle schema is invalid.');
  requireLafeaStageRegistryEntry(value.stageId);
  exactKeys(value.source, SOURCE_KEYS, 'LAFEA lifecycle source');
  if (value.source.status !== 'CURRENT') throw new TypeError('Lifecycle source must be CURRENT.');
  requireHash(value.source.sourceHash, 'source.sourceHash');
  exactKeys(value.artifacts, LAFEA_ARTIFACT_KINDS, 'LAFEA lifecycle artifacts');
  for (const kind of LAFEA_ARTIFACT_KINDS) {
    const record = validateArtifactRecord(value.artifacts[kind]);
    if (record.stageId !== value.stageId || record.kind !== kind) {
      throw new TypeError(`${kind} lifecycle slot identity is invalid.`);
    }
  }
  exactKeys(value.display, DISPLAY_KEYS, 'LAFEA lifecycle display state');
  for (const key of DISPLAY_KEYS) requireNullableHash(value.display[key], `display.${key}`);
  if (value.lastEvent !== null) validateEvent(value.lastEvent);
  if (value.lastRegistration !== null) validateRegistration(value.lastRegistration);
  if (!Array.isArray(value.diagnostics)) throw new TypeError('Lifecycle diagnostics must be an array.');
  value.diagnostics.forEach(validateDiagnostic);
  return deepFreeze(structuredClone(value));
}

function validateArtifactRecord(value) {
  exactKeys(value, RECORD_KEYS, 'LAFEA artifact record');
  if (value.schema !== LAFEA_ARTIFACT_RECORD_SCHEMA) throw new TypeError('Artifact record schema is invalid.');
  requireLafeaStageRegistryEntry(value.stageId);
  const definition = requireDefinition(value.kind);
  if (!LAFEA_ARTIFACT_STATUSES.includes(value.status)) throw new TypeError(`${value.kind} status is invalid.`);
  if (!LAFEA_QUALIFICATION_STATES.includes(value.qualification)) throw new TypeError(`${value.kind} qualification is invalid.`);
  exactKeys(value.parentHashes, definition.parentKeys, `${value.kind} parent hashes`);
  if (!Array.isArray(value.diagnostics)) throw new TypeError(`${value.kind} diagnostics must be an array.`);
  value.diagnostics.forEach(validateDiagnostic);

  if (value.status === 'ABSENT') {
    if (value.artifactHash !== null || value.producerRef !== null || value.qualification !== 'NOT_EVALUATED') {
      throw new TypeError(`${value.kind} ABSENT record must not claim evidence or qualification.`);
    }
    Object.values(value.parentHashes).forEach((hash) => {
      if (hash !== null) throw new TypeError(`${value.kind} ABSENT parent hashes must be null.`);
    });
  } else {
    requireHash(value.artifactHash, `${value.kind}.artifactHash`);
    requireText(value.producerRef, `${value.kind}.producerRef`);
    for (const key of definition.parentKeys) requireNullableHash(value.parentHashes[key], `${value.kind}.${key}`);
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
  if (SOURCE_CHANGE_CLASSES.has(value.changeClass)) {
    requireHash(value.previousSourceHash, 'previousSourceHash');
    requireHash(value.currentSourceHash, 'currentSourceHash');
    if (value.profileHash !== null) throw new TypeError('Source-change event profileHash must be null.');
  } else if (DISPLAY_CHANGE_CLASSES.has(value.changeClass)
    || ['ANALYSIS_MESH_PROFILE', 'RECOVERY_PROFILE', 'CODE_PROFILE'].includes(value.changeClass)) {
    requireHash(value.profileHash, 'profileHash');
    if (value.previousSourceHash !== null || value.currentSourceHash !== null) {
      throw new TypeError('Profile/display event source hashes must be null.');
    }
  }
  return deepFreeze(structuredClone(value));
}

function validateRegistration(value) {
  exactKeys(value, REGISTRATION_KEYS, 'LAFEA artifact registration');
  if (value.schema !== LAFEA_ARTIFACT_REGISTRATION_SCHEMA) throw new TypeError('Artifact registration schema is invalid.');
  requireText(value.registrationId, 'registrationId');
  requireLafeaStageRegistryEntry(value.stageId);
  requireDefinition(value.kind);
  requireHash(value.artifactHash, 'artifactHash');
  if (!['CURRENT', 'BLOCKED'].includes(value.status)) throw new TypeError('Registration status is invalid.');
  requireText(value.producerRef, 'producerRef');
  return deepFreeze(structuredClone(value));
}

function validateDiagnostic(value) {
  exactKeys(value, ['severity', 'code', 'path', 'message'], 'LAFEA lifecycle diagnostic');
  if (!['INFO', 'WARNING', 'ERROR', 'BLOCK'].includes(value.severity)) throw new TypeError('Diagnostic severity is invalid.');
  requireText(value.code, 'diagnostic.code');
  if (value.path !== null) requireText(value.path, 'diagnostic.path');
  requireText(value.message, 'diagnostic.message');
  return deepFreeze(structuredClone(value));
}

function assertCurrentParents(lifecycle, record) {
  const definition = DEFINITIONS[record.kind];
  for (const key of definition.parentKeys) {
    const value = record.parentHashes[key];
    if (definition.opaqueParentKeys.includes(key)) {
      requireHash(value, `${record.kind}.${key}`);
      continue;
    }
    const expected = lifecycleHashForParent(lifecycle, key);
    if (value !== expected) {
      throw lifecycleError(
        'LAFEA_ARTIFACT_PARENT_MISMATCH',
        `${record.kind}.${key} does not match current lifecycle lineage.`,
      );
    }
  }
}

function assertPrerequisites(lifecycle, record) {
  for (const [kind, qualification] of DEFINITIONS[record.kind].prerequisites) {
    const prerequisite = lifecycle.artifacts[kind];
    if (prerequisite.status !== 'CURRENT' || prerequisite.qualification !== qualification) {
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
  if (code.status !== 'CURRENT' || code.qualification !== 'PASS') {
    throw lifecycleError(
      'LAFEA_REPORT_PASS_WITHOUT_CODE_READY',
      'PASS report evidence requires current PASS code-assessment evidence.',
    );
  }
}

function lifecycleHashForParent(lifecycle, key) {
  if (key === 'sourceHash') return lifecycle.source.sourceHash;
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
  if (!kind) throw new TypeError(`No lifecycle parent binding is registered for ${key}.`);
  const record = lifecycle.artifacts[kind];
  return record.status === 'ABSENT' ? null : record.artifactHash;
}

function invalidateForSourceChange(artifacts, changeClass) {
  if (changeClass === 'GEOMETRY') {
    invalidateKinds(artifacts, LAFEA_ARTIFACT_KINDS, 'STALE');
    return;
  }
  invalidateKinds(artifacts, ['CANONICAL_MODEL'], 'STALE');
  invalidateKinds(artifacts, ['ANALYSIS_GEOMETRY', 'ANALYSIS_MESH'], 'REVALIDATION_REQUIRED');
  invalidateKinds(artifacts, [
    'EXECUTION', 'RECOVERY', 'CONVERGENCE', 'CODE_ASSESSMENT', 'REPORT_EVIDENCE',
  ], 'STALE');
}

function invalidateKinds(artifacts, kinds, status) {
  for (const kind of kinds) {
    const record = artifacts[kind];
    if (record.status === 'ABSENT') continue;
    artifacts[kind] = deepFreeze({ ...structuredClone(record), status });
  }
}

function applyDisplayEvent(display, event) {
  if (event.changeClass === 'DISPLAY_MESH_DENSITY') display.displayMeshDensityHash = event.profileHash;
  else if (event.changeClass === 'CONTOUR_PALETTE') display.contourPaletteHash = event.profileHash;
  else if (event.changeClass === 'REPORT_RENDER_PROFILE') display.reportRenderProfileHash = event.profileHash;
  else throw lifecycleError('LAFEA_DISPLAY_CHANGE_UNSUPPORTED', `Unsupported display change ${event.changeClass}.`);
}

function absentArtifact(stageId, kind) {
  const definition = DEFINITIONS[kind];
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

function exactParentObject(keys, value) {
  exactKeys(value, keys, 'Artifact parentHashes');
  return deepFreeze(Object.fromEntries(keys.map((key) => [key, value[key]])));
}

function cloneArtifacts(value) {
  return Object.fromEntries(
    LAFEA_ARTIFACT_KINDS.map((kind) => [kind, structuredClone(value[kind])]),
  );
}

function artifactEquivalent(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireDefinition(kind) {
  if (!LAFEA_ARTIFACT_KINDS.includes(kind)) throw new TypeError(`Unsupported LAFEA artifact kind: ${kind}.`);
  return DEFINITIONS[kind];
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) throw new TypeError(`${label} exact-key contract mismatch.`);
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
