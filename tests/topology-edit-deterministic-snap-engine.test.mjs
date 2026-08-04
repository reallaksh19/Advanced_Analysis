import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acceptTopologyEditSnapResult,
  createTopologyEditSnapQuery,
} from '../src/workspace/viewport-interaction/topology-edit-snap-contract.js';
import {
  projectTopologyEditWorldToScreen,
  resolveTopologyEditDeterministicSnap,
} from '../src/workspace/viewport-interaction/topology-edit-deterministic-snap-engine.js';
import {
  createTopologyEditSnapSpatialIndex,
} from '../src/workspace/viewport-interaction/topology-edit-snap-spatial-index.js';

const IDENTITY = Object.freeze({
  datasetSourceHash: 'source:phase-b',
  basisHash: 'basis:phase-b',
  sessionVersion: 7,
  selectionRevision: 3,
  interactionId: 'interaction:drag-1',
});

function topology(nodes, edges = []) {
  return {
    canonicalTopologyHash: IDENTITY.basisHash,
    nodes,
    edges,
  };
}

function node(id, x, y = 0, z = 0, portKeys = []) {
  return { id, position: { x, y, z }, portKeys };
}

function orthographicCamera({
  worldHeightMm = 200,
  widthPx = 1000,
  heightPx = 1000,
} = {}) {
  const xScale = 2 / worldHeightMm;
  const yScale = 2 / worldHeightMm;
  return {
    projectionType: 'ORTHOGRAPHIC',
    position: { x: 0, y: 0, z: 100 },
    forward: { x: 0, y: 0, z: -1 },
    viewportWidthPx: widthPx,
    viewportHeightPx: heightPx,
    devicePixelRatio: 1,
    viewProjectionMatrix: [
      xScale, 0, 0, 0,
      0, yScale, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ],
    orthoHeightMm: worldHeightMm,
  };
}

function perspectiveCamera() {
  return {
    projectionType: 'PERSPECTIVE',
    position: { x: 0, y: 0, z: 0 },
    forward: { x: 0, y: 0, z: 1 },
    viewportWidthPx: 1000,
    viewportHeightPx: 1000,
    devicePixelRatio: 1,
    viewProjectionMatrix: [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 1,
      0, 0, 0, 0,
    ],
    fovYDeg: 90,
  };
}

function query({
  rawWorldPoint = { x: 0, y: 0, z: 0 },
  camera = orthographicCamera(),
  enabledKinds = ['PORT', 'NODE', 'CENTERLINE', 'MIDPOINT', 'COLLINEAR', 'ORTHOGONAL', 'GRID'],
  priorityKinds = enabledKinds,
  excludedCanonicalIds = [],
  hiddenCanonicalIds = [],
  lockedCanonicalIds = [],
  acquireRadiusPx = 10,
  releaseRadiusPx = 14,
  activeCandidateId = null,
  cycleIndex = 0,
  queryId = 'query:1',
  querySequence = 1,
  constraint = { mode: 'FREE', anchorWorld: { x: 0, y: 0, z: 0 } },
  gridSpacingMm = 1,
} = {}) {
  const pointerScreen = projectTopologyEditWorldToScreen(camera, rawWorldPoint);
  if (!pointerScreen) throw new Error('Test pointer is not projectable.');
  return createTopologyEditSnapQuery({
    ...IDENTITY,
    queryId,
    querySequence,
    pointerScreen,
    rawWorldPoint,
    camera,
    constraint,
    enabledKinds,
    priorityKinds,
    excludedCanonicalIds,
    hiddenCanonicalIds,
    lockedCanonicalIds,
    acquireRadiusPx,
    releaseRadiusPx,
    activeCandidateId,
    cycleIndex,
    gridSpacingMm,
  });
}

function resolve(index, queryValue, expectedIdentity = null) {
  return resolveTopologyEditDeterministicSnap({
    index,
    query: queryValue,
    expectedIdentity: expectedIdentity ?? {
      ...IDENTITY,
      queryId: queryValue.queryId,
      querySequence: queryValue.querySequence,
    },
  });
}

test('query and result identities reject stale asynchronous delivery', () => {
  const index = createTopologyEditSnapSpatialIndex({
    topology: topology([node('node:a', 1)]),
  });
  const snapQuery = query({ enabledKinds: ['NODE'] });
  const result = resolve(index, snapQuery);
  assert.equal(result.status, 'RESOLVED');
  assert.equal(Object.isFrozen(result), true);
  const accepted = acceptTopologyEditSnapResult(result, {
    ...IDENTITY,
    queryId: snapQuery.queryId,
    querySequence: snapQuery.querySequence,
  });
  assert.equal(accepted.disposition, 'ACCEPTED');
  const stale = acceptTopologyEditSnapResult(result, {
    ...IDENTITY,
    selectionRevision: IDENTITY.selectionRevision + 1,
    queryId: snapQuery.queryId,
    querySequence: snapQuery.querySequence,
  });
  assert.equal(stale.disposition, 'STALE');
  assert.deepEqual(stale.staleFields, ['selectionRevision']);
});

test('candidate ordering and exact ties are deterministic under source reordering', () => {
  const nodes = [node('node:right', 1), node('node:left', -1)];
  const leftIndex = createTopologyEditSnapSpatialIndex({ topology: topology(nodes) });
  const rightIndex = createTopologyEditSnapSpatialIndex({
    topology: topology([...nodes].reverse()),
  });
  const snapQuery = query({ enabledKinds: ['NODE'] });
  const left = resolve(leftIndex, snapQuery);
  const right = resolve(rightIndex, snapQuery);
  assert.equal(left.status, 'RESOLVED');
  assert.equal(left.candidate.canonicalTargetIds[0], 'node:left');
  assert.equal(left.resultHash, right.resultHash);
});

test('compatible port outranks a coincident node by operation priority', () => {
  const index = createTopologyEditSnapSpatialIndex({
    topology: topology([node('node:target', 1, 0, 0, ['P-001:end'])]),
  });
  const result = resolve(index, query({ enabledKinds: ['PORT', 'NODE'] }));
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.kind, 'PORT');
  assert.equal(result.candidate.sourceFeatureId, 'port:P-001:end');
  assert.deepEqual(result.targetIds, ['node:target']);
});

test('hidden locked excluded and incompatible targets are removed before scoring', () => {
  const source = topology([
    node('node:hidden', 0.2),
    node('node:locked', 0.4),
    node('node:incompatible', 0.6),
    node('node:excluded', 0.8),
  ]);
  const index = createTopologyEditSnapSpatialIndex({
    topology: source,
    hiddenCanonicalIds: ['node:hidden'],
    lockedCanonicalIds: ['node:locked'],
    compatibilityByFeatureId: { 'node:incompatible': 'INCOMPATIBLE' },
  });
  const result = resolve(index, query({
    enabledKinds: ['NODE', 'GRID'],
    excludedCanonicalIds: ['node:excluded'],
  }));
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.kind, 'GRID');
  assert.equal(result.targetIds.length, 0);
});

test('acquisition and release hysteresis retain then release the active candidate', () => {
  const index = createTopologyEditSnapSpatialIndex({
    topology: topology([node('node:target', 1)]),
  });
  const acquired = resolve(index, query({ enabledKinds: ['NODE'] }));
  assert.equal(acquired.status, 'RESOLVED');
  assert.equal(acquired.candidate.screenDistancePx, 5);

  const retainedQuery = query({
    rawWorldPoint: { x: -1.4, y: 0, z: 0 },
    enabledKinds: ['NODE'],
    activeCandidateId: acquired.candidateId,
    queryId: 'query:2',
    querySequence: 2,
  });
  const retained = resolve(index, retainedQuery);
  assert.equal(retained.status, 'RESOLVED');
  assert.equal(retained.candidateId, acquired.candidateId);
  assert.equal(retained.retainedByHysteresis, true);
  assert.equal(retained.candidate.screenDistancePx, 12);

  const releasedQuery = query({
    rawWorldPoint: { x: -2, y: 0, z: 0 },
    enabledKinds: ['NODE'],
    activeCandidateId: acquired.candidateId,
    queryId: 'query:3',
    querySequence: 3,
  });
  const released = resolve(index, releasedQuery);
  assert.equal(released.status, 'UNAVAILABLE');
});

test('candidate cycling follows the stable sorted candidate set', () => {
  const index = createTopologyEditSnapSpatialIndex({
    topology: topology([node('node:right', 1), node('node:left', -1)]),
  });
  const first = resolve(index, query({ enabledKinds: ['NODE'], cycleIndex: 0 }));
  const second = resolve(index, query({
    enabledKinds: ['NODE'],
    cycleIndex: 1,
    queryId: 'query:2',
    querySequence: 2,
  }));
  assert.equal(first.targetIds[0], 'node:left');
  assert.equal(second.targetIds[0], 'node:right');
  assert.equal(first.candidateSetHash, second.candidateSetHash);
  assert.equal(first.candidateCount, 2);
  assert.equal(second.cycleIndex, 1);
});

test('centerline midpoint collinear orthogonal and grid candidates resolve analytically', () => {
  const edgeTopology = topology(
    [node('node:a', 0), node('node:b', 10)],
    [{ id: 'edge:ab', fromNodeId: 'node:a', toNodeId: 'node:b' }],
  );
  const edgeIndex = createTopologyEditSnapSpatialIndex({ topology: edgeTopology });

  const centerline = resolve(edgeIndex, query({
    rawWorldPoint: { x: 4, y: 0.5, z: 0 },
    enabledKinds: ['CENTERLINE'],
  }));
  assert.equal(centerline.kind, 'CENTERLINE');
  assert.deepEqual(centerline.snappedWorldPoint, { x: 4, y: 0, z: 0 });

  const midpoint = resolve(edgeIndex, query({
    rawWorldPoint: { x: 5.5, y: 0, z: 0 },
    enabledKinds: ['MIDPOINT'],
  }));
  assert.equal(midpoint.kind, 'MIDPOINT');
  assert.deepEqual(midpoint.snappedWorldPoint, { x: 5, y: 0, z: 0 });

  const collinear = resolve(edgeIndex, query({
    rawWorldPoint: { x: 12, y: 0.5, z: 0 },
    enabledKinds: ['COLLINEAR'],
  }));
  assert.equal(collinear.kind, 'COLLINEAR');
  assert.deepEqual(collinear.snappedWorldPoint, { x: 12, y: 0, z: 0 });

  const pointIndex = createTopologyEditSnapSpatialIndex({
    topology: topology([node('node:target', 1, 1)]),
  });
  const orthogonal = resolve(pointIndex, query({
    rawWorldPoint: { x: 0.8, y: 0.7, z: 0 },
    enabledKinds: ['ORTHOGONAL'],
  }));
  assert.equal(orthogonal.kind, 'ORTHOGONAL');
  assert.deepEqual(orthogonal.snappedWorldPoint, { x: 1, y: 0.7, z: 0 });

  const emptyIndex = createTopologyEditSnapSpatialIndex({ topology: topology([]) });
  const grid = resolve(emptyIndex, query({
    rawWorldPoint: { x: 0.9, y: 1.1, z: 0 },
    enabledKinds: ['GRID'],
    gridSpacingMm: 1,
  }));
  assert.equal(grid.kind, 'GRID');
  assert.deepEqual(grid.snappedWorldPoint, { x: 1, y: 1, z: 0 });
});

test('screen-space acquisition stays stable under orthographic zoom', () => {
  const nearCamera = orthographicCamera({ worldHeightMm: 200 });
  const farCamera = orthographicCamera({ worldHeightMm: 400 });
  const nearIndex = createTopologyEditSnapSpatialIndex({
    topology: topology([node('node:target', 1)]),
  });
  const farIndex = createTopologyEditSnapSpatialIndex({
    topology: topology([node('node:target', 2)]),
  });
  const near = resolve(nearIndex, query({
    camera: nearCamera,
    enabledKinds: ['NODE'],
  }));
  const far = resolve(farIndex, query({
    camera: farCamera,
    enabledKinds: ['NODE'],
    queryId: 'query:2',
    querySequence: 2,
  }));
  assert.equal(near.candidate.screenDistancePx, 5);
  assert.equal(far.candidate.screenDistancePx, 5);
  assert.equal(near.status, 'RESOLVED');
  assert.equal(far.status, 'RESOLVED');
});

test('perspective depth ambiguity falls through to exact world residual ordering', () => {
  const camera = perspectiveCamera();
  const index = createTopologyEditSnapSpatialIndex({
    topology: topology([
      node('node:near', 1, 0, 10),
      node('node:far', 2, 0, 20),
    ]),
    cellSizeMm: 50,
  });
  const result = resolve(index, query({
    rawWorldPoint: { x: 0, y: 0, z: 10 },
    camera,
    enabledKinds: ['NODE'],
    acquireRadiusPx: 1000,
    releaseRadiusPx: 1000,
  }));
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.targetIds[0], 'node:near');
  assert.equal(result.candidate.screenDistancePx, 50);
});

test('engine emits an explicit stale result before spatial work', () => {
  const index = createTopologyEditSnapSpatialIndex({
    topology: topology([node('node:target', 1)]),
  });
  const snapQuery = query({ enabledKinds: ['NODE'] });
  const result = resolveTopologyEditDeterministicSnap({
    index,
    query: snapQuery,
    expectedIdentity: {
      ...IDENTITY,
      basisHash: 'basis:changed',
      queryId: snapQuery.queryId,
      querySequence: snapQuery.querySequence,
    },
  });
  assert.equal(result.status, 'STALE');
  assert.deepEqual(result.staleFields, ['basisHash']);
  assert.equal(result.queryStats.sourceFeaturesVisited, 0);
});
