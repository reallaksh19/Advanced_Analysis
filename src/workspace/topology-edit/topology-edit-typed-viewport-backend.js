/** M002 typed-component and M003 support-glyph materialization over M001 lifecycle. */
import * as THREE from 'three';
import { deepFreeze } from '../../core/shared-piping-model/index.js';
import { engineeringBoundsToRender } from './topology-edit-coordinate-transform.js';
import { materializeTopologyEditPrimitive } from './topology-edit-primitive-geometry.js';
import { materializeTopologyEditSupportOverlay } from './topology-edit-support-glyph-geometry.js';
import { TopologyEditViewportBackend } from './topology-edit-viewport-backend.js';

export function retainTypedTopologyEditPrimitives(model, projection) {
  const primitives = (model?.components || []).flatMap((component) => component.primitives || []);
  return deepFreeze({ ...(projection || {}), primitives });
}

export class TopologyEditTypedViewportBackend extends TopologyEditViewportBackend {
  renderSession(model) {
    if (!model) return;
    this.clearGroup(this.groups.sourceGroup);
    this.clearGroup(this.groups.draftGroup);
    this.clearGroup(this.groups.supportGroup);
    this.clearGroup(this.groups.ghostGroup);

    const projections = [model.source, model.draft, model.supports].filter(Boolean);
    const elements = projections.flatMap((row) => Array.isArray(row.elements) ? row.elements : []);
    const segments = projections.flatMap((row) => Array.isArray(row.segments) ? row.segments : []);
    const provisionalBounds = projectedBounds(elements, segments);
    const markerSize = markerSizeForBounds(provisionalBounds);

    const renderedBounds = [
      this.renderProjection(this.groups.sourceGroup, model.source, 0x38bdf8, 0.4, markerSize),
      this.renderProjection(this.groups.draftGroup, model.draft, 0x0284c7, 1, markerSize),
      this.renderProjection(this.groups.supportGroup, model.supports, 0x22d3ee, 1, markerSize),
    ];
    this.engineeringBounds = unionBounds(renderedBounds, provisionalBounds);
    this.lastBounds = transformEngineeringBox(this.engineeringBounds);
    this.sceneBoundsCache = this.lastBounds.isEmpty() ? null : this.lastBounds.clone();
    this.boundsRevision += 1;
    this.renderGhost(model.ghost, markerSize);
    this.engineeringRoot.updateMatrixWorld(true);
    this.invalidate('typed-model-replacement');

    const typedCount = projections.reduce(
      (sum, row) => sum + (Array.isArray(row.primitives) ? row.primitives.length : 0),
      0,
    );
    const supportGlyphCount = Array.isArray(model.supports?.glyphOverlays)
      ? model.supports.glyphOverlays.length : 0;
    if (!this.hasFitOnce && (elements.length || segments.length || typedCount || supportGlyphCount)) {
      this.hasFitOnce = true;
      this.fitAll({ remember: false });
      if (this.controls) this.initialCameraState = this.captureCameraState();
    }
  }

  renderProjection(group, projection, colorHex, opacity, markerSize) {
    if (!projection) return new THREE.Box3();
    if (group === this.groups.supportGroup && Array.isArray(projection.glyphOverlays)) {
      return this.buildSupportGlyphGroup(group, projection);
    }
    const primitives = Array.isArray(projection.primitives) ? projection.primitives : [];
    const bounds = primitives.length
      ? this.buildTypedPrimitiveGroup(group, primitives, colorHex, opacity, markerSize)
      : projectedBounds(projection.elements || [], projection.segments || []);

    if (!primitives.length) this.buildSegmentGroup(group, projection.segments, colorHex, opacity);
    const markers = primitives.length
      ? (projection.elements || []).filter((element) => element.type === 'node')
      : projection.elements;
    this.buildMeshGroup(group, markers, colorHex, opacity, markerSize);
    for (const marker of markers || []) {
      if (finiteElement(marker)) bounds.expandByPoint(new THREE.Vector3(marker.x, marker.y, marker.z));
    }
    this.applySectionPlanesToGroup(group);
    return bounds;
  }

  buildTypedPrimitiveGroup(group, primitives, colorHex, opacity, markerSize) {
    const material = createMaterial(colorHex, opacity);
    const staging = new THREE.Group();
    const bounds = new THREE.Box3();
    try {
      for (const primitive of primitives) {
        const result = materializeTopologyEditPrimitive(primitive, {
          material,
          radialSegments: this.navigationConfiguration.meshRadialSegments,
          markerSize,
          pickUserData: typedPrimitivePickUserData(primitive),
        });
        staging.add(result.object);
        bounds.union(result.bounds);
      }
    } catch (error) {
      disposeObjectResources(staging);
      material.dispose();
      throw error;
    }
    while (staging.children.length) group.add(staging.children[0]);
    return bounds;
  }

  buildSupportGlyphGroup(group, projection) {
    const markerSize = supportMarkerSize(projection);
    const staging = new THREE.Group();
    const bounds = new THREE.Box3();
    try {
      for (const overlay of projection.glyphOverlays) {
        const result = materializeTopologyEditSupportOverlay(overlay, {
          markerSize,
          radialSegments: this.navigationConfiguration.meshRadialSegments,
        });
        staging.add(result.object);
        bounds.union(result.bounds);
      }
    } catch (error) {
      disposeObjectResources(staging);
      throw error;
    }
    while (staging.children.length) group.add(staging.children[0]);
    this.applySectionPlanesToGroup(group);
    return bounds;
  }
}

function typedPrimitivePickUserData(primitive) {
  const canonicalId = typeof primitive?.canonicalEntityId === 'string'
    ? primitive.canonicalEntityId.trim()
    : '';
  if (!canonicalId) {
    throw new Error('TOPOLOGY_EDIT_PICK_IDENTITY_MISSING: Typed primitives require canonicalEntityId.');
  }
  const modelRole = typeof primitive.modelRole === 'string'
    ? primitive.modelRole.trim().toLowerCase()
    : '';
  if (!['source', 'draft'].includes(modelRole)) {
    throw new Error('TOPOLOGY_EDIT_PICK_MODEL_ROLE_INVALID: Typed primitives require source or draft modelRole.');
  }
  return {
    canonicalId,
    type: primitive.kind,
    pickTarget: {
      modelRole,
      objectKind: 'component',
      objectId: canonicalId,
      sourcePaths: Array.isArray(primitive.sourcePaths) ? primitive.sourcePaths : [],
      workspaceEntityIds: Array.isArray(primitive.workspaceEntityIds)
        ? primitive.workspaceEntityIds
        : [],
      partRole: primitive.partRole,
    },
  };
}

function supportMarkerSize(projection) {
  if (projection.glyphOverlays.length === 0) return 1;
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

function projectedBounds(elements, segments) {
  const bounds = new THREE.Box3();
  for (const element of elements || []) {
    if (finiteElement(element)) bounds.expandByPoint(new THREE.Vector3(element.x, element.y, element.z));
  }
  for (const segment of segments || []) {
    const points = Array.isArray(segment.points) ? segment.points : [segment.start, segment.end];
    for (const point of points) {
      if (finitePoint(point)) bounds.expandByPoint(new THREE.Vector3(point.x, point.y, point.z));
    }
  }
  return bounds;
}

function unionBounds(rows, fallback) {
  const bounds = new THREE.Box3();
  for (const row of rows) if (row && !row.isEmpty()) bounds.union(row);
  if (bounds.isEmpty() && fallback && !fallback.isEmpty()) bounds.union(fallback);
  return bounds;
}

function transformEngineeringBox(bounds) {
  if (!bounds || bounds.isEmpty()) return new THREE.Box3();
  const transformed = engineeringBoundsToRender({ min: bounds.min, max: bounds.max });
  return new THREE.Box3(
    new THREE.Vector3(transformed.min.x, transformed.min.y, transformed.min.z),
    new THREE.Vector3(transformed.max.x, transformed.max.y, transformed.max.z),
  );
}

function markerSizeForBounds(bounds) {
  return !bounds || bounds.isEmpty()
    ? 10
    : Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.008, 5);
}

function createMaterial(color, opacity) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 0.2,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
}

function disposeObjectResources(root) {
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

function finiteElement(value) {
  return value && [value.x, value.y, value.z].every(Number.isFinite);
}

function finitePoint(value) {
  return value && [value.x, value.y, value.z].every(Number.isFinite);
}
