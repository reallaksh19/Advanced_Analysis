import {
  deepFreeze,
  semanticHash,
} from '../../../core/shared-piping-model/index.js';
import {
  assertTopologyEditAuthoringSession,
} from './topology-edit-authoring-session.js';
import {
  deriveTopologyEditAuthoringBranchCatalogueOptions,
} from './topology-edit-authoring-branch-catalogue.js';
import {
  normalizeTopologyEditAuthoringBranchClocking,
} from './topology-edit-authoring-branch-geometry.js';
import {
  normalizeTopologyEditBranchComponentRequest,
} from '../topology-edit-branch-component-command.js';
import {
  assertTopologyEditSpecificationCatalogue,
} from '../professional/topology-edit-spec-catalog.js';
import {
  deriveTopologyEditChangedScope,
} from '../professional/topology-edit-change-scope.js';
import {
  createTopologyEditOperationPlan,
} from '../professional/topology-edit-operation-plan.js';

const STRAIGHT_TYPES = new Set(['PIPE', 'STRAIGHT', 'STRAIGHT_ELEMENT']);
const TOLERANCE = 1e-9;
const USER_FIELDS = new Set([
  'stationMm',
  'catalogueRecordId',
  'clockingDeg',
  'branchPipeLengthMm',
]);
const CATALOGUE_FIELDS = new Set([
  'branchFamily',
  'branchNominalSizeMm',
  'branchOutsideDiameterMm',
  'branchAngleDeg',
  'pressureClass',
  'materialSpecification',
  'branchConnection',
  'componentLengthMm',
  'componentMassKg',
]);

export function deriveTopologyEditBranchAuthoringTarget(input = {}) {
  const topology = assertTopology(input.topology);
  const edge = exactEdge(topology, input.edgeId);
  if (!STRAIGHT_TYPES.has(normalizedType(edge.entityType))) {
    fail('Branch authoring requires one straight pipe edge.', RangeError);
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
    tool: 'BRANCH',
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

export function topologyEditBranchAuthoringCatalogueOptions(input = {}) {
  const topology = assertTopology(input.topology);
  const session = assertBranchSession(input.authoringSession);
  const catalogue = assertTopologyEditSpecificationCatalogue(input.catalogue);
  const edge = exactEdge(topology, exactTargetEdgeId(session));
  const result = deriveTopologyEditAuthoringBranchCatalogueOptions({
    catalogue,
    branchFamily: input.branchFamily,
    hostNominalSizeMm: requiredPositive(edge.diameterMm, 'host nominal size'),
    hostOutsideDiameterMm: requiredPositive(
      edge.outsideDiameterMm,
      'host outside diameter',
    ),
    pipingClass: edge.pipingClass,
  });
  return deepFreeze(result.options.map((option) => ({
    ...option,
    label: `${option.recordId} · ${option.branchFamily} · DN${
      option.hostNominalSizeMm
    }×DN${option.branchNominalSizeMm}`,
  })));
}

export function topologyEditBranchAuthoringDefaultProperties(input = {}) {
  const topology = assertTopology(input.topology);
  const session = assertBranchSession(input.authoringSession);
  const catalogue = assertTopologyEditSpecificationCatalogue(input.catalogue);
  const options = topologyEditBranchAuthoringCatalogueOptions({
    topology,
    authoringSession: session,
    catalogue,
  });
  if (!options.length) {
    fail('no exact Tee/Olet catalogue record matches the selected host edge.', RangeError);
  }
  const requestedRecordId = String(
    input.catalogueRecordId ?? session.properties.catalogueRecordId ?? '',
  ).trim();
  const selected = options.find((row) => row.recordId === requestedRecordId)
    ?? options[0];
  const edge = exactEdge(topology, exactTargetEdgeId(session));
  const hostLengthMm = edgeLength(topology, edge);
  const stationCandidate = positiveOrNull(
    input.stationMm ?? session.properties.stationMm,
  );
  const stationMm = stationCandidate !== null
    && stationCandidate > TOLERANCE
    && stationCandidate < hostLengthMm - TOLERANCE
    ? stationCandidate
    : hostLengthMm / 2;
  const branchPipeLengthMm = positiveOrNull(
    input.branchPipeLengthMm ?? session.properties.branchPipeLengthMm,
  ) ?? 400;
  const clockingDeg = normalizeTopologyEditAuthoringBranchClocking(
    input.clockingDeg ?? session.properties.clockingDeg ?? 0,
  );
  return deepFreeze({
    stationMm,
    catalogueRecordId: selected.recordId,
    clockingDeg,
    branchPipeLengthMm,
    branchFamily: selected.branchFamily,
    branchNominalSizeMm: selected.branchNominalSizeMm,
    branchOutsideDiameterMm: selected.branchOutsideDiameterMm,
    branchAngleDeg: selected.branchAngleDeg,
    pressureClass: selected.pressureClass,
    materialSpecification: selected.materialSpecification,
    branchConnection: selected.branchEndConnection,
    componentLengthMm: selected.componentLengthMm,
    componentMassKg: selected.componentMassKg,
    totalBranchReachMm: selected.componentLengthMm + branchPipeLengthMm,
  });
}

export function planTopologyEditBranchAuthoringOperation(input = {}) {
  const topology = assertTopology(input.topology);
  const session = assertBranchSession(input.authoringSession);
  const catalogue = assertTopologyEditSpecificationCatalogue(input.catalogue);
  const defaults = topologyEditBranchAuthoringDefaultProperties({
    topology,
    authoringSession: session,
    catalogue,
    catalogueRecordId: session.properties.catalogueRecordId,
    stationMm: session.properties.stationMm,
    clockingDeg: session.properties.clockingDeg,
    branchPipeLengthMm: session.properties.branchPipeLengthMm,
  });
  assertExactProperties(session, defaults);
  const options = topologyEditBranchAuthoringCatalogueOptions({
    topology,
    authoringSession: session,
    catalogue,
  });
  const selected = options.find((row) => row.recordId === defaults.catalogueRecordId);
  if (!selected) fail('selected branch record is not one exact compatible option.', RangeError);
  const edge = exactEdge(topology, exactTargetEdgeId(session));
  const from = exactNode(topology, edge.fromNodeId);
  const to = exactNode(topology, edge.toNodeId);
  const operationAuthority = {
    basisHash: topology.canonicalTopologyHash,
    hostEdgeId: edge.id,
    hostEdgeHash: semanticHash({ kind: 'EDGE', record: edge }),
    catalogueHash: catalogue.catalogueHash,
    catalogueRecordHash: selected.recordHash,
    stationMm: defaults.stationMm,
    clockingDeg: defaults.clockingDeg,
    branchPipeLengthMm: defaults.branchPipeLengthMm,
  };
  const operationHash = semanticHash(operationAuthority);
  const operationId = `branch-component:${operationHash.split(':').at(-1)}`;
  const payload = normalizeTopologyEditBranchComponentRequest({
    operationId,
    hostEdgeId: edge.id,
    hostEdgeHash: operationAuthority.hostEdgeHash,
    hostFromNodeId: from.id,
    hostToNodeId: to.id,
    hostFrom: from.position,
    hostTo: to.position,
    catalogueHash: selected.catalogueHash,
    catalogueSourceHash: selected.catalogueSourceHash,
    catalogueVersion: selected.catalogueVersion,
    catalogueRecordId: selected.recordId,
    catalogueRecordHash: selected.recordHash,
    sourceReference: selected.sourceReference,
    branchFamily: selected.branchFamily,
    hostNominalSizeMm: selected.hostNominalSizeMm,
    hostOutsideDiameterMm: selected.hostOutsideDiameterMm,
    branchNominalSizeMm: selected.branchNominalSizeMm,
    branchOutsideDiameterMm: selected.branchOutsideDiameterMm,
    branchAngleDeg: selected.branchAngleDeg,
    pipingClass: selected.pipingClass,
    pressureClass: selected.pressureClass,
    materialSpecification: selected.materialSpecification,
    hostEndConnection: selected.hostEndConnection,
    branchEndConnection: selected.branchEndConnection,
    componentLengthMm: selected.componentLengthMm,
    componentMassKg: selected.componentMassKg,
    branchPipeLengthMm: defaults.branchPipeLengthMm,
    stationMm: defaults.stationMm,
    clockingDeg: defaults.clockingDeg,
  });
  const changedScope = deriveTopologyEditChangedScope(topology, {
    basisHash: topology.canonicalTopologyHash,
    edgeIds: [edge.id],
  });
  return createTopologyEditOperationPlan({
    operationType: 'INSERT_BRANCH_COMPONENT',
    basisHash: topology.canonicalTopologyHash,
    targetIds: [edge.id],
    parameters: {
      authoringTool: 'BRANCH',
      operationId,
      operationHash,
      catalogueRecordId: selected.recordId,
      catalogueRecordHash: selected.recordHash,
      catalogueHash: selected.catalogueHash,
      catalogueSourceHash: selected.catalogueSourceHash,
      branchFamily: selected.branchFamily,
      stationMm: defaults.stationMm,
      clockingDeg: defaults.clockingDeg,
      branchPipeLengthMm: defaults.branchPipeLengthMm,
      totalBranchReachMm: defaults.totalBranchReachMm,
      generatedRecordRoles: [
        'node:branch-junction',
        'node:branch-component-face',
        'node:branch-end',
        'edge:host-from',
        'edge:host-to',
        'edge:branch-component',
        'edge:branch-pipe',
        'junction:branch-component',
      ],
    },
    commandIntents: [{ commandType: 'INSERT_BRANCH_COMPONENT', payload }],
    changedScope,
    unresolvedEvidence: [],
  });
}

function assertExactProperties(session, defaults) {
  for (const [key, expected] of Object.entries(defaults)) {
    if (!Object.is(session.properties[key], expected)) {
      fail(`${key} must equal exact branch authoring evidence.`, RangeError);
    }
    const expectedAuthority = USER_FIELDS.has(key)
      ? 'USER_INPUT'
      : CATALOGUE_FIELDS.has(key) ? 'CATALOGUE' : 'DERIVED';
    if (session.propertyAuthorities[key] !== expectedAuthority) {
      fail(`${key} must retain ${expectedAuthority} authority.`, RangeError);
    }
  }
}

function assertBranchSession(value) {
  const session = assertTopologyEditAuthoringSession(value);
  if (session.tool !== 'BRANCH' || session.target?.kind !== 'straight-edge') {
    fail('BRANCH requires one exact straight-edge target.', RangeError);
  }
  return session;
}

function exactTargetEdgeId(session) {
  const ids = session.target?.canonicalIds?.filter((id) => id.startsWith('edge:')) ?? [];
  if (ids.length !== 1) fail('branch target requires exactly one edge identity.', RangeError);
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
  if (!value?.canonicalTopologyHash || !Array.isArray(value.nodes)
    || !Array.isArray(value.edges)) {
    fail('canonical topology authority is required.');
  }
  return value;
}

function exactNode(topology, id) {
  const rows = topology.nodes.filter((row) => row.id === id);
  if (rows.length !== 1) fail(`node ${id} resolved ${rows.length} records.`, RangeError);
  return rows[0];
}

function exactEdge(topology, idInput) {
  const id = String(idInput ?? '').trim();
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
function add(left, right) {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}
function subtract(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}
function scale(value, scalar) {
  return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar };
}
function distance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
}
function unit(value) {
  const length = Math.hypot(value.x, value.y, value.z);
  return length > TOLERANCE ? scale(value, 1 / length) : null;
}
function positiveOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function requiredPositive(value, label) {
  const number = positiveOrNull(value);
  if (number === null) fail(`${label} must be positive.`, RangeError);
  return number;
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditAuthoringBranch: ${message}`);
}
