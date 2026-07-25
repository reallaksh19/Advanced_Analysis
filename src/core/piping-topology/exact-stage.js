import { exactCoordinateKey } from './connection-record.js';
import { TOPOLOGY_EVIDENCE } from './constants.js';
import { canReceivePeer, inferredCandidate, resolveMutualCandidates } from './resolution-state.js';

export function resolveExactCoordinateConnections(state) {
  const groups = coordinateGroups(state);
  [...groups.keys()].sort().forEach((key) => resolveCoordinateGroup(state, groups.get(key)));
}

function coordinateGroups(state) {
  const groups = new Map();
  state.projection.ports.forEach((port) => {
    if (!port.position || !canReceivePeer(state, port)) return;
    const key = exactCoordinateKey(port);
    if (!key) return;
    const values = groups.get(key) || [];
    values.push(port.portKey);
    groups.set(key, values.sort());
  });
  return groups;
}

function resolveCoordinateGroup(state, portKeys) {
  if (portKeys.length < 2) return;
  const ports = portKeys.map((key) => state.portsByKey.get(key)).filter((port) => canReceivePeer(state, port));
  const candidates = new Map();
  ports.forEach((port) => {
    const peers = ports.filter((candidate) => candidate !== port).filter((candidate) => inferredCandidate(
      state,
      port,
      candidate,
      TOPOLOGY_EVIDENCE.EXACT_COORDINATE,
    )).map((candidate) => candidate.portKey).sort();
    if (peers.length) candidates.set(port.portKey, peers);
  });
  resolveMutualCandidates(state, candidates, TOPOLOGY_EVIDENCE.EXACT_COORDINATE);
}
