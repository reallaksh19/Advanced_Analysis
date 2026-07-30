import * as THREE from 'three';
import { createSupportMaterial } from './three-object-materials.js';

function vector(point) {
  return new THREE.Vector3(point?.x || 0, point?.y || 0, point?.z || 0);
}

export function createSupportSymbol(primitive, color) {
  const group = new THREE.Group();
  const size = Math.max(Number(primitive.visualSizeMm) || 50, 40);
  const mat = createSupportMaterial('#22c55e'); // Engineering green support

  // 1. Pipe Collar Ring around pipe
  const ring = new THREE.Mesh(new THREE.TorusGeometry(size * 0.7, size * 0.18, 12, 24), mat);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  // 2. Vertical Support Stanchion Column
  const column = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.25, size * 0.25, size * 1.5, 12), mat);
  column.position.y = -size * 0.75;
  group.add(column);

  // 3. Grounded Base Plate
  const base = new THREE.Mesh(new THREE.BoxGeometry(size * 1.6, size * 0.25, size * 1.6), mat);
  base.position.y = -size * 1.5;
  group.add(base);

  group.position.copy(vector(primitive.center));
  return group;
}

export function createFallbackMarker(primitive, color) {
  const radius = Math.max(Number(primitive.visualDiameterMm) / 2 || 20, 15);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 12),
    createSupportMaterial(color || '#f59e0b')
  );
  mesh.position.copy(vector(primitive.center));
  return mesh;
}
