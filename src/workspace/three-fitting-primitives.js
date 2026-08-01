import * as THREE from 'three';
import { createStandardMaterial } from './three-object-materials.js';
import { createSourceCenterline, segmentCount, vector } from './three-pipe-primitives.js';

export function createTubeSegment(primitive, color, settings) { return createCylinder(primitive, color, settings); }

export function createFrustum(primitive, color, settings) {
  const startDiameter = positive(primitive.visualStartDiameterMm);
  const endDiameter = positive(primitive.visualEndDiameterMm);
  const segments = segmentCount(settings?.meshRadialSegments);
  if (startDiameter === null || endDiameter === null || segments === null) return createSourceCenterline(primitive.start, primitive.end, color);
  const frame = spanFrame(primitive.start, primitive.end);
  if (!frame) return null;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(endDiameter / 2, startDiameter / 2, frame.length, segments, 1, false), createStandardMaterial(color));
  placeAlong(mesh, frame);
  return mesh;
}

export function createDisc(primitive, color, settings) {
  const diameter = positive(primitive.visualOutsideDiameterMm);
  const segments = segmentCount(settings?.meshRadialSegments);
  const frame = spanFrame(primitive.start || primitive.axisStart, primitive.end || primitive.axisEnd);
  if (!frame) return null;
  if (diameter === null || segments === null) return createSourceCenterline(primitive.start || primitive.axisStart, primitive.end || primitive.axisEnd, color);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(diameter / 2, diameter / 2, frame.length, segments, 1, false), createStandardMaterial(color));
  placeAlong(mesh, frame);
  return mesh;
}

export function createValveBody(primitive, color, settings) {
  const diameter = positive(primitive.visualBodyDiameterMm);
  const segments = segmentCount(settings?.meshRadialSegments);
  const frame = spanFrame(primitive.start, primitive.end);
  if (!frame) return null;
  if (diameter === null || segments === null) return createSourceCenterline(primitive.start, primitive.end, color);
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(diameter / 2, segments, segments), createStandardMaterial(color));
  body.position.copy(vector(primitive.center));
  group.add(body);
  const connection = new THREE.Mesh(new THREE.CylinderGeometry(diameter / 2, diameter / 2, frame.length, segments, 1, false), createStandardMaterial(color));
  placeAlong(connection, frame);
  group.add(connection);
  return group;
}

function createCylinder(primitive, color, settings) {
  const diameter = positive(primitive.visualDiameterMm);
  const segments = segmentCount(settings?.meshRadialSegments);
  const frame = spanFrame(primitive.start, primitive.end);
  if (!frame) return null;
  if (diameter === null || segments === null) return createSourceCenterline(primitive.start, primitive.end, color);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(diameter / 2, diameter / 2, frame.length, segments, 1, false), createStandardMaterial(color));
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
