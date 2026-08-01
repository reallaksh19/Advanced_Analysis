import * as THREE from 'three';
import { createLineMaterial, createSupportMaterial } from './three-object-materials.js';
import { vector } from './three-pipe-primitives.js';

/** One exact-size marker per canonical physical support site. */
export function createSupportSymbol(primitive) {
  const size = Number(primitive.visualSizeMm);
  if (!Number.isFinite(size) || size <= 0) return null;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), createSupportMaterial('#22c55e'));
  mesh.position.copy(vector(primitive.center));
  return mesh;
}

export function createFallbackMarker() { return null; }

export function createOverlapHighlight(position, size) {
  if (!Number.isFinite(size) || size <= 0) return null;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), createSupportMaterial('#38bdf8'));
  mesh.position.copy(vector(position));
  return mesh;
}

export function createNewConnectionLine(start, end) {
  const geometry = new THREE.BufferGeometry().setFromPoints([vector(start), vector(end)]);
  return new THREE.Line(geometry, createLineMaterial(0xef4444));
}
