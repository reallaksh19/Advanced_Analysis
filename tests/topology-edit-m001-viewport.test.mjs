import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { ThreeInteractionArbiter } from '../src/workspace/three-interaction-arbiter.js';
import {
  assertTopologyEditCoordinateTransform,
  engineeringBoundsToRender,
  engineeringPlaneToRender,
  engineeringPointToRender,
  renderPointToEngineering,
} from '../src/workspace/topology-edit/topology-edit-coordinate-transform.js';
import { buildTopologyEditRenderPacket } from '../src/workspace/topology-edit/topology-edit-render-packet.js';
import {
  assertTopologyEditViewportConfiguration,
} from '../src/workspace/topology-edit/topology-edit-viewport-configuration.js';
import { TopologyEditViewportBackend } from '../src/workspace/topology-edit/topology-edit-viewport-backend.js';

const CONFIGURATION = {
  supportMarkerSize: 70,
  pickingRadius: 28,
  cameraFitMargin: 1.25,
  clickTimingMs: 300,
  doubleClickTimingMs: 300,
  clickTravelTolerancePx: 5,
  zoomRate: 1,
  navigationSensitivity: 1,
  perspectiveFovDeg: 45,
  meshRadialSegments: 12,
  cameraNearMm: 0.1,
  cameraFarMm: 1_000_000,
};

test('approved engineering Z-up transform is reversible and right-handed', () => {
  const evidence = assertTopologyEditCoordinateTransform();
  assert.equal(evidence.determinant, 1);
  assert.deepEqual(engineeringPointToRender({ x: 2, y: 3, z: 5 }), { x: 2, y: 5, z: -3 });
  assert.deepEqual(renderPointToEngineering({ x: 2, y: 5, z: -3 }), { x: 2, y: 3, z: 5 });

  const a = new THREE.Vector3(2, -3, 5);
  const b = new THREE.Vector3(-7, 11, 13);
  const ta = vector(engineeringPointToRender(a));
  const tb = vector(engineeringPointToRender(b));
  const crossThenTransform = vector(engineeringPointToRender(a.clone().cross(b)));
  assert.ok(crossThenTransform.distanceTo(ta.clone().cross(tb)) < 1e-12);
  assert.ok(Math.abs(a.distanceTo(b) - ta.distanceTo(tb)) < 1e-12);
});

test('engineering plane inclusion is equivalent after render-plane transformation', () => {
  const plane = { normal: { x: 1, y: -2, z: 3 }, constant: -17 };
  const renderPlane = engineeringPlaneToRender(plane);
  for (const point of [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: -4, z: 2 },
    { x: -11, y: 7, z: 31 },
    { x: 17, y: 0, z: 0 },
  ]) {
    const renderPoint = engineeringPointToRender(point);
    assert.equal(inside(point, plane), inside(renderPoint, renderPlane));
  }
});

test('bounds transform recomputes the render AABB from all engineering corners', () => {
  assert.deepEqual(engineeringBoundsToRender({
    min: { x: -4, y: -6, z: -8 },
    max: { x: 10, y: 12, z: 14 },
  }), {
    min: { x: -4, y: -8, z: -12 },
    max: { x: 10, y: 14, z: 6 },
  });
});

test('viewport configuration fails closed for missing or conflicting policy values', () => {
  assert.equal(assertTopologyEditViewportConfiguration(CONFIGURATION).schema, 'TopologyEditViewportConfiguration.v1');
  assert.throws(
    () => assertTopologyEditViewportConfiguration({ ...CONFIGURATION, clickTimingMs: null }),
    (error) => error.code === 'TOPOLOGY_EDIT_VIEWPORT_CONFIGURATION_INVALID',
  );
  assert.throws(
    () => assertTopologyEditViewportConfiguration({ ...CONFIGURATION, cameraFarMm: 0.01 }),
    (error) => error.code === 'TOPOLOGY_EDIT_VIEWPORT_CONFIGURATION_INVALID',
  );
});

test('production render-packet chain stays immutable across render materialization', () => {
  const base = topology('base-hash', 0);
  const draft = topology('draft-hash', 25);
  const beforeBase = semanticHash(base);
  const beforeDraft = semanticHash(draft);
  const packet = buildTopologyEditRenderPacket(base, draft);
  const backend = new TopologyEditViewportBackend({ navigationConfiguration: CONFIGURATION });

  backend.renderSession(packet);

  assert.equal(semanticHash(base), beforeBase);
  assert.equal(semanticHash(draft), beforeDraft);
  assert.deepEqual(base.nodes[0].position, { x: 0, y: 10, z: 20 });
  assert.deepEqual(draft.nodes[0].position, { x: 25, y: 10, z: 20 });
  assert.deepEqual(
    new THREE.Vector3(0, 10, 20).applyMatrix4(backend.engineeringRoot.matrix).toArray(),
    [0, 20, -10],
  );
  backend.destroy();
});

test('section planes and pick receipts cross the coordinate boundary exactly once', () => {
  const backend = new TopologyEditViewportBackend({ navigationConfiguration: CONFIGURATION });
  backend.setPresentationSectionPlanes([
    { normal: { x: 1, y: 0, z: 0 }, constant: 10 },
    { normal: { x: -1, y: 0, z: 0 }, constant: 10 },
    { normal: { x: 0, y: 1, z: 0 }, constant: 20 },
    { normal: { x: 0, y: -1, z: 0 }, constant: 20 },
    { normal: { x: 0, y: 0, z: 1 }, constant: 30 },
    { normal: { x: 0, y: 0, z: -1 }, constant: 30 },
  ]);
  assert.deepEqual(backend.activeRenderSectionPlaneEquations[4], {
    normal: { x: 0, y: 1, z: 0 },
    constant: 30,
  });
  const pick = backend.pickReceipt(
    { objectKind: 'node', objectId: 'node:1', nodeId: 'node:1' },
    new THREE.Vector3(4, 9, -7),
  );
  assert.deepEqual(pick.point, { x: 4, y: 7, z: 9 });
  backend.destroy();
});

test('ray fallback preserves exact instanced identity and rejects sectioned render hits', () => {
  const backend = new TopologyEditViewportBackend({ navigationConfiguration: CONFIGURATION });
  const object = new THREE.Object3D();
  object.userData.pickTable = [
    { objectKind: 'node', objectId: 'node:0', nodeId: 'node:0' },
    { objectKind: 'node', objectId: 'node:1', nodeId: 'node:1' },
  ];
  backend.groups.sourceGroup.add(object);
  backend.setPresentationSectionPlanes([
    { normal: { x: 1, y: 0, z: 0 }, constant: 10 },
    { normal: { x: -1, y: 0, z: 0 }, constant: 10 },
    { normal: { x: 0, y: 1, z: 0 }, constant: 20 },
    { normal: { x: 0, y: -1, z: 0 }, constant: 20 },
    { normal: { x: 0, y: 0, z: 1 }, constant: 30 },
    { normal: { x: 0, y: 0, z: -1 }, constant: 30 },
  ]);
  backend.pickRaycaster = raycaster([
    { object, instanceId: 0, point: new THREE.Vector3(50, 0, 0) },
    { object, instanceId: 1, point: new THREE.Vector3(1, 2, 3) },
  ]);
  const pick = backend.pickWithRaycaster(new THREE.Vector2());
  assert.equal(pick.objectId, 'node:1');
  assert.deepEqual(pick.point, { x: 1, y: -3, z: 2 });
  backend.destroy();
});

test('shared interaction arbiter emits selection only after a qualified pointerup', () => {
  const priorPerformance = globalThis.performance;
  let now = 0;
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: { now: () => now },
  });
  try {
    const document = new EventTargetFixture();
    const canvas = new EventTargetFixture();
    canvas.ownerDocument = document;
    const controls = { enabled: true, enableRotate: false, enablePan: false, enableZoom: false };
    let selections = 0;
    let fits = 0;
    const arbiter = new ThreeInteractionArbiter(
      canvas,
      controls,
      { onSelect: () => { selections += 1; }, onFitSelection: () => { fits += 1; } },
      { clickTravelTolerancePx: 5, clickTimingMs: 300, doubleClickTimingMs: 300 },
    );

    canvas.emit('pointerdown', pointer(1, 10, 10));
    now = 25;
    canvas.emit('pointerup', pointer(1, 12, 12));
    assert.equal(selections, 1);

    now = 100;
    canvas.emit('pointerdown', pointer(2, 10, 10));
    canvas.emit('pointermove', pointer(2, 40, 10));
    now = 125;
    canvas.emit('pointerup', pointer(2, 11, 10));
    assert.equal(selections, 1);

    now = 200;
    canvas.emit('pointerdown', pointer(3, 10, 10));
    now = 225;
    canvas.emit('pointerup', pointer(3, 10, 10));
    assert.equal(selections, 2);
    assert.equal(fits, 1);
    arbiter.dispose();
  } finally {
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: priorPerformance,
    });
  }
});

test('dirty renderer coalesces invalidations into one owned animation frame', () => {
  const previousRequest = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const callbacks = [];
  globalThis.requestAnimationFrame = (callback) => { callbacks.push(callback); return callbacks.length; };
  globalThis.cancelAnimationFrame = () => {};
  try {
    const backend = new TopologyEditViewportBackend({ navigationConfiguration: CONFIGURATION });
    let renders = 0;
    backend.renderer = { render() { renders += 1; } };
    backend.isMounted = true;
    backend.invalidate('first');
    backend.invalidate('second');
    assert.equal(callbacks.length, 1);
    callbacks.shift()();
    assert.equal(renders, 1);
    assert.equal(backend.animationFrameId, 0);
    backend.renderer = null;
    backend.isMounted = false;
    backend.destroy();
  } finally {
    globalThis.requestAnimationFrame = previousRequest;
    globalThis.cancelAnimationFrame = previousCancel;
  }
});

test('perspective and orthographic replacement preserve target-plane scale', () => {
  const backend = new TopologyEditViewportBackend({ navigationConfiguration: CONFIGURATION });
  backend.activeCamera.aspect = 1.6;
  backend.activeCamera.position.set(100, 50, 75);
  backend.activeCamera.lookAt(0, 0, 0);
  backend.controls = { target: new THREE.Vector3(), update() {} };
  const before = visibleHeight(backend.activeCamera, backend.controls.target);
  assert.equal(backend.toggleProjection(), 'Orthographic');
  const middle = visibleHeight(backend.activeCamera, backend.controls.target);
  assert.ok(Math.abs(before - middle) < 1e-9);
  assert.equal(backend.toggleProjection(), 'Perspective');
  const after = visibleHeight(backend.activeCamera, backend.controls.target);
  assert.ok(Math.abs(before - after) < 1e-9);
  backend.controls = null;
  backend.destroy();
});

test('production controller removes pointerdown selection and binds qualified backend receipts', async () => {
  const source = await readFile(
    new URL('../src/workspace/topology-edit-3d-view-controller.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /removeEventListener\('pointerdown', this\.pointerHandler\)/);
  assert.match(source, /setSelectionRequestHandler\(this\.viewportSelectionHandler\)/);
  assert.match(source, /data-navigation-mode="select"/);
  assert.doesNotMatch(source, /addEventListener\('pointerdown', this\.pointerHandler\)/);
});

function topology(hash, offset) {
  return {
    canonicalTopologyHash: hash,
    nodes: [
      { id: 'node:1', position: { x: offset, y: 10, z: 20 } },
      { id: 'node:2', position: { x: offset + 100, y: 10, z: 20 } },
    ],
    edges: [{
      id: 'edge:1',
      componentKey: 'pipe:1',
      fromNodeId: 'node:1',
      toNodeId: 'node:2',
      diameterMm: 20,
      entityType: 'PIPE',
    }],
    junctions: [],
    supports: [],
  };
}

function vector(value) {
  return new THREE.Vector3(value.x, value.y, value.z);
}

function inside(point, plane) {
  return plane.normal.x * point.x
    + plane.normal.y * point.y
    + plane.normal.z * point.z
    + plane.constant >= -1e-12;
}

function raycaster(hits) {
  return {
    params: { Line: {} },
    setFromCamera() {},
    intersectObjects() { return hits; },
  };
}

function pointer(pointerId, clientX, clientY) {
  return { button: 0, pointerId, clientX, clientY, key: '' };
}

class EventTargetFixture {
  constructor() {
    this.listeners = new Map();
    this.activeElement = null;
    this.visibilityState = 'visible';
    this.captured = new Set();
  }

  addEventListener(type, listener) {
    const rows = this.listeners.get(type) || [];
    rows.push(listener);
    this.listeners.set(type, rows);
  }

  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((row) => row !== listener));
  }

  setPointerCapture(pointerId) { this.captured.add(pointerId); }

  hasPointerCapture(pointerId) { return this.captured.has(pointerId); }

  releasePointerCapture(pointerId) { this.captured.delete(pointerId); }

  emit(type, event) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
}

function visibleHeight(camera, target) {
  if (camera.isPerspectiveCamera) {
    const fov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / camera.zoom);
    return 2 * camera.position.distanceTo(target) * Math.tan(fov / 2);
  }
  return (camera.top - camera.bottom) / camera.zoom;
}
