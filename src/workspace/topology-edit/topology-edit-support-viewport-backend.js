/** M003 support/restraint glyph materialization layered on the M002 typed viewport. */
import * as THREE from 'three';
import { materializeTopologyEditSupportOverlay } from './topology-edit-support-glyph-geometry.js';
import { TopologyEditTypedViewportBackend } from './topology-edit-typed-viewport-backend.js';

export class TopologyEditSupportViewportBackend extends TopologyEditTypedViewportBackend {
  renderSession(model) {
    if (!Array.isArray(model?.supports?.glyphOverlays)) {
      return super.renderSession(model);
    }
    return super.renderSession({
      ...model,
      supports: supportEngineeringBoundsProjection(model.supports),
    });
  }

  renderProjection(group, projection, colorHex, opacity, markerSize) {
    if (group !== this.groups.supportGroup || !Array.isArray(projection?.glyphOverlays)) {
      return super.renderProjection(group, projection, colorHex, opacity, markerSize);
    }
    return this.renderSupportGlyphProjection(group, projection);
  }

  renderSupportGlyphProjection(group, projection) {
    const overlays = projection.glyphOverlays;
    const governedMarkerSize = supportMarkerSize(
      this.navigationConfiguration?.supportMarkerSize,
      projection,
    );
    const staging = new THREE.Group();
    try {
      for (const overlay of overlays) {
        const result = materializeTopologyEditSupportOverlay(overlay, {
          markerSize: governedMarkerSize,
          radialSegments: this.navigationConfiguration.meshRadialSegments,
        });
        staging.add(result.object);
      }
    } catch (error) {
      disposeStaging(staging);
      throw error;
    }
    while (staging.children.length) group.add(staging.children[0]);
    this.applySectionPlanesToGroup(group);
    return new THREE.Box3();
  }
}

export function supportEngineeringBoundsProjection(projection) {
  return Object.freeze({
    ...projection,
    elements: Array.isArray(projection?.elements) ? projection.elements : [],
    segments: Object.freeze([]),
  });
}

function supportMarkerSize(configuredValue, projection) {
  const configured = Number(configuredValue);
  if (!Number.isFinite(configured) || configured <= 0) {
    throw new Error(
      'TOPOLOGY_EDIT_SUPPORT_MARKER_POLICY_MISSING: Project Data supportMarkerSize is required.',
    );
  }
  const projected = [...new Set((projection.elements || [])
    .filter((row) => row?.type === 'SUPPORT')
    .map((row) => Number(row.sizeMm))
    .filter((value) => Number.isFinite(value) && value > 0))];
  if (projected.some((value) => value !== configured)) {
    throw new Error(
      'TOPOLOGY_EDIT_SUPPORT_MARKER_POLICY_CONFLICT: Projection and Project Data marker sizes differ.',
    );
  }
  return configured;
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
