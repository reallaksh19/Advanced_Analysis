import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  fitThreeSelection,
  fitThreeView,
  setThreeStandardView,
} from '../src/workspace/three-viewport-camera.js';
import { ThreeViewportBackend } from '../src/workspace/three-viewport-backend.js';
import { renderThreeModel } from '../src/workspace/three-viewport-scene.js';
import { ViewportAxisHUD } from '../src/workspace/viewport-axis-hud.js';

const NAVIGATION = Object.freeze({
  cameraFitMargin: 1.2,
  cameraNearMm: 0.1,
  cameraFarMm: 1_000_000,
});

test('[SIMULATED] unchanged standard views reuse bounds and model replacement invalidates', () => {
  const backend = perspectiveBackend([]);
  backend.applyModelConfiguration = () => {};
  backend.fitView = () => fitThreeView(backend, null);
  const original = THREE.Box3.prototype.setFromObject;
  let calls = 0;
  THREE.Box3.prototype.setFromObject = function counted(object, precise) {
    calls += 1;
    return original.call(this, object, precise);
  };
  try {
    renderThreeModel(backend, pipeRenderModel([
      pipePrimitive('left', -25, -15),
      pipePrimitive('right', 15, 25),
    ]));
    assert.equal(calls, 2);
    setThreeStandardView(backend, 'front');
    assert.equal(calls, 2);
    setThreeStandardView(backend, 'right');
    assert.equal(calls, 2);

    renderThreeModel(backend, pipeRenderModel([
      pipePrimitive('replacement', -100, 100),
    ]));
    fitThreeView(backend, null);
    assert.equal(calls, 3);
    assert.ok(backend.sceneBoundsCache.max.x - backend.sceneBoundsCache.min.x > 199.9);
  } finally {
    THREE.Box3.prototype.setFromObject = original;
  }
});

test('[SIMULATED] selection fitting leaves the full-scene cache unchanged', () => {
  const selected = meshAt(10, 0, 0, 4);
  const other = meshAt(-10, 0, 0, 4);
  const backend = perspectiveBackend([selected, other]);
  fitThreeView(backend, null);
  const cached = backend.sceneBoundsCache.clone();
  backend.selectedEntityId = 'selected';
  backend.objects = new Map([
    ['selected', [selected]],
    ['other', [other]],
  ]);

  fitThreeSelection(backend);

  assert.deepEqual(backend.sceneBoundsCache.min.toArray(), cached.min.toArray());
  assert.deepEqual(backend.sceneBoundsCache.max.toArray(), cached.max.toArray());
});

test('[SIMULATED] perspective clipping scales and contains small and large models', () => {
  const small = fitBoxWithCamera(
    new THREE.PerspectiveCamera(45, 1.5, 0.1, 1_000_000),
    new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)),
  );
  const large = fitBoxWithCamera(
    new THREE.PerspectiveCamera(45, 1.5, 0.1, 1_000_000),
    new THREE.Box3(
      new THREE.Vector3(-1_000_000, -1_000_000, -1_000_000),
      new THREE.Vector3(1_000_000, 1_000_000, 1_000_000),
    ),
  );

  assertClippingContainsSphere(small);
  assertClippingContainsSphere(large);
  assert.ok(large.camera.near > small.camera.near * 1_000);
  assert.ok(large.camera.far > small.camera.far * 1_000);
  assert.ok(large.camera.far > NAVIGATION.cameraFarMm);
});

test('[SIMULATED] orthographic fitting updates frustum and adaptive clipping', () => {
  const camera = new THREE.OrthographicCamera(-15, 15, 10, -10, 0.1, 1_000_000);
  const box = new THREE.Box3(
    new THREE.Vector3(-200, -20, -40),
    new THREE.Vector3(200, 20, 40),
  );
  const result = fitBoxWithCamera(camera, box);

  assertClippingContainsSphere(result);
  assert.equal(camera.zoom, 1);
  const projected = projectedBoxSize(camera, box);
  assert.ok(camera.right - camera.left >= projected.width * NAVIGATION.cameraFitMargin);
  assert.ok(camera.top - camera.bottom >= projected.height * NAVIGATION.cameraFitMargin);
  assert.ok(camera.top > camera.bottom);
});

test('[SIMULATED] HUD uses inverse orientation and restores renderer state', () => {
  const hud = new ViewportAxisHUD();
  const mainCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  mainCamera.rotation.set(0.3, -0.5, 0.2);
  mainCamera.updateMatrixWorld(true);
  const expected = mainCamera.getWorldQuaternion(new THREE.Quaternion()).invert();

  hud.updateOrientation(mainCamera);

  assert.ok(hud.axisGroup.quaternion.angleTo(expected) < 1e-7);
  const renderer = new RendererSpy();
  const before = renderer.snapshot();
  hud.render(renderer, 640, 480);
  assert.deepEqual(renderer.snapshot(), before);
  assert.ok(renderer.events.indexOf('clearDepth') < renderer.events.indexOf('render:hud'));
  hud.dispose();
});

test('[SIMULATED] backend renders main scene before HUD and disposes HUD once', () => {
  const backend = new ThreeViewportBackend();
  const renderer = new RendererSpy();
  backend.renderer = renderer;
  backend.scene = new THREE.Scene();
  backend.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  backend.hostElement = { clientWidth: 640, clientHeight: 480, dataset: {} };
  backend.axisHud = new ViewportAxisHUD();
  renderer.mainScene = backend.scene;
  renderer.hudScene = backend.axisHud.scene;

  backend.renderOnce();

  assert.ok(renderer.events.indexOf('render:main') < renderer.events.indexOf('clearDepth'));
  assert.ok(renderer.events.indexOf('clearDepth') < renderer.events.indexOf('render:hud'));
  backend.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  backend.hostElement.clientWidth = 800;
  backend.hostElement.clientHeight = 400;
  backend.resize();
  assert.equal(backend.camera.left, -20);
  assert.equal(backend.camera.right, 20);
  const hud = backend.axisHud;
  const dispose = hud.dispose.bind(hud);
  let disposeCalls = 0;
  hud.dispose = () => { disposeCalls += 1; dispose(); };
  backend.renderer = null;
  backend.destroy();
  backend.renderOnce();
  backend.destroy();
  assert.equal(disposeCalls, 1);
  assert.equal(renderer.events.filter((event) => event === 'render:hud').length, 1);
});

function perspectiveBackend(objects) {
  const camera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 1_000_000);
  camera.position.set(50, 50, 50);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return {
    camera,
    controls: { target: new THREE.Vector3(), update() {} },
    objects: new Map(objects.map((object, index) => [String(index), [object]])),
    physicalGroup: new THREE.Group(),
    supportGroup: new THREE.Group(),
    diagnosticGroup: new THREE.Group(),
    sceneBoundsCache: null,
    model: { webglNavigation: NAVIGATION },
    markViewCommand() {},
    renderOnce() {},
  };
}

function fitBoxWithCamera(camera, box) {
  camera.position.set(100, 100, 100);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const backend = {
    camera,
    controls: { target: new THREE.Vector3(), update() {} },
    objects: new Map(),
    sceneBoundsCache: null,
    model: { webglNavigation: NAVIGATION },
    markViewCommand() {},
    renderOnce() {},
  };
  fitThreeView(backend, box);
  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  return {
    box,
    camera,
    center,
    radius: sphere.radius,
    distance: camera.position.distanceTo(center),
  };
}

function assertClippingContainsSphere({ camera, distance, radius }) {
  assert.ok(Number.isFinite(camera.near));
  assert.ok(Number.isFinite(camera.far));
  assert.ok(camera.near >= NAVIGATION.cameraNearMm);
  assert.ok(camera.near <= distance - radius);
  assert.ok(camera.far >= distance + radius);
  assert.ok(camera.far > camera.near);
}

function projectedBoxSize(camera, box) {
  camera.updateMatrixWorld(true);
  const points = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ].map((point) => point.applyMatrix4(camera.matrixWorldInverse));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function meshAt(x, y, z, size) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshBasicMaterial(),
  );
  mesh.position.set(x, y, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}

function pipeRenderModel(primitives) {
  return {
    schema: 'viewport-render-model/v3',
    webglNavigation: NAVIGATION,
    physicalPrimitives: primitives,
    supportOverlayPrimitives: [],
    diagnosticPrimitives: [],
    summary: { renderableCount: primitives.length },
    bounds: { center: { x: 0, y: 0, z: 0 } },
  };
}

function pipePrimitive(objectId, startX, endX) {
  return {
    primitiveId: `visual:${objectId}:pipe`,
    objectId,
    componentKind: 'PIPE',
    layer: 'PHYSICAL',
    resolutionStatus: 'RESOLVED',
    renderSettings: { meshRadialSegments: 8 },
    primitive: {
      kind: 'PIPE_TUBE',
      start: { x: startX, y: 0, z: 0 },
      end: { x: endX, y: 0, z: 0 },
      visualDiameterMm: 10,
    },
  };
}

class RendererSpy {
  constructor() {
    this.viewport = new THREE.Vector4(3, 4, 500, 400);
    this.scissor = new THREE.Vector4(5, 6, 300, 200);
    this.scissorTest = false;
    this.events = [];
    this.mainScene = null;
    this.hudScene = null;
  }

  getViewport(target) { return target.copy(this.viewport); }
  getScissor(target) { return target.copy(this.scissor); }
  getScissorTest() { return this.scissorTest; }
  setViewport(...values) {
    this.viewport = vectorFromArguments(values);
    this.events.push('setViewport');
  }
  setScissor(...values) {
    this.scissor = vectorFromArguments(values);
    this.events.push('setScissor');
  }
  setScissorTest(value) {
    this.scissorTest = value;
    this.events.push('setScissorTest');
  }
  clearDepth() { this.events.push('clearDepth'); }
  setSize(width, height) { this.events.push(`setSize:${width}x${height}`); }
  render(scene) {
    const label = scene === this.mainScene ? 'main' : scene === this.hudScene ? 'hud' : 'hud';
    this.events.push(`render:${label}`);
  }
  snapshot() {
    return {
      viewport: this.viewport.toArray(),
      scissor: this.scissor.toArray(),
      scissorTest: this.scissorTest,
    };
  }
}

function vectorFromArguments(values) {
  if (values.length === 1 && values[0]?.isVector4) return values[0].clone();
  return new THREE.Vector4(values[0], values[1], values[2], values[3]);
}
