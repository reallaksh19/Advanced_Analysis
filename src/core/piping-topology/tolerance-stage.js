import { portDistanceCanonical } from './connection-record.js';
import { toleranceInCanonicalUnit } from './connection-profile.js';
import { TOPOLOGY_EVIDENCE } from './constants.js';
import {
  canReceivePeer,
  inferredCandidate,
  markUnitBlocked,
  resolveMutualCandidates,
  unresolvedPorts,
} from './resolution-state.js';
import { buildSpatialHash, nearbyPortKeys } from './spatial-hash.js';

export function resolveToleranceConnections(state, profile) {
  if (!profile.allowToleranceInference) return;
  const toleranceCanonical = toleranceInCanonicalUnit(profile);
  if (toleranceCanonical === null || state.projection.lengthUnit === 'unknown') {
    unresolvedPorts(state).forEach((port) => markUnitBlocked(state, port));
    state.diagnostics.push(unitBlockedDiagnostic(profile));
    return;
  }
  const ports = unresolvedPorts(state).filter((port) => port.positionCanonical);
  const spatialHash = buildSpatialHash(ports, toleranceCanonical);
  const candidates = new Map();
  ports.forEach((port) => addToleranceCandidates(state, port, spatialHash, toleranceCanonical, candidates));
  resolveMutualCandidates(state, candidates, TOPOLOGY_EVIDENCE.TOLERANCE_INFERRED, { toleranceCanonical });
}

function addToleranceCandidates(state, port, spatialHash, toleranceCanonical, candidates) {
  const peerKeys = nearbyPortKeys(port, spatialHash).filter((key) => key !== port.portKey);
  const accepted = peerKeys.filter((key) => withinTolerance(state, port, key, toleranceCanonical));
  if (accepted.length) candidates.set(port.portKey, accepted.sort());
}

function withinTolerance(state, port, peerKey, toleranceCanonical) {
  const peer = state.portsByKey.get(peerKey);
  if (!canReceivePeer(state, peer)) return false;
  const distance = portDistanceCanonical(port, peer);
  if (distance === null || distance > toleranceCanonical) return false;
  return Boolean(inferredCandidate(state, port, peer, TOPOLOGY_EVIDENCE.TOLERANCE_INFERRED));
}

function unitBlockedDiagnostic(profile) {
  return Object.freeze({
    code: 'TOPOLOGY_TOLERANCE_UNIT_BLOCKED',
    severity: 'ERROR',
    scope: 'profile.lengthUnit',
    state: 'UNIT_BLOCKED',
    lengthUnit: profile.lengthUnit,
    message: 'Tolerance inference is blocked because the model length unit is unknown.',
  });
}
