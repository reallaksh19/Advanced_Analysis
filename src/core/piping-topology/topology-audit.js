import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import {
  TOPOLOGY_CONNECTION_AUDIT_SCHEMA,
  TOPOLOGY_EVIDENCE,
  TOPOLOGY_STATES,
} from './constants.js';

export function createTopologyConnectionAudit(projection, resolution, connectedComponents) {
  const states = projection.ports.map((port) => portState(port, resolution)).sort((a, b) => a.portKey.localeCompare(b.portKey));
  const cyclicComponentIds = connectedComponents.filter((component) => component.cyclic)
    .map((component) => component.connectedComponentId).sort();
  const base = {
    schema: TOPOLOGY_CONNECTION_AUDIT_SCHEMA,
    modelSemanticHash: projection.modelSemanticHash,
    portStates: states,
    unconnectedPorts: states.filter((row) => row.state !== TOPOLOGY_STATES.CONNECTED),
    ambiguousPorts: resolution.ambiguous,
    rejectedCandidates: resolution.rejectedCandidates,
    identityConflicts: resolution.identityConflicts,
    exactConnections: connectionIds(resolution.connections, TOPOLOGY_EVIDENCE.EXACT_COORDINATE),
    toleranceConnections: connectionIds(resolution.connections, TOPOLOGY_EVIDENCE.TOLERANCE_INFERRED),
    referenceConnections: resolution.connections.filter((connection) => (
      connection.evidenceType === TOPOLOGY_EVIDENCE.EXPLICIT_CONNECTION_REFERENCE
      || connection.evidenceType === TOPOLOGY_EVIDENCE.SHARED_SOURCE_ENDPOINT_IDENTITY
    )).map((connection) => connection.connectionId).sort(),
    connectedComponentCount: connectedComponents.length,
    cyclicComponentIds,
    diagnostics: resolution.diagnostics,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateTopologyConnectionAudit(audit) {
  const errors = [];
  if (!audit || audit.schema !== TOPOLOGY_CONNECTION_AUDIT_SCHEMA) errors.push('Invalid topology audit schema.');
  ['portStates', 'unconnectedPorts', 'ambiguousPorts', 'rejectedCandidates', 'identityConflicts', 'exactConnections', 'toleranceConnections', 'cyclicComponentIds', 'diagnostics']
    .forEach((field) => { if (!Array.isArray(audit?.[field])) errors.push(`Topology audit ${field} must be an array.`); });
  if (!Number.isInteger(audit?.connectedComponentCount) || audit.connectedComponentCount < 0) errors.push('Topology audit connectedComponentCount is invalid.');
  if (audit && audit.semanticHash !== semanticHash(withoutHash(audit))) errors.push('Topology audit semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function portState(port, resolution) {
  const peers = resolution.peers[port.portKey] || [];
  if (peers.length) return stateRecord(port.portKey, TOPOLOGY_STATES.CONNECTED, peers);
  const ambiguous = resolution.ambiguous.find((row) => row.portKey === port.portKey);
  if (ambiguous) return stateRecord(port.portKey, TOPOLOGY_STATES.AMBIGUOUS, [], ambiguous.candidatePortKeys);
  if (!port.position) return stateRecord(port.portKey, TOPOLOGY_STATES.INVALID_POSITION);
  if (resolution.unitBlockedPortKeys.includes(port.portKey)) return stateRecord(port.portKey, TOPOLOGY_STATES.UNIT_BLOCKED);
  if (hasIdentityConflict(port.portKey, resolution.identityConflicts)) return stateRecord(port.portKey, TOPOLOGY_STATES.IDENTITY_CONFLICT);
  return stateRecord(port.portKey, TOPOLOGY_STATES.UNCONNECTED);
}

function stateRecord(portKey, state, peerPortKeys = [], candidatePortKeys = []) {
  return deepFreeze({ portKey, state, peerPortKeys: [...peerPortKeys].sort(), candidatePortKeys: [...candidatePortKeys].sort() });
}

function hasIdentityConflict(portKey, conflicts) {
  return conflicts.some((row) => row.portAKey === portKey || row.portBKey === portKey);
}

function connectionIds(connections, evidenceType) {
  return connections.filter((connection) => connection.evidenceType === evidenceType)
    .map((connection) => connection.connectionId).sort();
}

function withoutHash(value) {
  const { semanticHash: _semanticHash, ...rest } = value || {};
  return rest;
}
