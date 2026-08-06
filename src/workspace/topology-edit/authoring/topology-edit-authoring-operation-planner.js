import { semanticHash } from '../../../core/shared-piping-model/index.js';
import {
  assertTopologyEditAuthoringSession,
} from './topology-edit-authoring-session.js';
import {
  topologyEditOperationReference,
} from './topology-edit-operation-graph.js';
import {
  createTopologyEditOperationPlan,
} from '../professional/topology-edit-operation-plan.js';
import {
  deriveTopologyEditChangedScope,
} from '../professional/topology-edit-change-scope.js';

const TOLERANCE = 1e-8;

export function createTopologyEditAuthoringOperationPlan(input = {}) {
  const topology = assertTopology(input.topology);
  const session = assertTopologyEditAuthoringSession(input.authoringSession);
  if (!session.tool || !session.target) {
    fail('an active tool and exact target are required.', RangeError);
  }
  const planners = {
    MOVE: planMove,
    STRETCH: planStretch,
    ROUTE_ELBOW: planRouteElbow,
  };
  const planner = planners[session.tool];
  if (!planner) fail(`tool ${session.tool} is not implemented in this slice.`, RangeError);
  return planner(topology, session);
}

export function deriveTopologyEditAuthoringTarget(input = {}) {
  const topology = assertTopology(input.topology);
  const tool = String(input.tool ?? '').trim().toUpperCase();
  const nodeId = String(input.nodeId ?? '').trim();
  const node = exactNode(topology, nodeId);
  const incident = incidentEdges(topology, node.id);
  if (tool === 'MOVE') return target('node', topology, node, incident, null);
  if (!['STRETCH', 'ROUTE_ELBOW'].includes(tool)) {
    fail(`tool ${tool} does not have a target derivation.`, RangeError);
  }
  if (incident.length !== 1) fail(`${tool} requires one graph-open endpoint node.`, RangeError);
  const edge = incident[0];
  const other = exactNode(topology, edge.fromNodeId === node.id ? edge.toNodeId : edge.fromNodeId);
  const outward = unit(subtract(node.position, other.position));
  if (!outward) fail(`${tool} target edge has zero length.`, RangeError);
  return {
    kind: 'open-endpoint',
    canonicalIds: [node.id, edge.id].sort(),
    stationMm: null,
    position: { ...node.position },
    direction: outward,
    targetHash: semanticHash({
      basisHash: topology.canonicalTopologyHash,
      tool,
      nodeId: node.id,
      edgeId: edge.id,
      position: node.position,
      direction: outward,
    }),
  };
}

export function topologyEditAuthoringDefaultProperties(input = {}) {
  const topology = assertTopology(input.topology);
  const session = assertTopologyEditAuthoringSession(input.authoringSession);
  const nodeId = session.target?.canonicalIds.find((id) => id.startsWith('node:'));
  const node = exactNode(topology, nodeId);
  if (session.tool === 'MOVE') return { deltaX: 0, deltaY: 0, deltaZ: 0, axisLock: 'FREE' };
  const edgeId = session.target.canonicalIds.find((id) => id.startsWith('edge:'));
  const edge = exactEdge(topology, edgeId);
  const other = exactNode(topology, edge.fromNodeId === node.id ? edge.toNodeId : edge.fromNodeId);
  const lengthMm = distance(node.position, other.position);
  if (session.tool === 'STRETCH') {
    return { newLengthMm: lengthMm, deltaLengthMm: 0, directionLock: 'EDGE_AXIS' };
  }
  if (session.tool === 'ROUTE_ELBOW') {
    const outward = unit(subtract(node.position, other.position));
    const perpendicular = deterministicPerpendicular(outward);
    const offset = add(scale(outward, 500), scale(perpendicular, 500));
    const diameterMm = positive(edge.diameterMm) ?? 100;
    return {
      offsetX: offset.x,
      offsetY: offset.y,
      offsetZ: offset.z,
      nominalSizeMm: diameterMm,
      angleDeg: 90,
      radiusType: 'LR',
      radiusMm: diameterMm * 1.5,
      pipingClass: edge.pipingClass ?? 'UNSPECIFIED',
      componentMassKg: null,
    };
  }
  return {};
}

function planMove(topology, session) {
  const nodeId = exactTargetId(session, 'node:');
  const node = exactNode(topology, nodeId);
  const delta = lockedDelta(session.properties);
  if (!(magnitude(delta) > TOLERANCE)) fail('Move requires a non-zero delta.', RangeError);
  const position = add(node.position, delta);
  const changedScope = deriveTopologyEditChangedScope(topology, {
    basisHash: topology.canonicalTopologyHash,
    nodeIds: [node.id],
  });
  return createTopologyEditOperationPlan({
    operationType: 'MOVE_CONNECTED_RUN',
    basisHash: topology.canonicalTopologyHash,
    targetIds: [node.id],
    parameters: { authoringTool: 'MOVE', nodeId: node.id, deltaMm: delta, targetPosition: position },
    commandIntents: [{ commandType: 'MOVE_NODE', payload: { nodeId: node.id, position } }],
    changedScope,
    unresolvedEvidence: [],
  });
}

function planStretch(topology, session) {
  const { node, edge, other } = openEndpointContext(topology, session);
  const currentLengthMm = distance(node.position, other.position);
  const suppliedLength = positive(session.properties.newLengthMm);
  const deltaLength = finite(session.properties.deltaLengthMm) ?? 0;
  const newLengthMm = suppliedLength ?? currentLengthMm + deltaLength;
  if (!(newLengthMm > TOLERANCE)) fail('Stretch result length must be positive.', RangeError);
  if (Math.abs(newLengthMm - currentLengthMm) <= TOLERANCE) {
    fail('Stretch requires a changed length.', RangeError);
  }
  const direction = unit(subtract(node.position, other.position));
  const position = add(other.position, scale(direction, newLengthMm));
  const changedScope = deriveTopologyEditChangedScope(topology, {
    basisHash: topology.canonicalTopologyHash,
    nodeIds: [node.id],
    edgeIds: [edge.id],
  });
  return createTopologyEditOperationPlan({
    operationType: newLengthMm > currentLengthMm ? 'EXTEND_EDGE' : 'SHORTEN_EDGE',
    basisHash: topology.canonicalTopologyHash,
    targetIds: [node.id, edge.id],
    parameters: {
      authoringTool: 'STRETCH',
      endpointNodeId: node.id,
      edgeId: edge.id,
      currentLengthMm,
      newLengthMm,
      deltaLengthMm: newLengthMm - currentLengthMm,
      targetPosition: position,
    },
    commandIntents: [{ commandType: 'MOVE_NODE', payload: { nodeId: node.id, position } }],
    changedScope,
    unresolvedEvidence: [],
  });
}

function planRouteElbow(topology, session) {
  const { node, edge, other } = openEndpointContext(topology, session);
  const outward = unit(subtract(node.position, other.position));
  const offset = {
    x: requiredFinite(session.properties.offsetX, 'Offset X'),
    y: requiredFinite(session.properties.offsetY, 'Offset Y'),
    z: requiredFinite(session.properties.offsetZ, 'Offset Z'),
  };
  const firstLegLengthMm = dot(offset, outward);
  if (!(firstLegLengthMm > TOLERANCE)) {
    fail('Route offset must continue positively along the open-end direction.', RangeError);
  }
  const perpendicular = subtract(offset, scale(outward, firstLegLengthMm));
  const secondLegLengthMm = magnitude(perpendicular);
  if (!(secondLegLengthMm > TOLERANCE)) {
    fail('Route + elbow requires one non-zero perpendicular leg.', RangeError);
  }
  if (Math.abs(dot(perpendicular, outward)) > TOLERANCE) fail('Route legs must be orthogonal.', RangeError);
  const nonZeroPerpendicularAxes = Object.values(perpendicular)
    .filter((value) => Math.abs(value) > TOLERANCE).length;
  if (nonZeroPerpendicularAxes !== 1) {
    fail('Route + elbow currently requires one axis-aligned perpendicular leg.', RangeError);
  }
  const diameterMm = positive(session.properties.nominalSizeMm) ?? positive(edge.diameterMm);
  if (!diameterMm) fail('Route nominal size is required.', RangeError);
  const angleDeg = positive(session.properties.angleDeg) ?? 90;
  if (Math.abs(angleDeg - 90) > 1e-6) {
    fail('This route tool currently certifies 90 degree elbows.', RangeError);
  }
  const radiusType = String(session.properties.radiusType ?? 'LR').toUpperCase();
  const radiusMm = positive(session.properties.radiusMm)
    ?? (radiusType === 'SR' ? diameterMm : diameterMm * 1.5);
  const tangentDistanceMm = radiusMm / Math.tan((angleDeg * Math.PI / 180) / 2);
  if (!(tangentDistanceMm < firstLegLengthMm - TOLERANCE)
    || !(tangentDistanceMm < secondLegLengthMm - TOLERANCE)) {
    fail('Elbow radius requires more tangent length than the selected route legs provide.', RangeError);
  }
  const cornerPosition = add(node.position, scale(outward, firstLegLengthMm));
  const endPosition = add(cornerPosition, perpendicular);
  const cornerNode = topologyEditOperationReference('step-1', 'created-node');
  const endNode = topologyEditOperationReference('step-2', 'created-node');
  const firstEdge = topologyEditOperationReference('step-3', 'created-edge');
  const secondEdge = topologyEditOperationReference('step-4', 'created-edge');
  const operationSeed = semanticHash({
    basisHash: topology.canonicalTopologyHash,
    endpointNodeId: node.id,
    cornerPosition,
    endPosition,
    diameterMm,
    radiusMm,
  });
  const sourceOperationId = `route-elbow:${operationSeed.split(':').at(-1)}`;
  const changedScope = deriveTopologyEditChangedScope(topology, {
    basisHash: topology.canonicalTopologyHash,
    nodeIds: [node.id],
    edgeIds: [edge.id],
  });
  return createTopologyEditOperationPlan({
    operationType: 'CREATE_ORTHOGONAL_OFFSET',
    basisHash: topology.canonicalTopologyHash,
    targetIds: [node.id, edge.id],
    parameters: {
      authoringTool: 'ROUTE_ELBOW',
      compositeCertification: {
        mode: 'FINAL_STATE',
        intermediatePolicy: 'STRUCTURAL_AND_PROVENANCE_ONLY',
        finalPolicy: 'FULL_TOPOLOGY_CHECKER',
      },
      sourceOperationId,
      endpointNodeId: node.id,
      hostEdgeId: edge.id,
      cornerPosition,
      endPosition,
      firstLegLengthMm,
      secondLegLengthMm,
      diameterMm,
      angleDeg,
      radiusMm,
      tangentDistanceMm,
      radiusType,
      pipingClass: String(session.properties.pipingClass ?? 'UNSPECIFIED'),
      componentMassKg: finite(session.properties.componentMassKg),
      generatedRecordRoles: [
        'node:route-corner', 'node:route-end', 'edge:route-leg-1',
        'edge:route-leg-2', 'bend:route-elbow',
      ],
    },
    commandIntents: [
      {
        commandType: 'CREATE_NODE',
        payload: {
          position: cornerPosition,
          creationRole: 'ROUTE_ELBOW_CORNER',
          coordinateAuthority: 'USER_DECLARED_ORTHOGONAL_OFFSET',
          sourceOperationId,
        },
      },
      {
        commandType: 'CREATE_NODE',
        payload: {
          position: endPosition,
          creationRole: 'ROUTE_OPEN_ENDPOINT',
          coordinateAuthority: 'USER_DECLARED_ORTHOGONAL_OFFSET',
          sourceOperationId,
        },
      },
      {
        commandType: 'ADD_STRAIGHT_ELEMENT',
        payload: { fromNodeId: node.id, toNodeId: cornerNode, diameterMm, entityType: 'PIPE' },
      },
      {
        commandType: 'ADD_STRAIGHT_ELEMENT',
        payload: { fromNodeId: cornerNode, toNodeId: endNode, diameterMm, entityType: 'PIPE' },
      },
      {
        commandType: 'ADD_BEND_DEFINITION',
        payload: {
          nodeId: cornerNode,
          edgeIds: [firstEdge, secondEdge],
          radiusMm,
          angleDeg,
          radiusAuthority: radiusType === 'CUSTOM'
            ? 'USER_DECLARED_CUSTOM_RADIUS'
            : `DERIVED_${radiusType}_RADIUS`,
        },
      },
    ],
    changedScope,
    unresolvedEvidence: [],
  });
}

function target(kind, topology, node, incident, direction) {
  const canonicalIds = [node.id, ...incident.map((edge) => edge.id)].sort();
  return {
    kind,
    canonicalIds,
    stationMm: null,
    position: { ...node.position },
    direction,
    targetHash: semanticHash({
      basisHash: topology.canonicalTopologyHash,
      kind,
      canonicalIds,
      position: node.position,
      direction,
    }),
  };
}
function openEndpointContext(topology, session) {
  const node = exactNode(topology, exactTargetId(session, 'node:'));
  const edge = exactEdge(topology, exactTargetId(session, 'edge:'));
  if (![edge.fromNodeId, edge.toNodeId].includes(node.id)) {
    fail(`edge ${edge.id} is not incident to endpoint ${node.id}.`, RangeError);
  }
  const incident = incidentEdges(topology, node.id);
  if (incident.length !== 1 || incident[0].id !== edge.id) fail(`node ${node.id} is not graph-open.`, RangeError);
  const other = exactNode(topology, edge.fromNodeId === node.id ? edge.toNodeId : edge.fromNodeId);
  return { node, edge, other };
}
function exactTargetId(session, prefix) {
  const ids = session.target.canonicalIds.filter((id) => id.startsWith(prefix));
  if (ids.length !== 1) fail(`target requires exactly one ${prefix} identity.`, RangeError);
  return ids[0];
}
function lockedDelta(properties) {
  const raw = {
    x: requiredFinite(properties.deltaX, 'Delta X'),
    y: requiredFinite(properties.deltaY, 'Delta Y'),
    z: requiredFinite(properties.deltaZ, 'Delta Z'),
  };
  const lock = String(properties.axisLock ?? 'FREE').toUpperCase();
  if (lock === 'FREE') return raw;
  if (!['X', 'Y', 'Z'].includes(lock)) fail(`unsupported axis lock ${lock}.`, RangeError);
  return { x: lock === 'X' ? raw.x : 0, y: lock === 'Y' ? raw.y : 0, z: lock === 'Z' ? raw.z : 0 };
}
function deterministicPerpendicular(direction) {
  const axes = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  ].sort((left, right) => Math.abs(dot(left, direction)) - Math.abs(dot(right, direction)));
  const candidate = subtract(axes[0], scale(direction, dot(axes[0], direction)));
  return unit(candidate) ?? axes[1];
}
function assertTopology(value) {
  if (!value?.canonicalTopologyHash || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    fail('canonical topology authority is required.');
  }
  return value;
}
function exactNode(topology, id) {
  const rows = topology.nodes.filter((row) => row.id === id);
  if (rows.length !== 1) fail(`node ${id} resolved ${rows.length} records.`, RangeError);
  return rows[0];
}
function exactEdge(topology, id) {
  const rows = topology.edges.filter((row) => row.id === id);
  if (rows.length !== 1) fail(`edge ${id} resolved ${rows.length} records.`, RangeError);
  return rows[0];
}
function incidentEdges(topology, nodeId) {
  return topology.edges.filter((edge) => edge.fromNodeId === nodeId || edge.toNodeId === nodeId);
}
function add(left, right) { return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }; }
function subtract(left, right) { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function scale(value, scalar) { return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar }; }
function dot(left, right) { return left.x * right.x + left.y * right.y + left.z * right.z; }
function magnitude(value) { return Math.hypot(value.x, value.y, value.z); }
function unit(value) {
  const length = magnitude(value);
  return length > TOLERANCE ? scale(value, 1 / length) : null;
}
function distance(left, right) { return magnitude(subtract(left, right)); }
function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function positive(value) {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
}
function requiredFinite(value, label) {
  const number = finite(value);
  if (number === null) fail(`${label} must be finite.`, RangeError);
  return number;
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditAuthoringOperationPlanner: ${message}`);
}
