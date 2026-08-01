import {
  SCHEMAS,
  VIEWPORT_KEYS,
  assertExactKeys,
  contractError,
  deepFreeze,
  requireFiniteNumber,
  requireSchema,
} from './lafea-canvas/contracts.js';

const WORLD_BOUNDS_KEYS = Object.freeze(['minimum', 'maximum']);
const VECTOR_KEYS = Object.freeze(['x', 'y', 'z']);
const DISPLAY_OPTION_KEYS = Object.freeze([
  'sourceAuthoring',
  'wireframe',
  'fieldBounds',
  'colorMapId',
  'deformationScale',
]);

export function createSourceViewportState(scene, options = {}) {
  const cssWidth = positiveFinite(options.cssWidth ?? 800, 'cssWidth');
  const cssHeight = positiveFinite(options.cssHeight ?? 600, 'cssHeight');
  const devicePixelRatio = positiveFinite(
    options.devicePixelRatio ?? 1,
    'devicePixelRatio',
  );
  const paddingRatio = boundedPadding(options.paddingRatio ?? 0.05);
  const worldBounds = paddedBounds(sourceBounds(scene.sourcePrimitives), paddingRatio);
  const viewport = {
    schema: SCHEMAS.viewport,
    projection: 'XY_ENGINEERING',
    cameraMode: 'ORTHOGRAPHIC',
    worldBounds,
    viewMatrix: identityMatrix(),
    projectionMatrix: orthographicProjection(worldBounds),
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
  return validateSourceViewportState(viewport);
}

export function validateSourceViewportState(viewport) {
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
