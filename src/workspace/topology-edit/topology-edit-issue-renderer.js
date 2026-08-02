import * as THREE from 'three';
import {
  TOPOLOGY_EDIT_ISSUE_OVERLAY_SCHEMA,
} from './topology-edit-issue-overlay.js';

const SEVERITY_STYLE = Object.freeze({
  HIGH: Object.freeze({ color: 0xef4444, emissive: 0x7f1d1d, scale: 1.15 }),
  MEDIUM: Object.freeze({ color: 0xf59e0b, emissive: 0x78350f, scale: 1 }),
  LOW: Object.freeze({ color: 0x38bdf8, emissive: 0x0c4a6e, scale: 0.9 }),
});

export class TopologyEditIssueRenderer {
  constructor(group) {
    if (!group?.add || !group?.traverse) {
      throw new TypeError('TopologyEditIssueRenderer requires a Three.js group.');
    }
    this.group = group;
    this.overlayHash = null;
  }

  render(overlay, modelBounds = null) {
    this.clear();
    if (!overlay) return 0;
    if (overlay.schema !== TOPOLOGY_EDIT_ISSUE_OVERLAY_SCHEMA) {
      throw new TypeError(`Issue renderer requires ${TOPOLOGY_EDIT_ISSUE_OVERLAY_SCHEMA}.`);
    }
    const baseRadius = markerRadius(overlay.entries, modelBounds);
    const geometries = new Map();
    const materials = new Map();
    for (const entry of overlay.entries) {
      const style = issueSeverityStyle(entry.severity);
      const geometry = cachedGeometry(geometries, style.scale, baseRadius);
      const material = cachedMaterial(materials, entry.severity, style);
      const marker = new THREE.Mesh(geometry, material);
      marker.position.set(entry.position.x, entry.position.y, entry.position.z);
      marker.renderOrder = 900;
      marker.userData = {
        canonicalId: entry.issueId,
        issueId: entry.issueId,
        relatedCanonicalIds: [...entry.canonicalIds],
        pickTarget: issueMarkerPickTarget(entry),
      };
      this.group.add(marker);
    }
    this.overlayHash = overlay.overlayHash;
    this.group.userData.issueOverlayHash = overlay.overlayHash;
    this.group.userData.issueCount = overlay.entries.length;
    return overlay.entries.length;
  }

  clear() {
    if (!this.group) return;
    const geometries = new Set();
    const materials = new Set();
    this.group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const rows = Array.isArray(object.material)
        ? object.material
        : [object.material];
      rows.filter(Boolean).forEach((material) => materials.add(material));
    });
    while (this.group.children.length) this.group.remove(this.group.children[0]);
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.overlayHash = null;
    this.group.userData.issueOverlayHash = null;
    this.group.userData.issueCount = 0;
  }

  destroy() {
    this.clear();
    this.group = null;
  }
}

export function issueMarkerPickTarget(entry) {
  if (!entry?.issueId) throw new TypeError('Issue marker requires an issue ID.');
  return Object.freeze({
    modelRole: 'draft',
    objectKind: 'issue',
    objectId: entry.issueId,
    nodeId: '',
    partRole: 'TOPOLOGY_REVIEW_ISSUE',
    supportId: '',
    restraintId: '',
    restraintFamily: '',
    sourcePaths: Object.freeze([]),
    workspaceEntityIds: Object.freeze([]),
    connector: false,
  });
}

export function issueSeverityStyle(severity) {
  return SEVERITY_STYLE[String(severity ?? '').toUpperCase()]
    ?? SEVERITY_STYLE.LOW;
}

function cachedGeometry(cache, scale, baseRadius) {
  const key = `${scale}:${baseRadius}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.OctahedronGeometry(baseRadius * scale, 1));
  }
  return cache.get(key);
}

function cachedMaterial(cache, severity, style) {
  const key = String(severity ?? 'LOW').toUpperCase();
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshStandardMaterial({
      color: style.color,
      emissive: style.emissive,
      emissiveIntensity: 0.55,
      roughness: 0.25,
      metalness: 0.05,
      depthTest: true,
      depthWrite: true,
      transparent: false,
    }));
  }
  return cache.get(key);
}

function markerRadius(entries, modelBounds) {
  if (modelBounds?.isEmpty && !modelBounds.isEmpty()) {
    const size = modelBounds.getSize(new THREE.Vector3()).length();
    if (Number.isFinite(size) && size > 0) return Math.max(size * 0.012, 3);
  }
  if (!entries.length) return 3;
  const bounds = new THREE.Box3();
  entries.forEach((entry) => bounds.expandByPoint(new THREE.Vector3(
    entry.position.x,
    entry.position.y,
    entry.position.z,
  )));
  const size = bounds.getSize(new THREE.Vector3()).length();
  return Number.isFinite(size) && size > 0 ? Math.max(size * 0.02, 3) : 3;
}
