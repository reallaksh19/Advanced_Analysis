/** M003 support/restraint glyph materialization layered on the M002 typed viewport. */
import * as THREE from 'three';
import { materializeTopologyEditSupportOverlay } from './topology-edit-support-glyph-geometry.js';
import { TopologyEditTypedViewportBackend } from './topology-edit-typed-viewport-backend.js';

export const TOPOLOGY_EDIT_SUPPORT_RENDER_STYLES = Object.freeze({
  RICH_ENGINEERING_GLYPH: 'RICH_ENGINEERING_GLYPH',
  TOPO_VALIDATOR_COMPACT: 'TOPO_VALIDATOR_COMPACT',
});

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
    if (projection.renderStyle === TOPOLOGY_EDIT_SUPPORT_RENDER_STYLES.TOPO_VALIDATOR_COMPACT) {
      return super.renderProjection(
        group,
        projection,
        colorHex,
        opacity,
        compactSupportMarkerRadius(projection, markerSize),
      );
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
    const bounds = new THREE.Box3();
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

export function supportEngineeringBoundsProjection(projection) {
  return Object.freeze({
    ...projection,
    elements: Array.isArray(projection?.elements) ? projection.elements : [],
    segments: Object.freeze([]),
  });
}

function compactSupportMarkerRadius(projection, fallbackMarkerSize) {
  const explicit = Number(projection?.compactMarkerRadiusMm);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const fallback = Number(fallbackMarkerSize);
  if (Number.isFinite(fallback) && fallback > 0) return Math.max(fallback * 0.18, 1);
  throw new Error(
    'TOPOLOGY_EDIT_COMPACT_SUPPORT_MARKER_POLICY_MISSING: A positive compact marker radius is required.',
  );
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
    rows.filter(Bolean).forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
