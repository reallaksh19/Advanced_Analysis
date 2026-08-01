/** Pure deterministic reducer for the seven Wave 1 native commands. */
import { deepFreeze } from '../../core/shared-piping-model/index.js';
import { deterministicTopologyEditId } from './topology-edit-command-contract.js';
import { assertResolvedTopologyEditCommand } from './topology-edit-command-resolver.js';
import {
  assertCanonicalTopologyHash,
  canonicalTopologyStateHash,
  finalizeCanonicalTopology,
} from './topology-edit-canonical-state.js';

function generatedId(prefix, commandId, role) {
  const token = deterministicTopologyEditId(commandId, role).split(':').at(-1);
  return `${prefix}:${token}`;
}

function cloneRows(rows) {
  return JSON.parse(JSON.stringify(rows ?? []));
}

function exactIndex(rows, id, label) {
  const indexes = rows.map((row, index) => row?.id === id ? index : -1).filter((index) => index >= 0);
  if (indexes.length !== 1) throw new RangeError(`TopologyEditPureReducer: ${label} ${id} resolved ${indexes.length} records.`);
  return indexes[0];
}

function assertUnusedId(topology, id) {
  const collections = ['nodes', 'edges', 'junctions', 'supports', 'boundaries', 'rigids'];
  if (collections.some((key) => (topology[key] ?? []).some((record) => record?.id === id))) {
    throw new Error(`TopologyEditPureReducer: generated identity collision ${id}.`);
  }
}

function replaceNodeReferences(record, sourceNodeId, targetNodeId) {
  const result = { ...record };
  for (const key of ['nodeId', 'fromNodeId', 'toNodeId']) {
    if (result[key] === sourceNodeId) result[key] = targetNodeId;
  }
  if (Array.isArray(result.nodeIds)) {
    result.nodeIds = [...new Set(result.nodeIds.map((nodeId) => nodeId === sourceNodeId ? targetNodeId : nodeId))];
  }
  return result;
}

function moveNode(topology, command) {
  const nodes = cloneRows(topology.nodes);
  const index = exactIndex(nodes, command.payload.nodeId, 'node');
  nodes[index] = { ...nodes[index], position: { ...command.payload.position } };
  return { ...topology, nodes };
}

function mergeNodes(topology, command) {
  const { sourceNodeId, targetNodeId } = command.payload;
  const nodes = cloneRows(topology.nodes);
  const sourceIndex = exactIndex(nodes, sourceNodeId, 'source node');
  const targetIndex = exactIndex(nodes, targetNodeId, 'target node');
  const source = nodes[sourceIndex];
  const target = nodes[targetIndex];
  const mergedTarget = {
    ...target,
    portKeys: [...new Set([...(target.portKeys ?? []), ...(source.portKeys ?? [])])].sort(),
  };
  const nextNodes = nodes.filter((node) => node.id !== sourceNodeId)
    .map((node) => node.id === targetNodeId ? mergedTarget : node);
  const edges = cloneRows(topology.edges).map((edge) => replaceNodeReferences(edge, sourceNodeId, targetNodeId));
  const junctions = cloneRows(topology.junctions).map((row) => replaceNodeReferences(row, sourceNodeId, targetNodeId));
  const supports = cloneRows(topology.supports).map((row) => replaceNodeReferences(row, sourceNodeId, targetNodeId));
  const boundaries = cloneRows(topology.boundaries).map((row) => replaceNodeReferences(row, sourceNodeId, targetNodeId));
  const rigids = cloneRows(topology.rigids).map((row) => replaceNodeReferences(row, sourceNodeId, targetNodeId));
  return { ...topology, nodes: nextNodes, edges, junctions, supports, boundaries, rigids };
}

function addEdge(topology, command) {
  const edgeId = generatedId('edge', command.commandId, command.commandType === 'BRIDGE_GAP' ? 'bridge-edge' : 'straight-edge');
  assertUnusedId(topology, edgeId);
  const edge = {
    id: edgeId,
    componentKey: null,
    fromNodeId: command.payload.fromNodeId,
    toNodeId: command.payload.toNodeId,
    diameterMm: command.payload.diameterMm,
    entityType: command.payload.entityType,
    sourcePath: null,
    createdByCommandId: command.commandId,
  };
  return { ...topology, edges: [...cloneRows(topology.edges), edge] };
}

function splitEdge(topology, command) {
  const edges = cloneRows(topology.edges);
  const edgeIndex = exactIndex(edges, command.payload.edgeId, 'edge');
  const edge = edges[edgeIndex];
  const nodes = cloneRows(topology.nodes);
  const from = nodes[exactIndex(nodes, edge.fromNodeId, 'FROM node')];
  const to = nodes[exactIndex(nodes, edge.toNodeId, 'TO node')];
  const fraction = command.payload.fraction;
  const splitPosition = {
    x: from.position.x + (to.position.x - from.position.x) * fraction,
    y: from.position.y + (to.position.y - from.position.y) * fraction,
    z: from.position.z + (to.position.z - from.position.z) * fraction,
  };
  if (!(Math.hypot(
    to.position.x - from.position.x,
    to.position.y - from.position.y,
    to.position.z - from.position.z,
  ) > 0)) throw new RangeError(`TopologyEditPureReducer: SPLIT_EDGE ${edge.id} has zero length.`);

  const nodeId = generatedId('node', command.commandId, 'split-node');
  const leftEdgeId = generatedId('edge', command.commandId, 'split-left-edge');
  const rightEdgeId = generatedId('edge', command.commandId, 'split-right-edge');
  for (const id of [nodeId, leftEdgeId, rightEdgeId]) assertUnusedId(topology, id);

  const splitNode = {
    id: nodeId,
    position: splitPosition,
    portKeys: [],
    createdByCommandId: command.commandId,
    derivedFromEdgeId: edge.id,
  };
  const common = {
    diameterMm: edge.diameterMm ?? null,
    entityType: edge.entityType ?? 'PIPE',
    sourcePath: edge.sourcePath ?? null,
    createdByCommandId: command.commandId,
    derivedFromEdgeId: edge.id,
    sourceComponentKey: edge.componentKey ?? edge.sourceComponentKey ?? null,
  };
  const left = {
    ...edge,
    ...common,
    id: leftEdgeId,
    fromNodeId: edge.fromNodeId,
    toNodeId: nodeId,
    componentKey: edge.componentKey ?? null,
  };
  const right = {
    ...edge,
    ...common,
    id: rightEdgeId,
    fromNodeId: nodeId,
    toNodeId: edge.toNodeId,
    componentKey: null,
  };
  return {
    ...topology,
    nodes: [...nodes, splitNode],
    edges: [...edges.filter((row) => row.id !== edge.id), left, right],
  };
}

function disconnectEndpoint(topology, command) {
  const edges = cloneRows(topology.edges);
  const edgeIndex = exactIndex(edges, command.payload.edgeId, 'edge');
  const edge = edges[edgeIndex];
  const endpointKey = command.payload.endpoint === 'FROM' ? 'fromNodeId' : 'toNodeId';
  const originalNodeId = edge[endpointKey];
  const nodes = cloneRows(topology.nodes);
  const nodeIndex = exactIndex(nodes, originalNodeId, 'endpoint node');
  const originalNode = nodes[nodeIndex];
  const newNodeId = generatedId('node', command.commandId, `disconnect-${command.payload.endpoint.toLowerCase()}-node`);
  assertUnusedId(topology, newNodeId);
  const movedPortKeys = [...(command.targets.endpointPortKeys ?? [])];
  const moved = new Set(movedPortKeys);
  nodes[nodeIndex] = { ...originalNode, portKeys: (originalNode.portKeys ?? []).filter((portKey) => !moved.has(portKey)) };
  nodes.push({
    id: newNodeId,
    position: { ...originalNode.position },
    portKeys: movedPortKeys,
    createdByCommandId: command.commandId,
    derivedFromNodeId: originalNodeId,
  });
  edges[edgeIndex] = { ...edge, [endpointKey]: newNodeId };
  return { ...topology, nodes, edges };
}

function deleteEdge(topology, command) {
  const edges = cloneRows(topology.edges);
  exactIndex(edges, command.payload.edgeId, 'edge');
  return { ...topology, edges: edges.filter((edge) => edge.id !== command.payload.edgeId) };
}

export function applyResolvedTopologyEditCommand(canonicalTopology, resolvedCommandInput) {
  assertCanonicalTopologyHash(canonicalTopology);
  const resolvedCommand = assertResolvedTopologyEditCommand(resolvedCommandInput);
  const currentHash = canonicalTopologyStateHash(canonicalTopology);
  if (resolvedCommand.basis.priorDraftHash !== currentHash) {
    throw new Error('TopologyEditPureReducer: resolved command is stale for the current canonical topology.');
  }

  const topology = JSON.parse(JSON.stringify(canonicalTopology));
  let candidate;
  switch (resolvedCommand.commandType) {
    case 'MOVE_NODE': candidate = moveNode(topology, resolvedCommand); break;
    case 'MERGE_NODES': candidate = mergeNodes(topology, resolvedCommand); break;
    case 'BRIDGE_GAP':
    case 'ADD_STRAIGHT_ELEMENT': candidate = addEdge(topology, resolvedCommand); break;
    case 'SPLIT_EDGE': candidate = splitEdge(topology, resolvedCommand); break;
    case 'DISCONNECT_ENDPOINT': candidate = disconnectEndpoint(topology, resolvedCommand); break;
    case 'DELETE_EDGE': candidate = deleteEdge(topology, resolvedCommand); break;
    default: throw new RangeError(`TopologyEditPureReducer: unsupported command ${resolvedCommand.commandType}.`);
  }
  return finalizeCanonicalTopology(candidate);
}

export function replayResolvedTopologyEditCommands(baseCanonicalTopology, resolvedCommands = []) {
  return resolvedCommands.reduce(
    (topology, command) => applyResolvedTopologyEditCommand(topology, command),
    deepFreeze(JSON.parse(JSON.stringify(baseCanonicalTopology))),
  );
}
