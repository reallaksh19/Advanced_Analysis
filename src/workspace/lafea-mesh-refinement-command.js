/** Non-executable refinement command contract for a future qualified producer. */
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { lafeaMeshCapabilities } from './lafea-mesh-capabilities.js';

export const LAFEA_MESH_REFINEMENT_COMMAND_SCHEMA = 'lafea-mesh-refinement-command/v1';
export const LAFEA_MESH_REFINEMENT_KINDS = Object.freeze([
  'TARGET_LENGTH', 'DISCONTINUITY_ZONE', 'RESTRAINT_ZONE', 'LOAD_ZONE',
  'ATTACHMENT_ZONE', 'BEND_ZONE', 'TEE_ZONE', 'REDUCER_ZONE', 'RIGID_BOUNDARY_ZONE',
]);

const KEYS = Object.freeze([
  'schema', 'commandId', 'stageId', 'expectedGenerationIntentHash', 'kind',
  'entityIds', 'targetElementLength', 'lengthUnit', 'reason',
]);

export function createLafeaMeshRefinementCommand(value) {
  exact(value, KEYS);
  if (value.schema !== LAFEA_MESH_REFINEMENT_COMMAND_SCHEMA) {
    throw error('LAFEA_MESH_REFINEMENT_COMMAND_SCHEMA_INVALID');
  }
  const capabilities = lafeaMeshCapabilities(value.stageId);
  if (!capabilities.applicable) throw error('LAFEA_MESH_REFINEMENT_NOT_APPLICABLE');
  if (!LAFEA_MESH_REFINEMENT_KINDS.includes(value.kind)) {
    throw error('LAFEA_MESH_REFINEMENT_KIND_INVALID');
  }
  const command = {
    schema: LAFEA_MESH_REFINEMENT_COMMAND_SCHEMA,
    commandId: text(value.commandId, 'COMMAND_ID'),
    stageId: value.stageId,
    expectedGenerationIntentHash: text(value.expectedGenerationIntentHash, 'EXPECTED_INTENT_HASH'),
    kind: value.kind,
    entityIds: ids(value.entityIds),
    targetElementLength: positive(value.targetElementLength),
    lengthUnit: text(value.lengthUnit, 'LENGTH_UNIT'),
    reason: text(value.reason, 'REASON'),
  };
  return freeze({
    ...command,
    semanticHash: canonicalLafeaSha256({
      schema: 'lafea-mesh-refinement-command-hash-input/v1', command,
    }),
    status: 'UNEXECUTABLE_COMMAND',
    executionAuthorized: false,
    rollbackPolicy: 'NO_MUTATION_WITHOUT_QUALIFIED_PRODUCER',
  });
}

function ids(value) {
  if (!Array.isArray(value) || !value.length) throw error('LAFEA_MESH_REFINEMENT_ENTITY_IDS_REQUIRED');
  const result = value.map((id) => text(id, 'ENTITY_ID')).sort((a, b) => a.localeCompare(b));
  if (new Set(result).size !== result.length) throw error('LAFEA_MESH_REFINEMENT_ENTITY_IDS_DUPLICATE');
  return result;
}
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw error('LAFEA_MESH_REFINEMENT_COMMAND_KEYS_INVALID');
  }
}
function positive(value) {
  if (!Number.isFinite(value) || value <= 0) throw error('LAFEA_MESH_REFINEMENT_TARGET_LENGTH_INVALID');
  return value;
}
function text(value, label) {
  if (typeof value !== 'string' || !value) throw error(`LAFEA_MESH_REFINEMENT_${label}_INVALID`);
  return value;
}
function error(code) { const value = new TypeError(code); value.code = code; return value; }
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
