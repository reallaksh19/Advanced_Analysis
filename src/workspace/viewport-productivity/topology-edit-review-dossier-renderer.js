import * as THREE from 'three';
import { assertTopologyEditReviewDossier } from './topology-edit-review-dossier.js';

/** Disposable exact-ID coverage renderer for one review dossier. */
export class TopologyEditReviewDossierRenderer {
  constructor(transientGroup) {
    if (!transientGroup?.isGroup) {
      throw new TypeError('TopologyEditReviewDossierRenderer requires transientGroup.');
    }
    this.group = transientGroup;
    this.group.userData.nonPickable = true;
  }

  render(dossier, canonicalTopology, bounds = null) {
    this.clear();
    assertTopologyEditReviewDossier(dossier);
    if (!Array.isArray(canonicalTopology?.nodes) || !Array.isArray(canonicalTopology?.edges)) {
      throw new TypeError('Canonical topology is required for dossier coverage rendering.');
    }
    const nodes = new Map(canonicalTopology.nodes.map((node) => [node.id, node]));
    const edges = new Map(canonicalTopology.edges.map((edge) => [edge.id, edge]));
    const size = markerSize(bounds);
    const ids = new Set(dossier.coverageCanonicalIds);
    for (const canonicalId of [...ids].sort()) {
      const node = nodes.get(canonicalId);
      if (node && finitePoint(node.position)) {
        this.group.add(nodeMarker(canonicalId, node.position, size, dossier.dossierHash));
        continue;
      }
      const edge = edges.get(canonicalId);
      const from = edge ? nodes.get(edge.fromNodeId) : null;
      const to = edge ? nodes.get(edge.toNodeId) : null;
      if (edge && finitePoint(from?.position) && finitePoint(to?.position)) {
        this.group.add(edgeLine(canonicalId, from.position, to.position, dossier.dossierHash));
      }
    }
    return this.group.children.length;
  }

  clear() {
    const geometries = new Set();
    const materials = new Set();
    this.group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const rows = Array.isArray(object.material) ? object.material : [object.material];
      rows.filter(Boolean).forEach((material) => materials.add(material));
    });
    while (this.group.children.length) this.group.remove(this.group.children[0]);
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }

  destroy() {
    this.clear();
    this.group = null;
  }
}

function nodeMarker(canonicalId, position, size, dossierHash) {
  const marker = new THREE.Mesh(
    new THREE.IcosahedronGeometry(size, 1),
    new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.72,
      depthTest: false,
    }),
  );
  marker.position.copy(vector(position));
  marker.renderOrder = 950;
  marker.userData = coverageData(canonicalId, dossierHash);
  return marker;
}

function edgeLine(canonicalId, start, end, dossierHash) {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([vector(start), vector(end)]),
    new THREE.LineDashedMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
      dashSize: 12,
      gapSize: 7,
    }),
  );
  line.computeLineDistances();
  line.renderOrder = 949;
  line.userData = coverageData(canonicalId, dossierHash);
  return line;
}

function coverageData(canonicalId, dossierHash) {
  return {
    nonPickable: true,
    objectKind: 'review-dossier-coverage',
    canonicalId,
    dossierHash,
  };
}
function markerSize(bounds) {
  if (!bounds || bounds.isEmpty?.()) return 4;
  return Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.0045, 2.5);
}
function finitePoint(point) {
  return point && [point.x, point.y, point.z]
    .every((value) => Number.isFinite(Number(value)));
}
function vector(point) {
  return new THREE.Vector3(Number(point.x), Number(point.y), Number(point.z));
}
