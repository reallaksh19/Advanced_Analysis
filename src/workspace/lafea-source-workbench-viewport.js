/**
 * Live workbench binding for source authoring plus retained mesh inspection.
 *
 * SVG remains the only renderer authorized by this package. Retained analysis
 * mesh evidence is drawn read-only and never promoted into source scene identity.
 */
import { createAccessibleInspector } from './lafea-canvas/accessible-inspector.js';
import { createHybridViewport } from './lafea-canvas/hybrid-viewport.js';
import {
  focusLafeaRetainedMeshElement,
} from './lafea-canvas/retained-mesh-overlay.js';
import { renderLafeaSourceOverlay } from './lafea-canvas/source-overlay-adapter.js';
import {
  createLafeaSourceEngineeringScene,
  createLafeaSourceRenderRequest,
  createLafeaSourceViewportState,
} from './lafea-engineering-scene.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';

export const LAFEA_WORKBENCH_SOURCE_VIEWPORT_SCHEMA = 'lafea-workbench-source-viewport/v1';

export const LAFEA_WORKBENCH_SOURCE_RENDER_POLICY = deepFreeze({
  schema: 'LafeaRenderPolicy.v1',
  policyId: 'LAFEA-WORKBENCH-SOURCE-AUTHORING-V1',
  sourceRevision: 1,
  svgMeshLimit: { source: 'U4B_SOURCE_AUTHORING_SVG_ONLY', value: 0 },
  svgFallbackLimit: { source: 'U4B_SOURCE_AUTHORING_SVG_ONLY', value: 0 },
  canvas2dFallbackLimit: { source: 'U4B_SOURCE_AUTHORING_SVG_ONLY', value: 0 },
  allowedFallbackModes: [],
  semanticHash: 'sha256:c14ef58e6431f9f9a312087e4140fd0e28936311bf84ddd22078a56687be53f8',
});

export function createLafeaSourceWorkbenchViewportModel(input) {
  if (!isRecord(input)) throw new TypeError('LAFEA_SOURCE_WORKBENCH_VIEWPORT_INPUT_REQUIRED');
  const registryEntry = requireLafeaStageRegistryEntry(input.stageId);
  const scene = createLafeaSourceEngineeringScene({
    stageId: registryEntry.stageId,
    document: input.document,
    lifecycle: input.lifecycle ?? null,
    lifecycleBinding: input.lifecycleBinding ?? null,
    sceneRevision: requireSceneRevision(input.sceneRevision),
  });
  const viewport = createLafeaSourceViewportState(scene, {
    cssWidth: input.cssWidth ?? 760,
    cssHeight: input.cssHeight ?? 440,
    devicePixelRatio: input.devicePixelRatio ?? 1,
    paddingRatio: input.paddingRatio ?? 0.05,
  });
  const request = createLafeaSourceRenderRequest({
    scene,
    viewport,
    policy: input.policy ?? LAFEA_WORKBENCH_SOURCE_RENDER_POLICY,
    selection: input.selection ?? emptySelection(scene.sceneRevision),
  });
  return Object.freeze({
    schema: LAFEA_WORKBENCH_SOURCE_VIEWPORT_SCHEMA,
    registryEntry,
    scene,
    viewport,
    request,
  });
}

export function mountLafeaSourceWorkbenchViewport(root, input) {
  const model = createLafeaSourceWorkbenchViewportModel(input);
  return mountLafeaSourceWorkbenchViewportModel(root, model, input);
}

export function mountLafeaSourceWorkbenchViewportModel(root, model, input = {}) {
  if (!root?.ownerDocument) throw new TypeError('LAFEA_SOURCE_WORKBENCH_VIEWPORT_ROOT_REQUIRED');
  if (model?.schema !== LAFEA_WORKBENCH_SOURCE_VIEWPORT_SCHEMA
    || !model.registryEntry || !model.scene || !model.viewport || !model.request) {
    throw new TypeError('LAFEA_SOURCE_WORKBENCH_VIEWPORT_MODEL_INVALID');
  }
  root.style.minHeight = `${model.viewport.cssHeight}px`;
  root.style.height = `${model.viewport.cssHeight}px`;
  const inspector = createAccessibleInspector();
  let controller = null;
  let renderer = null;
  let selection = model.request.selection;
  let focusedMeshElementId = input.focusedMeshElementId ?? null;
  let destroyed = false;

  const adapters = {
    svg: {
      render({ target, scene, viewport, selection: visibleSelection, authoringEnabled }) {
        renderLafeaSourceOverlay({
          target,
          scene,
          viewport,
          registryEntry: model.registryEntry,
          selection: visibleSelection,
          editable: authoringEnabled
            && model.registryEntry.previewSource.editable
            && typeof input.onMoveNode === 'function',
          onMoveNode: input.onMoveNode,
          onSelectSource: selectSource,
          retainedMeshEvidence: input.retainedMeshEvidence ?? null,
          analysisMeshCustodyState: input.analysisMeshCustodyState ?? null,
          focusedMeshElementId,
          onFocusMeshElement: focusRetainedMeshElement,
        });
      },
      dispose() {},
    },
    webgl: {
      render() { throw new TypeError('LAFEA_U4B_WEBGL_RENDER_FORBIDDEN'); },
      isAvailable: () => false,
      setVisible(visible) {
        if (visible) throw new TypeError('LAFEA_U4B_WEBGL_VISIBILITY_FORBIDDEN');
      },
      clearCurrentScene() {},
      dispose() {},
    },
    inspector,
  };

  controller = createHybridViewport(root, adapters);
  renderer = controller.render(model.request);
  if (renderer !== 'SVG') throw new TypeError('LAFEA_U4B_SOURCE_RENDERER_MUST_BE_SVG');

  function renderSelection(nextSelection) {
    if (destroyed) throw new TypeError('LAFEA_SOURCE_WORKBENCH_VIEWPORT_DESTROYED');
    const request = createLafeaSourceRenderRequest({
      scene: model.scene,
      viewport: model.viewport,
      policy: model.request.policy,
      selection: nextSelection,
    });
    selection = request.selection;
    renderer = controller.render(request);
    if (renderer !== 'SVG') throw new TypeError('LAFEA_U4B_SOURCE_RENDERER_MUST_BE_SVG');
    input.onSelectionChange?.(selection);
    return selection;
  }

  function selectSource(sourceEntityId) {
    return renderSelection({
      sceneRevision: model.scene.sceneRevision,
      sourceEntityId,
      meshEntityId: null,
      entityRole: 'SOURCE',
    });
  }

  function clearSelection() {
    return renderSelection(emptySelection(model.scene.sceneRevision));
  }

  function focusRetainedMeshElement(elementId) {
    if (destroyed) throw new TypeError('LAFEA_SOURCE_WORKBENCH_VIEWPORT_DESTROYED');
    focusedMeshElementId = elementId;
    const found = focusLafeaRetainedMeshElement(root, elementId);
    input.onFocusMeshElement?.(elementId, found);
    return found;
  }

  return Object.freeze({
    schema: LAFEA_WORKBENCH_SOURCE_VIEWPORT_SCHEMA,
    scene: model.scene,
    viewport: model.viewport,
    request: model.request,
    getRenderer: () => renderer,
    getSelection: () => selection,
    selectSource,
    clearSelection,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      controller.destroy();
    },
  });
}

function emptySelection(sceneRevision) {
  return Object.freeze({
    sceneRevision,
    sourceEntityId: null,
    meshEntityId: null,
    entityRole: null,
  });
}

function requireSceneRevision(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError('LAFEA_SOURCE_SCENE_REVISION_INVALID');
  }
  return value;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
