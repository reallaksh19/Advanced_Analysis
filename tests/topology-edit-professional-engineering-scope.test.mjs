import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertTopologyEditChangedScope,
  assertTopologyEditScopeBasis,
  createTopologyEditChangedScope,
  deriveTopologyEditChangedScope,
} from '../src/workspace/topology-edit/professional/topology-edit-change-scope.js';

function fixtureTopology(reverse = false) {
  const rows = {
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 }, portKeys: ['P-001:port:start'] },
      { id: 'node:b', position: { x: 100, y: 0, z: 0 }, portKeys: ['P-001:port:end', 'P-002:port:start'] },
      { id: 'node:c', position: { x: 200, y: 0, z: 0 }, portKeys: ['P-002:port:end'] },
      { id: 'node:d', position: { x: 100, y: 100, z: 0 }, portKeys: ['P-003:port:end'] },
    ],
    edges: [
      { id: 'edge:P-001', componentKey: 'P-001', fromNodeId: 'node:a', toNodeId: 'node:b' },
      { id: 'edge:P-002', componentKey: 'P-002', fromNodeId: 'node:b', toNodeId: 'node:c' },
      { id: 'edge:P-003', componentKey: 'P-003', fromNodeId: 'node:b', toNodeId: 'node:d' },
    ],
    junctions: [{
      id: 'junction:T-001',
      componentKey: 'T-001',
      nodeIds: ['node:b', 'node:c', 'node:d'],
    }],
    supports: [{ id: 'support:S-001', entityId: 'S-001', nodeId: 'node:b' }],
    boundaries: [{ id: 'boundary:B-001', nodeId: 'node:a' }],
  };
  if (reverse) Object.values(rows).forEach((value) => value.reverse());
  return {
    canonicalTopologyHash: 'fnv1a64:professional-basis',
    ...rows,
    crosswalk: {
      nodeIdToPortKeys: {
        'node:a': ['P-001:port:start'],
        'node:b': ['P-002:port:start', 'P-001:port:end'],
        'node:c': ['P-002:port:end'],
        'node:d': ['P-003:port:end'],
      },
      edgeIdToComponentKey: {
        'edge:P-001': 'P-001',
        'edge:P-002': 'P-002',
        'edge:P-003': 'P-003',
      },
      junctionIdToComponentKey: { 'junction:T-001': 'T-001' },
      supportIdToEntityId: { 'support:S-001': 'S-001' },
    },
  };
}

test('changed scope is deterministic, complete, and source-crosswalk aware', () => {
  const left = deriveTopologyEditChangedScope(fixtureTopology(), {
    nodeIds: ['node:b'],
  });
  const right = deriveTopologyEditChangedScope(fixtureTopology(true), {
    nodeIds: ['node:b'],
  });

  assert.deepEqual(left, right);
  assert.deepEqual(left.nodeIds, ['node:b']);
  assert.deepEqual(left.edgeIds, ['edge:P-001', 'edge:P-002', 'edge:P-003']);
  assert.deepEqual(left.junctionIds, ['junction:T-001']);
  assert.deepEqual(left.supportIds, ['support:S-001']);
  assert.deepEqual(left.boundaryIds, []);
  assert.deepEqual(left.sourceRecordIds, [
    'P-001',
    'P-001:port:end',
    'P-002',
    'P-002:port:start',
    'P-003',
    'S-001',
    'T-001',
  ]);
  assert.deepEqual(left.validationNeighbourhoodIds, [
    'boundary:B-001',
    'edge:P-001',
    'edge:P-002',
    'edge:P-003',
    'junction:T-001',
    'node:a',
    'node:b',
    'node:c',
    'node:d',
    'support:S-001',
  ]);
  assert.equal(Object.isFrozen(left), true);
  assert.equal(Object.isFrozen(left.edgeIds), true);
  assert.deepEqual(assertTopologyEditChangedScope(left), left);
});

test('direct changed-scope normalization is collection-order stable', () => {
  const left = createTopologyEditChangedScope({
    basisHash: 'fnv1a64:professional-basis',
    nodeIds: ['node:b', 'node:a'],
    edgeIds: ['edge:P-002', 'edge:P-001'],
    sourceRecordIds: ['P-002', 'P-001'],
    validationNeighbourhoodIds: ['node:b', 'edge:P-001'],
  });
  const right = createTopologyEditChangedScope({
    basisHash: 'fnv1a64:professional-basis',
    nodeIds: ['node:a', 'node:b', 'node:a'],
    edgeIds: ['edge:P-001', 'edge:P-002'],
    sourceRecordIds: ['P-001', 'P-002'],
    validationNeighbourhoodIds: ['edge:P-001', 'node:b'],
  });

  assert.deepEqual(left, right);
  assert.equal(left.changedScopeHash, right.changedScopeHash);
});

test('changed scope rejects stale, unknown, malformed, and tampered authority', () => {
  const topology = fixtureTopology();
  const stale = createTopologyEditChangedScope({
    basisHash: 'fnv1a64:stale',
    nodeIds: ['node:a'],
  });
  assert.throws(() => assertTopologyEditScopeBasis(topology, stale), /stale basis/i);
  assert.throws(() => deriveTopologyEditChangedScope(topology, {
    edgeIds: ['edge:missing'],
  }), /unknown canonical ID/i);
  assert.throws(() => createTopologyEditChangedScope({
    basisHash: topology.canonicalTopologyHash,
    nodeIds: ['P-001'],
  }), /exact node canonical IDs/i);

  const scope = deriveTopologyEditChangedScope(topology, { nodeIds: ['node:b'] });
  const tampered = { ...scope, edgeIds: ['edge:P-001'] };
  assert.throws(() => assertTopologyEditChangedScope(tampered), /normalized authority/i);
});
