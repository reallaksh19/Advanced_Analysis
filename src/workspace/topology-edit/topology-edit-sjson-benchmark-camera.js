import * as THREE from 'three';

export const SJSON_BENCHMARK_CAMERA_AUTHORITY =
  'TOPO_VALIDATOR_FIT_BOX_SIZE_0_9_PLUS_200_DIRECTION_1_1_0_8';
export const SJSON_BENCHMARK_CAMERA_FIT_ALGORITHM =
  'TOPO_VALIDATOR_ASPECT_SAFE_PERSPECTIVE_FIT_DIRECTION_1_1_0_8_V1';

const MIN_DISTANCE_MM = 1;
const MIN_NEAR_MM = 0.1;
const MIN_FAR_SPAN_MM = 1000;
const FIT_EPSILON = 1e-7;

/**
 * Fits a perspective camera to a render-space Box3 while preserving the supplied
 * view direction. The distance is solved against every box corner, the vertical
 * FOV, the actual aspect ratio, and the approved fit margin.
 */
export function fitPerspectiveCameraToRenderBounds(input = {}) {
  const camera = input.camera;
  const controls = input.controls;
  const bounds = input.bounds;
  const direction = finiteDirection(input.direction);
  const fitMargin = positive(input.fitMargin);
  if (!camera?.isPerspectiveCamera) {
    throw new TypeError('SJSON benchmark fit requires an active perspective camera.');
  }
  if (!controls?.target || typeof controls.update !== 'function') {
    throw new TypeError('SJSON benchmark fit requires active camera controls.');
  }
  if (!(bounds instanceof THREE.Box3) || bounds.isEmpty() || !finiteBox(bounds)) {
    throw new TypeError('SJSON benchmark fit requires finite non-empty render bounds.');
  }
  if (!direction) throw new TypeError('SJSON benchmark fit requires a finite direction.');
  if (fitMargin === null || fitMargin < 1) {
    throw new TypeError('SJSON benchmark fit requires a margin greater than or equal to one.');
  }

  const fovDeg = positive(camera.fov);
  const aspect = positive(camera.aspect);
  if (fovDeg === null || !(fovDeg < 180)) {
    throw new TypeError('SJSON benchmark fit requires a perspective FOV between zero and 180 degrees.');
  }
  if (aspect === null) throw new TypeError('SJSON benchmark fit requires a positive aspect ratio.');

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const diagonalMm = size.length() || MIN_DISTANCE_MM;
  const forward = direction.clone().multiplyScalar(-1);
  const right = stableRight(forward, camera.up);
  const fittedUp = new THREE.Vector3().crossVectors(right, forward).normalize();
  const tangentVertical = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
  const tangentHorizontal = tangentVertical * aspect;
  const corners = boxCorners(bounds);

  let cameraDistanceMm = MIN_DISTANCE_MM;
  for (const corner of corners) {
    const offset = corner.clone().sub(center);
    const cameraX = Math.abs(offset.dot(right));
    const cameraY = Math.abs(offset.dot(fittedUp));
    const centerDepthOffset = offset.dot(forward);
    cameraDistanceMm = Math.max(
      cameraDistanceMm,
      (cameraX * fitMargin) / tangentHorizontal - centerDepthOffset,
      (cameraY * fitMargin) / tangentVertical - centerDepthOffset,
      MIN_DISTANCE_MM - centerDepthOffset,
    );
  }

  camera.up.set(0, 1, 0);
  camera.position.copy(center).addScaledVector(direction, cameraDistanceMm);
  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();

  const depthRange = renderDepthRange(corners, center, forward, cameraDistanceMm);
  camera.near = Math.max(MIN_NEAR_MM, depthRange.minimum * 0.25);
  camera.far = Math.max(
    camera.near + MIN_FAR_SPAN_MM,
    depthRange.maximum * 2 + MIN_FAR_SPAN_MM,
  );
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const screenBoundsNdc = projectRenderBoundsToNdc(bounds, camera, fitMargin);
  return Object.freeze({
    authority: SJSON_BENCHMARK_CAMERA_AUTHORITY,
    fitAlgorithm: SJSON_BENCHMARK_CAMERA_FIT_ALGORITHM,
    cameraDistanceMm,
    fitMargin,
    renderDirection: freezePoint(direction),
    renderBounds: freezeBounds(bounds, size, diagonalMm),
    screenBoundsNdc,
    cameraPosition: freezePoint(camera.position),
    target: freezePoint(center),
    fovDeg,
    aspect,
    near: camera.near,
    far: camera.far,
  });
}

export function projectRenderBoundsToNdc(bounds, camera, fitMargin = 1) {
  if (!(bounds instanceof THREE.Box3) || bounds.isEmpty() || !finiteBox(bounds)) {
    throw new TypeError('Projected benchmark bounds require finite non-empty render bounds.');
  }
  if (!camera?.isCamera) throw new TypeError('Projected benchmark bounds require a camera.');
  const margin = positive(fitMargin) || 1;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const projected = boxCorners(bounds).map((corner) => corner.clone().project(camera));
  const minimum = {
    x: Math.min(...projected.map((point) => point.x)),
    y: Math.min(...projected.map((point) => point.y)),
    z: Math.min(...projected.map((point) => point.z)),
  };
  const maximum = {
    x: Math.max(...projected.map((point) => point.x)),
    y: Math.max(...projected.map((point) => point.y)),
    z: Math.max(...projected.map((point) => point.z)),
  };
  const requiredLimit = 1 / margin;
  const fitsViewport = minimum.x >= -requiredLimit - FIT_EPSILON
    && maximum.x <= requiredLimit + FIT_EPSILON
    && minimum.y >= -requiredLimit - FIT_EPSILON
    && maximum.y <= requiredLimit + FIT_EPSILON
    && minimum.z >= -1 - FIT_EPSILON
    && maximum.z <= 1 + FIT_EPSILON;
  return Object.freeze({
    minimum: Object.freeze(minimum),
    maximum: Object.freeze(maximum),
    span: Object.freeze({
      x: maximum.x - minimum.x,
      y: maximum.y - minimum.y,
      z: maximum.z - minimum.z,
    }),
    requiredLimit,
    fitsViewport,
  });
}

function renderDepthRange(corners, center, forward, distance) {
  const depths = corners.map((corner) => distance + corner.clone().sub(center).dot(forward));
  return {
    minimum: Math.max(Math.min(...depths), MIN_NEAR_MM * 4),
    maximum: Math.max(...depths),
  };
}

function stableRight(forward, preferredUp) {
  const up = finiteDirection(preferredUp) || new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, up);
  if (right.lengthSq() <= FIT_EPSILON) {
    const fallback = Math.abs(forward.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    right.crossVectors(forward, fallback);
  }
  return right.normalize();
}

function boxCorners(bounds) {
  const { min, max } = bounds;
  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];
}

function finiteDirection(value) {
  if (!value || ![value.x, value.y, value.z].every(Number.isFinite)) return null;
  const direction = new THREE.Vector3(value.x, value.y, value.z);
  return direction.lengthSq() > FIT_EPSILON ? direction.normalize() : null;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function finiteBox(bounds) {
  return [bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z]
    .every(Number.isFinite);
}

function freezePoint(point) {
  return Object.freeze({ x: point.x, y: point.y, z: point.z });
}

function freezeBounds(bounds, size, diagonalMm) {
  return Object.freeze({
    min: freezePoint(bounds.min),
    max: freezePoint(bounds.max),
    size: freezePoint(size),
    diagonalMm,
  });
}
