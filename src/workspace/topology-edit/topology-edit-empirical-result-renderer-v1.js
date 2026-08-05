import * as THREE from 'three';
import {
  MIN_LENGTH_MM,
  OVERLAY_RENDER_ORDER,
  Y_AXIS,
  cylinderBetween,
  disposeStaging,
  expandPointRadius,
  finiteVector,
  invisiblePickMaterial,
  lineMaterial,
  pickUserData,
} from './topology-edit-sjson-governed-render-common-v2.js';
import {
  EMPIRICAL_RESULT_FORCE_ARROW_ROLE,
  EMPIRICAL_RESULT_OVERLAY_RENDER_STYLE,
} from '../engineering-loads/empirical-result-overlay.js';

const RESULT_ARROW_OPACITY = 0.92;
const ZERO_FORCE_MARKER_RADIUS_MM = 7;
const RESULT_RENDER_ORDER = OVERLAY_RENDER_ORDER + 20;

export function renderGovernedEmpiricalResults({ backend, group, projection }) {
  if (projection?.renderStyle !== EMPIRICAL_RESULT_OVERLAY_RENDER_STYLE) {
    throw new TypeError('Unsupported empirical result overlay render style.');
  }
  const staging = new THREE.Group();
  const bounds = new THREE.Box3();
  const materials = new Map();
  const pickMaterial = invisiblePickMaterial();
  let arrowCount = 0;
  let zeroForceMarkerCount = 0;
  let activeCount = 0;
  let liftedCount = 0;
  let bilateralCount = 0;
  try {
    for (const arrow of projection.arrows || []) {
      const rendered = resultArrow(
        arrow,
        lineMaterial(
          materials,
          resultColor(arrow.contactState),
          RESULT_ARROW_OPACITY,
          false,
        ),
        pickMaterial,
        backend.navigationConfiguration.meshRadialSegments,
      );
      if (!rendered) continue;
      staging.add(rendered.object);
      bounds.union(rendered.bounds);
      if (rendered.zeroForce) zeroForceMarkerCount += 1;
      else arrowCount += 1;
      if (arrow.contactState === 'ACTIVE') activeCount += 1;
      if (arrow.contactState === 'LIFTED') liftedCount += 1;
      if (arrow.contactState === 'BILATERAL') bilateralCount += 1;
    }
    while (staging.children.length) group.add(staging.children[0]);
    backend.applySectionPlanesToGroup(group);
    publishResultEvidence(backend.hostElement, projection, {
      arrowCount,
      zeroForceMarkerCount,
      activeCount,
      liftedCount,
      bilateralCount,
    });
    return bounds;
  } catch (error) {
    disposeStaging(staging, [...materials.values(), pickMaterial]);
    throw error;
  }
}

function resultArrow(arrow, material, pickMaterial, radialSegments) {
  const start = finiteVector(arrow.start);
  const end = finiteVector(arrow.end);
  if (!start || !end) return null;
  const direction = end.clone().sub(start);
  const lengthMm = direction.length();
  if (lengthMm <= MIN_LENGTH_MM) {
    return zeroForceMarker(arrow, start, material, pickMaterial, radialSegments);
  }
  direction.normalize();
  const headLengthMm = Math.max(10, Math.min(lengthMm * 0.28, 38));
  const headRadiusMm = Math.max(4, Math.min(12, headLengthMm * 0.32));
  const shaftEnd = end.clone().addScaledVector(direction, -headLengthMm);
  const object = new THREE.Group();
  object.name = `topology-edit-empirical-result-arrow:${arrow.overlayId}`;
  object.userData = resultUserData(arrow, false);
  object.renderOrder = RESULT_RENDER_ORDER;

  const shaft = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([start, shaftEnd]),
    material,
  );
  shaft.name = `topology-edit-empirical-result-shaft:${arrow.overlayId}`;
  shaft.userData = {
    nonPickable: true,
    overlay: true,
    renderRole: EMPIRICAL_RESULT_FORCE_ARROW_ROLE,
    sourceRestraintArrow: false,
  };
  shaft.renderOrder = RESULT_RENDER_ORDER;
  object.add(shaft);

  const cone = new THREE.ConeGeometry(headRadiusMm, headLengthMm, 6);
  const headGeometry = new THREE.EdgesGeometry(cone, 1);
  cone.dispose();
  const head = new THREE.LineSegments(headGeometry, material);
  head.name = `topology-edit-empirical-result-head:${arrow.overlayId}`;
  head.position.copy(end).addScaledVector(direction, -headLengthMm / 2);
  head.quaternion.setFromUnitVectors(Y_AXIS, direction);
  head.userData = {
    nonPickable: true,
    overlay: true,
    renderRole: EMPIRICAL_RESULT_FORCE_ARROW_ROLE,
    sourceRestraintArrow: false,
  };
  head.renderOrder = RESULT_RENDER_ORDER + 1;
  object.add(head);

  const proxy = cylinderBetween(
    start,
    end,
    Math.max(7, headRadiusMm * 0.75),
    pickMaterial,
    radialSegments,
  );
  if (proxy) {
    proxy.name = `topology-edit-empirical-result-pick-proxy:${arrow.overlayId}`;
    proxy.userData = {
      ...pickUserData(arrow),
      ...resultUserData(arrow, true),
      pickProxy: true,
      renderAuthority: 'EMPIRICAL_RESULT_FORCE_ARROW_PICK_PROXY_V1',
    };
    proxy.renderOrder = RESULT_RENDER_ORDER + 2;
    object.add(proxy);
  }
  const bounds = new THREE.Box3().setFromPoints([start, end]);
  bounds.expandByScalar(headRadiusMm);
  return { object, bounds, zeroForce: false };
}

function zeroForceMarker(arrow, start, material, pickMaterial, radialSegments) {
  const object = new THREE.Group();
  object.name = `topology-edit-empirical-zero-force-marker:${arrow.overlayId}`;
  object.userData = resultUserData(arrow, false);
  object.renderOrder = RESULT_RENDER_ORDER;
  const geometry = new THREE.EdgesGeometry(
    new THREE.SphereGeometry(ZERO_FORCE_MARKER_RADIUS_MM, 8, 6),
    1,
  );
  const marker = new THREE.LineSegments(geometry, material);
  marker.position.copy(start);
  marker.name = `topology-edit-empirical-zero-force-wire:${arrow.overlayId}`;
  marker.userData = {
    nonPickable: true,
    overlay: true,
    zeroForce: true,
    renderRole: EMPIRICAL_RESULT_FORCE_ARROW_ROLE,
  };
  marker.renderOrder = RESULT_RENDER_ORDER;
  object.add(marker);

  const proxy = new THREE.Mesh(
    new THREE.SphereGeometry(
      ZERO_FORCE_MARKER_RADIUS_MM * 1.3,
      Math.max(8, radialSegments),
      Math.max(6, Math.floor(radialSegments * 0.75)),
    ),
    pickMaterial,
  );
  proxy.position.copy(start);
  proxy.name = `topology-edit-empirical-zero-force-pick-proxy:${arrow.overlayId}`;
  proxy.userData = {
    ...pickUserData(arrow),
    ...resultUserData(arrow, true),
    pickProxy: true,
    zeroForce: true,
    renderAuthority: 'EMPIRICAL_RESULT_ZERO_FORCE_PICK_PROXY_V1',
  };
  proxy.renderOrder = RESULT_RENDER_ORDER + 2;
  object.add(proxy);

  const bounds = new THREE.Box3();
  expandPointRadius(bounds, start, ZERO_FORCE_MARKER_RADIUS_MM);
  return { object, bounds, zeroForce: true };
}

function resultUserData(arrow, pickable) {
  return {
    overlay: true,
    empiricalResult: true,
    nonPickable: !pickable,
    sourceRestraintArrow: false,
    separateFromSourceRestraintProjection: true,
    renderRole: EMPIRICAL_RESULT_FORCE_ARROW_ROLE,
    resultType: arrow.resultType,
    loadCaseId: arrow.loadCaseId,
    resultClass: arrow.resultClass,
    supportSiteId: arrow.supportSiteId,
    restraintId: arrow.restraintId,
    contactState: arrow.contactState,
    forceMagnitudeN: arrow.forceMagnitudeN,
    executionId: arrow.executionId || '',
  };
}

function resultColor(contactState) {
  return {
    ACTIVE: 0x22c55e,
    LIFTED: 0xf59e0b,
    BILATERAL: 0xe879f9,
  }[contactState] || 0xf8fafc;
}

function publishResultEvidence(host, projection, metrics) {
  if (!host) return;
  host.dataset.topologyEditEmpiricalResultOverlayCurrent = 'true';
  host.dataset.topologyEditEmpiricalResultOverlaySchema = projection.schema;
  host.dataset.topologyEditEmpiricalResultOverlayHash = projection.semanticHash;
  host.dataset.topologyEditEmpiricalResultExecutionId = projection.executionId;
  host.dataset.topologyEditEmpiricalResultArrowCount = String(metrics.arrowCount);
  host.dataset.topologyEditEmpiricalZeroForceMarkerCount = String(
    metrics.zeroForceMarkerCount,
  );
  host.dataset.topologyEditEmpiricalActiveResultCount = String(metrics.activeCount);
  host.dataset.topologyEditEmpiricalLiftedResultCount = String(metrics.liftedCount);
  host.dataset.topologyEditEmpiricalBilateralResultCount = String(metrics.bilateralCount);
  host.dataset.topologyEditEmpiricalResultRenderRole = EMPIRICAL_RESULT_FORCE_ARROW_ROLE;
  host.dataset.topologyEditEmpiricalResultSeparateFromSourceRestraints = 'true';
  host.dataset.topologyEditEmpiricalResultGeometryMutation = 'false';
}

export function clearGovernedEmpiricalResultEvidence(host, reasonCode = '') {
  if (!host) return;
  host.dataset.topologyEditEmpiricalResultOverlayCurrent = 'false';
  host.dataset.topologyEditEmpiricalResultOverlaySchema = '';
  host.dataset.topologyEditEmpiricalResultOverlayHash = '';
  host.dataset.topologyEditEmpiricalResultExecutionId = '';
  host.dataset.topologyEditEmpiricalResultArrowCount = '0';
  host.dataset.topologyEditEmpiricalZeroForceMarkerCount = '0';
  host.dataset.topologyEditEmpiricalActiveResultCount = '0';
  host.dataset.topologyEditEmpiricalLiftedResultCount = '0';
  host.dataset.topologyEditEmpiricalBilateralResultCount = '0';
  host.dataset.topologyEditEmpiricalResultRenderRole = EMPIRICAL_RESULT_FORCE_ARROW_ROLE;
  host.dataset.topologyEditEmpiricalResultSeparateFromSourceRestraints = 'true';
  host.dataset.topologyEditEmpiricalResultGeometryMutation = 'false';
  host.dataset.topologyEditEmpiricalResultClearReason = reasonCode;
}
