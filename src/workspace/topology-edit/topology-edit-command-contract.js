/** Immutable request contracts for governed topology-edit native commands. */
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import {
  normalizeTopologyEditBranchComponentRequest,
} from './topology-edit-branch-component-command.js';

export const TOPOLOGY_EDIT_COMMAND_REQUEST_SCHEMA = 'TopologyEditCommandRequest.v1';
export const TOPOLOGY_EDIT_RESOLVED_COMMAND_SCHEMA = 'TopologyEditResolvedCommand.v1';
export const TOPOLOGY_EDIT_NATIVE_COMMANDS = Object.freeze([
  'CREATE_NODE', 'MOVE_NODE', 'MERGE_NODES', 'BRIDGE_GAP', 'ADD_STRAIGHT_ELEMENT',
  'SPLIT_EDGE', 'DISCONNECT_ENDPOINT', 'DELETE_EDGE',
]);
export const TOPOLOGY_EDIT_WAVE3_ENGINEERING_COMMANDS = Object.freeze([
  'ADD_BEND_DEFINITION', 'ADD_JUNCTION_DEFINITION', 'TRIM_EDGE',
]);
export const TOPOLOGY_EDIT_PROFESSIONAL_COMMANDS = Object.freeze([
  'INSERT_INLINE_COMPONENT',
  'INSERT_BRANCH_COMPONENT',
]);
// Compatibility alias retained for the merged Wave 3B controller surface.
export const TOPOLOGY_EDIT_AUTOFIX_COMMANDS = TOPOLOGY_EDIT_WAVE3_ENGINEERING_COMMANDS;
export const TOPOLOGY_EDIT_GOVERNED_COMMANDS = Object.freeze([
  ...TOPOLOGY_EDIT_NATIVE_COMMANDS,
  ...TOPOLOGY_EDIT_WAVE3_ENGINEERING_COMMANDS,
  ...TOPOLOGY_EDIT_PROFESSIONAL_COMMANDS,
]);
const COMMAND_SET = new Set(TOPOLOGY_EDIT_GOVERNED_COMMANDS);
const ENDPOINTS = new Set(['FROM', 'TO']);
const INLINE_COMPONENT_TYPES = new Set(['FLANGE', 'VALVE', 'REDUCER']);
const INLINE_DIRECTIONS = new Set(['FROM_TO', 'TO_FROM']);
const INLINE_PLACEMENTS = new Set(['INTERIOR', 'FROM_BOUNDARY', 'TO_BOUNDARY']);
const INLINE_ASSEMBLY_ROLES = new Set(['UPSTREAM_FLANGE', 'VALVE', 'DOWNSTREAM_FLANGE']);
const INLINE_LENGTH_AUTHORITIES = new Set([
  'CATALOGUE_VALVE_FACE_TO_FACE',
  'CATALOGUE_COMPONENT_LENGTH',
  'USER_DECLARED_COMPONENT_LENGTH',
]);

function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditCommandRequest: ${message}`);
}
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}
function optionalText(value, uppercase = false) {
  const text = String(value ?? '').trim();
  return text ? (uppercase ? text.toUpperCase() : text) : null;
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
function optionalPositiveInteger(value, label) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    fail(`${label} must be a positive integer.`, RangeError);
  }
  return number;
}
function enumText(value, allowed, label) {
  const text = requiredText(value, label).toUpperCase();
  if (!allowed.has(text)) fail(`${label} has unsupported value ${text}.`, RangeError);
  return text;
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
function normalizeCreateNode(payload) {
  return {
    position: finitePoint(payload.position, 'CREATE_NODE.position'),
    creationRole: requiredText(payload.creationRole, 'CREATE_NODE.creationRole')
      .toUpperCase().replace(/[^A-Z0-9]+/gu, '_'),
    coordinateAuthority: requiredText(
      payload.coordinateAuthority,
      'CREATE_NODE.coordinateAuthority',
    ),
    sourceOperationId: requiredText(payload.sourceOperationId, 'CREATE_NODE.sourceOperationId'),
  };
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
function normalizeInlineSourceReference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INSERT_INLINE_COMPONENT.catalogueBinding.sourceReference must be an object.');
  }
  return {
    documentId: requiredText(value.documentId, 'INSERT_INLINE_COMPONENT.catalogueBinding.sourceReference.documentId'),
    revision: requiredText(value.revision, 'INSERT_INLINE_COMPONENT.catalogueBinding.sourceReference.revision'),
    path: requiredText(value.path, 'INSERT_INLINE_COMPONENT.catalogueBinding.sourceReference.path'),
  };
}
function normalizeInlineBinding(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INSERT_INLINE_COMPONENT.catalogueBinding must be an object.');
  }
  const componentType = enumText(
    value.componentType,
    INLINE_COMPONENT_TYPES,
    'INSERT_INLINE_COMPONENT.catalogueBinding.componentType',
  );
  const secondaryNominalSizeMm = optionalPositiveNumber(
    value.secondaryNominalSizeMm,
    'INSERT_INLINE_COMPONENT.catalogueBinding.secondaryNominalSizeMm',
  );
  const secondaryOutsideDiameterMm = optionalPositiveNumber(
    value.secondaryOutsideDiameterMm,
    'INSERT_INLINE_COMPONENT.catalogueBinding.secondaryOutsideDiameterMm',
  );
  const binding = {
    catalogueHash: requiredText(value.catalogueHash, 'INSERT_INLINE_COMPONENT.catalogueBinding.catalogueHash'),
    sourceHash: requiredText(value.sourceHash, 'INSERT_INLINE_COMPONENT.catalogueBinding.sourceHash'),
    recordId: requiredText(value.recordId, 'INSERT_INLINE_COMPONENT.catalogueBinding.recordId'),
    recordHash: requiredText(value.recordHash, 'INSERT_INLINE_COMPONENT.catalogueBinding.recordHash'),
    componentType,
    nominalSizeMm: positiveNumber(value.nominalSizeMm, 'INSERT_INLINE_COMPONENT.catalogueBinding.nominalSizeMm'),
    outsideDiameterMm: positiveNumber(value.outsideDiameterMm, 'INSERT_INLINE_COMPONENT.catalogueBinding.outsideDiameterMm'),
    secondaryNominalSizeMm,
    secondaryOutsideDiameterMm,
    pipingClass: requiredText(value.pipingClass, 'INSERT_INLINE_COMPONENT.catalogueBinding.pipingClass').toUpperCase(),
    pressureClass: optionalText(value.pressureClass, true),
    materialSpecification: optionalText(value.materialSpecification, true),
    componentLengthMm: optionalPositiveNumber(value.componentLengthMm, 'INSERT_INLINE_COMPONENT.catalogueBinding.componentLengthMm'),
    componentMassKg: optionalPositiveNumber(value.componentMassKg, 'INSERT_INLINE_COMPONENT.catalogueBinding.componentMassKg'),
    endConnectionFrom: requiredText(value.endConnectionFrom, 'INSERT_INLINE_COMPONENT.catalogueBinding.endConnectionFrom').toUpperCase(),
    endConnectionTo: requiredText(value.endConnectionTo, 'INSERT_INLINE_COMPONENT.catalogueBinding.endConnectionTo').toUpperCase(),
    valveType: optionalText(value.valveType, true),
    valveFaceToFaceMm: optionalPositiveNumber(value.valveFaceToFaceMm, 'INSERT_INLINE_COMPONENT.catalogueBinding.valveFaceToFaceMm'),
    flangeClass: optionalText(value.flangeClass, true),
    flangeFacing: optionalText(value.flangeFacing, true),
    flangeType: optionalText(value.flangeType, true),
    flangeThicknessMm: optionalPositiveNumber(value.flangeThicknessMm, 'INSERT_INLINE_COMPONENT.catalogueBinding.flangeThicknessMm'),
    flangeOutsideDiameterMm: optionalPositiveNumber(value.flangeOutsideDiameterMm, 'INSERT_INLINE_COMPONENT.catalogueBinding.flangeOutsideDiameterMm'),
    boltCircleDiameterMm: optionalPositiveNumber(value.boltCircleDiameterMm, 'INSERT_INLINE_COMPONENT.catalogueBinding.boltCircleDiameterMm'),
    boltHoleCount: optionalPositiveInteger(value.boltHoleCount, 'INSERT_INLINE_COMPONENT.catalogueBinding.boltHoleCount'),
    boltHoleDiameterMm: optionalPositiveNumber(value.boltHoleDiameterMm, 'INSERT_INLINE_COMPONENT.catalogueBinding.boltHoleDiameterMm'),
    reducerType: optionalText(value.reducerType, true),
    reducerOrientation: optionalText(value.reducerOrientation, true),
    sourceReference: normalizeInlineSourceReference(value.sourceReference),
  };
  if (componentType === 'VALVE' && (!binding.valveType || !binding.valveFaceToFaceMm)) {
    fail('INSERT_INLINE_COMPONENT VALVE requires valveType and valveFaceToFaceMm.', RangeError);
  }
  if (componentType === 'FLANGE' && (!binding.flangeClass || !binding.flangeFacing)) {
    fail('INSERT_INLINE_COMPONENT FLANGE requires flangeClass and flangeFacing.', RangeError);
  }
  if (componentType === 'REDUCER') {
    if (!secondaryNominalSizeMm || !secondaryOutsideDiameterMm
      || !binding.reducerType || !binding.reducerOrientation) {
      fail('INSERT_INLINE_COMPONENT REDUCER requires both end sizes, type, and orientation.', RangeError);
    }
  } else if (secondaryNominalSizeMm || secondaryOutsideDiameterMm) {
    fail('INSERT_INLINE_COMPONENT secondary size fields are valid only for REDUCER.', RangeError);
  }
  return binding;
}
function normalizeInlineAssemblyBinding(value, catalogueBinding) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    fail('INSERT_INLINE_COMPONENT.assemblyBinding must be an object.');
  }
  const role = enumText(
    value.role,
    INLINE_ASSEMBLY_ROLES,
    'INSERT_INLINE_COMPONENT.assemblyBinding.role',
  );
  if (!Array.isArray(value.recordIds) || value.recordIds.length !== 3) {
    fail('INSERT_INLINE_COMPONENT.assemblyBinding.recordIds must contain three ordered record IDs.', RangeError);
  }
  const recordIds = value.recordIds.map((row, index) => requiredText(
    row,
    `INSERT_INLINE_COMPONENT.assemblyBinding.recordIds[${index}]`,
  ));
  const roleIndex = { UPSTREAM_FLANGE: 0, VALVE: 1, DOWNSTREAM_FLANGE: 2 }[role];
  if (recordIds[roleIndex] !== catalogueBinding.recordId) {
    fail('INSERT_INLINE_COMPONENT assembly role record differs from catalogueBinding.recordId.', RangeError);
  }
  if ((role === 'VALVE') !== (catalogueBinding.componentType === 'VALVE')) {
    fail('INSERT_INLINE_COMPONENT assembly VALVE role requires a valve catalogue binding.', RangeError);
  }
  if ((role !== 'VALVE') !== (catalogueBinding.componentType === 'FLANGE')) {
    fail('INSERT_INLINE_COMPONENT assembly flange roles require flange catalogue bindings.', RangeError);
  }
  return {
    assemblyId: requiredText(value.assemblyId, 'INSERT_INLINE_COMPONENT.assemblyBinding.assemblyId'),
    assemblyHash: requiredText(value.assemblyHash, 'INSERT_INLINE_COMPONENT.assemblyBinding.assemblyHash'),
    role,
    recordIds,
    assemblyLengthMm: positiveNumber(
      value.assemblyLengthMm,
      'INSERT_INLINE_COMPONENT.assemblyBinding.assemblyLengthMm',
    ),
    assemblyMassKg: positiveNumber(
      value.assemblyMassKg,
      'INSERT_INLINE_COMPONENT.assemblyBinding.assemblyMassKg',
    ),
  };
}
function normalizeInlineComponent(payload) {
  const centerFraction = Number(payload.centerFraction);
  if (!Number.isFinite(centerFraction) || centerFraction <= 0 || centerFraction >= 1) {
    fail('INSERT_INLINE_COMPONENT.centerFraction must be strictly between 0 and 1.', RangeError);
  }
  const catalogueBinding = normalizeInlineBinding(payload.catalogueBinding);
  const insertionLengthMm = positiveNumber(payload.insertionLengthMm, 'INSERT_INLINE_COMPONENT.insertionLengthMm');
  const lengthAuthority = enumText(
    payload.lengthAuthority,
    INLINE_LENGTH_AUTHORITIES,
    'INSERT_INLINE_COMPONENT.lengthAuthority',
  );
  const direction = enumText(
    payload.direction ?? 'FROM_TO',
    INLINE_DIRECTIONS,
    'INSERT_INLINE_COMPONENT.direction',
  );
  const placement = enumText(
    payload.placement ?? 'INTERIOR',
    INLINE_PLACEMENTS,
    'INSERT_INLINE_COMPONENT.placement',
  );
  if (catalogueBinding.componentType === 'VALVE'
    && lengthAuthority === 'CATALOGUE_VALVE_FACE_TO_FACE'
    && Math.abs(insertionLengthMm - catalogueBinding.valveFaceToFaceMm) > 1e-9) {
    fail('INSERT_INLINE_COMPONENT valve length must equal catalogue face-to-face.', RangeError);
  }
  if (catalogueBinding.componentType !== 'VALVE'
    && lengthAuthority === 'CATALOGUE_VALVE_FACE_TO_FACE') {
    fail('CATALOGUE_VALVE_FACE_TO_FACE is valid only for VALVE.', RangeError);
  }
  if (lengthAuthority === 'CATALOGUE_COMPONENT_LENGTH') {
    if (catalogueBinding.componentLengthMm === null) {
      fail('CATALOGUE_COMPONENT_LENGTH requires catalogueBinding.componentLengthMm.', RangeError);
    }
    if (Math.abs(insertionLengthMm - catalogueBinding.componentLengthMm) > 1e-9) {
      fail('INSERT_INLINE_COMPONENT length must equal catalogue component length.', RangeError);
    }
  }
  const assemblyBinding = normalizeInlineAssemblyBinding(payload.assemblyBinding, catalogueBinding);
  return {
    edgeId: requiredText(payload.edgeId, 'INSERT_INLINE_COMPONENT.edgeId'),
    centerFraction,
    insertionLengthMm,
    lengthAuthority,
    direction,
    placement,
    catalogueBinding,
    assemblyBinding,
  };
}
const PAYLOAD_NORMALIZERS = Object.freeze({
  CREATE_NODE: normalizeCreateNode,
  MOVE_NODE: normalizeMove, MERGE_NODES: normalizeMerge,
  BRIDGE_GAP: normalizeAddedEdge, ADD_STRAIGHT_ELEMENT: normalizeAddedEdge,
  SPLIT_EDGE: normalizeSplit, DISCONNECT_ENDPOINT: normalizeDisconnect,
  DELETE_EDGE: normalizeDelete, ADD_BEND_DEFINITION: normalizeBend,
  ADD_JUNCTION_DEFINITION: normalizeJunction, TRIM_EDGE: normalizeTrim,
  INSERT_INLINE_COMPONENT: normalizeInlineComponent,
  INSERT_BRANCH_COMPONENT: normalizeTopologyEditBranchComponentRequest,
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
