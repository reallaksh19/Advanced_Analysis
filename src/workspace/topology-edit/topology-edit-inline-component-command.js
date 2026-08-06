/** Governed normalization, validation, and pure reduction for inline component insertion. */
import { deepFreeze, semanticHash, stringValue } from '../../core/shared-piping-model/index.js';
import { deterministicTopologyEditId } from './topology-edit-command-contract.js';

export const TOPOLOGY_EDIT_INLINE_COMPONENT_TYPES = Object.freeze([
  'FLANGE', 'VALVE', 'REDUCER',
]);
export const TOPOLOGY_EDIT_INLINE_DIRECTIONS = Object.freeze([
  'FROM_TO', 'TO_FROM',
]);
export const TOPOLOGY_EDIT_INLINE_LENGTH_AUTHORITIES = Object.freeze([
  'CATALOGUE_VALVE_FACE_TO_FACE',
  'CATALOGUE_COMPONENT_LENGTH',
  'USER_DECLARED_COMPONENT_LENGTH',
]);

const COMPONENT_TYPES = new Set(TOPOLOGY_EDIT_INLINE_COMPONENT_TYPES);
const DIRECTIONS = new Set(TOPOLOGY_EDIT_INLINE_DIRECTIONS);
const LENGTH_AUTHORITIES = new Set(TOPOLOGY_EDIT_INLINE_LENGTH_AUTHORITIES);
const STRAIGHT_TYPES = new Set(['PIPE', 'STRAIGHT', 'STRAIGHT_ELEMENT']);
const EPSILON = 1e-9;

export function normalizeTopologyEditInlineComponentPayload(input = {}) {
  const componentType = enumText(
    input.catalogueBinding?.componentType,
    COMPONENT_TYPES,
    'catalogueBinding.componentType',
  );
  const direction = enumText(input.direction ?? 'FROM_TO', DIRECTIONS, 'direction');
  const lengthAuthority = enumText(
    input.lengthAuthority,
    LENGTH_AUTHORITIES,
    'lengthAuthority',
  );
  const insertionLengthMm = positive(input.insertionLengthMm, 'insertionLengthMm');
  const binding = normalizeBinding(input.catalogueBinding, componentType);
  if (
    componentType === 'VALVE'
    && lengthAuthority === 'CATALOGUE_VALVE_FACE_TO_FACE'
    && !nearlyEqual(insertionLengthMm, binding.valveFaceToFaceMm)
  ) {
    fail(
      'insertionLengthMm must equal the catalogue valve face-to-face dimension.',
      RangeError,
    );
  }
  if (componentType !== 'VALVE' && lengthAuthority === 'CATALOGUE_VALVE_FACE_TO_FACE') {
    fail('CATALOGUE_VALVE_FACE_TO_FACE is valid only for VALVE.', RangeError);
  }
  if (lengthAuthority === 'CATALOGUE_COMPONENT_LENGTH') {
    if (binding.componentLengthMm === null) {
      fail('CATALOGUE_COMPONENT_LENGTH requires catalogueBinding.componentLengthMm.', RangeError);
    }
    if (!nearlyEqual(insertionLengthMm, binding.componentLengthMm)) {
      fail('insertionLengthMm must equal the catalogue component length.', RangeError);
    }
  }
  return deepFreeze({
    edgeId: requiredText(input.edgeId, 'edgeId'),
    centerFraction: fraction(input.centerFraction, 'centerFraction'),
    insertionLengthMm,
    lengthAuthority,
    direction,
    catalogueBinding: binding,
  });
}

export function assertTopologyEditInlineComponentTarget(topology, payload) {
  const edge = exact(topology?.edges, payload.edgeId, 'host edge');
  if (!STRAIGHT_TYPES.has(normalizedType(edge.entityType))) {
    fail(`host edge ${edge.id} must be a straight pipe edge.`, RangeError);
  }
  assertNoDependants(topology, edge.id);
  const from = exact(topology?.nodes, edge.fromNodeId, 'FROM node');
  const to = exact(topology?.nodes, edge.toNodeId, 'TO node');
  const lengthMm = pointDistance(from.position, to.position);
  if (!(lengthMm > EPSILON)) fail(`host edge ${edge.id} has zero length.`, RangeError);
  const halfFraction = payload.insertionLengthMm / (2 * lengthMm);
  const startFraction = payload.centerFraction - halfFraction;
  const endFraction = payload.centerFraction + halfFraction;
  if (!(startFraction > EPSILON && endFraction < 1 - EPSILON)) {
    fail('inline component must fit strictly inside the host edge.', RangeError);
  }
  assertHostCompatibility(edge, payload.catalogueBinding, payload.direction);
  return deepFreeze({
    edge,
    from,
    to,
    lengthMm,
    startFraction,
    endFraction,
  });
}

export function applyTopologyEditInlineComponent(topology, command) {
  const payload = normalizeTopologyEditInlineComponentPayload(command.payload);
  const target = assertTopologyEditInlineComponentTarget(topology, payload);
  const ids = generatedIds(topology, command.commandId);
  const start = interpolate(target.from.position, target.to.position, target.startFraction);
  const end = interpolate(target.from.position, target.to.position, target.endFraction);
  const binding = payload.catalogueBinding;
  const reducer = binding.componentType === 'REDUCER';
  const primaryFrom = payload.direction === 'FROM_TO';
  const primaryNominal = binding.nominalSizeMm;
  const primaryOutside = binding.outsideDiameterMm;
  const secondaryNominal = reducer ? binding.secondaryNominalSizeMm : primaryNominal;
  const secondaryOutside = reducer ? binding.secondaryOutsideDiameterMm : primaryOutside;
  const fromNominal = primaryFrom ? primaryNominal : secondaryNominal;
  const fromOutside = primaryFrom ? primaryOutside : secondaryOutside;
  const toNominal = primaryFrom ? secondaryNominal : primaryNominal;
  const toOutside = primaryFrom ? secondaryOutside : primaryOutside;
  const sourceSide = sourceComponentSide(target.edge, binding, payload.direction);
  const commonSide = {
    entityType: target.edge.entityType ?? 'PIPE',
    sourcePath: target.edge.sourcePath ?? null,
    createdByCommandId: command.commandId,
    derivedFromEdgeId: target.edge.id,
    sourceComponentKey: target.edge.componentKey ?? target.edge.sourceComponentKey ?? null,
  };
  const left = {
    ...target.edge,
    ...commonSide,
    id: ids.leftEdgeId,
    fromNodeId: target.edge.fromNodeId,
    toNodeId: ids.fromNodeId,
    componentKey: sourceSide === 'LEFT' ? target.edge.componentKey ?? null : null,
    diameterMm: fromNominal,
    outsideDiameterMm: fromOutside,
    diameterAuthority: 'OUTSIDE_DIAMETER',
  };
  const right = {
    ...target.edge,
    ...commonSide,
    id: ids.rightEdgeId,
    fromNodeId: ids.toNodeId,
    toNodeId: target.edge.toNodeId,
    componentKey: sourceSide === 'RIGHT' ? target.edge.componentKey ?? null : null,
    diameterMm: toNominal,
    outsideDiameterMm: toOutside,
    diameterAuthority: 'OUTSIDE_DIAMETER',
  };
  const component = {
    id: ids.componentEdgeId,
    componentKey: null,
    fromNodeId: ids.fromNodeId,
    toNodeId: ids.toNodeId,
    diameterMm: primaryNominal,
    outsideDiameterMm: primaryOutside,
    secondaryNominalSizeMm: reducer ? secondaryNominal : null,
    secondaryOutsideDiameterMm: reducer ? secondaryOutside : null,
    diameterAuthority: 'OUTSIDE_DIAMETER',
    entityType: binding.componentType,
    sourcePath: null,
    createdByCommandId: command.commandId,
    derivedFromEdgeId: target.edge.id,
    sourceComponentKey: target.edge.componentKey ?? target.edge.sourceComponentKey ?? null,
    componentLengthMm: payload.insertionLengthMm,
    componentMassKg: binding.componentMassKg,
    materialSpecification: binding.materialSpecification,
    pressureClass: binding.pressureClass,
    lengthAuthority: payload.lengthAuthority,
    insertionDirection: payload.direction,
    topologyOperation: 'INSERT_INLINE_COMPONENT',
    catalogueBinding: binding,
    catalogueRecordId: binding.recordId,
    catalogueRecordHash: binding.recordHash,
    catalogueHash: binding.catalogueHash,
    catalogueSourceHash: binding.sourceHash,
    pipingClass: binding.pipingClass,
    endConnectionFrom: binding.endConnectionFrom,
    endConnectionTo: binding.endConnectionTo,
    valveType: binding.valveType,
    valveFaceToFaceMm: binding.valveFaceToFaceMm,
    flangeClass: binding.flangeClass,
    flangeFacing: binding.flangeFacing,
    flangeType: binding.flangeType,
    flangeThicknessMm: binding.flangeThicknessMm,
    flangeOutsideDiameterMm: binding.flangeOutsideDiameterMm,
    boltCircleDiameterMm: binding.boltCircleDiameterMm,
    boltHoleCount: binding.boltHoleCount,
    boltHoleDiameterMm: binding.boltHoleDiameterMm,
    reducerType: binding.reducerType,
    reducerOrientation: binding.reducerOrientation,
  };
  const nodes = clone(topology.nodes);
  const edges = clone(topology.edges).filter((edge) => edge.id !== target.edge.id);
  nodes.push(
    inlineNode(ids.fromNodeId, start, command.commandId, target.edge.id, 'FROM'),
    inlineNode(ids.toNodeId, end, command.commandId, target.edge.id, 'TO'),
  );
  edges.push(left, component, right);
  return { ...topology, nodes, edges };
}

export function validateTopologyEditInlineComponentEffect(candidate) {
  const delta = candidate.topologyDelta;
  const additions = [
    ...(candidate.canonicalTopology.nodes ?? []),
    ...(candidate.canonicalTopology.edges ?? []),
  ].filter((row) => row.createdByCommandId === candidate.commandId);
  const validShape = delta.nodes.addedIds.length === 2
    && delta.nodes.removedIds.length === 0
    && delta.edges.addedIds.length === 3
    && delta.edges.removedIds.length === 1
    && noChanges(delta, ['junctions', 'supports', 'boundaries', 'rigids', 'bends']);
  const addedIds = [...delta.nodes.addedIds, ...delta.edges.addedIds].sort();
  const provenanceIds = additions.map((row) => row.id).sort();
  const componentEdges = additions.filter((row) => (
    row.topologyOperation === 'INSERT_INLINE_COMPONENT'
  ));
  const validProvenance = semanticHash(addedIds) === semanticHash(provenanceIds)
    && componentEdges.length === 1
    && componentEdges[0].catalogueBinding?.recordHash
      === candidate.resolvedCommand?.payload?.catalogueBinding?.recordHash;
  const findings = [];
  if (!validShape) findings.push({
    code: 'INSERT_INLINE_COMPONENT_DELTA_INVALID',
    message: 'INSERT_INLINE_COMPONENT must add two nodes and three edges while replacing exactly one edge.',
    targetIds: [...changes(delta.nodes), ...changes(delta.edges)].sort(),
  });
  if (!validProvenance) findings.push({
    code: 'INSERT_INLINE_COMPONENT_PROVENANCE_INVALID',
    message: 'Inline insertion additions must carry exact command and catalogue provenance.',
    targetIds: provenanceIds,
  });
  return findings;
}

function normalizeBinding(value, componentType) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('catalogueBinding must be an object.');
  }
  const secondaryNominalSizeMm = optionalPositive(
    value.secondaryNominalSizeMm,
    'catalogueBinding.secondaryNominalSizeMm',
  );
  const secondaryOutsideDiameterMm = optionalPositive(
    value.secondaryOutsideDiameterMm,
    'catalogueBinding.secondaryOutsideDiameterMm',
  );
  const binding = {
    catalogueHash: requiredText(value.catalogueHash, 'catalogueBinding.catalogueHash'),
    sourceHash: requiredText(value.sourceHash, 'catalogueBinding.sourceHash'),
    recordId: requiredText(value.recordId, 'catalogueBinding.recordId'),
    recordHash: requiredText(value.recordHash, 'catalogueBinding.recordHash'),
    componentType,
    nominalSizeMm: positive(value.nominalSizeMm, 'catalogueBinding.nominalSizeMm'),
    outsideDiameterMm: positive(
      value.outsideDiameterMm,
      'catalogueBinding.outsideDiameterMm',
    ),
    secondaryNominalSizeMm,
    secondaryOutsideDiameterMm,
    pipingClass: requiredText(value.pipingClass, 'catalogueBinding.pipingClass').toUpperCase(),
    pressureClass: optionalText(value.pressureClass),
    materialSpecification: optionalText(value.materialSpecification),
    componentLengthMm: optionalPositive(
      value.componentLengthMm,
      'catalogueBinding.componentLengthMm',
    ),
    componentMassKg: optionalPositive(
      value.componentMassKg,
      'catalogueBinding.componentMassKg',
    ),
    endConnectionFrom: requiredText(
      value.endConnectionFrom,
      'catalogueBinding.endConnectionFrom',
    ).toUpperCase(),
    endConnectionTo: requiredText(
      value.endConnectionTo,
      'catalogueBinding.endConnectionTo',
    ).toUpperCase(),
    valveType: optionalText(value.valveType),
    valveFaceToFaceMm: optionalPositive(
      value.valveFaceToFaceMm,
      'catalogueBinding.valveFaceToFaceMm',
    ),
    flangeClass: optionalText(value.flangeClass),
    flangeFacing: optionalText(value.flangeFacing),
    flangeType: optionalText(value.flangeType),
    flangeThicknessMm: optionalPositive(
      value.flangeThicknessMm,
      'catalogueBinding.flangeThicknessMm',
    ),
    flangeOutsideDiameterMm: optionalPositive(
      value.flangeOutsideDiameterMm,
      'catalogueBinding.flangeOutsideDiameterMm',
    ),
    boltCircleDiameterMm: optionalPositive(
      value.boltCircleDiameterMm,
      'catalogueBinding.boltCircleDiameterMm',
    ),
    boltHoleCount: optionalPositiveInteger(
      value.boltHoleCount,
      'catalogueBinding.boltHoleCount',
    ),
    boltHoleDiameterMm: optionalPositive(
      value.boltHoleDiameterMm,
      'catalogueBinding.boltHoleDiameterMm',
    ),
    reducerType: optionalText(value.reducerType),
    reducerOrientation: optionalText(value.reducerOrientation),
    sourceReference: normalizeSourceReference(value.sourceReference),
  };
  if (componentType === 'VALVE' && (!binding.valveType || !binding.valveFaceToFaceMm)) {
    fail('VALVE catalogue binding requires valveType and valveFaceToFaceMm.', RangeError);
  }
  if (componentType === 'FLANGE' && (!binding.flangeClass || !binding.flangeFacing)) {
    fail('FLANGE catalogue binding requires flangeClass and flangeFacing.', RangeError);
  }
  if (componentType === 'REDUCER') {
    if (!secondaryNominalSizeMm || !secondaryOutsideDiameterMm) {
      fail('REDUCER catalogue binding requires secondary size and outside diameter.', RangeError);
    }
    if (!binding.reducerType || !binding.reducerOrientation) {
      fail('REDUCER catalogue binding requires type and orientation.', RangeError);
    }
  } else if (secondaryNominalSizeMm || secondaryOutsideDiameterMm) {
    fail('secondary size fields are valid only for REDUCER.', RangeError);
  }
  return deepFreeze(binding);
}

function assertHostCompatibility(edge, binding, direction) {
  const hostNominal = positiveOrNull(edge.diameterMm);
  const hostOutside = positiveOrNull(edge.outsideDiameterMm);
  const reducer = binding.componentType === 'REDUCER';
  const primaryAtFrom = direction === 'FROM_TO';
  const expectedNominal = reducer && !primaryAtFrom
    ? binding.secondaryNominalSizeMm
    : binding.nominalSizeMm;
  const expectedOutside = reducer && !primaryAtFrom
    ? binding.secondaryOutsideDiameterMm
    : binding.outsideDiameterMm;
  if (hostNominal !== null && !nearlyEqual(hostNominal, expectedNominal)) {
    fail(
      `host nominal size ${hostNominal} mm differs from insertion-side size ${expectedNominal} mm.`,
      RangeError,
    );
  }
  if (hostOutside !== null && !nearlyEqual(hostOutside, expectedOutside)) {
    fail(
      `host outside diameter ${hostOutside} mm differs from insertion-side outside diameter ${expectedOutside} mm.`,
      RangeError,
    );
  }
}

function sourceComponentSide(edge, binding, direction) {
  if (binding.componentType !== 'REDUCER') return 'LEFT';
  const hostOutside = positiveOrNull(edge.outsideDiameterMm);
  if (hostOutside === null) return direction === 'FROM_TO' ? 'LEFT' : 'RIGHT';
  if (nearlyEqual(hostOutside, binding.outsideDiameterMm)) {
    return direction === 'FROM_TO' ? 'LEFT' : 'RIGHT';
  }
  return direction === 'FROM_TO' ? 'RIGHT' : 'LEFT';
}

function generatedIds(topology, commandId) {
  const ids = {
    fromNodeId: generatedId('node', commandId, 'inline-from-node'),
    toNodeId: generatedId('node', commandId, 'inline-to-node'),
    leftEdgeId: generatedId('edge', commandId, 'inline-left-edge'),
    componentEdgeId: generatedId('edge', commandId, 'inline-component-edge'),
    rightEdgeId: generatedId('edge', commandId, 'inline-right-edge'),
  };
  Object.values(ids).forEach((id) => assertUnusedId(topology, id));
  return ids;
}

function generatedId(prefix, commandId, role) {
  return `${prefix}:${deterministicTopologyEditId(commandId, role).split(':').at(-1)}`;
}

function inlineNode(id, position, commandId, edgeId, endpoint) {
  return {
    id,
    position,
    portKeys: [],
    createdByCommandId: commandId,
    derivedFromEdgeId: edgeId,
    inlineComponentEndpoint: endpoint,
  };
}

function assertNoDependants(topology, edgeId) {
  for (const collection of ['junctions', 'supports', 'boundaries', 'rigids', 'bends']) {
    const dependent = (topology?.[collection] ?? []).find((record) => (
      record?.edgeId === edgeId || record?.edgeIds?.includes?.(edgeId)
    ));
    if (dependent) {
      fail(
        `host edge ${edgeId} has dependent ${collection} record ${dependent.id}.`,
        RangeError,
      );
    }
  }
}

function assertUnusedId(topology, id) {
  for (const key of ['nodes', 'edges', 'junctions', 'supports', 'boundaries', 'rigids', 'bends']) {
    if ((topology?.[key] ?? []).some((row) => row?.id === id)) {
      fail(`generated identity collision ${id}.`, RangeError);
    }
  }
}

function exact(rows, id, label) {
  const matches = (rows ?? []).filter((row) => row?.id === id);
  if (matches.length !== 1) fail(`${label} ${id} resolved ${matches.length} records.`, RangeError);
  return matches[0];
}

function normalizeSourceReference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('catalogueBinding.sourceReference must be an object.');
  }
  return {
    documentId: requiredText(value.documentId, 'catalogueBinding.sourceReference.documentId'),
    revision: requiredText(value.revision, 'catalogueBinding.sourceReference.revision'),
    path: requiredText(value.path, 'catalogueBinding.sourceReference.path'),
  };
}

function noChanges(delta, keys) {
  return keys.every((key) => changes(delta[key]).length === 0);
}
function changes(delta = {}) {
  return [...(delta.addedIds ?? []), ...(delta.removedIds ?? []), ...(delta.changedIds ?? [])];
}
function interpolate(from, to, fractionValue) {
  return {
    x: from.x + (to.x - from.x) * fractionValue,
    y: from.y + (to.y - from.y) * fractionValue,
    z: from.z + (to.z - from.z) * fractionValue,
  };
}
function pointDistance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
}
function clone(value) { return JSON.parse(JSON.stringify(value ?? [])); }
function normalizedType(value) { return requiredText(value, 'entityType').toUpperCase(); }
function fraction(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number >= 1) {
    fail(`${label} must be strictly between 0 and 1.`, RangeError);
  }
  return number;
}
function enumText(value, allowed, label) {
  const text = requiredText(value, label).toUpperCase();
  if (!allowed.has(text)) fail(`${label} has unsupported value ${text}.`, RangeError);
  return text;
}
function optionalText(value) {
  const text = stringValue(value);
  return text ? text.toUpperCase() : null;
}
function optionalPositive(value, label) {
  return value === null || value === undefined || value === '' ? null : positive(value, label);
}
function optionalPositiveInteger(value, label) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) fail(`${label} must be a positive integer.`, RangeError);
  return number;
}
function positive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) fail(`${label} must be positive.`, RangeError);
  return number;
}
function positiveOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function nearlyEqual(left, right) {
  return Math.abs(Number(left) - Number(right)) <= 1e-9;
}
function requiredText(value, label) {
  const text = stringValue(value);
  if (!text) fail(`${label} is required.`);
  return text;
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditInlineComponentCommand: ${message}`);
}
