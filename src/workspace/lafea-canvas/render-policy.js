// src/workspace/lafea-canvas/render-policy.js

import {
  RENDER_MODES,
  SCHEMAS,
  assertExactKeys,
  contractError,
  deepFreeze,
  requireFiniteNumber,
  requireSchema,
} from './contracts.js';

const POLICY_KEYS = Object.freeze([
  'schema',
  'policyId',
  'sourceRevision',
  'svgMeshLimit',
  'svgFallbackLimit',
  'canvas2dFallbackLimit',
  'allowedFallbackModes',
  'semanticHash',
]);

export function requireRenderPolicy(policy) {
  requireSchema(policy, SCHEMAS.renderPolicy);
  assertExactKeys(policy, POLICY_KEYS, 'LAFEA_RENDER_POLICY_KEYS_INVALID');
  if (typeof policy.policyId !== 'string' || !policy.policyId.trim()
    || !Number.isInteger(policy.sourceRevision) || policy.sourceRevision < 0
    || typeof policy.semanticHash !== 'string' || !policy.semanticHash.trim()) {
    throw contractError('LAFEA_RENDER_POLICY_IDENTITY_INVALID');
  }
  if (!Array.isArray(policy.allowedFallbackModes)
    || new Set(policy.allowedFallbackModes).size !== policy.allowedFallbackModes.length
    || policy.allowedFallbackModes.some((mode) => !RENDER_MODES.includes(mode))) {
    throw contractError('LAFEA_RENDER_FALLBACK_MODES_INVALID');
  }

  for (const field of [
    'svgMeshLimit',
    'svgFallbackLimit',
    'canvas2dFallbackLimit',
  ]) {
    const declared = policy[field];

    if (
      !declared ||
      typeof declared.source !== 'string' ||
      declared.source.trim() === ''
    ) {
      throw contractError('LAFEA_RENDER_THRESHOLD_SOURCE_REQUIRED', {
        field,
      });
    }

    requireFiniteNumber(declared.value, `${field}.value`);

    if (declared.value < 0) {
      throw contractError('LAFEA_RENDER_THRESHOLD_INVALID', { field });
    }
  }
  if (policy.svgMeshLimit.value > policy.svgFallbackLimit.value
    || policy.svgFallbackLimit.value > policy.canvas2dFallbackLimit.value) {
    throw contractError('LAFEA_RENDER_THRESHOLD_ORDER_INVALID');
  }

  return policy;
}

export function resolveLafeaRenderer({
  mode,
  displayedPrimitiveCount,
  webglAvailable,
  canvas2dAvailable,
  policy,
}) {
  requireRenderPolicy(policy);

  if (!RENDER_MODES.includes(mode)) {
    throw contractError('LAFEA_RENDER_MODE_UNSUPPORTED', { mode });
  }

  requireFiniteNumber(displayedPrimitiveCount, 'displayedPrimitiveCount');
  if (!Number.isInteger(displayedPrimitiveCount) || displayedPrimitiveCount < 0
    || typeof webglAvailable !== 'boolean' || typeof canvas2dAvailable !== 'boolean') {
    throw contractError('LAFEA_RENDER_AVAILABILITY_INPUT_INVALID');
  }

  if (mode === 'SOURCE_AUTHORING' || mode === 'PRINT_SOURCE') {
    return 'SVG';
  }

  if (mode === 'PRINT_RESULTS' && webglAvailable) {
    return 'RASTER_WEBGL_CAPTURE';
  }

  if (
    mode === 'MESH_WIREFRAME' &&
    displayedPrimitiveCount <= policy.svgMeshLimit.value
  ) {
    return 'SVG';
  }

  if (webglAvailable) {
    return 'THREE_WEBGL';
  }

  if (
    policy.allowedFallbackModes.includes(mode) &&
    displayedPrimitiveCount <= policy.svgFallbackLimit.value
  ) {
    return 'SVG_FALLBACK';
  }

  if (
    canvas2dAvailable &&
    policy.allowedFallbackModes.includes(mode) &&
    displayedPrimitiveCount <= policy.canvas2dFallbackLimit.value
  ) {
    return 'CANVAS2D_FALLBACK';
  }

  throw contractError('LAFEA_WEBGL_REQUIRED_FOR_DISPLAY_SIZE', {
    mode,
    displayedPrimitiveCount,
    policyHash: policy.semanticHash,
  });
}

export function sealRenderDecision(input) {
  return deepFreeze({
    mode: input.mode,
    renderer: input.renderer,
    sceneRevision: input.sceneRevision,
    policyHash: input.policyHash,
    displayedPrimitiveCount: input.displayedPrimitiveCount,
  });
}
