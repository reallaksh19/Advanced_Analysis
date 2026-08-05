import assert from 'node:assert/strict';
import test from 'node:test';

import {
  projectTopologyEditWorldToScreen,
  resolveTopologyEditDeterministicSnap,
} from '../src/workspace/viewport-interaction/topology-edit-deterministic-snap-engine.js';
import {
  createTopologyEditSnapQuery,
} from '../src/workspace/viewport-interaction/topology-edit-snap-contract.js';
import {
  assertTopologyEditSnapSpatialIndex,
} from '../src/workspace/viewport-interaction/topology-edit-snap-spatial-index.js';
import {
  createTopologyEditTangencyClockingSnapSpatialIndex,
} from '../src/workspace/viewport-interaction/topology-edit-tangency-clocking-snap-index.js';

const IDENTITY = Object.freeze({
  datasetSourceHash: 'source:f2',
  basisHash: 'basis:f2',
  sessionVersion: 5,
  selectionRevision: 2,
  interactionId: 'interaction:f2',
});

function node(id, x, y, z = 0) {
  return { id, position: { x, y, z }, portKeys: [] };
}

function baseTopology(overrides = {}) {
  return {
    canonicalTopologyHash: IDENTITY.basisHash,
    nodes: [
      node('node:elbow-from', 10, 0),
      node('node:elbow-to', 0, 10),
      node('node:run-a', -10, 0),
      node('node:run-b', 10, 0),
      node('node:branch', 0, 10),
    ],
    edges: [{
      id: 'edge:elbow',
      fromNodeId: 'node:elbow-from',
      toNodeId: 'node:elbow-to',
      entityType: 'ELBOW',
      arcCenter: { x: 0, y: 0, z: 0 },
    }],
    junctions: [{
      id: 'junction:tee',
      entityType: 'TEE',
      nodeIds: ['node:branch', 'node:run-b', 'node:run-a'],
    }],
    supports: [],
    bends: [],
    ...overrides,
  };
}

function camera() {
  return {
    projectionType: 'ORTHOGRAPHIC',
    position: { x: 0, y: 0, z: 100 },
    forward: { x: 0, y: 0, z: -1 },
    viewportWidthPx: 1000,
    viewportHeightPx: 1000,
    devicePixelRatio: 1,
    viewProjectionMatrix: [
      0.01, 0, 0, 0,
      0, 0.01, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ],
    orthoHeightMm: 200,
  };
}

function resolve(index, rawWorldPoint, excludedCanonicalIds = []) {
  const cameraValue = camera();
  const query = createTopologyEditSnapQuery({
    ...IDENTITY,
    queryId: 'query:f2',
    querySequence: 1,
    pointerScreen: projectTopologyEditWorldToScreen(cameraValue, rawWorldPoint),
    rawWorldPoint,
    camera: cameraValue,
    constraint: { mode: 'FREE', anchorWorld: { x: -100, y: -100, z: 0 } },
    enabledKinds: ['CENTERLINE'],
    priorityKinds: ['CENTERLINE'],
    excludedCanonicalIds,
    hiddenCanonicalIds: [],
    lockedCanonicalIds: [],
    acquireRadiusPx: 30,
    releaseRadiusPx: 36,
    gridSpacingMm: 100,
  });
  return resolveTopologyEditDeterministicSnap({
    index,
    query,
    expectedIdentity: {
      ...IDENTITY,
      queryId: query.queryId,
      querySequence: query.querySequence,
    },
  });
}

test('arc center derives exact FROM and TO elbow tangent lines', () => {
  const index = createTopologyEditTangencyClockingSnapSpatialIndex({
    topology: baseTopology(),
    operationLineExtentMm: 50,
  });
  assert.equal(assertTopologyEditSnapSpatialIndex(index), index);
  assert.equal(index.tangencyClockingFeatureAuthority.elbowTangencyCount, 2);
  const tangents = index.segmentFeatures.filter((row) => (
    row.operationVariant === 'ELBOW_TANGENCY'
  ));
  assert.deepEqual(tangents.map((row) => row.featureId), [
    'edge:elbow:elbow-tangent:FROM',
    'edge:elbow:elbow-tangent:TO',
  ]);
  const from = tangents[0];
  assert.ok(Math.abs(from.start.x - 10) <= 1e-9);
  assert.ok(Math.abs(from.end.x - 10) <= 1e-9);
  assert.ok(from.start.y < 0 && from.end.y > 0);

  const result = resolve(index, { x: 10.4, y: 20, z: 0 });
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.kind, 'CENTERLINE');
  assert.equal(result.candidate.sourceFeatureId, from.featureId);
  assert.deepEqual(result.targetIds, ['edge:elbow', 'node:elbow-from']);
  assert.ok(Math.abs(result.candidate.worldPoint.x - 10) <= 1e-9);
  assert.ok(Math.abs(result.candidate.worldPoint.y - 20) <= 1e-9);
});

test('explicit tangent vectors remain authoritative without an arc center', () => {
  const source = baseTopology({
    edges: [{
      id: 'edge:elbow',
      fromNodeId: 'node:elbow-from',
      toNodeId: 'node:elbow-to',
      entityType: 'BEND',
      fromTangent: { x: 0, y: 2, z: 0 },
      toTangent: { x: -3, y: 0, z: 0 },
    }],
    junctions: [],
  });
  const index = createTopologyEditTangencyClockingSnapSpatialIndex({ topology: source });
  assert.equal(index.tangencyClockingFeatureAuthority.elbowTangencyCount, 2);
});

test('missing or collinear elbow geometry produces no tangency authority', () => {
  const missing = createTopologyEditTangencyClockingSnapSpatialIndex({
    topology: baseTopology({
      edges: [{
        id: 'edge:elbow',
        fromNodeId: 'node:elbow-from',
        toNodeId: 'node:elbow-to',
        entityType: 'ELBOW',
      }],
      junctions: [],
    }),
  });
  assert.equal(missing.tangencyClockingFeatureAuthority.elbowTangencyCount, 0);
});

test('three-port branch geometry infers the run pair and publishes signed clocking', () => {
  const index = createTopologyEditTangencyClockingSnapSpatialIndex({
    topology: baseTopology(),
    operationLineExtentMm: 50,
  });
  assert.equal(index.tangencyClockingFeatureAuthority.branchClockingCount, 1);
  const branch = index.segmentFeatures.find((row) => (
    row.operationVariant === 'BRANCH_CLOCKING'
  ));
  assert.equal(branch.featureId, 'junction:tee:branch-clocking:node:branch');
  assert.deepEqual(branch.canonicalTargetIds, ['junction:tee', 'node:branch']);
  assert.equal(branch.clockingAngleDeg, -90);
  assert.match(branch.label, /Branch clocking -90°/u);

  const result = resolve(index, { x: 0.5, y: 20, z: 0 });
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.candidate.sourceFeatureId, branch.featureId);
  assert.ok(Math.abs(result.candidate.worldPoint.x) <= 1e-9);
  assert.ok(Math.abs(result.candidate.worldPoint.y - 20) <= 1e-9);
});

test('explicit branch/run identity is deterministic and selected branch exclusion removes it', () => {
  const source = baseTopology({
    junctions: [{
      id: 'junction:tee',
      entityType: 'TEE',
      nodeIds: ['node:run-a', 'node:branch', 'node:run-b'],
      runNodeIds: ['node:run-b', 'node:run-a'],
      branchNodeId: 'node:branch',
    }],
  });
  const first = createTopologyEditTangencyClockingSnapSpatialIndex({ topology: source });
  const second = createTopologyEditTangencyClockingSnapSpatialIndex({
    topology: {
      ...source,
      nodes: [...source.nodes].reverse(),
      junctions: source.junctions.map((row) => ({
        ...row,
        nodeIds: [...row.nodeIds].reverse(),
        runNodeIds: [...row.runNodeIds].reverse(),
      })),
    },
  });
  assert.equal(first.indexHash, second.indexHash);
  assert.equal(
    first.tangencyClockingFeatureAuthority.authorityHash,
    second.tangencyClockingFeatureAuthority.authorityHash,
  );
  const unavailable = resolve(first, { x: 0, y: 20, z: 0 }, ['node:branch']);
  assert.notEqual(unavailable.candidate?.operationVariant, 'BRANCH_CLOCKING');
});

test('ambiguous multi-port and collinear branch geometry produce no clocking authority', () => {
  const multi = createTopologyEditTangencyClockingSnapSpatialIndex({
    topology: baseTopology({
      junctions: [{
        id: 'junction:tee',
        entityType: 'TEE',
        nodeIds: ['node:run-a', 'node:run-b', 'node:branch', 'node:elbow-from'],
      }],
    }),
  });
  assert.equal(multi.tangencyClockingFeatureAuthority.branchClockingCount, 0);

  const collinear = createTopologyEditTangencyClockingSnapSpatialIndex({
    topology: baseTopology({
      nodes: [
        node('node:elbow-from', 10, 0),
        node('node:elbow-to', 0, 10),
        node('node:run-a', -10, 0),
        node('node:run-b', 10, 0),
        node('node:branch', 0, 0),
      ],
    }),
  });
  assert.equal(collinear.tangencyClockingFeatureAuthority.branchClockingCount, 0);
});

test('F1 component-face and support-axis authority is retained unchanged', () => {
  const topology = baseTopology({
    edges: [
      ...baseTopology().edges,
      {
        id: 'edge:valve',
        fromNodeId: 'node:run-a',
        toNodeId: 'node:run-b',
        entityType: 'VALVE',
      },
    ],
    supports: [{
      id: 'support:guide',
      nodeId: 'node:run-a',
      resolved: true,
      restraints: [{ id: 'restraint:y', direction: '+Y' }],
    }],
  });
  const index = createTopologyEditTangencyClockingSnapSpatialIndex({ topology });
  assert.equal(index.operationFeatureAuthority.componentFaceCount, 2);
  assert.equal(index.operationFeatureAuthority.supportAxisCount, 1);
  assert.equal(index.tangencyClockingFeatureAuthority.elbowTangencyCount, 2);
  assert.equal(index.tangencyClockingFeatureAuthority.branchClockingCount, 1);
});
