/** Domain-first LAFEA.3 preparation and mesh-generation requests. Both remain non-executable. */
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { lafeaMeshCapabilities } from './lafea-mesh-capabilities.js';
import { requireLafeaPreparationProfile } from './lafea-preparation-profile.js';
import { requireLafeaStageAnalysisAdapter } from './lafea-stage-analysis-adapter.js';

export const LAFEA_PREPARATION_REQUEST_V2_SCHEMA = 'lafea-preparation-request/v2';
export const LAFEA_MESH_GENERATION_INTENT_V2_SCHEMA = 'lafea-mesh-generation-intent/v2';
export const LAFEA_MESH_GENERATION_INTENT_V2_STATUS = 'UNEXECUTABLE_INTENT';

const PREP_KEYS = Object.freeze([
  'schema', 'stageId', 'sourceHash', 'analysisDomainHash', 'analysisGeometryHash',
  'preparationProfileId', 'preparationProfileHash', 'requestedCaseIds',
  'stageAdapterId', 'stageAdapterRevision',
]);
const MESH_KEYS = Object.freeze([
  'schema', 'stageId', 'sourceHash', 'analysisDomainHash', 'analysisGeometryHash',
  'meshProfileHash', 'targetElementLength', 'lengthUnit', 'elementFamily',
  'curvatureToleranceDegrees', 'growthLimit', 'maximumNodes', 'maximumElements',
  'maximumEstimatedDofs', 'refinementFeatureIds', 'allowT3Fallback', 'stageAdapterId',
  'stageAdapterRevision',
]);

export function createLafeaPreparationRequestV2(value) {
  exact(value, PREP_KEYS, 'LAFEA_PREPARATION_V2_KEYS_INVALID');
  if (value.schema !== LAFEA_PREPARATION_REQUEST_V2_SCHEMA || value.stageId !== 'LAFEA.3') {
    fail('LAFEA_PREPARATION_V2_SCHEMA_OR_STAGE_INVALID');
  }
  return seal({
    schema: LAFEA_PREPARATION_REQUEST_V2_SCHEMA,
    stageId: 'LAFEA.3',
    sourceHash: sha256(value.sourceHash, 'SOURCE_HASH'),
    analysisDomainHash: sha256(value.analysisDomainHash, 'ANALYSIS_DOMAIN_HASH'),
    analysisGeometryHash: sha256(value.analysisGeometryHash, 'ANALYSIS_GEOMETRY_HASH'),
    preparationProfileId: text(value.preparationProfileId, 'PROFILE_ID'),
    preparationProfileHash: sha256(value.preparationProfileHash, 'PROFILE_HASH'),
    requestedCaseIds: ids(value.requestedCaseIds, 'REQUESTED_CASE_IDS'),
    stageAdapterId: text(value.stageAdapterId, 'STAGE_ADAPTER_ID'),
    stageAdapterRevision: text(value.stageAdapterRevision, 'STAGE_ADAPTER_REVISION'),
  }, 'lafea-preparation-request-hash-input/v2');
}

export function createLafeaMeshGenerationIntentV2(value) {
  exact(value, MESH_KEYS, 'LAFEA_MESH_GENERATION_V2_KEYS_INVALID');
  if (value.schema !== LAFEA_MESH_GENERATION_INTENT_V2_SCHEMA || value.stageId !== 'LAFEA.3') {
    fail('LAFEA_MESH_GENERATION_V2_SCHEMA_OR_STAGE_INVALID');
  }
  const capabilities = lafeaMeshCapabilities('LAFEA.3');
  if (!capabilities.allowedElementFamilies.includes(value.elementFamily)) {
    fail('LAFEA_MESH_GENERATION_V2_ELEMENT_FAMILY_NOT_AUTHORIZED');
  }
  if (typeof value.allowT3Fallback !== 'boolean') {
    fail('LAFEA_MESH_GENERATION_V2_T3_FALLBACK_POLICY_INVALID');
  }
  if (value.elementFamily === 'T3' && value.allowT3Fallback !== true) {
    fail('LAFEA_MESH_GENERATION_V2_T3_FALLBACK_NOT_AUTHORIZED');
  }
  const record = {
    schema: LAFEA_MESH_GENERATION_INTENT_V2_SCHEMA,
    stageId: 'LAFEA.3',
    sourceHash: sha256(value.sourceHash, 'SOURCE_HASH'),
    analysisDomainHash: sha256(value.analysisDomainHash, 'ANALYSIS_DOMAIN_HASH'),
    analysisGeometryHash: sha256(value.analysisGeometryHash, 'ANALYSIS_GEOMETRY_HASH'),
    meshProfileHash: sha256(value.meshProfileHash, 'MESH_PROFILE_HASH'),
    targetElementLength: positive(value.targetElementLength, 'TARGET_ELEMENT_LENGTH'),
    lengthUnit: text(value.lengthUnit, 'LENGTH_UNIT'),
    elementFamily: value.elementFamily,
    curvatureToleranceDegrees: positive(value.curvatureToleranceDegrees, 'CURVATURE_TOLERANCE_DEGREES'),
    growthLimit: positive(value.growthLimit, 'GROWTH_LIMIT'),
    maximumNodes: positiveInteger(value.maximumNodes, 'MAXIMUM_NODES'),
    maximumElements: positiveInteger(value.maximumElements, 'MAXIMUM_ELEMENTS'),
    maximumEstimatedDofs: positiveInteger(value.maximumEstimatedDofs, 'MAXIMUM_ESTIMATED_DOFS'),
    refinementFeatureIds: ids(value.refinementFeatureIds, 'REFINEMENT_FEATURE_IDS'),
    allowT3Fallback: value.allowT3Fallback,
    stageAdapterId: text(value.stageAdapterId, 'STAGE_ADAPTER_ID'),
    stageAdapterRevision: text(value.stageAdapterRevision, 'STAGE_ADAPTER_REVISION'),
  };
  const semanticHash = canonicalLafeaSha256({
    schema: 'lafea-mesh-generation-intent-hash-input/v2', intent: record,
  });
  return freeze({
    ...record, semanticHash,
    status: LAFEA_MESH_GENERATION_INTENT_V2_STATUS,
    executionAuthorized: false,
    producerRef: null,
    producesMesh: false,
    reason: 'QUALIFIED_DOMAIN_FIRST_MESH_PRODUCER_NOT_AVAILABLE',
  });
}

export function buildLafeaPreparationRequestV2FromStage(stage, requestedCaseIds = []) {
  requireDomainCurrent(stage);
  const adapter = requireLafeaStageAnalysisAdapter('LAFEA.3');
  const profile = requireLafeaPreparationProfile('LAFEA.3');
  return createLafeaPreparationRequestV2({
    schema: LAFEA_PREPARATION_REQUEST_V2_SCHEMA,
    stageId: 'LAFEA.3',
    sourceHash: currentSourceHash(stage),
    analysisDomainHash: stage.analysisDomainProjection.analysisDomainHash,
    analysisGeometryHash: stage.analysisGeometryProjection.analysisGeometryHash,
    preparationProfileId: profile.profileId,
    preparationProfileHash: profile.semanticHash,
    requestedCaseIds,
    stageAdapterId: adapter.adapterId,
    stageAdapterRevision: adapter.adapterId.split(':').at(-1),
  });
}

export function buildLafeaMeshGenerationIntentV2FromStage(stage, configuration) {
  requireDomainCurrent(stage);
  const adapter = requireLafeaStageAnalysisAdapter('LAFEA.3');
  return createLafeaMeshGenerationIntentV2({
    schema: LAFEA_MESH_GENERATION_INTENT_V2_SCHEMA,
    stageId: 'LAFEA.3',
    sourceHash: currentSourceHash(stage),
    analysisDomainHash: stage.analysisDomainProjection.analysisDomainHash,
    analysisGeometryHash: stage.analysisGeometryProjection.analysisGeometryHash,
    meshProfileHash: configuration.meshProfileHash,
    targetElementLength: configuration.targetElementLength,
    lengthUnit: configuration.lengthUnit,
    elementFamily: configuration.elementFamily,
    curvatureToleranceDegrees: configuration.curvatureToleranceDegrees,
    growthLimit: configuration.growthLimit,
    maximumNodes: configuration.maximumNodes,
    maximumElements: configuration.maximumElements,
    maximumEstimatedDofs: configuration.maximumEstimatedDofs,
    refinementFeatureIds: configuration.refinementFeatureIds ?? [],
    allowT3Fallback: configuration.allowT3Fallback === true,
    stageAdapterId: adapter.adapterId,
    stageAdapterRevision: adapter.adapterId.split(':').at(-1),
  });
}

export function buildLafeaDomainPreparationProjection(stage) {
  if (!stage?.domainFirstProfileActive) return null;
  const domain = stage.analysisDomainProjection;
  const geometry = stage.analysisGeometryProjection;
  const reasons = [];
  if (domain?.state !== 'CURRENT_PASS') reasons.push(...(domain?.reasons ?? ['ANALYSIS_DOMAIN_NOT_CURRENT']));
  if (geometry?.state !== 'CURRENT_PASS') reasons.push(...(geometry?.reasons ?? ['ANALYSIS_GEOMETRY_NOT_CURRENT']));
  if (reasons.length) return projection('STALE', false, reasons);
  return projection('ABSENT', false, [
    'LAFEA_DOMAIN_PREPARATION_PRODUCER_NOT_QUALIFIED',
    'LAFEA_PREPARATION_EVIDENCE_V2_ABSENT',
  ]);
}

function projection(state, usableForAuthorization, reasons) {
  return freeze({
    schema: 'lafea-preparation-projection/v2',
    stageId: 'LAFEA.3',
    state,
    usableForAuthorization,
    reasons: [...new Set(reasons)],
    evidenceHash: null,
    approvalHash: null,
    producerRef: null,
    preparationProfileHash: null,
    warningFindingIds: [],
    blockingFindingIds: [],
  });
}
function requireDomainCurrent(stage) {
  if (!stage?.domainFirstProfileActive
    || stage.analysisDomainProjection?.state !== 'CURRENT_PASS'
    || stage.analysisGeometryProjection?.state !== 'CURRENT_PASS') {
    fail('LAFEA_DOMAIN_FIRST_REQUEST_PARENTS_NOT_CURRENT');
  }
}
function currentSourceHash(stage) {
  const value = stage.sourceAuthority?.sourceHash ?? stage.lifecycle?.source?.sourceHash;
  return sha256(value, 'SOURCE_HASH');
}
function seal(record, schema) { return freeze({ ...record, semanticHash: canonicalLafeaSha256({ schema, record }) }); }
function ids(value, field) { if (!Array.isArray(value)) fail(`LAFEA_DOMAIN_REQUEST_${field}_INVALID`); const out = value.map((row) => text(row, field)).sort(compare); if (new Set(out).size !== out.length) fail(`LAFEA_DOMAIN_REQUEST_${field}_DUPLICATE`); return out; }
function exact(value, keys, code) { if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code); }
function text(value, field) { if (typeof value !== 'string' || !value.trim()) fail(`LAFEA_DOMAIN_REQUEST_${field}_INVALID`); return value.trim(); }
function sha256(value, field) { const out = text(value, field); if (!/^sha256:[0-9a-f]{64}$/u.test(out)) fail(`LAFEA_DOMAIN_REQUEST_${field}_INVALID`); return out; }
function positive(value, field) { if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) fail(`LAFEA_DOMAIN_REQUEST_${field}_INVALID`); return value; }
function positiveInteger(value, field) { if (!Number.isInteger(value) || value <= 0) fail(`LAFEA_DOMAIN_REQUEST_${field}_INVALID`); return value; }
function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
