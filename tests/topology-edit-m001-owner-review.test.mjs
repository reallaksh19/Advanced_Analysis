import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { ThreeInteractionArbiter } from '../src/workspace/three-interaction-arbiter.js';

const CONFIGURATION = Object.freeze({
  clickTravelTolerancePx: 5,
  clickTimingMs: 300,
  doubleClickTimingMs: 300,
});

test('select mode preserves orbit and pan while click qualification stays active', () => {
  const ownerDocument = new EventTargetFixture();
  const canvas = new EventTargetFixture();
  canvas.ownerDocument = ownerDocument;
  const controls = {};
  const arbiter = new ThreeInteractionArbiter(canvas, controls, {}, CONFIGURATION);

  assert.equal(arbiter.mode, 'select');
  assert.equal(controls.enableRotate, true);
  assert.equal(controls.enablePan, true);
  assert.equal(controls.enableZoom, true);
  assert.deepEqual(controls.mouseButtons, {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN,
  });

  arbiter.setMode('pan');
  assert.deepEqual(controls.mouseButtons, {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.ROTATE,
  });
  arbiter.dispose();
});

test('active 3D Edit captures the shared viewport toolbar and releases it on deactivate', async () => {
  const source = await readFile(
    new URL('../src/workspace/topology-edit-3d-view-controller.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /sharedNavigationHandler/);
  assert.match(source, /addEventListener\(\s*'click',\s*this\.sharedNavigationHandler,\s*true/);
  assert.match(source, /removeEventListener\(\s*'click',\s*this\.sharedNavigationHandler,\s*true/);
  assert.match(source, /\[data-viewport-action\]/);
  assert.match(source, /event\.stopPropagation\(\)/);
  assert.match(source, /'toggle-projection': 'projection'/);
});

test('large-model browser harness projects engineering probes through the render root', async () => {
  const source = await readFile(
    new URL('./topology-edit-wave5-browser-harness.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /applyMatrix4\(engineeringRoot\.matrixWorld\)/);
  assert.match(source, /backend\.renderer\.domElement/);
  assert.match(source, /\.project\(camera\)/);
  assert.doesNotMatch(source, /\.project\(camer\)/);
  assert.match(source, /animationFrameReleased: !backend\.animationFrameId/);
});

test('support markers consume approved Project Data without local defaulting', async () => {
  const source = await readFile(
    new URL('../src/workspace/topology-edit-3d-view-controller-core.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /navigationConfiguration\?\.supportMarkerSize/);
  assert.match(source, /TOPOLOGY_EDIT_SUPPORT_MARKER_POLICY_MISSING/);
  assert.match(source, /markerSizeMm: supportMarkerSize/);
});

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
    this.listeners.set(
      type,
      (this.listeners.get(type) || []).filter((row) => row !== listener),
    );
  }

  setPointerCapture(pointerId) {
    this.captured.add(pointerId);
  }

  hasPointerCapture(pointerId) {
    return this.captured.has(pointerId);
  }

  releasePointerCapture(pointerId) {
    this.captured.delete(pointerId);
  }
}
