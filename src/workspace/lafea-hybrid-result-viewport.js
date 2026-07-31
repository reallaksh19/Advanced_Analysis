/**
 * Standalone hybrid result viewport coordinator.
 *
 * Source SVG remains visible in READY and BLOCKED states. WebGL is selected
 * only for U4D READY evidence consumed through the exact U4E request/adapter.
 */
import { createAccessibleInspector } from './lafea-canvas/accessible-inspector.js';
import {
  SCHEMAS,
  VIEWPORT_KEYS,
  assertExactKeys,
  contractError,
  deepFreeze,
  requireFiniteNumber,
  requireSchema,
} from './lafea-canvas/contracts.js';
import { createHybridViewport } from './lafea-canvas/hybrid-viewport.js';
import {
  createLafeaResultRenderRequest,
} from './lafea-canvas/result-render-request.js';
import { renderLafeaSourceOverlay } from './lafea-canvas/source-overlay-adapter.js';
import { createThreeMeshRendererV2 } from './lafea-canvas/three-mesh-renderer-v2.js';
import { validateSourceScene } from './lafea-engineering-scene.js';
import {
  LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
  LAFEA_RENDER_EVIDENCE_INTAKE_STATUSES,
} from './lafea-render-evidence-intake.js';
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
const WORLD_BOUNDS_KEYS = Object.freeze(['minimum', 'maximum']);
const VECTOR_KEYS = Object.freeze(['x', 'y', 'z']);

/** Validate evidence, source overlay and shared viewport before DOM mounting. */
export function createLafeaHybridResultViewportModel(input) {
  assertExactKeys(input, MODEL_INPUT_KEYS, 'LAFEA_HYBRID_RESULT_MODEL_KEYS_INVALID');
  const registryEntry = requireLafeaStageRegistryEntry(input.stageId);
  const sourceScene = validateSourceScene(input.sourceScene);
  const intake = validateIntake(input.intake);
  const viewport = validateSharedViewport(input.viewport);
  const selection = validateSelection(
    input.selection ?? emptySelection(sourceScene.sceneRevision),
    sourceScene,
  );
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

  let resultRequest = null;
  if (intake.status === 'BLOCKED') {
    intake.blockingReasons.forEach(addReason);
  } else {
    resultRequest = createLafeaResultRenderRequest({
      intake,
      viewport,
      mode: 'STRESS_CONTOUR',
    });
    if (intake.stageId !== registryEntry.stageId) {
      addReason('LAFEA_HYBRID_RESULT_INTAKE_STAGE_MISMATCH');
    }
    if (sourceScene.sourceSemanticHash === null) {
      addReason('LAFEA_HYBRID_RESULT_SOURCE_HASH_UNAVAILABLE');
    } else if (sourceScene.sourceSemanticHash
      !== resultRequest.renderPacket.lineage.sourceHash) {
      addReason('LAFEA_HYBRID_RESULT_SOURCE_HASH_MISMATCH');
    }
  }

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
  if (!root?.ownerDocument) throw contractError('LAFEA_HYBRID_RESULT_ROOT_REQUIRED');
  const model = createLafeaHybridResultViewportModel({
    stageId: input?.stageId,
    sourceScene: input?.sourceScene,
    intake: input?.intake,
    viewport: input?.viewport,
    selection: input?.selection ?? null,
  });
  const registryEntry = requireLafeaStageRegistryEntry(model.stageId);
  root.style.minHeight = `${model.viewport.cssHeight}px`;
  root.style.height = `${model.viewport.cssHeight}px`;

  let status = model.status;
  let renderer = 'NONE';
  let blockingReasons = [...model.blockingReasons];
  let runtimeBlock = null;
  let selection = model.selection;
  let renderResult = null;
  let destroyed = false;
  let controller = null;
  let threeAdapter = null;
  let canvasRef = null;
  let contextListenersBound = false;
  const baseInspector = createAccessibleInspector();

  const adapters = {
    svg: {
      render({ target, scene, viewport, selection: visibleSelection }) {
        renderLafeaSourceOverlay({
          target,
          scene,
          viewport,
          registryEntry,
          selection: visibleSelection,
          editable: false,
          onSelectSource: selectSource,
        });
      },
      dispose() {},
    },
    webgl: {
      isAvailable(canvas) {
        canvasRef = canvas;
        if (status !== 'READY' || runtimeBlock !== null) return false;
        if (!threeAdapter) {
          threeAdapter = createThreeMeshRendererV2(input.THREE, canvas);
          bindContextEvents(canvas);
        }
        return threeAdapter.isAvailable();
      },
      render({ target }) {
        if (!threeAdapter || target !== canvasRef || model.resultRequest === null) {
          throw contractError('LAFEA_HYBRID_RESULT_RENDER_ADAPTER_NOT_READY');
        }
        renderResult = threeAdapter.render(model.resultRequest);
        return renderResult;
      },
      setVisible(visible) {
        if (threeAdapter) threeAdapter.setVisible(visible);
        else if (canvasRef) canvasRef.hidden = !visible;
      },
      clearCurrentScene() {
        threeAdapter?.clearCurrentScene();
        if (canvasRef && !threeAdapter) canvasRef.dataset.ready = 'false';
        renderResult = null;
      },
      dispose() {
        threeAdapter?.dispose();
        threeAdapter = null;
      },
    },
    inspector: {
      render(args) {
        baseInspector.render(args);
        appendResultInspector(args.target);
      },
    },
  };

  controller = createHybridViewport(root, adapters);
  renderCurrent(false);

  function bindContextEvents(canvas) {
    if (contextListenersBound) return;
    contextListenersBound = true;
    canvas.addEventListener('webglcontextlost', () => {
      if (destroyed) return;
      runtimeBlock = 'LAFEA_HYBRID_RESULT_WEBGL_CONTEXT_LOST';
      renderBlocked();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      if (destroyed) return;
      runtimeBlock = 'LAFEA_HYBRID_RESULT_RERENDER_REQUIRED';
      renderBlocked();
    });
  }

  function renderCurrent(retryRuntime) {
    if (destroyed) throw contractError('LAFEA_HYBRID_RESULT_VIEWPORT_DESTROYED');
    if (retryRuntime) runtimeBlock = null;
    if (model.status === 'BLOCKED' || runtimeBlock !== null) return renderBlocked();
    status = 'READY';
    blockingReasons = [];
    try {
      renderer = controller.render(readyHybridInput(model, selection));
      if (renderer !== 'THREE_WEBGL') {
        throw contractError('LAFEA_HYBRID_RESULT_WEBGL_RENDERER_REQUIRED');
      }
      updateRootState();
      return snapshot();
    } catch (error) {
      if (error?.code === 'LAFEA_WEBGL_REQUIRED_FOR_DISPLAY_SIZE') {
        runtimeBlock = 'LAFEA_HYBRID_RESULT_WEBGL_UNAVAILABLE';
        return renderBlocked();
      }
      throw error;
    }
  }

  function renderBlocked() {
    status = 'BLOCKED';
    blockingReasons = uniqueReasons([
      ...model.blockingReasons,
      ...(runtimeBlock ? [runtimeBlock] : []),
    ]);
    renderer = controller.render(blockedHybridInput(model, selection));
    if (renderer !== 'SVG') {
      throw contractError('LAFEA_HYBRID_RESULT_BLOCKED_RENDERER_INVALID');
    }
    updateRootState();
    return snapshot();
  }

  function selectSource(sourceEntityId) {
    selection = validateSelection({
      sceneRevision: model.sceneRevision,
      sourceEntityId,
      meshEntityId: null,
      entityRole: 'SOURCE',
    }, model.sourceScene);
    const result = renderCurrent(false);
    input.onSelectionChange?.(selection);
    return result;
  }

  function clearSelection() {
    selection = emptySelection(model.sceneRevision);
    const result = renderCurrent(false);
    input.onSelectionChange?.(selection);
    return result;
  }

  function appendResultInspector(target) {
    const documentRef = target.ownerDocument;
    const summary = documentRef.createElement('p');
    summary.dataset.role = 'lafea-result-display-status';
    summary.textContent = status === 'READY'
      ? `Result display READY: ${model.resultRequest?.renderPacket.field.fieldId ?? 'UNKNOWN_FIELD'}`
      : 'Result display BLOCKED';
    target.append(summary);
    if (blockingReasons.length) {
      const list = documentRef.createElement('ul');
      list.dataset.role = 'lafea-result-blocking-reasons';
      blockingReasons.forEach((reason) => {
        const item = documentRef.createElement('li');
        item.textContent = reason;
        list.append(item);
      });
      target.append(list);
    }
  }

  function updateRootState() {
    root.dataset.resultStatus = status;
    root.dataset.resultRenderer = renderer;
    root.dataset.resultBlockingReasonCount = String(blockingReasons.length);
    if (status === 'READY') {
      root.dataset.resultFieldId = model.resultRequest.renderPacket.field.fieldId;
      delete root.dataset.resultBlockingReasons;
    } else {
      delete root.dataset.resultFieldId;
      root.dataset.resultBlockingReasons = blockingReasons.join(',');
    }
  }

  function snapshot() {
    return deepFreeze({
      schema: LAFEA_HYBRID_RESULT_VIEWPORT_SCHEMA,
      stageId: model.stageId,
      sceneRevision: model.sceneRevision,
      status,
      renderer,
      blockingReasons: [...blockingReasons],
      selection,
      renderResult,
    });
  }

  return Object.freeze({
    schema: LAFEA_HYBRID_RESULT_VIEWPORT_SCHEMA,
    model,
    getState: snapshot,
    getSelection: () => selection,
    selectSource,
    clearSelection,
    refresh: () => renderCurrent(true),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      controller.destroy();
      root.dataset.resultStatus = 'DESTROYED';
      delete root.dataset.resultRenderer;
      delete root.dataset.resultFieldId;
    },
  });
}

function readyHybridInput(model, selection) {
  return {
    scene: model.sourceScene,
    viewport: model.resultRequest.viewport,
    mode: 'STRESS_CONTOUR',
    displayedPrimitiveCount: model.resultRequest.displayedPrimitiveCount,
    policy: LAFEA_HYBRID_RESULT_RENDER_POLICY,
    renderPacket: model.resultRequest.renderPacket,
    selection,
  };
}

function blockedHybridInput(model, selection) {
  return {
    scene: model.sourceScene,
    viewport: model.viewport,
    mode: 'PRINT_SOURCE',
    displayedPrimitiveCount: model.sourceScene.sourcePrimitives.length,
    policy: LAFEA_HYBRID_RESULT_RENDER_POLICY,
    renderPacket: null,
    selection,
  };
}

function validateIntake(value) {
  assertExactKeys(value, INTAKE_KEYS, 'LAFEA_HYBRID_RESULT_INTAKE_KEYS_INVALID');
  if (value.schema !== LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA
    || !LAFEA_RENDER_EVIDENCE_INTAKE_STATUSES.includes(value.status)
    || !Array.isArray(value.blockingReasons)) {
    throw contractError('LAFEA_HYBRID_RESULT_INTAKE_INVALID');
  }
  if (value.status === 'READY') {
    if (value.renderEvidenceReady !== true || value.packet === null
      || value.blockingReasons.length !== 0) {
      throw contractError('LAFEA_HYBRID_RESULT_READY_INTAKE_INVALID');
    }
  } else if (value.renderEvidenceReady !== false || value.packet !== null
    || value.blockingReasons.length === 0
    || value.blockingReasons.some((reason) => typeof reason !== 'string' || !reason)) {
    throw contractError('LAFEA_HYBRID_RESULT_BLOCKED_INTAKE_INVALID');
  }
  return value;
}

function validateSelection(value, scene) {
  assertExactKeys(value, SELECTION_KEYS, 'LAFEA_HYBRID_RESULT_SELECTION_KEYS_INVALID');
  if (value.sceneRevision !== scene.sceneRevision || value.meshEntityId !== null) {
    throw contractError('LAFEA_HYBRID_RESULT_SELECTION_IDENTITY_INVALID');
  }
  if (value.sourceEntityId === null) {
    if (value.entityRole !== null) {
      throw contractError('LAFEA_HYBRID_RESULT_EMPTY_SELECTION_INVALID');
    }
  } else if (value.entityRole !== 'SOURCE'
    || !scene.sourcePrimitives.some((row) => row.sourceEntityId === value.sourceEntityId)) {
    throw contractError('LAFEA_HYBRID_RESULT_SOURCE_SELECTION_INVALID');
  }
  return deepFreeze(structuredClone(value));
}

function validateSharedViewport(value) {
  requireSchema(value, SCHEMAS.viewport);
  assertExactKeys(value, VIEWPORT_KEYS, 'LAFEA_VIEWPORT_KEYS_INVALID');
  if (value.projection !== 'XY_ENGINEERING' || value.cameraMode !== 'ORTHOGRAPHIC'
    || !Array.isArray(value.clippingPlanes) || value.clippingPlanes.length !== 0) {
    throw contractError('LAFEA_HYBRID_RESULT_VIEWPORT_MODE_INVALID');
  }
  assertExactKeys(value.worldBounds, WORLD_BOUNDS_KEYS, 'LAFEA_HYBRID_RESULT_WORLD_BOUNDS_INVALID');
  for (const endpoint of ['minimum', 'maximum']) {
    assertExactKeys(value.worldBounds[endpoint], VECTOR_KEYS, 'LAFEA_HYBRID_RESULT_WORLD_VECTOR_INVALID');
    VECTOR_KEYS.forEach((axis) => requireFiniteNumber(
      value.worldBounds[endpoint][axis],
      `worldBounds.${endpoint}.${axis}`,
    ));
  }
  for (const matrix of ['viewMatrix', 'projectionMatrix']) {
    if (!Array.isArray(value[matrix]) || value[matrix].length !== 16
      || value[matrix].some((entry) => !Number.isFinite(entry))) {
      throw contractError('LAFEA_HYBRID_RESULT_MATRIX_INVALID', { matrix });
    }
  }
  for (const field of ['cssWidth', 'cssHeight', 'devicePixelRatio']) {
    requireFiniteNumber(value[field], field);
    if (value[field] <= 0) throw contractError('LAFEA_HYBRID_RESULT_VIEWPORT_SIZE_INVALID');
  }
  assertExactKeys(value.displayOptions, DISPLAY_KEYS, 'LAFEA_HYBRID_RESULT_DISPLAY_OPTIONS_INVALID');
  if (value.displayOptions.sourceAuthoring !== false
    || value.displayOptions.wireframe !== false
    || value.displayOptions.deformationScale !== 0) {
    throw contractError('LAFEA_HYBRID_RESULT_DISPLAY_AUTHORITY_INVALID');
  }
  return deepFreeze(structuredClone(value));
}

function sourceCoordinatesOutsideViewport(scene, viewport) {
  const bounds = viewport.worldBounds;
  const outside = scene.sourcePrimitives.some((primitive) => primitive.coordinates.some(
    (point) => point.x < bounds.minimum.x || point.x > bounds.maximum.x
      || point.y < bounds.minimum.y || point.y > bounds.maximum.y
      || point.z < bounds.minimum.z || point.z > bounds.maximum.z,
  ));
  return outside ? ['LAFEA_HYBRID_RESULT_SOURCE_OUTSIDE_VIEWPORT'] : [];
}

function emptySelection(sceneRevision) {
  return deepFreeze({
    sceneRevision,
    sourceEntityId: null,
    meshEntityId: null,
    entityRole: null,
  });
}

function uniqueReasons(reasons) {
  return [...new Set(reasons)];
}
