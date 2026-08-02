import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createTopologyEditPresentationState,
  reduceTopologyEditPresentationState,
  topologyEditPresentationActions,
} from '../src/workspace/viewport-presentation/topology-edit-presentation-contract.js';
import {
  CANONICAL_VISIBILITY_ACTIONS,
  createTopologyEditCanonicalVisibility,
  isTopologyEditCanonicalIdVisible,
  reduceTopologyEditCanonicalVisibility,
} from '../src/workspace/viewport-presentation/topology-edit-visibility-model.js';
import {
  TopologyEditPresentationRuntime,
  applyTopologyEditCanonicalVisibility,
} from '../src/workspace/viewport-presentation/topology-edit-presentation-runtime.js';

const ACTIONS = topologyEditPresentationActions();
const completeBasis = Object.freeze({
  sourceHash: 'source-1',
  baseCanonicalHash: 'base-1',
  draftCanonicalHash: 'draft-1',
  visualModelHash: 'visual-1',
  scopeHash: 'scope-1',
});

test('canonical visibility normalizes immutable exact identities', () => {
  const state = createTopologyEditCanonicalVisibility({
    hiddenCanonicalIds: ['node:b', 'node:a', 'node:a'],
  });
  assert.deepEqual(state.hiddenCanonicalIds, ['node:a', 'node:b']);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.hiddenCanonicalIds), true);
  assert.throws(
    () => createTopologyEditCanonicalVisibility({ hiddenCanonicalIds: [''] }),
    /non-empty/,
  );
});

test('hide isolate and show-all remain deterministic and fail closed', () => {
  const initial = createTopologyEditCanonicalVisibility();
  const hidden = reduceTopologyEditCanonicalVisibility(initial, {
    type: CANONICAL_VISIBILITY_ACTIONS.HIDE,
    canonicalIds: ['node:a'],
  });
  const isolated = reduceTopologyEditCanonicalVisibility(hidden, {
    type: CANONICAL_VISIBILITY_ACTIONS.ISOLATE,
    canonicalIds: ['node:a', 'node:c'],
  });
  assert.equal(isTopologyEditCanonicalIdVisible(hidden, 'node:a'), false);
  assert.equal(isTopologyEditCanonicalIdVisible(isolated, 'node:a'), true);
  assert.equal(isTopologyEditCanonicalIdVisible(isolated, 'node:b'), false);
  assert.deepEqual(isolated.hiddenCanonicalIds, []);
  assert.deepEqual(isolated.isolatedCanonicalIds, ['node:a', 'node:c']);
  assert.deepEqual(
    reduceTopologyEditCanonicalVisibility(isolated, {
      type: CANONICAL_VISIBILITY_ACTIONS.SHOW_ALL,
    }),
    initial,
  );
});

test('reconcile removes stale canonical IDs without retargeting', () => {
  const state = createTopologyEditCanonicalVisibility({
    hiddenCanonicalIds: ['node:removed', 'node:survives'],
    isolatedCanonicalIds: ['edge:removed', 'edge:survives'],
  });
  const reconciled = reduceTopologyEditCanonicalVisibility(state, {
    type: CANONICAL_VISIBILITY_ACTIONS.RECONCILE,
    canonicalIds: ['node:survives', 'edge:survives'],
  });
  assert.deepEqual(reconciled.hiddenCanonicalIds, ['node:survives']);
  assert.deepEqual(reconciled.isolatedCanonicalIds, ['edge:survives']);
});

test('presentation hash includes display visibility without changing basis', () => {
  const initial = createTopologyEditPresentationState({ basis: completeBasis });
  const hidden = reduceTopologyEditPresentationState(initial, {
    type: ACTIONS.HIDE_IDS,
    canonicalIds: ['node:a'],
  });
  const restored = reduceTopologyEditPresentationState(hidden, {
    type: ACTIONS.SHOW_ALL_IDS,
  });
  assert.notEqual(hidden.presentationHash, initial.presentationHash);
  assert.deepEqual(hidden.basis, initial.basis);
  assert.deepEqual(restored.canonicalVisibility.hiddenCanonicalIds, []);
  assert.deepEqual(restored.basis, initial.basis);
});

test('runtime hides regular canonical objects in source and draft groups', () => {
  const sourceObject = fakeObject('node:a');
  const draftObject = fakeObject('node:b');
  const runtime = new TopologyEditPresentationRuntime({
    groups: {
      sourceGroup: fakeGroup([sourceObject]),
      draftGroup: fakeGroup([draftObject]),
    },
  });
  const initial = createTopologyEditPresentationState({ basis: completeBasis });
  const isolated = reduceTopologyEditPresentationState(initial, {
    type: ACTIONS.ISOLATE_IDS,
    canonicalIds: ['node:a'],
  });
  runtime.apply(isolated);
  assert.equal(sourceObject.visible, true);
  assert.equal(draftObject.visible, false);
  runtime.destroy();
});

test('instanced visibility preserves pick identities and restores matrices', () => {
  const object = fakeInstancedObject(['node:a', 'node:b']);
  const group = fakeGroup([object]);
  const base = Array.from(object.instanceMatrix.array);
  const hidden = createTopologyEditCanonicalVisibility({
    hiddenCanonicalIds: ['node:b'],
  });
  applyTopologyEditCanonicalVisibility(group, hidden);
  assert.deepEqual(object.userData.pickTable, ['node:a', 'node:b']);
  assert.equal(object.instanceMatrix.array[16], 0);
  assert.equal(object.instanceMatrix.array[21], 0);
  assert.equal(object.instanceMatrix.needsUpdate, true);
  applyTopologyEditCanonicalVisibility(
    group,
    createTopologyEditCanonicalVisibility(),
  );
  assert.deepEqual(Array.from(object.instanceMatrix.array), base);
});

test('production toolbar consumes exact selected IDs and discloses display-only scope', async () => {
  const controller = await readFile(
    new URL('../src/workspace/topology-edit-3d-view-controller.js', import.meta.url),
    'utf8',
  );
  const toolbar = await readFile(
    new URL('../src/workspace/viewport-presentation/topology-edit-presentation-toolbar.js', import.meta.url),
    'utf8',
  );
  assert.match(controller, /getSelectedCanonicalIds: \(\) => this\.selectedCanonicalIds\(\)/);
  assert.match(controller, /PRESENTATION_ACTIONS\.RECONCILE_IDS/);
  assert.match(toolbar, /data-action="hide-selected"/);
  assert.match(toolbar, /data-action="isolate-selected"/);
  assert.match(toolbar, /Command scope is unchanged/);
  assert.doesNotMatch(toolbar, /nearest|proximity|fallback/i);
});

function fakeObject(canonicalId) {
  return {
    visible: true,
    userData: { canonicalId },
    material: {},
  };
}

function fakeGroup(objects) {
  return {
    visible: true,
    traverse(visitor) {
      objects.forEach(visitor);
    },
  };
}

function fakeInstancedObject(pickTable) {
  const first = identityMatrix(0);
  const second = identityMatrix(100);
  return {
    userData: { pickTable },
    instanceMatrix: {
      array: Float32Array.from([...first, ...second]),
      needsUpdate: false,
    },
    computeBoundingSphere() {},
  };
}

function identityMatrix(translationX) {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    translationX, 0, 0, 1,
  ];
}
