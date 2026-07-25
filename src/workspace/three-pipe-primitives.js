import * as THREE from 'three';
import { createStandardMaterial } from './three-object-materials.js';

function vector(point) {
  return new THREE.Vector3(point?.x || 0, point?.y || 0, point?.z || 0);
}

export function createPipeTube(primitive, color) {
  const start = vector(primitive.start);
  const end = vector(primitive.end);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = Math.max(direction.length(), 1e-6);
  const radius = Math.max(Number(primitive.visualDiameterMm) / 2 || 0.5, 0.1);
  
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 20, 1, false);
  const mesh = new THREE.Mesh(geometry, createStandardMaterial(color));
  
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  
  return mesh;
}

export function createBendArc(primitive, color) {
  if (!primitive.path || primitive.path.length < 2) {
    // Fallback to straight tube if path is missing
    return createPipeTube(primitive, color);
  }

  const points = primitive.path.map(vector);
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const radius = Math.max(Number(primitive.visualDiameterMm) / 2 || 0.5, 0.1);
  
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(points.length * 2, 12), radius, 16, false),
    createStandardMaterial(color),
  );
}
