import { TOPOLOGY_EVIDENCE } from './constants.js';
import { canReceivePeer, connectPorts, markAmbiguous } from './resolution-state.js';

export function resolveExplicitConnections(state) {
  resolveDirectPeerReferences(state);
  resolveSharedReferenceTokens(state);
}

function resolveDirectPeerReferences(state) {
  state.projection.ports.forEach((port) => {
    if (!canReceivePeer(state, port)) return;
    const keys = port.explicitPeerPortKeys;
    if (keys.length > 1 && !port.multiConnection) {
      markAmbiguous(state, port, keys, TOPOLOGY_EVIDENCE.EXPLICIT_CONNECTION_REFERENCE);
      return;
    }
    keys.forEach((peerKey) => connectPorts(
      state,
      port,
      state.portsByKey.get(peerKey),
      TOPOLOGY_EVIDENCE.EXPLICIT_CONNECTION_REFERENCE,
    ));
  });
}

function resolveSharedReferenceTokens(state) {
  const groups = new Map();
  state.projection.ports.forEach((port) => {
    if (!canReceivePeer(state, port)) return;
    port.explicitReferenceIds.forEach((token) => addToGroup(groups, token, port.portKey));
  });
  [...groups.keys()].sort().forEach((token) => resolveTokenGroup(state, groups.get(token)));
}

function resolveTokenGroup(state, portKeys) {
  const ports = portKeys.map((key) => state.portsByKey.get(key)).filter((port) => canReceivePeer(state, port));
  if (ports.length < 2) return;
  if (ports.length === 2) {
    connectPorts(state, ports[0], ports[1], TOPOLOGY_EVIDENCE.EXPLICIT_CONNECTION_REFERENCE);
    return;
  }
  const junctions = ports.filter((port) => port.multiConnection);
  if (junctions.length === 1) return connectJunction(state, junctions[0], ports);
  ports.forEach((port) => markAmbiguous(
    state,
    port,
    ports.filter((candidate) => candidate !== port).map((candidate) => candidate.portKey),
    TOPOLOGY_EVIDENCE.EXPLICIT_CONNECTION_REFERENCE,
  ));
}

function connectJunction(state, junction, ports) {
  ports.filter((port) => port !== junction).forEach((port) => {
    connectPorts(state, junction, port, TOPOLOGY_EVIDENCE.EXPLICIT_CONNECTION_REFERENCE);
  });
}

function addToGroup(map, key, value) {
  const values = map.get(key) || [];
  if (!values.includes(value)) values.push(value);
  map.set(key, values.sort());
}
