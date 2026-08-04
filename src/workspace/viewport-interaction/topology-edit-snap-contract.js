import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { finiteTopologyEditPoint } from './topology-edit-interaction-values.js';

export const TOPOLOGY_EDIT_SNAP_QUERY_SCHEMA = 'TopologyEditSnapQuery.v1';
export const TOPOLOGY_EDIT_DETERMINISTIC_CANDIDATE_SCHEMA =
  'TopologyEditDeterministicSnapCandidate.v1';
export const TOPOLOGY_EDIT_SNAP_RESULT_SCHEMA = 'TopologyEditSnapResult.v1';

export const TOPOLOGY_EDIT_SNAP_KINDS = deepFreeze([
  'PORT',
  'NODE',
  'CENTERLINE',
  'MIDPOINT',
  'COLLINEAR',
  'ORTHOGONAL',
  'GRID',
]);

export const TOPOLOGY_EDIT_SNAP_COMPATIBILITY = deepFreeze([
  'EXACT',
  'ADAPTABLE',
  'INCOMPATIBLE',
]);

export const TOPOLOGY_EDIT_SNAP_RESULT_STATUSES = deepFreeze([
  'RESOLVED',
  'UNAVAILABLE',
  'STALE',
]);

const KIND_SET = new Set(TOPOLOGY_EDIT_SNAP_KINDS);
const COMPATIBILITY_SET = new Set(TOPOLOGY_EDIT_SNAP_COMPATIBILITY);
const RESULT_STATUS_SET = new Set(TOPOLOGY_EDIT_SNAP_RESULT_STATUSES);
const CONSTRAINT_SET = new Set([
  'FREE',
  'AXIS_X',
  'AXIS_Y',
  'AXIS_Z',
  'PLANE_XY',
  'PLANE_YZ',
  'PLANE_XZ',
]);
const CANONICAL_ID = /^(?:node|edge|junction|support|boundary|rigid):[^\s]+$/u;

export function createTopologyEditSnapQuery(input = {}) {
  const enabledKinds = normalizeKinds(
    input.enabledKinds ?? TOPOLOGY_EDIT_SNAP_KINDS,
    'enabledKinds',
    false,
  );
  const priorityKinds = normalizeKinds(
    input.priorityKinds ?? enabledKinds,
    'priorityKinds',
    false,
  );
  for (const kind of enabledKinds) {
    if (!priorityKinds.includes(kind)) {
      fail(`priorityKinds must include enabled kind ${kind}.`, RangeError);
    }
  }
  const acquireRadiusPx = positiveNumber(
    input.acquireRadiusPx ?? 10,
    'acquireRadiusPx',
  );
  const releaseRadiusPx = positiveNumber(
    input.releaseRadiusPx ?? 14,
    'releaseRadiusPx',
  );
  if (releaseRadiusPx < acquireRadiusPx) {
    fail('releaseRadiusPx must be greater than or equal to acquireRadiusPx.', RangeError);
  }
  const material = {
    schema: TOPOLOGY_EDIT_SNAP_QUERY_SCHEMA,
    queryId: requiredText(input.queryId, 'queryId'),
    interactionId: requiredText(input.interactionId, 'interactionId'),
    datasetSourceHash: requiredText(input.datasetSourceHash, 'datasetSourceHash'),
    basisHash: requiredText(input.basisHash, 'basisHash'),
    sessionVersion: nonNegativeInteger(input.sessionVersion, 'sessionVersion'),
    selectionRevision: nonNegativeInteger(
      input.selectionRevision,
      'selectionRevision',
    ),
    querySequence: nonNegativeInteger(input.querySequence, 'querySequence'),
    pointerScreen: screenPoint(input.pointerScreen, 'pointerScreen'),
    rawWorldPoint: finiteTopologyEditPoint(input.rawWorldPoint, 'rawWorldPoint'),
    camera: cameraSnapshot(input.camera),
    constraint: constraintSnapshot(input.constraint),
    enabledKinds,
    priorityKinds,
    excludedCanonicalIds: canonicalIds(
      input.excludedCanonicalIds ?? [],
      'excludedCanonicalIds',
    ),
    hiddenCanonicalIds: canonicalIds(
      input.hiddenCanonicalIds ?? [],
      'hiddenCanonicalIds',
    ),
    lockedCanonicalIds: canonicalIds(
      input.lockedCanonicalIds ?? [],
      'lockedCanonicalIds',
    ),
    acquireRadiusPx,
    releaseRadiusPx,
    gridSpacingMm: positiveNumber(input.gridSpacingMm ?? 100, 'gridSpacingMm'),
    activeCandidateId: optionalText(input.activeCandidateId),
    cycleIndex: nonNegativeInteger(input.cycleIndex ?? 0, 'cycleIndex'),
  };
  return deepFreeze({ ...material, queryHash: semanticHash(material) });
}

export function assertTopologyEditSnapQuery(value) {
  if (value?.schema !== TOPOLOGY_EDIT_SNAP_QUERY_SCHEMA) {
    fail('A valid topology-edit snap query is required.');
  }
  const normalized = createTopologyEditSnapQuery(value);
  if (normalized.queryHash !== value.queryHash) {
    fail('Topology-edit snap query differs from normalized authority.', RangeError);
  }
  return value;
}

export function createTopologyEditDeterministicSnapCandidate(input = {}) {
  const kind = snapKind(input.kind, 'kind');
  const canonicalTargetIds = canonicalIds(
    input.canonicalTargetIds ?? [],
    'canonicalTargetIds',
  );
  const compatibility = compatibilityValue(
    input.compatibility ?? 'EXACT',
  );
  const sourceFeatureId = requiredText(input.sourceFeatureId, 'sourceFeatureId');
  const stableTieBreaker = requiredText(
    input.stableTieBreaker
      ?? [kind, canonicalTargetIds.join(','), sourceFeatureId, input.variant ?? ''].join('|'),
    'stableTieBreaker',
  );
  const identityMaterial = {
    kind,
    canonicalTargetIds,
    sourceFeatureId,
    variant: optionalText(input.variant),
    stableTieBreaker,
  };
  const candidateIdentityHash = semanticHash(identityMaterial);
  const material = {
    schema: TOPOLOGY_EDIT_DETERMINISTIC_CANDIDATE_SCHEMA,
    candidateId: `snap:${candidateIdentityHash.split(':').at(-1)}`,
    candidateIdentityHash,
    kind,
    canonicalTargetIds,
    worldPoint: finiteTopologyEditPoint(input.worldPoint, 'worldPoint'),
    screenDistancePx: nonNegativeNumber(
      input.screenDistancePx,
      'screenDistancePx',
    ),
    worldDistanceMm: nonNegativeNumber(
      input.worldDistanceMm,
      'worldDistanceMm',
    ),
    constraintError: nonNegativeNumber(
      input.constraintError ?? 0,
      'constraintError',
    ),
    compatibility,
    priority: nonNegativeInteger(input.priority, 'priority'),
    stableTieBreaker,
    sourceFeatureId,
    variant: optionalText(input.variant),
    label: optionalText(input.label) ?? kind,
  };
  return deepFreeze({ ...material, candidateHash: semanticHash(material) });
}

export function assertTopologyEditDeterministicSnapCandidate(value) {
  if (value?.schema !== TOPOLOGY_EDIT_DETERMINISTIC_CANDIDATE_SCHEMA) {
    fail('A valid deterministic topology-edit snap candidate is required.');
  }
  const normalized = createTopologyEditDeterministicSnapCandidate(value);
  if (normalized.candidateHash !== value.candidateHash) {
    fail('Topology-edit snap candidate differs from normalized authority.', RangeError);
  }
  return value;
}

export function createTopologyEditSnapResult(input = {}) {
  const status = enumValue(
    input.status,
    RESULT_STATUS_SET,
    'status',
  );
  const candidate = input.candidate
    ? assertTopologyEditDeterministicSnapCandidate(input.candidate)
    : null;
  if (status === 'RESOLVED' && !candidate) {
    fail('Resolved snap result requires a candidate.', RangeError);
  }
  if (status !== 'RESOLVED' && candidate) {
    fail(`${status} snap result must not include a candidate.`, RangeError);
  }
  const material = {
    schema: TOPOLOGY_EDIT_SNAP_RESULT_SCHEMA,
    status,
    queryId: requiredText(input.queryId, 'queryId'),
    interactionId: requiredText(input.interactionId, 'interactionId'),
    datasetSourceHash: requiredText(input.datasetSourceHash, 'datasetSourceHash'),
    basisHash: requiredText(input.basisHash, 'basisHash'),
    sessionVersion: nonNegativeInteger(input.sessionVersion, 'sessionVersion'),
    selectionRevision: nonNegativeInteger(
      input.selectionRevision,
      'selectionRevision',
    ),
    querySequence: nonNegativeInteger(input.querySequence, 'querySequence'),
    queryHash: requiredText(input.queryHash, 'queryHash'),
    candidate,
    candidateId: candidate?.candidateId ?? null,
    kind: candidate?.kind ?? null,
    targetIds: candidate?.canonicalTargetIds ?? deepFreeze([]),
    snappedWorldPoint: candidate?.worldPoint ?? null,
    compatibility: candidate?.compatibility ?? null,
    score: scoreTuple(input.score ?? []),
    candidateCount: nonNegativeInteger(
      input.candidateCount ?? 0,
      'candidateCount',
    ),
    candidateSetHash: requiredText(
      input.candidateSetHash,
      'candidateSetHash',
    ),
    cycleIndex: nonNegativeInteger(input.cycleIndex ?? 0, 'cycleIndex'),
    retainedByHysteresis: Boolean(input.retainedByHysteresis),
    queryStats: queryStatistics(input.queryStats),
    staleFields: textArray(input.staleFields ?? [], 'staleFields'),
  };
  return deepFreeze({ ...material, resultHash: semanticHash(material) });
}

export function assertTopologyEditSnapResult(value) {
  if (value?.schema !== TOPOLOGY_EDIT_SNAP_RESULT_SCHEMA) {
    fail('A valid topology-edit snap result is required.');
  }
  const normalized = createTopologyEditSnapResult(value);
  if (normalized.resultHash !== value.resultHash) {
    fail('Topology-edit snap result differs from normalized authority.', RangeError);
  }
  return value;
}

export function topologyEditSnapResultStaleFields(resultInput, identity = {}) {
  const result = assertTopologyEditSnapResult(resultInput);
  const fields = [];
  compareIdentity(fields, 'datasetSourceHash', result, identity);
  compareIdentity(fields, 'basisHash', result, identity);
  compareIdentity(fields, 'sessionVersion', result, identity);
  compareIdentity(fields, 'selectionRevision', result, identity);
  compareIdentity(fields, 'interactionId', result, identity);
  compareIdentity(fields, 'queryId', result, identity);
  compareIdentity(fields, 'querySequence', result, identity);
  return deepFreeze(fields);
}

export function acceptTopologyEditSnapResult(resultInput, identity = {}) {
  const result = assertTopologyEditSnapResult(resultInput);
  const staleFields = topologyEditSnapResultStaleFields(result, identity);
  return deepFreeze({
    disposition: staleFields.length ? 'STALE' : 'ACCEPTED',
    staleFields,
    result: staleFields.length ? null : result,
  });
}

export function topologyEditSnapCandidateSetHash(candidates) {
  if (!Array.isArray(candidates)) fail('candidates must be an array.');
  const material = candidates
    .map(assertTopologyEditDeterministicSnapCandidate)
    .map((candidate) => candidate.candidateId)
    .sort(compareText);
  return semanticHash(material);
}

function cameraSnapshot(input = {}) {
  const projectionType = enumValue(
    String(input.projectionType ?? '').toUpperCase(),
    new Set(['PERSPECTIVE', 'ORTHOGRAPHIC']),
    'camera.projectionType',
  );
  const viewportWidthPx = positiveNumber(
    input.viewportWidthPx,
    'camera.viewportWidthPx',
  );
  const viewportHeightPx = positiveNumber(
    input.viewportHeightPx,
    'camera.viewportHeightPx',
  );
  const result = {
    projectionType,
    position: finiteTopologyEditPoint(input.position, 'camera.position'),
    forward: normalizedVector(input.forward, 'camera.forward'),
    viewportWidthPx,
    viewportHeightPx,
    devicePixelRatio: positiveNumber(
      input.devicePixelRatio ?? 1,
      'camera.devicePixelRatio',
    ),
    viewProjectionMatrix: matrix16(
      input.viewProjectionMatrix,
      'camera.viewProjectionMatrix',
    ),
    fovYDeg: null,
    orthoHeightMm: null,
  };
  if (projectionType === 'PERSPECTIVE') {
    result.fovYDeg = positiveNumber(input.fovYDeg, 'camera.fovYDeg');
    if (!(result.fovYDeg < 180)) {
      fail('camera.fovYDeg must be less than 180.', RangeError);
    }
  } else {
    result.orthoHeightMm = positiveNumber(
      input.orthoHeightMm,
      'camera.orthoHeightMm',
    );
  }
  return deepFreeze(result);
}

function constraintSnapshot(input = {}) {
  const mode = enumValue(
    String(input.mode ?? 'FREE').toUpperCase(),
    CONSTRAINT_SET,
    'constraint.mode',
  );
  return deepFreeze({
    mode,
    anchorWorld: finiteTopologyEditPoint(
      input.anchorWorld ?? { x: 0, y: 0, z: 0 },
      'constraint.anchorWorld',
    ),
  });
}

function queryStatistics(input = {}) {
  return deepFreeze({
    pointCellsVisited: nonNegativeInteger(
      input.pointCellsVisited ?? 0,
      'queryStats.pointCellsVisited',
    ),
    segmentCellsVisited: nonNegativeInteger(
      input.segmentCellsVisited ?? 0,
      'queryStats.segmentCellsVisited',
    ),
    sourceFeaturesVisited: nonNegativeInteger(
      input.sourceFeaturesVisited ?? 0,
      'queryStats.sourceFeaturesVisited',
    ),
    candidatesGenerated: nonNegativeInteger(
      input.candidatesGenerated ?? 0,
      'queryStats.candidatesGenerated',
    ),
  });
}

function compareIdentity(fields, field, result, identity) {
  if (identity[field] !== result[field]) fields.push(field);
}

function normalizeKinds(value, label, allowEmpty = true) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  const result = [];
  const seen = new Set();
  value.forEach((row, index) => {
    const kind = snapKind(row, `${label}[${index}]`);
    if (!seen.has(kind)) {
      seen.add(kind);
      result.push(kind);
    }
  });
  if (!allowEmpty && !result.length) fail(`${label} must not be empty.`, RangeError);
  return deepFreeze(result);
}

function snapKind(value, label) {
  return enumValue(String(value ?? '').toUpperCase(), KIND_SET, label);
}

function compatibilityValue(value) {
  return enumValue(
    String(value ?? '').toUpperCase(),
    COMPATIBILITY_SET,
    'compatibility',
  );
}

function canonicalIds(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  const result = value.map((row, index) => {
    const id = requiredText(row, `${label}[${index}]`);
    if (!CANONICAL_ID.test(id)) {
      fail(`${label}[${index}] must be an exact canonical ID.`, RangeError);
    }
    return id;
  });
  return deepFreeze([...new Set(result)].sort(compareText));
}

function screenPoint(value, label) {
  return deepFreeze({
    x: finiteNumber(value?.x, `${label}.x`),
    y: finiteNumber(value?.y, `${label}.y`),
  });
}

function matrix16(value, label) {
  if (!Array.isArray(value) || value.length !== 16) {
    fail(`${label} must contain 16 finite values.`);
  }
  return deepFreeze(value.map((row, index) => finiteNumber(row, `${label}[${index}]`)));
}

function normalizedVector(value, label) {
  const point = finiteTopologyEditPoint(value, label);
  const length = Math.hypot(point.x, point.y, point.z);
  if (!(length > 0)) fail(`${label} must be non-zero.`, RangeError);
  return deepFreeze({
    x: point.x / length,
    y: point.y / length,
    z: point.z / length,
  });
}

function scoreTuple(value) {
  if (!Array.isArray(value)) fail('score must be an array.');
  return deepFreeze(value.map((row, index) => {
    if (typeof row === 'number') return finiteNumber(row, `score[${index}]`);
    return requiredText(row, `score[${index}]`);
  }));
}

function textArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  return deepFreeze(value.map((row, index) => requiredText(row, `${label}[${index}]`)));
}

function enumValue(value, allowed, label) {
  if (!allowed.has(value)) {
    fail(`${label} must be one of ${[...allowed].join(', ')}.`, RangeError);
  }
  return value;
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}

function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    fail(`${label} must be a non-negative integer.`, RangeError);
  }
  return number;
}

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  if (!(number > 0)) fail(`${label} must be positive.`, RangeError);
  return number;
}

function nonNegativeNumber(value, label) {
  const number = finiteNumber(value, label);
  if (number < 0) fail(`${label} must be non-negative.`, RangeError);
  return number;
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) fail(`${label} must be finite.`, RangeError);
  return number;
}

function compareText(left, right) {
  return left.localeCompare(right);
}

function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditSnapContract: ${message}`);
}
