/** Mesh-independent LAFEA.3 physical-domain contract with geometry-feature attachments. */
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  lafeaAnalysisGeometryFeatureInventory,
  validateLafeaAnalysisGeometry,
} from './lafea-analysis-geometry-contract.js';

export const LAFEA_CONTINUUM_ANALYSIS_DOMAIN_SCHEMA = 'lafea-continuum-analysis-domain/v1';
export const LAFEA_CONTINUUM_FORMULATIONS = Object.freeze(['PLANE_STRESS', 'PLANE_STRAIN']);
export const LAFEA_DOMAIN_ATTACHMENT_KINDS = Object.freeze([
  'RESTRAINT', 'IMPOSED_DISPLACEMENT', 'CONCENTRATED_LOAD', 'TRACTION',
  'PRESSURE', 'BODY_FORCE', 'TEMPERATURE',
]);
export const LAFEA_DOMAIN_TARGET_TYPES = Object.freeze(['VERTEX', 'SEGMENT', 'REGION']);

const DOMAIN_KEYS = Object.freeze([
  'schema', 'stageId', 'sourceHash', 'applicationRef', 'units', 'formulation',
  'region', 'geometryFeatureIds', 'physicalCases', 'attachments',
]);
const UNIT_KEYS = Object.freeze(['length', 'force', 'stress', 'temperature']);
const REGION_KEYS = Object.freeze(['regionId', 'materialRef', 'geometryId', 'analysisGeometryHash']);
const FEATURE_KEYS = Object.freeze(['vertexIds', 'segmentIds', 'regionIds']);
const CASE_KEYS = Object.freeze(['caseId']);
const ATTACHMENT_KEYS = Object.freeze([
  'attachmentId', 'kind', 'targetType', 'targetId', 'physicalCaseIds', 'payload',
]);

export function createLafeaContinuumAnalysisDomain(value, geometryValue) {
  exact(value, [
    'schema', 'stageId', 'sourceHash', 'applicationRef', 'units', 'formulation',
    'region', 'physicalCases', 'attachments',
  ], 'LAFEA_CONTINUUM_DOMAIN_KEYS_INVALID');
  if (value.schema !== LAFEA_CONTINUUM_ANALYSIS_DOMAIN_SCHEMA || value.stageId !== 'LAFEA.3') {
    fail('LAFEA_CONTINUUM_DOMAIN_SCHEMA_OR_STAGE_INVALID');
  }
  const geometry = validateLafeaAnalysisGeometry(geometryValue);
  if (geometry.stageId !== value.stageId) fail('LAFEA_CONTINUUM_DOMAIN_GEOMETRY_STAGE_MISMATCH');
  const inventory = lafeaAnalysisGeometryFeatureInventory(geometry);
  const region = canonicalRegion(value.region, geometry);
  const physicalCases = canonicalCases(value.physicalCases);
  const caseIds = new Set(physicalCases.map((row) => row.caseId));
  const features = freeze({
    vertexIds: [...inventory.vertexIds],
    segmentIds: [...inventory.segmentIds],
    regionIds: [region.regionId],
  });
  const attachments = canonicalAttachments(value.attachments, features, caseIds);
  return seal({
    schema: LAFEA_CONTINUUM_ANALYSIS_DOMAIN_SCHEMA,
    stageId: 'LAFEA.3',
    sourceHash: sha256(value.sourceHash, 'SOURCE_HASH'),
    applicationRef: text(value.applicationRef, 'APPLICATION_REF'),
    units: canonicalUnits(value.units),
    formulation: member(value.formulation, LAFEA_CONTINUUM_FORMULATIONS, 'FORMULATION'),
    region,
    geometryFeatureIds: features,
    physicalCases,
    attachments,
  });
}

export function validateLafeaContinuumAnalysisDomain(value, geometryValue = null) {
  exact(value, [...DOMAIN_KEYS, 'semanticHash'], 'LAFEA_CONTINUUM_DOMAIN_SEALED_KEYS_INVALID');
  if (value.schema !== LAFEA_CONTINUUM_ANALYSIS_DOMAIN_SCHEMA || value.stageId !== 'LAFEA.3') {
    fail('LAFEA_CONTINUUM_DOMAIN_SCHEMA_OR_STAGE_INVALID');
  }
  const canonical = canonicalSealedParts(value);
  if (canonicalLafeaSha256({
    schema: 'lafea-continuum-analysis-domain-hash-input/v1',
    domain: canonical,
  }) !== value.semanticHash) fail('LAFEA_CONTINUUM_DOMAIN_TAMPERED');
  if (geometryValue) verifyGeometryBinding(canonical, geometryValue);
  return freeze({ ...canonical, semanticHash: value.semanticHash });
}

function canonicalSealedParts(value) {
  exact(value.units, UNIT_KEYS, 'LAFEA_CONTINUUM_DOMAIN_UNIT_KEYS_INVALID');
  exact(value.region, REGION_KEYS, 'LAFEA_CONTINUUM_DOMAIN_REGION_KEYS_INVALID');
  exact(value.geometryFeatureIds, FEATURE_KEYS, 'LAFEA_CONTINUUM_DOMAIN_FEATURE_KEYS_INVALID');
  const physicalCases = canonicalCases(value.physicalCases);
  const caseIds = new Set(physicalCases.map((row) => row.caseId));
  const features = freeze({
    vertexIds: ids(value.geometryFeatureIds.vertexIds, 'VERTEX_IDS'),
    segmentIds: ids(value.geometryFeatureIds.segmentIds, 'SEGMENT_IDS'),
    regionIds: ids(value.geometryFeatureIds.regionIds, 'REGION_IDS'),
  });
  const region = freeze({
    regionId: text(value.region.regionId, 'REGION_ID'),
    materialRef: text(value.region.materialRef, 'MATERIAL_REF'),
    geometryId: text(value.region.geometryId, 'GEOMETRY_ID'),
    analysisGeometryHash: sha256(value.region.analysisGeometryHash, 'ANALYSIS_GEOMETRY_HASH'),
  });
  if (!features.regionIds.includes(region.regionId) || features.regionIds.length !== 1) {
    fail('LAFEA_CONTINUUM_DOMAIN_REGION_FEATURE_INVALID');
  }
  return freeze({
    schema: LAFEA_CONTINUUM_ANALYSIS_DOMAIN_SCHEMA,
    stageId: 'LAFEA.3',
    sourceHash: sha256(value.sourceHash, 'SOURCE_HASH'),
    applicationRef: text(value.applicationRef, 'APPLICATION_REF'),
    units: canonicalUnits(value.units),
    formulation: member(value.formulation, LAFEA_CONTINUUM_FORMULATIONS, 'FORMULATION'),
    region,
    geometryFeatureIds: features,
    physicalCases,
    attachments: canonicalAttachments(value.attachments, features, caseIds),
  });
}

function canonicalRegion(value, geometry) {
  exact(value, ['regionId', 'materialRef'], 'LAFEA_CONTINUUM_DOMAIN_REGION_INPUT_KEYS_INVALID');
  return freeze({
    regionId: text(value.regionId, 'REGION_ID'),
    materialRef: text(value.materialRef, 'MATERIAL_REF'),
    geometryId: geometry.geometryId,
    analysisGeometryHash: geometry.semanticHash,
  });
}
function canonicalUnits(value) {
  exact(value, UNIT_KEYS, 'LAFEA_CONTINUUM_DOMAIN_UNIT_KEYS_INVALID');
  return freeze(Object.fromEntries(UNIT_KEYS.map((key) => [key, text(value[key], `UNIT_${key.toUpperCase()}`)])));
}
function canonicalCases(value) {
  if (!Array.isArray(value) || value.length === 0) fail('LAFEA_CONTINUUM_DOMAIN_PHYSICAL_CASES_INVALID');
  const rows = value.map((row) => {
    exact(row, CASE_KEYS, 'LAFEA_CONTINUUM_DOMAIN_CASE_KEYS_INVALID');
    return freeze({ caseId: text(row.caseId, 'CASE_ID') });
  }).sort((a, b) => compare(a.caseId, b.caseId));
  unique(rows.map((row) => row.caseId), 'LAFEA_CONTINUUM_DOMAIN_CASE_ID_DUPLICATE');
  return rows;
}
function canonicalAttachments(value, features, caseIds) {
  if (!Array.isArray(value)) fail('LAFEA_CONTINUUM_DOMAIN_ATTACHMENTS_INVALID');
  const rows = value.map((row) => {
    exact(row, ATTACHMENT_KEYS, 'LAFEA_CONTINUUM_DOMAIN_ATTACHMENT_KEYS_INVALID');
    const kind = member(row.kind, LAFEA_DOMAIN_ATTACHMENT_KINDS, 'ATTACHMENT_KIND');
    const targetType = member(row.targetType, LAFEA_DOMAIN_TARGET_TYPES, 'TARGET_TYPE');
    requireTarget(kind, targetType);
    const targetId = text(row.targetId, 'TARGET_ID');
    const allowed = targetType === 'VERTEX' ? features.vertexIds
      : targetType === 'SEGMENT' ? features.segmentIds : features.regionIds;
    if (!allowed.includes(targetId)) fail('LAFEA_CONTINUUM_DOMAIN_ATTACHMENT_TARGET_UNKNOWN');
    const physicalCaseIds = ids(row.physicalCaseIds, 'ATTACHMENT_CASE_IDS');
    if (physicalCaseIds.some((id) => !caseIds.has(id))) {
      fail('LAFEA_CONTINUUM_DOMAIN_ATTACHMENT_CASE_UNKNOWN');
    }
    rejectMeshAuthority(row.payload, '$.payload');
    return freeze({
      attachmentId: text(row.attachmentId, 'ATTACHMENT_ID'),
      kind, targetType, targetId, physicalCaseIds,
      payload: canonicalPayload(row.payload),
    });
  }).sort((a, b) => compare(a.attachmentId, b.attachmentId));
  unique(rows.map((row) => row.attachmentId), 'LAFEA_CONTINUUM_DOMAIN_ATTACHMENT_ID_DUPLICATE');
  return rows;
}
function requireTarget(kind, targetType) {
  const allowed = {
    RESTRAINT: ['VERTEX', 'SEGMENT'],
    IMPOSED_DISPLACEMENT: ['VERTEX', 'SEGMENT'],
    CONCENTRATED_LOAD: ['VERTEX'],
    TRACTION: ['SEGMENT'],
    PRESSURE: ['SEGMENT'],
    BODY_FORCE: ['REGION'],
    TEMPERATURE: ['REGION'],
  }[kind];
  if (!allowed.includes(targetType)) fail('LAFEA_CONTINUUM_DOMAIN_ATTACHMENT_TARGET_TYPE_INVALID');
}
function verifyGeometryBinding(domain, geometryValue) {
  const geometry = validateLafeaAnalysisGeometry(geometryValue);
  if (geometry.semanticHash !== domain.region.analysisGeometryHash
    || geometry.geometryId !== domain.region.geometryId) {
    fail('LAFEA_CONTINUUM_DOMAIN_GEOMETRY_BINDING_INVALID');
  }
  const inventory = lafeaAnalysisGeometryFeatureInventory(geometry);
  if (JSON.stringify(inventory.vertexIds) !== JSON.stringify(domain.geometryFeatureIds.vertexIds)
    || JSON.stringify(inventory.segmentIds) !== JSON.stringify(domain.geometryFeatureIds.segmentIds)) {
    fail('LAFEA_CONTINUUM_DOMAIN_GEOMETRY_FEATURE_BINDING_INVALID');
  }
}
function rejectMeshAuthority(value, path) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return;
  if (Array.isArray(value)) return value.forEach((row, index) => rejectMeshAuthority(row, `${path}[${index}]`));
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    fail('LAFEA_CONTINUUM_DOMAIN_ATTACHMENT_PAYLOAD_INVALID');
  }
  for (const [key, child] of Object.entries(value)) {
    if (/^(nodeId|nodeIds|elementId|elementIds|meshHash|canonicalModelHash)$/u.test(key)) {
      fail('LAFEA_CONTINUUM_DOMAIN_MESH_AUTHORITY_FORBIDDEN');
    }
    rejectMeshAuthority(child, `${path}.${key}`);
  }
}
function canonicalPayload(value) { canonicalLafeaSha256(value); return freeze(structuredClone(value)); }
function seal(record) { return freeze({ ...record, semanticHash: canonicalLafeaSha256({ schema: 'lafea-continuum-analysis-domain-hash-input/v1', domain: record }) }); }
function ids(value, field) { if (!Array.isArray(value)) fail(`LAFEA_CONTINUUM_DOMAIN_${field}_INVALID`); const out = value.map((row) => text(row, field)).sort(compare); unique(out, `LAFEA_CONTINUUM_DOMAIN_${field}_DUPLICATE`); return out; }
function exact(value, keys, code) { if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code); }
function unique(values, code) { if (new Set(values).size !== values.length) fail(code); }
function text(value, field) { if (typeof value !== 'string' || !value.trim()) fail(`LAFEA_CONTINUUM_DOMAIN_${field}_INVALID`); return value.trim(); }
function sha256(value, field) { const out = text(value, field); if (!/^sha256:[0-9a-f]{64}$/u.test(out)) fail(`LAFEA_CONTINUUM_DOMAIN_${field}_INVALID`); return out; }
function member(value, allowed, field) { if (!allowed.includes(value)) fail(`LAFEA_CONTINUUM_DOMAIN_${field}_INVALID`); return value; }
function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
