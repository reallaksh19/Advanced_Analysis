import * as THREE from 'three';
import {
  MIN_LENGTH_MM,
  OVERLAY_RENDER_ORDER,
  Y_AXIS,
  disposeStaging,
  expandPointRadius,
  finiteVector,
  invisiblePickMaterial,
  lineMaterial,
  meshMaterial,
  nodePickRadius,
  nodeVisualRadius,
  pickUserData,
  routePickRadius,
} from './topology-edit-sjson-governed-render-common-v2.js';
import {
  TOPOLOGY_EDIT_SJSON_GOVERNED_RENDER_AUTHORITY,
} from './topology-edit-sjson-governed-projection-v2.js';

const NODE_VISUAL_OPACITY = 0.18;
const ROUTE_SOLID_RENDER_AUTHORITY = 'GOVERNED_OD_SOLID_ROUTE_MESH_V5';
const ROUTE_SOLID_PICK_AUTHORITY = 'GOVERNED_DRAFT_OD_SOLID_PICK_TARGET_V5';
const ROUTE_RADIUS_AUTHORITY = 'CANONICAL_PROJECTED_RADIUS_WITH_BOUNDED_DISPLAY_ENVELOPE_V2';
const ROUTE_DISPLAY_MIN_DIAGONAL_FRACTION = 0.0025;
const ROUTE_DISPLAY_MAX_PHYSICAL_MULTIPLIER = 12;

export function renderGovernedSjsonRoute({
  backend,
  group,
  projection,
  fallbackColor,
  opacity,
}) {
  const staging = new THREE.Group();
  const bounds = new THREE.Box3();
  const lineMaterials = new Map();
  const meshMaterials = new Map();
  const routeMaterials = new Map();
  const pickMaterial = invisiblePickMaterial();
  const isDraft = group === backend.groups.draftGroup;
  let lineCount = 0;
  let solidMeshCount = 0;
  let directPickMeshCount = 0;
  let pickProxyCount = 0;
  let displayEnvelopeCount = 0;
  try {
    const displayDiagonalMm = projectionDiagonal(projection);
    for (const segment of projection.compactSegments || []) {
      const points = routePoints(segment);
      if (points.length < 2) continue;
      const color = Number.isInteger(segment.colorInt) ? segment.colorInt : fallbackColor;
      const physicalRadiusMm = routeVisualRadius(segment);
      const physicalEndRadiusMm = routeEndRadius(segment);
      const displayRadiusMm = governedRouteDisplayRadius(displayDiagonalMm, physicalRadiusMm);
      const displayEndRadiusMm = physicalEndRadiusMm === null
        ? null
        : governedRouteDisplayRadius(displayDiagonalMm, physicalEndRadiusMm);
      const solid = displayRadiusMm === null
        ? null
        : routeSolidMesh(
          segment,
          points,
          routeMeshMaterial(routeMaterials, color, opacity, isDraft),
          displayRadiusMm,
          displayEndRadiusMm,
          backend.navigationConfiguration.meshRadialSegments,
        );
      if (solid) {
        const displayEnvelopeApplied = displayRadiusMm > physicalRadiusMm + 1e-9
          || (physicalEndRadiusMm !== null && displayEndRadiusMm > physicalEndRadiusMm + 1e-9);
        solid.name = `topology-edit-visible-route-solid:${segment.id || ''}`;
        solid.userData = isDraft
          ? {
            ...pickUserData(segment),
            directPickMesh: true,
            visualRouteSolid: true,
            routePhysicalRadiusMm: physicalRadiusMm,
            routePhysicalEndRadiusMm: physicalEndRadiusMm,
            routeDisplayRadiusMm: displayRadiusMm,
            routeDisplayEndRadiusMm: displayEndRadiusMm,
            displayEnvelopeApplied,
            radiusAuthority: ROUTE_RADIUS_AUTHORITY,
            renderAuthority: ROUTE_SOLID_PICK_AUTHORITY,
          }
          : {
            nonPickable: true,
            visualRouteSolid: true,
            routePhysicalRadiusMm: physicalRadiusMm,
            routePhysicalEndRadiusMm: physicalEndRadiusMm,
            routeDisplayRadiusMm: displayRadiusMm,
            routeDisplayEndRadiusMm: displayEndRadiusMm,
            displayEnvelopeApplied,
            radiusAuthority: ROUTE_RADIUS_AUTHORITY,
            renderAuthority: ROUTE_SOLID_RENDER_AUTHORITY,
          };
        staging.add(solid);
        solidMeshCount += 1;
        if (isDraft) directPickMeshCount += 1;
        if (displayEnvelopeApplied) displayEnvelopeCount += 1;
        expandRouteBounds(bounds, points, Math.max(displayRadiusMm, displayEndRadiusMm || 0));
      } else {
        points.forEach((point) => bounds.expandByPoint(point));
      }

      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        lineMaterial(
          lineMaterials,
          color,
          centerlineOpacity(segment, opacity, Boolean(solid)),
          false,
        ),
      );
      line.name = `topology-edit-edit-draft-centerline:${segment.id || ''}`;
      line.renderOrder = OVERLAY_RENDER_ORDER - 4;
      line.userData = isDraft
        ? {
          ...pickUserData(segment),
          renderAuthority: 'GOVERNED_DRAFT_CENTERLINE_PICK_TARGET_V4',
        }
        : {
          nonPickable: true,
          renderAuthority: TOPOLOGY_EDIT_SJSON_GOVERNED_RENDER_AUTHORITY,
        };
      staging.add(line);
      lineCount += 1;

      if (isDraft) {
        const proxy = routePickProxy(
          segment,
          points,
          pickMaterial,
          governedRoutePickRadius(
            backend.navigationConfiguration,
            displayRadiusMm,
            displayEndRadiusMm,
          ),
          backend.navigationConfiguration.meshRadialSegments,
        );
        if (proxy) {
          staging.add(proxy);
          pickProxyCount += 1;
        }
      }
    }

    let nodeMetrics = emptyNodeMetrics(backend);
    if (isDraft) {
      nodeMetrics = addGovernedNodes(
        staging,
        bounds,
        projection.compactElements || [],
        backend,
        meshMaterials,
      );
    }
    while (staging.children.length) group.add(staging.children[0]);
    backend.applySectionPlanesToGroup(group);
    publishRouteEvidence(backend.hostElement, projection, {
      lineCount,
      solidMeshCount,
      directPickMeshCount,
      pickProxyCount,
      displayEnvelopeCount,
      ...nodeMetrics,
    }, isDraft);
    return bounds;
  } catch (error) {
    disposeStaging(staging, [
      ...lineMaterials.values(),
      ...meshMaterials.values(),
      ...routeMaterials.values(),
      pickMaterial,
    ]);
    throw error;
  }
}

function addGovernedNodes(staging, bounds, elements, backend, meshMaterials) {
  const nodes = (elements || []).filter((element) => finiteVector(element));
  const configuration = backend.navigationConfiguration;
  const visualRadiusMm = governedNodeVisualRadius(backend);
  const pickRadiusMm = nodePickRadius(configuration);
  if (!nodes.length) return emptyNodeMetrics(backend);
  const radialSegments = Math.max(12, configuration.meshRadialSegments);
  const heightSegments = Math.max(8, Math.floor(radialSegments * 0.75));
  const visualGeometry = new THREE.SphereGeometry(
    visualRadiusMm,
    radialSegments,
    heightSegments,
  );
  const pickGeometry = new THREE.SphereGeometry(pickRadiusMm, radialSegments, heightSegments);
  const visualMaterial = meshMaterial(
    meshMaterials,
    0x93c5fd,
    NODE_VISUAL_OPACITY,
    false,
  );
  const pickMaterial = invisiblePickMaterial();
  for (const node of nodes) {
    const point = finiteVector(node);
    const marker = new THREE.Mesh(visualGeometry, visualMaterial);
    marker.name = `topology-edit-visible-node-marker:${node.id || node.entityId || ''}`;
    marker.position.copy(point);
    marker.userData = {
      nonPickable: true,
      visualNodeMarker: true,
      visualRadiusMm,
      renderAuthority: 'CANONICAL_NODE_TRANSLUCENT_SPHERE_V3',
    };
    marker.renderOrder = OVERLAY_RENDER_ORDER - 2;
    staging.add(marker);

    const proxy = new THREE.Mesh(pickGeometry, pickMaterial);
    proxy.name = `topology-edit-node-pick-proxy:${node.id || node.entityId || ''}`;
    proxy.position.copy(point);
    proxy.userData = {
      ...pickUserData(node),
      pickProxy: true,
      renderAuthority: 'CANONICAL_NODE_PICK_PROXY_V3',
    };
    proxy.renderOrder = OVERLAY_RENDER_ORDER - 1;
    staging.add(proxy);
    expandPointRadius(bounds, point, visualRadiusMm);
  }
  return {
    nodeCount: nodes.length,
    nodeVisualRadiusMm: visualRadiusMm,
    nodePickRadiusMm: pickRadiusMm,
    nodeOpacity: NODE_VISUAL_OPACITY,
  };
}

function governedNodeVisualRadius(backend) {
  const explicit = Number(backend?.governedNodeMarkerRadiusMm);
  return Number.isFinite(explicit) && explicit > 0
    ? explicit
    : nodeVisualRadius(backend?.navigationConfiguration);
}

function emptyNodeMetrics(backend) {
  return {
    nodeCount: 0,
    nodeVisualRadiusMm: governedNodeVisualRadius(backend),
    nodePickRadiusMm: nodePickRadius(backend?.navigationConfiguration),
    nodeOpacity: NODE_VISUAL_OPACITY,
  };
}

function routePoints(segment) {
  const start = finiteVector(segment.start);
  const end = finiteVector(segment.end);
  if (!start || !end || start.distanceTo(end) <= MIN_LENGTH_MM) return [];
  if (segment.curveKind !== 'CUBIC_BEZIER') return [start, end];
  const controlPoint1 = finiteVector(segment.controlPoint1);
  const controlPoint2 = finiteVector(segment.controlPoint2);
  if (!controlPoint1 || !controlPoint2) {
    throw new Error('TOPOLOGY_EDIT_EDIT_DRAFT_ELBOW_CONTROL_POINTS_MISSING');
  }
  return new THREE.CubicBezierCurve3(start, controlPoint1, controlPoint2, end)
    .getPoints(Math.max(8, Math.floor(Number(segment.curveSegments) || 12)));
}

function projectionDiagonal(projection) {
  const bounds = new THREE.Box3();
  for (const segment of projection?.compactSegments || []) {
    routePoints(segment).forEach((point) => bounds.expandByPoint(point));
  }
  for (const element of projection?.compactElements || []) {
    const point = finiteVector(element);
    if (point) bounds.expandByPoint(point);
  }
  if (bounds.isEmpty()) return null;
  const diagonal = bounds.getSize(new THREE.Vector3()).length();
  return Number.isFinite(diagonal) && diagonal > 0 ? diagonal : null;
}

function routeSolidMesh(segment, points, material, radiusMm, endRadiusMm, radialSegments) {
  let geometry;
  let position = null;
  let quaternion = null;
  const governedRadialSegments = Math.max(12, radialSegments);
  if (segment.curveKind === 'CUBIC_BEZIER') {
    geometry = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points, false, 'centripetal'),
      Math.max(12, points.length - 1),
      radiusMm,
      governedRadialSegments,
      false,
    );
  } else {
    const start = points[0];
    const end = points[points.length - 1];
    const direction = end.clone().sub(start);
    const lengthMm = direction.length();
    if (lengthMm <= MIN_LENGTH_MM) return null;
    geometry = new THREE.CylinderGeometry(
      endRadiusMm || radiusMm,
      radiusMm,
      lengthMm,
      governedRadialSegments,
    );
    position = start.clone().add(end).multiplyScalar(0.5);
    quaternion = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, direction.normalize());
  }
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.copy(position);
  if (quaternion) mesh.quaternion.copy(quaternion);
  return mesh;
}

function routePickProxy(segment, points, material, radiusMm, radialSegments) {
  let geometry;
  let position = null;
  let quaternion = null;
  if (segment.curveKind === 'CUBIC_BEZIER') {
    geometry = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points, false, 'centripetal'),
      Math.max(8, points.length - 1),
      radiusMm,
      Math.max(8, radialSegments),
      false,
    );
  } else {
    const start = points[0];
    const end = points[points.length - 1];
    const direction = end.clone().sub(start);
    const lengthMm = direction.length();
    if (lengthMm <= MIN_LENGTH_MM) return null;
    geometry = new THREE.CylinderGeometry(radiusMm, radiusMm, lengthMm, Math.max(8, radialSegments));
    position = start.clone().add(end).multiplyScalar(0.5);
    quaternion = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, direction.normalize());
  }
  const proxy = new THREE.Mesh(geometry, material);
  proxy.name = `topology-edit-route-pick-proxy:${segment.id || ''}`;
  if (position) proxy.position.copy(position);
  if (quaternion) proxy.quaternion.copy(quaternion);
  proxy.userData = {
    ...pickUserData(segment),
    pickProxy: true,
    renderAuthority: 'GOVERNED_ROUTE_PICK_PROXY_V5',
  };
  return proxy;
}

function routeMeshMaterial(cache, colorValue, opacity, isDraft) {
  const color = Number.isInteger(colorValue) ? colorValue : 0x64748b;
  const requestedOpacity = Math.min(Math.max(Number(opacity) || 0, 0.12), 1);
  const governedOpacity = isDraft
    ? Math.min(0.72, Math.max(0.52, requestedOpacity))
    : Math.min(0.18, requestedOpacity);
  const key = `${color}:${governedOpacity}:${isDraft ? 'draft' : 'source'}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: governedOpacity,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: isDraft ? -1 : 1,
      polygonOffsetUnits: isDraft ? -1 : 1,
    }));
  }
  return cache.get(key);
}

function routeVisualRadius(segment) {
  return firstPositive(
    segment?.radiusMm,
    halfPositive(segment?.sourceOutsideDiameterMm),
    halfPositive(segment?.outsideDiameterMm),
  );
}

function routeEndRadius(segment) {
  return firstPositive(
    segment?.endRadiusMm,
    halfPositive(segment?.endOutsideDiameterMm),
  );
}

function governedRouteDisplayRadius(diagonalMm, physicalRadiusMm) {
  if (!(physicalRadiusMm > 0)) return null;
  if (!(diagonalMm > 0)) return physicalRadiusMm;
  const minimumAtFitMm = diagonalMm * ROUTE_DISPLAY_MIN_DIAGONAL_FRACTION;
  const maximumEnvelopeMm = physicalRadiusMm * ROUTE_DISPLAY_MAX_PHYSICAL_MULTIPLIER;
  return Math.max(physicalRadiusMm, Math.min(minimumAtFitMm, maximumEnvelopeMm));
}

function governedRoutePickRadius(configuration, displayRadiusMm, endDisplayRadiusMm) {
  const configured = routePickRadius(configuration);
  const visible = Math.max(displayRadiusMm || 0, endDisplayRadiusMm || 0);
  return visible > 0 ? Math.max(configured, visible + Math.min(configured * 0.5, 8)) : configured;
}

function expandRouteBounds(bounds, points, radiusMm) {
  points.forEach((point) => expandPointRadius(bounds, point, radiusMm));
}

function centerlineOpacity(segment, opacity, hasSolid) {
  if (!hasSolid) return routeOpacity(segment, opacity);
  return Math.min(Math.max(Number(opacity) || 0, 0.72), 0.96);
}

function routeOpacity(segment, opacity) {
  const kind = String(segment?.kind || '');
  const fitting = !['PIPE', 'ELBOW', 'ELBOW_ENTRY', 'ELBOW_EXIT'].includes(kind);
  return Math.min(opacity, fitting ? 0.9 : 0.72);
}

function firstPositive(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function halfPositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number / 2 : null;
}

function publishRouteEvidence(host, projection, metrics, isDraft) {
  if (!host || !isDraft) return;
  const segments = projection.compactSegments || [];
  const editDraft = projection.editDraftMetrics || {};
  host.dataset.topologyEditRouteRenderStyle = projection.renderStyle || '';
  host.dataset.topologyEditRouteRenderAuthority = projection.renderAuthority || '';
  host.dataset.topologyEditGovernedRouteRenderAuthority = projection.governedRenderAuthority || '';
  host.dataset.topologyEditCompactRouteSegmentCount = String(segments.length);
  host.dataset.topologyEditCompactRouteElbowCount = String(
    segments.filter((segment) => segment.curveKind === 'CUBIC_BEZIER').length,
  );
  host.dataset.topologyEditRichTypedPrimitiveRenderCount = '0';
  host.dataset.topologyEditVisibleRouteLineCount = String(metrics.lineCount);
  host.dataset.topologyEditVisibleRouteSolidMeshCount = String(metrics.solidMeshCount);
  host.dataset.topologyEditDirectPickRouteMeshCount = String(metrics.directPickMeshCount);
  host.dataset.topologyEditRoutePickProxyCount = String(metrics.pickProxyCount);
  host.dataset.topologyEditRouteDisplayEnvelopeCount = String(metrics.displayEnvelopeCount);
  host.dataset.topologyEditRouteDisplayEnvelopePolicy = 'BOUNDED_MODEL_DIAGONAL_MINIMUM_V2';
  host.dataset.topologyEditDraftCenterlinePickable = 'true';
  host.dataset.topologyEditDraftSolidMeshPickable = String(metrics.directPickMeshCount > 0);
  host.dataset.topologyEditRouteRadiusAuthority = ROUTE_RADIUS_AUTHORITY;
  host.dataset.topologyEditVisibleNodeMarkerCount = String(metrics.nodeCount);
  host.dataset.topologyEditCompactNodePickProxyCount = String(metrics.nodeCount);
  host.dataset.topologyEditVisibleNodeMarkerRadiusMm = String(metrics.nodeVisualRadiusMm);
  host.dataset.topologyEditNodePickProxyRadiusMm = String(metrics.nodePickRadiusMm);
  host.dataset.topologyEditVisibleNodeMarkerOpacity = String(metrics.nodeOpacity);
  host.dataset.topologyEditNodeVisualAndPickGeometrySeparated = 'true';
  host.dataset.topologyEditVisibleNodeMarkerGeometry = 'TRANSLUCENT_SPHERE';
  host.dataset.topologyEditExactTeeCount = String(editDraft.exactTeeCount || 0);
  host.dataset.topologyEditExactTeeSegmentCount = String(editDraft.exactTeeSegmentCount || 0);
  host.dataset.topologyEditExactOletCount = String(editDraft.exactOletCount || 0);
  host.dataset.topologyEditExactOletSegmentCount = String(editDraft.exactOletSegmentCount || 0);
}
