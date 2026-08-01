import * as THREE from 'three';
import { createLineMaterial, createStandardMaterial } from './three-object-materials.js';

export function createSourceCenterline(startPoint, endPoint, color) {
  const start = vector(startPoint);
  const end = vector(endPoint);
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  return new THREE.Line(geometry, createLineMaterial(color));
}

/** Creates a physical tube only when source diameter and mesh quality exist. */
export function createPipeTube(primitive, color, settings) {
  const diameter = positive(primitive.visualDiameterMm);
  const segments = segmentCount(settings?.meshRadialSegments);
  if (diameter === null || segments === null) return createSourceCenterline(primitive.start, primitive.end, color);
  const start = vector(primitive.start);
  const end = vector(primitive.end);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  if (!(length > 0)) return null;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(diameter / 2, diameter / 2, length, segments, 1, false), createStandardMaterial(color));
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

export function createBendArc(primitive, color, settings) {
  if (!Array.isArray(primitive.path) || primitive.path.length < 2) return createSourceCenterline(primitive.start, primitive.end, color);
  const diameter = positive(primitive.visualDiameterMm);
  const segments = segmentCount(settings?.meshRadialSegments);
  if (diameter === null || segments === null) {
    const geometry = new THREE.BufferGeometry().setFromPoints(primitive.path.map(vector));
    return new THREE.Line(geometry, createLineMaterial(color));
  }
  const curve = new THREE.CatmullRomCurve3(primitive.path.map(vector), false, 'centripetal');
  return new THREE.Mesh(new THREE.TubeGeometry(curve, primitive.path.length, diameter / 2, segments, false), createStandardMaterial(color));
}

export function vector(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) throw new TypeError('Three primitive requires a finite source coordinate.');
  return new THREE.Vector3(point.x, point.y, point.z);
}

export function segmentCount(value) { return Number.isInteger(value) && value >= 3 ? value : null; }
function positive(value) { return Number.isFinite(value) && value > 0 ? value : null; }
