import * as THREE from 'three';
import { createLineMaterial, createSupportMaterial } from './three-object-materials.js';
import { acquireGeometry, vector } from './three-pipe-primitives.js';

/** One exact-size marker per canonical physical support site. */
export function createSupportSymbol(primitive, color, resourcePool = null) {
  const size = Number(primitive.visualSizeMm);
  if (!Number.isFinite(size) || size <= 0) return null;
  const geometry = acquireGeometry(resourcePool, 'box-unit:1', () => new THREE.BoxGeometry(1, 1, 1));
  const mesh = new THREE.Mesh(geometry, createSupportMaterial('#22c55e', resourcePool));
  mesh.scale.setScalar(size);
  mesh.position.copy(vector(primitive.center));
  return mesh;
}

export function createFallbackMarker() { return null; }

export function createOverlapHighlight(position, size, resourcePool = null) {
  if (!Number.isFinite(size) || size <= 0) return null;
  const geometry = acquireGeometry(resourcePool, 'box-unit:1', () => new THREE.BoxGeometry(1, 1, 1));
  const mesh = new THREE.Mesh(geometry, createSupportMaterial('#38bdf8', resourcePool));
  mesh.scale.setScalar(size);
  mesh.position.copy(vector(position));
  return mesh;
}

export function createNewConnectionLine(start, end, resourcePool = null) {
  const geometry = new THREE.BufferGeometry().setFromPoints([vector(start), vector(end)]);
  return new THREE.Line(geometry, createLineMaterial(0xef4444, resourcePool));
}
