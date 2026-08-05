import * as THREE from 'three';

export const MIN_LENGTH_MM = 1e-7;
export const OVERLAY_RENDER_ORDER = 40;
export const Y_AXIS = new THREE.Vector3(0, 1, 0);

export function finiteVector(value) {
  return value && [value.x, value.y, value.z].every((row) => Number.isFinite(Number(row)))
    ? new THREE.Vector3(Number(value.x), Number(value.y), Number(value.z))
    : null;
}

export function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function governedPositive(value, code) {
  const result = positive(value);
  if (result === null) throw new Error(`${code}: A positive finite value is required.`);
  return result;
}

export function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function nodeVisualRadius(configuration) {
  return clamp((positive(configuration?.pickingRadius) || 28) * 0.15, 3, 5);
}

export function nodePickRadius(configuration) {
  return clamp((positive(configuration?.pickingRadius) || 28) * 0.6, 10, 18);
}

export function routePickRadius(configuration) {
  return clamp((positive(configuration?.pickingRadius) || 28) * 0.22, 4, 8);
}

export function lineMaterial(cache, colorValue, opacity, depthTest = true) {
  const color = Number.isInteger(colorValue) ? colorValue : 0x64748b;
  const key = `${color}:${opacity}:${depthTest}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.LineBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthTest,
      depthWrite: false,
    }));
  }
  return cache.get(key);
}

export function meshMaterial(cache, colorValue, opacity, depthTest = true) {
  const color = Number.isInteger(colorValue) ? colorValue : 0xef4444;
  const key = `${color}:${opacity}:${depthTest}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthTest,
      depthWrite: false,
    }));
  }
  return cache.get(key);
}

export function invisiblePickMaterial() {
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  material.colorWrite = false;
  return material;
}

export function pickUserData(value) {
  const objectId = value?.entityId || value?.canonicalEntityId || value?.id;
  const isNode = String(value?.type || value?.kind || '').toLowerCase() === 'node';
  return {
    canonicalId: objectId,
    type: value?.type || value?.kind,
    pickTarget: value?.pickTarget || {
      modelRole: isNode ? 'draft' : undefined,
      objectKind: isNode ? 'node' : 'component',
      objectId,
      nodeId: isNode ? objectId : '',
    },
  };
}

export function cylinderBetween(start, end, radiusMm, material, radialSegments) {
  const direction = end.clone().sub(start);
  const lengthMm = direction.length();
  if (lengthMm <= MIN_LENGTH_MM) return null;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusMm, radiusMm, lengthMm, Math.max(8, radialSegments)),
    material,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
  return mesh;
}

export function expandPointRadius(bounds, point, radiusMm) {
  bounds.expandByPoint(new THREE.Vector3(point.x - radiusMm, point.y - radiusMm, point.z - radiusMm));
  bounds.expandByPoint(new THREE.Vector3(point.x + radiusMm, point.y + radiusMm, point.z + radiusMm));
}

export function disposeStaging(root, materialRows = []) {
  const geometries = new Set();
  const materials = new Set(materialRows);
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const rows = Array.isArray(object.material) ? object.material : [object.material];
    rows.filter(Boolean).forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
