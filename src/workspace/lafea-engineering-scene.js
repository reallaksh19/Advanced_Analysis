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
  assertExactKeys,
  contractError,
  deepFreeze,
  requireAsciiIdentity,
  requireSchema,
} from './lafea-canvas/contracts.js';
import { requireRenderPolicy } from './lafea-canvas/render-policy.js';
import { lafeaPreviewGeometry } from './lafea-stage-preview.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';
import {
  RENDER_REQUEST_KEYS,
  currentLifecycleSourceHash,
  diagnostic,
  emptySelection,
  isRecord,
  requireNullableHash,
  requireRevision,
  requireUnique,
  validateDiagnostic,
  validateSourceSelection,
} from './lafea-engineering-scene-contracts.js';
import {
  LAFEA_SOURCE_PRIMITIVE_KINDS,
  LAFEA_SOURCE_PRIMITIVE_SCHEMA,
  createSourcePrimitives,
  validateSourcePrimitive,
} from './lafea-engineering-scene-primitives.js';
import {
  createSourceViewportState,
  validateSourceViewportState,
} from './lafea-engineering-scene-viewport.js';

export {
  LAFEA_SOURCE_PRIMITIVE_KINDS,
  LAFEA_SOURCE_PRIMITIVE_SCHEMA,
};
export const LAFEA_SOURCE_RENDER_REQUEST_SCHEMA = 'lafea-source-render-request/v1';

/**
 * Build an immutable source-only `LafeaEngineeringScene.v2`.
 * Source primitives retain the `SVG_SOURCE_AUTHORING` display role.
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
  const sourcePrimitives = createSourcePrimitives(stage.stageId, geometry);

  if (!sourcePrimitives.length) {
    diagnostics.push(diagnostic(
      'INFO',
      'LAFEA_SOURCE_SCENE_EMPTY',
      'document',
      null,
      'No explicit source geometry is available. The scene contains no synthesized primitives.',
    ));
  }

  return validateSourceScene({
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
  });
}

/**
 * Create one shared orthographic viewport/camera state for SVG and WebGL.
 */
export function createLafeaSourceViewportState(sceneValue, options = {}) {
  const scene = validateSourceScene(sceneValue);
  return createSourceViewportState(scene, options);
}

/**
 * Build the exact SOURCE_AUTHORING request consumed by `createHybridViewport`.
 */
export function createLafeaSourceRenderRequest(input) {
  if (!isRecord(input)) throw contractError('LAFEA_SOURCE_RENDER_REQUEST_REQUIRED');
  const scene = validateSourceScene(input.scene);
  const viewport = validateSourceViewport(input.viewport);
  const policy = requireRenderPolicy(input.policy);
  const selection = validateSourceSelection(
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
  scene.sourcePrimitives.forEach(validateSourcePrimitive);
  scene.diagnostics.forEach(validateDiagnostic);
  requireUnique(
    scene.sourcePrimitives.map((row) => row.primitiveId),
    'LAFEA_SOURCE_PRIMITIVE_ID_COLLISION',
  );
  requireUnique(
    scene.sourcePrimitives.map((row) => row.sceneEntityId),
    'LAFEA_SCENE_ENTITY_ID_COLLISION',
  );
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
  return validateSourceViewportState(viewport);
}
