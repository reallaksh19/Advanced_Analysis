import { TOPOLOGY_EVIDENCE } from './constants.js';
import {
  canReceivePeer,
  connectPorts,
  inferredCandidate,
  markAmbiguous,
  resolveMutualCandidates,
} from './resolution-state.js';

export function resolveSourceEndpointConnections(state) {
  const groups = groupByEndpointIdentity(state);
  [...groups.keys()].sort().forEach((identity) => resolveEndpointGroup(state, groups.get(identity)));
}

function groupByEndpointIdentity(state) {
  const groups = new Map();
  state.projection.ports.forEach((port) => {
    if (!canReceivePeer(state, port) || !port.sourceEndpointIdentity) return;
    const values = groups.get(port.sourceEndpointIdentity) || [];
    values.push(port.portKey);
    groups.set(port.sourceEndpointIdentity, values.sort());
  });
  return groups;
}

function resolveEndpointGroup(state, portKeys) {
  const ports = portKeys.map((key) => state.portsByKey.get(key)).filter((port) => canReceivePeer(state, port));
  if (ports.length < 2) return;
  const junctions = ports.filter((port) => port.multiConnection);
  if (ports.length > 2 && junctions.length === 1) {
    connectEndpointJunction(state, junctions[0], ports);
    return;
  }
  const candidates = compatibleCandidates(state, ports);
  resolveMutualCandidates(state, candidates, TOPOLOGY_EVIDENCE.SHARED_SOURCE_ENDPOINT_IDENTITY);
}

function connectEndpointJunction(state, junction, ports) {
  const candidates = ports.filter((port) => port !== junction).filter((port) => inferredCandidate(
    state,
    junction,
    port,
    TOPOLOGY_EVIDENCE.SHARED_SOURCE_ENDPOINT_IDENTITY,
  ));
  if (!candidates.length) return;
  candidates.forEach((port) => connectPorts(
    state,
    junction,
    port,
    TOPOLOGY_EVIDENCE.SHARED_SOURCE_ENDPOINT_IDENTITY,
  ));
}

function compatibleCandidates(state, ports) {
  const map = new Map();
  ports.forEach((port) => {
    const candidates = ports.filter((candidate) => candidate !== port).filter((candidate) => inferredCandidate(
      state,
      port,
      candidate,
      TOPOLOGY_EVIDENCE.SHARED_SOURCE_ENDPOINT_IDENTITY,
    )).map((candidate) => candidate.portKey).sort();
    if (candidates.length) map.set(port.portKey, candidates);
    if (candidates.length > 1 && !port.multiConnection) markAmbiguous(
      state,
      port,
      candidates,
      TOPOLOGY_EVIDENCE.SHARED_SOURCE_ENDPOINT_IDENTITY,
    );
  });
  return map;
}
