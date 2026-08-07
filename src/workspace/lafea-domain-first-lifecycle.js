/** Explicit domain-first LAFEA.3 lifecycle authority. No producer execution is defined here. */
export const LAFEA_DOMAIN_FIRST_LIFECYCLE_SCHEMA = 'lafea-domain-first-lifecycle/v1';
export const LAFEA_DOMAIN_FIRST_PROFILE_ID = 'FEA_DOMAIN_FIRST_V1';
export const LAFEA_DOMAIN_FIRST_ARTIFACT_SCHEMA = 'lafea-domain-first-artifact/v1';

const DEFINITIONS = Object.freeze({
  ANALYSIS_DOMAIN: def(['sourceHash'], [], []),
  ANALYSIS_GEOMETRY: def(['sourceHash', 'analysisDomainHash'], [], [['ANALYSIS_DOMAIN', 'PASS']]),
  ANALYSIS_MESH: def(
    ['analysisDomainHash', 'analysisGeometryHash', 'meshProfileHash'],
    ['meshProfileHash'],
    [['ANALYSIS_DOMAIN', 'PASS'], ['ANALYSIS_GEOMETRY', 'PASS']],
  ),
  CANONICAL_MODEL: def(
    ['sourceHash', 'analysisDomainHash', 'analysisGeometryHash', 'meshHash', 'physicalProjectionProfileHash'],
    ['physicalProjectionProfileHash'],
    [['ANALYSIS_DOMAIN', 'PASS'], ['ANALYSIS_GEOMETRY', 'PASS'], ['ANALYSIS_MESH', 'PASS']],
  ),
  EXECUTION: def(
    ['canonicalModelHash', 'meshHash', 'physicalLoadCaseHash', 'solverProfileHash'],
    ['physicalLoadCaseHash', 'solverProfileHash'],
    [['CANONICAL_MODEL', 'PASS'], ['ANALYSIS_MESH', 'PASS']],
  ),
  RECOVERY: def(
    ['executionHash', 'meshHash', 'recoveryProfileHash'],
    ['recoveryProfileHash'],
    [['EXECUTION', 'PASS'], ['ANALYSIS_MESH', 'PASS']],
  ),
  CONVERGENCE: def(
    ['recoveryHash', 'recoverySetHash', 'convergenceProfileHash'],
    ['recoverySetHash', 'convergenceProfileHash'],
    [['RECOVERY', 'PASS']],
  ),
  REPORT_EVIDENCE: def(
    ['sourceHash', 'canonicalModelHash', 'meshHash', 'executionHash', 'recoveryHash', 'convergenceHash', 'reportProfileHash'],
    ['reportProfileHash'],
    [['RECOVERY', 'PASS']],
  ),
});
export const LAFEA_DOMAIN_FIRST_ARTIFACT_KINDS = Object.freeze(Object.keys(DEFINITIONS));

export function createLafeaDomainFirstLifecycle(sourceHash, custodyEpoch = 0) {
  hash(sourceHash, 'SOURCE_HASH');
  if (!Number.isInteger(custodyEpoch) || custodyEpoch < 0) fail('LAFEA_DOMAIN_FIRST_EPOCH_INVALID');
  return freeze({
    schema: LAFEA_DOMAIN_FIRST_LIFECYCLE_SCHEMA,
    stageId: 'LAFEA.3',
    profileId: LAFEA_DOMAIN_FIRST_PROFILE_ID,
    sourceHash,
    custodyEpoch,
    artifacts: Object.fromEntries(LAFEA_DOMAIN_FIRST_ARTIFACT_KINDS.map((kind) => [kind, absent(kind)])),
    lastRegistrationId: null,
  });
}

export function createLafeaDomainFirstArtifact(value) {
  const definition = definitionFor(value?.kind);
  exact(value, ['kind', 'status', 'artifactHash', 'parentHashes', 'qualification', 'producerRef'], 'LAFEA_DOMAIN_FIRST_ARTIFACT_KEYS_INVALID');
  if (!['CURRENT', 'BLOCKED'].includes(value.status)) fail('LAFEA_DOMAIN_FIRST_ARTIFACT_STATUS_INVALID');
  if (!['PASS', 'BLOCK'].includes(value.qualification)) fail('LAFEA_DOMAIN_FIRST_ARTIFACT_QUALIFICATION_INVALID');
  if (value.status === 'CURRENT' && value.qualification !== 'PASS') fail('LAFEA_DOMAIN_FIRST_CURRENT_REQUIRES_PASS');
  if (value.status === 'BLOCKED' && value.qualification !== 'BLOCK') fail('LAFEA_DOMAIN_FIRST_BLOCKED_REQUIRES_BLOCK');
  exact(value.parentHashes, definition.parentKeys, 'LAFEA_DOMAIN_FIRST_PARENT_KEYS_INVALID');
  return freeze({
    schema: LAFEA_DOMAIN_FIRST_ARTIFACT_SCHEMA,
    stageId: 'LAFEA.3',
    profileId: LAFEA_DOMAIN_FIRST_PROFILE_ID,
    kind: value.kind,
    status: value.status,
    artifactHash: hash(value.artifactHash, 'ARTIFACT_HASH'),
    parentHashes: freeze(Object.fromEntries(definition.parentKeys.map((key) => [
      key, definition.opaqueParentKeys.includes(key) ? text(value.parentHashes[key], key) : hash(value.parentHashes[key], key),
    ]))),
    qualification: value.qualification,
    producerRef: text(value.producerRef, 'PRODUCER_REF'),
  });
}

export function registerLafeaDomainFirstArtifact(lifecycleValue, artifactValue, registrationId) {
  const lifecycle = validateLafeaDomainFirstLifecycle(lifecycleValue);
  const artifact = createLafeaDomainFirstArtifact(stripArtifact(artifactValue));
  text(registrationId, 'REGISTRATION_ID');
  const definition = definitionFor(artifact.kind);
  requireParents(lifecycle, artifact, definition);
  requirePrerequisites(lifecycle, definition);
  const artifacts = { ...lifecycle.artifacts };
  const existing = artifacts[artifact.kind];
  if (existing.status !== 'ABSENT' && JSON.stringify(existing) !== JSON.stringify(artifact)) {
    fail('LAFEA_DOMAIN_FIRST_CONFLICTING_REPLAY');
  }
  artifacts[artifact.kind] = artifact;
  return freeze({ ...lifecycle, artifacts: freeze(artifacts), lastRegistrationId: registrationId });
}

export function validateLafeaDomainFirstLifecycle(value) {
  exact(value, ['schema', 'stageId', 'profileId', 'sourceHash', 'custodyEpoch', 'artifacts', 'lastRegistrationId'], 'LAFEA_DOMAIN_FIRST_LIFECYCLE_KEYS_INVALID');
  if (value.schema !== LAFEA_DOMAIN_FIRST_LIFECYCLE_SCHEMA || value.stageId !== 'LAFEA.3'
    || value.profileId !== LAFEA_DOMAIN_FIRST_PROFILE_ID) fail('LAFEA_DOMAIN_FIRST_LIFECYCLE_IDENTITY_INVALID');
  hash(value.sourceHash, 'SOURCE_HASH');
  if (!Number.isInteger(value.custodyEpoch) || value.custodyEpoch < 0) fail('LAFEA_DOMAIN_FIRST_EPOCH_INVALID');
  exact(value.artifacts, LAFEA_DOMAIN_FIRST_ARTIFACT_KINDS, 'LAFEA_DOMAIN_FIRST_ARTIFACT_SLOTS_INVALID');
  for (const kind of LAFEA_DOMAIN_FIRST_ARTIFACT_KINDS) validateSlot(value.artifacts[kind], kind);
  if (value.lastRegistrationId !== null) text(value.lastRegistrationId, 'LAST_REGISTRATION_ID');
  return freeze(structuredClone(value));
}

export function lafeaDomainFirstReadiness(value) {
  const lifecycle = validateLafeaDomainFirstLifecycle(value);
  const current = (kind) => lifecycle.artifacts[kind].status === 'CURRENT'
    && lifecycle.artifacts[kind].qualification === 'PASS';
  return freeze({
    profileId: LAFEA_DOMAIN_FIRST_PROFILE_ID,
    domainCurrent: current('ANALYSIS_DOMAIN'),
    geometryCurrent: current('ANALYSIS_GEOMETRY'),
    meshQualified: current('ANALYSIS_MESH'),
    solverModelCurrent: current('CANONICAL_MODEL'),
    executionCurrent: current('EXECUTION'),
    recoveryCurrent: current('RECOVERY'),
    reportCurrent: current('REPORT_EVIDENCE'),
  });
}

export function requireLafeaDomainFirstArtifactDefinition(kind) { return definitionFor(kind); }

function requireParents(lifecycle, artifact, definition) {
  for (const key of definition.parentKeys) {
    if (definition.opaqueParentKeys.includes(key)) continue;
    const expected = parentHash(lifecycle, key);
    if (artifact.parentHashes[key] !== expected) fail('LAFEA_DOMAIN_FIRST_PARENT_MISMATCH');
  }
}
function requirePrerequisites(lifecycle, definition) {
  for (const [kind, qualification] of definition.prerequisites) {
    const row = lifecycle.artifacts[kind];
    if (row.status !== 'CURRENT' || row.qualification !== qualification) {
      fail('LAFEA_DOMAIN_FIRST_PREREQUISITE_BLOCKED');
    }
  }
}
function parentHash(lifecycle, key) {
  if (key === 'sourceHash') return lifecycle.sourceHash;
  const kind = {
    analysisDomainHash: 'ANALYSIS_DOMAIN',
    analysisGeometryHash: 'ANALYSIS_GEOMETRY',
    meshHash: 'ANALYSIS_MESH',
    canonicalModelHash: 'CANONICAL_MODEL',
    executionHash: 'EXECUTION',
    recoveryHash: 'RECOVERY',
    convergenceHash: 'CONVERGENCE',
  }[key];
  if (!kind) fail('LAFEA_DOMAIN_FIRST_PARENT_BINDING_UNKNOWN');
  const row = lifecycle.artifacts[kind];
  return row.status === 'ABSENT' ? null : row.artifactHash;
}
function validateSlot(value, kind) {
  if (value?.status === 'ABSENT') {
    exact(value, ['schema', 'stageId', 'profileId', 'kind', 'status', 'artifactHash', 'parentHashes', 'qualification', 'producerRef'], 'LAFEA_DOMAIN_FIRST_ABSENT_KEYS_INVALID');
    if (value.kind !== kind || value.artifactHash !== null || value.qualification !== 'NOT_EVALUATED' || value.producerRef !== null) {
      fail('LAFEA_DOMAIN_FIRST_ABSENT_INVALID');
    }
    exact(value.parentHashes, definitionFor(kind).parentKeys, 'LAFEA_DOMAIN_FIRST_PARENT_KEYS_INVALID');
    if (Object.values(value.parentHashes).some((row) => row !== null)) fail('LAFEA_DOMAIN_FIRST_ABSENT_PARENT_INVALID');
    return;
  }
  const rebuilt = createLafeaDomainFirstArtifact(stripArtifact(value));
  if (JSON.stringify(rebuilt) !== JSON.stringify(value)) fail('LAFEA_DOMAIN_FIRST_ARTIFACT_INVALID');
}
function absent(kind) {
  return freeze({
    schema: LAFEA_DOMAIN_FIRST_ARTIFACT_SCHEMA,
    stageId: 'LAFEA.3',
    profileId: LAFEA_DOMAIN_FIRST_PROFILE_ID,
    kind, status: 'ABSENT', artifactHash: null,
    parentHashes: freeze(Object.fromEntries(definitionFor(kind).parentKeys.map((key) => [key, null]))),
    qualification: 'NOT_EVALUATED', producerRef: null,
  });
}
function stripArtifact(value) {
  return {
    kind: value?.kind, status: value?.status, artifactHash: value?.artifactHash,
    parentHashes: value?.parentHashes, qualification: value?.qualification, producerRef: value?.producerRef,
  };
}
function definitionFor(kind) { const row = DEFINITIONS[kind]; if (!row) fail('LAFEA_DOMAIN_FIRST_ARTIFACT_KIND_INVALID'); return row; }
function def(parentKeys, opaqueParentKeys, prerequisites) { return freeze({ parentKeys, opaqueParentKeys, prerequisites }); }
function exact(value, keys, code) { if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code); }
function text(value, field) { if (typeof value !== 'string' || !value.trim()) fail(`LAFEA_DOMAIN_FIRST_${String(field).toUpperCase()}_INVALID`); return value.trim(); }
function hash(value, field) { const out = text(value, field); if (!/^sha256:[0-9a-f]{64}$/u.test(out)) fail(`LAFEA_DOMAIN_FIRST_${String(field).toUpperCase()}_INVALID`); return out; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
