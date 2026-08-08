import * as THREE from 'three';
import {
  MIN_LENGTH_MM,
  OVERLAY_RENDER_ORDER,
  Y_AXIS,
  cylinderBetween,
  disposeStaging,
  expandPointRadius,
  finiteVector,
  governedPositive,
  invisiblePickMaterial,
  lineMaterial,
  nodePickRadius,
  pickUserData,
} from './topology-edit-sjson-governed-render-common-v2.js';

const SUPPORT_MARKER_OPACITY = 0.15;
const RESTRAINT_OPACITY = 0.5;

export function renderGovernedSjsonSupports({ backend, group, projection }) {
  const baseMarkerRadiusMm = governedPositive(
    projection.compactMarkerRadiusMm,
    'TOPOLOGY_EDIT_COMPACT_SUPPORT_MARKER_POLICY_MISSING',
  );
  const displayScale = displayScaleValue(projection.compactMarkerDisplayScale);
  const markerRadiusMm = baseMarkerRadiusMm * displayScale;
  const staging = new THREE.Group();
  const bounds = new THREE.Box3();
  const lineMaterials = new Map();
  const pickMaterial = invisiblePickMaterial();
  let markerCount = 0;
  let restraintGlyphCount = 0;
  let directionalArrowCount = 0;
  let bidirectionalRestraintCount = 0;
  try {
    for (const element of projection.elements || []) {
      const point = finiteVector(element);
      if (!point) continue;
      const marker = supportMarker(
        point,
        markerRadiusMm,
        element.supportFamily,
        lineMaterial(
          lineMaterials,
          element.colorInt ?? 0x22d3ee,
          SUPPORT_MARKER_OPACITY,
          false,
        ),
      );
      marker.name = `topology-edit-compact-support-marker:${element.id || element.entityId || ''}`;
      marker.userData = {
        nonPickable: true,
        overlay: true,
        baseMarkerRadiusMm,
        markerRadiusMm,
        displayScale,
        supportFamily: element.supportFamily || 'REST',
      };
      marker.renderOrder = OVERLAY_RENDER_ORDER;
      staging.add(marker);

      const proxy = new THREE.Mesh(
        new THREE.SphereGeometry(
          Math.max(markerRadiusMm, nodePickRadius(backend.navigationConfiguration)),
          Math.max(8, backend.navigationConfiguration.meshRadialSegments),
          Math.max(6, Math.floor(backend.navigationConfiguration.meshRadialSegments * 0.75)),
        ),
        pickMaterial,
      );
      proxy.name = `topology-edit-compact-support-pick-proxy:${element.id || element.entityId || ''}`;
      proxy.position.copy(point);
      proxy.userData = {
        ...pickUserData(element),
        pickProxy: true,
        baseMarkerRadiusMm,
        markerRadiusMm,
        displayScale,
        renderAuthority: 'GOVERNED_SUPPORT_PICK_PROXY_V3',
      };
      proxy.renderOrder = OVERLAY_RENDER_ORDER + 1;
      staging.add(proxy);
      expandPointRadius(bounds, point, markerRadiusMm);
      markerCount += 1;
    }

    for (const segment of projection.segments || []) {
      const arrow = supportArrowGroup(
        segment,
        lineMaterial(lineMaterials, segment.colorInt, RESTRAINT_OPACITY, false),
        pickMaterial,
        markerRadiusMm,
        backend.navigationConfiguration.meshRadialSegments,
      );
      if (!arrow) continue;
      staging.add(arrow.object);
      bounds.union(arrow.bounds);
      restraintGlyphCount += 1;
      directionalArrowCount += arrow.directionalArrowCount;
      if (arrow.directionalArrowCount > 1) bidirectionalRestraintCount += 1;
    }
    while (staging.children.length) group.add(staging.children[0]);
    backend.applySectionPlanesToGroup(group);
    publishSupportEvidence(backend.hostElement, {
      markerCount,
      restraintGlyphCount,
      directionalArrowCount,
      bidirectionalRestraintCount,
      baseMarkerRadiusMm,
      markerRadiusMm,
      displayScale,
      placementAuthority: projection.glyphMetrics?.placementAuthority || '',
    });
    return bounds;
  } catch (error) {
    disposeStaging(staging, [
      ...lineMaterials.values(),
      pickMaterial,
    ]);
    throw error;
  }
}

/** Uses compact drafting symbols so support families remain distinguishable at model scale. */
function supportMarker(point, radiusMm, family, material) {
  const type = String(family || '').toUpperCase();
  if (type === 'ANCHOR') return supportAnchor(point, radiusMm, material);
  if (['GUIDE', 'HOLDOWN', 'U_BOLT'].includes(type)) {
    return supportGuide(point, radiusMm, material);
  }
  if (['LINE_STOP', 'LIMIT'].includes(type)) return supportLineStop(point, radiusMm, material);
  if (['SPRING_HANGER', 'SPRING_WARNING', 'CAN'].includes(type)) {
    return supportSpring(point, radiusMm, material);
  }
  return supportCross(point, radiusMm, material);
}

function supportCross(point, radiusMm, material) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(point.x - radiusMm, point.y, point.z),
    new THREE.Vector3(point.x + radiusMm, point.y, point.z),
    new THREE.Vector3(point.x, point.y - radiusMm, point.z),
    new THREE.Vector3(point.x, point.y + radiusMm, point.z),
    new THREE.Vector3(point.x, point.y, point.z - radiusMm),
    new THREE.Vector3(point.x, point.y, point.z + radiusMm),
  ]);
  return new THREE.LineSegments(geometry, material);
}

function supportAnchor(point, radiusMm, material) {
  const solid = new THREE.BoxGeometry(radiusMm * 1.55, radiusMm * 1.55, radiusMm * 1.55);
  const marker = new THREE.LineSegments(new THREE.EdgesGeometry(solid), material);
  solid.dispose();
  marker.position.copy(point);
  return marker;
}

function supportGuide(point, radiusMm, material) {
  const half = radiusMm * 0.9;
  const gap = radiusMm * 0.38;
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(point.x - half, point.y - half, point.z - gap),
    new THREE.Vector3(point.x + half, point.y - half, point.z - gap),
    new THREE.Vector3(point.x + half, point.y + half, point.z - gap),
    new THREE.Vector3(point.x - half, point.y + half, point.z - gap),
    new THREE.Vector3(point.x - half, point.y - half, point.z + gap),
    new THREE.Vector3(point.x + half, point.y - half, point.z + gap),
    new THREE.Vector3(point.x + half, point.y + half, point.z + gap),
    new THREE.Vector3(point.x - half, point.y + half, point.z + gap),
  ]);
  return new THREE.LineLoop(geometry, material);
}

function supportLineStop(point, radiusMm, material) {
  const half = radiusMm;
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(point.x - half, point.y, point.z),
    new THREE.Vector3(point.x + half, point.y, point.z),
    new THREE.Vector3(point.x, point.y - half, point.z - half),
    new THREE.Vector3(point.x, point.y + half, point.z - half),
    new THREE.Vector3(point.x, point.y - half, point.z + half),
    new THREE.Vector3(point.x, point.y + half, point.z + half),
  ]);
  return new THREE.LineSegments(geometry, material);
}

function supportSpring(point, radiusMm, material) {
  const turns = 4;
  const divisions = 32;
  const points = Array.from({ length: divisions + 1 }, (_, index) => {
    const progress = index / divisions;
    const angle = progress * turns * Math.PI * 2;
    return new THREE.Vector3(
      point.x + Math.cos(angle) * radiusMm * 0.52,
      point.y + (progress - 0.5) * radiusMm * 2,
      point.z + Math.sin(angle) * radiusMm * 0.52,
    );
  });
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
}

function supportArrowGroup(segment, lineRow, pickMaterial, markerRadiusMm, radialSegments) {
  const rows = Array.isArray(segment.directionalArrows) && segment.directionalArrows.length
    ? segment.directionalArrows
    : [{ start: segment.start, end: segment.end, polarity: 'POSITIVE' }];
  const group = new THREE.Group();
  group.name = `topology-edit-compact-restraint-arrow:${segment.id || ''}`;
  group.userData = {
    overlay: true,
    placementAuthority: segment.placementAuthority || '',
    directionalArrowCount: rows.length,
  };
  group.renderOrder = OVERLAY_RENDER_ORDER + 2;
  const bounds = new THREE.Box3();
  let rendered = 0;
  rows.forEach((row, index) => {
    const arrow = supportArrow(
      segment,
      row,
      index,
      lineRow,
      pickMaterial,
      markerRadiusMm,
      radialSegments,
    );
    if (!arrow) return;
    group.add(arrow.object);
    bounds.union(arrow.bounds);
    rendered += 1;
  });
  return rendered ? { object: group, bounds, directionalArrowCount: rendered } : null;
}

function supportArrow(segment, row, index, lineRow, pickMaterial, markerRadiusMm, radialSegments) {
  const start = finiteVector(row.start);
  const end = finiteVector(row.end);
  if (!start || !end) return null;
  const direction = end.clone().sub(start);
  const totalLengthMm = direction.length();
  if (totalLengthMm <= MIN_LENGTH_MM) return null;
  direction.normalize();
  const headLengthMm = Math.min(totalLengthMm * 0.32, markerRadiusMm * 1.25);
  const headRadiusMm = Math.max(2.5, markerRadiusMm * 0.42);
  const shaftEnd = end.clone().addScaledVector(direction, -headLengthMm);
  const object = new THREE.Group();
  const suffix = index === 0 ? '' : `:${String(row.polarity || index).toLowerCase()}`;

  if (start.distanceTo(shaftEnd) > MIN_LENGTH_MM) {
    const shaft = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([start, shaftEnd]),
      lineRow,
    );
    shaft.name = `topology-edit-compact-restraint-shaft:${segment.id || ''}${suffix}`;
    shaft.userData = { nonPickable: true, overlay: true, polarity: row.polarity || '' };
    shaft.renderOrder = OVERLAY_RENDER_ORDER + 2;
    object.add(shaft);
  }
  const cone = new THREE.ConeGeometry(headRadiusMm, headLengthMm, 4);
  const headGeometry = new THREE.EdgesGeometry(cone, 1);
  cone.dispose();
  const head = new THREE.LineSegments(headGeometry, lineRow);
  head.name = `topology-edit-compact-restraint-head:${segment.id || ''}${suffix}`;
  head.position.copy(end).addScaledVector(direction, -headLengthMm / 2);
  head.quaternion.setFromUnitVectors(Y_AXIS, direction);
  head.userData = { nonPickable: true, overlay: true, polarity: row.polarity || '' };
  head.renderOrder = OVERLAY_RENDER_ORDER + 3;
  object.add(head);

  const proxy = cylinderBetween(
    start,
    end,
    Math.max(6, markerRadiusMm * 0.6),
    pickMaterial,
    radialSegments,
  );
  if (proxy) {
    proxy.name = `topology-edit-compact-restraint-pick-proxy:${segment.id || ''}${suffix}`;
    proxy.userData = {
      ...pickUserData(segment),
      pickProxy: true,
      polarity: row.polarity || '',
      renderAuthority: 'GOVERNED_RESTRAINT_PICK_PROXY_V3',
    };
    proxy.renderOrder = OVERLAY_RENDER_ORDER + 4;
    object.add(proxy);
  }
  const bounds = new THREE.Box3().setFromPoints([start, end]);
  bounds.expandByScalar(headRadiusMm);
  return { object, bounds };
}

function displayScaleValue(value) {
  if (value === undefined || value === null || value === '') return 1;
  return governedPositive(value, 'TOPOLOGY_EDIT_COMPACT_SUPPORT_DISPLAY_SCALE_INVALID');
}

function publishSupportEvidence(host, metrics) {
  if (!host) return;
  host.dataset.topologyEditRenderedSupportMarkerCount = String(metrics.markerCount);
  host.dataset.topologyEditRenderedRestraintArrowCount = String(metrics.restraintGlyphCount);
  host.dataset.topologyEditRenderedDirectionalArrowCount = String(metrics.directionalArrowCount);
  host.dataset.topologyEditRenderedBidirectionalRestraintCount = String(
    metrics.bidirectionalRestraintCount,
  );
  host.dataset.topologyEditSupportArrowPlacementAuthority = metrics.placementAuthority;
  host.dataset.topologyEditRenderedSupportBaseMarkerRadiusMm = String(metrics.baseMarkerRadiusMm);
  host.dataset.topologyEditRenderedSupportMarkerRadiusMm = String(metrics.markerRadiusMm);
  host.dataset.topologyEditSupportDisplayScale = String(metrics.displayScale);
  host.dataset.topologyEditRenderedSupportMarkerOpacity = String(SUPPORT_MARKER_OPACITY);
  host.dataset.topologyEditRenderedRestraintOpacity = String(RESTRAINT_OPACITY);
  host.dataset.topologyEditSupportOverlayDepthIndependent = 'true';
  host.dataset.topologyEditVisibleSupportOverlayCount = String(
    metrics.markerCount + metrics.directionalArrowCount,
  );
}
