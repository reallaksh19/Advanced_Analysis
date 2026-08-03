import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineeringModelController, ENGINEERING_MODEL_EVENTS } from '../src/workspace/engineering-model-controller.js';
import { engineeringModelStore } from '../src/workspace/engineering-model-store.js';
import { engineeringSupportLoadStore } from '../src/workspace/engineering-loads/engineering-support-load-store.js';

function ready(dataset, selectedEntityId = '') {
  return { status: 'ready', dataset, selectedEntityId };
}

function harness(dataset, distribution = null) {
  const calls = { rebuild: [], clearModel: 0, clearDistribution: 0, stale: [], published: [] };
  const originals = {
    rebuild: engineeringModelStore.rebuild,
    clearModel: engineeringModelStore.clear,
    getDistribution: engineeringSupportLoadStore.getDistribution,
    clearDistribution: engineeringSupportLoadStore.clear,
    markStale: engineeringSupportLoadStore.markStale,
  };
  engineeringModelStore.rebuild = (value) => calls.rebuild.push(value);
  engineeringModelStore.clear = () => { calls.clearModel += 1; };
  engineeringSupportLoadStore.getDistribution = () => distribution;
  engineeringSupportLoadStore.clear = () => { calls.clearDistribution += 1; };
  engineeringSupportLoadStore.markStale = (...args) => calls.stale.push(args);
  const eventBus = {
    publish: (...args) => calls.published.push(args),
    subscribe: () => () => {},
  };
  const workspaceState = { getSnapshot: () => ({ dataset }) };
  const controller = new EngineeringModelController(eventBus, workspaceState, { getMasterData: () => ({}) });
  return {
    controller,
    calls,
    restore() {
      engineeringModelStore.rebuild = originals.rebuild;
      engineeringModelStore.clear = originals.clearModel;
      engineeringSupportLoadStore.getDistribution = originals.getDistribution;
      engineeringSupportLoadStore.clear = originals.clearDistribution;
      engineeringSupportLoadStore.markStale = originals.markStale;
    },
  };
}

test('same dataset reference with selection-only snapshot skips the second rebuild', () => {
  const dataset = { datasetId: 'dataset:1', version: 4 };
  const state = harness(dataset);
  try {
    state.controller.handleSnapshot(ready(dataset, 'entity:a'));
    state.controller.handleSnapshot(ready(dataset, 'entity:b'));
    assert.deepEqual(state.calls.rebuild, [dataset]);
  } finally { state.restore(); }
});

test('new dataset object with the same identifiers still rebuilds', () => {
  const first = { datasetId: 'dataset:1', version: 4 };
  const second = { datasetId: 'dataset:1', version: 4 };
  const state = harness(second);
  try {
    state.controller.handleSnapshot(ready(first));
    state.controller.handleSnapshot(ready(second));
    assert.deepEqual(state.calls.rebuild, [first, second]);
  } finally { state.restore(); }
});

test('clear resets the reference guard so reloading the same object rebuilds', () => {
  const dataset = { datasetId: 'dataset:1', version: 4 };
  const state = harness(dataset);
  try {
    state.controller.handleSnapshot(ready(dataset));
    state.controller.handleSnapshot({ status: 'empty', dataset: null });
    state.controller.handleSnapshot(ready(dataset));
    assert.deepEqual(state.calls.rebuild, [dataset, dataset]);
    assert.equal(state.calls.clearModel, 1);
  } finally { state.restore(); }
});

test('same-reference snapshots retain distribution freshness checks', () => {
  const dataset = { datasetId: 'dataset:1', version: 4 };
  const distribution = { datasetId: 'dataset:1', datasetVersion: 3 };
  const state = harness(dataset, distribution);
  try {
    state.controller.handleSnapshot(ready(dataset, 'entity:a'));
    state.controller.handleSnapshot(ready(dataset, 'entity:b'));
    assert.deepEqual(state.calls.rebuild, [dataset]);
    assert.deepEqual(state.calls.stale, [
      ['DATASET_EDITED', 4],
      ['DATASET_EDITED', 4],
    ]);
  } finally { state.restore(); }
});

test('project-data changes always rebuild and publish change', () => {
  const dataset = { datasetId: 'dataset:1', version: 4 };
  const state = harness(dataset);
  try {
    state.controller.handleSnapshot(ready(dataset));
    state.controller.handleProjectDataChanged();
    assert.deepEqual(state.calls.rebuild, [dataset, dataset]);
    assert.deepEqual(state.calls.stale, [['PROJECT_DATA_CHANGED', 4]]);
    assert.deepEqual(state.calls.published, [[ENGINEERING_MODEL_EVENTS.CHANGED, { reason: 'project-data-changed' }]]);
  } finally { state.restore(); }
});
