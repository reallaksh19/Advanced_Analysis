import * as THREE from 'three';
import { createSupportMaterial } from './three-object-materials.js';

function vector(point) {
  return new THREE.Vector3(point?.x || 0, point?.y || 0, point?.z || 0);
}

export function createSupportSymbol(primitive, color) {
  const size = Math.max(Number(primitive.visualSizeMm) || 1, 0.2);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    createSupportMaterial(color)
  );
  mesh.position.copy(vector(primitive.center));
  return mesh;
}

export function createFallbackMarker(primitive, color) {
  const radius = Math.max(Number(primitive.visualDiameterMm) / 2 || 0.5, 0.1);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(radius, 0.1), 18, 12),
    createSupportMaterial(color) // Support material has opacity, good for fallbacks too
  );
  mesh.position.copy(vector(primitive.center));
  return mesh;
}
