import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  fitPerspectiveCameraToRenderBounds,
  projectRenderBoundsToNdc,
  SJSON_BENCHMARK_CAMERA_AUTHORITY,
  SJSON_BENCHMARK_CAMERA_FIT_ALGORITHM,
} from '../src/workspace/topology-edit/topology-edit-sjson-benchmark-camera.js';

const DIRECTION = new THREE.Vector3(1, 0.8, -1).normalize();

function camera(aspect = 2.25) {
  const result = new THREE.PerspectiveCamera(45, aspect, 0.1, 1_000_000);
  result.up.set(0, 1, 0);
  return result;
}

function controls() {
  return {
    target: new THREE.Vector3(),
    update() {},
  };
}

test('SJSON benchmark camera solves every render-bound corner against aspect and FOV', () => {
  const bounds = new THREE.Box3(
    new THREE.Vector3(-600, -2800, -500),
    new THREE.Vector3(600, 2800, 500),
  );
  const viewCamera = camera();
  const result = fitPerspectiveCameraToRenderBounds({
    camera: viewCamera,
    controls: controls(),
    bounds,
    direction: DIRECTION,
    fitMargin: 1.25,
  });

  assert.equal(result.authority, SJSON_BENCHMARK_CAMERA_AUTHORITY);
  assert.equal(result.fitAlgorithm, SJSON_BENCHMARK_CAMERA_FIT_ALGORITHM);
  assert.equal(result.screenBoundsNdc.fitsViewport, true);
  assert.ok(result.screenBoundsNdc.minimum.x >= -0.8 - 1e-7);
  assert.ok(result.screenBoundsNdc.maximum.x <= 0.8 + 1e-7);
  assert.ok(result.screenBoundsNdc.minimum.y >= -0.8 - 1e-7);
  assert.ok(result.screenBoundsNdc.maximum.y <= 0.8 + 1e-7);
  assert.ok(result.cameraDistanceMm > bounds.getSize(new THREE.Vector3()).length() * 0.9);
  assert.deepEqual(result.renderDirection, {
    x: DIRECTION.x,
    y: DIRECTION.y,
    z: DIRECTION.z,
  });
});

test('SJSON benchmark camera rejects the former diagonal-only distance when it clips vertically', () => {
  const bounds = new THREE.Box3(
    new THREE.Vector3(-600, -2800, -500),
    new THREE.Vector3(600, 2800, 500),
  );
  const center = bounds.getCenter(new THREE.Vector3());
  const naiveCamera = camera();
  const naiveDistance = bounds.getSize(new THREE.Vector3()).length() * 0.9 + 200;
  naiveCamera.position.copy(center).addScaledVector(DIRECTION, naiveDistance);
  naiveCamera.lookAt(center);
  naiveCamera.updateProjectionMatrix();
  naiveCamera.updateMatrixWorld(true);
  const naive = projectRenderBoundsToNdc(bounds, naiveCamera, 1);
  assert.equal(naive.fitsViewport, false);
  assert.ok(naive.minimum.y < -1 || naive.maximum.y > 1);

  const fittedCamera = camera();
  const fitted = fitPerspectiveCameraToRenderBounds({
    camera: fittedCamera,
    controls: controls(),
    bounds,
    direction: DIRECTION,
    fitMargin: 1.25,
  });
  assert.equal(fitted.screenBoundsNdc.fitsViewport, true);
});

test('SJSON benchmark camera is deterministic for identical bounds and policy', () => {
  const bounds = new THREE.Box3(
    new THREE.Vector3(-1000, -500, -2000),
    new THREE.Vector3(3000, 2500, 1000),
  );
  const first = fitPerspectiveCameraToRenderBounds({
    camera: camera(1.75),
    controls: controls(),
    bounds,
    direction: DIRECTION,
    fitMargin: 1.25,
  });
  const second = fitPerspectiveCameraToRenderBounds({
    camera: camera(1.75),
    controls: controls(),
    bounds: bounds.clone(),
    direction: DIRECTION.clone(),
    fitMargin: 1.25,
  });
  assert.deepEqual(first, second);
});
