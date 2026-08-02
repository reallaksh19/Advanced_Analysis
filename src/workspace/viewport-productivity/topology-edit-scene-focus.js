import * as THREE from 'three';

export const TOPOLOGY_EDIT_FOCUS_RESULT_SCHEMA = 'TopologyEditCanonicalFocusResult.v1';

export function focusTopologyEditCanonicalIds({
  groups,
  camera,
  canonicalIds,
} = {}) {
  if (!groups || !camera) throw new TypeError('Renderer groups and camera are required.');
  const requestedIds = normalizedIds(canonicalIds);
  if (!requestedIds.length) throw new TypeError('At least one canonical ID is required.');
  const requested = new Set(requestedIds);
  const found = new Set();
  const bounds = new THREE.Box3();
  Object.values(groups).forEach((group) => collectGroupBounds(
    group,
    requested,
    found,
    bounds,
  ));
  if (bounds.isEmpty()) return freezeResult('NOT_FOUND', requestedIds, []);
  frameCamera(camera, bounds);
  return freezeResult('FOCUSED', requestedIds, [...found].sort());
}

function collectGroupBounds(group, requested, found, bounds) {
  if (!group?.visible) return;
  group.updateWorldMatrix?.(true, true);
  group.traverse((object) => {
    if (!object.visible || hasNonPickableAncestor(object)) return;
    if (object.isInstancedMesh) collectInstanceBounds(object, requested, found, bounds);
    else collectObjectBounds(object, requested, found, bounds);
  });
}

function collectObjectBounds(object, requested, found, bounds) {
  const id = canonicalIdForTarget(object.userData?.pickTarget);
  if (!id || !requested.has(id) || !object.geometry) return;
  object.geometry.computeBoundingBox();
  if (!object.geometry.boundingBox) return;
  bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  found.add(id);
}

function collectInstanceBounds(mesh, requested, found, bounds) {
  if (!mesh.geometry || !Array.isArray(mesh.userData?.pickTable)) return;
  mesh.geometry.computeBoundingBox();
  if (!mesh.geometry.boundingBox) return;
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < mesh.count; index += 1) {
    const id = canonicalIdForTarget(mesh.userData.pickTable[index]);
    if (!id || !requested.has(id)) continue;
    mesh.getMatrixAt(index, matrix);
    if (matrixScaleIsZero(matrix)) continue;
    const worldMatrix = new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, matrix);
    bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(worldMatrix));
    found.add(id);
  }
}

function frameCamera(camera, bounds) {
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const distance = Math.max(size.length() * 1.8, 10);
  const direction = camera.position.clone().sub(center);
  if (direction.lengthSq() < 1e-9) direction.set(1, 1, 1);
  direction.normalize();
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.lookAt(center);
  if (camera.isPerspectiveCamera) {
    camera.near = Math.max(distance / 1000, 0.01);
    camera.far = Math.max(distance * 100, 1000);
  }
  camera.updateProjectionMatrix();
}

function canonicalIdForTarget(target) {
  const id = String(target?.objectId ?? target?.canonicalId ?? '').trim();
  return id || null;
}

function matrixScaleIsZero(matrix) {
  const scale = new THREE.Vector3();
  scale.setFromMatrixScale(matrix);
  return scale.x === 0 || scale.y === 0 || scale.z === 0;
}

function hasNonPickableAncestor(object) {
  let current = object;
  while (current) {
    if (current.userData?.nonPickable) return true;
    current = current.parent;
  }
  return false;
}

function normalizedIds(values) {
  if (!Array.isArray(values) && !(values instanceof Set)) {
    throw new TypeError('Canonical IDs must be supplied as an array or Set.');
  }
  return [...new Set([...values].map((value) => String(value ?? '').trim())
    .filter(Boolean))].sort();
}

function freezeResult(status, requestedIds, foundIds) {
  return Object.freeze({
    schema: TOPOLOGY_EDIT_FOCUS_RESULT_SCHEMA,
    status,
    requestedIds: Object.freeze(requestedIds),
    foundIds: Object.freeze(foundIds),
  });
}
