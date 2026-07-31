/**
 * Governed source-only bridge into the existing LAFEA hybrid-canvas contracts.
 *
 * U4A creates renderer-neutral source primitives and one shared viewport state.
 * It does not create analysis topology, mesh, result fields, render packets,
 * qualification or code evidence. Opaque source hashes are accepted only from
 * a CURRENT U3 lifecycle binding.
 */
import {
  SCHEMAS,
  SCENE_KEYS,
  VIEWPORT_KEYS,
  assertExactKeys,
  contractError,
  deepFreeze,
  requireAsciiIdentity,
  requireFiniteNumber,
  requireSchema,
} from './lafea-canvas/contracts.js';
import { requireRenderPolicy } from './lafea-canvas/render-policy.js';
import { lafeaPreviewGeometry } from './lafea-stage-preview.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';

export const LAFEA_SOURCE_PRIMITIVE_SCHEMA = 'lafea-source-primitive/v1';
export const LAFEA_SOURCE_PRIMITIVE_KINDS = Object.freeze([
  'SOURCE_POINT',
  'SOURCE_ELEMENT',
]);
export const LAFEA_SOURCE_RENDER_REQUEST_SCHEMA = 'lafea-source-render-request/v1';

const PRIMITIVE_KEYS = Object.freeze([
  'schema',
  'primitiveId',
  'kind',
  'stageId',
  'sourceEntityId',
  'sourcePath',
  'sceneEntityId',
  'coordinates',
  'nodeIds',
  'parentIdentity',
  'displayRole',
]);
const PARENT_KEYS = Object.freeze([
  'authorityLayer',
  'stageId',
  'sourceEntityId',
  'sourcePath',
]);
const DIAGNOSTIC_KEYS = Object.freeze([
  'severity',
  'code',
  'path',
  'entityId',
  'message',
]);
const WORLD_BOUNDS_KEYS = Object.freeze([
  'minimum',
  'maximum',
]);
const VECTOR_KEYS = Object.freeze(['x', 'y', 'z']);
const DISPLAY_OPTION_KEYS = Object.freeze([
  'sourceAuthoring',
  'wireframe',
  'fieldBounds',
  'colorMapId',
  'deformationScale',
]);
const RENDER_REQUEST_KEYS = Object.freeze([
  'schema',
  'scene',
  'viewport',
  'mode',
  'displayedPrimitiveCount',
  'policy',
  'renderPacket',
  'selection',
]);
const SELECTION_KEYS = Object.freeze([
  'sceneRevision',
  'sourceEntityId',
  'meshEntityId',
  'entityRole',
]);

/**
 * Build an immutable source-only `LafeaEngineeringScene.v2`.
 */
export function createLafeaSourceEngineeringScene(input) {
  if (!isRecord(input)) throw contractError('LAFEA_SOURCE_SCENE_INPUT_REQUIRED');
  const stage = requireLafeaStageRegistryEntry(input.stageId);
  requireRevision(input.sceneRevision);
  const geometry = lafeaPreviewGeometry(stage.stageId, input.document);
  const diagnostics = [];
  const sourceSemanticHash = currentLifecycleSourceHash(
    input.lifecycle,
    input.lifecycleBinding,
    diagnostics,
  );

  const sourcePrimitives = [
    ...geometry.nodes.map((node) => pointPrimitive(stage.stageId, node)),
    ...geometry.elements.map((element) => elementPrimitive(stage.stageId, element, geometry.nodes)),
  ];

  if (!sourcePrimitives.length) {
    diagnostics.push(diagnostic(
      'INFO',
      'LAFEA_SOURCE_SCENE_EMPTY',
      'document',
      null,
      'No explicit source geometry is available. The scene contains no synthesized primitives.',
    ));
  }

  const scene = {
    schema: SCHEMAS.scene,
    sceneId: `LAFEA-SCENE-${stage.stageId}-SOURCE`,
    sceneRevision: input.sceneRevision,
    sourceSemanticHash,
    topologySemanticHash: null,
    meshSemanticHash: null,
    recoverySemanticHash: null,
    sourcePrimitives,
    meshReferences: [],
    resultFields: [],
    labels: [],
    diagnostics,
    parentHashes: sourceSemanticHash
      ? [{ authorityLayer: 'SOURCE', hash: sourceSemanticHash }]
      : [],
  };
  return validateSourceScene(scene);
}

/**
 * Create one shared orthographic viewport/camera state for SVG and WebGL.
 */
export function createLafeaSourceViewportState(sceneValue, options = {}) {
  const scene = validateSourceScene(sceneValue);
  const cssWidth = positiveFinite(options.cssWidth ?? 800, 'cssWidth');
  const cssHeight = positiveFinite(options.cssHeight ?? 600, 'cssHeight');
  const devicePixelRatio = positiveFinite(
    options.devicePixelRatio ?? 1,
    'devicePixelRatio',
  );
  const paddingRatio = boundedPadding(options.paddingRatio ?? 0.05);
  const worldBounds = paddedBounds(sourceBounds(scene.sourcePrimitives), paddingRatio);
  const projectionMatrix = orthographicProjection(worldBounds);
  const viewport = {
    schema: SCHEMAS.viewport,
    projection: 'XY_ENGINEERING',
    cameraMode: 'ORTHOGRAPHIC',
    worldBounds,
    viewMatrix: identityMatrix(),
    projectionMatrix,
    cssWidth,
    cssHeight,
    devicePixelRatio,
    clippingPlanes: [],
    displayOptions: {
      sourceAuthoring: true,
      wireframe: false,
      fieldBounds: null,
      colorMapId: null,
      deformationScale: 0,
    },
  };
  return validateSourceViewport(viewport);
}

/**
 * Build the exact SOURCE_AUTHORING request consumed by `createHybridViewport`.
 */
export function createLafeaSourceRenderRequest(input) {
  if (!isRecord(input)) throw contractError('LAFEA_SOURCE_RENDER_REQUEST_REQUIRED');
  const scene = validateSourceScene(input.scene);
  const viewport = validateSourceViewport(input.viewport);
  const policy = requireRenderPolicy(input.policy);
  const selection = validateSelection(
    input.selection ?? emptySelection(scene.sceneRevision),
    scene,
  );
  const request = {
    schema: LAFEA_SOURCE_RENDER_REQUEST_SCHEMA,
    scene,
    viewport,
    mode: 'SOURCE_AUTHORING',
    displayedPrimitiveCount: scene.sourcePrimitives.length,
    policy,
    renderPacket: null,
    selection,
  };
  assertExactKeys(
    request,
    RENDER_REQUEST_KEYS,
    'LAFEA_SOURCE_RENDER_REQUEST_KEYS_INVALID',
  );
  return deepFreeze(request);
}

export function validateSourceScene(scene) {
  requireSchema(scene, SCHEMAS.scene);
  assertExactKeys(scene, SCENE_KEYS, 'LAFEA_SCENE_KEYS_INVALID');
  requireAsciiIdentity(scene.sceneId, 'sceneId');
  requireRevision(scene.sceneRevision);
  requireNullableHash(scene.sourceSemanticHash, 'sourceSemanticHash');
  for (const field of [
    'topologySemanticHash', 'meshSemanticHash', 'recoverySemanticHash',
  ]) {
    if (scene[field] !== null) {
      throw contractError('LAFEA_SOURCE_SCENE_ENGINEERING_EVIDENCE_FORBIDDEN', { field });
    }
  }
  if (!Array.isArray(scene.sourcePrimitives)
    || !Array.isArray(scene.meshReferences)
    || !Array.isArray(scene.resultFields)
    || !Array.isArray(scene.labels)
    || !Array.isArray(scene.diagnostics)
    || !Array.isArray(scene.parentHashes)) {
    throw contractError('LAFEA_SOURCE_SCENE_ARRAYS_REQUIRED');
  }
  if (scene.meshReferences.length || scene.resultFields.length) {
    throw contractError('LAFEA_SOURCE_SCENE_MESH_RESULT_FORBIDDEN');
  }
  scene.sourcePrimitives.forEach(validatePrimitive);
  scene.diagnostics.forEach(validateDiagnostic);
  const primitiveIds = scene.sourcePrimitives.map((row) => row.primitiveId);
  const sceneEntityIds = scene.sourcePrimitives.map((row) => row.sceneEntityId);
  requireUnique(primitiveIds, 'LAFEA_SOURCE_PRIMITIVE_ID_COLLISION');
  requireUnique(sceneEntityIds, 'LAFEA_SCENE_ENTITY_ID_COLLISION');
  if (scene.sourceSemanticHash === null && scene.parentHashes.length) {
    throw contractError('LAFEA_SOURCE_SCENE_PARENT_HASH_WITHOUT_AUTHORITY');
  }
  if (scene.sourceSemanticHash !== null) {
    if (scene.parentHashes.length !== 1
      || scene.parentHashes[0]?.authorityLayer !== 'SOURCE'
      || scene.parentHashes[0]?.hash !== scene.sourceSemanticHash) {
      throw contractError('LAFEA_SOURCE_SCENE_PARENT_HASH_INVALID');
    }
  }
  return deepFreeze(structuredClone(scene));
}

export function validateSourceViewport(viewport) {
  requireSchema(viewport, SCHEMAS.viewport);
  assertExactKeys(viewport, VIEWPORT_KEYS, 'LAFEA_VIEWPORT_KEYS_INVALID');
  if (viewport.projection !== 'XY_ENGINEERING'
    || viewport.cameraMode !== 'ORTHOGRAPHIC') {
    throw contractError('LAFEA_SOURCE_VIEWPORT_MODE_INVALID');
  }
  validateWorldBounds(viewport.worldBounds);
  requireMatrix(viewport.viewMatrix, 'viewMatrix');
  requireMatrix(viewport.projectionMatrix, 'projectionMatrix');
  positiveFinite(viewport.cssWidth, 'cssWidth');
  positiveFinite(viewport.cssHeight, 'cssHeight');
  positiveFinite(viewport.devicePixelRatio, 'devicePixelRatio');
  if (!Array.isArray(viewport.clippingPlanes)) {
    throw contractError('LAFEA_VIEWPORT_CLIPPING_PLANES_INVALID');
  }
  assertExactKeys(
    viewport.displayOptions,
    DISPLAY_OPTION_KEYS,
    'LAFEA_VIEWPORT_DISPLAY_OPTIONS_INVALID',
  );
  if (viewport.displayOptions.sourceAuthoring !== true
    || viewport.displayOptions.wireframe !== false
    || viewport.displayOptions.fieldBounds !== null
    || viewport.displayOptions.colorMapId !== null
    || viewport.displayOptions.deformationScale !== 0) {
    throw contractError('LAFEA_SOURCE_VIEWPORT_DISPLAY_AUTHORITY_INVALID');
  }
  return deepFreeze(structuredClone(viewport));
}

function pointPrimitive(stageId, node) {
  const primitive = {
    schema: LAFEA_SOURCE_PRIMITIVE_SCHEMA,
    primitiveId: `${stageId}:POINT:${node.sourceEntityId}`,
    kind: 'SOURCE_POINT',
    stageId,
    sourceEntityId: node.sourceEntityId,
    sourcePath: node.sourcePath,
    sceneEntityId: node.sceneEntityId,
    coordinates: [{ x: node.x, y: node.y, z: node.z }],
    nodeIds: [node.nodeId],
    parentIdentity: parentIdentity(stageId, node.sourceEntityId, node.sourcePath),
    displayRole: 'SVG_SOURCE_AUTHORING',
  };
  return validatePrimitive(primitive);
}

function elementPrimitive(stageId, sourceElement, sourceNodes) {
  const nodeMap = new Map(sourceNodes.map((node) => [node.nodeId, node]));
  const coordinates = sourceElement.nodeIds.map((nodeId) => {
    const node = nodeMap.get(nodeId);
    if (!node) {
      throw contractError('LAFEA_SOURCE_ELEMENT_NODE_NOT_FOUND', {
        sourceEntityId: sourceElement.sourceEntityId,
        nodeId,
      });
    }
    return { x: node.x, y: node.y, z: node.z };
  });
  const primitive = {
    schema: LAFEA_SOURCE_PRIMITIVE_SCHEMA,
    primitiveId: `${stageId}:ELEMENT:${sourceElement.sourceEntityId}`,
    kind: 'SOURCE_ELEMENT',
    stageId,
    sourceEntityId: sourceElement.sourceEntityId,
    sourcePath: sourceElement.sourcePath,
    sceneEntityId: sourceElement.sceneEntityId,
    coordinates,
    nodeIds: [...sourceElement.nodeIds],
    parentIdentity: parentIdentity(
      stageId,
      sourceElement.sourceEntityId,
      sourceElement.sourcePath,
    ),
    displayRole: 'SVG_SOURCE_AUTHORING',
  };
  return validatePrimitive(primitive);
}

function validatePrimitive(value) {
  assertExactKeys(value, PRIMITIVE_KEYS, 'LAFEA_SOURCE_PRIMITIVE_KEYS_INVALID');
  if (value.schema !== LAFEA_SOURCE_PRIMITIVE_SCHEMA
    || !LAFEA_SOURCE_PRIMITIVE_KINDS.includes(value.kind)) {
    throw contractError('LAFEA_SOURCE_PRIMITIVE_SCHEMA_INVALID');
  }
  requireAsciiIdentity(value.primitiveId, 'primitiveId');
  requireAsciiIdentity(value.stageId, 'stageId');
  requireAsciiIdentity(value.sourceEntityId, 'sourceEntityId');
  requireAsciiIdentity(value.sourcePath, 'sourcePath');
  requireAsciiIdentity(value.sceneEntityId, 'sceneEntityId');
  if (value.displayRole !== 'SVG_SOURCE_AUTHORING') {
    throw contractError('LAFEA_SOURCE_PRIMITIVE_DISPLAY_ROLE_INVALID');
  }
  if (!Array.isArray(value.coordinates) || !value.coordinates.length
    || !Array.isArray(value.nodeIds) || !value.nodeIds.length) {
    throw contractError('LAFEA_SOURCE_PRIMITIVE_GEOMETRY_REQUIRED');
  }
  value.coordinates.forEach((row) => {
    assertExactKeys(row, VECTOR_KEYS, 'LAFEA_SOURCE_COORDINATE_KEYS_INVALID');
    requireFiniteNumber(row.x, 'coordinate.x');
    requireFiniteNumber(row.y, 'coordinate.y');
    requireFiniteNumber(row.z, 'coordinate.z');
  });
  value.nodeIds.forEach((id, index) => requireAsciiIdentity(id, `nodeIds[${index}]`));
  assertExactKeys(value.parentIdentity, PARENT_KEYS, 'LAFEA_SOURCE_PARENT_KEYS_INVALID');
  if (value.parentIdentity.authorityLayer !== 'SOURCE'
    || value.parentIdentity.stageId !== value.stageId
    || value.parentIdentity.sourceEntityId !== value.sourceEntityId
    || value.parentIdentity.sourcePath !== value.sourcePath) {
    throw contractError('LAFEA_SOURCE_PARENT_IDENTITY_INVALID');
  }
  return deepFreeze(structuredClone(value));
}

function validateSelection(value, scene) {
  assertExactKeys(value, SELECTION_KEYS, 'LAFEA_SELECTION_KEYS_INVALID');
  if (value.sceneRevision !== scene.sceneRevision) {
    throw contractError('LAFEA_SELECTION_SCENE_REVISION_MISMATCH');
  }
  if (value.meshEntityId !== null) {
    throw contractError('LAFEA_SOURCE_SELECTION_MESH_ID_FORBIDDEN');
  }
  if (value.sourceEntityId === null) {
    if (value.entityRole !== null) {
      throw contractError('LAFEA_EMPTY_SELECTION_ROLE_INVALID');
    }
    return deepFreeze(structuredClone(value));
  }
  requireAsciiIdentity(value.sourceEntityId, 'selection.sourceEntityId');
  if (value.entityRole !== 'SOURCE') {
    throw contractError('LAFEA_SOURCE_SELECTION_ROLE_INVALID');
  }
  if (!scene.sourcePrimitives.some(
    (row) => row.sourceEntityId === value.sourceEntityId,
  )) {
    throw contractError('LAFEA_SOURCE_SELECTION_ENTITY_NOT_IN_SCENE');
  }
  return deepFreeze(structuredClone(value));
}

function currentLifecycleSourceHash(lifecycle, binding, diagnostics) {
  if (!lifecycle) {
    diagnostics.push(diagnostic(
      'INFO',
      'LAFEA_SCENE_SOURCE_HASH_UNAVAILABLE',
      'lifecycle',
      null,
      'No opaque lifecycle source hash is registered; source geometry remains display-only.',
    ));
    return null;
  }
  if (binding?.status !== 'CURRENT') {
    diagnostics.push(diagnostic(
      'WARNING',
      'LAFEA_SCENE_SOURCE_BINDING_NOT_CURRENT',
      'lifecycleBinding.status',
      null,
      `Lifecycle binding is ${binding?.status ?? 'MISSING'}; no source hash is promoted into the scene.`,
    ));
    return null;
  }
  const sourceHash = lifecycle?.source?.sourceHash;
  requireNullableHash(sourceHash, 'lifecycle.source.sourceHash');
  if (sourceHash === null) {
    throw contractError('LAFEA_CURRENT_LIFECYCLE_SOURCE_HASH_REQUIRED');
  }
  return sourceHash;
}

function sourceBounds(primitives) {
  const coordinates = primitives.flatMap((row) => row.coordinates);
  if (!coordinates.length) {
    return {
      minimum: { x: -1, y: -1, z: 0 },
      maximum: { x: 1, y: 1, z: 0 },
    };
  }
  return {
    minimum: {
      x: Math.min(...coordinates.map((row) => row.x)),
      y: Math.min(...coordinates.map((row) => row.y)),
      z: Math.min(...coordinates.map((row) => row.z)),
    },
    maximum: {
      x: Math.max(...coordinates.map((row) => row.x)),
      y: Math.max(...coordinates.map((row) => row.y)),
      z: Math.max(...coordinates.map((row) => row.z)),
    },
  };
}

function paddedBounds(bounds, paddingRatio) {
  const width = Math.max(bounds.maximum.x - bounds.minimum.x, 1);
  const height = Math.max(bounds.maximum.y - bounds.minimum.y, 1);
  const padX = width * paddingRatio;
  const padY = height * paddingRatio;
  return deepFreeze({
    minimum: {
      x: bounds.minimum.x - padX,
      y: bounds.minimum.y - padY,
      z: bounds.minimum.z,
    },
    maximum: {
      x: bounds.maximum.x + padX,
      y: bounds.maximum.y + padY,
      z: bounds.maximum.z,
    },
  });
}

function orthographicProjection(bounds) {
  const left = bounds.minimum.x;
  const right = bounds.maximum.x;
  const bottom = bounds.minimum.y;
  const top = bounds.maximum.y;
  const near = -1;
  const far = 1;
  return [
    2 / (right - left), 0, 0, 0,
    0, 2 / (top - bottom), 0, 0,
    0, 0, -2 / (far - near), 0,
    -(right + left) / (right - left),
    -(top + bottom) / (top - bottom),
    -(far + near) / (far - near),
    1,
  ];
}

function identityMatrix() {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

function validateWorldBounds(value) {
  assertExactKeys(value, WORLD_BOUNDS_KEYS, 'LAFEA_WORLD_BOUNDS_KEYS_INVALID');
  for (const name of ['minimum', 'maximum']) {
    assertExactKeys(value[name], VECTOR_KEYS, 'LAFEA_WORLD_BOUND_VECTOR_INVALID');
    for (const axis of ['x', 'y', 'z']) {
      requireFiniteNumber(value[name][axis], `worldBounds.${name}.${axis}`);
    }
  }
  if (value.maximum.x <= value.minimum.x || value.maximum.y <= value.minimum.y
    || value.maximum.z < value.minimum.z) {
    throw contractError('LAFEA_WORLD_BOUNDS_RANGE_INVALID');
  }
}

function requireMatrix(value, field) {
  if (!Array.isArray(value) || value.length !== 16
    || value.some((entry) => !Number.isFinite(entry))) {
    throw contractError('LAFEA_VIEWPORT_MATRIX_INVALID', { field });
  }
}

function parentIdentity(stageId, sourceEntityId, sourcePath) {
  return {
    authorityLayer: 'SOURCE',
    stageId,
    sourceEntityId,
    sourcePath,
  };
}

function emptySelection(sceneRevision) {
  return {
    sceneRevision,
    sourceEntityId: null,
    meshEntityId: null,
    entityRole: null,
  };
}

function diagnostic(severity, code, path, entityId, message) {
  return deepFreeze({ severity, code, path, entityId, message });
}

function validateDiagnostic(value) {
  assertExactKeys(value, DIAGNOSTIC_KEYS, 'LAFEA_SCENE_DIAGNOSTIC_KEYS_INVALID');
  if (!['INFO', 'WARNING', 'ERROR'].includes(value.severity)) {
    throw contractError('LAFEA_SCENE_DIAGNOSTIC_SEVERITY_INVALID');
  }
  requireAsciiIdentity(value.code, 'diagnostic.code');
  requireAsciiIdentity(value.path, 'diagnostic.path');
  if (value.entityId !== null) requireAsciiIdentity(value.entityId, 'diagnostic.entityId');
  if (typeof value.message !== 'string' || !value.message) {
    throw contractError('LAFEA_SCENE_DIAGNOSTIC_MESSAGE_REQUIRED');
  }
}

function requireRevision(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw contractError('LAFEA_SCENE_REVISION_INVALID', { value });
  }
}

function requireNullableHash(value, field) {
  if (value !== null && (typeof value !== 'string' || !value.trim())) {
    throw contractError('LAFEA_OPAQUE_HASH_REQUIRED', { field, value });
  }
}

function positiveFinite(value, field) {
  const number = requireFiniteNumber(value, field);
  if (number <= 0) throw contractError('LAFEA_POSITIVE_VALUE_REQUIRED', { field, value });
  return number;
}

function boundedPadding(value) {
  const number = requireFiniteNumber(value, 'paddingRatio');
  if (number < 0 || number > 0.5) {
    throw contractError('LAFEA_VIEWPORT_PADDING_INVALID', { value });
  }
  return number;
}

function requireUnique(values, code) {
  if (new Set(values).size !== values.length) throw contractError(code);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
