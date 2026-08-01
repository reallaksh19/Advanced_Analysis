import {
  SCHEMAS,
  VIEWPORT_KEYS,
  assertExactKeys,
  contractError,
  deepFreeze,
  requireFiniteNumber,
  requireSchema,
} from './lafea-canvas/contracts.js';
import {
  LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
  LAFEA_RENDER_EVIDENCE_INTAKE_STATUSES,
} from './lafea-render-evidence-intake.js';

const INTAKE_KEYS = Object.freeze([
  'schema', 'stageId', 'sceneRevision', 'status', 'renderEvidenceReady',
  'packet', 'blockingReasons',
]);
const SELECTION_KEYS = Object.freeze([
  'sceneRevision', 'sourceEntityId', 'meshEntityId', 'entityRole',
]);
const DISPLAY_KEYS = Object.freeze([
  'sourceAuthoring', 'wireframe', 'fieldBounds', 'colorMapId',
  'deformationScale',
]);
const FIELD_BOUNDS_KEYS = Object.freeze([
  'minimum', 'maximum', 'source', 'semanticHash',
]);
const WORLD_BOUNDS_KEYS = Object.freeze(['minimum', 'maximum']);
const VECTOR_KEYS = Object.freeze(['x', 'y', 'z']);

export function validateHybridResultIntake(value) {
  assertExactKeys(value, INTAKE_KEYS, 'LAFEA_HYBRID_RESULT_INTAKE_KEYS_INVALID');
  if (value.schema !== LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA
    || !LAFEA_RENDER_EVIDENCE_INTAKE_STATUSES.includes(value.status)
    || !Array.isArray(value.blockingReasons)) {
    throw contractError('LAFEA_HYBRID_RESULT_INTAKE_INVALID');
  }
  if (value.status === 'READY') validateReadyIntake(value);
  else validateBlockedIntake(value);
  return value;
}

export function validateHybridResultSelection(value, scene) {
  assertExactKeys(value, SELECTION_KEYS, 'LAFEA_HYBRID_RESULT_SELECTION_KEYS_INVALID');
  if (value.sceneRevision !== scene.sceneRevision || value.meshEntityId !== null) {
    throw contractError('LAFEA_HYBRID_RESULT_SELECTION_IDENTITY_INVALID');
  }
  if (value.sourceEntityId === null) validateEmptySelection(value);
  else validateSourceSelection(value, scene);
  return deepFreeze(structuredClone(value));
}

export function validateHybridResultViewport(value) {
  requireSchema(value, SCHEMAS.viewport);
  assertExactKeys(value, VIEWPORT_KEYS, 'LAFEA_VIEWPORT_KEYS_INVALID');
  validateViewportMode(value);
  validateWorldBounds(value.worldBounds);
  validateMatrices(value);
  validateViewportSize(value);
  validateDisplayOptions(value.displayOptions);
  return deepFreeze(structuredClone(value));
}

export function sourceCoordinatesOutsideViewport(scene, viewport) {
  const bounds = viewport.worldBounds;
  const outside = scene.sourcePrimitives.some((primitive) => primitive.coordinates.some(
    (point) => point.x < bounds.minimum.x || point.x > bounds.maximum.x
      || point.y < bounds.minimum.y || point.y > bounds.maximum.y
      || point.z < bounds.minimum.z || point.z > bounds.maximum.z,
  ));
  return outside ? ['LAFEA_HYBRID_RESULT_SOURCE_OUTSIDE_VIEWPORT'] : [];
}

export function emptyHybridResultSelection(sceneRevision) {
  return deepFreeze({
    sceneRevision,
    sourceEntityId: null,
    meshEntityId: null,
    entityRole: null,
  });
}

export function uniqueHybridResultReasons(reasons) {
  return [...new Set(reasons)];
}

function validateReadyIntake(value) {
  if (value.renderEvidenceReady !== true || value.packet === null
    || value.blockingReasons.length !== 0) {
    throw contractError('LAFEA_HYBRID_RESULT_READY_INTAKE_INVALID');
  }
}

function validateBlockedIntake(value) {
  if (value.renderEvidenceReady !== false || value.packet !== null
    || value.blockingReasons.length === 0
    || value.blockingReasons.some((reason) => typeof reason !== 'string' || !reason)) {
    throw contractError('LAFEA_HYBRID_RESULT_BLOCKED_INTAKE_INVALID');
  }
}

function validateEmptySelection(value) {
  if (value.entityRole !== null) {
    throw contractError('LAFEA_HYBRID_RESULT_EMPTY_SELECTION_INVALID');
  }
}

function validateSourceSelection(value, scene) {
  if (value.entityRole !== 'SOURCE'
    || !scene.sourcePrimitives.some((row) => row.sourceEntityId === value.sourceEntityId)) {
    throw contractError('LAFEA_HYBRID_RESULT_SOURCE_SELECTION_INVALID');
  }
}

function validateViewportMode(value) {
  if (value.projection !== 'XY_ENGINEERING' || value.cameraMode !== 'ORTHOGRAPHIC'
    || !Array.isArray(value.clippingPlanes) || value.clippingPlanes.length !== 0) {
    throw contractError('LAFEA_HYBRID_RESULT_VIEWPORT_MODE_INVALID');
  }
}

function validateWorldBounds(value) {
  assertExactKeys(value, WORLD_BOUNDS_KEYS, 'LAFEA_HYBRID_RESULT_WORLD_BOUNDS_INVALID');
  for (const endpoint of WORLD_BOUNDS_KEYS) validateWorldVector(value[endpoint], endpoint);
  if (value.maximum.x <= value.minimum.x
    || value.maximum.y <= value.minimum.y
    || value.maximum.z < value.minimum.z) {
    throw contractError('LAFEA_HYBRID_RESULT_WORLD_BOUNDS_ORDER_INVALID');
  }
}

function validateWorldVector(value, endpoint) {
  assertExactKeys(value, VECTOR_KEYS, 'LAFEA_HYBRID_RESULT_WORLD_VECTOR_INVALID');
  VECTOR_KEYS.forEach((axis) => requireFiniteNumber(
    value[axis],
    `worldBounds.${endpoint}.${axis}`,
  ));
}

function validateMatrices(value) {
  for (const matrix of ['viewMatrix', 'projectionMatrix']) {
    if (!Array.isArray(value[matrix]) || value[matrix].length !== 16
      || value[matrix].some((entry) => !Number.isFinite(entry))) {
      throw contractError('LAFEA_HYBRID_RESULT_MATRIX_INVALID', { matrix });
    }
  }
}

function validateViewportSize(value) {
  for (const field of ['cssWidth', 'cssHeight', 'devicePixelRatio']) {
    requireFiniteNumber(value[field], field);
    if (value[field] <= 0) {
      throw contractError('LAFEA_HYBRID_RESULT_VIEWPORT_SIZE_INVALID');
    }
  }
}

function validateDisplayOptions(value) {
  assertExactKeys(value, DISPLAY_KEYS, 'LAFEA_HYBRID_RESULT_DISPLAY_OPTIONS_INVALID');
  if (value.sourceAuthoring !== false || value.wireframe !== false
    || value.deformationScale !== 0) {
    throw contractError('LAFEA_HYBRID_RESULT_DISPLAY_AUTHORITY_INVALID');
  }
  validateFieldBounds(value.fieldBounds);
  if (value.colorMapId !== null
    && (typeof value.colorMapId !== 'string' || !value.colorMapId)) {
    throw contractError('LAFEA_HYBRID_RESULT_COLOR_MAP_INVALID');
  }
}

function validateFieldBounds(value) {
  if (value === null) return;
  assertExactKeys(value, FIELD_BOUNDS_KEYS, 'LAFEA_HYBRID_RESULT_FIELD_BOUNDS_INVALID');
  requireFiniteNumber(value.minimum, 'fieldBounds.minimum');
  requireFiniteNumber(value.maximum, 'fieldBounds.maximum');
  if (value.maximum < value.minimum
    || typeof value.source !== 'string' || !value.source
    || typeof value.semanticHash !== 'string' || !value.semanticHash) {
    throw contractError('LAFEA_HYBRID_RESULT_FIELD_BOUNDS_INVALID');
  }
}
