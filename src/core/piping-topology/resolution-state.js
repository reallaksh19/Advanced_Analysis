import { deepFreeze } from '../shared-piping-model/index.js';
import { createConnection, pairKey } from './connection-record.js';
import { TOPOLOGY_EVIDENCE } from './constants.js';
import { evaluateIdentityCompatibility, identityConflictDiagnostics } from './identity-compatibility.js';

export function createResolutionState(projection) {
  return {
    projection,
    portsByKey: new Map(projection.ports.map((port) => [port.portKey, port])),
    connections: new Map(),
    peers: new Map(projection.ports.map((port) => [port.portKey, new Set()])),
    ambiguous: new Map(),
    rejectedCandidates: [],
    identityConflicts: [],
    diagnostics: [...projection.diagnostics],
    unitBlockedPorts: new Set(),
  };
}

export function connectPorts(state, portA, portB, evidenceType, options = {}) {
  const explicit = evidenceType === TOPOLOGY_EVIDENCE.EXPLICIT_CONNECTION_REFERENCE;
  const validation = validatePair(state, portA, portB, evidenceType, explicit);
  if (!validation.ok) return false;
  const key = pairKey(portA.portKey, portB.portKey);
  if (state.connections.has(key)) return true;
  const connection = createConnection(portA, portB, evidenceType, validation.compatibility, {
    ...options,
    diagnostics: validation.diagnostics,
  });
  state.connections.set(key, connection);
  state.peers.get(portA.portKey).add(portB.portKey);
  state.peers.get(portB.portKey).add(portA.portKey);
  return true;
}

export function inferredCandidate(state, portA, portB, evidenceType) {
  const validation = validatePair(state, portA, portB, evidenceType, false);
  return validation.ok ? validation.compatibility : null;
}

export function markAmbiguous(state, port, candidateKeys, evidenceType) {
  const existing = state.ambiguous.get(port.portKey);
  if (existing) return;
  const candidates = [...new Set(candidateKeys)].filter((key) => key !== port.portKey).sort();
  state.ambiguous.set(port.portKey, deepFreeze({
    portKey: port.portKey,
    state: 'AMBIGUOUS',
    evidenceType,
    candidatePortKeys: candidates,
  }));
  state.diagnostics.push(deepFreeze({
    code: 'TOPOLOGY_CONNECTION_AMBIGUOUS',
    severity: 'WARNING',
    scope: port.portKey,
    evidenceType,
    candidatePortKeys: candidates,
    message: 'Multiple compatible peer candidates were preserved without selecting one.',
  }));
}

export function markUnitBlocked(state, port) {
  state.unitBlockedPorts.add(port.portKey);
}

export function canReceivePeer(state, port) {
  if (!port || state.ambiguous.has(port.portKey)) return false;
  const count = state.peers.get(port.portKey)?.size || 0;
  return port.multiConnection || count === 0;
}

export function unresolvedPorts(state) {
  return state.projection.ports.filter((port) => port.position && canReceivePeer(state, port));
}

export function resolveMutualCandidates(state, candidateMap, evidenceType, options = {}) {
  [...candidateMap.keys()].sort().forEach((portKey) => {
    const port = state.portsByKey.get(portKey);
    if (!canReceivePeer(state, port)) return;
    const candidates = candidateMap.get(portKey) || [];
    if (candidates.length > 1 && !port.multiConnection) {
      markAmbiguous(state, port, candidates, evidenceType);
      return;
    }
    candidates.forEach((candidateKey) => connectMutualPair(state, port, candidateKey, candidateMap, evidenceType, options));
  });
}

export function finalizeResolution(state) {
  return deepFreeze({
    connections: [...state.connections.values()].sort((left, right) => left.connectionId.localeCompare(right.connectionId)),
    peers: Object.fromEntries([...state.peers.entries()].map(([key, value]) => [key, [...value].sort()])),
    ambiguous: [...state.ambiguous.values()].sort((left, right) => left.portKey.localeCompare(right.portKey)),
    rejectedCandidates: uniqueRows(state.rejectedCandidates, candidateIdentity).sort(candidateOrder),
    identityConflicts: uniqueRows(state.identityConflicts, conflictIdentity).sort(candidateOrder),
    diagnostics: uniqueRows(state.diagnostics, diagnosticIdentity).sort(diagnosticOrder),
    unitBlockedPortKeys: [...state.unitBlockedPorts].sort(),
  });
}

function connectMutualPair(state, port, candidateKey, candidateMap, evidenceType, options) {
  const candidate = state.portsByKey.get(candidateKey);
  if (!canReceivePeer(state, candidate)) return;
  const reciprocal = candidateMap.get(candidateKey) || [];
  if (!candidate.multiConnection && (reciprocal.length !== 1 || reciprocal[0] !== port.portKey)) return;
  connectPorts(state, port, candidate, evidenceType, options);
}

function validatePair(state, portA, portB, evidenceType, explicit) {
  if (!portA || !portB) return rejected(state, portA, portB, evidenceType, 'TOPOLOGY_PEER_REFERENCE_MISSING');
  if (portA.portKey === portB.portKey) return rejected(state, portA, portB, evidenceType, 'TOPOLOGY_SELF_CONNECTION_REJECTED');
  if (portA.componentKey === portB.componentKey && !explicit) {
    return rejected(state, portA, portB, evidenceType, 'TOPOLOGY_SAME_COMPONENT_CONNECTION_REJECTED');
  }
  if (!canReceivePeer(state, portA) || !canReceivePeer(state, portB)) return { ok: false };
  const compatibility = evaluateIdentityCompatibility(portA.engineeringIdentity, portB.engineeringIdentity);
  const diagnostics = identityConflictDiagnostics(portA, portB, compatibility, evidenceType);
  if (!explicit && !compatibility.compatibleForInferred) {
    recordIdentityConflict(state, portA, portB, evidenceType, compatibility, diagnostics);
    return { ok: false };
  }
  return { ok: true, compatibility, diagnostics };
}

function rejected(state, portA, portB, evidenceType, code) {
  recordRejected(state, portA, portB, evidenceType, code);
  return { ok: false };
}

function recordRejected(state, portA, portB, evidenceType, code) {
  const row = deepFreeze({
    code,
    portAKey: portA?.portKey || '',
    portBKey: portB?.portKey || '',
    evidenceType,
  });
  state.rejectedCandidates.push(row);
  state.diagnostics.push(deepFreeze({ ...row, severity: 'WARNING', scope: `${row.portAKey}<->${row.portBKey}` }));
}

function recordIdentityConflict(state, portA, portB, evidenceType, compatibility, diagnostics) {
  state.identityConflicts.push(deepFreeze({
    portAKey: portA.portKey,
    portBKey: portB.portKey,
    evidenceType,
    identityCompatibility: compatibility,
  }));
  state.rejectedCandidates.push(deepFreeze({
    code: 'TOPOLOGY_IDENTITY_CONFLICT_REJECTED',
    portAKey: portA.portKey,
    portBKey: portB.portKey,
    evidenceType,
  }));
  state.diagnostics.push(...diagnostics);
}

function uniqueRows(rows, selector) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = selector(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function candidateIdentity(row) {
  return `${row.code || ''}|${[row.portAKey, row.portBKey].sort().join('|')}|${row.evidenceType}`;
}

function conflictIdentity(row) {
  return `${[row.portAKey, row.portBKey].sort().join('|')}|${row.evidenceType}`;
}

function diagnosticIdentity(row) {
  return `${row.code}|${row.scope}|${row.evidenceType || ''}`;
}

function candidateOrder(left, right) {
  return `${left.portAKey}|${left.portBKey}|${left.code || ''}`.localeCompare(`${right.portAKey}|${right.portBKey}|${right.code || ''}`);
}

function diagnosticOrder(left, right) {
  return `${left.code}|${left.scope}`.localeCompare(`${right.code}|${right.scope}`);
}
