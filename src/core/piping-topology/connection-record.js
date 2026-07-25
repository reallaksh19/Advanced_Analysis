import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { TOPOLOGY_EVIDENCE } from './constants.js';

const BASE_CONFIDENCE = Object.freeze({
  [TOPOLOGY_EVIDENCE.EXPLICIT_CONNECTION_REFERENCE]: 1,
  [TOPOLOGY_EVIDENCE.SHARED_SOURCE_ENDPOINT_IDENTITY]: 0.96,
  [TOPOLOGY_EVIDENCE.EXACT_COORDINATE]: 0.9,
  [TOPOLOGY_EVIDENCE.TOLERANCE_INFERRED]: 0.72,
});

export function createConnection(portA, portB, evidenceType, compatibility, options = {}) {
  const [left, right] = [portA, portB].sort((a, b) => a.portKey.localeCompare(b.portKey));
  const distanceCanonical = portDistanceCanonical(left, right);
  const base = {
    connectionId: stableConnectionId(left.portKey, right.portKey),
    portAKey: left.portKey,
    portBKey: right.portKey,
    evidenceType,
    distanceCanonical,
    confidence: connectionConfidence(evidenceType, compatibility, distanceCanonical, options.toleranceCanonical),
    identityCompatibility: compatibility,
    alternativeCandidatePortKeys: [...new Set(options.alternatives || [])].sort(),
    diagnostics: [...(options.diagnostics || [])].sort(diagnosticOrder),
  };
  return deepFreeze(base);
}

export function stableConnectionId(portAKey, portBKey) {
  const pair = [portAKey, portBKey].sort();
  return `connection-${semanticHash(pair).split(':')[1]}`;
}

export function pairKey(portAKey, portBKey) {
  return [portAKey, portBKey].sort().join('\u0000');
}

export function portDistanceCanonical(portA, portB) {
  const left = portA.positionCanonical;
  const right = portB.positionCanonical;
  if (left && right) return round12(distance(left, right));
  if (sameRawPosition(portA, portB)) return 0;
  return null;
}

export function exactCoordinateKey(port) {
  const point = port.positionCanonical || port.position;
  if (!point) return '';
  const prefix = port.positionCanonical ? 'mm' : `raw:${port.coordinateEvidence.sourceUnit}`;
  return `${prefix}|${numberKey(point.x)}|${numberKey(point.y)}|${numberKey(point.z)}`;
}

function connectionConfidence(evidenceType, compatibility, distanceCanonical, toleranceCanonical) {
  let score = BASE_CONFIDENCE[evidenceType] ?? 0;
  score += Math.min(compatibility.matchCount || 0, 2) * 0.01;
  if (evidenceType === TOPOLOGY_EVIDENCE.TOLERANCE_INFERRED && toleranceCanonical > 0) {
    score -= Math.min((distanceCanonical || 0) / toleranceCanonical, 1) * 0.2;
  }
  return Math.max(0, Math.min(1, round6(score)));
}

function sameRawPosition(portA, portB) {
  if (!portA.position || !portB.position) return false;
  return portA.coordinateEvidence.sourceUnit === portB.coordinateEvidence.sourceUnit
    && portA.position.x === portB.position.x
    && portA.position.y === portB.position.y
    && portA.position.z === portB.position.z;
}

function distance(left, right) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  const dz = left.z - right.z;
  return Math.hypot(dx, dy, dz);
}

function numberKey(value) {
  return Object.is(value, -0) ? '0' : Number(value).toString();
}

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

function round12(value) {
  return Math.round(value * 1e12) / 1e12;
}

function diagnosticOrder(left, right) {
  return `${left.code}|${left.scope}`.localeCompare(`${right.code}|${right.scope}`);
}
