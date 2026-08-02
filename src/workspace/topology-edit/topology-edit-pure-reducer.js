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
  const indexes = rows
    .map((row, index) => row?.id === id ? index : -1)
    .filter((index) => index >= 0);
  if (indexes.length !== 1) {
    throw new RangeError(`TopologyEditPureReducer: ${label} ${id} resolved ${indexes.length} records.`);
  }
  return indexes[0];
}

function assertUnusedId(topology, id) {
  const collections = ['nodes', 'edges', 'junctions', 'supports', 'boundaries', 'rigids'];
  const collision = collections.some((key) => (
    (topology[key] ?? []).some((record) => record?.id === id)
  ));
  if (collision) {
    throw new Error(`TopologyEditPureReducer: generated identity collision ${id}.`);
  }
}

function replaceNodeReferences(record, sourceNodeId, targetNodeId) {
  const result = { ...record };
  for (const key of ['nodeId', 'fromNodeId', 'toNodeId']) {
    if (result[key] === sourceNodeId) result[key] = targetNodeId;
  }
  if (Array.isArray(result.nodeIds)) {
    result.nodeIds = [...new Set(result.nodeIds.map((nodeId) => (
      nodeId === sourceNodeId ? targetNodeId : nodeId
    )))];
  }
  return result;
}

function moveNode(topology, command) {
  const nodes = cloneRows(topology.nodes);
  const index = exactIndex(nodes, command.payload.nodeId, 'node');
  nodes[index] = { ...nodes[index], position: { ...command.payload.position } };
  return { ...topology, nodes };
}

function remapCollection(rows, sourceNodeId, targetNodeId) {
  return cloneRows(rows).map((row) => (
    replaceNodeReferences(row, sourceNodeId, targetNodeId)
  ));
}

function mergeNodes(topology, command) {
  const { sourceNodeId, targetNodeId } = command.payload;
  const nodes = cloneRows(topology.nodes);
  const source = nodes[exactIndex(nodes, sourceNodeId, 'source node')];
  const target = nodes[exactIndex(nodes, targetNodeId, 'target node')];
  const mergedTarget = {
    ...target,
    portKeys: [...new Set([...(target.portKeys ?? []), ...(source.portKeys ?? [])])].sort(),
  };
  const nextNodes = nodes
    .filter((node) => node.id !== sourceNodeId)
    .map((node) => node.id === targetNodeId ? mergedTarget : node);
  return {
    ...topology,
    nodes: nextNodes,
    edges: remapCollection(topology.edges, sourceNodeId, targetNodeId),
    junctions: remapCollection(topology.junctions, sourceNodeId, targetNodeId),
    supports: remapCollection(topology.supports, sourceNodeId, targetNodeId),
    boundaries: remapCollection(topology.boundaries, sourceNodeId, targetNodeId),
    rigids: remapCollection(topology.rigids, sourceNodeId, targetNodeId),
  };
}

function addEdge(topology, command) {
  const role = command.commandType === 'BRIDGE_GAP' ? 'bridge-edge' : 'straight-edge';
  const edgeId = generatedId('edge', command.commandId, role);
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

function splitContext(topology, command) {
  const edges = cloneRows(topology.edges);
  const edge = edges[exactIndex(edges, command.payload.edgeId, 'edge')];
  const nodes = cloneRows(topology.nodes);
  const from = nodes[exactIndex(nodes, edge.fromNodeId, 'FROM node')];
  const to = nodes[exactIndex(nodes, edge.toNodeId, 'TO node')];
  return { edges, edge, nodes, from, to };
}

function splitPosition(from, to, fraction, edgeId) {
  const delta = {
    x: to.position.x - from.position.x,
    y: to.position.y - from.position.y,
    z: to.position.z - from.position.z,
  };
  if (!(Math.hypot(delta.x, delta.y, delta.z) > 0)) {
    throw new RangeError(`TopologyEditPureReducer: SPLIT_EDGE ${edgeId} has zero length.`);
  }
  return {
    x: from.position.x + delta.x * fraction,
    y: from.position.y + delta.y * fraction,
    z: from.position.z + delta.z * fraction,
  };
}

function splitIds(topology, commandId) {
  const ids = {
    nodeId: generatedId('node', commandId, 'split-node'),
    leftEdgeId: generatedId('edge', commandId, 'split-left-edge'),
    rightEdgeId: generatedId('edge', commandId, 'split-right-edge'),
  };
  Object.values(ids).forEach((id) => assertUnusedId(topology, id));
  return ids;
}

function splitRecords(edge, ids, position, commandId) {
  const common = {
    diameterMm: edge.diameterMm ?? null,
    entityType: edge.entityType ?? 'PIPE',
    sourcePath: edge.sourcePath ?? null,
    createdByCommandId: commandId,
    derivedFromEdgeId: edge.id,
    sourceComponentKey: edge.componentKey ?? edge.sourceComponentKey ?? null,
  };
  const node = {
    id: ids.nodeId,
    position,
    portKeys: [],
    createdByCommandId: commandId,
    derivedFromEdgeId: edge.id,
  };
  const left = {
    ...edge,
    ...common,
    id: ids.leftEdgeId,
    fromNodeId: edge.fromNodeId,
    toNodeId: ids.nodeId,
    componentKey: edge.componentKey ?? null,
  };
  const right = {
    ...edge,
    ...common,
    id: ids.rightEdgeId,
    fromNodeId: ids.nodeId,
    toNodeId: edge.toNodeId,
    componentKey: null,
  };
  return { node, left, right };
}

function splitEdge(topology, command) {
  const context = splitContext(topology, command);
  const position = splitPosition(
    context.from,
    context.to,
    command.payload.fraction,
    context.edge.id,
  );
  const ids = splitIds(topology, command.commandId);
  const records = splitRecords(context.edge, ids, position, command.commandId);
  return {
    ...topology,
    nodes: [...context.nodes, records.node],
    edges: [
      ...context.edges.filter((row) => row.id !== context.edge.id),
      records.left,
      records.right,
    ],
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
  const role = `disconnect-${command.payload.endpoint.toLowerCase()}-node`;
  const newNodeId = generatedId('node', command.commandId, role);
  assertUnusedId(topology, newNodeId);
  const movedPortKeys = [...(command.targets.endpointPortKeys ?? [])];
  const moved = new Set(movedPortKeys);
  nodes[nodeIndex] = {
    ...originalNode,
    portKeys: (originalNode.portKeys ?? []).filter((portKey) => !moved.has(portKey)),
  };
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
  return {
    ...topology,
    edges: edges.filter((edge) => edge.id !== command.payload.edgeId),
  };
}

const REDUCERS = Object.freeze({
  MOVE_NODE: moveNode,
  MERGE_NODES: mergeNodes,
  BRIDGE_GAP: addEdge,
  ADD_STRAIGHT_ELEMENT: addEdge,
  SPLIT_EDGE: splitEdge,
  DISCONNECT_ENDPOINT: disconnectEndpoint,
  DELETE_EDGE: deleteEdge,
});

export function applyResolvedTopologyEditCommand(canonicalTopology, resolvedCommandInput) {
  assertCanonicalTopologyHash(canonicalTopology);
  const command = assertResolvedTopologyEditCommand(resolvedCommandInput);
  const currentHash = canonicalTopologyStateHash(canonicalTopology);
  if (command.basis.priorDraftHash !== currentHash) {
    throw new Error('TopologyEditPureReducer: resolved command is stale for the current canonical topology.');
  }
  const reducer = REDUCERS[command.commandType];
  if (!reducer) {
    throw new RangeError(`TopologyEditPureReducer: unsupported command ${command.commandType}.`);
  }
  const topology = JSON.parse(JSON.stringify(canonicalTopology));
  return finalizeCanonicalTopology(reducer(topology, command));
}

export function replayResolvedTopologyEditCommands(baseCanonicalTopology, commands = []) {
  const base = deepFreeze(JSON.parse(JSON.stringify(baseCanonicalTopology)));
  return commands.reduce(
    (topology, command) => applyResolvedTopologyEditCommand(topology, command),
    base,
  );
}
