import * as THREE from 'three';

/** Disposable renderer for exact canonical route evidence. */
export class TopologyEditRouteTraceRenderer {
  constructor(connectorGroup) {
    if (!connectorGroup?.isGroup) {
      throw new TypeError('TopologyEditRouteTraceRenderer requires connectorGroup.');
    }
    this.group = connectorGroup;
    this.group.userData.nonPickable = true;
  }

  render(model, bounds = null) {
    this.clear();
    if (model?.status !== 'READY') return 0;
    const markerSize = sizeForBounds(bounds);
    const routeMaterial = new THREE.LineBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    for (const segment of model.segments ?? []) {
      if (!finitePoint(segment.start) || !finitePoint(segment.end)) continue;
      const geometry = new THREE.BufferGeometry().setFromPoints([
        vector(segment.start),
        vector(segment.end),
      ]);
      const line = new THREE.Line(geometry, routeMaterial);
      line.renderOrder = 900;
      line.userData.nonPickable = true;
      line.userData.routeEdgeId = segment.edgeId;
      this.group.add(line);
    }
    this.renderNodeMarkers(model, markerSize);
    return this.group.children.length;
  }

  renderNodeMarkers(model, markerSize) {
    const pointByNodeId = new Map();
    for (const segment of model.segments ?? []) {
      const edge = (model.edgeEvidence ?? []).find((row) => row.edgeId === segment.edgeId);
      if (!edge) continue;
      pointByNodeId.set(edge.fromNodeId, segment.start);
      pointByNodeId.set(edge.toNodeId, segment.end);
    }
    const selected = new Set(model.selection?.nodeIds ?? []);
    const open = new Set(model.openEndpointIds ?? []);
    const branches = new Set(model.branchNodeIds ?? []);
    for (const nodeId of model.orderedNodeIds ?? []) {
      const point = pointByNodeId.get(nodeId);
      if (!finitePoint(point)) continue;
      const marker = nodeMarker({
        markerSize,
        selected: selected.has(nodeId),
        open: open.has(nodeId),
        branch: branches.has(nodeId),
      });
      marker.position.copy(vector(point));
      marker.renderOrder = 901;
      marker.userData.nonPickable = true;
      marker.userData.routeNodeId = nodeId;
      this.group.add(marker);
    }
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

function nodeMarker({ markerSize, selected, open, branch }) {
  const size = selected ? markerSize * 1.5 : markerSize;
  const geometry = branch
    ? new THREE.OctahedronGeometry(size * 1.2)
    : open
      ? new THREE.BoxGeometry(size * 1.5, size * 1.5, size * 1.5)
      : new THREE.SphereGeometry(size, 12, 10);
  const color = branch ? 0xef4444 : open ? 0xf59e0b : selected ? 0x22d3ee : 0xa855f7;
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  }));
}

function sizeForBounds(bounds) {
  if (!bounds || bounds.isEmpty?.()) return 5;
  return Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.006, 3);
}
function finitePoint(point) {
  return point && [point.x, point.y, point.z].every((value) => Number.isFinite(Number(value)));
}
function vector(point) {
  return new THREE.Vector3(Number(point.x), Number(point.y), Number(point.z));
}
