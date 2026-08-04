import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTopologyEditSnapSpatialIndex,
  queryTopologyEditSnapSpatialIndex,
} from '../src/workspace/viewport-interaction/topology-edit-snap-spatial-index.js';

function topology(overrides = {}) {
  return {
    canonicalTopologyHash: 'basis:index',
    nodes: [
      {
        id: 'node:a',
        position: { x: 0, y: 0, z: 0 },
        portKeys: ['A:start', 'A:end'],
      },
      {
        id: 'node:b',
        position: { x: 100, y: 0, z: 0 },
        portKeys: ['B:start'],
      },
      {
        id: 'node:c',
        position: { x: 1000, y: 0, z: 0 },
        portKeys: [],
      },
    ],
    edges: [
      { id: 'edge:ab', fromNodeId: 'node:a', toNodeId: 'node:b' },
      { id: 'edge:bc', fromNodeId: 'node:b', toNodeId: 'node:c' },
    ],
    ...overrides,
  };
}

test('index is deterministic under topology source reordering', () => {
  const source = topology();
  const left = createTopologyEditSnapSpatialIndex({
    topology: source,
    cellSizeMm: 50,
  });
  const right = createTopologyEditSnapSpatialIndex({
    topology: {
      ...source,
      nodes: [...source.nodes].reverse(),
      edges: [...source.edges].reverse(),
    },
    cellSizeMm: 50,
  });
  assert.equal(left.indexHash, right.indexHash);
  assert.deepEqual(left.pointFeatures, right.pointFeatures);
  assert.deepEqual(left.segmentFeatures, right.segmentFeatures);
});

test('node and port features share exact canonical node authority', () => {
  const index = createTopologyEditSnapSpatialIndex({ topology: topology() });
  const node = index.pointFeatures.find((row) => row.featureId === 'node:a:node');
  const ports = index.pointFeatures.filter((row) => row.featureId.startsWith('port:A:'));
  assert.equal(node.kind, 'NODE');
  assert.deepEqual(node.canonicalTargetIds, ['node:a']);
  assert.equal(ports.length, 2);
  assert.equal(ports.every((row) => row.kind === 'PORT'), true);
  assert.equal(ports.every((row) => row.canonicalTargetIds[0] === 'node:a'), true);
  assert.equal(ports.every((row) => (
    row.worldPoint.x === node.worldPoint.x
    && row.worldPoint.y === node.worldPoint.y
    && row.worldPoint.z === node.worldPoint.z
  )), true);
});

test('bounded corridor query does not visit every model feature', () => {
  const nodes = [];
  const edges = [];
  for (let index = 0; index < 10_000; index += 1) {
    nodes.push({
      id: `node:n${String(index).padStart(5, '0')}`,
      position: { x: index * 100, y: 0, z: 0 },
      portKeys: [],
    });
    if (index > 0) {
      edges.push({
        id: `edge:e${String(index).padStart(5, '0')}`,
        fromNodeId: `node:n${String(index - 1).padStart(5, '0')}`,
        toNodeId: `node:n${String(index).padStart(5, '0')}`,
      });
    }
  }
  const index = createTopologyEditSnapSpatialIndex({
    topology: {
      canonicalTopologyHash: 'basis:large',
      nodes,
      edges,
    },
    cellSizeMm: 200,
  });
  const query = queryTopologyEditSnapSpatialIndex(index, {
    centerWorld: { x: 50_000, y: 0, z: 0 },
    radiusMm: 250,
  });
  assert.ok(query.statistics.sourceFeaturesVisited < 20);
  assert.ok(query.statistics.pointCellsVisited <= 64);
  assert.ok(query.pointFeatures.length < 10);
  assert.ok(query.segmentFeatures.length < 10);
});

test('hidden locked and compatibility metadata remain attached to indexed features', () => {
  const index = createTopologyEditSnapSpatialIndex({
    topology: topology(),
    hiddenCanonicalIds: ['node:b'],
    lockedCanonicalIds: ['edge:ab'],
    compatibilityByFeatureId: {
      'port:A:start': 'ADAPTABLE',
      'node:c': 'INCOMPATIBLE',
    },
  });
  assert.equal(
    index.pointFeatures.find((row) => row.featureId === 'node:b:node').hidden,
    true,
  );
  assert.equal(
    index.segmentFeatures.find((row) => row.featureId === 'edge:ab:segment').locked,
    true,
  );
  assert.equal(
    index.pointFeatures.find((row) => row.featureId === 'port:A:start').compatibility,
    'ADAPTABLE',
  );
  assert.equal(
    index.pointFeatures.find((row) => row.featureId === 'node:c:node').compatibility,
    'INCOMPATIBLE',
  );
});

test('very long segments use the bounded overflow bucket and remain queryable', () => {
  const index = createTopologyEditSnapSpatialIndex({
    topology: {
      canonicalTopologyHash: 'basis:long',
      nodes: [
        { id: 'node:a', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
        { id: 'node:b', position: { x: 1_000_000, y: 0, z: 0 }, portKeys: [] },
      ],
      edges: [{ id: 'edge:long', fromNodeId: 'node:a', toNodeId: 'node:b' }],
    },
    cellSizeMm: 10,
    maximumCellsPerSegment: 100,
  });
  assert.deepEqual(index.largeSegmentFeatureIds, ['edge:long:segment']);
  const query = queryTopologyEditSnapSpatialIndex(index, {
    centerWorld: { x: 500_000, y: 1, z: 0 },
    radiusMm: 5,
  });
  assert.deepEqual(
    query.segmentFeatures.map((row) => row.featureId),
    ['edge:long:segment'],
  );
});
