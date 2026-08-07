/** Non-executable intent contract for a future qualified mesh producer. */
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { lafeaMeshCapabilities } from './lafea-mesh-capabilities.js';

export const LAFEA_MESH_GENERATION_INTENT_SCHEMA = 'lafea-mesh-generation-intent/v1';
export const LAFEA_MESH_GENERATION_INTENT_STATUS = 'UNEXECUTABLE_INTENT';

const KEYS = Object.freeze([
  'schema', 'stageId', 'sourceHash', 'canonicalModelHash', 'analysisGeometryHash',
  'meshProfileHash', 'targetElementLength', 'lengthUnit', 'elementFamily',
  'curvatureToleranceDegrees', 'growthLimit', 'maximumNodes', 'maximumElements',
  'maximumEstimatedDofs', 'refinementEntityIds',
]);

export function createLafeaMeshGenerationIntent(value) {
  requireExact(value, KEYS);
  if (value.schema !== LAFEA_MESH_GENERATION_INTENT_SCHEMA) {
    throw intentError('LAFEA_MESH_GENERATION_INTENT_SCHEMA_INVALID');
  }
  const capabilities = lafeaMeshCapabilities(value.stageId);
  if (!capabilities.applicable) throw intentError('LAFEA_MESH_GENERATION_NOT_APPLICABLE');
  if (!capabilities.allowedElementFamilies.includes(value.elementFamily)) {
    throw intentError('LAFEA_MESH_GENERATION_ELEMENT_FAMILY_NOT_AUTHORIZED');
  }
  const intent = {
    schema: LAFEA_MESH_GENERATION_INTENT_SCHEMA,
    stageId: value.stageId,
    sourceHash: requireText(value.sourceHash, 'sourceHash'),
    canonicalModelHash: requireText(value.canonicalModelHash, 'canonicalModelHash'),
    analysisGeometryHash: requireText(value.analysisGeometryHash, 'analysisGeometryHash'),
    meshProfileHash: requireText(value.meshProfileHash, 'meshProfileHash'),
    targetElementLength: positive(value.targetElementLength, 'targetElementLength'),
    lengthUnit: requireText(value.lengthUnit, 'lengthUnit'),
    elementFamily: value.elementFamily,
    curvatureToleranceDegrees: positive(value.curvatureToleranceDegrees, 'curvatureToleranceDegrees'),
    growthLimit: positive(value.growthLimit, 'growthLimit'),
    maximumNodes: positiveInteger(value.maximumNodes, 'maximumNodes'),
    maximumElements: positiveInteger(value.maximumElements, 'maximumElements'),
    maximumEstimatedDofs: positiveInteger(value.maximumEstimatedDofs, 'maximumEstimatedDofs'),
    refinementEntityIds: canonicalIds(value.refinementEntityIds),
  };
  const semanticHash = canonicalLafeaSha256({
    schema: 'lafea-mesh-generation-intent-hash-input/v1',
    intent,
  });
  return freeze({
    ...intent,
    semanticHash,
    status: LAFEA_MESH_GENERATION_INTENT_STATUS,
    executionAuthorized: false,
    producerRef: null,
    producesMesh: false,
    reason: 'QUALIFIED_MESH_PRODUCER_NOT_AVAILABLE',
  });
}

function canonicalIds(value) {
  if (!Array.isArray(value)) throw intentError('LAFEA_MESH_REFINEMENT_IDS_INVALID');
  const ids = value.map((id, index) => requireText(id, `refinementEntityIds[${index}]`));
  if (new Set(ids).size !== ids.length) throw intentError('LAFEA_MESH_REFINEMENT_IDS_DUPLICATE');
  return ids.sort((a, b) => a.localeCompare(b));
}
function requireExact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw intentError('LAFEA_MESH_GENERATION_INTENT_KEYS_INVALID');
  }
}
function requireText(value, field) {
  if (typeof value !== 'string' || !value) throw intentError(`LAFEA_MESH_GENERATION_${field.toUpperCase()}_INVALID`);
  return value;
}
function positive(value, field) {
  if (!Number.isFinite(value) || value <= 0) throw intentError(`LAFEA_MESH_GENERATION_${field.toUpperCase()}_INVALID`);
  return value;
}
function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value <= 0) throw intentError(`LAFEA_MESH_GENERATION_${field.toUpperCase()}_INVALID`);
  return value;
}
function intentError(code) { const error = new TypeError(code); error.code = code; return error; }
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
