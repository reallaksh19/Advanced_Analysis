import assert from 'node:assert/strict';
import test from 'node:test';

import {
  projectTopologyEditWorldToScreen,
  resolveTopologyEditDeterministicSnap,
} from '../src/workspace/viewport-interaction/topology-edit-deterministic-snap-engine.js';
import {
  createTopologyEditOperationSnapSpatialIndex,
} from '../src/workspace/viewport-interaction/topology-edit-operation-snap-index.js';
import {
  createTopologyEditSnapQuery,
} from '../src/workspace/viewport-interaction/topology-edit-snap-contract.js';
import {
  assertTopologyEditSnapSpatialIndex,
  queryTopologyEditSnapSpatialIndex,
} from '../src/workspace/viewport-interaction/topology-edit-snap-spatial-index.js';

const IDENTITY = Object.freeze({
  datasetSourceHash: 'source:operation-snap',
  basisHash: 'basis:operation-snap',
  sessionVersion: 11,
  selectionRevision: 4,
  interactionId: 'interaction:operation-snap',
});

function node(id, x, y = 0, z = 0) {
  return { id, position: { x, y, z }, portKeys: [] };
}

function topology(overrides = {}) {
  return {
    canonicalTopologyHash: IDENTITY.basisHash,
    nodes: [
      node('node:a', 10),
      node('node:b', 20),
      node('node:support', 0),
    ],
    edges: [{
      id: 'edge:valve',
      fromNodeId: 'node:a',
      toNodeId: 'node:b',
      entityType: 'VALVE',
    }],
    supports: [{
      id: 'support:guide',
      nodeId: 'node:support',
      resolved: true,
      restraints: [{ id: 'restraint:y', family: 'GUIDE', direction: '+Y' }],
    }],
    ...overrides,
  };
}

function orthographicCamera({ worldHeightMm = 200 } = {}) {
  const scale = 2 / worldHeightMm;
  return {
    projectionType: 'ORTHOGRAPHIC',
    position: { x: 0, y: 0, z: 100 },
    forward: { x: 0, y: 0, z: -1 },
    viewportWidthPx: 1000,
    viewportHeightPx: 1000,
    devicePixelRatio: 1,
    viewProjectionMatrix: [
      scale, 0, 0, 0,
      0, scale, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ],
    orthoHeightMm: worldHeightMm,
  };
}

function query({
  rawWorldPoint,
  enabledKinds,
  priorityKinds = enabledKinds,
  queryId = 'query:1',
  querySequence = 1,
  excludedCanonicalIds = [],
} = {}) {
  const camera = orthographicCamera();
  return createTopologyEditSnapQuery({
    ...IDENTITY,
    queryId,
    querySequence,
    pointerScreen: projectTopologyEditWorldToScreen(camera, rawWorldPoint),
    rawWorldPoint,
    camera,
    constraint: { mode: 'FREE', anchorWorld: { x: -100, y: -100, z: 0 } },
    enabledKinds,
    priorityKinds,
    excludedCanonicalIds,
    hiddenCanonicalIds: [],
    lockedCanonicalIds: [],
    acquireRadiusPx: 20,
    releaseRadiusPx: 24,
    gridSpacingMm: 100,
  });
}

function resolve(index, queryValue) {
  return resolveTopologyEditDeterministicSnap({
    index,
    query: queryValue,
    expectedIdentity: {
      ...IDENTITY,
      queryId: queryValue.queryId,
      querySequence: queryValue.querySequence,
    },
  });
}

test('component connection faces are exact PORT variants with edge and node identity', () => {
  const index = createTopologyEditOperationSnapSpatialIndex({
    topology: topology(),
    cellSizeMm: 100,
  });
  assert.equal(assertTopologyEditSnapSpatialIndex(index), index);
  assert.equal(index.operationFeatureAuthority.componentFaceCount, 2);
  const faces = index.pointFeatures.filter((row) => (
    row.operationVariant === 'COMPONENT_FACE'
  ));
  assert.deepEqual(faces.map((row) => row.featureId), [
    'edge:valve:component-face:FROM',
    'edge:valve:component-face:TO',
  ]);

  const result = resolve(index, query({
    rawWorldPoint: { x: 10.5, y: 0, z: 0 },
    enabledKinds: ['PORT'],
  }));
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.kind, 'PORT');
  assert.equal(result.candidate.sourceFeatureId, 'edge:valve:component-face:FROM');
  assert.deepEqual(result.targetIds, ['edge:valve', 'node:a']);
  assert.match(result.candidate.label, /VALVE FROM connection face/u);
});

test('selected endpoint exclusion removes its own component face authority', () => {
  const index = createTopologyEditOperationSnapSpatialIndex({ topology: topology() });
  const result = resolve(index, query({
    rawWorldPoint: { x: 10.2, y: 0, z: 0 },
    enabledKinds: ['PORT'],
    excludedCanonicalIds: ['node:a'],
  }));
  assert.equal(result.status, 'UNAVAILABLE');
});

test('resolved support axes project through existing line kinds and unresolved axes are omitted', () => {
  const index = createTopologyEditOperationSnapSpatialIndex({
    topology: topology(),
    supportAxisExtentMm: 100,
  });
  assert.equal(index.operationFeatureAuthority.supportAxisCount, 1);
  const axis = index.segmentFeatures.find((row) => (
    row.operationVariant === 'SUPPORT_AXIS'
  ));
  assert.equal(axis.featureId, 'support:guide:support-axis:restraint:y:+Y');
  assert.deepEqual(axis.canonicalTargetIds, ['node:support', 'support:guide']);

  const result = resolve(index, query({
    rawWorldPoint: { x: 0.4, y: 12, z: 0 },
    enabledKinds: ['CENTERLINE'],
  }));
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.kind, 'CENTERLINE');
  assert.equal(result.candidate.sourceFeatureId, axis.featureId);
  assert.deepEqual(result.candidate.worldPoint, { x: 0, y: 12, z: 0 });
  assert.match(result.candidate.label, /Support axis \+Y/u);

  const unresolved = createTopologyEditOperationSnapSpatialIndex({
    topology: topology({
      supports: [{
        id: 'support:guide',
        nodeId: 'node:support',
        restraints: [{
          id: 'restraint:y',
          family: 'GUIDE',
          directionStatus: 'UNRESOLVED',
        }],
      }],
    }),
  });
  assert.equal(unresolved.operationFeatureAuthority.supportAxisCount, 0);
});

test('feature authority is deterministic under topology and restraint reordering', () => {
  const source = topology({
    supports: [{
      id: 'support:guide',
      nodeId: 'node:support',
      restraints: [
        { id: 'restraint:z', direction: { x: 0, y: 0, z: -2 } },
        { id: 'restraint:y', direction: '+Y' },
      ],
    }],
  });
  const first = createTopologyEditOperationSnapSpatialIndex({ topology: source });
  const second = createTopologyEditOperationSnapSpatialIndex({
    topology: {
      ...source,
      nodes: [...source.nodes].reverse(),
      edges: [...source.edges].reverse(),
      supports: source.supports.map((support) => ({
        ...support,
        restraints: [...support.restraints].reverse(),
      })),
    },
  });
  assert.equal(first.indexHash, second.indexHash);
  assert.equal(
    first.operationFeatureAuthority.authorityHash,
    second.operationFeatureAuthority.authorityHash,
  );
});

test('spatial query remains neighborhood-bounded on a production-scale topology', () => {
  const nodes = [];
  const edges = [];
  for (let index = 0; index < 3000; index += 1) {
    const x = index * 1000;
    nodes.push(node(`node:${index}:a`, x), node(`node:${index}:b`, x + 100));
    edges.push({
      id: `edge:${index}`,
      fromNodeId: `node:${index}:a`,
      toNodeId: `node:${index}:b`,
      entityType: index % 100 === 0 ? 'FLANGE' : 'PIPE',
    });
  }
  const index = createTopologyEditOperationSnapSpatialIndex({
    topology: {
      canonicalTopologyHash: IDENTITY.basisHash,
      nodes,
      edges,
      supports: [],
    },
    cellSizeMm: 250,
  });
  assert.equal(index.pointFeatures.length, 6060);
  assert.equal(index.segmentFeatures.length, 3000);
  const corridor = queryTopologyEditSnapSpatialIndex(index, {
    centerWorld: { x: 10, y: 0, z: 0 },
    radiusMm: 20,
  });
  assert.ok(corridor.statistics.sourceFeaturesVisited < 20);
  assert.ok(corridor.statistics.pointCellsVisited <= 8);
  assert.ok(corridor.statistics.segmentCellsVisited <= 8);
});
