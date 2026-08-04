import { semanticHash } from '../../core/shared-piping-model/index.js';
import {
  acceptTopologyEditSnapResult,
  assertTopologyEditSnapQuery,
  createTopologyEditDeterministicSnapCandidate,
  createTopologyEditSnapResult,
  topologyEditSnapCandidateSetHash,
} from './topology-edit-snap-contract.js';
import {
  assertTopologyEditSnapSpatialIndex,
  queryTopologyEditSnapSpatialIndex,
} from './topology-edit-snap-spatial-index.js';

const COMPATIBILITY_RANK = Object.freeze({ EXACT: 0, ADAPTABLE: 1 });
const GEOMETRY_EPSILON_MM = 1e-7;
const SCORE_PRECISION = 1e6;

export function resolveTopologyEditDeterministicSnap(input = {}) {
  const query = assertTopologyEditSnapQuery(input.query);
  const index = assertTopologyEditSnapSpatialIndex(input.index);
  if (index.basisHash !== query.basisHash) {
    return staleResult(query, ['basisHash']);
  }
  const expectedIdentity = input.expectedIdentity ?? null;
  if (expectedIdentity) {
    const staleFields = queryIdentityStaleFields(query, expectedIdentity);
    if (staleFields.length) return staleResult(query, staleFields);
  }
  const radiusMm = topologyEditSnapWorldRadius(query);
  const corridor = queryTopologyEditSnapSpatialIndex(index, {
    centerWorld: query.rawWorldPoint,
    radiusMm,
  });
  const generated = generateCandidates(query, corridor);
  const deduplicated = deduplicateCandidates(generated);
  const eligible = deduplicated
    .filter((candidate) => candidate.compatibility !== 'INCOMPATIBLE')
    .filter((candidate) => candidate.screenDistancePx <= candidateRadius(query, candidate))
    .sort(compareCandidates);
  const candidateSetHash = topologyEditSnapCandidateSetHash(eligible);
  const queryStats = {
    ...corridor.statistics,
    candidatesGenerated: generated.length,
  };
  if (!eligible.length) {
    return createTopologyEditSnapResult({
      status: 'UNAVAILABLE',
      ...queryIdentity(query),
      queryHash: query.queryHash,
      candidate: null,
      score: [],
      candidateCount: 0,
      candidateSetHash,
      cycleIndex: 0,
      retainedByHysteresis: false,
      queryStats,
      staleFields: [],
    });
  }
  const activeIndex = query.activeCandidateId
    ? eligible.findIndex((candidate) => candidate.candidateId === query.activeCandidateId)
    : -1;
  const ordered = activeIndex > 0
    ? [eligible[activeIndex], ...eligible.filter((_, indexValue) => indexValue !== activeIndex)]
    : eligible;
  const cycleIndex = query.cycleIndex % ordered.length;
  const selected = ordered[cycleIndex];
  const retainedByHysteresis = Boolean(
    query.activeCandidateId
    && selected.candidateId === query.activeCandidateId
    && selected.screenDistancePx > query.acquireRadiusPx
    && selected.screenDistancePx <= query.releaseRadiusPx,
  );
  return createTopologyEditSnapResult({
    status: 'RESOLVED',
    ...queryIdentity(query),
    queryHash: query.queryHash,
    candidate: selected,
    score: candidateScore(selected),
    candidateCount: ordered.length,
    candidateSetHash,
    cycleIndex,
    retainedByHysteresis,
    queryStats,
    staleFields: [],
  });
}

export function acceptResolvedTopologyEditSnap(result, identity) {
  return acceptTopologyEditSnapResult(result, identity);
}

export function topologyEditSnapWorldRadius(queryInput) {
  const query = assertTopologyEditSnapQuery(queryInput);
  const unitsPerPixel = topologyEditWorldUnitsPerPixel(
    query.camera,
    query.rawWorldPoint,
  );
  return Math.max(
    query.releaseRadiusPx * unitsPerPixel * 1.25,
    GEOMETRY_EPSILON_MM,
  );
}

export function topologyEditWorldUnitsPerPixel(camera, worldPoint) {
  if (camera.projectionType === 'ORTHOGRAPHIC') {
    return camera.orthoHeightMm / camera.viewportHeightPx;
  }
  const delta = subtract(worldPoint, camera.position);
  const depthMm = Math.max(dot(delta, camera.forward), GEOMETRY_EPSILON_MM);
  return (2 * depthMm * Math.tan((camera.fovYDeg * Math.PI / 180) / 2))
    / camera.viewportHeightPx;
}

export function projectTopologyEditWorldToScreen(camera, worldPoint) {
  const matrix = camera.viewProjectionMatrix;
  const x = worldPoint.x;
  const y = worldPoint.y;
  const z = worldPoint.z;
  const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  const clipW = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  if (!(clipW > 0) || !Number.isFinite(clipW)) return null;
  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) return null;
  return {
    x: ((ndcX + 1) / 2) * camera.viewportWidthPx,
    y: ((1 - ndcY) / 2) * camera.viewportHeightPx,
  };
}

function generateCandidates(query, corridor) {
  const candidates = [];
  const excluded = new Set(query.excludedCanonicalIds);
  const hidden = new Set(query.hiddenCanonicalIds);
  const locked = new Set(query.lockedCanonicalIds);
  const enabled = new Set(query.enabledKinds);
  const priority = new Map(query.priorityKinds.map((kind, index) => [kind, index]));
  const featureAllowed = (feature) => (
    !feature.hidden
    && !feature.locked
    && !feature.canonicalTargetIds.some((id) => (
      excluded.has(id) || hidden.has(id) || locked.has(id)
    ))
  );

  for (const feature of corridor.pointFeatures) {
    if (!featureAllowed(feature)) continue;
    if (enabled.has(feature.kind)) {
      addDirectCandidate(candidates, query, priority, {
        kind: feature.kind,
        canonicalTargetIds: feature.canonicalTargetIds,
        sourceFeatureId: feature.featureId,
        sourceWorldPoint: feature.worldPoint,
        compatibility: feature.compatibility,
        label: feature.label,
        variant: 'DIRECT',
      });
    }
    if (enabled.has('ORTHOGONAL')) {
      for (const row of orthogonalPoints(query.rawWorldPoint, feature.worldPoint)) {
        addCandidate(candidates, query, priority, {
          kind: 'ORTHOGONAL',
          canonicalTargetIds: feature.canonicalTargetIds,
          sourceFeatureId: feature.featureId,
          sourceWorldPoint: row.worldPoint,
          compatibility: feature.compatibility,
          label: `Orthogonal ${row.axis}`,
          variant: row.axis,
          permitConstraintProjection: true,
        });
      }
    }
  }

  for (const feature of corridor.segmentFeatures) {
    if (!featureAllowed(feature)) continue;
    if (enabled.has('CENTERLINE')) {
      addDirectCandidate(candidates, query, priority, {
        kind: 'CENTERLINE',
        canonicalTargetIds: feature.canonicalTargetIds,
        sourceFeatureId: feature.featureId,
        sourceWorldPoint: closestSegmentPoint(
          query.rawWorldPoint,
          feature.start,
          feature.end,
        ),
        compatibility: feature.compatibility,
        label: feature.label,
        variant: 'SEGMENT',
      });
    }
    if (enabled.has('MIDPOINT')) {
      addDirectCandidate(candidates, query, priority, {
        kind: 'MIDPOINT',
        canonicalTargetIds: feature.canonicalTargetIds,
        sourceFeatureId: feature.featureId,
        sourceWorldPoint: midpoint(feature.start, feature.end),
        compatibility: feature.compatibility,
        label: 'Edge midpoint',
        variant: 'MIDPOINT',
      });
    }
    if (enabled.has('COLLINEAR')) {
      addCandidate(candidates, query, priority, {
        kind: 'COLLINEAR',
        canonicalTargetIds: feature.canonicalTargetIds,
        sourceFeatureId: feature.featureId,
        sourceWorldPoint: closestLinePoint(
          query.rawWorldPoint,
          feature.start,
          feature.end,
        ),
        compatibility: feature.compatibility,
        label: 'Collinear extension',
        variant: 'INFINITE_LINE',
        permitConstraintProjection: true,
      });
    }
  }

  if (enabled.has('GRID')) {
    addCandidate(candidates, query, priority, {
      kind: 'GRID',
      canonicalTargetIds: [],
      sourceFeatureId: `grid:${query.gridSpacingMm}`,
      sourceWorldPoint: gridPoint(
        query.rawWorldPoint,
        query.constraint.anchorWorld,
        query.constraint.mode,
        query.gridSpacingMm,
      ),
      compatibility: 'EXACT',
      label: `${query.gridSpacingMm} mm grid`,
      variant: query.constraint.mode,
      permitConstraintProjection: true,
    });
  }
  return candidates;
}

function addDirectCandidate(target, query, priority, input) {
  addCandidate(target, query, priority, {
    ...input,
    permitConstraintProjection: query.constraint.mode === 'FREE',
  });
}

function addCandidate(target, query, priority, input) {
  const constrained = constrainPoint(
    input.sourceWorldPoint,
    query.constraint.anchorWorld,
    query.constraint.mode,
  );
  if (!input.permitConstraintProjection && constrained.errorMm > GEOMETRY_EPSILON_MM) {
    return;
  }
  const screen = projectTopologyEditWorldToScreen(query.camera, constrained.worldPoint);
  if (!screen) return;
  const screenDistancePx = Math.hypot(
    screen.x - query.pointerScreen.x,
    screen.y - query.pointerScreen.y,
  );
  const stableTieBreaker = [
    input.kind,
    input.canonicalTargetIds.join(','),
    input.sourceFeatureId,
    input.variant ?? '',
  ].join('|');
  target.push(createTopologyEditDeterministicSnapCandidate({
    kind: input.kind,
    canonicalTargetIds: input.canonicalTargetIds,
    worldPoint: constrained.worldPoint,
    screenDistancePx,
    worldDistanceMm: distance(query.rawWorldPoint, constrained.worldPoint),
    constraintError: constrained.errorMm,
    compatibility: input.compatibility,
    priority: priority.get(input.kind),
    stableTieBreaker,
    sourceFeatureId: input.sourceFeatureId,
    variant: input.variant,
    label: input.label,
  }));
}

function deduplicateCandidates(candidates) {
  const unique = new Map();
  for (const candidate of candidates) {
    const current = unique.get(candidate.candidateId);
    if (!current || compareCandidates(candidate, current) < 0) {
      unique.set(candidate.candidateId, candidate);
    }
  }
  return [...unique.values()];
}

function compareCandidates(left, right) {
  const leftScore = candidateScore(left);
  const rightScore = candidateScore(right);
  for (let index = 0; index < Math.max(leftScore.length, rightScore.length); index += 1) {
    const comparison = compareScoreValue(leftScore[index], rightScore[index]);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function candidateScore(candidate) {
  return [
    COMPATIBILITY_RANK[candidate.compatibility],
    candidate.priority,
    quantize(candidate.screenDistancePx),
    quantize(candidate.worldDistanceMm),
    quantize(candidate.constraintError),
    candidate.kind,
    candidate.canonicalTargetIds.join(',') || '~',
    candidate.stableTieBreaker,
    candidate.candidateId,
  ];
}

function candidateRadius(query, candidate) {
  return candidate.candidateId === query.activeCandidateId
    ? query.releaseRadiusPx
    : query.acquireRadiusPx;
}

function staleResult(query, staleFields) {
  return createTopologyEditSnapResult({
    status: 'STALE',
    ...queryIdentity(query),
    queryHash: query.queryHash,
    candidate: null,
    score: [],
    candidateCount: 0,
    candidateSetHash: semanticHash([]),
    cycleIndex: 0,
    retainedByHysteresis: false,
    queryStats: {},
    staleFields,
  });
}

function queryIdentity(query) {
  return {
    queryId: query.queryId,
    interactionId: query.interactionId,
    datasetSourceHash: query.datasetSourceHash,
    basisHash: query.basisHash,
    sessionVersion: query.sessionVersion,
    selectionRevision: query.selectionRevision,
    querySequence: query.querySequence,
  };
}

function queryIdentityStaleFields(query, identity) {
  return [
    'datasetSourceHash',
    'basisHash',
    'sessionVersion',
    'selectionRevision',
    'interactionId',
    'queryId',
    'querySequence',
  ].filter((field) => identity[field] !== query[field]);
}

function constrainPoint(point, anchor, mode) {
  if (mode === 'FREE') return { worldPoint: { ...point }, errorMm: 0 };
  const constrained = { ...point };
  if (mode === 'AXIS_X') {
    constrained.y = anchor.y;
    constrained.z = anchor.z;
  }
  if (mode === 'AXIS_Y') {
    constrained.x = anchor.x;
    constrained.z = anchor.z;
  }
  if (mode === 'AXIS_Z') {
    constrained.x = anchor.x;
    constrained.y = anchor.y;
  }
  if (mode === 'PLANE_XY') constrained.z = anchor.z;
  if (mode === 'PLANE_YZ') constrained.x = anchor.x;
  if (mode === 'PLANE_XZ') constrained.y = anchor.y;
  return { worldPoint: constrained, errorMm: distance(point, constrained) };
}

function orthogonalPoints(raw, target) {
  return [
    { axis: 'X', worldPoint: { x: target.x, y: raw.y, z: raw.z } },
    { axis: 'Y', worldPoint: { x: raw.x, y: target.y, z: raw.z } },
    { axis: 'Z', worldPoint: { x: raw.x, y: raw.y, z: target.z } },
  ].filter((row) => distance(raw, row.worldPoint) > GEOMETRY_EPSILON_MM);
}

function gridPoint(point, anchor, mode, size) {
  const result = {
    x: Math.round(point.x / size) * size,
    y: Math.round(point.y / size) * size,
    z: Math.round(point.z / size) * size,
  };
  if (mode === 'AXIS_X') return { x: result.x, y: anchor.y, z: anchor.z };
  if (mode === 'AXIS_Y') return { x: anchor.x, y: result.y, z: anchor.z };
  if (mode === 'AXIS_Z') return { x: anchor.x, y: anchor.y, z: result.z };
  if (mode === 'PLANE_XY') result.z = anchor.z;
  if (mode === 'PLANE_YZ') result.x = anchor.x;
  if (mode === 'PLANE_XZ') result.y = anchor.y;
  return result;
}

function closestSegmentPoint(point, start, end) {
  const segment = subtract(end, start);
  const lengthSquared = dot(segment, segment);
  if (!(lengthSquared > 0)) return { ...start };
  const parameter = Math.max(
    0,
    Math.min(1, dot(subtract(point, start), segment) / lengthSquared),
  );
  return add(start, scale(segment, parameter));
}

function closestLinePoint(point, start, end) {
  const segment = subtract(end, start);
  const lengthSquared = dot(segment, segment);
  if (!(lengthSquared > 0)) return { ...start };
  const parameter = dot(subtract(point, start), segment) / lengthSquared;
  return add(start, scale(segment, parameter));
}

function midpoint(left, right) {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
    z: (left.z + right.z) / 2,
  };
}

function quantize(value) {
  return Math.round(value * SCORE_PRECISION) / SCORE_PRECISION;
}

function compareScoreValue(left, right) {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function subtract(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}
function add(left, right) {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}
function scale(point, factor) {
  return { x: point.x * factor, y: point.y * factor, z: point.z * factor };
}
function dot(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}
function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}
