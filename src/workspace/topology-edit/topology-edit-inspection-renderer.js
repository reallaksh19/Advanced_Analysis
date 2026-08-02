import * as THREE from 'three';
import { TOPOLOGY_EDIT_INSPECTION_SCHEMA } from './topology-edit-inspection-model.js';

const SELECTION_COLOR = 0xfacc15;
const MEASUREMENT_COLOR = 0xa78bfa;

export class TopologyEditInspectionRenderer {
  constructor({ selectionGroup, measurementGroup } = {}) {
    if (!selectionGroup || !measurementGroup) {
      throw new TypeError('Selection and measurement groups are required.');
    }
    this.selectionGroup = selectionGroup;
    this.measurementGroup = measurementGroup;
    this.selectionGroup.userData.nonPickable = true;
    this.measurementGroup.userData.nonPickable = true;
    this.disposed = false;
  }

  render(model, bounds = null) {
    this.assertActive();
    this.clear();
    if (model?.schema !== TOPOLOGY_EDIT_INSPECTION_SCHEMA) {
      throw new TypeError(`Inspection renderer requires ${TOPOLOGY_EDIT_INSPECTION_SCHEMA}.`);
    }
    if (model.status !== 'READY') {
      return Object.freeze({ selectionObjects: 0, measurementObjects: 0 });
    }
    const markerSize = markerSizeForBounds(bounds);
    renderSelection(this.selectionGroup, model.overlay, markerSize);
    renderMeasurement(this.measurementGroup, model.overlay.measurement, markerSize);
    return Object.freeze({
      selectionObjects: this.selectionGroup.children.length,
      measurementObjects: this.measurementGroup.children.length,
    });
  }

  clear() {
    clearGroup(this.selectionGroup);
    clearGroup(this.measurementGroup);
  }

  destroy() {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.selectionGroup = null;
    this.measurementGroup = null;
  }

  assertActive() {
    if (this.disposed) throw new Error('Inspection renderer is disposed.');
  }
}

function renderSelection(group, overlay, markerSize) {
  const pointMaterial = new THREE.MeshBasicMaterial({
    color: SELECTION_COLOR,
    depthTest: false,
    transparent: true,
    opacity: 0.95,
  });
  for (const row of overlay.points ?? []) {
    const geometry = new THREE.SphereGeometry(markerSize, 16, 12);
    const mesh = new THREE.Mesh(geometry, pointMaterial.clone());
    mesh.position.set(row.point.x, row.point.y, row.point.z);
    mesh.renderOrder = 900;
    mesh.userData = {
      canonicalId: row.canonicalId,
      selectionOrder: row.order,
      nonPickable: true,
    };
    group.add(mesh);
  }
  pointMaterial.dispose();
  for (const row of overlay.segments ?? []) {
    const mesh = cylinderBetween(
      row.start,
      row.end,
      markerSize * 0.22,
      SELECTION_COLOR,
      0.9,
    );
    if (!mesh) continue;
    mesh.renderOrder = 890;
    mesh.userData = {
      canonicalId: row.canonicalId,
      role: row.role,
      nonPickable: true,
    };
    group.add(mesh);
  }
}

function renderMeasurement(group, measurement, markerSize) {
  if (!measurement) return;
  const start = vector(measurement.start);
  const end = vector(measurement.end);
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const material = new THREE.LineDashedMaterial({
    color: MEASUREMENT_COLOR,
    dashSize: Math.max(markerSize * 1.2, 1),
    gapSize: Math.max(markerSize * 0.65, 0.5),
    depthTest: false,
    transparent: true,
    opacity: 0.95,
  });
  const line = new THREE.Line(geometry, material);
  line.computeLineDistances();
  line.renderOrder = 910;
  line.userData = { role: measurement.kind, nonPickable: true };
  group.add(line);
  const endpointGeometry = new THREE.SphereGeometry(markerSize * 0.5, 12, 8);
  for (const [role, point] of [['FROM', start], ['TO', end]]) {
    const marker = new THREE.Mesh(
      endpointGeometry.clone(),
      new THREE.MeshBasicMaterial({
        color: MEASUREMENT_COLOR,
        depthTest: false,
      }),
    );
    marker.position.copy(point);
    marker.renderOrder = 915;
    marker.userData = { role: `MEASUREMENT_${role}`, nonPickable: true };
    group.add(marker);
  }
  endpointGeometry.dispose();
}

function cylinderBetween(startValue, endValue, radius, color, opacity) {
  const start = vector(startValue);
  const end = vector(endValue);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  if (!(length > 1e-9)) return null;
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 12);
  const material = new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    transparent: opacity < 1,
    opacity,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.addVectors(start, end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  return mesh;
}

function clearGroup(group) {
  if (!group) return;
  const geometries = new Set();
  const materials = new Set();
  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const rows = Array.isArray(object.material)
      ? object.material
      : [object.material];
    rows.filter(Boolean).forEach((material) => materials.add(material));
  });
  while (group.children.length) group.remove(group.children[0]);
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function markerSizeForBounds(bounds) {
  if (!bounds || bounds.isEmpty?.()) return 6;
  const diagonal = bounds.getSize(new THREE.Vector3()).length();
  return Math.max(diagonal * 0.01, 3);
}

function vector(point) {
  return new THREE.Vector3(point.x, point.y, point.z);
}
