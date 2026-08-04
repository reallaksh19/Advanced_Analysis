import assert from 'node:assert/strict';
import test from 'node:test';

import { createTopologyEditEditorStore } from '../src/workspace/topology-edit/editor-state/topology-edit-editor-store.js';
import { TopologyEditSnapStoreController } from '../src/workspace/topology-edit/editor-state/topology-edit-snap-store-controller.js';
import {
  createTopologyEditDeterministicSnapCandidate,
  createTopologyEditSnapResult,
} from '../src/workspace/viewport-interaction/topology-edit-snap-contract.js';

function setup() {
  const store = createTopologyEditEditorStore({
    dataset: {
      sourceHash: 'source:a',
      canonicalHash: 'basis:a',
      sessionVersion: 2,
    },
  });
  store.getState().actions.replaceSelection(['node:a'], 'viewport');
  const controller = new TopologyEditSnapStoreController(store);
  return { store, controller };
}

function result(overrides = {}) {
  const candidate = createTopologyEditDeterministicSnapCandidate({
    kind: 'NODE',
    canonicalTargetIds: ['node:b'],
    worldPoint: { x: 1, y: 0, z: 0 },
    screenDistancePx: 5,
    worldDistanceMm: 1,
    constraintError: 0,
    compatibility: 'EXACT',
    priority: 1,
    sourceFeatureId: 'node:b:node',
    stableTieBreaker: 'NODE|node:b|node:b:node',
  });
  return createTopologyEditSnapResult({
    status: 'RESOLVED',
    queryId: 'query:1',
    interactionId: 'interaction:1',
    datasetSourceHash: 'source:a',
    basisHash: 'basis:a',
    sessionVersion: 2,
    selectionRevision: 1,
    querySequence: 1,
    queryHash: 'query-hash:1',
    candidate,
    score: [0, 1, 5],
    candidateCount: 2,
    candidateSetHash: 'set:1',
    cycleIndex: 0,
    queryStats: {},
    ...overrides,
  });
}

test('controller initializes documented snap preferences and state only', () => {
  const { store, controller } = setup();
  const preferences = controller.preferences();
  assert.equal(preferences.snapAcquireRadiusPx, 10);
  assert.equal(preferences.snapReleaseRadiusPx, 14);
  assert.equal(preferences.gridSpacingMm, 100);
  assert.equal(store.getState().snapping.activeResult, null);
  assert.equal(store.getState().snapping.candidateCount, 0);
  assert.equal('canonicalTopology' in store.getState(), false);
});

test('result publication is identity guarded and summary deduplicated', () => {
  const { store, controller } = setup();
  controller.beginInteraction('interaction:1');
  controller.beginQuery({ interactionId: 'interaction:1', queryId: 'query:1' });
  const identity = {
    datasetSourceHash: 'source:a',
    basisHash: 'basis:a',
    sessionVersion: 2,
    selectionRevision: 1,
    interactionId: 'interaction:1',
    queryId: 'query:1',
    querySequence: 1,
  };
  const applied = controller.applyResult(result(), identity);
  assert.equal(applied.disposition, 'APPLIED');
  assert.equal(store.getState().snapping.activeResult.candidateId, result().candidateId);
  const unchanged = controller.applyResult(result(), identity);
  assert.equal(unchanged.disposition, 'UNCHANGED');
  const stale = controller.applyResult(result(), {
    ...identity,
    selectionRevision: 2,
  });
  assert.equal(stale.disposition, 'STALE');
  assert.deepEqual(stale.staleFields, ['selectionRevision']);
});

test('candidate cycling and interaction clear are deterministic', () => {
  const { store, controller } = setup();
  controller.beginInteraction('interaction:1');
  controller.beginQuery({ interactionId: 'interaction:1', queryId: 'query:1' });
  controller.applyResult(result(), {
    datasetSourceHash: 'source:a',
    basisHash: 'basis:a',
    sessionVersion: 2,
    selectionRevision: 1,
    interactionId: 'interaction:1',
    queryId: 'query:1',
    querySequence: 1,
  });
  assert.equal(controller.cycle(1), 1);
  assert.equal(controller.cycle(1), 0);
  assert.equal(controller.cycle(-1), 1);
  controller.clear();
  assert.equal(store.getState().interaction.mode, 'IDLE');
  assert.equal(store.getState().interaction.interactionId, null);
  assert.equal(store.getState().snapping.activeResult, null);
  assert.equal(store.getState().snapping.cycleIndex, 0);
});

test('preference updates validate hysteresis and reset active candidates', () => {
  const { store, controller } = setup();
  const preferences = controller.updatePreferences({
    enabledSnapKinds: ['NODE', 'GRID'],
    snapPriorityKinds: ['NODE', 'GRID'],
    gridSpacingMm: 25,
    snapAcquireRadiusPx: 8,
    snapReleaseRadiusPx: 12,
  });
  assert.deepEqual(preferences.enabledSnapKinds, ['NODE', 'GRID']);
  assert.deepEqual(store.getState().snapping.enabledKinds, ['NODE', 'GRID']);
  assert.equal(preferences.gridSpacingMm, 25);
  assert.throws(() => controller.updatePreferences({
    snapAcquireRadiusPx: 20,
    snapReleaseRadiusPx: 10,
  }), /snapReleaseRadiusPx/);
});
