import {
  deepFreeze,
  semanticHash,
} from '../../../core/shared-piping-model/index.js';
import {
  assertTopologyEditAuthoringSession,
} from './topology-edit-authoring-session.js';
import {
  planTopologyEditInlineComponentOperation,
} from '../professional/topology-edit-inline-component-operation.js';
import {
  createTopologyEditOperationPlan,
} from '../professional/topology-edit-operation-plan.js';
import {
  assertTopologyEditSpecificationCatalogue,
} from '../professional/topology-edit-spec-catalog.js';

const STRAIGHT_TYPES = new Set(['PIPE', 'STRAIGHT', 'STRAIGHT_ELEMENT']);
const TOLERANCE = 1e-9;
const CATALOGUE_FIELDS = Object.freeze([
  'nominalSizeMm',
  'pressureClass',
  'facing',
  'thicknessMm',
  'componentMassKg',
]);

export function deriveTopologyEditBlindFlangeTarget(input = {}) {
  const topology = assertTopology(input.topology);
  const node = exactNode(topology, input.nodeId);
  const incident = incidentEdges(topology, node.id);
  if (incident.length !== 1) {
    fail('Blind flange requires one graph-open endpoint node.', RangeError);
  }
  const edge = incident[0];
  if (!STRAIGHT_TYPES.has(normalizedType(edge.entityType))) {
    fail('Blind flange requires a terminal straight pipe edge.', RangeError);
  }
  assertNoDependants(topology, edge.id, node.id);
  const other = exactNode(
    topology,
    edge.fromNodeId === node.id ? edge.toNodeId : edge.fromNodeId,
  );
  const lengthMm = distance(node.position, other.position);
  if (!(lengthMm > TOLERANCE)) fail(`edge ${edge.id} has zero length.`, RangeError);
  const direction = unit(subtract(node.position, other.position));
  const placement = edge.fromNodeId === node.id ? 'FROM_BOUNDARY' : 'TO_BOUNDARY';
  const insertionDirection = placement === 'FROM_BOUNDARY' ? 'TO_FROM' : 'FROM_TO';
  const canonicalIds = [node.id, edge.id].sort();
  return deepFreeze({
    kind: 'open-endpoint',
    canonicalIds,
    stationMm: null,
    position: { ...node.position },
    direction,
    targetHash: semanticHash({
      basisHash: topology.canonicalTopologyHash,
      tool: 'BLIND_FLANGE',
      nodeId: node.id,
      edgeId: edge.id,
      placement,
      insertionDirection,
      position: node.position,
      direction,
    }),
  });
}

export function topologyEditBlindFlangeCatalogueOptions(input = {}) {
  const topology = assertTopology(input.topology);
  const session = assertBlindFlangeSession(input.authoringSession);
  const catalogue = assertTopologyEditSpecificationCatalogue(input.catalogue);
  const { edge } = terminalContext(topology, session);
  const lengthMm = edgeLength(topology, edge);
  const options = catalogue.records.filter((record) => (
    record.componentType === 'FLANGE'
    && record.flangeType === 'BLIND'
    && hostMatches(edge, record)
    && validBlindRecord(record)
    && record.componentLengthMm < lengthMm - TOLERANCE
  )).map((record) => deepFreeze({
    recordId: record.recordId,
    recordHash: record.recordHash,
    label: `${record.recordId} · DN${record.nominalSizeMm} · Class ${
      record.pressureClass ?? record.flangeClass
    } · ${record.flangeFacing}`,
  })).sort((left, right) => left.recordId.localeCompare(right.recordId));
  return deepFreeze(options);
}

export function topologyEditBlindFlangeDefaultProperties(input = {}) {
  const topology = assertTopology(input.topology);
  const session = assertBlindFlangeSession(input.authoringSession);
  const catalogue = assertTopologyEditSpecificationCatalogue(input.catalogue);
  const options = topologyEditBlindFlangeCatalogueOptions({
    topology,
    authoringSession: session,
    catalogue,
  });
  if (!options.length) {
    fail('no exact blind flange catalogue record fits the selected terminal edge.', RangeError);
  }
  const requestedId = String(
    input.catalogueRecordId ?? session.properties.catalogueRecordId ?? '',
  ).trim();
  const selected = options.find((row) => row.recordId === requestedId) ?? options[0];
  const record = exactRecord(catalogue, selected.recordId, selected.recordHash);
  return deepFreeze({
    catalogueRecordId: record.recordId,
    nominalSizeMm: record.nominalSizeMm,
    pressureClass: record.pressureClass ?? record.flangeClass,
    facing: record.flangeFacing,
    thicknessMm: record.flangeThicknessMm,
    componentMassKg: record.componentMassKg,
  });
}

export function planTopologyEditBlindFlangeAuthoringOperation(input = {}) {
  const topology = assertTopology(input.topology);
  const session = assertBlindFlangeSession(input.authoringSession);
  const catalogue = assertTopologyEditSpecificationCatalogue(input.catalogue);
  const defaults = topologyEditBlindFlangeDefaultProperties({
    topology,
    authoringSession: session,
    catalogue,
    catalogueRecordId: session.properties.catalogueRecordId,
  });
  assertExactProperties(session, defaults);
  const record = exactRecord(catalogue, defaults.catalogueRecordId);
  const { node, edge, placement, direction, lengthMm } = terminalContext(topology, session);
  const centerDistanceMm = placement === 'FROM_BOUNDARY'
    ? record.componentLengthMm / 2
    : lengthMm - record.componentLengthMm / 2;
  const planned = planTopologyEditInlineComponentOperation({
    topology,
    catalogue,
    catalogueRecord: record,
    edgeId: edge.id,
    centerDistanceMm,
    insertionLengthMm: record.componentLengthMm,
    direction,
    placement,
  });
  return createTopologyEditOperationPlan({
    operationType: planned.operationType,
    basisHash: planned.basisHash,
    targetIds: [node.id, edge.id],
    parameters: {
      ...planned.parameters,
      authoringTool: 'BLIND_FLANGE',
      terminalNodeId: node.id,
      terminalPlacement: placement,
      terminalDirection: direction,
      terminalConnection: placement === 'FROM_BOUNDARY'
        ? record.endConnectionFrom
        : record.endConnectionTo,
      catalogueOptionHash: semanticHash({
        recordId: record.recordId,
        recordHash: record.recordHash,
        nodeId: node.id,
        edgeId: edge.id,
        placement,
        direction,
      }),
    },
    commandIntents: planned.commandIntents,
    changedScope: planned.changedScope,
    unresolvedEvidence: planned.unresolvedEvidence,
  });
}

function terminalContext(topology, session) {
  const nodeId = exactTargetId(session, 'node:');
  const edgeId = exactTargetId(session, 'edge:');
  const node = exactNode(topology, nodeId);
  const edge = exactEdge(topology, edgeId);
  if (![edge.fromNodeId, edge.toNodeId].includes(node.id)) {
    fail(`edge ${edge.id} is not incident to terminal node ${node.id}.`, RangeError);
  }
  const incident = incidentEdges(topology, node.id);
  if (incident.length !== 1 || incident[0].id !== edge.id) {
    fail(`node ${node.id} is not graph-open.`, RangeError);
  }
  if (!STRAIGHT_TYPES.has(normalizedType(edge.entityType))) {
    fail('Blind flange target edge must remain a straight pipe.', RangeError);
  }
  assertNoDependants(topology, edge.id, node.id);
  const lengthMm = edgeLength(topology, edge);
  const placement = edge.fromNodeId === node.id ? 'FROM_BOUNDARY' : 'TO_BOUNDARY';
  const direction = placement === 'FROM_BOUNDARY' ? 'TO_FROM' : 'FROM_TO';
  return { node, edge, lengthMm, placement, direction };
}

function validBlindRecord(record) {
  return positiveOrNull(record.componentLengthMm) !== null
    && positiveOrNull(record.flangeThicknessMm) !== null
    && nearlyEqual(record.componentLengthMm, record.flangeThicknessMm)
    && positiveOrNull(record.componentMassKg) !== null
    && positiveOrNull(record.flangeOutsideDiameterMm) !== null
    && positiveOrNull(record.boltCircleDiameterMm) !== null
    && Number.isInteger(record.boltHoleCount)
    && record.boltHoleCount > 0
    && positiveOrNull(record.boltHoleDiameterMm) !== null
    && sameText(record.endConnectionFrom, 'PIPE_TERMINAL')
    && sameText(record.endConnectionTo, `CLOSED_${record.flangeFacing}`);
}

function assertExactProperties(session, expected) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (!Object.is(session.properties[key], expectedValue)) {
      fail(`${key} must equal exact blind flange catalogue evidence.`, RangeError);
    }
    if (CATALOGUE_FIELDS.includes(key)
      && session.propertyAuthorities[key] !== 'CATALOGUE') {
      fail(`${key} must retain CATALOGUE authority.`, RangeError);
    }
  }
}

function hostMatches(edge, record) {
  const hostNominal = positiveOrNull(edge.diameterMm);
  const hostOutside = positiveOrNull(edge.outsideDiameterMm);
  const hostClass = String(edge.pipingClass ?? '').trim().toUpperCase();
  return (hostNominal === null || nearlyEqual(hostNominal, record.nominalSizeMm))
    && (hostOutside === null || nearlyEqual(hostOutside, record.outsideDiameterMm))
    && (!hostClass || sameText(hostClass, record.pipingClass));
}

function assertBlindFlangeSession(value) {
  const session = assertTopologyEditAuthoringSession(value);
  if (session.tool !== 'BLIND_FLANGE') {
    fail('authoring session must use BLIND_FLANGE.', RangeError);
  }
  if (!session.target) fail('BLIND_FLANGE requires an exact target.', RangeError);
  return session;
}

function assertNoDependants(topology, edgeId, nodeId) {
  for (const collection of ['junctions', 'supports', 'boundaries', 'rigids', 'bends']) {
    const dependent = (topology[collection] ?? []).find((record) => (
      record?.edgeId === edgeId
      || record?.edgeIds?.includes?.(edgeId)
      || record?.nodeId === nodeId
      || record?.nodeIds?.includes?.(nodeId)
    ));
    if (dependent) {
      fail(`terminal target has dependent ${collection} record ${dependent.id}.`, RangeError);
    }
  }
}

function exactRecord(catalogue, recordId, recordHash = null) {
  const id = requiredText(recordId, 'catalogueRecordId');
  const matches = catalogue.records.filter((record) => (
    record.recordId === id && (!recordHash || record.recordHash === recordHash)
  ));
  if (matches.length !== 1) {
    fail(`catalogue record ${id} resolved ${matches.length} exact records.`, RangeError);
  }
  const record = matches[0];
  if (record.componentType !== 'FLANGE' || record.flangeType !== 'BLIND') {
    fail(`catalogue record ${id} is not a blind flange.`, RangeError);
  }
  if (!validBlindRecord(record)) {
    fail(`catalogue record ${id} lacks exact blind flange evidence.`, RangeError);
  }
  return record;
}

function exactTargetId(session, prefix) {
  const ids = session.target?.canonicalIds?.filter((id) => id.startsWith(prefix)) ?? [];
  if (ids.length !== 1) fail(`target requires exactly one ${prefix} identity.`, RangeError);
  return ids[0];
}
function assertTopology(value) {
  if (!value?.canonicalTopologyHash || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    fail('canonical topology authority is required.');
  }
  return value;
}
function exactNode(topology, idInput) {
  const id = requiredText(idInput, 'nodeId');
  const matches = topology.nodes.filter((row) => row.id === id);
  if (matches.length !== 1) fail(`node ${id} resolved ${matches.length} records.`, RangeError);
  return matches[0];
}
function exactEdge(topology, idInput) {
  const id = requiredText(idInput, 'edgeId');
  const matches = topology.edges.filter((row) => row.id === id);
  if (matches.length !== 1) fail(`edge ${id} resolved ${matches.length} records.`, RangeError);
  return matches[0];
}
function incidentEdges(topology, nodeId) {
  return topology.edges.filter((edge) => edge.fromNodeId === nodeId || edge.toNodeId === nodeId);
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
function sameText(left, right) {
  return String(left ?? '').trim().toUpperCase() === String(right ?? '').trim().toUpperCase();
}
function nearlyEqual(left, right) { return Math.abs(Number(left) - Number(right)) <= TOLERANCE; }
function positiveOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function subtract(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}
function unit(value) {
  const length = Math.hypot(value.x, value.y, value.z);
  return length > TOLERANCE
    ? { x: value.x / length, y: value.y / length, z: value.z / length }
    : null;
}
function distance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
}
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditAuthoringBlindFlange: ${message}`);
}
