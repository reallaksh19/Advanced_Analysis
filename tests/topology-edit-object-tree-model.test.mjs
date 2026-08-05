import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertTopologyEditObjectTree,
  createTopologyEditObjectTree,
  filterTopologyEditObjectTree,
} from '../src/workspace/viewport-productivity/topology-edit-object-tree-model.js';

function topology(overrides = {}) {
  return {
    canonicalTopologyHash: 'fnv1a64:tree-base',
    nodes: [
      { id: 'node:b', position: { x: 100, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:a', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [{
      id: 'edge:host',
      componentKey: 'P-001',
      fromNodeId: 'node:a',
      toNodeId: 'node:b',
      entityType: 'PIPE',
      diameterMm: 100,
    }],
    junctions: [{
      id: 'junction:tee',
      componentKey: 'T-001',
      entityType: 'TEE',
      nodeIds: ['node:a', 'node:b'],
    }],
    supports: [{
      id: 'support:guide',
      entityId: 'S-001',
      nodeId: 'node:a',
      restraintType: 'GUIDE',
    }],
    boundaries: [{
      id: 'boundary:anchor',
      entityId: 'B-001',
      nodeId: 'node:b',
      boundaryType: 'ANCHOR',
    }],
    rigids: [{
      id: 'rigid:one',
      entityId: 'RG-001',
      entityType: 'RIGID',
      fromNodeId: 'node:a',
      toNodeId: 'node:b',
    }],
    bends: [{
      id: 'bend:one',
      entityId: 'BD-001',
      entityType: 'ELBOW',
      radiusMm: 150,
    }],
    ...overrides,
  };
}

test('object tree is deterministic, complete, and content addressed', () => {
  const first = createTopologyEditObjectTree(topology());
  const second = createTopologyEditObjectTree(topology({
    nodes: [...topology().nodes].reverse(),
  }));

  assert.equal(first.treeHash, second.treeHash);
  assert.equal(first.totalCount, 8);
  assert.deepEqual(first.groups.map((group) => [group.key, group.count]), [
    ['nodes', 2],
    ['edges', 1],
    ['junctions', 1],
    ['supports', 1],
    ['boundaries', 1],
    ['rigids', 1],
    ['bends', 1],
  ]);
  assert.deepEqual(
    first.groups[0].items.map((item) => item.canonicalId),
    ['node:a', 'node:b'],
  );
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.groups[0].items), true);
  assert.equal(assertTopologyEditObjectTree(first), first);
});

test('tree exposes only existing governed single-object actions', () => {
  const value = createTopologyEditObjectTree(topology());
  const node = value.groups.find((group) => group.kind === 'NODE').items[0];
  const edge = value.groups.find((group) => group.kind === 'EDGE').items[0];
  const support = value.groups.find((group) => group.kind === 'SUPPORT').items[0];

  assert.deepEqual(node.actions.map((action) => action.id), ['move-positive-z']);
  assert.deepEqual(edge.actions.map((action) => action.id), [
    'split-edge-half',
    'disconnect-from',
    'disconnect-to',
    'delete-edge',
  ]);
  assert.deepEqual(support.actions, []);
});

test('filtering searches exact canonical and engineering evidence without changing authority', () => {
  const value = createTopologyEditObjectTree(topology());
  const pipe = filterTopologyEditObjectTree(value, 'P-001');
  const guide = filterTopologyEditObjectTree(value, 'guide');
  const missing = filterTopologyEditObjectTree(value, 'not-present');

  assert.equal(pipe.totalCount, 1);
  assert.equal(pipe.groups.find((group) => group.kind === 'EDGE').items[0].canonicalId, 'edge:host');
  assert.equal(guide.totalCount, 1);
  assert.equal(guide.groups.find((group) => group.kind === 'SUPPORT').items[0].canonicalId, 'support:guide');
  assert.equal(missing.totalCount, 0);
  assert.equal(value.totalCount, 8);
  assert.equal(value.canonicalTopologyHash, pipe.canonicalTopologyHash);
});

test('duplicate or malformed canonical identities fail closed', () => {
  assert.throws(
    () => createTopologyEditObjectTree(topology({
      supports: [{ id: 'edge:host', entityId: 'S-DUP' }],
    })),
    /not a canonical support ID/i,
  );
  assert.throws(
    () => createTopologyEditObjectTree(topology({
      edges: [
        topology().edges[0],
        { ...topology().edges[0] },
      ],
    })),
    /appears more than once/i,
  );
  assert.throws(
    () => assertTopologyEditObjectTree({
      ...createTopologyEditObjectTree(topology()),
      treeHash: 'fnv1a64:tampered',
    }),
    /tree hash does not match/i,
  );
});
