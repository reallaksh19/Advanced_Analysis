import assert from 'node:assert/strict';
import {
  createTopologyEditLargeModelPolicy,
  TOPOLOGY_EDIT_LARGE_MODEL_TIERS,
} from '../src/workspace/topology-edit/topology-edit-large-model-policy.js';
import {
  selectTopologyEditObjectTreeWindow,
} from '../src/workspace/viewport-productivity/topology-edit-object-tree-runtime.js';

{
  const policy = createTopologyEditLargeModelPolicy({
    model: modelWithItems(200),
    devicePixelRatio: 3,
    viewportWidth: 1600,
    viewportHeight: 900,
  });
  assert.equal(policy.tier, TOPOLOGY_EDIT_LARGE_MODEL_TIERS.STANDARD);
  assert.equal(policy.pixelRatio, 2);
  assert.equal(policy.renderItemCount, 200);
  assert.equal(policy.gpuFirstPicking, true);
}

{
  const policy = createTopologyEditLargeModelPolicy({
    model: modelWithItems(2_500),
    devicePixelRatio: 2.5,
    viewportWidth: 1600,
    viewportHeight: 900,
  });
  assert.equal(policy.tier, TOPOLOGY_EDIT_LARGE_MODEL_TIERS.LARGE);
  assert.equal(policy.pixelRatio, 1.5);
  assert.equal(policy.objectTreeInitialRows, 160);
}

{
  const policy = createTopologyEditLargeModelPolicy({
    model: modelWithItems(12_000),
    devicePixelRatio: 2,
    viewportWidth: 1600,
    viewportHeight: 900,
  });
  assert.equal(policy.tier, TOPOLOGY_EDIT_LARGE_MODEL_TIERS.MASSIVE);
  assert.equal(policy.pixelRatio, 1);
  assert.equal(policy.objectTreeRowIncrement, 120);
}

{
  const items = Array.from({ length: 1_000 }, (_, index) => ({
    canonicalId: `edge:${String(index).padStart(4, '0')}`,
  }));
  const selectedId = items[900].canonicalId;
  const window = selectTopologyEditObjectTreeWindow(items, new Set([selectedId]), 160);
  assert.equal(window.items.length, 161);
  assert.equal(window.items[0], items[0]);
  assert.equal(window.items[159], items[159]);
  assert.equal(window.items.at(-1).canonicalId, selectedId);
  assert.equal(window.remainingCount, 839);
  assert.deepEqual(
    window.items.map((item) => item.canonicalId),
    [...window.items.map((item) => item.canonicalId)].sort(),
    'The window must preserve deterministic canonical order while retaining selected rows.',
  );
}

console.log('PASS topology-edit deterministic large-model policy and bounded object tree');

function modelWithItems(count) {
  const half = Math.floor(count / 2);
  return {
    source: {
      compactSegments: Array.from({ length: half }, () => ({})),
      compactElements: [],
    },
    draft: {
      compactSegments: Array.from({ length: count - half }, () => ({})),
      compactElements: [],
    },
    supports: {
      glyphOverlays: [],
    },
  };
}
