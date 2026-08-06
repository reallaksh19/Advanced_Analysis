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
export const TOPOLOGY_EDIT_INLINE_PLACEMENTS = Object.freeze([
  'INTERIOR', 'FROM_BOUNDARY', 'TO_BOUNDARY',
]);

const COMPONENT_TYPES = new Set(TOPOLOGY_EDIT_INLINE_COMPONENT_TYPES);
const DIRECTIONS = new Set(TOPOLOGY_EDIT_INLINE_DIRECTIONS);
const LENGTH_AUTHORITIES = new Set(TOPOLOGY_EDIT_INLINE_LENGTH_AUTHORITIES);
const PLACEMENTS = new Set(TOPOLOGY_EDIT_INLINE_PLACEMENTS);
const ASSEMBLY_ROLES = new Set(['UPSTREAM_FLANGE', 'VALVE', 'DOWNSTREAM_FLANGE']);
const STRAIGHT_TYPES = new Set(['PIPE', 'STRAIGHT', 'STRAIGHT_ELEMENT']);
const EPSILON = 1e-9;

export function normalizeTopologyEditInlineComponentPayload(input = {}) {
  const componentType = enumText(
    input.catalogueBinding?.componentType,
    COMPONENT_TYPES,
    'catalogueBinding.componentType',
  );
  const direction = enumText(input.direction ?? 'FROM_TO', DIRECTIONS, 'direction');
  const placement = enumText(input.placement ?? 'INTERIOR', PLACEMENTS, 'placement');
  const lengthAuthority = enumText(
    input.lengthAuthority,
    LENGTH_AUTHORITIES,
    'lengthAuthority',
  );
  const insertionLengthMm = positive(input.insertionLengthMm, 'insertionLengthMm');
  const binding = normalizeBinding(input.catalogueBinding, componentType);
  const assemblyBinding = normalizeAssemblyBinding(input.assemblyBinding, binding);
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
    placement,
    catalogueBinding: binding,
    assemblyBinding,
  });
}

export function assertTopologyEditInlineComponentTarget(topology, payloadInput) {
  const payload = normalizeTopologyEditInlineComponentPayload(payloadInput);
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
  const validPlacement = {
    INTERIOR: startFraction > EPSILON && endFraction < 1 - EPSILON,
    FROM_BOUNDARY: Math.abs(startFraction) <= EPSILON && endFraction < 1 - EPSILON,
    TO_BOUNDARY: startFraction > EPSILON && Math.abs(endFraction - 1) <= EPSILON,
  }[payload.placement];
  if (!validPlacement) {
    fail(`inline ${payload.placement.toLowerCase()} placement does not fit the host edge.`, RangeError);
  }
  assertHostCompatibility(edge, payload.catalogueBinding, payload.direction);
  return deepFreeze({
    edge,
    from,
    to,
    lengthMm,
    startFraction: payload.placement === 'FROM_BOUNDARY' ? 0 : startFraction,
    endFraction: payload.placement === 'TO_BOUNDARY' ? 1 : endFraction,
    placement: payload.placement,
  });
}

export function applyTopologyEditInlineComponent(topology, command) {
  const payload = normalizeTopologyEditInlineComponentPayload(command.payload);
  const target = assertTopologyEditInlineComponentTarget(topology, payload);
  const ids = generatedIds(topology, command.commandId, payload.placement);
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
  const sourceSide = sourceComponentSide(target.edge, binding, payload.direction, payload.placement);
  const fromNodeId = payload.placement === 'FROM_BOUNDARY'
    ? target.edge.fromNodeId
    : ids.fromNodeId;
  const toNodeId = payload.placement === 'TO_BOUNDARY'
    ? target.edge.toNodeId
    : ids.toNodeId;
  const commonSide = {
    entityType: target.edge.entityType ?? 'PIPE',
    sourcePath: target.edge.sourcePath ?? null,
    createdByCommandId: command.commandId,
    derivedFromEdgeId: target.edge.id,
    sourceComponentKey: target.edge.componentKey ?? target.edge.sourceComponentKey ?? null,
  };
  const left = payload.placement === 'FROM_BOUNDARY' ? null : {
    ...target.edge,
    ...commonSide,
    id: ids.leftEdgeId,
    fromNodeId: target.edge.fromNodeId,
    toNodeId: fromNodeId,
    componentKey: sourceSide === 'LEFT' ? target.edge.componentKey ?? null : null,
    diameterMm: fromNominal,
    outsideDiameterMm: fromOutside,
    diameterAuthority: 'OUTSIDE_DIAMETER',
  };
  const right = payload.placement === 'TO_BOUNDARY' ? null : {
    ...target.edge,
    ...commonSide,
    id: ids.rightEdgeId,
    fromNodeId: toNodeId,
    toNodeId: target.edge.toNodeId,
    componentKey: sourceSide === 'RIGHT' ? target.edge.componentKey ?? null : null,
    diameterMm: toNominal,
    outsideDiameterMm: toOutside,
    diameterAuthority: 'OUTSIDE_DIAMETER',
  };
  const component = {
    id: ids.componentEdgeId,
    componentKey: null,
    fromNodeId,
    toNodeId,
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
    inlinePlacement: payload.placement,
    topologyOperation: 'INSERT_INLINE_COMPONENT',
    assemblyBinding: payload.assemblyBinding,
    assemblyId: payload.assemblyBinding?.assemblyId ?? null,
    assemblyHash: payload.assemblyBinding?.assemblyHash ?? null,
    assemblyRole: payload.assemblyBinding?.role ?? null,
    assemblyRecordIds: payload.assemblyBinding?.recordIds ?? [],
    assemblyLengthMm: payload.assemblyBinding?.assemblyLengthMm ?? null,
    assemblyMassKg: payload.assemblyBinding?.assemblyMassKg ?? null,
    catalogueBinding: binding,
    catalogueRecordId: binding.recordId,
    catalogueRecordHash: binding.recordHash,
    catalogueHash: binding.catalogueHash,
    catalogueSourceHash: binding.sourceHash,
    pipingClass: binding.pipingClass,
    endConnectionFrom: primaryFrom ? binding.endConnectionFrom : binding.endConnectionTo,
    endConnectionTo: primaryFrom ? binding.endConnectionTo : binding.endConnectionFrom,
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
  if (payload.placement !== 'FROM_BOUNDARY') {
    nodes.push(inlineNode(ids.fromNodeId, start, command.commandId, target.edge.id, 'FROM'));
  }
  if (payload.placement !== 'TO_BOUNDARY') {
    nodes.push(inlineNode(ids.toNodeId, end, command.commandId, target.edge.id, 'TO'));
  }
  edges.push(...[left, component, right].filter(Boolean));
  return { ...topology, nodes, edges };
}

export function validateTopologyEditInlineComponentEffect(candidate) {
  const delta = candidate.topologyDelta;
  const placement = candidate.resolvedCommand?.payload?.placement ?? 'INTERIOR';
  const expectedNodeCount = placement === 'INTERIOR' ? 2 : 1;
  const expectedEdgeCount = placement === 'INTERIOR' ? 3 : 2;
  const additions = [
    ...(candidate.canonicalTopology.nodes ?? []),
    ...(candidate.canonicalTopology.edges ?? []),
  ].filter((row) => row.createdByCommandId === candidate.commandId);
  const validShape = delta.nodes.addedIds.length === expectedNodeCount
    && delta.nodes.removedIds.length === 0
    && delta.edges.addedIds.length === expectedEdgeCount
    && delta.edges.removedIds.length === 1
    && noChanges(delta, ['junctions', 'supports', 'boundaries', 'rigids', 'bends']);
  const addedIds = [...delta.nodes.addedIds, ...delta.edges.addedIds].sort();
  const provenanceIds = additions.map((row) => row.id).sort();
  const componentEdges = additions.filter((row) => (
    row.topologyOperation === 'INSERT_INLINE_COMPONENT'
  ));
  const validProvenance = semanticHash(addedIds) === semanticHash(provenanceIds)
    && componentEdges.length === 1
    && componentEdges[0].inlinePlacement === placement
    && semanticHash(componentEdges[0].assemblyBinding)
      === semanticHash(candidate.resolvedCommand?.payload?.assemblyBinding ?? null)
    && componentEdges[0].catalogueBinding?.recordHash
      === candidate.resolvedCommand?.payload?.catalogueBinding?.recordHash;
  const findings = [];
  if (!validShape) findings.push({
    code: 'INSERT_INLINE_COMPONENT_DELTA_INVALID',
    message: `INSERT_INLINE_COMPONENT ${placement} must add ${expectedNodeCount} node(s) and ${expectedEdgeCount} edge(s) while replacing exactly one edge.`,
    targetIds: [...changes(delta.nodes), ...changes(delta.edges)].sort(),
  });
  if (!validProvenance) findings.push({
    code: 'INSERT_INLINE_COMPONENT_PROVENANCE_INVALID',
    message: 'Inline insertion additions must carry exact placement, command, and catalogue provenance.',
    targetIds: provenanceIds,
  });
  return findings;
}

function normalizeAssemblyBinding(value, catalogueBinding) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('assemblyBinding must be an object.');
  }
  const role = enumText(value.role, ASSEMBLY_ROLES, 'assemblyBinding.role');
  if (!Array.isArray(value.recordIds) || value.recordIds.length !== 3) {
    fail('assemblyBinding.recordIds must contain three ordered record IDs.', RangeError);
  }
  const recordIds = value.recordIds.map((row, index) => requiredText(
    row,
    `assemblyBinding.recordIds[${index}]`,
  ));
  const roleIndex = { UPSTREAM_FLANGE: 0, VALVE: 1, DOWNSTREAM_FLANGE: 2 }[role];
  if (recordIds[roleIndex] !== catalogueBinding.recordId) {
    fail('assembly role record differs from catalogue binding.', RangeError);
  }
  if ((role === 'VALVE') !== (catalogueBinding.componentType === 'VALVE')) {
    fail('VALVE assembly role requires a valve catalogue binding.', RangeError);
  }
  if ((role !== 'VALVE') !== (catalogueBinding.componentType === 'FLANGE')) {
    fail('Assembly flange roles require flange catalogue bindings.', RangeError);
  }
  return deepFreeze({
    assemblyId: requiredText(value.assemblyId, 'assemblyBinding.assemblyId'),
    assemblyHash: requiredText(value.assemblyHash, 'assemblyBinding.assemblyHash'),
    role,
    recordIds,
    assemblyLengthMm: positive(value.assemblyLengthMm, 'assemblyBinding.assemblyLengthMm'),
    assemblyMassKg: positive(value.assemblyMassKg, 'assemblyBinding.assemblyMassKg'),
  });
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

function sourceComponentSide(edge, binding, direction, placement = 'INTERIOR') {
  if (placement === 'FROM_BOUNDARY') return 'RIGHT';
  if (placement === 'TO_BOUNDARY') return 'LEFT';
  if (binding.componentType !== 'REDUCER') return 'LEFT';
  const hostOutside = positiveOrNull(edge.outsideDiameterMm);
  if (hostOutside === null) return direction === 'FROM_TO' ? 'LEFT' : 'RIGHT';
  if (nearlyEqual(hostOutside, binding.outsideDiameterMm)) {
    return direction === 'FROM_TO' ? 'LEFT' : 'RIGHT';
  }
  return direction === 'FROM_TO' ? 'RIGHT' : 'LEFT';
}

function generatedIds(topology, commandId, placement = 'INTERIOR') {
  const ids = {
    fromNodeId: placement === 'FROM_BOUNDARY'
      ? null
      : generatedId('node', commandId, 'inline-from-node'),
    toNodeId: placement === 'TO_BOUNDARY'
      ? null
      : generatedId('node', commandId, 'inline-to-node'),
    leftEdgeId: placement === 'FROM_BOUNDARY'
      ? null
      : generatedId('edge', commandId, 'inline-left-edge'),
    componentEdgeId: generatedId('edge', commandId, 'inline-component-edge'),
    rightEdgeId: placement === 'TO_BOUNDARY'
      ? null
      : generatedId('edge', commandId, 'inline-right-edge'),
  };
  Object.values(ids).filter(Boolean).forEach((id) => assertUnusedId(topology, id));
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
