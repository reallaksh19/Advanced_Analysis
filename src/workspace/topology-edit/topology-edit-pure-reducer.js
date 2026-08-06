/** Pure deterministic reducer for governed topology-edit native commands. */
import { deepFreeze } from '../../core/shared-piping-model/index.js';
import { deterministicTopologyEditId } from './topology-edit-command-contract.js';
import { assertResolvedTopologyEditCommand } from './topology-edit-command-resolver.js';
import {
  applyTopologyEditInlineComponent,
} from './topology-edit-inline-component-command.js';
import {
  applyTopologyEditBranchComponent,
} from './topology-edit-branch-component-command.js';
import {
  assertCanonicalTopologyHash,
  canonicalTopologyStateHash,
  finalizeCanonicalTopology,
} from './topology-edit-canonical-state.js';

function generatedId(prefix, commandId, role) {
  return `${prefix}:${deterministicTopologyEditId(commandId, role).split(':').at(-1)}`;
}
function cloneRows(rows) { return JSON.parse(JSON.stringify(rows ?? [])); }
function exactIndex(rows, id, label) {
  const indexes = rows.map((row, index) => row?.id === id ? index : -1)
    .filter((index) => index >= 0);
  if (indexes.length !== 1) {
    throw new RangeError(`TopologyEditPureReducer: ${label} ${id} resolved ${indexes.length} records.`);
  }
  return indexes[0];
}
function assertUnusedId(topology, id) {
  const keys = ['nodes', 'edges', 'junctions', 'supports', 'boundaries', 'rigids', 'bends'];
  if (keys.some((key) => (topology[key] ?? []).some((row) => row?.id === id))) {
    throw new Error(`TopologyEditPureReducer: generated identity collision ${id}.`);
  }
}
function replaceNodeReferences(record, sourceNodeId, targetNodeId) {
  const result = { ...record };
  for (const key of ['nodeId', 'fromNodeId', 'toNodeId']) {
    if (result[key] === sourceNodeId) result[key] = targetNodeId;
  }
  if (Array.isArray(result.nodeIds)) {
    result.nodeIds = [...new Set(result.nodeIds.map((id) => (
      id === sourceNodeId ? targetNodeId : id
    )))];
  }
  return result;
}
function remapCollection(rows, sourceNodeId, targetNodeId) {
  return cloneRows(rows).map((row) => replaceNodeReferences(row, sourceNodeId, targetNodeId));
}
function createNode(topology, command) {
  const id = generatedId('node', command.commandId, 'created-node');
  assertUnusedId(topology, id);
  const node = {
    id,
    position: { ...command.payload.position },
    portKeys: [],
    createdByCommandId: command.commandId,
    topologyOperation: 'CREATE_NODE',
    creationRole: command.payload.creationRole,
    coordinateAuthority: command.payload.coordinateAuthority,
    sourceOperationId: command.payload.sourceOperationId,
  };
  return { ...topology, nodes: [...cloneRows(topology.nodes), node] };
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
  const source = nodes[exactIndex(nodes, sourceNodeId, 'source node')];
  const target = nodes[exactIndex(nodes, targetNodeId, 'target node')];
  const mergedTarget = {
    ...target,
    portKeys: [...new Set([...(target.portKeys ?? []), ...(source.portKeys ?? [])])].sort(),
  };
  const result = {
    ...topology,
    nodes: nodes.filter((node) => node.id !== sourceNodeId)
      .map((node) => node.id === targetNodeId ? mergedTarget : node),
    edges: remapCollection(topology.edges, sourceNodeId, targetNodeId),
    junctions: remapCollection(topology.junctions, sourceNodeId, targetNodeId),
    supports: remapCollection(topology.supports, sourceNodeId, targetNodeId),
    boundaries: remapCollection(topology.boundaries, sourceNodeId, targetNodeId),
    rigids: remapCollection(topology.rigids, sourceNodeId, targetNodeId),
  };
  if (Object.hasOwn(topology, 'bends')) {
    result.bends = remapCollection(topology.bends, sourceNodeId, targetNodeId);
  }
  return result;
}
function addEdge(topology, command) {
  const role = command.commandType === 'BRIDGE_GAP' ? 'bridge-edge' : 'straight-edge';
  const edgeId = generatedId('edge', command.commandId, role);
  assertUnusedId(topology, edgeId);
  const edge = {
    id: edgeId, componentKey: null,
    fromNodeId: command.payload.fromNodeId, toNodeId: command.payload.toNodeId,
    diameterMm: command.payload.diameterMm, entityType: command.payload.entityType,
    sourcePath: null, createdByCommandId: command.commandId,
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
    entityType: edge.entityType ?? 'PIPE', sourcePath: edge.sourcePath ?? null,
    createdByCommandId: commandId, derivedFromEdgeId: edge.id,
    sourceComponentKey: edge.componentKey ?? edge.sourceComponentKey ?? null,
  };
  return {
    node: { id: ids.nodeId, position, portKeys: [], createdByCommandId: commandId, derivedFromEdgeId: edge.id },
    left: { ...edge, ...common, id: ids.leftEdgeId, fromNodeId: edge.fromNodeId, toNodeId: ids.nodeId, componentKey: edge.componentKey ?? null },
    right: { ...edge, ...common, id: ids.rightEdgeId, fromNodeId: ids.nodeId, toNodeId: edge.toNodeId, componentKey: null },
  };
}
function splitEdge(topology, command) {
  const context = splitContext(topology, command);
  const position = splitPosition(context.from, context.to, command.payload.fraction, context.edge.id);
  const ids = splitIds(topology, command.commandId);
  const records = splitRecords(context.edge, ids, position, command.commandId);
  return {
    ...topology,
    nodes: [...context.nodes, records.node],
    edges: [...context.edges.filter((row) => row.id !== context.edge.id), records.left, records.right],
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
    portKeys: (originalNode.portKeys ?? []).filter((key) => !moved.has(key)),
  };
  nodes.push({
    id: newNodeId, position: { ...originalNode.position }, portKeys: movedPortKeys,
    createdByCommandId: command.commandId, derivedFromNodeId: originalNodeId,
  });
  edges[edgeIndex] = { ...edge, [endpointKey]: newNodeId };
  return { ...topology, nodes, edges };
}
function deleteEdge(topology, command) {
  const edges = cloneRows(topology.edges);
  exactIndex(edges, command.payload.edgeId, 'edge');
  return { ...topology, edges: edges.filter((edge) => edge.id !== command.payload.edgeId) };
}

function uniqueText(values) {
  return [...new Set((values ?? []).map((value) => String(value ?? '').trim()).filter(Boolean))].sort();
}
function otherEndpoint(edge, nodeId) {
  return edge.fromNodeId === nodeId ? edge.toNodeId : edge.fromNodeId;
}
function sourceEvidence(edges) {
  return {
    sourceEntityIds: uniqueText(edges.flatMap((edge) => edge.sourceEntityIds ?? [edge.componentKey])),
    sourcePaths: uniqueText(edges.flatMap((edge) => edge.sourcePaths ?? [edge.sourcePath])),
  };
}
function addBendDefinition(topology, command) {
  const edges = cloneRows(topology.edges); const nodes = cloneRows(topology.nodes);
  const node = nodes[exactIndex(nodes, command.payload.nodeId, 'bend node')];
  const arms = command.payload.edgeIds.map((id) => edges[exactIndex(edges, id, 'bend arm')]);
  const id = generatedId('bend', command.commandId, 'bend-definition');
  assertUnusedId(topology, id);
  const definition = { bendId: id, nodeId: node.id, radiusMm: command.payload.radiusMm,
    angleDeg: command.payload.angleDeg, radiusAuthority: command.payload.radiusAuthority };
  for (const arm of arms) {
    const index = exactIndex(edges, arm.id, 'bend arm');
    edges[index] = { ...edges[index], bendDefinition: definition };
  }
  const bend = { id, nodeId: node.id, edgeIds: [...command.payload.edgeIds],
    position: { ...node.position }, radiusMm: command.payload.radiusMm,
    angleDeg: command.payload.angleDeg, radiusAuthority: command.payload.radiusAuthority,
    ...sourceEvidence(arms), createdByCommandId: command.commandId,
    editAncestry: [command.commandId] };
  return { ...topology, edges, bends: [...cloneRows(topology.bends ?? []), bend] };
}
function addJunctionDefinition(topology, command) {
  const nodes = cloneRows(topology.nodes); const edges = cloneRows(topology.edges);
  const junctions = cloneRows(topology.junctions);
  const node = nodes[exactIndex(nodes, command.payload.nodeId, 'junction node')];
  const arms = command.payload.edgeIds.map((id) => edges[exactIndex(edges, id, 'junction arm')]);
  const id = generatedId('junction', command.commandId, 'junction-definition');
  assertUnusedId(topology, id);
  junctions.push({ id, componentKey: null, kind: command.payload.kind,
    entityType: command.payload.kind, nodeId: node.id,
    nodeIds: uniqueText([node.id, ...arms.map((edge) => otherEndpoint(edge, node.id))]),
    edgeIds: [...command.payload.edgeIds], participatingEdgeIds: [...command.payload.edgeIds],
    position: { ...node.position }, expectedDegree: 3,
    inferenceAuthority: command.payload.inferenceAuthority,
    ...sourceEvidence(arms), createdByCommandId: command.commandId,
    editAncestry: [command.commandId] });
  return { ...topology, junctions };
}
function trimEdge(topology, command) {
  const nodes = cloneRows(topology.nodes); const edges = cloneRows(topology.edges);
  const edgeIndex = exactIndex(edges, command.payload.edgeId, 'trim edge');
  const edge = edges[edgeIndex];
  const nodeId = command.payload.endpoint === 'FROM' ? edge.fromNodeId : edge.toNodeId;
  const nodeIndex = exactIndex(nodes, nodeId, 'trim endpoint node');
  nodes[nodeIndex] = { ...nodes[nodeIndex], position: { ...command.payload.position },
    positionAuthority: `TOPOLOGY_EDIT:${command.commandId}/TRIM:${edge.id}` };
  edges[edgeIndex] = { ...edge, topologyOperation: 'EDIT_TRIM_EDGE',
    editAncestry: uniqueText([...(edge.editAncestry ?? []), edge.id, command.commandId]),
    lastModifiedByCommandId: command.commandId };
  return { ...topology, nodes, edges };
}
const REDUCERS = Object.freeze({
  CREATE_NODE: createNode,
  MOVE_NODE: moveNode, MERGE_NODES: mergeNodes,
  BRIDGE_GAP: addEdge, ADD_STRAIGHT_ELEMENT: addEdge,
  SPLIT_EDGE: splitEdge,
  INSERT_INLINE_COMPONENT: applyTopologyEditInlineComponent,
  INSERT_BRANCH_COMPONENT: applyTopologyEditBranchComponent,
  DISCONNECT_ENDPOINT: disconnectEndpoint,
  DELETE_EDGE: deleteEdge, ADD_BEND_DEFINITION: addBendDefinition,
  ADD_JUNCTION_DEFINITION: addJunctionDefinition, TRIM_EDGE: trimEdge,
});
export function applyResolvedTopologyEditCommand(canonicalTopology, resolvedCommandInput) {
  assertCanonicalTopologyHash(canonicalTopology);
  const command = assertResolvedTopologyEditCommand(resolvedCommandInput);
  const currentHash = canonicalTopologyStateHash(canonicalTopology);
  if (command.basis.priorDraftHash !== currentHash) {
    throw new Error('TopologyEditPureReducer: resolved command is stale for the current canonical topology.');
  }
  const topology = JSON.parse(JSON.stringify(canonicalTopology));
  const reducer = REDUCERS[command.commandType];
  if (!reducer) throw new RangeError(`TopologyEditPureReducer: unsupported command ${command.commandType}.`);
  return finalizeCanonicalTopology(reducer(topology, command));
}
export function replayResolvedTopologyEditCommands(baseCanonicalTopology, commands = []) {
  const base = deepFreeze(JSON.parse(JSON.stringify(baseCanonicalTopology)));
  return commands.reduce((topology, command) => (
    applyResolvedTopologyEditCommand(topology, command)
  ), base);
}
