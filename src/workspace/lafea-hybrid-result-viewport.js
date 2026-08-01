/**
 * Standalone hybrid result viewport coordinator.
 *
 * Source SVG remains visible in READY and BLOCKED states. WebGL is selected
 * only for U4D READY evidence consumed through the exact U4E request/adapter.
 */
import {
  assertExactKeys,
  contractError,
  deepFreeze,
} from './lafea-canvas/contracts.js';
import { createLafeaResultRenderRequest } from './lafea-canvas/result-render-request.js';
import { createThreeMeshRendererV2 } from './lafea-canvas/three-mesh-renderer-v2.js';
import { validateSourceScene } from './lafea-engineering-scene.js';
import {
  emptyHybridResultSelection,
  sourceCoordinatesOutsideViewport,
  validateHybridResultIntake,
  validateHybridResultSelection,
  validateHybridResultViewport,
} from './lafea-hybrid-result-viewport-contracts.js';
import { mountHybridResultViewportRuntime } from './lafea-hybrid-result-viewport-runtime.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';

export const LAFEA_HYBRID_RESULT_VIEWPORT_SCHEMA = 'lafea-hybrid-result-viewport/v1';
export const LAFEA_HYBRID_RESULT_VIEWPORT_STATUSES = Object.freeze([
  'READY',
  'BLOCKED',
]);
export const LAFEA_HYBRID_RESULT_RENDER_POLICY = deepFreeze({
  schema: 'LafeaRenderPolicy.v1',
  policyId: 'LAFEA-HYBRID-RESULT-WEBGL-ONLY-V1',
  sourceRevision: 1,
  svgMeshLimit: { source: 'U4F_WEBGL_ONLY_RESULT_POLICY', value: 0 },
  svgFallbackLimit: { source: 'U4F_WEBGL_ONLY_RESULT_POLICY', value: 0 },
  canvas2dFallbackLimit: { source: 'U4F_WEBGL_ONLY_RESULT_POLICY', value: 0 },
  allowedFallbackModes: [],
  semanticHash: 'sha256:u4f-hybrid-result-webgl-only-v1',
});

const MODEL_INPUT_KEYS = Object.freeze([
  'stageId', 'sourceScene', 'intake', 'viewport', 'selection',
]);
const HYBRID_MODES = Object.freeze({
  source: 'PRINT_SOURCE',
  result: 'STRESS_CONTOUR',
});
const RUNTIME_CODES = Object.freeze({
  contextLost: 'LAFEA_HYBRID_RESULT_WEBGL_CONTEXT_LOST',
  rerenderRequired: 'LAFEA_HYBRID_RESULT_RERENDER_REQUIRED',
  webglUnavailable: 'LAFEA_HYBRID_RESULT_WEBGL_UNAVAILABLE',
});

/** Validate evidence, source overlay and shared viewport before DOM mounting. */
export function createLafeaHybridResultViewportModel(input) {
  assertExactKeys(input, MODEL_INPUT_KEYS, 'LAFEA_HYBRID_RESULT_MODEL_KEYS_INVALID');
  const registryEntry = requireLafeaStageRegistryEntry(input.stageId);
  const sourceScene = validateSourceScene(input.sourceScene);
  const intake = validateHybridResultIntake(input.intake);
  const viewport = validateHybridResultViewport(input.viewport);
  const selection = validateHybridResultSelection(
    input.selection ?? emptyHybridResultSelection(sourceScene.sceneRevision),
    sourceScene,
  );
  const reasons = collectInitialReasons({
    registryEntry,
    sourceScene,
    intake,
    viewport,
  });
  const resultRequest = createResultRequest({
    registryEntry,
    sourceScene,
    intake,
    viewport,
    reasons,
  });
  const status = reasons.length ? 'BLOCKED' : 'READY';
  return deepFreeze({
    schema: LAFEA_HYBRID_RESULT_VIEWPORT_SCHEMA,
    stageId: registryEntry.stageId,
    sceneRevision: sourceScene.sceneRevision,
    status,
    sourceScene,
    viewport,
    selection,
    resultRequest: status === 'READY' ? resultRequest : null,
    blockingReasons: reasons,
  });
}

/** Mount the standalone hybrid result viewport. */
export function mountLafeaHybridResultViewport(root, input) {
  if (!root?.ownerDocument) {
    throw contractError('LAFEA_HYBRID_RESULT_ROOT_REQUIRED');
  }
  const model = createLafeaHybridResultViewportModel({
    stageId: input?.stageId,
    sourceScene: input?.sourceScene,
    intake: input?.intake,
    viewport: input?.viewport,
    selection: input?.selection ?? null,
  });
  return mountHybridResultViewportRuntime({
    root,
    input,
    model,
    registryEntry: requireLafeaStageRegistryEntry(model.stageId),
    schema: LAFEA_HYBRID_RESULT_VIEWPORT_SCHEMA,
    renderPolicy: LAFEA_HYBRID_RESULT_RENDER_POLICY,
    modes: HYBRID_MODES,
    codes: RUNTIME_CODES,
    createRenderer: createThreeMeshRendererV2,
  });
}

function collectInitialReasons({ registryEntry, sourceScene, intake, viewport }) {
  const reasons = [];
  const addReason = (code) => {
    if (!reasons.includes(code)) reasons.push(code);
  };
  if (registryEntry.engineState === 'ENGINE_NOT_IMPLEMENTED') {
    addReason('LAFEA_HYBRID_RESULT_STAGE_ENGINE_NOT_IMPLEMENTED');
  }
  if (sourceScene.sceneId !== `LAFEA-SCENE-${registryEntry.stageId}-SOURCE`
    || sourceScene.sourcePrimitives.some(
      (primitive) => primitive.stageId !== registryEntry.stageId,
    )) {
    addReason('LAFEA_HYBRID_RESULT_SOURCE_STAGE_MISMATCH');
  }
  if (sourceScene.sceneRevision !== intake.sceneRevision) {
    addReason('LAFEA_HYBRID_RESULT_SOURCE_SCENE_REVISION_MISMATCH');
  }
  sourceCoordinatesOutsideViewport(sourceScene, viewport).forEach(addReason);
  if (intake.status === 'BLOCKED') intake.blockingReasons.forEach(addReason);
  return reasons;
}

function createResultRequest({ registryEntry, sourceScene, intake, viewport, reasons }) {
  if (intake.status === 'BLOCKED') return null;
  const resultRequest = createLafeaResultRenderRequest({
    intake,
    viewport,
    mode: HYBRID_MODES.result,
  });
  if (intake.stageId !== registryEntry.stageId) {
    reasons.push('LAFEA_HYBRID_RESULT_INTAKE_STAGE_MISMATCH');
  }
  if (sourceScene.sourceSemanticHash === null) {
    reasons.push('LAFEA_HYBRID_RESULT_SOURCE_HASH_UNAVAILABLE');
  } else if (sourceScene.sourceSemanticHash
    !== resultRequest.renderPacket.lineage.sourceHash) {
    reasons.push('LAFEA_HYBRID_RESULT_SOURCE_HASH_MISMATCH');
  }
  return resultRequest;
}
