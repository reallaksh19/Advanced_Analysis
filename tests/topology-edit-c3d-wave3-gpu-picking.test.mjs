import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';

import {
  decodeTopologyEditPickId,
  encodeTopologyEditPickId,
  resolveTopologyEditPickViewport,
  selectNearestTopologyEditPickId,
} from '../src/workspace/topology-edit/topology-edit-gpu-pick-helpers.js';
import {
  TopologyEditGpuPicker,
} from '../src/workspace/topology-edit/topology-edit-gpu-picker.js';

const RECT = Object.freeze({ left: 0, top: 0, width: 100, height: 80 });

function target(id, extra = {}) {
  return Object.freeze({
    modelRole: 'draft',
    objectKind: 'component',
    objectId: id,
    ...extra,
  });
}

test('24-bit pick IDs round-trip exactly and reject reserved values', () => {
  [1, 255, 256, 65535, 65536, 0xffffff].forEach((id) => {
    const color = encodeTopologyEditPickId(id);
    assert.equal(
      decodeTopologyEditPickId(Uint8Array.from([color.r, color.g, color.b, 255])),
      id,
    );
  });
  assert.throws(() => encodeTopologyEditPickId(0), RangeError);
  assert.throws(() => encodeTopologyEditPickId(0x1000000), RangeError);
});

test('nearest nonzero sample wins deterministically', () => {
  const bytes = new Uint8Array(5 * 5 * 4);
  writeId(bytes, 5, 0, 0, 17);
  writeId(bytes, 5, 2, 2, 23);
  assert.equal(selectNearestTopologyEditPickId(bytes, 5, 5), 23);

  const tie = new Uint8Array(3 * 3 * 4);
  writeId(tie, 3, 0, 1, 31);
  writeId(tie, 3, 2, 1, 32);
  assert.equal(selectNearestTopologyEditPickId(tie, 3, 3), 31);
});

test('pick viewport honors CSS radius, pixel ratio, bounds, and WebGL Y origin', () => {
  const renderer = new FakeRenderer({ pixelRatio: 2 });
  assert.deepEqual(
    resolveTopologyEditPickViewport(renderer, 0, 0, RECT, 2),
    {
      x: 0,
      y: 155,
      width: 5,
      height: 5,
      fullWidth: 200,
      fullHeight: 160,
      cssRadius: 2,
      physicalRadius: 4,
      pixelRatio: 2,
    },
  );
  assert.deepEqual(
    resolveTopologyEditPickViewport(renderer, 50, 40, RECT, 2),
    {
      x: 96,
      y: 75,
      width: 9,
      height: 9,
      fullWidth: 200,
      fullHeight: 160,
      cssRadius: 2,
      physicalRadius: 4,
      pixelRatio: 2,
    },
  );
});

test('GPU picker resolves exact object identity and restores renderer state', () => {
  const scene = new THREE.Scene();
  const original = new THREE.MeshBasicMaterial({ color: 0x123456 });
  original.clippingPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), -5)];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), original);
  mesh.userData.pickTarget = target('PIPE-1');
  const ghostGroup = new THREE.Group();
  ghostGroup.userData.nonPickable = true;
  const ghost = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  );
  ghost.userData.pickTarget = target('GHOST-1');
  ghostGroup.add(ghost);
  scene.add(mesh, ghostGroup);

  const renderer = new FakeRenderer({ selectObject: mesh });
  const picker = new TopologyEditGpuPicker({ renderer, scene, pixelRadius: 1 });
  const hit = picker.pick({
    clientX: 50,
    clientY: 40,
    rect: RECT,
    camera: new THREE.PerspectiveCamera(),
  });

  assert.equal(hit.target.objectId, 'PIPE-1');
  assert.equal(hit.object, mesh);
  assert.equal(hit.instanceId, null);
  assert.equal(renderer.observedGhostVisible, false);
  assert.equal(renderer.observedClippingPlanes, 1);
  assert.equal(mesh.material, original);
  assert.equal(ghost.visible, true);
  assert.equal(renderer.getRenderTarget(), renderer.initialTarget);
  assert.equal(renderer.getScissorTest(), renderer.initialScissorTest);
  assert.deepEqual(renderer.viewport.toArray(), renderer.initialViewport.toArray());
  assert.deepEqual(renderer.scissor.toArray(), renderer.initialScissor.toArray());
  picker.dispose();
});

test('GPU picker assigns exact per-instance IDs and restores geometry', () => {
  const scene = new THREE.Scene();
  const geometry = new THREE.SphereGeometry(1, 6, 4);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, 2);
  const matrix = new THREE.Matrix4();
  mesh.setMatrixAt(0, matrix.makeTranslation(0, 0, 0));
  mesh.setMatrixAt(1, matrix.makeTranslation(4, 0, 0));
  mesh.userData.pickTable = [target('NODE-A'), target('NODE-B')];
  scene.add(mesh);

  const renderer = new FakeRenderer({ selectObject: mesh, selectInstance: 1 });
  const picker = new TopologyEditGpuPicker({ renderer, scene });
  const hit = picker.pick({
    clientX: 50,
    clientY: 40,
    rect: RECT,
    camera: new THREE.PerspectiveCamera(),
  });

  assert.equal(hit.target.objectId, 'NODE-B');
  assert.equal(hit.object, mesh);
  assert.equal(hit.instanceId, 1);
  assert.equal(mesh.geometry, geometry);
  assert.equal(mesh.material, material);
  assert.equal(geometry.getAttribute('instancePickColor'), undefined);
  picker.dispose();
});

test('unavailable GPU readback returns null for deterministic CPU fallback', () => {
  const scene = new THREE.Scene();
  const renderer = { render() {}, setRenderTarget() {} };
  const picker = new TopologyEditGpuPicker({ renderer, scene });
  assert.equal(picker.isAvailable(), false);
  assert.equal(picker.pick({ clientX: 1, clientY: 1, rect: RECT, camera: {} }), null);
});

test('viewport backend retains constrained GPU point and full CPU fallback paths', async () => {
  const source = await readFile(
    new URL(
      '../src/workspace/topology-edit/topology-edit-viewport-backend.js',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(source, /new TopologyEditGpuPicker/);
  assert.match(source, /gpuPicker\?\.pick/);
  assert.match(source, /intersectObject\(gpuHit\.object, true\)/);
  assert.match(source, /return this\.pickWithRaycaster\(context\.pointer\)/);
  assert.match(source, /gpuPicker\?\.dispose/);
  assert.doesNotMatch(source, /mesh\.name/);
  assert.doesNotMatch(source, /nearest/i);
});

class FakeRenderer {
  constructor({ pixelRatio = 1, selectObject = null, selectInstance = null } = {}) {
    this.pixelRatio = pixelRatio;
    this.selectObject = selectObject;
    this.selectInstance = selectInstance;
    this.initialTarget = Object.freeze({ id: 'INITIAL_TARGET' });
    this.target = this.initialTarget;
    this.initialViewport = new THREE.Vector4(4, 5, 60, 40);
    this.viewport = this.initialViewport.clone();
    this.initialScissor = new THREE.Vector4(6, 7, 20, 10);
    this.scissor = this.initialScissor.clone();
    this.initialScissorTest = true;
    this.scissorTest = this.initialScissorTest;
    this.clearColor = new THREE.Color(0x234567);
    this.clearAlpha = 0.75;
    this.autoClear = false;
    this.selectedBytes = [0, 0, 0, 0];
    this.observedGhostVisible = null;
    this.observedClippingPlanes = null;
  }
  getPixelRatio() { return this.pixelRatio; }
  getRenderTarget() { return this.target; }
  setRenderTarget(value) { this.target = value; }
  getViewport(target) { return target.copy(this.viewport); }
  setViewport(...args) { assignVector4(this.viewport, args); }
  getScissor(target) { return target.copy(this.scissor); }
  setScissor(...args) { assignVector4(this.scissor, args); }
  getScissorTest() { return this.scissorTest; }
  setScissorTest(value) { this.scissorTest = value; }
  getClearColor(target) { return target.copy(this.clearColor); }
  getClearAlpha() { return this.clearAlpha; }
  setClearColor(value, alpha = 1) {
    this.clearColor.set(value);
    this.clearAlpha = alpha;
  }
  clear() {}
  render(scene) {
    const ghost = scene.children
      .find((row) => row.userData?.nonPickable)
      ?.children?.[0];
    this.observedGhostVisible = ghost?.visible ?? null;
    if (!this.selectObject) return;
    const material = this.selectObject.material;
    this.observedClippingPlanes = material.clippingPlanes?.length ?? 0;
    if (this.selectObject.isInstancedMesh) {
      const attribute = this.selectObject.geometry.getAttribute('instancePickColor');
      const offset = this.selectInstance * 3;
      this.selectedBytes = [
        Math.round(attribute.array[offset] * 255),
        Math.round(attribute.array[offset + 1] * 255),
        Math.round(attribute.array[offset + 2] * 255),
        255,
      ];
      return;
    }
    this.selectObject.onBeforeRender?.();
    const color = material.uniforms.pickColor.value;
    this.selectedBytes = [
      Math.round(color.r * 255),
      Math.round(color.g * 255),
      Math.round(color.b * 255),
      255,
    ];
  }
  readRenderTargetPixels(target, x, y, width, height, bytes) {
    const center = Math.floor((width * height) / 2) * 4;
    bytes.set(this.selectedBytes, center);
  }
}

function writeId(bytes, width, x, y, id) {
  const color = encodeTopologyEditPickId(id);
  bytes.set([color.r, color.g, color.b, 255], (y * width + x) * 4);
}

function assignVector4(target, args) {
  if (args.length === 1 && args[0]?.isVector4) {
    target.copy(args[0]);
    return;
  }
  target.set(args[0], args[1], args[2], args[3]);
}
