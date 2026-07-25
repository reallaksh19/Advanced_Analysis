import * as THREE from 'three';
import { createStandardMaterial } from './three-object-materials.js';

function vector(point) {
  return new THREE.Vector3(point?.x || 0, point?.y || 0, point?.z || 0);
}

function orientAlong(object, start, end) {
  const direction = new THREE.Vector3().subVectors(vector(end), vector(start));
  if (direction.lengthSq() <= 1e-12) return;
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
}

export function createTubeSegment(primitive, color) {
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

export function createFrustum(primitive, color) {
  const start = vector(primitive.start);
  const end = vector(primitive.end);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = Math.max(direction.length(), 1e-6);
  const startRadius = Math.max(Number(primitive.visualStartDiameterMm) / 2 || 0.5, 0.1);
  const endRadius = Math.max(Number(primitive.visualEndDiameterMm) / 2 || 0.5, 0.1);
  
  // Note: CylinderGeometry is (radiusTop, radiusBottom, height).
  // Top is +y (end), Bottom is -y (start) in its local un-rotated frame.
  const geometry = new THREE.CylinderGeometry(endRadius, startRadius, length, 20, 1, false);
  const mesh = new THREE.Mesh(geometry, createStandardMaterial(color));
  
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  
  return mesh;
}

export function createDisc(primitive, color) {
  const radius = Math.max(Number(primitive.visualOutsideDiameterMm) / 2 || 0.5, 0.1);
  const thickness = Math.max(Number(primitive.visualThicknessMm) || radius * 0.2, 0.1);
  
  const geometry = new THREE.CylinderGeometry(radius, radius, thickness, 24, 1, false);
  const mesh = new THREE.Mesh(geometry, createStandardMaterial(color));
  
  mesh.position.copy(vector(primitive.center));
  orientAlong(mesh, primitive.axisStart, primitive.axisEnd);
  
  return mesh;
}

export function createValveBody(primitive, color) {
  const group = new THREE.Group();
  const bodyDiameter = Math.max(Number(primitive.visualBodyDiameterMm) || 1, 0.2);
  
  const start = vector(primitive.start);
  const end = vector(primitive.end);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = Math.max(direction.length(), 1e-6);
  
  const neckRadius = bodyDiameter * 0.45 / 2;
  const cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(neckRadius, neckRadius, length, 16, 1, false),
    createStandardMaterial(color)
  );
  cylinder.position.copy(start).add(end).multiplyScalar(0.5);
  cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  group.add(cylinder);

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(bodyDiameter / 2, 20, 14),
    createStandardMaterial(color)
  );
  sphere.position.copy(vector(primitive.center));
  group.add(sphere);

  return group;
}
