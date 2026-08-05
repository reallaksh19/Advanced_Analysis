import * as THREE from 'three';

export const TOPOLOGY_EDIT_SJSON_EQUIPMENT_GEOMETRY_AUTHORITY =
  'GOVERNED_TYPED_INLINE_EQUIPMENT_PROFILE_V1';

const EQUIPMENT_KINDS = new Set(['FLANGE', 'GASKET', 'VALVE', 'INSTRUMENT']);

export function isGovernedSjsonEquipmentKind(kind) {
  return EQUIPMENT_KINDS.has(String(kind || '').toUpperCase());
}

/**
 * Returns one local-Y geometry so the governed route renderer can apply the same
 * deterministic axis quaternion used for ordinary route bodies. The geometry is
 * presentation-only and never changes physical topology or certified dimensions.
 */
export function createGovernedSjsonEquipmentGeometry({
  kind,
  radiusMm,
  lengthMm,
  radialSegments,
} = {}) {
  const type = String(kind || '').toUpperCase();
  const radius = positive(radiusMm);
  const length = positive(lengthMm);
  if (!EQUIPMENT_KINDS.has(type) || !radius || !length) return null;
  const segments = Math.max(12, Math.floor(Number(radialSegments) || 16));

  if (type === 'FLANGE') {
    return new THREE.LatheGeometry([
      new THREE.Vector2(radius * 0.72, -length * 0.5),
      new THREE.Vector2(radius * 0.72, -length * 0.22),
      new THREE.Vector2(radius * 1.55, -length * 0.18),
      new THREE.Vector2(radius * 1.55, length * 0.18),
      new THREE.Vector2(radius * 0.72, length * 0.22),
      new THREE.Vector2(radius * 0.72, length * 0.5),
    ], segments);
  }

  if (type === 'GASKET') {
    return new THREE.CylinderGeometry(
      radius * 1.35,
      radius * 1.35,
      Math.max(length, radius * 0.18),
      segments,
    );
  }

  if (type === 'VALVE') {
    return new THREE.LatheGeometry([
      new THREE.Vector2(radius * 0.7, -length * 0.5),
      new THREE.Vector2(radius * 0.78, -length * 0.32),
      new THREE.Vector2(radius * 1.5, -length * 0.08),
      new THREE.Vector2(radius * 1.5, length * 0.08),
      new THREE.Vector2(radius * 0.78, length * 0.32),
      new THREE.Vector2(radius * 0.7, length * 0.5),
    ], segments);
  }

  const markerRadius = Math.max(radius * 1.35, length * 0.42);
  const geometry = new THREE.SphereGeometry(
    markerRadius,
    segments,
    Math.max(8, Math.floor(segments * 0.75)),
  );
  geometry.scale(1, Math.max(0.8, length / (markerRadius * 2)), 1);
  return geometry;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
