import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import {
  finiteTopologyEditPoint,
  nonNegativeTopologyEditNumber,
  requiredTopologyEditText,
  topologyEditPointDistance,
} from './topology-edit-interaction-values.js';
import {
  normalizeTopologyEditSnapCandidates,
} from './topology-edit-snap-candidates.js';

export const TOPOLOGY_EDIT_SNAP_RESOLUTION_SCHEMA =
  'TopologyEditSnapResolution.v1';

export const TOPOLOGY_EDIT_SNAP_STATUSES = Object.freeze({
  RESOLVED: 'RESOLVED',
  AMBIGUOUS: 'AMBIGUOUS',
  UNAVAILABLE: 'UNAVAILABLE',
  STALE_BASIS: 'STALE_BASIS',
});

const DISTANCE_EPSILON_MM = 1e-9;

export function resolveTopologyEditSnap(input = {}) {
  const basisHash = requiredTopologyEditText(input.basisHash, 'basisHash');
  const pointerPoint = finiteTopologyEditPoint(
    input.pointerPoint,
    'pointerPoint',
  );
  const toleranceMm = nonNegativeTopologyEditNumber(
    input.toleranceMm,
    'toleranceMm',
  );
  const candidates = normalizeTopologyEditSnapCandidates(input.candidates);
  const current = candidates.filter((row) => row.basisHash === basisHash);
  const staleCandidateCount = candidates.length - current.length;
  if (!current.length && candidates.length) {
    return finalize({
      status: TOPOLOGY_EDIT_SNAP_STATUSES.STALE_BASIS,
      basisHash,
      pointerPoint,
      toleranceMm,
      candidate: null,
      candidates: [],
      staleCandidateCount,
    });
  }
  const ranked = current
    .map((candidate) => deepFreeze({
      candidate,
      distanceMm: topologyEditPointDistance(
        pointerPoint,
        candidate.position,
      ),
    }))
    .filter((row) => row.distanceMm <= toleranceMm)
    .sort(compareRankedCandidates);
  if (!ranked.length) {
    return finalize({
      status: TOPOLOGY_EDIT_SNAP_STATUSES.UNAVAILABLE,
      basisHash,
      pointerPoint,
      toleranceMm,
      candidate: null,
      candidates: [],
      staleCandidateCount,
    });
  }
  const tied = ranked.filter((row) => equivalentRank(row, ranked[0]));
  if (tied.length > 1) {
    return finalize({
      status: TOPOLOGY_EDIT_SNAP_STATUSES.AMBIGUOUS,
      basisHash,
      pointerPoint,
      toleranceMm,
      candidate: null,
      candidates: tied,
      staleCandidateCount,
    });
  }
  return finalize({
    status: TOPOLOGY_EDIT_SNAP_STATUSES.RESOLVED,
    basisHash,
    pointerPoint,
    toleranceMm,
    candidate: ranked[0].candidate,
    candidates: [ranked[0]],
    staleCandidateCount,
  });
}

export function assertTopologyEditSnapResolution(value) {
  if (value?.schema !== TOPOLOGY_EDIT_SNAP_RESOLUTION_SCHEMA) {
    throw new TypeError('A valid topology-edit snap resolution is required.');
  }
  const material = resolutionMaterial(value);
  if (semanticHash(material) !== value.resolutionHash) {
    throw new RangeError(
      'Topology-edit snap resolution differs from normalized authority.',
    );
  }
  return value;
}

function compareRankedCandidates(left, right) {
  return left.candidate.priority - right.candidate.priority
    || left.distanceMm - right.distanceMm
    || String(left.candidate.targetCanonicalId ?? '')
      .localeCompare(String(right.candidate.targetCanonicalId ?? ''))
    || left.candidate.candidateHash.localeCompare(
      right.candidate.candidateHash,
    );
}

function equivalentRank(left, right) {
  return left.candidate.priority === right.candidate.priority
    && Math.abs(left.distanceMm - right.distanceMm)
      <= DISTANCE_EPSILON_MM;
}

function finalize(input) {
  const material = resolutionMaterial({
    schema: TOPOLOGY_EDIT_SNAP_RESOLUTION_SCHEMA,
    ...input,
  });
  return deepFreeze({
    ...material,
    resolutionHash: semanticHash(material),
  });
}

function resolutionMaterial(value) {
  return {
    schema: TOPOLOGY_EDIT_SNAP_RESOLUTION_SCHEMA,
    status: value.status,
    basisHash: value.basisHash,
    pointerPoint: value.pointerPoint,
    toleranceMm: value.toleranceMm,
    candidate: value.candidate,
    candidates: value.candidates,
    staleCandidateCount: value.staleCandidateCount,
  };
}
