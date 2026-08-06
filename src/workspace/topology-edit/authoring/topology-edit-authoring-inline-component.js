import {
  deepFreeze,
  semanticHash,
} from '../../../core/shared-piping-model/index.js';
import {
  assertTopologyEditAuthoringSession,
} from './topology-edit-authoring-session.js';
import {
  createTopologyEditOperationPlan,
} from '../professional/topology-edit-operation-plan.js';
import {
  planTopologyEditInlineComponentOperation,
} from '../professional/topology-edit-inline-component-operation.js';
import {
  assertTopologyEditSpecificationCatalogue,
} from '../professional/topology-edit-spec-catalog.js';

const INLINE_TOOLS = new Set(['FLANGE', 'REDUCER']);
const STRAIGHT_TYPES = new Set(['PIPE', 'STRAIGHT', 'STRAIGHT_ELEMENT']);
const DIRECTIONS = Object.freeze(['FROM_TO', 'TO_FROM']);
const TOLERANCE = 1e-9;

export function deriveTopologyEditInlineAuthoringTarget(input = {}) {
  const topology = assertTopology(input.topology);
  const tool = inlineTool(input.tool);
  const edge = exactEdge(topology, input.edgeId);
  if (!STRAIGHT_TYPES.has(normalizedType(edge.entityType))) {
    fail(`${tool} requires one straight pipe edge.`, RangeError);
  }
  assertNoDependants(topology, edge.id);
  const from = exactNode(topology, edge.fromNodeId);
  const to = exactNode(topology, edge.toNodeId);
  const lengthMm = distance(from.position, to.position);
  if (!(lengthMm > TOLERANCE)) fail(`edge ${edge.id} has zero length.`, RangeError);
  const direction = unit(subtract(to.position, from.position));
  const stationMm = lengthMm / 2;
  const position = add(from.position, scale(direction, stationMm));
  const material = {
    basisHash: topology.canonicalTopologyHash,
    tool,
    edgeId: edge.id,
    fromNodeId: from.id,
    toNodeId: to.id,
    stationMm,
    position,
    direction,
  };
  return deepFreeze({
    kind: 'straight-edge',
    canonicalIds: [edge.id],
    stationMm,
    position,
    direction,
    targetHash: semanticHash(material),
  });
}

export function topologyEditInlineAuthoringCatalogueOptions(input = {}) {
  const topology = assertTopology(input.topology);
  const session = assertTopologyEditAuthoringSession(input.authoringSession);
  const catalogue = assertTopologyEditSpecificationCatalogue(input.catalogue);
  const tool = inlineTool(session.tool);
  const edge = exactEdge(topology, exactTargetEdgeId(session));
  const from = exactNode(topology, edge.fromNodeId);
  const to = exactNode(topology, edge.toNodeId);
  const lengthMm = distance(from.position, to.position);
  const componentType = tool;
  const options = [];
  for (const record of catalogue.records) {
    if (record.componentType !== componentType) continue;
    if (tool === 'FLANGE' && record.flangeType === 'BLIND') continue;
    const componentLengthMm = record.componentType === 'VALVE'
      ? record.valveFaceToFaceMm
      : record.componentLengthMm;
    if (!(componentLengthMm > 0) || !(componentLengthMm < lengthMm - TOLERANCE)) continue;
    const directions = record.componentType === 'REDUCER'
      ? compatibleReducerDirections(edge, record)
      : (hostMatches(edge, record.nominalSizeMm, record.outsideDiameterMm)
        ? ['FROM_TO']
        : []);
    for (const direction of directions) {
      options.push(deepFreeze({
        recordId: record.recordId,
        recordHash: record.recordHash,
        componentType: record.componentType,
        direction,
        label: optionLabel(record, direction),
      }));
    }
  }
  return deepFreeze(options.sort((left, right) => (
    left.recordId.localeCompare(right.recordId)
    || left.direction.localeCompare(right.direction)
  )));
}

export function topologyEditInlineAuthoringDefaultProperties(input = {}) {
  const topology = assertTopology(input.topology);
  const session = assertTopologyEditAuthoringSession(input.authoringSession);
  const catalogue = assertTopologyEditSpecificationCatalogue(input.catalogue);
  const options = topologyEditInlineAuthoringCatalogueOptions({
    topology,
    authoringSession: session,
    catalogue,
  });
  if (!options.length) {
    fail(`no exact ${session.tool.toLowerCase()} catalogue records fit the selected edge.`, RangeError);
  }
  const requestedRecordId = String(
    input.catalogueRecordId ?? session.properties.catalogueRecordId ?? '',
  ).trim();
  const requestedDirection = String(
    input.inlineDirection ?? session.properties.inlineDirection ?? '',
  ).trim().toUpperCase();
  const selected = options.find((option) => (
    option.recordId === requestedRecordId
    && (!requestedDirection || option.direction === requestedDirection)
  )) ?? options.find((option) => option.recordId === requestedRecordId)
    ?? options[0];
  const record = exactRecord(catalogue, selected.recordId, selected.recordHash);
  const edge = exactEdge(topology, exactTargetEdgeId(session));
  const lengthMm = edgeLength(topology, edge);
  const stationCandidate = finitePositive(input.stationMm ?? session.properties.stationMm);
  const minimumStation = record.componentLengthMm / 2;
  const maximumStation = lengthMm - minimumStation;
  const stationMm = stationCandidate !== null
    && stationCandidate > minimumStation + TOLERANCE
    && stationCandidate < maximumStation - TOLERANCE
    ? stationCandidate
    : lengthMm / 2;
  if (session.tool === 'FLANGE') {
    return deepFreeze({
      stationMm,
      catalogueRecordId: record.recordId,
      flangeType: record.flangeType,
      pressureClass: record.pressureClass ?? record.flangeClass,
      facing: record.flangeFacing,
      materialSpecification: record.materialSpecification,
      componentLengthMm: record.componentLengthMm,
      componentMassKg: record.componentMassKg,
    });
  }
  const primaryFrom = selected.direction === 'FROM_TO';
  return deepFreeze({
    stationMm,
    catalogueRecordId: record.recordId,
    inlineDirection: selected.direction,
    fromNominalSizeMm: primaryFrom
      ? record.nominalSizeMm
      : record.secondaryNominalSizeMm,
    toNominalSizeMm: primaryFrom
      ? record.secondaryNominalSizeMm
      : record.nominalSizeMm,
    reducerType: record.reducerType,
    orientation: record.reducerOrientation,
    pressureClass: record.pressureClass,
    materialSpecification: record.materialSpecification,
    componentLengthMm: record.componentLengthMm,
    componentMassKg: record.componentMassKg,
  });
}

export function planTopologyEditInlineAuthoringOperation(input = {}) {
  const topology = assertTopology(input.topology);
  const session = assertTopologyEditAuthoringSession(input.authoringSession);
  const catalogue = assertTopologyEditSpecificationCatalogue(input.catalogue);
  const tool = inlineTool(session.tool);
  const options = topologyEditInlineAuthoringCatalogueOptions({
    topology,
    authoringSession: session,
    catalogue,
  });
  const recordId = requiredText(session.properties.catalogueRecordId, 'catalogueRecordId');
  const direction = tool === 'REDUCER'
    ? enumDirection(session.properties.inlineDirection)
    : 'FROM_TO';
  const option = options.find((row) => (
    row.recordId === recordId && row.direction === direction
  ));
  if (!option) {
    fail(`catalogue record ${recordId} is not compatible with the selected edge and direction.`, RangeError);
  }
  const record = exactRecord(catalogue, option.recordId, option.recordHash);
  assertCatalogueProperties(session, record, direction);
  const planned = planTopologyEditInlineComponentOperation({
    topology,
    catalogue,
    catalogueRecord: record,
    edgeId: exactTargetEdgeId(session),
    centerDistanceMm: requiredPositive(session.properties.stationMm, 'stationMm'),
    insertionLengthMm: record.componentLengthMm,
    direction,
  });
  return createTopologyEditOperationPlan({
    operationType: planned.operationType,
    basisHash: planned.basisHash,
    targetIds: planned.targetIds,
    parameters: {
      ...planned.parameters,
      authoringTool: tool,
      catalogueOptionHash: semanticHash(option),
    },
    commandIntents: planned.commandIntents,
    changedScope: planned.changedScope,
    unresolvedEvidence: planned.unresolvedEvidence,
  });
}

function assertCatalogueProperties(session, record, direction) {
  const properties = session.properties;
  const expected = session.tool === 'FLANGE'
    ? {
      flangeType: record.flangeType,
      pressureClass: record.pressureClass ?? record.flangeClass,
      facing: record.flangeFacing,
      materialSpecification: record.materialSpecification,
      componentLengthMm: record.componentLengthMm,
      componentMassKg: record.componentMassKg,
    }
    : {
      fromNominalSizeMm: direction === 'FROM_TO'
        ? record.nominalSizeMm
        : record.secondaryNominalSizeMm,
      toNominalSizeMm: direction === 'FROM_TO'
        ? record.secondaryNominalSizeMm
        : record.nominalSizeMm,
      reducerType: record.reducerType,
      orientation: record.reducerOrientation,
      pressureClass: record.pressureClass,
      materialSpecification: record.materialSpecification,
      componentLengthMm: record.componentLengthMm,
      componentMassKg: record.componentMassKg,
    };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (!Object.is(properties[key], expectedValue)) {
      fail(`${key} must equal exact catalogue record ${record.recordId} evidence.`, RangeError);
    }
    if (session.propertyAuthorities[key] !== 'CATALOGUE') {
      fail(`${key} must retain CATALOGUE authority.`, RangeError);
    }
  }
}

function compatibleReducerDirections(edge, record) {
  return DIRECTIONS.filter((direction) => {
    const primaryAtHost = direction === 'FROM_TO';
    return hostMatches(
      edge,
      primaryAtHost ? record.nominalSizeMm : record.secondaryNominalSizeMm,
      primaryAtHost ? record.outsideDiameterMm : record.secondaryOutsideDiameterMm,
    );
  });
}

function hostMatches(edge, nominalSizeMm, outsideDiameterMm) {
  const hostNominal = finitePositive(edge.diameterMm);
  const hostOutside = finitePositive(edge.outsideDiameterMm);
  return (hostNominal === null || nearlyEqual(hostNominal, nominalSizeMm))
    && (hostOutside === null || nearlyEqual(hostOutside, outsideDiameterMm));
}

function optionLabel(record, direction) {
  if (record.componentType === 'FLANGE') {
    return `${record.recordId} · DN${record.nominalSizeMm} · Class ${
      record.pressureClass ?? record.flangeClass
    } · ${record.flangeFacing}`;
  }
  const from = direction === 'FROM_TO'
    ? record.nominalSizeMm
    : record.secondaryNominalSizeMm;
  const to = direction === 'FROM_TO'
    ? record.secondaryNominalSizeMm
    : record.nominalSizeMm;
  return `${record.recordId} · DN${from}→DN${to} · ${record.reducerType}`;
}

function exactRecord(catalogue, recordId, recordHash = null) {
  const matches = catalogue.records.filter((record) => (
    record.recordId === recordId && (!recordHash || record.recordHash === recordHash)
  ));
  if (matches.length !== 1) {
    fail(`catalogue record ${recordId} resolved ${matches.length} exact records.`, RangeError);
  }
  return matches[0];
}

function exactTargetEdgeId(session) {
  const ids = session.target?.canonicalIds?.filter((id) => id.startsWith('edge:')) ?? [];
  if (ids.length !== 1) fail('target requires exactly one edge identity.', RangeError);
  return ids[0];
}

function assertNoDependants(topology, edgeId) {
  for (const collection of ['junctions', 'supports', 'boundaries', 'rigids', 'bends']) {
    const dependent = (topology[collection] ?? []).find((record) => (
      record?.edgeId === edgeId || record?.edgeIds?.includes?.(edgeId)
    ));
    if (dependent) {
      fail(`edge ${edgeId} has dependent ${collection} record ${dependent.id}.`, RangeError);
    }
  }
}

function assertTopology(value) {
  if (!value?.canonicalTopologyHash || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    fail('canonical topology authority is required.');
  }
  return value;
}

function inlineTool(value) {
  const tool = String(value ?? '').trim().toUpperCase();
  if (!INLINE_TOOLS.has(tool)) fail(`unsupported inline authoring tool ${tool}.`, RangeError);
  return tool;
}

function enumDirection(value) {
  const direction = requiredText(value, 'inlineDirection').toUpperCase();
  if (!DIRECTIONS.includes(direction)) fail(`unsupported inline direction ${direction}.`, RangeError);
  return direction;
}

function exactNode(topology, id) {
  const rows = topology.nodes.filter((row) => row.id === id);
  if (rows.length !== 1) fail(`node ${id} resolved ${rows.length} records.`, RangeError);
  return rows[0];
}

function exactEdge(topology, idInput) {
  const id = requiredText(idInput, 'edgeId');
  const rows = topology.edges.filter((row) => row.id === id);
  if (rows.length !== 1) fail(`edge ${id} resolved ${rows.length} records.`, RangeError);
  return rows[0];
}

function edgeLength(topology, edge) {
  return distance(
    exactNode(topology, edge.fromNodeId).position,
    exactNode(topology, edge.toNodeId).position,
  );
}

function normalizedType(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[\s/-]+/gu, '_');
}
function add(left, right) { return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }; }
function subtract(left, right) { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function scale(value, scalar) { return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar }; }
function distance(left, right) { return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z); }
function unit(value) {
  const length = Math.hypot(value.x, value.y, value.z);
  return length > TOLERANCE ? scale(value, 1 / length) : null;
}
function nearlyEqual(left, right) { return Math.abs(Number(left) - Number(right)) <= TOLERANCE; }
function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function requiredPositive(value, label) {
  const number = finitePositive(value);
  if (number === null) fail(`${label} must be positive.`, RangeError);
  return number;
}
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditAuthoringInlineComponent: ${message}`);
}
