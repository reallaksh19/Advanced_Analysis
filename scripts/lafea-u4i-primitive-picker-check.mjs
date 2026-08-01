#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createThreePrimitivePicker } from '../src/workspace/lafea-canvas/three-primitive-picker.js';

class FakeCanvas {
  constructor() {
    this.dataset = { ready: 'true' };
    this.rect = { left: 10, top: 20, width: 100, height: 50 };
  }
  getBoundingClientRect() { return { ...this.rect }; }
}

function fakeThree() {
  const api = {
    intersections: [{ faceIndex: 2 }],
    lastCamera: null,
    lastObjects: null,
    lastPointer: null,
    lastRecursive: null,
  };
  api.Vector2 = class {
    constructor() { this.x = 0; this.y = 0; }
  };
  api.Raycaster = class {
    setFromCamera(pointer, cameraValue) {
      api.lastPointer = { x: pointer.x, y: pointer.y };
      api.lastCamera = cameraValue;
    }
    intersectObjects(objectValues, recursive) {
      api.lastObjects = objectValues;
      api.lastRecursive = recursive;
      return api.intersections;
    }
  };
  return api;
}

function run() {
  const canvas = new FakeCanvas();
  const THREE = fakeThree();
  const camera = Object.freeze({ camera: true });
  const objects = Object.freeze([{ mesh: true }]);
  let rendered = { ready: true, objects, camera };
  const picker = createThreePrimitivePicker(THREE, canvas, () => rendered);

  const pick = picker.pickClientPoint({ clientX: 60, clientY: 45 });
  assert.deepEqual(pick, {
    drawGroup: 'TRIANGLES',
    primitiveIndex: 2,
  });
  assert.equal(Object.isFrozen(pick), true);
  assert.deepEqual(Object.keys(pick), ['drawGroup', 'primitiveIndex']);
  for (const forbidden of [
    'sourceEntityId', 'meshEntityId', 'entityRole', 'nodeId', 'elementId',
  ]) {
    assert.equal(forbidden in pick, false);
  }
  assert.strictEqual(THREE.lastCamera, camera);
  assert.strictEqual(THREE.lastObjects, objects);
  assert.equal(THREE.lastRecursive, false);
  assert.equal(THREE.lastPointer.x, 0);
  assert.equal(THREE.lastPointer.y, 0);

  THREE.intersections = [];
  assert.equal(picker.pickClientPoint({ clientX: 60, clientY: 45 }), null);
  THREE.intersections = [{ faceIndex: null }, { faceIndex: 1 }];
  assert.equal(
    picker.pickClientPoint({ clientX: 10, clientY: 20 }).primitiveIndex,
    1,
  );
  assert.equal(THREE.lastPointer.x, -1);
  assert.equal(THREE.lastPointer.y, 1);

  rendered = { ready: false, objects, camera };
  assert.throws(
    () => picker.pickClientPoint({ clientX: 10, clientY: 20 }),
    (error) => error.code === 'LAFEA_THREE_PICK_SCENE_NOT_READY',
  );
  rendered = { ready: true, objects: [], camera };
  assert.throws(
    () => picker.pickClientPoint({ clientX: 10, clientY: 20 }),
    (error) => error.code === 'LAFEA_THREE_PICK_SCENE_NOT_READY',
  );
  rendered = { ready: true, objects, camera };
  assert.throws(
    () => picker.pickClientPoint({ clientX: Number.NaN, clientY: 20 }),
    (error) => error.code === 'LAFEA_FINITE_VALUE_REQUIRED',
  );
  assert.throws(
    () => picker.pickClientPoint({ clientX: 10, clientY: 20, sourceEntityId: 'FORGED' }),
    (error) => error.code === 'LAFEA_THREE_PICK_POINT_KEYS_INVALID',
  );
  canvas.rect.width = 0;
  assert.throws(
    () => picker.pickClientPoint({ clientX: 10, clientY: 20 }),
    (error) => error.code === 'LAFEA_THREE_PICK_CANVAS_BOUNDS_INVALID',
  );

  assert.throws(
    () => createThreePrimitivePicker({}, new FakeCanvas(), () => rendered),
    (error) => error.code === 'LAFEA_THREE_PRIMITIVE_PICKER_REQUIRED',
  );

  console.log(JSON.stringify({
    check: 'lafea-u4i-primitive-picker',
    status: 'PASS',
    rendererOutputRole: 'DRAW_PRIMITIVE_ONLY',
    engineeringIdentityEmitted: false,
    noHitReturnsNull: true,
    nonfinitePointRejected: true,
    forgedIdentityRejected: true,
  }));
}

run();
