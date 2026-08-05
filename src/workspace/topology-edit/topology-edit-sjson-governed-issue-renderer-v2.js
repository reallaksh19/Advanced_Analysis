import * as THREE from 'three';
import {
  TOPOLOGY_EDIT_ISSUE_OVERLAY_SCHEMA,
} from './topology-edit-issue-overlay.js';
import {
  issueMarkerPickTarget,
  issueSeverityStyle,
} from './topology-edit-issue-renderer.js';
import {
  OVERLAY_RENDER_ORDER,
  disposeStaging,
  lineMaterial,
  nodeVisualRadius,
} from './topology-edit-sjson-governed-render-common-v2.js';

const ISSUE_WIREFRAME_OPACITY = 0.5;

/** SJSON-specific transient checker HUD. Canonical issue data remains unchanged. */
export function renderGovernedSjsonIssues({ backend, overlay }) {
  backend.issueRenderer?.clear();
  if (!overlay) return 0;
  if (overlay.schema !== TOPOLOGY_EDIT_ISSUE_OVERLAY_SCHEMA) {
    throw new TypeError(`Issue renderer requires ${TOPOLOGY_EDIT_ISSUE_OVERLAY_SCHEMA}.`);
  }
  const staging = new THREE.Group();
  const materials = new Map();
  const radiusMm = nodeVisualRadius(backend.navigationConfiguration);
  const solid = new THREE.OctahedronGeometry(radiusMm, 0);
  const geometry = new THREE.EdgesGeometry(solid);
  solid.dispose();
  try {
    for (const entry of overlay.entries || []) {
      if (!finitePosition(entry?.position) || !entry?.issueId) continue;
      const style = issueSeverityStyle(entry.severity);
      const marker = new THREE.LineSegments(
        geometry,
        lineMaterial(materials, style.color, ISSUE_WIREFRAME_OPACITY, false),
      );
      marker.name = `topology-edit-sjson-issue-marker:${entry.issueId}`;
      marker.position.set(entry.position.x, entry.position.y, entry.position.z);
      marker.scale.setScalar(style.scale);
      marker.renderOrder = OVERLAY_RENDER_ORDER + 20;
      marker.userData = {
        canonicalId: entry.issueId,
        issueId: entry.issueId,
        relatedCanonicalIds: [...(entry.canonicalIds || [])],
        pickTarget: issueMarkerPickTarget(entry),
        transientHud: true,
        renderAuthority: 'SJSON_COMPACT_WIREFRAME_ISSUE_OVERLAY_V2',
        visualRadiusMm: radiusMm,
      };
      staging.add(marker);
    }
    while (staging.children.length) backend.groups.issueGroup.add(staging.children[0]);
    backend.groups.issueGroup.userData.issueOverlayHash = overlay.overlayHash || null;
    backend.groups.issueGroup.userData.issueCount = backend.groups.issueGroup.children.length;
    publishEvidence(backend.hostElement, backend.groups.issueGroup.children.length, radiusMm);
    return backend.groups.issueGroup.children.length;
  } catch (error) {
    disposeStaging(staging, [...materials.values()]);
    geometry.dispose();
    throw error;
  }
}

function finitePosition(value) {
  return value && [value.x, value.y, value.z].every((row) => Number.isFinite(Number(row)));
}

function publishEvidence(host, count, radiusMm) {
  if (!host) return;
  host.dataset.topologyEditSjsonIssueRenderAuthority =
    'SJSON_COMPACT_WIREFRAME_ISSUE_OVERLAY_V2';
  host.dataset.topologyEditSjsonVisibleIssueMarkerCount = String(count);
  host.dataset.topologyEditSjsonIssueMarkerRadiusMm = String(radiusMm);
  host.dataset.topologyEditSjsonIssueMarkerOpacity = String(ISSUE_WIREFRAME_OPACITY);
  host.dataset.topologyEditSjsonIssueMarkerGeometry = 'OCTAHEDRON_WIREFRAME';
}
