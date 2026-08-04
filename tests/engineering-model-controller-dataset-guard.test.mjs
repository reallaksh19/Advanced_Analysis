import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineeringModelController, ENGINEERING_MODEL_EVENTS } from '../src/workspace/engineering-model-controller.js';
import { engineeringModelStore } from '../src/workspace/engineering-model-store.js';

function ready(dataset, selectedEntityId = '') {
  return { status: 'ready', dataset, selectedEntityId };
}

function harness(dataset, distribution = null) {
  const calls = { rebuild: [], deactivate: [], stale: [], refresh: 0, execute: 0, published: [] };
  const originals = {
    rebuild: engineeringModelStore.rebuild,
    deactivate: engineeringModelStore.deactivate,
    getDistribution: engineeringModelStore.getDistribution,
    markEmpiricalStale: engineeringModelStore.markEmpiricalStale,
    clear: engineeringModelStore.clear,
  };
  engineeringModelStore.rebuild = (value) => calls.rebuild.push(value);
  engineeringModelStore.deactivate = (...args) => calls.deactivate.push(args);
  engineeringModelStore.getDistribution = () => distribution;
  engineeringModelStore.markEmpiricalStale = (...args) => calls.stale.push(args);
  engineeringModelStore.clear = () => {};
  const eventBus = {
    publish: (...args) => calls.published.push(args),
    subscribe: () => () => {},
  };
  const workspaceState = { getSnapshot: () => ({ dataset }) };
  const authorizedConsumer = {
    refreshEmpirical: () => { calls.refresh += 1; return {}; },
    executeEmpirical: () => {
      calls.execute += 1;
      return { distribution: { status: 'CALCULATED' } };
    },
  };
  const controller = new EngineeringModelController(eventBus, workspaceState, authorizedConsumer);
  return {
    controller,
    calls,
    restore() {
      engineeringModelStore.rebuild = originals.rebuild;
      engineeringModelStore.deactivate = originals.deactivate;
      engineeringModelStore.getDistribution = originals.getDistribution;
      engineeringModelStore.markEmpiricalStale = originals.markEmpiricalStale;
      engineeringModelStore.clear = originals.clear;
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
    assert.equal(state.calls.refresh, 1);
  } finally { state.restore(); }
});

test('semantically equivalent replacement object rebuilds without preemptive stale marking', () => {
  const first = { datasetId: 'dataset:1', version: 4 };
  const second = { datasetId: 'dataset:1', version: 4 };
  const distribution = { datasetId: 'dataset:1', datasetVersion: 4 };
  const state = harness(second, distribution);
  try {
    state.controller.handleSnapshot(ready(first));
    state.controller.handleSnapshot(ready(second));
    assert.deepEqual(state.calls.rebuild, [first, second]);
    assert.deepEqual(state.calls.stale, []);
    assert.equal(state.calls.refresh, 2);
  } finally { state.restore(); }
});

test('deactivation resets the reference guard so reloading the same object rebuilds', () => {
  const dataset = { datasetId: 'dataset:1', version: 4 };
  const state = harness(dataset);
  try {
    state.controller.handleSnapshot(ready(dataset));
    state.controller.handleSnapshot({ status: 'empty', dataset: null });
    state.controller.handleSnapshot(ready(dataset));
    assert.deepEqual(state.calls.rebuild, [dataset, dataset]);
    assert.deepEqual(state.calls.deactivate, [['NO_ACTIVE_DATASET']]);
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

test('project-data changes always rebuild, stale authorization, and publish change', () => {
  const dataset = { datasetId: 'dataset:1', version: 4 };
  const state = harness(dataset);
  try {
    state.controller.handleSnapshot(ready(dataset));
    state.controller.handleProjectDataChanged();
    assert.deepEqual(state.calls.rebuild, [dataset, dataset]);
    assert.deepEqual(state.calls.stale, [['PROJECT_DATA_CHANGED', 4]]);
    assert.equal(state.calls.refresh, 2);
    assert.deepEqual(state.calls.published, [[ENGINEERING_MODEL_EVENTS.CHANGED, { reason: 'project-data-changed' }]]);
  } finally { state.restore(); }
});

test('calculate invokes the authorized consumer and never the legacy store calculate method', () => {
  const dataset = { datasetId: 'dataset:1', version: 4 };
  const state = harness(dataset);
  const originalCalculate = engineeringModelStore.calculate;
  let legacyCalls = 0;
  engineeringModelStore.calculate = () => { legacyCalls += 1; throw new Error('legacy route reached'); };
  try {
    const execution = state.controller.calculate();
    assert.equal(state.calls.execute, 1);
    assert.equal(legacyCalls, 0);
    assert.equal(execution.distribution.status, 'CALCULATED');
    assert.equal(state.calls.published[0][0], ENGINEERING_MODEL_EVENTS.CHANGED);
  } finally {
    engineeringModelStore.calculate = originalCalculate;
    state.restore();
  }
});
