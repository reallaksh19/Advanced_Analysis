/** Deterministic producer capability and qualification contracts; no mesh execution. */
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { createLafeaMeshGenerationIntent } from './lafea-mesh-generation-intent.js';
import { lafeaMeshCapabilities } from './lafea-mesh-capabilities.js';

export const LAFEA_MESH_PRODUCER_CAPABILITY_SCHEMA = 'lafea-mesh-producer-capability/v1';
export const LAFEA_MESH_PRODUCER_QUALIFICATION_SCHEMA = 'lafea-mesh-producer-qualification/v1';
export const LAFEA_MESH_PRODUCER_READINESS_SCHEMA = 'lafea-mesh-producer-readiness/v1';
export const LAFEA_MESH_REPEATABILITY_POLICY = 'BYTE_IDENTICAL_CANONICAL_MESH_V1';
export const LAFEA_MESH_ROLLBACK_POLICY = 'NO_CUSTODY_MUTATION_UNTIL_FULL_EVIDENCE_ACCEPTED';
export const LAFEA_MESH_PUBLICATION_POLICY = 'ATOMIC_EVIDENCE_CUSTODY_AFTER_VALIDATION';
export const LAFEA_MESH_PRODUCER_GENERATION_MODES = Object.freeze(['AUTOMATIC_MESH', 'REFINEMENT_REGENERATION']);

const CAPABILITY_KEYS = Object.freeze([
  'schema', 'producerId', 'producerRevision', 'scopes', 'generationModes',
  'supportsLocalRefinement', 'repeatabilityPolicy', 'qualityPolicyId', 'rollbackPolicy',
  'publicationPolicy', 'maximumNodes',
  'maximumElements', 'maximumEstimatedDofs',
]);
const QUALIFICATION_KEYS = Object.freeze([
  'schema', 'qualificationId', 'qualificationRevision', 'capabilityHash',
  'authorizedScopes', 'authorizedGenerationModes', 'localRefinementAuthorized',
  'maximumNodes', 'maximumElements', 'maximumEstimatedDofs', 'repeatabilityPolicy',
  'qualityPolicyId', 'rollbackPolicy', 'publicationPolicy', 'governanceRef',
  'invalidationPolicy',
]);
const INTENT_INPUT_KEYS = Object.freeze([
  'schema', 'stageId', 'sourceHash', 'canonicalModelHash', 'analysisGeometryHash',
  'meshProfileHash', 'targetElementLength', 'lengthUnit', 'elementFamily',
  'curvatureToleranceDegrees', 'growthLimit', 'maximumNodes', 'maximumElements',
  'maximumEstimatedDofs', 'refinementEntityIds',
]);

export function createLafeaMeshProducerCapability(value) {
  requireExact(value, CAPABILITY_KEYS, 'LAFEA_MESH_PRODUCER_CAPABILITY_KEYS_INVALID');
  if (value.schema !== LAFEA_MESH_PRODUCER_CAPABILITY_SCHEMA) fail('LAFEA_MESH_PRODUCER_CAPABILITY_SCHEMA_INVALID');
  const record = {
    schema: LAFEA_MESH_PRODUCER_CAPABILITY_SCHEMA,
    producerId: text(value.producerId, 'PRODUCER_ID'),
    producerRevision: text(value.producerRevision, 'PRODUCER_REVISION'),
    scopes: canonicalScopes(value.scopes),
    generationModes: canonicalModes(value.generationModes),
    supportsLocalRefinement: boolean(value.supportsLocalRefinement, 'LOCAL_REFINEMENT'),
    repeatabilityPolicy: exactText(value.repeatabilityPolicy, LAFEA_MESH_REPEATABILITY_POLICY, 'REPEATABILITY_POLICY'),
    qualityPolicyId: text(value.qualityPolicyId, 'QUALITY_POLICY_ID'),
    rollbackPolicy: exactText(value.rollbackPolicy, LAFEA_MESH_ROLLBACK_POLICY, 'ROLLBACK_POLICY'),
    publicationPolicy: exactText(value.publicationPolicy, LAFEA_MESH_PUBLICATION_POLICY, 'PUBLICATION_POLICY'),
    maximumNodes: positiveInteger(value.maximumNodes, 'MAXIMUM_NODES'),
    maximumElements: positiveInteger(value.maximumElements, 'MAXIMUM_ELEMENTS'),
    maximumEstimatedDofs: positiveInteger(value.maximumEstimatedDofs, 'MAXIMUM_ESTIMATED_DOFS'),
  };
  return seal(record, 'lafea-mesh-producer-capability-hash-input/v1', 'capabilityHash');
}

export function createLafeaMeshProducerQualification(value) {
  requireExact(value, QUALIFICATION_KEYS, 'LAFEA_MESH_PRODUCER_QUALIFICATION_KEYS_INVALID');
  if (value.schema !== LAFEA_MESH_PRODUCER_QUALIFICATION_SCHEMA) fail('LAFEA_MESH_PRODUCER_QUALIFICATION_SCHEMA_INVALID');
  const record = {
    schema: LAFEA_MESH_PRODUCER_QUALIFICATION_SCHEMA,
    qualificationId: text(value.qualificationId, 'QUALIFICATION_ID'),
    qualificationRevision: text(value.qualificationRevision, 'QUALIFICATION_REVISION'),
    capabilityHash: sha256(value.capabilityHash, 'CAPABILITY_HASH'),
    authorizedScopes: canonicalScopes(value.authorizedScopes),
    authorizedGenerationModes: canonicalModes(value.authorizedGenerationModes),
    localRefinementAuthorized: boolean(value.localRefinementAuthorized, 'LOCAL_REFINEMENT_AUTHORIZED'),
    maximumNodes: positiveInteger(value.maximumNodes, 'MAXIMUM_NODES'),
    maximumElements: positiveInteger(value.maximumElements, 'MAXIMUM_ELEMENTS'),
    maximumEstimatedDofs: positiveInteger(value.maximumEstimatedDofs, 'MAXIMUM_ESTIMATED_DOFS'),
    repeatabilityPolicy: exactText(value.repeatabilityPolicy, LAFEA_MESH_REPEATABILITY_POLICY, 'REPEATABILITY_POLICY'),
    qualityPolicyId: text(value.qualityPolicyId, 'QUALITY_POLICY_ID'),
    rollbackPolicy: exactText(value.rollbackPolicy, LAFEA_MESH_ROLLBACK_POLICY, 'ROLLBACK_POLICY'),
    publicationPolicy: exactText(value.publicationPolicy, LAFEA_MESH_PUBLICATION_POLICY, 'PUBLICATION_POLICY'),
    governanceRef: text(value.governanceRef, 'GOVERNANCE_REF'),
    invalidationPolicy: text(value.invalidationPolicy, 'INVALIDATION_POLICY'),
  };
  return seal(record, 'lafea-mesh-producer-qualification-hash-input/v1', 'qualificationHash');
}

export function validateLafeaMeshProducerQualification(value, capabilityValue) {
  const capability = rebuildCapability(capabilityValue);
  const qualification = rebuildQualification(value);
  if (qualification.capabilityHash !== capability.capabilityHash) fail('LAFEA_MESH_PRODUCER_QUALIFICATION_CAPABILITY_MISMATCH');
  requireScopesWithin(qualification.authorizedScopes, capability.scopes);
  if (qualification.authorizedGenerationModes.some((mode) => !capability.generationModes.includes(mode))) fail('LAFEA_MESH_PRODUCER_QUALIFICATION_MODE_WIDENING');
  if (qualification.localRefinementAuthorized && !capability.supportsLocalRefinement) fail('LAFEA_MESH_PRODUCER_QUALIFICATION_REFINEMENT_WIDENING');
  requireNotGreater(qualification.maximumNodes, capability.maximumNodes, 'MAXIMUM_NODES');
  requireNotGreater(qualification.maximumElements, capability.maximumElements, 'MAXIMUM_ELEMENTS');
  requireNotGreater(qualification.maximumEstimatedDofs, capability.maximumEstimatedDofs, 'MAXIMUM_ESTIMATED_DOFS');
  for (const key of ['repeatabilityPolicy', 'qualityPolicyId', 'rollbackPolicy', 'publicationPolicy']) {
    if (qualification[key] !== capability[key]) fail(`LAFEA_MESH_PRODUCER_QUALIFICATION_${key.toUpperCase()}_MISMATCH`);
  }
  return qualification;
}

export function buildLafeaMeshProducerReadiness(intentValue, capabilityValue, qualificationValue) {
  const intent = rebuildIntent(intentValue);
  const capability = rebuildCapability(capabilityValue);
  const qualification = validateLafeaMeshProducerQualification(qualificationValue, capability);
  const reasons = [];
  if (!scopeAllows(capability.scopes, intent.stageId, intent.elementFamily)) reasons.push('CAPABILITY_SCOPE_MISMATCH');
  if (!scopeAllows(qualification.authorizedScopes, intent.stageId, intent.elementFamily)) reasons.push('QUALIFICATION_SCOPE_MISMATCH');
  if (!capability.generationModes.includes('AUTOMATIC_MESH')) reasons.push('CAPABILITY_AUTOMATIC_MESH_MODE_MISSING');
  if (!qualification.authorizedGenerationModes.includes('AUTOMATIC_MESH')) reasons.push('QUALIFICATION_AUTOMATIC_MESH_MODE_MISSING');
  if (intent.maximumNodes > qualification.maximumNodes) reasons.push('NODE_LIMIT_EXCEEDS_QUALIFICATION');
  if (intent.maximumElements > qualification.maximumElements) reasons.push('ELEMENT_LIMIT_EXCEEDS_QUALIFICATION');
  if (intent.maximumEstimatedDofs > qualification.maximumEstimatedDofs) reasons.push('DOF_LIMIT_EXCEEDS_QUALIFICATION');
  const producerContractReady = reasons.length === 0;
  return freeze({
    schema: LAFEA_MESH_PRODUCER_READINESS_SCHEMA,
    stageId: intent.stageId,
    elementFamily: intent.elementFamily,
    intentHash: intent.semanticHash,
    capabilityHash: capability.capabilityHash,
    qualificationHash: qualification.qualificationHash,
    producerId: capability.producerId,
    producerRevision: capability.producerRevision,
    producerContractReady,
    executionAuthorized: false,
    reasons: producerContractReady ? ['REAL_PRODUCER_IMPLEMENTATION_NOT_BOUND'] : reasons,
  });
}

function rebuildCapability(value) {
  const { capabilityHash, ...input } = value || {};
  const rebuilt = createLafeaMeshProducerCapability(input);
  if (capabilityHash !== rebuilt.capabilityHash) fail('LAFEA_MESH_PRODUCER_CAPABILITY_HASH_INVALID');
  return rebuilt;
}
function rebuildQualification(value) {
  const { qualificationHash, ...input } = value || {};
  const rebuilt = createLafeaMeshProducerQualification(input);
  if (qualificationHash !== rebuilt.qualificationHash) fail('LAFEA_MESH_PRODUCER_QUALIFICATION_HASH_INVALID');
  return rebuilt;
}
function rebuildIntent(value) {
  const input = Object.fromEntries(INTENT_INPUT_KEYS.map((key) => [key, value?.[key]]));
  const rebuilt = createLafeaMeshGenerationIntent(input);
  if (value?.semanticHash !== rebuilt.semanticHash) fail('LAFEA_MESH_PRODUCER_INTENT_HASH_INVALID');
  return rebuilt;
}
function canonicalModes(value) {
  if (!Array.isArray(value) || value.length === 0) fail('LAFEA_MESH_PRODUCER_GENERATION_MODES_INVALID');
  const modes = value.map((mode) => text(mode, 'GENERATION_MODE')).sort();
  if (new Set(modes).size !== modes.length || modes.some((mode) => !LAFEA_MESH_PRODUCER_GENERATION_MODES.includes(mode))) fail('LAFEA_MESH_PRODUCER_GENERATION_MODES_INVALID');
  return modes;
}
function canonicalScopes(value) {
  if (!Array.isArray(value) || value.length === 0) fail('LAFEA_MESH_PRODUCER_SCOPES_INVALID');
  const rows = value.map((scope) => {
    requireExact(scope, ['stageId', 'elementFamilies'], 'LAFEA_MESH_PRODUCER_SCOPE_KEYS_INVALID');
    const stageId = text(scope.stageId, 'SCOPE_STAGE_ID');
    const capabilities = lafeaMeshCapabilities(stageId);
    if (!capabilities.applicable || !capabilities.generationRequestSupported) fail('LAFEA_MESH_PRODUCER_SCOPE_STAGE_NOT_APPLICABLE');
    if (!Array.isArray(scope.elementFamilies) || scope.elementFamilies.length === 0) fail('LAFEA_MESH_PRODUCER_SCOPE_FAMILIES_INVALID');
    const families = [...scope.elementFamilies].map((family) => text(family, 'SCOPE_ELEMENT_FAMILY')).sort();
    if (new Set(families).size !== families.length) fail('LAFEA_MESH_PRODUCER_SCOPE_FAMILIES_DUPLICATE');
    if (families.some((family) => !capabilities.allowedElementFamilies.includes(family))) fail('LAFEA_MESH_PRODUCER_SCOPE_FAMILY_NOT_AUTHORIZED');
    return freeze({ stageId, elementFamilies: families });
  }).sort((a, b) => a.stageId.localeCompare(b.stageId));
  if (new Set(rows.map((row) => row.stageId)).size !== rows.length) fail('LAFEA_MESH_PRODUCER_SCOPE_STAGE_DUPLICATE');
  return rows;
}
function requireScopesWithin(inner, outer) {
  for (const scope of inner) {
    for (const family of scope.elementFamilies) if (!scopeAllows(outer, scope.stageId, family)) fail('LAFEA_MESH_PRODUCER_QUALIFICATION_SCOPE_WIDENING');
  }
}
function scopeAllows(scopes, stageId, family) {
  return scopes.some((scope) => scope.stageId === stageId && scope.elementFamilies.includes(family));
}
function seal(record, schema, hashKey) {
  return freeze({ ...record, [hashKey]: canonicalLafeaSha256({ schema, record }) });
}
function requireNotGreater(value, ceiling, field) { if (value > ceiling) fail(`LAFEA_MESH_PRODUCER_QUALIFICATION_${field}_WIDENING`); }
function requireExact(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code);
}
function text(value, field) { if (typeof value !== 'string' || !value.trim()) fail(`LAFEA_MESH_PRODUCER_${field}_INVALID`); return value; }
function exactText(value, expected, field) { if (value !== expected) fail(`LAFEA_MESH_PRODUCER_${field}_INVALID`); return value; }
function boolean(value, field) { if (typeof value !== 'boolean') fail(`LAFEA_MESH_PRODUCER_${field}_INVALID`); return value; }
function positiveInteger(value, field) { if (!Number.isInteger(value) || value <= 0) fail(`LAFEA_MESH_PRODUCER_${field}_INVALID`); return value; }
function sha256(value, field) { if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) fail(`LAFEA_MESH_PRODUCER_${field}_INVALID`); return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
