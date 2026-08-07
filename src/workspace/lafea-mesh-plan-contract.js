/** Preview-only deterministic mesh plan contract. A plan is never analysis-mesh authority. */
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { createLafeaMeshGenerationIntent } from './lafea-mesh-generation-intent.js';
import { buildLafeaMeshProducerReadiness } from './lafea-mesh-producer-contract.js';

export const LAFEA_MESH_PLAN_SCHEMA = 'lafea-mesh-plan/v1';
export const LAFEA_MESH_PLAN_RESOURCE_DISPOSITIONS = Object.freeze(['WITHIN_LIMITS', 'WARNING', 'BLOCK']);

const KEYS = Object.freeze([
  'schema', 'stageId', 'intentHash', 'capabilityHash', 'qualificationHash',
  'producerId', 'producerRevision', 'sourceHash', 'canonicalModelHash',
  'analysisGeometryHash', 'meshProfileHash', 'elementFamily', 'estimatedNodes',
  'estimatedElements', 'estimatedDofs', 'characteristicLengthMin',
  'characteristicLengthMedian', 'characteristicLengthMax', 'refinementEntityIds',
  'resourceDisposition',
]);

export function createLafeaMeshPlan(value) {
  requireExact(value, KEYS);
  if (value.schema !== LAFEA_MESH_PLAN_SCHEMA) fail('LAFEA_MESH_PLAN_SCHEMA_INVALID');
  const record = {
    schema: LAFEA_MESH_PLAN_SCHEMA,
    stageId: text(value.stageId, 'STAGE_ID'),
    intentHash: sha256(value.intentHash, 'INTENT_HASH'),
    capabilityHash: sha256(value.capabilityHash, 'CAPABILITY_HASH'),
    qualificationHash: sha256(value.qualificationHash, 'QUALIFICATION_HASH'),
    producerId: text(value.producerId, 'PRODUCER_ID'),
    producerRevision: text(value.producerRevision, 'PRODUCER_REVISION'),
    sourceHash: sha256(value.sourceHash, 'SOURCE_HASH'),
    canonicalModelHash: sha256(value.canonicalModelHash, 'CANONICAL_MODEL_HASH'),
    analysisGeometryHash: sha256(value.analysisGeometryHash, 'ANALYSIS_GEOMETRY_HASH'),
    meshProfileHash: text(value.meshProfileHash, 'MESH_PROFILE_HASH'),
    elementFamily: text(value.elementFamily, 'ELEMENT_FAMILY'),
    estimatedNodes: positiveInteger(value.estimatedNodes, 'ESTIMATED_NODES'),
    estimatedElements: positiveInteger(value.estimatedElements, 'ESTIMATED_ELEMENTS'),
    estimatedDofs: positiveInteger(value.estimatedDofs, 'ESTIMATED_DOFS'),
    characteristicLengthMin: positive(value.characteristicLengthMin, 'CHARACTERISTIC_LENGTH_MIN'),
    characteristicLengthMedian: positive(value.characteristicLengthMedian, 'CHARACTERISTIC_LENGTH_MEDIAN'),
    characteristicLengthMax: positive(value.characteristicLengthMax, 'CHARACTERISTIC_LENGTH_MAX'),
    refinementEntityIds: canonicalIds(value.refinementEntityIds),
    resourceDisposition: enumValue(value.resourceDisposition, LAFEA_MESH_PLAN_RESOURCE_DISPOSITIONS, 'RESOURCE_DISPOSITION'),
  };
  if (!(record.characteristicLengthMin <= record.characteristicLengthMedian
    && record.characteristicLengthMedian <= record.characteristicLengthMax)) fail('LAFEA_MESH_PLAN_CHARACTERISTIC_LENGTH_ORDER_INVALID');
  return freeze({
    ...record,
    planHash: canonicalLafeaSha256({ schema: 'lafea-mesh-plan-hash-input/v1', record }),
    producesMesh: false,
    engineeringAuthority: false,
  });
}

export function validateLafeaMeshPlan(value, context) {
  const { planHash, producesMesh, engineeringAuthority, ...input } = value || {};
  const rebuilt = createLafeaMeshPlan(input);
  if (planHash !== rebuilt.planHash) fail('LAFEA_MESH_PLAN_HASH_INVALID');
  if (producesMesh !== false || engineeringAuthority !== false) fail('LAFEA_MESH_PLAN_AUTHORITY_INVALID');
  const intent = rebuildIntent(context?.intent);
  const readiness = buildLafeaMeshProducerReadiness(intent, context?.capability, context?.qualification);
  requireMatch(rebuilt.intentHash, intent.semanticHash, 'INTENT_HASH');
  requireMatch(rebuilt.capabilityHash, readiness.capabilityHash, 'CAPABILITY_HASH');
  requireMatch(rebuilt.qualificationHash, readiness.qualificationHash, 'QUALIFICATION_HASH');
  requireMatch(rebuilt.producerId, readiness.producerId, 'PRODUCER_ID');
  requireMatch(rebuilt.producerRevision, readiness.producerRevision, 'PRODUCER_REVISION');
  for (const field of ['stageId', 'sourceHash', 'canonicalModelHash', 'analysisGeometryHash', 'meshProfileHash', 'elementFamily']) {
    requireMatch(rebuilt[field], intent[field], field.toUpperCase());
  }
  if (JSON.stringify(rebuilt.refinementEntityIds) !== JSON.stringify(intent.refinementEntityIds)) fail('LAFEA_MESH_PLAN_REFINEMENT_IDS_MISMATCH');
  const exceeds = rebuilt.estimatedNodes > intent.maximumNodes
    || rebuilt.estimatedElements > intent.maximumElements
    || rebuilt.estimatedDofs > intent.maximumEstimatedDofs;
  if (exceeds && rebuilt.resourceDisposition !== 'BLOCK') fail('LAFEA_MESH_PLAN_RESOURCE_DISPOSITION_INVALID');
  return rebuilt;
}

const INTENT_KEYS = Object.freeze([
  'schema', 'stageId', 'sourceHash', 'canonicalModelHash', 'analysisGeometryHash',
  'meshProfileHash', 'targetElementLength', 'lengthUnit', 'elementFamily',
  'curvatureToleranceDegrees', 'growthLimit', 'maximumNodes', 'maximumElements',
  'maximumEstimatedDofs', 'refinementEntityIds',
]);
function rebuildIntent(value) {
  const input = Object.fromEntries(INTENT_KEYS.map((key) => [key, value?.[key]]));
  const rebuilt = createLafeaMeshGenerationIntent(input);
  if (value?.semanticHash !== rebuilt.semanticHash) fail('LAFEA_MESH_PLAN_INTENT_HASH_INVALID');
  return rebuilt;
}
function requireMatch(actual, expected, field) { if (actual !== expected) fail(`LAFEA_MESH_PLAN_${field}_MISMATCH`); }
function canonicalIds(value) {
  if (!Array.isArray(value)) fail('LAFEA_MESH_PLAN_REFINEMENT_IDS_INVALID');
  const ids = value.map((id) => text(id, 'REFINEMENT_ID')).sort();
  if (new Set(ids).size !== ids.length) fail('LAFEA_MESH_PLAN_REFINEMENT_IDS_DUPLICATE');
  return ids;
}
function requireExact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail('LAFEA_MESH_PLAN_KEYS_INVALID');
}
function text(value, field) { if (typeof value !== 'string' || !value.trim()) fail(`LAFEA_MESH_PLAN_${field}_INVALID`); return value; }
function sha256(value, field) { if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) fail(`LAFEA_MESH_PLAN_${field}_INVALID`); return value; }
function positiveInteger(value, field) { if (!Number.isInteger(value) || value <= 0) fail(`LAFEA_MESH_PLAN_${field}_INVALID`); return value; }
function positive(value, field) { if (!Number.isFinite(value) || value <= 0) fail(`LAFEA_MESH_PLAN_${field}_INVALID`); return Object.is(value, -0) ? 0 : value; }
function enumValue(value, allowed, field) { if (!allowed.includes(value)) fail(`LAFEA_MESH_PLAN_${field}_INVALID`); return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
