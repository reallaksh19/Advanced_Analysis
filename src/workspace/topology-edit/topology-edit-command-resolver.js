/** Resolve immutable command intent against one exact canonical topology. */
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { assertTopologyEditCommandRequest, TOPOLOGY_EDIT_RESOLVED_COMMAND_SCHEMA } from './topology-edit-command-contract.js';
import { assertCanonicalTopologyHash, canonicalTopologyStateHash } from './topology-edit-canonical-state.js';

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`TopologyEditCommandResolver: ${label} is required.`);
  return text;
}
function authorityBasis(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const sessionVersion = Number(source.sessionVersion);
  if (!Number.isInteger(sessionVersion) || sessionVersion < 0) throw new RangeError('TopologyEditCommandResolver: authority.sessionVersion must be a non-negative integer.');
  return { sourceHash: requiredText(source.sourceHash, 'authority.sourceHash'), baseCanonicalHash: requiredText(source.baseCanonicalHash, 'authority.baseCanonicalHash'), priorDraftHash: requiredText(source.priorDraftHash, 'authority.priorDraftHash'), sessionVersion };
}
function exactRecord(rows, id, label) {
  const matches = (rows ?? []).filter((row) => row?.id === id);
  if (matches.length !== 1) throw new RangeError(`TopologyEditCommandResolver: ${label} ${id} resolved ${matches.length} records; exactly one is required.`);
  return matches[0];
}
function nodeAdjacency(topology, nodeId) {
  const edgeIds = (topology.edges ?? []).filter((edge) => edge.fromNodeId === nodeId || edge.toNodeId === nodeId).map((edge) => edge.id).sort();
  const junctionIds = (topology.junctions ?? []).filter((row) => row.nodeId === nodeId || (row.nodeIds ?? []).includes(nodeId)).map((row) => row.id).sort();
  const supportIds = (topology.supports ?? []).filter((support) => support.nodeId === nodeId).map((support) => support.id).sort();
  const bendIds = (topology.bends ?? []).filter((bend) => bend.nodeId === nodeId).map((bend) => bend.id).sort();
  return semanticHash({ nodeId, edgeIds, junctionIds, supportIds, bendIds });
}
function nodeTarget(topology, nodeId, role) {
  const record = exactRecord(topology.nodes, nodeId, `${role} node`);
  return { kind: 'NODE', role, id: nodeId, revision: semanticHash({ kind: 'NODE', record }), adjacencyHash: nodeAdjacency(topology, nodeId), record };
}
function edgeTarget(topology, edgeId, role) {
  const record = exactRecord(topology.edges, edgeId, `${role} edge`);
  return { kind: 'EDGE', role, id: edgeId, revision: semanticHash({ kind: 'EDGE', record }), record };
}
function unorderedPair(left, right) { return [left, right].sort().join('\u0000'); }
function assertNoExistingConnection(topology, fromNodeId, toNodeId, commandType) {
  const pair = unorderedPair(fromNodeId, toNodeId);
  const existing = (topology.edges ?? []).find((edge) => unorderedPair(edge.fromNodeId, edge.toNodeId) === pair);
  if (existing) throw new RangeError(`TopologyEditCommandResolver: ${commandType} would duplicate existing edge ${existing.id}.`);
}
function assertMergeIsStructurallyBounded(topology, sourceNodeId, targetNodeId) {
  const pairs = new Map();
  for (const edge of topology.edges ?? []) {
    const fromNodeId = edge.fromNodeId === sourceNodeId ? targetNodeId : edge.fromNodeId;
    const toNodeId = edge.toNodeId === sourceNodeId ? targetNodeId : edge.toNodeId;
    if (fromNodeId === toNodeId) throw new RangeError(`TopologyEditCommandResolver: MERGE_NODES would collapse edge ${edge.id} into a self-loop.`);
    const pair = unorderedPair(fromNodeId, toNodeId);
    if (pairs.has(pair)) throw new RangeError(`TopologyEditCommandResolver: MERGE_NODES would create duplicate edges ${pairs.get(pair)} and ${edge.id}.`);
    pairs.set(pair, edge.id);
  }
}
function referencesEdge(record, edgeId) { return record?.edgeId === edgeId || (Array.isArray(record?.edgeIds) && record.edgeIds.includes(edgeId)); }
function assertSplitHasNoAmbiguousDependants(topology, edgeId) {
  for (const collection of ['junctions', 'supports', 'boundaries', 'rigids', 'bends']) {
    const dependent = (topology[collection] ?? []).find((record) => referencesEdge(record, edgeId));
    if (dependent) throw new RangeError(`TopologyEditCommandResolver: SPLIT_EDGE cannot remap ${collection} record ${dependent.id} without an explicit dependency rule.`);
  }
}
function endpointPortKeys(edge, node, endpoint) {
  if (!edge.componentKey) return [];
  const expectedRole = endpoint === 'FROM' ? 'start' : 'end';
  const candidates = (node.portKeys ?? []).filter((portKey) => String(portKey).includes(String(edge.componentKey)) && String(portKey).toLowerCase().endsWith(`:${expectedRole}`));
  if (candidates.length !== 1) throw new RangeError(`TopologyEditCommandResolver: DISCONNECT_ENDPOINT requires one ${expectedRole} port key for ${edge.id}; resolved ${candidates.length}.`);
  return candidates;
}
function targets(nodes = [], edges = [], endpointKeys = []) { return { nodes, edges, endpointPortKeys: endpointKeys }; }
function resolveMove(topology, request) { return targets([nodeTarget(topology, request.payload.nodeId, 'MOVE')]); }
function resolveMerge(topology, request) {
  const source = nodeTarget(topology, request.payload.sourceNodeId, 'SOURCE');
  const target = nodeTarget(topology, request.payload.targetNodeId, 'TARGET');
  assertMergeIsStructurallyBounded(topology, source.id, target.id); return targets([source, target]);
}
function resolveAddedEdge(topology, request) {
  const from = nodeTarget(topology, request.payload.fromNodeId, 'FROM'); const to = nodeTarget(topology, request.payload.toNodeId, 'TO');
  assertNoExistingConnection(topology, from.id, to.id, request.commandType); return targets([from, to]);
}
function resolveSplit(topology, request) {
  const edge = edgeTarget(topology, request.payload.edgeId, 'SPLIT');
  const from = nodeTarget(topology, edge.record.fromNodeId, 'FROM'); const to = nodeTarget(topology, edge.record.toNodeId, 'TO');
  assertSplitHasNoAmbiguousDependants(topology, edge.id); return targets([from, to], [edge]);
}
function resolveDisconnect(topology, request) {
  const edge = edgeTarget(topology, request.payload.edgeId, 'DISCONNECT');
  const nodeId = request.payload.endpoint === 'FROM' ? edge.record.fromNodeId : edge.record.toNodeId;
  const node = nodeTarget(topology, nodeId, request.payload.endpoint);
  return targets([node], [edge], endpointPortKeys(edge.record, node.record, request.payload.endpoint));
}
function resolveDelete(topology, request) { return targets([], [edgeTarget(topology, request.payload.edgeId, 'DELETE')]); }

function incidentEdges(topology, nodeId) {
  return (topology.edges ?? []).filter((edge) => (
    edge.fromNodeId === nodeId || edge.toNodeId === nodeId
  )).sort((left, right) => left.id.localeCompare(right.id));
}
function sameIds(left, right) {
  const a = [...left].sort(); const b = [...right].sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
function resolveBend(topology, request) {
  const node = nodeTarget(topology, request.payload.nodeId, 'BEND_NODE');
  const incident = incidentEdges(topology, node.id);
  if (incident.length !== 2 || !sameIds(incident.map((edge) => edge.id), request.payload.edgeIds)) {
    throw new RangeError(`TopologyEditCommandResolver: bend node ${node.id} must name its exact two incident edges.`);
  }
  if ((topology.bends ?? []).some((bend) => bend.nodeId === node.id)) {
    throw new RangeError(`TopologyEditCommandResolver: node ${node.id} already has a bend definition.`);
  }
  if ((topology.junctions ?? []).some((row) => row.nodeId === node.id || (row.nodeIds ?? []).includes(node.id))) {
    throw new RangeError(`TopologyEditCommandResolver: bend node ${node.id} already has a junction definition.`);
  }
  return targets([node], request.payload.edgeIds.map((id, index) => (
    edgeTarget(topology, id, `BEND_ARM_${index + 1}`)
  )));
}
function resolveJunction(topology, request) {
  const node = nodeTarget(topology, request.payload.nodeId, 'JUNCTION_NODE');
  const incident = incidentEdges(topology, node.id);
  if (incident.length !== 3 || !sameIds(incident.map((edge) => edge.id), request.payload.edgeIds)) {
    throw new RangeError(`TopologyEditCommandResolver: junction node ${node.id} must name its exact three incident edges.`);
  }
  if ((topology.junctions ?? []).some((row) => row.nodeId === node.id || (row.nodeIds ?? []).includes(node.id))) {
    throw new RangeError(`TopologyEditCommandResolver: node ${node.id} already has a junction definition.`);
  }
  if ((topology.bends ?? []).some((bend) => bend.nodeId === node.id)) {
    throw new RangeError(`TopologyEditCommandResolver: junction node ${node.id} already has a bend definition.`);
  }
  return targets([node], request.payload.edgeIds.map((id, index) => (
    edgeTarget(topology, id, `JUNCTION_ARM_${index + 1}`)
  )));
}
function referencesNode(record, nodeId) {
  return ['nodeId', 'fromNodeId', 'toNodeId'].some((key) => record?.[key] === nodeId)
    || ['nodeIds', 'fromNodeIds', 'toNodeIds'].some((key) => (record?.[key] ?? []).includes?.(nodeId));
}
function resolveTrim(topology, request) {
  const edge = edgeTarget(topology, request.payload.edgeId, 'TRIM_EDGE');
  const nodeId = request.payload.endpoint === 'FROM' ? edge.record.fromNodeId : edge.record.toNodeId;
  const otherId = request.payload.endpoint === 'FROM' ? edge.record.toNodeId : edge.record.fromNodeId;
  const node = nodeTarget(topology, nodeId, request.payload.endpoint);
  if (incidentEdges(topology, nodeId).length !== 1) {
    throw new RangeError(`TopologyEditCommandResolver: trim endpoint ${nodeId} is not graph-open.`);
  }
  for (const collection of ['supports', 'junctions', 'boundaries', 'bends']) {
    const dependent = (topology[collection] ?? []).find((record) => referencesNode(record, nodeId));
    if (dependent) throw new RangeError(`TopologyEditCommandResolver: TRIM_EDGE cannot move ${nodeId}; ${collection} record ${dependent.id} depends on it.`);
  }
  const rigid = (topology.rigids ?? []).find((record) => (
    referencesNode(record, nodeId) || referencesEdge(record, edge.id)
  ));
  if (rigid) throw new RangeError(`TopologyEditCommandResolver: TRIM_EDGE cannot move ${nodeId}; rigid ${rigid.id} depends on it.`);
  const other = exactRecord(topology.nodes, otherId, 'TRIM_OTHER node');
  const position = request.payload.position;
  if (Math.hypot(position.x - other.position.x, position.y - other.position.y,
    position.z - other.position.z) <= 1e-9) {
    throw new RangeError(`TopologyEditCommandResolver: TRIM_EDGE would collapse edge ${edge.id}.`);
  }
  return targets([node], [edge]);
}
const TARGET_RESOLVERS = Object.freeze({
  MOVE_NODE: resolveMove, MERGE_NODES: resolveMerge, BRIDGE_GAP: resolveAddedEdge,
  ADD_STRAIGHT_ELEMENT: resolveAddedEdge, SPLIT_EDGE: resolveSplit,
  DISCONNECT_ENDPOINT: resolveDisconnect, DELETE_EDGE: resolveDelete,
  ADD_BEND_DEFINITION: resolveBend, ADD_JUNCTION_DEFINITION: resolveJunction,
  TRIM_EDGE: resolveTrim,
});
function resolveTargets(topology, request) {
  const resolver = TARGET_RESOLVERS[request.commandType];
  if (resolver) return resolver(topology, request);
  throw new RangeError(`TopologyEditCommandResolver: unsupported command ${request.commandType}.`);
}
function targetRevisionMap(resolvedTargets) {
  return Object.fromEntries([...resolvedTargets.nodes, ...resolvedTargets.edges].map((target) => [target.id, target.revision]).sort(([left], [right]) => left.localeCompare(right)));
}
function assertExpectedRevisions(expected, actual) {
  for (const [id, revision] of Object.entries(expected)) {
    if (!(id in actual)) throw new RangeError(`TopologyEditCommandResolver: expected revision references unresolved target ${id}.`);
    if (actual[id] !== revision) throw new Error(`TopologyEditCommandResolver: stale target revision for ${id}.`);
  }
}
function assertBasis(request, topology, authority) {
  const basis = authorityBasis(authority); const actualPriorDraftHash = canonicalTopologyStateHash(topology); assertCanonicalTopologyHash(topology);
  for (const key of ['sourceHash', 'baseCanonicalHash', 'priorDraftHash', 'sessionVersion']) if (request.basis[key] !== basis[key]) throw new Error(`TopologyEditCommandResolver: stale command basis ${key}.`);
  if (topology.sourceHash !== basis.sourceHash) throw new Error('TopologyEditCommandResolver: canonical topology sourceHash differs from session authority.');
  if (actualPriorDraftHash !== basis.priorDraftHash) throw new Error('TopologyEditCommandResolver: prior draft hash differs from the current canonical topology.');
  return basis;
}
export function resolveTopologyEditCommand({ request: requestInput, canonicalTopology, authority } = {}) {
  const request = assertTopologyEditCommandRequest(requestInput); const basis = assertBasis(request, canonicalTopology, authority);
  const resolvedTargets = resolveTargets(canonicalTopology, request); const targetRevisions = targetRevisionMap(resolvedTargets); assertExpectedRevisions(request.expectedTargetRevisions, targetRevisions);
  const material = { schema: TOPOLOGY_EDIT_RESOLVED_COMMAND_SCHEMA, commandId: request.commandId, commandType: request.commandType, basis, payload: request.payload, requestHash: request.requestHash, targets: resolvedTargets, targetRevisions };
  return deepFreeze({ ...material, resolutionHash: semanticHash(material) });
}
export function assertResolvedTopologyEditCommand(value) {
  if (value?.schema !== TOPOLOGY_EDIT_RESOLVED_COMMAND_SCHEMA) throw new TypeError(`TopologyEditCommandResolver: resolved command must use ${TOPOLOGY_EDIT_RESOLVED_COMMAND_SCHEMA}.`);
  const material = { ...value }; delete material.resolutionHash;
  if (value.resolutionHash !== semanticHash(material)) throw new Error('TopologyEditCommandResolver: resolved command authority hash mismatch.');
  return value;
}
