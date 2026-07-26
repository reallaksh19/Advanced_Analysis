/**
 * Camera framing and standard-view operations for the Three viewport.
 */
import * as THREE from 'three';

export function fitThreeView(backend, targetBox) {
  if (!backend.camera || !backend.controls) return;
  const box = targetBox ?? modelBoundsBox(backend.model);
  if (!box || box.isEmpty()) return;
  const center = new THREE.Vector3();
  box.getCenter(center);
  const bounds = viewSpaceBounds(backend.camera, box);
  const fovY = backend.camera.fov * THREE.MathUtils.DEG2RAD;
  const fovX = 2 * Math.atan(
    Math.tan(fovY / 2) * backend.camera.aspect,
  );
  const distanceY = (bounds.height / 2) / Math.tan(fovY / 2);
  const distanceX = (bounds.width / 2) / Math.tan(fovX / 2);
  const distance = Math.max(Math.max(distanceX, distanceY) * 1.1, 1);
  const forward = new THREE.Vector3();
  backend.camera.getWorldDirection(forward);
  backend.camera.position.copy(center).addScaledVector(forward, -distance);
  backend.controls.target.copy(center);
  if (backend.model) {
    const radius = backend.model.bounds.radius;
    backend.camera.near = Math.max(distance / 1000, 0.01);
    backend.camera.far = Math.max(distance + radius * 2, 1000);
  }
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

function modelBoundsBox(model) {
  if (!model) return null;
  const box = new THREE.Box3();
  const { center, radius } = model.bounds;
  box.expandByPoint(new THREE.Vector3(
    center.x - radius,
    center.y - radius,
    center.z - radius,
  ));
  box.expandByPoint(new THREE.Vector3(
    center.x + radius,
    center.y + radius,
    center.z + radius,
  ));
  return box;
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
