import test from 'node:test';
import assert from 'node:assert/strict';
import {
  constrainTopologyEditTarget,
} from '../src/workspace/viewport-interaction/topology-edit-drag-constraint.js';
import {
  createTopologyEditGizmoModel,
} from '../src/workspace/viewport-interaction/topology-edit-gizmo-model.js';
import {
  createTopologyEditInteractionPreview,
} from '../src/workspace/viewport-interaction/topology-edit-interaction-preview.js';
import {
  createTopologyEditNumericEntry,
  formatTopologyEditMm,
  parseTopologyEditDecimal,
} from '../src/workspace/viewport-interaction/topology-edit-numeric-entry.js';
import {
  createTopologyEditTransformIntent,
  compileTopologyEditMoveNodePayload,
} from '../src/workspace/viewport-interaction/topology-edit-transform-intent.js';

const BASIS = 'fnv1a64:basis000000000000';
const ANCHOR = Object.freeze({ x: 10, y: 20, z: 30 });

test('axis and plane constraints lock exact coordinates', () => {
  const target = { x: 15, y: 25, z: 35 };
  assert.deepEqual(
    constrainTopologyEditTarget({
      mode: 'AXIS_X',
      anchorPosition: ANCHOR,
      pointerTarget: target,
    }).targetPosition,
    { x: 15, y: 20, z: 30 },
  );
  assert.deepEqual(
    constrainTopologyEditTarget({
      mode: 'PLANE_YZ',
      anchorPosition: ANCHOR,
      pointerTarget: target,
    }).targetPosition,
    { x: 10, y: 25, z: 35 },
  );
});

test('transform intent is deterministic, immutable, and canonical', () => {
  const input = {
    nodeId: 'node:P-001:TO',
    basisHash: BASIS,
    source: 'DRAG',
    mode: 'AXIS_X',
    anchorPosition: ANCHOR,
    targetPosition: { x: 13, y: 999, z: -999 },
  };
  const left = createTopologyEditTransformIntent(input);
  const right = createTopologyEditTransformIntent({ ...input });
  assert.deepEqual(left, right);
  assert.equal(left.targetPosition.y, 20);
  assert.equal(left.targetPosition.z, 30);
  assert.equal(Object.isFrozen(left), true);
  assert.equal(Object.isFrozen(left.targetPosition), true);
  assert.throws(
    () => createTopologyEditTransformIntent({ ...input, nodeId: 'P-001' }),
    /canonical node ID/i,
  );
  assert.throws(
    () => createTopologyEditTransformIntent({
      ...input,
      targetPosition: { x: Number.NaN, y: 0, z: 0 },
    }),
    /finite/i,
  );
  assert.throws(
    () => createTopologyEditTransformIntent({ ...input, units: 'IN' }),
    /units must be MM/i,
  );
});

test('typed and dragged targets compile to identical MOVE_NODE payloads', () => {
  const numeric = createTopologyEditNumericEntry({
    entryMode: 'DELTA',
    anchorPosition: ANCHOR,
    values: { x: '3.000', y: '0', z: '0' },
  });
  const dragged = createTopologyEditTransformIntent({
    nodeId: 'node:P-001:TO',
    basisHash: BASIS,
    source: 'DRAG',
    mode: 'AXIS_X',
    anchorPosition: ANCHOR,
    targetPosition: numeric.targetPosition,
  });
  const typed = createTopologyEditTransformIntent({
    nodeId: 'node:P-001:TO',
    basisHash: BASIS,
    source: 'NUMERIC',
    mode: 'FREE',
    anchorPosition: ANCHOR,
    targetPosition: numeric.targetPosition,
  });
  assert.deepEqual(
    compileTopologyEditMoveNodePayload(dragged),
    compileTopologyEditMoveNodePayload(typed),
  );
});

test('numeric parsing is locale-independent and formatting is stable', () => {
  assert.equal(parseTopologyEditDecimal(' 20.000 '), 20);
  assert.equal(parseTopologyEditDecimal('.001'), 0.001);
  assert.equal(formatTopologyEditMm(20), '20');
  assert.equal(formatTopologyEditMm(3.125), '3.125');
  for (const invalid of ['', '1,5', '1e3', '20 mm']) {
    assert.throws(() => parseTopologyEditDecimal(invalid), /decimal/i);
  }
});

test('gizmo model has six explicit handles and camera-aware scale', () => {
  const near = createTopologyEditGizmoModel({
    nodeId: 'node:P-001:TO',
    basisHash: BASIS,
    anchorPosition: ANCHOR,
    cameraDistanceMm: 1000,
    viewportHeightPx: 1000,
    perspectiveFovDeg: 60,
  });
  const far = createTopologyEditGizmoModel({
    nodeId: 'node:P-001:TO',
    basisHash: BASIS,
    anchorPosition: ANCHOR,
    cameraDistanceMm: 2000,
    viewportHeightPx: 1000,
    perspectiveFovDeg: 60,
  });
  assert.equal(near.handles.length, 6);
  assert.equal(far.scaleMm, near.scaleMm * 2);
  assert.equal(near.anchorMarker.pickable, false);
  assert.equal(near.handles.every((handle) => handle.pickable), true);
});

test('interaction preview remains display-only and compiles exact target', () => {
  const intent = createTopologyEditTransformIntent({
    nodeId: 'node:P-001:TO',
    basisHash: BASIS,
    source: 'KEYBOARD',
    mode: 'AXIS_X',
    anchorPosition: ANCHOR,
    targetPosition: { x: 13, y: 20, z: 30 },
  });
  const preview = createTopologyEditInteractionPreview({ intent });
  assert.equal(preview.displayOnly, true);
  assert.equal(preview.pickable, false);
  assert.equal(preview.canApply, true);
  assert.deepEqual(preview.movePayload, {
    nodeId: 'node:P-001:TO',
    position: { x: 13, y: 20, z: 30 },
  });
});
