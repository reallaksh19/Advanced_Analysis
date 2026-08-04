import * as THREE from 'three';
import { createLineMaterial, createStandardMaterial } from './three-object-materials.js';

export function createSourceCenterline(startPoint, endPoint, color, resourcePool = null) {
  const start = vector(startPoint);
  const end = vector(endPoint);
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  return new THREE.Line(geometry, createLineMaterial(color, resourcePool));
}

/** Creates a physical tube only when source diameter and mesh quality exist. */
export function createPipeTube(primitive, color, settings, resourcePool = null) {
  const diameter = positive(primitive.visualDiameterMm);
  const segments = segmentCount(settings?.meshRadialSegments);
  if (diameter === null || segments === null) return createSourceCenterline(primitive.start, primitive.end, color, resourcePool);
  const start = vector(primitive.start);
  const end = vector(primitive.end);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  if (!(length > 0)) return null;
  const geometry = acquireGeometry(
    resourcePool,
    `cylinder-unit:radial=${segments}:height=1:open=false`,
    () => new THREE.CylinderGeometry(0.5, 0.5, 1, segments, 1, false),
  );
  const mesh = new THREE.Mesh(geometry, createStandardMaterial(color, resourcePool));
  mesh.scale.set(diameter, length, diameter);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

export function createBendArc(primitive, color, settings, resourcePool = null) {
  if (!Array.isArray(primitive.path) || primitive.path.length < 2) return createSourceCenterline(primitive.start, primitive.end, color, resourcePool);
  const diameter = positive(primitive.visualDiameterMm);
  const segments = segmentCount(settings?.meshRadialSegments);
  if (diameter === null || segments === null) {
    const geometry = new THREE.BufferGeometry().setFromPoints(primitive.path.map(vector));
    return new THREE.Line(geometry, createLineMaterial(color, resourcePool));
  }
  const curve = new THREE.CatmullRomCurve3(primitive.path.map(vector), false, 'centripetal');
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, primitive.path.length, diameter / 2, segments, false),
    createStandardMaterial(color, resourcePool),
  );
}

export function vector(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) throw new TypeError('Three primitive requires a finite source coordinate.');
  return new THREE.Vector3(point.x, point.y, point.z);
}

export function segmentCount(value) { return Number.isInteger(value) && value >= 3 ? value : null; }
export function acquireGeometry(resourcePool, key, factory) { return resourcePool?.geometry ? resourcePool.geometry(key, factory) : factory(); }
export function finiteKey(value) {
  if (!Number.isFinite(value)) throw new TypeError('Three pooled geometry key requires a finite number.');
  return Object.is(value, -0) ? '0' : Number(value).toPrecision(15);
}
function positive(value) { return Number.isFinite(value) && value > 0 ? value : null; }
