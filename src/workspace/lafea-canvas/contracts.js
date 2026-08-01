// src/workspace/lafea-canvas/contracts.js

export const SCHEMAS = Object.freeze({
  scene: 'LafeaEngineeringScene.v2',
  viewport: 'LafeaViewportState.v2',
  renderPolicy: 'LafeaRenderPolicy.v1',
  pickMap: 'LafeaPickMap.v1',
  svgDraft: 'LafeaSvgDraft.v2',
  renderEvidence: 'LafeaRenderEvidence.v1',
  renderPacket: 'LafeaRenderPacket.v1',
  renderPacketV2: 'LafeaRenderPacket.v2',
  meshingCommand: 'LafeaMeshingCommand.v1',
});

export const RENDER_MODES = Object.freeze([
  'SOURCE_AUTHORING',
  'MESH_WIREFRAME',
  'FILLED_MESH',
  'STRESS_CONTOUR',
  'SHELL_3D',
  'PRINT_SOURCE',
  'PRINT_RESULTS',
]);

export const RENDERERS = Object.freeze([
  'SVG',
  'SVG_FALLBACK',
  'THREE_WEBGL',
  'CANVAS2D_FALLBACK',
  'RASTER_WEBGL_CAPTURE',
]);

export const ELEMENT_TYPES = Object.freeze([
  'T6',
  'Q8',
  'MITC4',
  'MITC3',
]);

export const RESULT_FIELD_KINDS = Object.freeze([
  'INTEGRATION_POINT',
  'ELEMENT',
  'PROJECTED_NODAL',
  'SHELL_TOP',
  'SHELL_MID',
  'SHELL_BOTTOM',
  'SCL',
  'MESH_QUALITY',
]);

export const SCENE_KEYS = Object.freeze([
  'schema',
  'sceneId',
  'sceneRevision',
  'sourceSemanticHash',
  'topologySemanticHash',
  'meshSemanticHash',
  'recoverySemanticHash',
  'sourcePrimitives',
  'meshReferences',
  'resultFields',
  'labels',
  'diagnostics',
  'parentHashes',
]);

export const VIEWPORT_KEYS = Object.freeze([
  'schema',
  'projection',
  'cameraMode',
  'worldBounds',
  'viewMatrix',
  'projectionMatrix',
  'cssWidth',
  'cssHeight',
  'devicePixelRatio',
  'clippingPlanes',
  'displayOptions',
]);

export function assertExactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw contractError(code, { reason: 'NOT_A_RECORD' });
  }

  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw contractError(code, { actual, expected });
  }
}

export function requireSchema(value, expected) {
  if (value?.schema !== expected) {
    throw contractError('LAFEA_SCHEMA_MISMATCH', {
      expected,
      actual: value?.schema ?? null,
    });
  }
}

export function requireFiniteNumber(value, field) {
  if (!Number.isFinite(value)) {
    throw contractError('LAFEA_FINITE_VALUE_REQUIRED', { field, value });
  }
  return Object.is(value, -0) ? 0 : value;
}

export function requireAsciiIdentity(value, field) {
  if (typeof value !== 'string' || !/^[\x20-\x7E]+$/u.test(value)) {
    throw contractError('LAFEA_ASCII_IDENTITY_REQUIRED', { field, value });
  }
  return value;
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function contractError(code, evidence = {}) {
  const error = new TypeError(code);
  error.code = code;
  error.evidence = evidence;
  return error;
}
