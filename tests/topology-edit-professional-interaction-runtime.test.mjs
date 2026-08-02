import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TopologyEditInteractionRuntime,
} from '../src/workspace/viewport-interaction/topology-edit-interaction-runtime.js';

const CONTEXT = Object.freeze({
  nodeId: 'node:n2',
  basisHash: 'fnv1a64:runtime-basis',
  anchorPosition: Object.freeze({ x: 100, y: 20, z: 30 }),
});

test('runtime rebases deterministically to exact node identity and basis', () => {
  const left = new TopologyEditInteractionRuntime();
  const right = new TopologyEditInteractionRuntime();
  const first = left.rebase(CONTEXT);
  const second = right.rebase({
    anchorPosition: { z: 30, x: 100, y: 20 },
    basisHash: CONTEXT.basisHash,
    nodeId: CONTEXT.nodeId,
  });
  assert.deepEqual(first, second);
  assert.equal(first.status, 'READY');
  assert.equal(first.nodeId, 'node:n2');
  assert.equal(first.preview, null);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.anchorPosition), true);
  assert.throws(
    () => left.rebase({ ...CONTEXT, nodeId: 'n2' }),
    /canonical node ID/i,
  );
});

test('absolute, delta and magnitude entries produce exact display-only previews', () => {
  const runtime = new TopologyEditInteractionRuntime();
  runtime.rebase(CONTEXT);
  const absolute = runtime.previewNumeric({
    entryMode: 'ABSOLUTE',
    values: { x: '103', y: '20', z: '30' },
    mode: 'FREE',
  });
  assert.deepEqual(absolute.preview.targetPosition, { x: 103, y: 20, z: 30 });
  assert.deepEqual(absolute.preview.movePayload, {
    nodeId: 'node:n2',
    position: { x: 103, y: 20, z: 30 },
  });
  assert.equal(absolute.preview.displayOnly, true);
  assert.equal(absolute.preview.pickable, false);

  runtime.rebase(CONTEXT);
  const delta = runtime.previewNumeric({
    entryMode: 'DELTA',
    values: { x: '3', y: '0', z: '0' },
    mode: 'FREE',
  });
  assert.deepEqual(delta.preview.targetPosition, absolute.preview.targetPosition);
  assert.deepEqual(runtime.compileApply().payload, absolute.preview.movePayload);

  runtime.rebase(CONTEXT);
  const magnitude = runtime.previewNumeric({
    entryMode: 'MAGNITUDE',
    magnitudeMm: '3',
    direction: { x: 1, y: 0, z: 0 },
    mode: 'AXIS_X',
  });
  assert.deepEqual(magnitude.preview.targetPosition, absolute.preview.targetPosition);
});

test('nudge accumulates from the current preview using explicit increments', () => {
  const runtime = new TopologyEditInteractionRuntime();
  runtime.rebase(CONTEXT);
  runtime.nudge({ axis: 'X', direction: 1, incrementMm: 2 });
  const second = runtime.nudge({ axis: 'X', direction: -1, incrementMm: 0.5 });
  assert.deepEqual(second.preview.targetPosition, { x: 101.5, y: 20, z: 30 });
  assert.deepEqual(second.preview.delta, { x: 1.5, y: 0, z: 0 });
  assert.throws(
    () => runtime.nudge({ axis: 'Q', direction: 1, incrementMm: 1 }),
    /Unsupported nudge axis/,
  );
  assert.throws(
    () => runtime.nudge({ axis: 'X', direction: 0, incrementMm: 1 }),
    /direction must be -1 or 1/,
  );
});

test('cancel clears preview without changing exact runtime basis or anchor', () => {
  const runtime = new TopologyEditInteractionRuntime();
  runtime.rebase(CONTEXT);
  const before = runtime.snapshot();
  runtime.nudge({ axis: 'Z', direction: 1, incrementMm: 5 });
  const cancelled = runtime.cancel();
  assert.equal(cancelled.status, 'READY');
  assert.equal(cancelled.nodeId, before.nodeId);
  assert.equal(cancelled.basisHash, before.basisHash);
  assert.deepEqual(cancelled.anchorPosition, before.anchorPosition);
  assert.equal(cancelled.intent, null);
  assert.equal(cancelled.preview, null);
  assert.throws(() => runtime.compileApply(), /moving interaction preview/);
});

test('compile rejects zero movement and stale detached preview material', () => {
  const runtime = new TopologyEditInteractionRuntime();
  runtime.rebase(CONTEXT);
  runtime.previewNumeric({
    entryMode: 'DELTA',
    values: { x: '0', y: '0', z: '0' },
    mode: 'FREE',
  });
  assert.throws(() => runtime.compileApply(), /moving interaction preview/);

  runtime.rebase(CONTEXT);
  const moving = runtime.previewNumeric({
    entryMode: 'DELTA',
    values: { x: '3', y: '0', z: '0' },
    mode: 'FREE',
  });
  assert.notEqual(moving.preview.previewHash, '');
  runtime.rebase({ ...CONTEXT, basisHash: 'fnv1a64:new-basis' });
  assert.equal(runtime.snapshot().preview, null);
  assert.throws(() => runtime.compileApply(), /moving interaction preview/);
});
