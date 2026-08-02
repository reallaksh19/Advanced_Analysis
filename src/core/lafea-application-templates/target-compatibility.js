import {
  LAFEA_TEMPLATE_AUTHORITY_STATES,
  validateTemplateReleaseRecordV2,
} from './release-record-v2.js';
import {
  LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
  templateReleaseSha256,
} from './release-record-v2-hash.js';

export const LAFEA_TEMPLATE_TARGET_COMPATIBILITY_SCHEMA =
  'lafea-template-target-compatibility-receipt/v1';
export const LAFEA_TEMPLATE_TARGET_SNAPSHOT_SCHEMA =
  'lafea-template-target-authority-snapshot/v1';
export const LAFEA_TEMPLATE_COMPATIBILITY_STATUSES = Object.freeze([
  'CURRENT',
  'STALE',
  'BLOCKED',
]);

const HASH_PATTERN = /^(?:sha256:[0-9a-f]{64}|fnv1a64:[0-9a-f]{16})$/u;
const TOP_KEYS = Object.freeze([
  'schema', 'templateId', 'templateSemanticHash', 'parameterSchemaHash',
  'compilerBindingHash', 'compilationHash', 'handoffHash', 'targetStage',
  'compositionRoot', 'lifecycleProfile', 'sourceContract', 'unitProjection',
  'productAdapter', 'meshRequirement', 'benchmarkBindings', 'status',
  'reasons', 'hashProfile', 'semanticHash',
]);
const SNAPSHOT_KEYS = Object.freeze([
  'schema', 'targetStage', 'compositionRoot', 'lifecycleProfile',
  'sourceContract', 'unitProjection', 'productAdapter', 'meshRequirement',
  'benchmarkBindings', 'semanticHash',
]);
const NESTED_KEYS = Object.freeze({
  targetStage: [
    'stageId', 'registrySchema', 'registryEntryHash', 'engineState',
    'enginePackage', 'stageAuthority', 'inputContractRole', 'resultContractRole',
  ],
  compositionRoot: [
    'compositionSchema', 'compositionRootId', 'compositionRootHash',
    'componentIdsHash', 'releaseStateBinding',
  ],
  lifecycleProfile: [
    'profileSchema', 'profileId', 'profileHash', 'artifactKindsHash',
    'resultRequiredKindsHash', 'assessmentRequiredKindsHash',
    'meshApplicable', 'recoveryApplicable', 'convergenceApplicable',
    'codeAssessmentApplicable',
  ],
  sourceContract: [
    'sourceAuthoritySchema', 'sourceAuthorityRole', 'sourceContractRole',
    'canonicalizationProfile',
  ],
  unitProjection: [
    'unitResolverId', 'unitSourceRole', 'targetUnitContractHash',
  ],
  productAdapter: [
    'applicability', 'componentId', 'componentHash', 'productProfileHash',
  ],
  meshRequirement: [
    'applicability', 'authoritySchema', 'authorityRole', 'requiredStatus',
  ],
  benchmarkBindings: [
    'bindingState', 'manifestIds', 'manifestHashes',
  ],
});

const STATE_INDEX = new Map(
  LAFEA_TEMPLATE_AUTHORITY_STATES.map((state, index) => [state, index]),
);

export function createTemplateTargetAuthoritySnapshot(input) {
  const normalized = normalizeSnapshot({
    ...input,
    schema: LAFEA_TEMPLATE_TARGET_SNAPSHOT_SCHEMA,
    semanticHash: null,
  });
  const semanticHash = templateReleaseSha256(snapshotBasis(normalized));
  return deepFreeze({ ...normalized, semanticHash });
}

export function validateTemplateTargetAuthoritySnapshot(value) {
  const errors = [];
  try {
    const normalized = normalizeSnapshot(value);
    if (normalized.schema !== LAFEA_TEMPLATE_TARGET_SNAPSHOT_SCHEMA) {
      throw new TypeError('Target authority snapshot schema is invalid.');
    }
    const expected = templateReleaseSha256(snapshotBasis(normalized));
    if (value.semanticHash !== expected) {
      throw new TypeError('Target authority snapshot semantic hash is invalid.');
    }
    if (!isDeepFrozen(value)) {
      throw new TypeError('Target authority snapshot must be deeply frozen.');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function evaluateTemplateTargetCompatibility(releaseRecord, snapshotValue) {
  const releaseValidation = validateTemplateReleaseRecordV2(releaseRecord);
  if (!releaseValidation.ok) {
    throw new TypeError(`Release record v2 is invalid: ${releaseValidation.errors.join(' ')}`);
  }
  const snapshotValidation = validateTemplateTargetAuthoritySnapshot(snapshotValue);
  if (!snapshotValidation.ok) {
    throw new TypeError(`Target authority snapshot is invalid: ${snapshotValidation.errors.join(' ')}`);
  }
  const snapshot = normalizeSnapshot(snapshotValue);
  const stale = [];
  const blocked = [];
  const authorityStateIndex = STATE_INDEX.get(releaseRecord.releaseState.authorityState);
  if (authorityStateIndex < STATE_INDEX.get('COMPILED_READY')) {
    blocked.push('RELEASE_RECORD_NOT_COMPILED_READY');
  }

  compare(stale, 'TARGET_STAGE_ID_CHANGED',
    releaseRecord.targetStage.stageId, snapshot.targetStage.stageId);
  compare(stale, 'HANDOFF_TARGET_STAGE_CHANGED',
    releaseRecord.handoff.entryStageId, snapshot.targetStage.stageId);
  compare(stale, 'TARGET_STAGE_REGISTRY_SCHEMA_CHANGED',
    releaseRecord.targetStage.registrySchema, snapshot.targetStage.registrySchema);
  compare(stale, 'TARGET_STAGE_ENTRY_CHANGED',
    releaseRecord.targetStage.stageEntryHash, snapshot.targetStage.registryEntryHash);
  compare(stale, 'TARGET_STAGE_ENGINE_STATE_CHANGED',
    releaseRecord.targetStage.engineState, snapshot.targetStage.engineState);
  compare(stale, 'TARGET_STAGE_ENGINE_PACKAGE_CHANGED',
    releaseRecord.targetStage.enginePackage, snapshot.targetStage.enginePackage);
  compare(stale, 'TARGET_STAGE_AUTHORITY_CHANGED',
    releaseRecord.targetStage.stageAuthority, snapshot.targetStage.stageAuthority);
  compare(stale, 'TARGET_INPUT_CONTRACT_ROLE_CHANGED',
    releaseRecord.targetStage.inputContractRole, snapshot.targetStage.inputContractRole);
  compare(stale, 'TARGET_RESULT_CONTRACT_ROLE_CHANGED',
    releaseRecord.targetStage.resultContractRole, snapshot.targetStage.resultContractRole);

  compare(stale, 'COMPOSITION_SCHEMA_CHANGED',
    releaseRecord.compositionRoot.compositionSchema, snapshot.compositionRoot.compositionSchema);
  compare(stale, 'COMPOSITION_ROOT_CHANGED',
    releaseRecord.compositionRoot.compositionRootId, snapshot.compositionRoot.compositionRootId);
  compare(stale, 'COMPOSITION_ROOT_HASH_CHANGED',
    releaseRecord.compositionRoot.compositionRootHash, snapshot.compositionRoot.compositionRootHash);
  compare(stale, 'COMPOSITION_COMPONENT_SET_CHANGED',
    releaseRecord.compositionRoot.componentIdsHash, snapshot.compositionRoot.componentIdsHash);
  compare(stale, 'COMPOSITION_RELEASE_BINDING_CHANGED',
    releaseRecord.compositionRoot.releaseStateBinding, snapshot.compositionRoot.releaseStateBinding);

  compare(stale, 'LIFECYCLE_PROFILE_ID_CHANGED',
    releaseRecord.lifecycleProfile.profileId, snapshot.lifecycleProfile.profileId);
  compare(stale, 'LIFECYCLE_PROFILE_HASH_CHANGED',
    releaseRecord.lifecycleProfile.profileHash, snapshot.lifecycleProfile.profileHash);
  compare(stale, 'LIFECYCLE_ARTIFACT_SET_CHANGED',
    releaseRecord.lifecycleProfile.artifactKindsHash, snapshot.lifecycleProfile.artifactKindsHash);
  compare(stale, 'LIFECYCLE_RESULT_REQUIREMENTS_CHANGED',
    releaseRecord.lifecycleProfile.resultRequiredKindsHash,
    snapshot.lifecycleProfile.resultRequiredKindsHash);
  compare(stale, 'LIFECYCLE_ASSESSMENT_REQUIREMENTS_CHANGED',
    releaseRecord.lifecycleProfile.assessmentRequiredKindsHash,
    snapshot.lifecycleProfile.assessmentRequiredKindsHash);
  for (const key of [
    'meshApplicable', 'recoveryApplicable', 'convergenceApplicable',
    'codeAssessmentApplicable',
  ]) {
    compare(stale, `LIFECYCLE_${key.toUpperCase()}_CHANGED`,
      releaseRecord.lifecycleProfile[key], snapshot.lifecycleProfile[key]);
  }

  if (releaseRecord.sourceAuthority.requiredSchema === null
    || releaseRecord.sourceAuthority.requiredRole === null
    || releaseRecord.sourceAuthority.canonicalizationProfile === null) {
    blocked.push('SOURCE_AUTHORITY_REQUIREMENT_NOT_BOUND');
  } else {
    compare(stale, 'SOURCE_AUTHORITY_SCHEMA_CHANGED',
      releaseRecord.sourceAuthority.requiredSchema,
      snapshot.sourceContract.sourceAuthoritySchema);
    compare(stale, 'SOURCE_AUTHORITY_ROLE_CHANGED',
      releaseRecord.sourceAuthority.requiredRole,
      snapshot.sourceContract.sourceAuthorityRole);
    compare(stale, 'SOURCE_CANONICALIZATION_PROFILE_CHANGED',
      releaseRecord.sourceAuthority.canonicalizationProfile,
      snapshot.sourceContract.canonicalizationProfile);
  }
  compare(stale, 'SOURCE_CONTRACT_ROLE_CHANGED',
    releaseRecord.targetStage.inputContractRole,
    snapshot.sourceContract.sourceContractRole);

  compare(stale, 'TARGET_UNIT_CONTRACT_CHANGED',
    releaseRecord.unitProjection.targetUnitContractHash,
    snapshot.unitProjection.targetUnitContractHash);

  compare(stale, 'PRODUCT_ADAPTER_APPLICABILITY_CHANGED',
    releaseRecord.productAdapter.applicability,
    snapshot.productAdapter.applicability);
  if (snapshot.productAdapter.applicability === 'REQUIRED') {
    if (releaseRecord.productAdapter.componentId === null
      || releaseRecord.productAdapter.componentHash === null
      || releaseRecord.productAdapter.productProfileHash === null) {
      blocked.push('PRODUCT_ADAPTER_REQUIREMENT_NOT_BOUND');
    } else {
      compare(stale, 'PRODUCT_ADAPTER_ID_CHANGED',
        releaseRecord.productAdapter.componentId, snapshot.productAdapter.componentId);
      compare(stale, 'PRODUCT_ADAPTER_COMPONENT_CHANGED',
        releaseRecord.productAdapter.componentHash, snapshot.productAdapter.componentHash);
      compare(stale, 'PRODUCT_ADAPTER_PROFILE_CHANGED',
        releaseRecord.productAdapter.productProfileHash,
        snapshot.productAdapter.productProfileHash);
    }
  }

  compare(stale, 'MESH_REQUIREMENT_CHANGED',
    releaseRecord.meshAuthority.applicability,
    snapshot.meshRequirement.applicability);
  compareArrays(stale, 'BENCHMARK_BINDING_IDS_CHANGED',
    releaseRecord.benchmarkManifests.manifestIds,
    snapshot.benchmarkBindings.manifestIds);
  compareArrays(stale, 'BENCHMARK_BINDING_HASHES_CHANGED',
    releaseRecord.benchmarkManifests.manifestHashes,
    snapshot.benchmarkBindings.manifestHashes);
  compare(stale, 'BENCHMARK_BINDING_STATE_CHANGED',
    releaseRecord.benchmarkManifests.bindingState,
    snapshot.benchmarkBindings.bindingState);

  if (snapshot.targetStage.engineState !== 'QUALIFIED_ROUTE_REGISTERED') {
    blocked.push(`TARGET_STAGE_ROUTE_NOT_QUALIFIED:${snapshot.targetStage.stageId}`);
  }
  if (snapshot.compositionRoot.releaseStateBinding !== 'RELEASE_NOT_QUALIFIED') {
    blocked.push('TARGET_RELEASE_STATE_BINDING_UNSUPPORTED');
  }

  const reasons = [...new Set([...stale, ...blocked])].sort();
  const status = stale.length ? 'STALE' : blocked.length ? 'BLOCKED' : 'CURRENT';
  const base = {
    schema: LAFEA_TEMPLATE_TARGET_COMPATIBILITY_SCHEMA,
    templateId: releaseRecord.template.templateId,
    templateSemanticHash: releaseRecord.template.templateSemanticHash,
    parameterSchemaHash: releaseRecord.parameterSchema.schemaHash,
    compilerBindingHash: releaseRecord.compiler.bindingHash,
    compilationHash: releaseRecord.handoff.compilationHash,
    handoffHash: releaseRecord.handoff.handoffHash,
    targetStage: snapshot.targetStage,
    compositionRoot: snapshot.compositionRoot,
    lifecycleProfile: snapshot.lifecycleProfile,
    sourceContract: snapshot.sourceContract,
    unitProjection: snapshot.unitProjection,
    productAdapter: snapshot.productAdapter,
    meshRequirement: snapshot.meshRequirement,
    benchmarkBindings: snapshot.benchmarkBindings,
    status,
    reasons,
    hashProfile: LAFEA_TEMPLATE_RELEASE_HASH_PROFILE,
  };
  return deepFreeze({ ...base, semanticHash: templateReleaseSha256(base) });
}

export function validateTemplateTargetCompatibilityReceipt(value) {
  const errors = [];
  try {
    exactKeys(value, TOP_KEYS, 'Target compatibility receipt');
    if (value.schema !== LAFEA_TEMPLATE_TARGET_COMPATIBILITY_SCHEMA) {
      throw new TypeError('Target compatibility receipt schema is invalid.');
    }
    if (!LAFEA_TEMPLATE_COMPATIBILITY_STATUSES.includes(value.status)) {
      throw new TypeError('Target compatibility receipt status is invalid.');
    }
    for (const [field, keys] of Object.entries(NESTED_KEYS)) {
      exactKeys(value[field], keys, field);
    }
    normalizeSnapshot({
      schema: LAFEA_TEMPLATE_TARGET_SNAPSHOT_SCHEMA,
      targetStage: value.targetStage,
      compositionRoot: value.compositionRoot,
      lifecycleProfile: value.lifecycleProfile,
      sourceContract: value.sourceContract,
      unitProjection: value.unitProjection,
      productAdapter: value.productAdapter,
      meshRequirement: value.meshRequirement,
      benchmarkBindings: value.benchmarkBindings,
      semanticHash: null,
    });
    text(value.templateId, 'templateId');
    hash(value.templateSemanticHash, 'templateSemanticHash');
    hash(value.parameterSchemaHash, 'parameterSchemaHash');
    nullableHash(value.compilerBindingHash, 'compilerBindingHash');
    nullableHash(value.compilationHash, 'compilationHash');
    nullableHash(value.handoffHash, 'handoffHash');
    strings(value.reasons, 'reasons');
    if (value.hashProfile !== LAFEA_TEMPLATE_RELEASE_HASH_PROFILE) {
      throw new TypeError('Target compatibility receipt hash profile is invalid.');
    }
    const base = { ...value };
    delete base.semanticHash;
    if (value.semanticHash !== templateReleaseSha256(base)) {
      throw new TypeError('Target compatibility receipt semantic hash is invalid.');
    }
    if (!isDeepFrozen(value)) {
      throw new TypeError('Target compatibility receipt must be deeply frozen.');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function normalizeSnapshot(value) {
  exactKeys(value, SNAPSHOT_KEYS, 'Target authority snapshot');
  for (const [field, keys] of Object.entries(NESTED_KEYS)) {
    exactKeys(value[field], keys, field);
  }
  const result = structuredClone(value);
  if (result.schema !== LAFEA_TEMPLATE_TARGET_SNAPSHOT_SCHEMA) {
    throw new TypeError('Target authority snapshot schema is invalid.');
  }
  result.semanticHash = nullableHash(value.semanticHash, 'semanticHash');

  for (const key of [
    'stageId', 'registrySchema', 'engineState', 'stageAuthority',
    'inputContractRole',
  ]) text(result.targetStage[key], `targetStage.${key}`);
  nullableText(result.targetStage.enginePackage, 'targetStage.enginePackage');
  nullableText(result.targetStage.resultContractRole, 'targetStage.resultContractRole');
  hash(result.targetStage.registryEntryHash, 'targetStage.registryEntryHash');

  for (const key of [
    'compositionSchema', 'compositionRootId', 'releaseStateBinding',
  ]) text(result.compositionRoot[key], `compositionRoot.${key}`);
  for (const key of ['compositionRootHash', 'componentIdsHash']) {
    hash(result.compositionRoot[key], `compositionRoot.${key}`);
  }

  for (const key of ['profileSchema', 'profileId']) {
    text(result.lifecycleProfile[key], `lifecycleProfile.${key}`);
  }
  for (const key of [
    'profileHash', 'artifactKindsHash', 'resultRequiredKindsHash',
    'assessmentRequiredKindsHash',
  ]) hash(result.lifecycleProfile[key], `lifecycleProfile.${key}`);
  for (const key of [
    'meshApplicable', 'recoveryApplicable', 'convergenceApplicable',
    'codeAssessmentApplicable',
  ]) boolean(result.lifecycleProfile[key], `lifecycleProfile.${key}`);

  for (const key of [
    'sourceAuthoritySchema', 'sourceAuthorityRole', 'sourceContractRole',
    'canonicalizationProfile',
  ]) text(result.sourceContract[key], `sourceContract.${key}`);

  text(result.unitProjection.unitResolverId, 'unitProjection.unitResolverId');
  text(result.unitProjection.unitSourceRole, 'unitProjection.unitSourceRole');
  hash(result.unitProjection.targetUnitContractHash,
    'unitProjection.targetUnitContractHash');

  applicability(result.productAdapter.applicability,
    'productAdapter.applicability');
  if (result.productAdapter.applicability === 'REQUIRED') {
    text(result.productAdapter.componentId, 'productAdapter.componentId');
    hash(result.productAdapter.componentHash, 'productAdapter.componentHash');
    hash(result.productAdapter.productProfileHash,
      'productAdapter.productProfileHash');
  } else {
    for (const key of ['componentId', 'componentHash', 'productProfileHash']) {
      if (result.productAdapter[key] !== null) {
        throw new TypeError(`productAdapter.${key} must be null when NOT_APPLICABLE.`);
      }
    }
  }

  applicability(result.meshRequirement.applicability,
    'meshRequirement.applicability');
  if (result.meshRequirement.applicability === 'REQUIRED') {
    for (const key of ['authoritySchema', 'authorityRole', 'requiredStatus']) {
      text(result.meshRequirement[key], `meshRequirement.${key}`);
    }
  } else {
    for (const key of ['authoritySchema', 'authorityRole', 'requiredStatus']) {
      if (result.meshRequirement[key] !== null) {
        throw new TypeError(`meshRequirement.${key} must be null when NOT_APPLICABLE.`);
      }
    }
  }

  text(result.benchmarkBindings.bindingState,
    'benchmarkBindings.bindingState');
  result.benchmarkBindings.manifestIds = strings(
    value.benchmarkBindings.manifestIds,
    'benchmarkBindings.manifestIds',
  );
  result.benchmarkBindings.manifestHashes = hashes(
    value.benchmarkBindings.manifestHashes,
    'benchmarkBindings.manifestHashes',
  );
  if (result.benchmarkBindings.manifestIds.length
    !== result.benchmarkBindings.manifestHashes.length) {
    throw new TypeError('Benchmark binding IDs and hashes must have equal length.');
  }
  return result;
}

function snapshotBasis(snapshot) {
  const basis = { ...snapshot };
  delete basis.semanticHash;
  return basis;
}

function compare(target, reason, expected, current) {
  if (expected !== current) target.push(reason);
}

function compareArrays(target, reason, expected, current) {
  if (JSON.stringify(expected) !== JSON.stringify(current)) target.push(reason);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new TypeError(`${label} exact-key contract mismatch.`);
  }
}

function hash(value, field) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    throw new TypeError(`${field} must be an engineering hash.`);
  }
  return value;
}
function nullableHash(value, field) { return value === null ? null : hash(value, field); }
function hashes(value, field) { return strings(value, field).map((entry) => hash(entry, field)); }
function applicability(value, field) {
  if (!['REQUIRED', 'NOT_APPLICABLE'].includes(value)) {
    throw new TypeError(`${field} is invalid.`);
  }
  return value;
}
function boolean(value, field) {
  if (typeof value !== 'boolean') throw new TypeError(`${field} must be boolean.`);
  return value;
}
function text(value, field) {
  if (typeof value !== 'string' || !value) throw new TypeError(`${field} must be non-empty text.`);
  return value;
}
function nullableText(value, field) { return value === null ? null : text(value, field); }
function strings(value, field) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry)) {
    throw new TypeError(`${field} must contain non-empty strings.`);
  }
  const sorted = [...value].sort();
  if (new Set(sorted).size !== sorted.length) throw new TypeError(`${field} values must be unique.`);
  return sorted;
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
