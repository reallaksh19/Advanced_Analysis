/** Disposable Three.js geometry and material helpers for the edit viewport. */
import * as THREE from 'three';

export const STANDARD_VIEW_DIRECTIONS = Object.freeze({
  TOP: new THREE.Vector3(0, 1, 0.001).normalize(),
  BOTTOM: new THREE.Vector3(0, -1, 0.001).normalize(),
  FRONT: new THREE.Vector3(0, 0, 1),
  BACK: new THREE.Vector3(0, 0, -1),
  LEFT: new THREE.Vector3(-1, 0, 0),
  RIGHT: new THREE.Vector3(1, 0, 0),
  ISO: new THREE.Vector3(1, 1, 1).normalize(),
});

export function segmentGeometry(segment, radius) {
  if (Array.isArray(segment.points) && segment.points.length >= 2) {
    return tubeGeometry(segment, radius);
  }
  const start = vector3(segment.start);
  const end = vector3(segment.end);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  if (length < 1e-6) return null;
  const endRadius = positiveNumber(segment.endRadiusMm) || radius;
  return {
    geometry: new THREE.CylinderGeometry(endRadius, radius, length, 12),
    position: new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5),
    quaternion: new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    ),
  };
}

export function computeProjectionBounds(elements, segments) {
  const bounds = new THREE.Box3();
  for (const element of elements) {
    if (finiteElement(element)) bounds.expandByPoint(vector3(element));
  }
  for (const segment of segments) {
    const points = segment.points || [segment.start, segment.end];
    points.filter(isFinitePoint).forEach((point) => bounds.expandByPoint(vector3(point)));
  }
  return bounds;
}

export function markerSizeForBounds(bounds) {
  if (!bounds || bounds.isEmpty()) return 10;
  return Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.008, 5);
}

export function createViewportMaterial(color, opacity) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 0.2,
    transparent: opacity < 1,
    opacity,
  });
}

export function cachedViewportMaterial(cache, color, opacity) {
  const key = `${color}:${opacity}`;
  if (!cache.has(key)) cache.set(key, createViewportMaterial(color, opacity));
  return cache.get(key);
}

export function pickUserData(value) {
  return {
    canonicalId: value.entityId || value.id,
    type: value.type,
    pickTarget: value.pickTarget || fallbackPick(value),
  };
}

export function fallbackPick(value) {
  return {
    objectKind: value.type === 'node' ? 'node' : 'component',
    objectId: value.entityId || value.id,
    nodeId: value.type === 'node' ? value.entityId || value.id : '',
  };
}

export function finiteElement(element) {
  return element && [element.x, element.y, element.z].every(Number.isFinite);
}

export function isFinitePoint(point) {
  return point && [point.x, point.y, point.z].every(Number.isFinite);
}

export function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function applyObjectClipping(object, clippingPlanes) {
  if (!object?.material) return;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  materials.forEach((material) => {
    material.clippingPlanes = clippingPlanes;
    material.clipIntersection = false;
    material.needsUpdate = true;
  });
}

export function disposeViewportGroup(group) {
  const geometries = new Set();
  const materials = new Set();
  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const rows = Array.isArray(object.material) ? object.material : [object.material];
    rows.filter(Boolean).forEach((material) => materials.add(material));
  });
  while (group.children.length) group.remove(group.children[0]);
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function tubeGeometry(segment, radius) {
  const points = segment.points.filter(isFinitePoint).map(vector3);
  if (points.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  return {
    geometry: new THREE.TubeGeometry(
      curve,
      Math.max(points.length - 1, 1),
      radius,
      12,
      false,
    ),
  };
}

function vector3(point) {
  return new THREE.Vector3(point.x, point.y, point.z);
}
