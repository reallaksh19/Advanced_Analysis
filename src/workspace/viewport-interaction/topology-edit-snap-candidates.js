import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import {
  finiteTopologyEditPoint,
  optionalTopologyEditText,
  requiredTopologyEditText,
} from './topology-edit-interaction-values.js';

export const TOPOLOGY_EDIT_SNAP_CANDIDATE_SCHEMA =
  'TopologyEditSnapCandidate.v1';

export const TOPOLOGY_EDIT_SNAP_EVIDENCE = Object.freeze({
  EXPLICIT_TARGET: 'EXPLICIT_TARGET',
  ENDPOINT: 'ENDPOINT',
  SOURCE_DATUM: 'SOURCE_DATUM',
  AXIS_PROJECTION: 'AXIS_PROJECTION',
  PLANE_PROJECTION: 'PLANE_PROJECTION',
  MIDPOINT: 'MIDPOINT',
  CENTERLINE: 'CENTERLINE',
  GRID: 'GRID',
});

const PRIORITY = Object.freeze({
  EXPLICIT_TARGET: 10,
  ENDPOINT: 20,
  SOURCE_DATUM: 30,
  AXIS_PROJECTION: 40,
  PLANE_PROJECTION: 40,
  MIDPOINT: 50,
  CENTERLINE: 50,
  GRID: 60,
});

const IDENTITY_EVIDENCE = new Set([
  'EXPLICIT_TARGET',
  'ENDPOINT',
  'SOURCE_DATUM',
  'MIDPOINT',
  'CENTERLINE',
]);

export function createTopologyEditSnapCandidate(input = {}) {
  const evidenceType = requiredTopologyEditText(
    input.evidenceType,
    'evidenceType',
  ).toUpperCase();
  if (!Object.hasOwn(PRIORITY, evidenceType)) {
    throw new RangeError(`Unsupported snap evidence type ${evidenceType}.`);
  }
  const targetCanonicalId = optionalTopologyEditText(input.targetCanonicalId);
  if (targetCanonicalId
      && !/^(?:node|edge|junction|support|datum):[^\s]+$/.test(targetCanonicalId)) {
    throw new TypeError(
      'targetCanonicalId must be an exact canonical identity.',
    );
  }
  if (IDENTITY_EVIDENCE.has(evidenceType) && !targetCanonicalId) {
    throw new TypeError(
      `${evidenceType} snap evidence requires targetCanonicalId.`,
    );
  }
  const material = {
    schema: TOPOLOGY_EDIT_SNAP_CANDIDATE_SCHEMA,
    basisHash: requiredTopologyEditText(input.basisHash, 'basisHash'),
    evidenceType,
    priority: PRIORITY[evidenceType],
    position: finiteTopologyEditPoint(input.position, 'position'),
    targetCanonicalId,
    sourceEvidenceId: optionalTopologyEditText(input.sourceEvidenceId),
    label: optionalTopologyEditText(input.label) ?? evidenceType,
  };
  const candidateHash = semanticHash(material);
  return deepFreeze({
    ...material,
    candidateId: `snap:${candidateHash.split(':').at(-1)}`,
    candidateHash,
  });
}

export function normalizeTopologyEditSnapCandidates(values) {
  if (!Array.isArray(values)) {
    throw new TypeError('candidates must be an array.');
  }
  const candidates = values.map((value) =>
    createTopologyEditSnapCandidate(value));
  const unique = new Map();
  for (const candidate of candidates) {
    unique.set(candidate.candidateHash, candidate);
  }
  return deepFreeze(
    [...unique.values()].sort((left, right) =>
      left.candidateHash.localeCompare(right.candidateHash)),
  );
}
