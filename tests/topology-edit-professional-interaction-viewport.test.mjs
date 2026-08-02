import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTopologyEditGizmoModel } from '../src/workspace/viewport-interaction/topology-edit-gizmo-model.js';
import { TopologyEditInteractionViewportAdapter } from '../src/workspace/viewport-interaction/topology-edit-interaction-viewport-adapter.js';

class FakeCanvas {
  constructor() {
    this.attributes = new Map();
    this.listeners = new Map();
    this.captured = new Set();
    this.clientHeight = 500;
    this.tabIndex = -1;
    this.focused = false;
  }

  addEventListener(type, listener, options) {
    this.listeners.set(`${type}:${options === true ? 'capture' : 'bubble'}`, listener);
  }

  removeEventListener(type, listener, options) {
    const key = `${type}:${options === true ? 'capture' : 'bubble'}`;
    if (this.listeners.get(key) === listener) this.listeners.delete(key);
  }

  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  setPointerCapture(id) { this.captured.add(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  focus() { this.focused = true; }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 800, height: 500 };
  }
}

function fixture() {
  const canvas = new FakeCanvas();
  const transientGroup = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(45, 800 / 500, 0.1, 100000);
  camera.position.set(100, 100, 100);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return {
    canvas,
    backend: {
      renderer: { domElement: canvas },
      groups: { transientGroup },
      activeCamera: camera,
    },
  };
}

test('viewport adapter mounts six explicit disposable gizmo handles', () => {
  const { canvas, backend } = fixture();
  const adapter = new TopologyEditInteractionViewportAdapter({ backend });
  adapter.mount();
  const gizmo = createTopologyEditGizmoModel({
    nodeId: 'node:n1',
    basisHash: 'fnv1a64:basis',
    anchorPosition: { x: 0, y: 0, z: 0 },
    cameraDistanceMm: 1000,
    viewportHeightPx: 500,
    perspectiveFovDeg: 45,
  });
  adapter.render(gizmo);
  assert.equal(backend.groups.transientGroup.children.includes(adapter.group), true);
  assert.equal(adapter.group.children.length, 7);
  assert.equal(adapter.group.userData.nonPickable, true);
  assert.equal(canvas.getAttribute('aria-label'), 'Professional topology-edit viewport');
  adapter.destroy();
  assert.equal(backend.groups.transientGroup.children.includes(adapter.group), false);
  assert.equal(adapter.group.children.length, 0);
});

test('keyboard events forward without creating command or workspace authority', () => {
  const { canvas, backend } = fixture();
  const keys = [];
  const adapter = new TopologyEditInteractionViewportAdapter({
    backend,
    onKey: (event) => keys.push(event.key),
  });
  adapter.mount();
  canvas.listeners.get('keydown:bubble')({ key: 'Escape' });
  canvas.listeners.get('keydown:bubble')({ key: 'Enter' });
  assert.deepEqual(keys, ['Escape', 'Enter']);
  adapter.destroy();
});

test('destroy always releases retained pointer capture and cancels drag', () => {
  const { canvas, backend } = fixture();
  const cancellations = [];
  const adapter = new TopologyEditInteractionViewportAdapter({
    backend,
    onCancel: (event) => cancellations.push(event.reason),
  });
  adapter.mount();
  canvas.setPointerCapture(7);
  adapter.activeDrag = {
    pointerId: 7,
    mode: 'AXIS_X',
    anchor: new THREE.Vector3(),
    plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  };
  adapter.destroy();
  assert.equal(canvas.hasPointerCapture(7), false);
  assert.deepEqual(cancellations, ['DESTROYED']);
});
