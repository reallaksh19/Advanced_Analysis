import {
  createTopologyEditOperationPlan,
  createUnrepresentableTopologyEditOperationResult,
} from './topology-edit-operation-plan.js';
import { deriveTopologyEditChangedScope } from './topology-edit-change-scope.js';
import {
  addPoints,
  addScaled,
  assertExactBoundarySet,
  assertGraphOpenEndpoint,
  assertMovedGeometry,
  assertNoEdgePair,
  connectedSelectedNodes,
  distance,
  dot,
  endpointContext,
  exactExternalBoundaryNodes,
  exactNode,
  incidentEdges,
  magnitude,
  nonZeroDeltaMm,
  normalizeCanonicalIds,
  positiveMm,
  requiredText,
  routeContext,
  subtract,
} from './topology-edit-route-operation-helpers.js';
import { planApplyDeclaredSlope } from './topology-edit-slope-operation.js';
import {
  planTopologyEditInlineComponentOperation,
} from './topology-edit-inline-component-operation.js';

export { planApplyDeclaredSlope, planTopologyEditInlineComponentOperation };

const ORTHOGONAL_TOLERANCE = 1e-9;

export function planExtendEdge(input = {}) {
  const context = routeContext(input.topology, input.basisHash);
  const endpoint = endpointContext(context, input.edgeId, input.endpoint);
  assertGraphOpenEndpoint(context, endpoint.node.id, endpoint.edge.id);
  const distanceMm = positiveMm(input.distanceMm, 'distanceMm');
  const position = addScaled(endpoint.node.position, endpoint.outwardDirection, distanceMm);
  return nodeMovePlan(context, 'EXTEND_EDGE', endpoint, position, { distanceMm });
}

export function planShortenEdge(input = {}) {
  const context = routeContext(input.topology, input.basisHash);
  const endpoint = endpointContext(context, input.edgeId, input.endpoint);
  assertGraphOpenEndpoint(context, endpoint.node.id, endpoint.edge.id);
  const distanceMm = positiveMm(input.distanceMm, 'distanceMm');
  if (!(distanceMm < endpoint.lengthMm)) {
    throw new RangeError('TopologyEditRouteOperations: distanceMm must be less than the edge length.');
  }
  const position = addScaled(endpoint.node.position, endpoint.outwardDirection, -distanceMm);
  return nodeMovePlan(context, 'SHORTEN_EDGE', endpoint, position, { distanceMm });
}

export function planSplitEdgeByDistance(input = {}) {
  const context = routeContext(input.topology, input.basisHash);
  const endpoint = endpointContext(context, input.edgeId, input.endpoint);
  const distanceMm = positiveMm(input.distanceMm, 'distanceMm');
  if (!(distanceMm < endpoint.lengthMm)) {
    throw new RangeError('TopologyEditRouteOperations: distanceMm must be less than the edge length.');
  }
  assertSplitDependantsAbsent(context, endpoint.edge.id);
  const fractionFromStart = distanceMm / endpoint.lengthMm;
  const fraction = endpoint.endpoint === 'FROM' ? fractionFromStart : 1 - fractionFromStart;
  const changedScope = deriveTopologyEditChangedScope(context.topology, {
    basisHash: context.basisHash,
    edgeIds: [endpoint.edge.id],
  });
  return createTopologyEditOperationPlan({
    operationType: 'SPLIT_EDGE_FROM_DISTANCE',
    basisHash: context.basisHash,
    targetIds: [endpoint.edge.id, endpoint.node.id, endpoint.otherNode.id],
    parameters: {
      endpoint: endpoint.endpoint,
      distanceMm,
      fraction,
      generatedRecordRoles: ['node:split-node', 'edge:split-left-edge', 'edge:split-right-edge'],
    },
    commandIntents: [{
      commandType: 'SPLIT_EDGE',
      payload: { edgeId: endpoint.edge.id, fraction },
    }],
    changedScope,
    unresolvedEvidence: [],
  });
}

export function planReconnectOpenEndpoints(input = {}) {
  const context = routeContext(input.topology, input.basisHash);
  const fromNode = exactNode(context, input.fromNodeId);
  const toNode = exactNode(context, input.toNodeId);
  if (fromNode.id === toNode.id) {
    throw new RangeError('TopologyEditRouteOperations: reconnect endpoints must be different.');
  }
  assertOpenNode(context, fromNode.id);
  assertOpenNode(context, toNode.id);
  assertNoEdgePair(context, fromNode.id, toNode.id);
  if (!(distance(fromNode.position, toNode.position) > 1e-9)) {
    throw new RangeError('TopologyEditRouteOperations: reconnect endpoints must have a positive gap.');
  }
  const diameterMm = positiveMm(input.diameterMm, 'diameterMm');
  const entityType = requiredText(input.entityType ?? 'PIPE', 'entityType').toUpperCase();
  const changedScope = deriveTopologyEditChangedScope(context.topology, {
    basisHash: context.basisHash,
    nodeIds: [fromNode.id, toNode.id],
  });
  return createTopologyEditOperationPlan({
    operationType: 'RECONNECT_ENDPOINTS',
    basisHash: context.basisHash,
    targetIds: [fromNode.id, toNode.id],
    parameters: { diameterMm, entityType },
    commandIntents: [{
      commandType: 'BRIDGE_GAP',
      payload: { fromNodeId: fromNode.id, toNodeId: toNode.id, diameterMm, entityType },
    }],
    changedScope,
    unresolvedEvidence: [catalogueUnresolved([fromNode.id, toNode.id])],
  });
}

export function planMoveConnectedRun(input = {}) {
  const context = routeContext(input.topology, input.basisHash);
  const nodeIds = connectedSelectedNodes(context, input.nodeIds);
  const boundaryNodeIds = assertExactBoundarySet(
    exactExternalBoundaryNodes(context, nodeIds),
    input.boundaryNodeIds ?? [],
  );
  const deltaMm = nonZeroDeltaMm(input.deltaMm);
  const movedPositions = new Map(nodeIds.map((nodeId) => [
    nodeId,
    addPoints(exactNode(context, nodeId).position, deltaMm),
  ]));
  assertMovedGeometry(context, movedPositions);
  const changedScope = deriveTopologyEditChangedScope(context.topology, {
    basisHash: context.basisHash,
    nodeIds,
  });
  return createTopologyEditOperationPlan({
    operationType: 'MOVE_CONNECTED_RUN',
    basisHash: context.basisHash,
    targetIds: [...nodeIds, ...boundaryNodeIds],
    parameters: { nodeIds, boundaryNodeIds, deltaMm },
    commandIntents: nodeIds.map((nodeId) => ({
      commandType: 'MOVE_NODE',
      payload: { nodeId, position: movedPositions.get(nodeId) },
    })),
    changedScope,
    unresolvedEvidence: [],
  });
}

export function planCreateOrthogonalOffset(input = {}) {
  const context = routeContext(input.topology, input.basisHash);
  if (!input.cornerNodeId) {
    return createUnrepresentableTopologyEditOperationResult({
      operationType: 'CREATE_ORTHOGONAL_OFFSET',
      basisHash: context.basisHash,
      targetIds: normalizeCanonicalIds(
        [input.fromNodeId, input.toNodeId].filter(Boolean),
        'targetIds',
        'node:',
      ),
      reasonCode: 'ARBITRARY_CORNER_NODE_CREATION_UNAVAILABLE',
      reason: 'Current commands cannot create an independent arbitrary-position corner node.',
    });
  }
  const from = exactNode(context, input.fromNodeId);
  const corner = exactNode(context, input.cornerNodeId);
  const to = exactNode(context, input.toNodeId);
  if (new Set([from.id, corner.id, to.id]).size !== 3) {
    throw new RangeError('TopologyEditRouteOperations: offset nodes must be distinct.');
  }
  assertOpenNode(context, from.id);
  assertIsolatedNode(context, corner.id);
  assertOpenNode(context, to.id);
  assertNoEdgePair(context, from.id, corner.id);
  assertNoEdgePair(context, corner.id, to.id);
  const firstLeg = subtract(corner.position, from.position);
  const secondLeg = subtract(to.position, corner.position);
  if (!(magnitude(firstLeg) > 1e-9 && magnitude(secondLeg) > 1e-9)) {
    throw new RangeError('TopologyEditRouteOperations: offset legs must have positive length.');
  }
  const orthogonality = Math.abs(dot(firstLeg, secondLeg) / (magnitude(firstLeg) * magnitude(secondLeg)));
  if (orthogonality > ORTHOGONAL_TOLERANCE) {
    throw new RangeError('TopologyEditRouteOperations: offset legs must be orthogonal.');
  }
  const diameterMm = positiveMm(input.diameterMm, 'diameterMm');
  const entityType = requiredText(input.entityType ?? 'PIPE', 'entityType').toUpperCase();
  const changedScope = deriveTopologyEditChangedScope(context.topology, {
    basisHash: context.basisHash,
    nodeIds: [from.id, corner.id, to.id],
  });
  return createTopologyEditOperationPlan({
    operationType: 'CREATE_ORTHOGONAL_OFFSET',
    basisHash: context.basisHash,
    targetIds: [from.id, corner.id, to.id],
    parameters: {
      diameterMm,
      entityType,
      firstLegLengthMm: magnitude(firstLeg),
      secondLegLengthMm: magnitude(secondLeg),
      generatedRecordRoles: ['edge:offset-leg-1', 'edge:offset-leg-2'],
    },
    commandIntents: [
      { commandType: 'ADD_STRAIGHT_ELEMENT', payload: { fromNodeId: from.id, toNodeId: corner.id, diameterMm, entityType } },
      { commandType: 'ADD_STRAIGHT_ELEMENT', payload: { fromNodeId: corner.id, toNodeId: to.id, diameterMm, entityType } },
    ],
    changedScope,
    unresolvedEvidence: [catalogueUnresolved([from.id, corner.id, to.id])],
  });
}

export function planProfessionalOperation(input = {}) {
  const operationType = requiredText(input.operationType, 'operationType').toUpperCase();
  const planner = PLANNERS[operationType];
  if (!planner) throw new RangeError(`TopologyEditRouteOperations: unsupported operation type ${operationType}.`);
  return planner(input);
}

function nodeMovePlan(context, operationType, endpoint, position, parameters) {
  const changedScope = deriveTopologyEditChangedScope(context.topology, {
    basisHash: context.basisHash,
    nodeIds: [endpoint.node.id],
    edgeIds: [endpoint.edge.id],
  });
  return createTopologyEditOperationPlan({
    operationType,
    basisHash: context.basisHash,
    targetIds: [endpoint.edge.id, endpoint.node.id],
    parameters: { endpoint: endpoint.endpoint, ...parameters },
    commandIntents: [{
      commandType: 'MOVE_NODE',
      payload: { nodeId: endpoint.node.id, position },
    }],
    changedScope,
    unresolvedEvidence: [],
  });
}

function assertOpenNode(context, nodeId) {
  const incident = incidentEdges(context, nodeId);
  if (incident.length !== 1) {
    throw new RangeError(`TopologyEditRouteOperations: node ${nodeId} must have exactly one incident edge.`);
  }
  assertGraphOpenEndpoint(context, nodeId, incident[0].id);
}
function assertIsolatedNode(context, nodeId) {
  const incident = incidentEdges(context, nodeId);
  if (incident.length !== 0) {
    throw new RangeError(`TopologyEditRouteOperations: corner node ${nodeId} must be isolated.`);
  }
}
function assertSplitDependantsAbsent(context, edgeId) {
  for (const collection of ['junctions', 'supports', 'boundaries', 'rigids', 'bends']) {
    const dependent = (context.topology[collection] ?? []).find((record) => (
      record?.edgeId === edgeId || record?.edgeIds?.includes?.(edgeId)
    ));
    if (dependent) {
      throw new RangeError(`TopologyEditRouteOperations: split edge ${edgeId} has dependent ${collection} record ${dependent.id}.`);
    }
  }
}
function catalogueUnresolved(targetIds) {
  return {
    code: 'CATALOGUE_COMPATIBILITY_NOT_EVALUATED',
    status: 'UNRESOLVED',
    targetIds,
    field: 'specificationCompatibility',
    details: { authority: null },
  };
}

const PLANNERS = Object.freeze({
  EXTEND_EDGE: planExtendEdge,
  SHORTEN_EDGE: planShortenEdge,
  SPLIT_EDGE_FROM_DISTANCE: planSplitEdgeByDistance,
  RECONNECT_ENDPOINTS: planReconnectOpenEndpoints,
  MOVE_CONNECTED_RUN: planMoveConnectedRun,
  CREATE_ORTHOGONAL_OFFSET: planCreateOrthogonalOffset,
  APPLY_DECLARED_SLOPE: planApplyDeclaredSlope,
  INSERT_INLINE_COMPONENT: planTopologyEditInlineComponentOperation,
});
