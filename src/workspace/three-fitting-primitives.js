import * as THREE from 'three';
import { createStandardMaterial } from './three-object-materials.js';
import { acquireGeometry, createSourceCenterline, finiteKey, segmentCount, vector } from './three-pipe-primitives.js';

export function createTubeSegment(primitive, color, settings, resourcePool = null) { return createCylinder(primitive, color, settings, resourcePool); }

export function createFrustum(primitive, color, settings, resourcePool = null) {
  const startDiameter = positive(primitive.visualStartDiameterMm);
  const endDiameter = positive(primitive.visualEndDiameterMm);
  const segments = segmentCount(settings?.meshRadialSegments);
  if (startDiameter === null || endDiameter === null || segments === null) return createSourceCenterline(primitive.start, primitive.end, color, resourcePool);
  const frame = spanFrame(primitive.start, primitive.end);
  if (!frame) return null;
  const key = [
    'frustum',
    `start=${finiteKey(startDiameter)}`,
    `end=${finiteKey(endDiameter)}`,
    `length=${finiteKey(frame.length)}`,
    `radial=${segments}`,
  ].join(':');
  const geometry = acquireGeometry(
    resourcePool,
    key,
    () => new THREE.CylinderGeometry(endDiameter / 2, startDiameter / 2, frame.length, segments, 1, false),
  );
  const mesh = new THREE.Mesh(geometry, createStandardMaterial(color, resourcePool));
  placeAlong(mesh, frame);
  return mesh;
}

export function createDisc(primitive, color, settings, resourcePool = null) {
  const diameter = positive(primitive.visualOutsideDiameterMm);
  const segments = segmentCount(settings?.meshRadialSegments);
  const frame = spanFrame(primitive.start || primitive.axisStart, primitive.end || primitive.axisEnd);
  if (!frame) return null;
  if (diameter === null || segments === null) return createSourceCenterline(primitive.start || primitive.axisStart, primitive.end || primitive.axisEnd, color, resourcePool);
  const geometry = acquireGeometry(
    resourcePool,
    `cylinder-unit:radial=${segments}:height=1:open=false`,
    () => new THREE.CylinderGeometry(0.5, 0.5, 1, segments, 1, false),
  );
  const mesh = new THREE.Mesh(geometry, createStandardMaterial(color, resourcePool));
  mesh.scale.set(diameter, frame.length, diameter);
  placeAlong(mesh, frame);
  return mesh;
}

export function createValveBody(primitive, color, settings, resourcePool = null) {
  const diameter = positive(primitive.visualBodyDiameterMm);
  const segments = segmentCount(settings?.meshRadialSegments);
  const frame = spanFrame(primitive.start, primitive.end);
  if (!frame) return null;
  if (diameter === null || segments === null) return createSourceCenterline(primitive.start, primitive.end, color, resourcePool);
  const group = new THREE.Group();
  const material = createStandardMaterial(color, resourcePool);
  const bodyGeometry = acquireGeometry(
    resourcePool,
    `sphere-unit:width=${segments}:height=${segments}`,
    () => new THREE.SphereGeometry(0.5, segments, segments),
  );
  const body = new THREE.Mesh(bodyGeometry, material);
  body.scale.setScalar(diameter);
  body.position.copy(vector(primitive.center));
  group.add(body);
  const connectionGeometry = acquireGeometry(
    resourcePool,
    `cylinder-unit:radial=${segments}:height=1:open=false`,
    () => new THREE.CylinderGeometry(0.5, 0.5, 1, segments, 1, false),
  );
  const connection = new THREE.Mesh(connectionGeometry, material);
  connection.scale.set(diameter, frame.length, diameter);
  placeAlong(connection, frame);
  group.add(connection);
  return group;
}

function createCylinder(primitive, color, settings, resourcePool) {
  const diameter = positive(primitive.visualDiameterMm);
  const segments = segmentCount(settings?.meshRadialSegments);
  const frame = spanFrame(primitive.start, primitive.end);
  if (!frame) return null;
  if (diameter === null || segments === null) return createSourceCenterline(primitive.start, primitive.end, color, resourcePool);
  const geometry = acquireGeometry(
    resourcePool,
    `cylinder-unit:radial=${segments}:height=1:open=false`,
    () => new THREE.CylinderGeometry(0.5, 0.5, 1, segments, 1, false),
  );
  const mesh = new THREE.Mesh(geometry, createStandardMaterial(color, resourcePool));
  mesh.scale.set(diameter, frame.length, diameter);
  placeAlong(mesh, frame);
  return mesh;
}

function spanFrame(startPoint, endPoint) {
  const start = vector(startPoint);
  const end = vector(endPoint);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  return length > 0 ? { start, end, direction: direction.normalize(), length } : null;
}

function placeAlong(mesh, frame) {
  mesh.position.copy(frame.start).add(frame.end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), frame.direction);
}

function positive(value) { return Number.isFinite(value) && value > 0 ? value : null; }
