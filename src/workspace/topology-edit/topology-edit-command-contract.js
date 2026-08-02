/** Immutable request contracts for governed topology-edit native commands. */
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_COMMAND_REQUEST_SCHEMA = 'TopologyEditCommandRequest.v1';
export const TOPOLOGY_EDIT_RESOLVED_COMMAND_SCHEMA = 'TopologyEditResolvedCommand.v1';
export const TOPOLOGY_EDIT_NATIVE_COMMANDS = Object.freeze([
  'MOVE_NODE', 'MERGE_NODES', 'BRIDGE_GAP', 'ADD_STRAIGHT_ELEMENT',
  'SPLIT_EDGE', 'DISCONNECT_ENDPOINT', 'DELETE_EDGE',
]);
export const TOPOLOGY_EDIT_WAVE3_ENGINEERING_COMMANDS = Object.freeze([
  'ADD_BEND_DEFINITION', 'ADD_JUNCTION_DEFINITION', 'TRIM_EDGE',
]);
// Compatibility alias retained for the merged Wave 3B controller surface.
export const TOPOLOGY_EDIT_AUTOFIX_COMMANDS = TOPOLOGY_EDIT_WAVE3_ENGINEERING_COMMANDS;
export const TOPOLOGY_EDIT_GOVERNED_COMMANDS = Object.freeze([
  ...TOPOLOGY_EDIT_NATIVE_COMMANDS, ...TOPOLOGY_EDIT_WAVE3_ENGINEERING_COMMANDS,
]);
const COMMAND_SET = new Set(TOPOLOGY_EDIT_GOVERNED_COMMANDS);
const ENDPOINTS = new Set(['FROM', 'TO']);

function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditCommandRequest: ${message}`);
}
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}
function immutableJson(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  let clone;
  try { clone = JSON.parse(JSON.stringify(value)); } catch { fail(`${label} must be JSON serializable.`); }
  if (!clone || typeof clone !== 'object' || Array.isArray(clone)) fail(`${label} must be an object.`);
  return deepFreeze(clone);
}
function finitePoint(value, label = 'position') {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const point = { x: Number(source.x), y: Number(source.y), z: Number(source.z) };
  if (!Object.values(point).every(Number.isFinite)) fail(`${label} must contain finite x, y and z coordinates.`);
  return point;
}
function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) fail(`${label} must be a finite number.`, RangeError);
  return number;
}
function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  if (number <= 0) fail(`${label} must be a positive finite number.`, RangeError);
  return number;
}
function optionalPositiveNumber(value, label) {
  return value === null || value === undefined || value === '' ? null : positiveNumber(value, label);
}
function distinctIds(value, count, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  const ids = value.map((row, index) => requiredText(row, `${label}[${index}]`));
  if (ids.length !== count || new Set(ids).size !== count) {
    fail(`${label} must contain exactly ${count} distinct IDs.`, RangeError);
  }
  return ids;
}
function normalizeBasis(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const sessionVersion = Number(source.sessionVersion);
  if (!Number.isInteger(sessionVersion) || sessionVersion < 0) {
    fail('basis.sessionVersion must be a non-negative integer.', RangeError);
  }
  return {
    sourceHash: requiredText(source.sourceHash, 'basis.sourceHash'),
    baseCanonicalHash: requiredText(source.baseCanonicalHash, 'basis.baseCanonicalHash'),
    priorDraftHash: requiredText(source.priorDraftHash, 'basis.priorDraftHash'),
    sessionVersion,
  };
}
function normalizeExpectedTargetRevisions(value) {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) fail('expectedTargetRevisions must be an object.');
  return Object.fromEntries(Object.entries(value).map(([key, revision]) => [
    requiredText(key, 'expected target id'),
    requiredText(revision, `expectedTargetRevisions.${key}`),
  ]).sort(([left], [right]) => left.localeCompare(right)));
}
function normalizeMove(payload) {
  return { nodeId: requiredText(payload.nodeId, 'MOVE_NODE.nodeId'), position: finitePoint(payload.position) };
}
function normalizeMerge(payload) {
  const sourceNodeId = requiredText(payload.sourceNodeId, 'MERGE_NODES.sourceNodeId');
  const targetNodeId = requiredText(payload.targetNodeId, 'MERGE_NODES.targetNodeId');
  if (sourceNodeId === targetNodeId) fail('MERGE_NODES source and target must be different.', RangeError);
  return { sourceNodeId, targetNodeId };
}
function normalizeAddedEdge(payload, commandType) {
  const fromNodeId = requiredText(payload.fromNodeId, `${commandType}.fromNodeId`);
  const toNodeId = requiredText(payload.toNodeId, `${commandType}.toNodeId`);
  if (fromNodeId === toNodeId) fail(`${commandType} endpoints must be different.`, RangeError);
  return {
    fromNodeId, toNodeId,
    diameterMm: optionalPositiveNumber(payload.diameterMm, `${commandType}.diameterMm`),
    entityType: payload.entityType === null || payload.entityType === undefined
      ? 'PIPE' : requiredText(payload.entityType, `${commandType}.entityType`).toUpperCase(),
  };
}
function normalizeSplit(payload) {
  const fraction = Number(payload.fraction);
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction >= 1) {
    fail('SPLIT_EDGE.fraction must be strictly between 0 and 1.', RangeError);
  }
  return { edgeId: requiredText(payload.edgeId, 'SPLIT_EDGE.edgeId'), fraction };
}
function normalizeEndpoint(payload, commandType) {
  const endpoint = requiredText(payload.endpoint, `${commandType}.endpoint`).toUpperCase();
  if (!ENDPOINTS.has(endpoint)) fail(`${commandType}.endpoint must be FROM or TO.`, RangeError);
  return endpoint;
}
function normalizeDisconnect(payload) {
  return { edgeId: requiredText(payload.edgeId, 'DISCONNECT_ENDPOINT.edgeId'), endpoint: normalizeEndpoint(payload, 'DISCONNECT_ENDPOINT') };
}
function normalizeDelete(payload) { return { edgeId: requiredText(payload.edgeId, 'DELETE_EDGE.edgeId') }; }
function normalizeBend(payload) {
  const angleDeg = finiteNumber(payload.angleDeg, 'ADD_BEND_DEFINITION.angleDeg');
  if (!(angleDeg > 0 && angleDeg < 180)) fail('ADD_BEND_DEFINITION.angleDeg must be strictly between 0 and 180.', RangeError);
  return {
    nodeId: requiredText(payload.nodeId, 'ADD_BEND_DEFINITION.nodeId'),
    edgeIds: distinctIds(payload.edgeIds, 2, 'ADD_BEND_DEFINITION.edgeIds'),
    radiusMm: positiveNumber(payload.radiusMm, 'ADD_BEND_DEFINITION.radiusMm'),
    angleDeg,
    radiusAuthority: requiredText(payload.radiusAuthority, 'ADD_BEND_DEFINITION.radiusAuthority'),
  };
}
function normalizeJunction(payload) {
  const kind = requiredText(payload.kind, 'ADD_JUNCTION_DEFINITION.kind').toUpperCase();
  if (!['TEE', 'OLET'].includes(kind)) fail(`Unsupported junction kind ${kind}.`, RangeError);
  return {
    nodeId: requiredText(payload.nodeId, 'ADD_JUNCTION_DEFINITION.nodeId'),
    edgeIds: distinctIds(payload.edgeIds, 3, 'ADD_JUNCTION_DEFINITION.edgeIds'),
    kind,
    inferenceAuthority: requiredText(payload.inferenceAuthority, 'ADD_JUNCTION_DEFINITION.inferenceAuthority'),
  };
}
function normalizeTrim(payload) {
  return {
    edgeId: requiredText(payload.edgeId, 'TRIM_EDGE.edgeId'),
    endpoint: normalizeEndpoint(payload, 'TRIM_EDGE'),
    position: finitePoint(payload.position, 'TRIM_EDGE.position'),
  };
}
const PAYLOAD_NORMALIZERS = Object.freeze({
  MOVE_NODE: normalizeMove, MERGE_NODES: normalizeMerge,
  BRIDGE_GAP: normalizeAddedEdge, ADD_STRAIGHT_ELEMENT: normalizeAddedEdge,
  SPLIT_EDGE: normalizeSplit, DISCONNECT_ENDPOINT: normalizeDisconnect,
  DELETE_EDGE: normalizeDelete, ADD_BEND_DEFINITION: normalizeBend,
  ADD_JUNCTION_DEFINITION: normalizeJunction, TRIM_EDGE: normalizeTrim,
});
function normalizePayload(commandType, value) {
  const payload = immutableJson(value ?? {}, `${commandType} payload`);
  const normalizer = PAYLOAD_NORMALIZERS[commandType];
  if (!normalizer) fail(`Unsupported command type ${commandType}.`, RangeError);
  return normalizer(payload, commandType);
}
function requestMaterial(input) {
  const commandType = requiredText(input.commandType, 'commandType').toUpperCase();
  if (!COMMAND_SET.has(commandType)) fail(`Unsupported command type ${commandType}.`, RangeError);
  return {
    schema: TOPOLOGY_EDIT_COMMAND_REQUEST_SCHEMA,
    commandId: requiredText(input.commandId, 'commandId'), commandType,
    basis: normalizeBasis(input.basis), payload: normalizePayload(commandType, input.payload),
    expectedTargetRevisions: normalizeExpectedTargetRevisions(input.expectedTargetRevisions),
  };
}
export function createTopologyEditCommandRequest(input = {}) {
  const material = requestMaterial(input);
  return deepFreeze({ ...material, requestHash: semanticHash(material) });
}
export function assertTopologyEditCommandRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('request must be an object.');
  const rebuilt = createTopologyEditCommandRequest(value);
  if (value.schema !== TOPOLOGY_EDIT_COMMAND_REQUEST_SCHEMA || value.requestHash !== rebuilt.requestHash) {
    fail('request differs from its immutable normalized authority.', RangeError);
  }
  return rebuilt;
}
export function deterministicTopologyEditId(commandId, role) {
  const normalizedCommandId = requiredText(commandId, 'commandId');
  const normalizedRole = requiredText(role, 'role').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const digest = semanticHash({ commandId: normalizedCommandId, role: normalizedRole }).split(':').at(-1);
  return `${normalizedRole}:${digest}`;
}
