/** Domain-first adapter from mesh-generation intent v2 into the retained MP1 capability/qualification boundary. */
import {
  LAFEA_MESH_PRODUCER_CAPABILITY_SCHEMA,
  LAFEA_MESH_PRODUCER_QUALIFICATION_SCHEMA,
  createLafeaMeshProducerCapability,
  validateLafeaMeshProducerQualification,
} from './lafea-mesh-producer-contract.js';
import {
  LAFEA_MESH_GENERATION_INTENT_V2_SCHEMA,
  createLafeaMeshGenerationIntentV2,
} from './lafea-domain-first-requests.js';

export const LAFEA_MESH_PRODUCER_READINESS_V2_SCHEMA = 'lafea-mesh-producer-readiness/v2';

export function buildLafeaMeshProducerReadinessV2(intentValue, capabilityValue, qualificationValue) {
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
    schema: LAFEA_MESH_PRODUCER_READINESS_V2_SCHEMA,
    stageId: intent.stageId,
    elementFamily: intent.elementFamily,
    intentHash: intent.semanticHash,
    analysisDomainHash: intent.analysisDomainHash,
    analysisGeometryHash: intent.analysisGeometryHash,
    capabilityHash: capability.capabilityHash,
    qualificationHash: qualification.qualificationHash,
    producerId: capability.producerId,
    producerRevision: capability.producerRevision,
    producerContractReady,
    executionAuthorized: false,
    reasons: producerContractReady ? ['REAL_PRODUCER_IMPLEMENTATION_NOT_BOUND'] : reasons,
  });
}

function rebuildIntent(value) {
  const input = {
    schema: value?.schema,
    stageId: value?.stageId,
    sourceHash: value?.sourceHash,
    analysisDomainHash: value?.analysisDomainHash,
    analysisGeometryHash: value?.analysisGeometryHash,
    meshProfileHash: value?.meshProfileHash,
    targetElementLength: value?.targetElementLength,
    lengthUnit: value?.lengthUnit,
    elementFamily: value?.elementFamily,
    curvatureToleranceDegrees: value?.curvatureToleranceDegrees,
    growthLimit: value?.growthLimit,
    maximumNodes: value?.maximumNodes,
    maximumElements: value?.maximumElements,
    maximumEstimatedDofs: value?.maximumEstimatedDofs,
    refinementFeatureIds: value?.refinementFeatureIds,
    allowT3Fallback: value?.allowT3Fallback,
    stageAdapterId: value?.stageAdapterId,
    stageAdapterRevision: value?.stageAdapterRevision,
  };
  if (input.schema !== LAFEA_MESH_GENERATION_INTENT_V2_SCHEMA) fail('LAFEA_MESH_PRODUCER_V2_INTENT_SCHEMA_INVALID');
  const rebuilt = createLafeaMeshGenerationIntentV2(input);
  if (value?.semanticHash !== rebuilt.semanticHash) fail('LAFEA_MESH_PRODUCER_V2_INTENT_HASH_INVALID');
  return rebuilt;
}
function rebuildCapability(value) {
  const { capabilityHash, ...input } = value || {};
  if (input.schema !== LAFEA_MESH_PRODUCER_CAPABILITY_SCHEMA) fail('LAFEA_MESH_PRODUCER_V2_CAPABILITY_SCHEMA_INVALID');
  const rebuilt = createLafeaMeshProducerCapability(input);
  if (capabilityHash !== rebuilt.capabilityHash) fail('LAFEA_MESH_PRODUCER_V2_CAPABILITY_HASH_INVALID');
  return rebuilt;
}
function scopeAllows(scopes, stageId, family) {
  return scopes.some((scope) => scope.stageId === stageId && scope.elementFamilies.includes(family));
}
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
