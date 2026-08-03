/** M002 typed-component materialization layered on the certified M001 viewport lifecycle. */
import * as THREE from 'three';
import { deepFreeze } from '../../core/shared-piping-model/index.js';
import { engineeringBoundsToRender } from './topology-edit-coordinate-transform.js';
import { materializeTopologyEditPrimitive } from './topology-edit-primitive-geometry.js';
import { TopologyEditViewportBackend } from './topology-edit-viewport-backend.js';

export const TOPOLOGY_EDIT_TYPED_PROJECTION_ERROR = 'TOPOLOGY_EDIT_TYPED_PROJECTION_INVALID';

export function retainTypedTopologyEditPrimitives(model, projection) {
  const acceptedProjection = projection && typeof projection === 'object' ? projection : {};
  const nodePositions = new Map(
    (acceptedProjection.elements || [])
      .filter((row) => row?.type === 'node' && finiteElement(row))
      .map((row) => [String(row.id || row.entityId || ''), {
        x: row.x,
        y: row.y,
        z: row.z,
      }]),
  );
  const primitives = (model?.components || [])
    .flatMap((component) => component.primitives || [])
    .map((primitive) => enrichGovernedPlacement(primitive, nodePositions));
  return deepFreeze({ ...acceptedProjection, primitives });
}

export class TopologyEditTypedViewportBackend extends TopologyEditViewportBackend {
  renderSession(model) {
    if (!model) return;
    this.clearGroup(this.groups.sourceGroup);
    this.clearGroup(this.groups.draftGroup);
    this.clearGroup(this.groups.supportGroup);
    this.clearGroup(this.groups.ghostGroup);
    this.pendingTypedGeometryDiagnostics = [];

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
    this.typedGeometryDiagnostics = deepFreeze(this.pendingTypedGeometryDiagnostics);
    this.pendingTypedGeometryDiagnostics = null;
    this.invalidate('typed-model-replacement');

    const typedCount = projections.reduce(
      (sum, row) => sum + (Array.isArray(row.primitives) ? row.primitives.length : 0),
      0,
    );
    if (!this.hasFitOnce && (elements.length || segments.length || typedCount)) {
      this.hasFitOnce = true;
      this.fitAll({ remember: false });
      if (this.controls) this.initialCameraState = this.captureCameraState();
    }
  }

  renderProjection(group, projection, colorHex, opacity, markerSize) {
    if (!projection) return new THREE.Box3();
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
        try {
          const result = materializeTopologyEditPrimitive(primitive, {
            material,
            radialSegments: this.navigationConfiguration.meshRadialSegments,
            markerSize,
            pickUserData: typedPrimitivePickUserData(primitive),
          });
          staging.add(result.object);
          bounds.union(result.bounds);
        } catch (error) {
          const diagnostic = materializeTypedGeometryDiagnostic(
            primitive,
            error,
            material,
            this.navigationConfiguration.meshRadialSegments,
            markerSize,
          );
          staging.add(diagnostic.object);
          bounds.union(diagnostic.bounds);
          this.pendingTypedGeometryDiagnostics?.push(diagnostic.evidence);
        }
      }
    } catch (error) {
      disposeObjectGeometry(staging);
      material.dispose();
      throw error;
    }
    while (staging.children.length) group.add(staging.children[0]);
    return bounds;
  }
}

function enrichGovernedPlacement(primitive, nodePositions) {
  if (!primitive || typeof primitive !== 'object') {
    throw typedProjectionError('Typed primitive record is required.', 'PRIMITIVE_RECORD_MISSING');
  }
  const parameters = primitive.parameters && typeof primitive.parameters === 'object'
    ? primitive.parameters
    : {};
  if (primitive.kind === 'TEE_JUNCTION') {
    const runNodeIds = requireExactStringArray(parameters.runNodeIds, 2, 'TEE_RUN_NODE_IDS_INVALID');
    const branchNodeId = requiredString(parameters.branchNodeId, 'TEE_BRANCH_NODE_ID_INVALID');
    return deepFreeze({
      ...primitive,
      parameters: {
        ...parameters,
        runEnds: runNodeIds.map((nodeId) => requireNodePosition(nodePositions, nodeId)),
        branchEnd: requireNodePosition(nodePositions, branchNodeId),
      },
    });
  }
  if (primitive.kind === 'OLET_BRANCH') {
    const branchNodeId = requiredString(parameters.branchNodeId, 'OLET_BRANCH_NODE_ID_INVALID');
    return deepFreeze({
      ...primitive,
      parameters: {
        ...parameters,
        branchEnd: requireNodePosition(nodePositions, branchNodeId),
      },
    });
  }
  return primitive;
}

function typedPrimitivePickUserData(primitive) {
  const canonicalId = requiredString(
    primitive?.canonicalEntityId,
    'TOPOLOGY_EDIT_PICK_IDENTITY_MISSING',
  );
  const modelRole = requiredString(
    primitive?.modelRole,
    'TOPOLOGY_EDIT_PICK_MODEL_ROLE_INVALID',
  ).toLowerCase();
  if (!['source', 'draft'].includes(modelRole)) {
    throw new Error('TOPOLOGY_EDIT_PICK_MODEL_ROLE_INVALID: Typed primitives require source or draft modelRole.');
  }
  const partRole = requiredString(
    primitive?.partRole,
    'TOPOLOGY_EDIT_PICK_PART_ROLE_MISSING',
  );
  const sourcePaths = requireStringArray(
    primitive?.sourcePaths,
    'TOPOLOGY_EDIT_PICK_SOURCE_PATHS_INVALID',
  );
  const workspaceEntityIds = requireStringArray(
    primitive?.workspaceEntityIds,
    'TOPOLOGY_EDIT_PICK_WORKSPACE_IDS_INVALID',
  );
  return {
    canonicalId,
    type: primitive.kind,
    pickTarget: {
      modelRole,
      objectKind: 'component',
      objectId: canonicalId,
      sourcePaths,
      workspaceEntityIds,
      partRole,
    },
  };
}

function materializeTypedGeometryDiagnostic(
  primitive,
  error,
  material,
  radialSegments,
  markerSize,
) {
  const anchor = diagnosticAnchor(primitive?.parameters);
  if (!anchor) throw error;
  const group = new THREE.Group();
  const evidence = deepFreeze({
    code: String(error?.code || 'TOPOLOGY_EDIT_PRIMITIVE_GEOMETRY_INVALID'),
    detailCode: String(error?.detailCode || 'UNCLASSIFIED_TYPED_GEOMETRY_FAILURE'),
    primitiveId: String(primitive?.primitiveId || ''),
    canonicalEntityId: String(primitive?.canonicalEntityId || ''),
    primitiveKind: String(primitive?.kind || ''),
  });
  group.name = `topology-edit-geometry-diagnostic:${evidence.primitiveId || evidence.canonicalEntityId}`;
  group.userData = { ...evidence, nonPickable: true, diagnostic: true };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(
      markerSize,
      radialSegments,
      Math.max(6, Math.floor(radialSegments * 0.75)),
    ),
    material,
  );
  mesh.position.set(anchor.x, anchor.y, anchor.z);
  mesh.userData = { ...group.userData };
  group.add(mesh);
  group.updateMatrixWorld(true);
  return {
    object: group,
    bounds: new THREE.Box3().setFromObject(group),
    evidence,
  };
}

function diagnosticAnchor(parameters) {
  if (!parameters || typeof parameters !== 'object') return null;
  for (const candidate of [
    parameters.center,
    parameters.position,
    parameters.start,
    parameters.end,
    ...(Array.isArray(parameters.arcPoints) ? parameters.arcPoints : []),
  ]) {
    if (finitePoint(candidate)) return candidate;
  }
  return null;
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

function disposeObjectGeometry(root) {
  const geometries = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
  });
  geometries.forEach((geometry) => geometry.dispose());
}

function requireNodePosition(nodePositions, nodeId) {
  const point = nodePositions.get(nodeId);
  if (!point) {
    throw typedProjectionError(
      `Canonical node ${nodeId} is missing from the compatibility projection.`,
      'CANONICAL_NODE_POSITION_MISSING',
    );
  }
  return point;
}

function requireExactStringArray(value, count, code) {
  if (!Array.isArray(value) || value.length !== count) {
    throw typedProjectionError(`Exactly ${count} string identities are required.`, code);
  }
  return value.map((row) => requiredString(row, code));
}

function requireStringArray(value, code) {
  if (!Array.isArray(value)) throw new Error(`${code}: An array is required.`);
  return value.map((row) => requiredString(row, code));
}

function requiredString(value, code) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result) throw new Error(`${code}: A non-empty string is required.`);
  return result;
}

function typedProjectionError(message, detailCode) {
  const error = new Error(`${TOPOLOGY_EDIT_TYPED_PROJECTION_ERROR}: ${message}`);
  error.code = TOPOLOGY_EDIT_TYPED_PROJECTION_ERROR;
  error.detailCode = detailCode;
  return error;
}

function finiteElement(value) {
  return value && [value.x, value.y, value.z].every(Number.isFinite);
}

function finitePoint(value) {
  return value && [value.x, value.y, value.z].every(Number.isFinite);
}
