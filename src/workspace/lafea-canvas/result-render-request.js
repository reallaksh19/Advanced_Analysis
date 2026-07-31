/**
 * Build one exact result-render request from U4D READY intake.
 *
 * This contract does not choose a fallback renderer, create a render packet,
 * or alter engineering evidence. It authorizes only finite stress-contour draw.
 */
import {
  SCHEMAS,
  VIEWPORT_KEYS,
  assertExactKeys,
  contractError,
  deepFreeze,
  requireFiniteNumber,
  requireSchema,
} from './contracts.js';
import {
  LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
} from '../lafea-render-evidence-intake.js';
import {
  requireRenderPacketV2,
  sealRenderPacketV2,
} from './render-packet-v2-contract.js';

export const LAFEA_RESULT_RENDER_REQUEST_SCHEMA = 'LafeaResultRenderRequest.v1';
export const LAFEA_RESULT_RENDER_MODES = Object.freeze(['STRESS_CONTOUR']);

const INPUT_KEYS = Object.freeze(['intake', 'viewport', 'mode']);
const INTAKE_KEYS = Object.freeze([
  'schema', 'stageId', 'sceneRevision', 'status', 'renderEvidenceReady',
  'packet', 'blockingReasons',
]);
const REQUEST_KEYS = Object.freeze([
  'schema', 'stageId', 'sceneRevision', 'mode', 'displayedPrimitiveCount',
  'viewport', 'renderPacket',
]);
const DISPLAY_KEYS = Object.freeze([
  'sourceAuthoring', 'wireframe', 'fieldBounds', 'colorMapId',
  'deformationScale',
]);
const BOUNDS_KEYS = Object.freeze([
  'minimum', 'maximum', 'source', 'semanticHash',
]);
const WORLD_BOUNDS_KEYS = Object.freeze(['minimum', 'maximum']);
const VECTOR_KEYS = Object.freeze(['x', 'y', 'z']);

/** Return one immutable request accepted by the U4E standalone renderer. */
export function createLafeaResultRenderRequest(input) {
  assertExactKeys(input, INPUT_KEYS, 'LAFEA_RESULT_RENDER_INPUT_KEYS_INVALID');
  const intake = requireReadyIntake(input.intake);
  const packet = sealRenderPacketV2(intake.packet);
  const mode = input.mode;
  if (!LAFEA_RESULT_RENDER_MODES.includes(mode)) {
    throw contractError('LAFEA_RESULT_RENDER_MODE_UNSUPPORTED', { mode });
  }
  const viewport = requireResultViewport(input.viewport, packet);
  if ([...packet.qualityFlags].some((value) => value !== 0)
    || [...packet.fieldValues].some((value) => !Number.isFinite(value))) {
    throw contractError('LAFEA_RESULT_RENDER_DIAGNOSTIC_FIELD_UNSUPPORTED');
  }
  const request = {
    schema: LAFEA_RESULT_RENDER_REQUEST_SCHEMA,
    stageId: intake.stageId,
    sceneRevision: intake.sceneRevision,
    mode,
    displayedPrimitiveCount: packet.drawTriangleIndices.length / 3,
    viewport,
    renderPacket: packet,
  };
  assertExactKeys(request, REQUEST_KEYS, 'LAFEA_RESULT_RENDER_REQUEST_KEYS_INVALID');
  return deepFreeze(request);
}

/** Validate an already-created request at the renderer boundary. */
export function requireLafeaResultRenderRequest(value) {
  assertExactKeys(value, REQUEST_KEYS, 'LAFEA_RESULT_RENDER_REQUEST_KEYS_INVALID');
  if (value.schema !== LAFEA_RESULT_RENDER_REQUEST_SCHEMA
    || !LAFEA_RESULT_RENDER_MODES.includes(value.mode)) {
    throw contractError('LAFEA_RESULT_RENDER_REQUEST_SCHEMA_INVALID');
  }
  const packet = requireRenderPacketV2(value.renderPacket);
  if (packet.stageId !== value.stageId
    || packet.sceneRevision !== value.sceneRevision) {
    throw contractError('LAFEA_RESULT_RENDER_REQUEST_IDENTITY_MISMATCH');
  }
  if (!Number.isInteger(value.displayedPrimitiveCount)
    || value.displayedPrimitiveCount !== packet.drawTriangleIndices.length / 3) {
    throw contractError('LAFEA_RESULT_RENDER_PRIMITIVE_COUNT_INVALID');
  }
  requireResultViewport(value.viewport, packet);
  if ([...packet.qualityFlags].some((flag) => flag !== 0)
    || [...packet.fieldValues].some((fieldValue) => !Number.isFinite(fieldValue))) {
    throw contractError('LAFEA_RESULT_RENDER_DIAGNOSTIC_FIELD_UNSUPPORTED');
  }
  return value;
}

function requireReadyIntake(value) {
  assertExactKeys(value, INTAKE_KEYS, 'LAFEA_RESULT_RENDER_INTAKE_KEYS_INVALID');
  if (value.schema !== LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA
    || value.status !== 'READY'
    || value.renderEvidenceReady !== true
    || value.packet === null
    || !Array.isArray(value.blockingReasons)
    || value.blockingReasons.length !== 0) {
    throw contractError('LAFEA_RESULT_RENDER_READY_INTAKE_REQUIRED');
  }
  const packet = requireRenderPacketV2(value.packet);
  if (packet.stageId !== value.stageId
    || packet.sceneRevision !== value.sceneRevision) {
    throw contractError('LAFEA_RESULT_RENDER_INTAKE_IDENTITY_MISMATCH');
  }
  return value;
}

function requireResultViewport(viewport, packet) {
  requireSchema(viewport, SCHEMAS.viewport);
  assertExactKeys(viewport, VIEWPORT_KEYS, 'LAFEA_VIEWPORT_KEYS_INVALID');
  if (viewport.projection !== 'XY_ENGINEERING'
    || viewport.cameraMode !== 'ORTHOGRAPHIC') {
    throw contractError('LAFEA_RESULT_VIEWPORT_MODE_INVALID');
  }
  requireWorldBounds(viewport.worldBounds);
  requireMatrix(viewport.viewMatrix, 'viewMatrix');
  requireMatrix(viewport.projectionMatrix, 'projectionMatrix');
  positiveFinite(viewport.cssWidth, 'cssWidth');
  positiveFinite(viewport.cssHeight, 'cssHeight');
  positiveFinite(viewport.devicePixelRatio, 'devicePixelRatio');
  if (!Array.isArray(viewport.clippingPlanes)) {
    throw contractError('LAFEA_RESULT_VIEWPORT_CLIPPING_PLANES_INVALID');
  }
  if (viewport.clippingPlanes.length !== 0) {
    throw contractError('LAFEA_RESULT_VIEWPORT_CLIPPING_UNSUPPORTED');
  }
  requireGeometryInsideBounds(packet.positions, viewport.worldBounds);
  assertExactKeys(
    viewport.displayOptions,
    DISPLAY_KEYS,
    'LAFEA_RESULT_VIEWPORT_DISPLAY_OPTIONS_INVALID',
  );
  if (viewport.displayOptions.sourceAuthoring !== false
    || viewport.displayOptions.wireframe !== false
    || viewport.displayOptions.deformationScale !== 0) {
    throw contractError('LAFEA_RESULT_VIEWPORT_AUTHORITY_INVALID');
  }
  const bounds = viewport.displayOptions.fieldBounds;
  assertExactKeys(bounds, BOUNDS_KEYS, 'LAFEA_RESULT_FIELD_BOUNDS_KEYS_INVALID');
  for (const field of ['minimum', 'maximum']) {
    requireFiniteNumber(bounds[field], `fieldBounds.${field}`);
  }
  if (bounds.maximum < bounds.minimum
    || bounds.minimum !== packet.field.bounds.minimum
    || bounds.maximum !== packet.field.bounds.maximum
    || bounds.source !== packet.field.bounds.source
    || bounds.semanticHash !== packet.field.bounds.semanticHash) {
    throw contractError('LAFEA_RESULT_FIELD_BOUNDS_MISMATCH');
  }
  if (viewport.displayOptions.colorMapId !== packet.field.colorMapId) {
    throw contractError('LAFEA_RESULT_COLOR_MAP_MISMATCH');
  }
  return deepFreeze(structuredClone(viewport));
}

function requireWorldBounds(value) {
  assertExactKeys(value, WORLD_BOUNDS_KEYS, 'LAFEA_RESULT_WORLD_BOUNDS_KEYS_INVALID');
  for (const endpoint of ['minimum', 'maximum']) {
    assertExactKeys(value[endpoint], VECTOR_KEYS, 'LAFEA_RESULT_WORLD_VECTOR_KEYS_INVALID');
    for (const axis of VECTOR_KEYS) {
      requireFiniteNumber(value[endpoint][axis], `worldBounds.${endpoint}.${axis}`);
    }
  }
  if (value.maximum.x <= value.minimum.x || value.maximum.y <= value.minimum.y
    || value.maximum.z < value.minimum.z) {
    throw contractError('LAFEA_RESULT_WORLD_BOUNDS_INVALID');
  }
}

function requireGeometryInsideBounds(positions, worldBounds) {
  for (let index = 0; index < positions.length; index += 3) {
    const point = { x: positions[index], y: positions[index + 1], z: positions[index + 2] };
    if (point.x < worldBounds.minimum.x || point.x > worldBounds.maximum.x
      || point.y < worldBounds.minimum.y || point.y > worldBounds.maximum.y
      || point.z < worldBounds.minimum.z || point.z > worldBounds.maximum.z) {
      throw contractError('LAFEA_RESULT_GEOMETRY_OUTSIDE_VIEWPORT', {
        vertexIndex: index / 3,
      });
    }
  }
}

function requireMatrix(value, field) {
  if (!Array.isArray(value) || value.length !== 16
    || value.some((entry) => !Number.isFinite(entry))) {
    throw contractError('LAFEA_RESULT_CAMERA_MATRIX_INVALID', { field });
  }
}

function positiveFinite(value, field) {
  requireFiniteNumber(value, field);
  if (value <= 0) throw contractError('LAFEA_RESULT_VIEWPORT_SIZE_INVALID', { field });
}
