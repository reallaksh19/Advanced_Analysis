import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertNoTopologyEditBlockingDiagnostics,
  topologyEditBlockingDiagnostics,
} from '../src/workspace/topology-edit/professional/topology-edit-validation-blocking.js';

function receipt(finalDiagnostics) {
  return {
    validationScope: {
      ids: {
        nodeIds: ['node:changed'],
        edgeIds: ['edge:changed'],
        junctionIds: [],
        supportIds: [],
        boundaryIds: [],
      },
    },
    finalDiagnostics,
  };
}

test('unrelated legacy HIGH findings do not block an independent changed scope', () => {
  const value = receipt([
    {
      id: 'issue:legacy',
      kind: 'LEGACY_FINDING',
      severity: 'HIGH',
      nodeIds: ['node:outside'],
    },
    {
      id: 'issue:changed-warning',
      kind: 'CHANGED_WARNING',
      severity: 'MEDIUM',
      nodeIds: ['node:changed'],
    },
  ]);
  assert.deepEqual(topologyEditBlockingDiagnostics(value), []);
  assert.equal(assertNoTopologyEditBlockingDiagnostics(value), value);
});

test('HIGH findings on changed-scope targets block acceptance', () => {
  const value = receipt([
    {
      id: 'issue:changed-high',
      kind: 'CHANGED_HIGH',
      severity: 'HIGH',
      edgeId: 'edge:changed',
    },
  ]);
  assert.deepEqual(
    topologyEditBlockingDiagnostics(value).map((row) => row.id),
    ['issue:changed-high'],
  );
  assert.throws(
    () => assertNoTopologyEditBlockingDiagnostics(value),
    /in-scope blocking issue issue:changed-high/i,
  );
});

test('global HIGH findings without targets remain fail-closed blockers', () => {
  const value = receipt([
    {
      id: 'issue:global-high',
      kind: 'GLOBAL_HIGH',
      severity: 'HIGH',
      message: 'Global checker authority failed.',
    },
  ]);
  assert.deepEqual(
    topologyEditBlockingDiagnostics(value).map((row) => row.id),
    ['issue:global-high'],
  );
  assert.throws(
    () => assertNoTopologyEditBlockingDiagnostics(value),
    /issue:global-high/i,
  );
});

test('blocking severity normalization is deterministic and immutable', () => {
  const value = receipt([
    {
      id: 'issue:medium',
      kind: 'MEDIUM',
      severity: 'medium',
      targetIds: ['node:changed'],
    },
  ]);
  const rows = topologyEditBlockingDiagnostics(value, ['MEDIUM', 'medium']);
  assert.equal(rows.length, 1);
  assert.equal(Object.isFrozen(rows), true);
  assert.throws(
    () => topologyEditBlockingDiagnostics(value, []),
    /non-empty array/i,
  );
});
