import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertTopologyEditOperationPlan,
  createTopologyEditOperationPlan,
  createUnrepresentableTopologyEditOperationResult,
} from '../src/workspace/topology-edit/professional/topology-edit-operation-plan.js';
import {
  createTopologyEditChangedScope,
} from '../src/workspace/topology-edit/professional/topology-edit-change-scope.js';

function changedScope(basisHash = 'fnv1a64:professional-basis') {
  return createTopologyEditChangedScope({
    basisHash,
    nodeIds: ['node:b'],
    edgeIds: ['edge:P-001', 'edge:P-002'],
    sourceRecordIds: ['P-001', 'P-002'],
    validationNeighbourhoodIds: ['node:a', 'node:b', 'node:c', 'edge:P-001', 'edge:P-002'],
  });
}

function planInput() {
  return {
    operationType: 'EXTEND_EDGE',
    basisHash: 'fnv1a64:professional-basis',
    targetIds: ['node:b', 'edge:P-001'],
    parameters: { endpoint: 'TO', distanceMm: 100 },
    commandIntents: [{
      commandType: 'MOVE_NODE',
      payload: { nodeId: 'node:b', position: { x: 200, y: 0, z: 0 } },
    }],
    changedScope: changedScope(),
    unresolvedEvidence: [{
      code: 'PIPE_SCHEDULE_UNAVAILABLE',
      status: 'UNAVAILABLE',
      targetIds: ['edge:P-001'],
      field: 'schedule',
      details: { source: null },
    }],
  };
}

test('operation plan is deterministic, immutable, and uses governed command intents', () => {
  const input = planInput();
  const left = createTopologyEditOperationPlan(input);
  const right = createTopologyEditOperationPlan({
    ...input,
    targetIds: ['edge:P-001', 'node:b'],
    parameters: { distanceMm: 100, endpoint: 'TO' },
  });

  assert.deepEqual(left, right);
  assert.equal(left.status, 'PLANNED');
  assert.equal(left.commandIntents.length, 1);
  assert.equal(left.commandIntents[0].sequence, 0);
  assert.equal(left.commandIntents[0].commandType, 'MOVE_NODE');
  assert.equal(Object.isFrozen(left), true);
  assert.equal(Object.isFrozen(left.parameters), true);
  assert.equal(Object.isFrozen(left.commandIntents[0].payload), true);
  assert.deepEqual(assertTopologyEditOperationPlan(left), left);
});

test('command intent order remains semantic for atomic plans', () => {
  const base = planInput();
  const first = createTopologyEditOperationPlan({
    ...base,
    operationType: 'CREATE_ORTHOGONAL_OFFSET',
    commandIntents: [
      { commandType: 'DISCONNECT_ENDPOINT', payload: { edgeId: 'edge:P-001', endpoint: 'TO' } },
      { commandType: 'ADD_STRAIGHT_ELEMENT', payload: { fromNodeId: 'node:b', toNodeId: 'node:c' } },
    ],
  });
  const reversed = createTopologyEditOperationPlan({
    ...base,
    operationType: 'CREATE_ORTHOGONAL_OFFSET',
    commandIntents: [...first.commandIntents].reverse(),
  });
  assert.notEqual(first.planHash, reversed.planHash);
});

test('operation plan fails closed on stale scope, undeclared targets, bad commands, and non-finite data', () => {
  const input = planInput();
  assert.throws(() => createTopologyEditOperationPlan({
    ...input,
    changedScope: changedScope('fnv1a64:stale'),
  }), /basisHash does not match/i);
  assert.throws(() => createTopologyEditOperationPlan({
    ...input,
    targetIds: ['edge:P-003'],
  }), /absent from changedScope/i);
  assert.throws(() => createTopologyEditOperationPlan({
    ...input,
    commandIntents: [{ commandType: 'ROTATE_MAGIC', payload: {} }],
  }), /unsupported governed command/i);
  assert.throws(() => createTopologyEditOperationPlan({
    ...input,
    parameters: { distanceMm: Number.NaN },
  }), /finite numbers/i);
  assert.throws(() => createTopologyEditOperationPlan({
    ...input,
    targetIds: ['P-001'],
  }), /exact canonical IDs/i);

  const plan = createTopologyEditOperationPlan(input);
  const tampered = { ...plan, parameters: { ...plan.parameters, distanceMm: 101 } };
  assert.throws(() => assertTopologyEditOperationPlan(tampered), /normalized authority/i);
});

test('unrepresentable result is explicit and deterministic without inventing a command', () => {
  const left = createUnrepresentableTopologyEditOperationResult({
    operationType: 'APPLY_DECLARED_SLOPE',
    basisHash: 'fnv1a64:professional-basis',
    targetIds: ['edge:P-002', 'edge:P-001'],
    reasonCode: 'SEMANTIC_LOSS_WITH_CURRENT_COMMANDS',
    reason: 'Current commands cannot preserve the declared connected-run slope atomically.',
  });
  const right = createUnrepresentableTopologyEditOperationResult({
    operationType: 'APPLY_DECLARED_SLOPE',
    basisHash: 'fnv1a64:professional-basis',
    targetIds: ['edge:P-001', 'edge:P-002'],
    reasonCode: 'SEMANTIC_LOSS_WITH_CURRENT_COMMANDS',
    reason: 'Current commands cannot preserve the declared connected-run slope atomically.',
  });

  assert.deepEqual(left, right);
  assert.equal(left.status, 'UNREPRESENTABLE_WITH_CURRENT_COMMANDS');
  assert.equal(Object.isFrozen(left), true);
  assert.equal('commandIntents' in left, false);
});
