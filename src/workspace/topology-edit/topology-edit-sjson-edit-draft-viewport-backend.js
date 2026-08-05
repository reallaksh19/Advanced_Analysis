import * as THREE from 'three';
import { TopologyEditNavigationHudViewportBackend } from './topology-edit-navigation-hud-viewport-backend.js';
import { TopologyEditTypedViewportBackend } from './topology-edit-typed-viewport-backend.js';
import { optimizeTopologyEditRenderGroups } from './topology-edit-render-optimizer.js';
import {
  TOPOLOGY_EDIT_SUPPORT_RENDER_STYLES,
} from './topology-edit-support-viewport-backend.js';
import {
  TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_STYLE,
} from './topology-edit-sjson-edit-draft-projection.js';

const MIN_LENGTH_MM = 1e-7;
const TOPO_VALIDATOR_COMPACT_SUPPORT_MARKER_OPACITY = 0.15;
const TOPO_VALIDATOR_COMPACT_RESTRAINT_OPACITY = 0.5;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * SJSON-only viewport adapter. It keeps the professional interaction, picking,
 * HUD, sectioning and render-resource layers, while replacing rich component
 * solids with the compact Edit Draft representation.
 */
export class TopologyEditSjsonEditDraftNavigationHudViewportBackend
  extends TopologyEditNavigationHudViewportBackend {
  renderSession(model) {
    this.renderOptimizationEvidence = null;
    // Bypass SupportViewportBackend.renderSession: that method intentionally
    // removes restraint direction segments because rich glyphs rebuild them.
    // The compact Edit Draft renderer consumes those governed segments directly.
    TopologyEditTypedViewportBackend.prototype.renderSession.call(this, model);
    this.renderOptimizationEvidence = optimizeTopologyEditRenderGroups(this.groups);
    this.engineeringRoot.updateMatrixWorld(true);
    this.invalidate('sjson-edit-draft-render-resource-optimization');
  }

  renderProjection(group, projection, colorHex, opacity, markerSize) {
    if (
      group === this.groups.supportGroup
      && projection?.renderStyle === TOPOLOGY_EDIT_SUPPORT_RENDER_STYLES.TOPO_VALIDATOR_COMPACT
    ) {
      return this.renderCompactSupportProjection(group, projection, opacity);
    }
    if (
      (group === this.groups.sourceGroup || group === this.groups.draftGroup)
      && projection?.renderStyle === TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_STYLE
    ) {
      return this.renderCompactRouteProjection(group, projection, opacity, markerSize);
    }
    return super.renderProjection(group, projection, colorHex, opacity, markerSize);
  }

  renderCompactRouteProjection(group, projection, opacity, markerSize) {
    const staging = new THREE.Group();
    const materials = new Map();
    try {
      for (const segment of projection.compactSegments || []) {
        const material = cachedMaterial(materials, segment.colorInt, opacity);
        const object = compactSegmentObject(segment, material, this.navigationConfiguration.meshRadialSegments);
        if (object) staging.add(object);
      }
    } catch (error) {
      disposeStaging(staging, materials.values());
      throw error;
    }
    const bounds = new THREE.Box3().setFromObject(staging);
    while (staging.children.length) group.add(staging.children[0]);
    const governedPickMarkerSize = Math.min(
      markerSize,
      Math.max(Number(this.navigationConfiguration?.pickingRadius) || 10, 5),
    );
    this.buildNodePickProxyGroup(group, projection.compactElements || [], governedPickMarkerSize);
    this.applySectionPlanesToGroup(group);

    if (group === this.groups.draftGroup && this.hostElement) {
      const segments = projection.compactSegments || [];
      this.hostElement.dataset.topologyEditRouteRenderStyle = projection.renderStyle || '';
      this.hostElement.dataset.topologyEditRouteRenderAuthority = projection.renderAuthority || '';
      this.hostElement.dataset.topologyEditCompactRouteSegmentCount = String(segments.length);
      this.hostElement.dataset.topologyEditCompactRouteElbowCount = String(
        segments.filter((segment) => segment.curveKind === 'CUBIC_BEZIER').length,
      );
      this.hostElement.dataset.topologyEditRichTypedPrimitiveRenderCount = '0';
    }
    return bounds;
  }

  renderCompactSupportProjection(group, projection, opacity) {
    const markerRadiusMm = governedPositive(
      projection.compactMarkerRadiusMm,
      'TOPOLOGY_EDIT_COMPACT_SUPPORT_MARKER_POLICY_MISSING',
    );
    const markerOpacity = Math.min(opacity, TOPO_VALIDATOR_COMPACT_SUPPORT_MARKER_OPACITY);
    const restraintOpacity = Math.min(opacity, TOPO_VALIDATOR_COMPACT_RESTRAINT_OPACITY);
    const staging = new THREE.Group();
    const materials = new Map();
    let markerCount = 0;
    let arrowCount = 0;
    try {
      for (const element of projection.elements || []) {
        if (!finiteElement(element)) continue;
        const material = cachedMaterial(materials, 0x22d3ee, markerOpacity);
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(
            markerRadiusMm,
            Math.max(8, this.navigationConfiguration.meshRadialSegments),
            Math.max(6, Math.floor(this.navigationConfiguration.meshRadialSegments * 0.75)),
          ),
          material,
        );
        marker.name = `topology-edit-compact-support-marker:${element.id || element.entityId || ''}`;
        marker.position.set(element.x, element.y, element.z);
        marker.userData = pickUserData(element);
        staging.add(marker);
        markerCount += 1;
      }
      for (const segment of projection.segments || []) {
        const arrow = compactSupportArrow(
          segment,
          cachedMaterial(materials, segment.colorInt, restraintOpacity),
          markerRadiusMm,
          this.navigationConfiguration.meshRadialSegments,
        );
        if (!arrow) continue;
        staging.add(arrow);
        arrowCount += 1;
      }
    } catch (error) {
      disposeStaging(staging, materials.values());
      throw error;
    }
    const bounds = new THREE.Box3().setFromObject(staging);
    while (staging.children.length) group.add(staging.children[0]);
    this.applySectionPlanesToGroup(group);
    if (this.hostElement) {
      this.hostElement.dataset.topologyEditRenderedSupportMarkerCount = String(markerCount);
      this.hostElement.dataset.topologyEditRenderedRestraintArrowCount = String(arrowCount);
      this.hostElement.dataset.topologyEditRenderedSupportMarkerRadiusMm = String(markerRadiusMm);
      this.hostElement.dataset.topologyEditRenderedSupportMarkerOpacity = String(markerOpacity);
      this.hostElement.dataset.topologyEditRenderedRestraintOpacity = String(restraintOpacity);
    }
    return bounds;
  }
}

export const TopologyEditSjsonEditDraftViewportBackend =
  TopologyEditSjsonEditDraftNavigationHudViewportBackend;

function compactSegmentObject(segment, material, radialSegments) {
  const start = finiteVector(segment.start);
  const end = finiteVector(segment.end);
  const radiusMm = governedPositive(segment.radiusMm, 'TOPOLOGY_EDIT_COMPACT_ROUTE_RADIUS_INVALID');
  if (!start || !end || start.distanceTo(end) <= MIN_LENGTH_MM) return null;

  let geometry;
  let position = null;
  let quaternion = null;
  if (segment.curveKind === 'CUBIC_BEZIER') {
    const controlPoint1 = finiteVector(segment.controlPoint1);
    const controlPoint2 = finiteVector(segment.controlPoint2);
    if (!controlPoint1 || !controlPoint2) {
      throw new Error('TOPOLOGY_EDIT_EDIT_DRAFT_ELBOW_CONTROL_POINTS_MISSING');
    }
    const curve = new THREE.CubicBezierCurve3(start, controlPoint1, controlPoint2, end);
    geometry = new THREE.TubeGeometry(
      curve,
      Math.max(8, Math.floor(Number(segment.curveSegments) || 12)),
      radiusMm,
      Math.max(8, radialSegments),
      false,
    );
  } else {
    const direction = end.clone().sub(start);
    const lengthMm = direction.length();
    const endRadiusMm = positive(segment.endRadiusMm) || radiusMm;
    geometry = new THREE.CylinderGeometry(
      endRadiusMm,
      radiusMm,
      lengthMm,
      Math.max(8, radialSegments),
    );
    position = start.clone().add(end).multiplyScalar(0.5);
    quaternion = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, direction.normalize());
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `topology-edit-edit-draft-segment:${segment.id || ''}`;
  if (position) mesh.position.copy(position);
  if (quaternion) mesh.quaternion.copy(quaternion);
  mesh.userData = pickUserData(segment);
  return mesh;
}

function compactSupportArrow(segment, material, markerRadiusMm, radialSegments) {
  const start = finiteVector(segment.start);
  const end = finiteVector(segment.end);
  if (!start || !end) return null;
  const direction = end.clone().sub(start);
  const totalLengthMm = direction.length();
  if (totalLengthMm <= MIN_LENGTH_MM) return null;
  direction.normalize();

  const shaftRadiusMm = Math.max(
    1.5,
    Math.min(positive(segment.radiusMm) || markerRadiusMm * 0.25, markerRadiusMm * 0.28),
  );
  const headLengthMm = Math.min(totalLengthMm * 0.35, markerRadiusMm * 1.4);
  const headRadiusMm = Math.max(shaftRadiusMm * 1.9, markerRadiusMm * 0.52);
  const shaftEnd = end.clone().addScaledVector(direction, -headLengthMm);
  const group = new THREE.Group();
  group.name = `topology-edit-compact-restraint-arrow:${segment.id || ''}`;
  group.userData = pickUserData(segment);

  if (start.distanceTo(shaftEnd) > MIN_LENGTH_MM) {
    const shaft = cylinderBetween(start, shaftEnd, shaftRadiusMm, material, radialSegments);
    shaft.userData = pickUserData(segment);
    group.add(shaft);
  }
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(headRadiusMm, headLengthMm, Math.max(8, radialSegments)),
    material,
  );
  head.position.copy(end).addScaledVector(direction, -headLengthMm / 2);
  head.quaternion.setFromUnitVectors(Y_AXIS, direction);
  head.userData = pickUserData(segment);
  group.add(head);
  return group;
}

function cylinderBetween(start, end, radiusMm, material, radialSegments) {
  const direction = end.clone().sub(start);
  const lengthMm = direction.length();
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusMm, radiusMm, lengthMm, Math.max(8, radialSegments)),
    material,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
  return mesh;
}

function cachedMaterial(cache, colorValue, opacity) {
  const color = Number.isInteger(colorValue) ? colorValue : 0x64748b;
  const key = `${color}:${opacity}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshStandardMaterial({
      color,
      roughness: 0.45,
      metalness: 0.08,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1,
    }));
  }
  return cache.get(key);
}

function pickUserData(value) {
  const objectId = value.entityId || value.canonicalEntityId || value.id;
  return {
    canonicalId: objectId,
    type: value.type || value.kind,
    pickTarget: value.pickTarget || {
      objectKind: value.type === 'node' ? 'node' : 'component',
      objectId,
      nodeId: value.type === 'node' ? objectId : '',
    },
  };
}

function finiteElement(value) {
  return value && [value.x, value.y, value.z].every((row) => Number.isFinite(Number(row)));
}

function finiteVector(value) {
  return value && [value.x, value.y, value.z].every((row) => Number.isFinite(Number(row)))
    ? new THREE.Vector3(Number(value.x), Number(value.y), Number(value.z))
    : null;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function governedPositive(value, code) {
  const result = positive(value);
  if (result === null) throw new Error(`${code}: A positive finite value is required.`);
  return result;
}

function disposeStaging(root, materialRows = []) {
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
