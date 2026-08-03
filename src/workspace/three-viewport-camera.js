/**
 * Camera framing and standard-view operations for the Three viewport.
 */
import * as THREE from 'three';

const CLIP_RADIUS_SAFETY = 1.1; // Dimensionless padding around the fitted sphere.
const ORTHOGRAPHIC_CAMERA_DISTANCE_RADII = 2; // Depth-only placement; framing uses the frustum.
const MIN_BOUNDING_RADIUS_MM = 1e-6; // Prevents degenerate zero-radius clipping planes.

export function fitThreeView(backend, targetBox) {
  if (!backend.camera || !backend.controls) return;
  const box = targetBox ?? sceneBoundsBox(backend);
  if (!box || box.isEmpty()) return;
  const center = new THREE.Vector3();
  box.getCenter(center);
  backend.camera.updateMatrixWorld(true);
  const bounds = viewSpaceBounds(backend.camera, box);
  const config = backend.model?.webglNavigation;
  const margin = config?.cameraFitMargin;
  if (!Number.isFinite(margin) || margin <= 0) throw new Error('WebGL camera fit requires an approved cameraFitMargin.');
  const configuredNear = config?.cameraNearMm;
  const configuredFar = config?.cameraFarMm;
  if (!Number.isFinite(configuredNear) || configuredNear <= 0) throw new Error('WebGL camera fit requires a positive cameraNearMm.');
  if (!Number.isFinite(configuredFar) || configuredFar <= configuredNear) throw new Error('WebGL camera fit requires cameraFarMm greater than cameraNearMm.');
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, MIN_BOUNDING_RADIUS_MM);
  const distance = fitProjection(
    backend.camera,
    bounds,
    margin,
    radius,
    configuredNear,
  );
  const forward = new THREE.Vector3();
  backend.camera.getWorldDirection(forward);
  backend.camera.position.copy(center).addScaledVector(forward, -distance);
  backend.camera.updateMatrixWorld(true);
  backend.controls.target.copy(center);
  applyAdaptiveClipping(
    backend.camera,
    distance,
    radius,
    configuredNear,
    configuredFar,
  );
  backend.camera.updateProjectionMatrix();
  backend.controls.update();
  backend.markViewCommand('fit');
  backend.renderOnce();
}

export function fitThreeSelection(backend) {
  if (!backend.selectedEntityId) return;
  const objects = backend.objects.get(backend.selectedEntityId);
  if (!objects?.length) return;
  const box = new THREE.Box3();
  objects.forEach((object) => {
    const objectBox = new THREE.Box3().setFromObject(object);
    if (!objectBox.isEmpty()) box.union(objectBox);
  });
  if (!box.isEmpty()) fitThreeView(backend, box);
}

export function restoreThreeHome(backend) {
  if (!backend.initialCameraState
    || !backend.camera
    || !backend.controls) return;
  backend.camera.position.copy(backend.initialCameraState.position);
  backend.camera.zoom = backend.initialCameraState.zoom;
  backend.controls.target.copy(backend.initialCameraState.target);
  backend.camera.updateProjectionMatrix();
  backend.controls.update();
  backend.markViewCommand('home');
  backend.renderOnce();
}

export function setThreeStandardView(backend, preset) {
  if (!backend.camera || !backend.controls) return;
  const center = backend.controls.target.clone();
  const distance = backend.camera.position.distanceTo(center);
  const directions = {
    iso: new THREE.Vector3(1, 1, 1).normalize(),
    top: new THREE.Vector3(0, 1, 0),
    front: new THREE.Vector3(0, 0, 1),
    right: new THREE.Vector3(1, 0, 0),
    bottom: new THREE.Vector3(0, -1, 0),
    back: new THREE.Vector3(0, 0, -1),
    left: new THREE.Vector3(-1, 0, 0),
  };
  const identity = preset.toLowerCase();
  const direction = directions[identity] ?? directions.iso;
  backend.camera.position.copy(center)
    .addScaledVector(direction, distance);
  backend.camera.lookAt(center);
  if (identity === 'top') backend.camera.up.set(0, 0, -1);
  else backend.camera.up.set(0, 1, 0);
  backend.camera.updateProjectionMatrix();
  backend.controls.update();
  fitThreeView(backend, null);
  backend.markViewCommand(identity);
  backend.renderOnce();
}

/** Returns an independent full-scene bounds value while retaining the cached source. */
function sceneBoundsBox(backend) {
  if (backend.sceneBoundsCache) return backend.sceneBoundsCache.clone();
  const box = new THREE.Box3();
  [...backend.objects.values()].flat().forEach((object) => {
    const objectBox = new THREE.Box3().setFromObject(object);
    if (!objectBox.isEmpty()) box.union(objectBox);
  });
  backend.sceneBoundsCache = box.clone();
  return box.clone();
}

function viewSpaceBounds(camera, box) {
  const values = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ].map((point) => point.applyMatrix4(camera.matrixWorldInverse));
  const xs = values.map((point) => point.x);
  const ys = values.map((point) => point.y);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

/**
 * Fits the active projection and returns the camera-to-box-center distance in model mm.
 * @param {THREE.Camera} camera
 * @param {{ width: number, height: number }} bounds
 * @param {number} margin
 * @param {number} radius
 * @param {number} configuredNear
 * @returns {number}
 */
function fitProjection(camera, bounds, margin, radius, configuredNear) {
  const protectedRadius = radius * CLIP_RADIUS_SAFETY;
  if (camera.isPerspectiveCamera) {
    const aspect = camera.aspect;
    if (!Number.isFinite(aspect) || aspect <= 0) throw new Error('WebGL perspective camera fit requires a positive aspect ratio.');
    const fovY = camera.fov * THREE.MathUtils.DEG2RAD;
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * aspect);
    const distanceY = (bounds.height / 2) / Math.tan(fovY / 2);
    const distanceX = (bounds.width / 2) / Math.tan(fovX / 2);
    return Math.max(
      Math.max(distanceX, distanceY) * margin,
      configuredNear + protectedRadius,
    );
  }
  if (camera.isOrthographicCamera) {
    const frustumHeight = camera.top - camera.bottom;
    const aspect = (camera.right - camera.left) / frustumHeight;
    if (!Number.isFinite(aspect) || aspect <= 0) throw new Error('WebGL orthographic camera fit requires a positive aspect ratio.');
    const halfHeight = Math.max(
      bounds.height / 2,
      bounds.width / (2 * aspect),
      MIN_BOUNDING_RADIUS_MM,
    ) * margin;
    const halfWidth = halfHeight * aspect;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.zoom = 1;
    return Math.max(
      radius * ORTHOGRAPHIC_CAMERA_DISTANCE_RADII,
      configuredNear + protectedRadius,
    );
  }
  throw new TypeError('WebGL camera fit supports perspective or orthographic cameras only.');
}

/** Applies finite clipping planes that contain the fitted sphere in model mm. */
function applyAdaptiveClipping(camera, distance, radius, configuredNear, configuredFar) {
  const protectedRadius = radius * CLIP_RADIUS_SAFETY;
  const near = Math.max(configuredNear, distance - protectedRadius);
  const requiredFar = distance + radius;
  const preferredFar = distance + protectedRadius;
  const far = configuredFar >= requiredFar
    ? Math.min(configuredFar, preferredFar)
    : preferredFar;
  if (!Number.isFinite(near) || !Number.isFinite(far) || near <= 0 || far <= near) {
    throw new Error('WebGL camera fit produced invalid clipping planes.');
  }
  camera.near = near;
  camera.far = far;
}
