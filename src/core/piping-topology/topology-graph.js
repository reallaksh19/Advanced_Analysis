import {
  deepFreeze,
  semanticHash,
  stringValue,
} from '../shared-piping-model/index.js';
import { buildConnectedComponents } from './connected-components.js';
import {
  createExactTopologyProfile,
  validateTopologyConnectionProfile,
} from './connection-profile.js';
import { PIPING_PORT_TOPOLOGY_GRAPH_SCHEMA, TOPOLOGY_EVIDENCE } from './constants.js';
import { resolveTopologyConnections } from './connection-resolver.js';
import { projectEngineeringPorts } from './port-projection.js';
import { createTopologyConnectionAudit, validateTopologyConnectionAudit } from './topology-audit.js';

export function buildPipingPortTopologyGraph(sharedModel, profile = null) {
  const resolvedProfile = profile || createExactTopologyProfile(sharedModel?.units?.length);
  assertProfile(resolvedProfile);
  const projection = projectEngineeringPorts(sharedModel);
  const resolution = resolveTopologyConnections(projection, resolvedProfile);
  const connectedComponents = buildConnectedComponents(projection, resolution.connections);
  const topologyAudit = createTopologyConnectionAudit(projection, resolution, connectedComponents);
  const base = {
    schema: PIPING_PORT_TOPOLOGY_GRAPH_SCHEMA,
    datasetId: projection.datasetId,
    sharedModelSemanticHash: projection.modelSemanticHash,
    profile: resolvedProfile,
    components: projection.components,
    ports: graphPorts(projection.ports, resolution.peers, topologyAudit.portStates),
    connections: resolution.connections,
    connectedComponents,
    topologyAudit,
    summary: graphSummary(projection, resolution.connections, connectedComponents, topologyAudit),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validatePipingPortTopologyGraph(graph) {
  const errors = [];
  if (!graph || graph.schema !== PIPING_PORT_TOPOLOGY_GRAPH_SCHEMA) errors.push('Invalid piping topology graph schema.');
  if (!stringValue(graph?.datasetId)) errors.push('Topology graph datasetId is required.');
  if (!stringValue(graph?.sharedModelSemanticHash)) errors.push('Topology graph shared-model hash is required.');
  validateTopologyConnectionProfile(graph?.profile).errors.forEach((error) => errors.push(error));
  validateRows(graph?.components, 'componentKey', 'components', errors);
  validateRows(graph?.ports, 'portKey', 'ports', errors);
  validateConnections(graph, errors);
  validateConnectedComponents(graph, errors);
  validateTopologyConnectionAudit(graph?.topologyAudit).errors.forEach((error) => errors.push(error));
  if (graph && graph.semanticHash !== semanticHash(withoutHash(graph))) errors.push('Topology graph semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function graphPorts(ports, peers, states) {
  const statesByKey = new Map(states.map((state) => [state.portKey, state]));
  return ports.map((port) => ({
    ...port,
    peerPortKeys: peers[port.portKey] || [],
    topologyState: statesByKey.get(port.portKey)?.state || 'UNCONNECTED',
  })).sort((left, right) => left.portKey.localeCompare(right.portKey));
}

function graphSummary(projection, connections, connectedComponents, audit) {
  return {
    componentCount: projection.components.length,
    portCount: projection.ports.length,
    connectionCount: connections.length,
    connectedComponentCount: connectedComponents.length,
    unconnectedPortCount: audit.unconnectedPorts.length,
    ambiguousPortCount: audit.ambiguousPorts.length,
    cycleCount: audit.cyclicComponentIds.length,
    explicitConnectionCount: countEvidence(connections, TOPOLOGY_EVIDENCE.EXPLICIT_CONNECTION_REFERENCE),
    endpointIdentityConnectionCount: countEvidence(connections, TOPOLOGY_EVIDENCE.SHARED_SOURCE_ENDPOINT_IDENTITY),
    exactConnectionCount: countEvidence(connections, TOPOLOGY_EVIDENCE.EXACT_COORDINATE),
    toleranceConnectionCount: countEvidence(connections, TOPOLOGY_EVIDENCE.TOLERANCE_INFERRED),
  };
}

function validateConnections(graph, errors) {
  if (!Array.isArray(graph?.connections)) return errors.push('Topology graph connections must be an array.');
  const ports = new Map((graph.ports || []).map((port) => [port.portKey, port]));
  const pairs = new Set();
  graph.connections.forEach((connection) => validateConnection(connection, ports, pairs, errors));
  ports.forEach((port) => validatePortPeers(port, ports, pairs, errors));
}

function validateConnection(connection, ports, pairs, errors) {
  const id = stringValue(connection?.connectionId);
  if (!id) errors.push('Topology connectionId is required.');
  if (connection?.portAKey === connection?.portBKey) errors.push(`Connection ${id} is a self-connection.`);
  if (!Object.values(TOPOLOGY_EVIDENCE).includes(connection?.evidenceType)) errors.push(`Connection ${id} has invalid evidence.`);
  if (!ports.has(connection?.portAKey) || !ports.has(connection?.portBKey)) errors.push(`Connection ${id} has an invalid peer reference.`);
  const key = pairKey(connection?.portAKey, connection?.portBKey);
  if (pairs.has(key)) errors.push(`Duplicate undirected connection: ${key}.`);
  pairs.add(key);
  validateConnectionPeers(connection, ports, errors);
}

function validateConnectionPeers(connection, ports, errors) {
  const a = ports.get(connection?.portAKey);
  const b = ports.get(connection?.portBKey);
  if (a && !a.peerPortKeys?.includes(connection.portBKey)) errors.push(`Connection ${connection.connectionId} is missing from port A peers.`);
  if (b && !b.peerPortKeys?.includes(connection.portAKey)) errors.push(`Connection ${connection.connectionId} is missing from port B peers.`);
}

function validatePortPeers(port, ports, pairs, errors) {
  if (!Array.isArray(port?.peerPortKeys)) return errors.push(`Port ${port?.portKey || ''} peerPortKeys must be an array.`);
  if (new Set(port.peerPortKeys).size !== port.peerPortKeys.length) errors.push(`Port ${port.portKey} has duplicate peer references.`);
  if (!port.multiConnection && port.peerPortKeys.length > 1) errors.push(`Port ${port.portKey} has multiple peers without multi-connection evidence.`);
  port.peerPortKeys.forEach((peerKey) => {
    if (!ports.has(peerKey)) errors.push(`Port ${port.portKey} references missing peer ${peerKey}.`);
    if (!pairs.has(pairKey(port.portKey, peerKey))) errors.push(`Port ${port.portKey} references peer ${peerKey} without a connection.`);
  });
}

function pairKey(left, right) {
  return [stringValue(left), stringValue(right)].sort().join('\u0000');
}

function validateConnectedComponents(graph, errors) {
  if (!Array.isArray(graph?.connectedComponents)) return errors.push('Topology graph connectedComponents must be an array.');
  const componentIds = new Set(graph.connectedComponents.map((item) => item.connectedComponentId));
  if (componentIds.size !== graph.connectedComponents.length) errors.push('Topology connected-component IDs must be unique.');
}

function validateRows(rows, key, label, errors) {
  if (!Array.isArray(rows)) return errors.push(`Topology graph ${label} must be an array.`);
  const keys = rows.map((row) => stringValue(row?.[key]));
  if (keys.some((value) => !value)) errors.push(`Topology graph ${label} contains a missing ${key}.`);
  if (new Set(keys).size !== keys.length) errors.push(`Topology graph ${label} contains duplicate ${key} values.`);
}

function countEvidence(connections, evidenceType) {
  return connections.filter((connection) => connection.evidenceType === evidenceType).length;
}

function assertProfile(profile) {
  const validation = validateTopologyConnectionProfile(profile);
  if (!validation.ok) throw new TypeError(`Invalid topology profile: ${validation.errors.join(' ')}`);
}

function withoutHash(value) {
  const { semanticHash: _semanticHash, ...rest } = value || {};
  return rest;
}
