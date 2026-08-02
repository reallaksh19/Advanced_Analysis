import * as THREE from 'three';
import { finiteTopologyEditPoint } from './topology-edit-interaction-values.js';

const AXES = Object.freeze({
  X: new THREE.Vector3(1, 0, 0),
  Y: new THREE.Vector3(0, 1, 0),
  Z: new THREE.Vector3(0, 0, 1),
});

const COLORS = Object.freeze({
  X: 0xef4444,
  Y: 0x22c55e,
  Z: 0x3b82f6,
  ANCHOR: 0xf8fafc,
  TARGET: 0xf59e0b,
});

export function renderTopologyEditGizmoGroup(group, gizmoModel, preview = null) {
  if (!group) throw new TypeError('A Three.js gizmo group is required.');
  clearTopologyEditGizmoGroup(group);
  if (!gizmoModel) return null;
  const anchor = finiteTopologyEditPoint(
    gizmoModel.anchorPosition,
    'gizmo.anchorPosition',
  );
  const scale = Number(gizmoModel.scaleMm);
  if (!(scale > 0)) throw new RangeError('Gizmo scale must be positive.');
  group.position.set(anchor.x, anchor.y, anchor.z);
  group.add(markerMesh(scale * 0.065, COLORS.ANCHOR));
  for (const handle of gizmoModel.handles ?? []) {
    if (handle.kind === 'AXIS') group.add(axisHandle(handle.mode, scale));
    if (handle.kind === 'PLANE') group.add(planeHandle(handle.mode, scale));
  }
  if (preview?.targetPosition) {
    group.add(previewMarker(preview.targetPosition, anchor, scale));
  }
  return Object.freeze({ anchor, scaleMm: scale });
}

export function clearTopologyEditGizmoGroup(group) {
  if (!group) return;
  const geometries = new Set();
  const materials = new Set();
  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const rows = Array.isArray(object.material) ? object.material : [object.material];
    rows.filter(Boolean).forEach((material) => materials.add(material));
  });
  while (group.children.length) group.remove(group.children[0]);
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  group.position.set(0, 0, 0);
}

function axisHandle(mode, scale) {
  const axisName = mode.slice(-1);
  const axis = AXES[axisName];
  const root = handleRoot(mode);
  const material = new THREE.MeshBasicMaterial({ color: COLORS[axisName] });
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(scale * 0.025, scale * 0.025, scale * 0.7, 12),
    material,
  );
  shaft.position.copy(axis).multiplyScalar(scale * 0.35);
  shaft.quaternion.setFromUnitVectors(AXES.Y, axis);
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(scale * 0.07, scale * 0.2, 16),
    material,
  );
  head.position.copy(axis).multiplyScalar(scale * 0.8);
  head.quaternion.setFromUnitVectors(AXES.Y, axis);
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(scale * 0.08, scale * 0.08, scale, 8),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.01,
      depthWrite: false,
    }),
  );
  hit.position.copy(axis).multiplyScalar(scale * 0.5);
  hit.quaternion.setFromUnitVectors(AXES.Y, axis);
  hit.userData.interactionMode = mode;
  root.add(shaft, head, hit);
  return root;
}

function planeHandle(mode, scale) {
  const axes = mode.slice(-2).split('');
  const root = handleRoot(mode);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(scale * 0.24, scale * 0.24),
    new THREE.MeshBasicMaterial({
      color: COLORS[axes[0]],
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.position.copy(AXES[axes[0]])
    .add(AXES[axes[1]])
    .multiplyScalar(scale * 0.22);
  if (mode === 'PLANE_YZ') mesh.rotation.y = Math.PI / 2;
  if (mode === 'PLANE_XZ') mesh.rotation.x = Math.PI / 2;
  mesh.userData.interactionMode = mode;
  root.add(mesh);
  return root;
}

function handleRoot(mode) {
  const root = new THREE.Group();
  root.userData.interactionMode = mode;
  return root;
}

function previewMarker(targetInput, anchor, scale) {
  const target = finiteTopologyEditPoint(
    targetInput,
    'preview.targetPosition',
  );
  const marker = markerMesh(scale * 0.08, COLORS.TARGET);
  marker.position.set(
    target.x - anchor.x,
    target.y - anchor.y,
    target.z - anchor.z,
  );
  return marker;
}

function markerMesh(radius, color) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 12),
    new THREE.MeshBasicMaterial({ color }),
  );
  mesh.userData.nonPickable = true;
  return mesh;
}
