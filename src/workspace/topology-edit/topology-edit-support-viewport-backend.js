/** M003 support/restraint glyph materialization layered on the M002 typed viewport. */
import * as THREE from 'three';
import { materializeTopologyEditSupportOverlay } from './topology-edit-support-glyph-geometry.js';
import { TopologyEditTypedViewportBackend } from './topology-edit-typed-viewport-backend.js';

export class TopologyEditSupportViewportBackend extends TopologyEditTypedViewportBackend {
  renderProjection(group, projection, colorHex, opacity, markerSize) {
    if (group !== this.groups.supportGroup || !Array.isArray(projection?.glyphOverlays)) {
      return super.renderProjection(group, projection, colorHex, opacity, markerSize);
    }
    return this.renderSupportGlyphProjection(group, projection);
  }

  renderSupportGlyphProjection(group, projection) {
    const overlays = projection.glyphOverlays;
    const governedMarkerSize = supportMarkerSize(projection, overlays.length);
    const bounds = new THREE.Box3();
    const staging = new THREE.Group();
    try {
      for (const overlay of overlays) {
        const result = materializeTopologyEditSupportOverlay(overlay, {
          markerSize: governedMarkerSize,
          radialSegments: this.navigationConfiguration.meshRadialSegments,
        });
        staging.add(result.object);
        bounds.union(result.bounds);
      }
    } catch (error) {
      disposeStaging(staging);
      throw error;
    }
    while (staging.children.length) group.add(staging.children[0]);
    this.applySectionPlanesToGroup(group);
    return bounds;
  }
}

function supportMarkerSize(projection, overlayCount) {
  if (overlayCount === 0) return 1;
  const sizes = [...new Set((projection.elements || [])
    .filter((row) => row?.type === 'SUPPORT')
    .map((row) => Number(row.sizeMm))
    .filter((value) => Number.isFinite(value) && value > 0))];
  if (sizes.length !== 1) {
    throw new Error(
      'TOPOLOGY_EDIT_SUPPORT_MARKER_POLICY_CONFLICT: Exactly one approved support marker size is required.',
    );
  }
  return sizes[0];
}

function disposeStaging(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const rows = Array.isArray(object.material) ? object.material : [object.material];
    rows.filter(Boolean).forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
