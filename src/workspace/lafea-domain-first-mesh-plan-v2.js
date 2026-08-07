import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { bindLafeaDomainFirstT6Producer } from './lafea-domain-first-t6-producer-policy.js';
import { canonicalLafeaMeshProfileParentHash } from './lafea-domain-first-mesh-profile.js';

export const LAFEA_DOMAIN_FIRST_MESH_PLAN_SCHEMA = 'lafea-mesh-plan/v2';
export const LAFEA_DOMAIN_FIRST_MESH_PLAN_RESOURCE_DISPOSITIONS =
  Object.freeze(['WITHIN_LIMITS', 'WARNING', 'BLOCK']);
export const LAFEA_DOMAIN_FIRST_MESH_PLAN_POLICY_DISPOSITIONS =
  Object.freeze(['PASS', 'BLOCK']);

const KEYS = Object.freeze([
  'schema', 'stageId', 'intentHash', 'capabilityHash', 'qualificationHash',
  'producerId', 'producerRevision', 'sourceHash', 'analysisDomainHash',
  'analysisGeometryHash', 'meshProfileHash', 'elementFamily',
  'estimatedNodes', 'estimatedElements', 'estimatedDofs', 'boundaryCornerCount',
  'characteristicLengthMin', 'characteristicLengthMedian',
  'characteristicLengthMax', 'observedAdjacentSizeRatioMax',
  'refinementFeatureIds', 'resourceDisposition', 'policyDisposition',
  'blockingReasons', 'scopeLimitations',
]);

export function createLafeaDomainFirstMeshPlanV2(value) {
  exact(value, KEYS);
  if (value.schema !== LAFEA_DOMAIN_FIRST_MESH_PLAN_SCHEMA) fail('LAFEA_MP3_PLAN_SCHEMA_INVALID');
  if (value.stageId !== 'LAFEA.3' || value.elementFamily !== 'T6') {
    fail('LAFEA_MP3_PLAN_SCOPE_INVALID');
  }
  const record = {
    schema: LAFEA_DOMAIN_FIRST_MESH_PLAN_SCHEMA,
    stageId: 'LAFEA.3',
    intentHash: sha(value.intentHash, 'INTENT_HASH'),
    capabilityHash: sha(value.capabilityHash, 'CAPABILITY_HASH'),
    qualificationHash: sha(value.qualificationHash, 'QUALIFICATION_HASH'),
    producerId: text(value.producerId, 'PRODUCER_ID'),
    producerRevision: text(value.producerRevision, 'PRODUCER_REVISION'),
    sourceHash: sha(value.sourceHash, 'SOURCE_HASH'),
    analysisDomainHash: sha(value.analysisDomainHash, 'ANALYSIS_DOMAIN_HASH'),
    analysisGeometryHash: sha(value.analysisGeometryHash, 'ANALYSIS_GEOMETRY_HASH'),
    meshProfileHash: canonicalLafeaMeshProfileParentHash(value.meshProfileHash),
    elementFamily: 'T6',
    estimatedNodes: integer(value.estimatedNodes, 'ESTIMATED_NODES'),
    estimatedElements: integer(value.estimatedElements, 'ESTIMATED_ELEMENTS'),
    estimatedDofs: integer(value.estimatedDofs, 'ESTIMATED_DOFS'),
    boundaryCornerCount: integer(value.boundaryCornerCount, 'BOUNDARY_CORNER_COUNT'),
    characteristicLengthMin: positive(value.characteristicLengthMin, 'CHARACTERISTIC_LENGTH_MIN'),
    characteristicLengthMedian: positive(value.characteristicLengthMedian, 'CHARACTERISTIC_LENGTH_MEDIAN'),
    characteristicLengthMax: positive(value.characteristicLengthMax, 'CHARACTERISTIC_LENGTH_MAX'),
    observedAdjacentSizeRatioMax: positive(value.observedAdjacentSizeRatioMax, 'ADJACENT_SIZE_RATIO'),
    refinementFeatureIds: ids(value.refinementFeatureIds),
    resourceDisposition: member(value.resourceDisposition,
      LAFEA_DOMAIN_FIRST_MESH_PLAN_RESOURCE_DISPOSITIONS, 'RESOURCE_DISPOSITION'),
    policyDisposition: member(value.policyDisposition,
      LAFEA_DOMAIN_FIRST_MESH_PLAN_POLICY_DISPOSITIONS, 'POLICY_DISPOSITION'),
    blockingReasons: ids(value.blockingReasons),
    scopeLimitations: ids(value.scopeLimitations),
  };
  if (!(record.characteristicLengthMin <= record.characteristicLengthMedian
    && record.characteristicLengthMedian <= record.characteristicLengthMax)) {
    fail('LAFEA_MP3_PLAN_CHARACTERISTIC_LENGTH_ORDER_INVALID');
  }
  return freeze({
    ...record,
    planHash: canonicalLafeaSha256({ schema: 'lafea-mesh-plan-hash-input/v2', record }),
    producesMesh: false,
    engineeringAuthority: false,
  });
}

export function validateLafeaDomainFirstMeshPlanV2(value, intent) {
  const { planHash, producesMesh, engineeringAuthority, ...input } = value || {};
  const plan = createLafeaDomainFirstMeshPlanV2(input);
  if (planHash !== plan.planHash || producesMesh !== false || engineeringAuthority !== false) {
    fail('LAFEA_MP3_PLAN_TAMPERED');
  }
  const binding = bindLafeaDomainFirstT6Producer(intent);
  for (const field of [
    'stageId', 'intentHash', 'capabilityHash', 'qualificationHash',
    'producerId', 'producerRevision', 'sourceHash', 'analysisDomainHash',
    'analysisGeometryHash', 'meshProfileHash', 'elementFamily',
  ]) {
    const expected = field === 'intentHash' ? intent.semanticHash
      : field === 'capabilityHash' ? binding.capabilityHash
      : field === 'qualificationHash' ? binding.qualificationHash
      : field === 'producerId' ? binding.producerId
      : field === 'producerRevision' ? binding.producerRevision
      : intent[field];
    if (plan[field] !== expected) fail(`LAFEA_MP3_PLAN_${field.toUpperCase()}_MISMATCH`);
  }
  if (JSON.stringify(plan.refinementFeatureIds) !== JSON.stringify(intent.refinementFeatureIds)) {
    fail('LAFEA_MP3_PLAN_REFINEMENT_FEATURES_MISMATCH');
  }
  return plan;
}

function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    fail('LAFEA_MP3_PLAN_KEYS_INVALID');
  }
}
function ids(value) {
  if (!Array.isArray(value)) fail('LAFEA_MP3_PLAN_IDS_INVALID');
  const out = value.map((row) => text(row, 'ID')).sort();
  if (new Set(out).size !== out.length) fail('LAFEA_MP3_PLAN_IDS_DUPLICATE');
  return out;
}
function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) fail(`LAFEA_MP3_PLAN_${field}_INVALID`);
  return value.trim();
}
function sha(value, field) {
  const out = text(value, field);
  if (!/^sha256:[0-9a-f]{64}$/u.test(out)) fail(`LAFEA_MP3_PLAN_${field}_INVALID`);
  return out;
}
function integer(value, field) {
  if (!Number.isInteger(value) || value <= 0) fail(`LAFEA_MP3_PLAN_${field}_INVALID`);
  return value;
}
function positive(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    fail(`LAFEA_MP3_PLAN_${field}_INVALID`);
  }
  return value;
}
function member(value, allowed, field) {
  if (!allowed.includes(value)) fail(`LAFEA_MP3_PLAN_${field}_INVALID`);
  return value;
}
function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
