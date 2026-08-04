import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertNoTopologyEditBlockingDiagnostics,
  topologyEditBlockingDiagnostics,
} from '../src/workspace/topology-edit/professional/topology-edit-validation-blocking.js';

function receipt(finalDiagnostics, baselineDiagnostics = []) {
  return {
    validationScope: {
      ids: {
        nodeIds: ['node:changed'],
        edgeIds: ['edge:changed'],
        junctionIds: [],
        supportIds: ['support:changed'],
        boundaryIds: [],
      },
    },
    baselineDiagnostics,
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

test('an exact targeted inherited HIGH finding does not block an unrelated operation', () => {
  const inherited = {
    id: 'issue:UNRESOLVED_RESTRAINT_DIRECTION:support:changed',
    kind: 'UNRESOLVED_RESTRAINT_DIRECTION',
    severity: 'HIGH',
    supportId: 'support:changed',
    nodeId: 'node:changed',
    message: 'Support direction is unresolved.',
    details: { axis: null, restraintType: 'GUIDE' },
  };
  const value = receipt([
    { ...inherited, durationMs: 200, timings: { checkerMs: 99 } },
  ], [
    { ...inherited, durationMs: 2, timings: { checkerMs: 1 } },
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

test('same issue ID with changed engineering evidence remains a blocker', () => {
  const baseline = {
    id: 'issue:changed-high',
    kind: 'CHANGED_HIGH',
    severity: 'MEDIUM',
    edgeId: 'edge:changed',
    message: 'Clearance is approaching the limit.',
    details: { clearanceMm: 12 },
  };
  const worsened = {
    ...baseline,
    severity: 'HIGH',
    message: 'Clearance is below the limit.',
    details: { clearanceMm: 2 },
  };
  const value = receipt([worsened], [baseline]);
  assert.deepEqual(
    topologyEditBlockingDiagnostics(value).map((row) => row.id),
    ['issue:changed-high'],
  );
});

test('global HIGH findings without targets remain fail-closed blockers even when inherited', () => {
  const global = {
    id: 'issue:global-high',
    kind: 'GLOBAL_HIGH',
    severity: 'HIGH',
    message: 'Global checker authority failed.',
  };
  const value = receipt([global], [global]);
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
  assert.throws(
    () => topologyEditBlockingDiagnostics({
      ...value,
      baselineDiagnostics: {},
    }),
    /baselineDiagnostics must be an array/i,
  );
});
