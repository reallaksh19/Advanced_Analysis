/**
 * Live LAFEA workbench adapter for source authoring and qualified results.
 *
 * Blocked or absent render evidence retains the editable U4B SVG viewport.
 * READY U4D evidence is delegated to the isolated U4F WebGL coordinator.
 */
import {
  createLafeaSourceWorkbenchViewportModel,
  mountLafeaSourceWorkbenchViewportModel,
} from './lafea-source-workbench-viewport.js';
import { evaluateLafeaRenderEvidenceIntake } from './lafea-render-evidence-intake.js';
import { mountLafeaHybridResultViewport } from './lafea-hybrid-result-viewport-public.js';

export const LAFEA_LIVE_WORKBENCH_VIEWPORT_SCHEMA =
  'lafea-live-workbench-viewport/v1';
export const LAFEA_LIVE_WORKBENCH_VIEWPORT_MODES = Object.freeze([
  'SOURCE_AUTHORING',
  'QUALIFIED_RESULT',
]);

export function createLafeaLiveWorkbenchViewportModel(input) {
  if (!isRecord(input)) throw liveViewportError('LAFEA_LIVE_VIEWPORT_INPUT_REQUIRED');
  const sourceSelection = projectSelectionForSource(
    input.selection ?? null,
    input.sceneRevision,
  );
  const sourceModel = createLafeaSourceWorkbenchViewportModel(
    sourceInput(input, sourceSelection),
  );
  const intake = evaluateLafeaRenderEvidenceIntake({
    stageId: sourceModel.registryEntry.stageId,
    sceneRevision: sourceModel.scene.sceneRevision,
    packet: input.renderPacket ?? null,
    lifecycle: input.lifecycle ?? null,
    lifecycleBinding: input.lifecycleBinding ?? null,
  });
  const mode = intake.status === 'READY'
    ? 'QUALIFIED_RESULT'
    : 'SOURCE_AUTHORING';
  return Object.freeze({
    schema: LAFEA_LIVE_WORKBENCH_VIEWPORT_SCHEMA,
    mode,
    sourceModel,
    intake,
    resultViewport: intake.status === 'READY'
      ? resultViewport(sourceModel.viewport, intake.packet)
      : null,
  });
}

export function mountLafeaLiveWorkbenchViewport(root, input) {
  if (!root?.ownerDocument) throw liveViewportError('LAFEA_LIVE_VIEWPORT_ROOT_REQUIRED');
  const model = createLafeaLiveWorkbenchViewportModel(input);
  const viewportHost = root.ownerDocument.createElement('div');
  viewportHost.dataset.role = 'lafea-live-workbench-viewport-host';
  root.replaceChildren(viewportHost);

  let mounted;
  let blockedStatus = null;
  let destroyed = false;

  if (model.mode === 'QUALIFIED_RESULT') {
    mounted = mountLafeaHybridResultViewport(viewportHost, {
      stageId: model.sourceModel.registryEntry.stageId,
      sourceScene: model.sourceModel.scene,
      intake: model.intake,
      viewport: model.resultViewport,
      selection: input.selection ?? null,
      THREE: input.THREE ?? null,
      onSelectionChange: input.onSelectionChange,
    });
  } else {
    mounted = mountLafeaSourceWorkbenchViewportModel(
      viewportHost,
      model.sourceModel,
      sourceInput(input, model.sourceModel.request.selection),
    );
    blockedStatus = renderBlockedStatus(root, model.intake.blockingReasons);
  }
  root.dataset.liveViewportMode = model.mode;

  function currentState() {
    if (model.mode === 'QUALIFIED_RESULT') {
      const state = mounted.getState();
      return freeze({
        schema: LAFEA_LIVE_WORKBENCH_VIEWPORT_SCHEMA,
        mode: model.mode,
        stageId: state.stageId,
        sceneRevision: state.sceneRevision,
        status: state.status,
        renderer: state.renderer,
        blockingReasons: [...state.blockingReasons],
        selection: state.selection,
      });
    }
    return freeze({
      schema: LAFEA_LIVE_WORKBENCH_VIEWPORT_SCHEMA,
      mode: model.mode,
      stageId: model.sourceModel.registryEntry.stageId,
      sceneRevision: model.sourceModel.scene.sceneRevision,
      status: 'BLOCKED',
      renderer: mounted.getRenderer(),
      blockingReasons: [...model.intake.blockingReasons],
      selection: mounted.getSelection(),
    });
  }

  function refresh() {
    if (destroyed) throw liveViewportError('LAFEA_LIVE_VIEWPORT_DESTROYED');
    if (model.mode === 'QUALIFIED_RESULT') mounted.refresh();
    return currentState();
  }

  return Object.freeze({
    schema: LAFEA_LIVE_WORKBENCH_VIEWPORT_SCHEMA,
    scene: model.sourceModel.scene,
    getMode: () => model.mode,
    getState: currentState,
    getSelection: mounted.getSelection,
    selectSource: mounted.selectSource,
    clearSelection: mounted.clearSelection,
    refresh,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      mounted.destroy();
      blockedStatus?.remove?.();
      root.replaceChildren();
      root.dataset.liveViewportMode = 'DESTROYED';
    },
  });
}

function sourceInput(input, selection = input.selection ?? null) {
  return {
    stageId: input.stageId,
    document: input.document,
    lifecycle: input.lifecycle ?? null,
    lifecycleBinding: input.lifecycleBinding ?? null,
    sceneRevision: input.sceneRevision,
    selection,
    cssWidth: input.cssWidth,
    cssHeight: input.cssHeight,
    devicePixelRatio: input.devicePixelRatio,
    paddingRatio: input.paddingRatio,
    policy: input.policy,
    onMoveNode: input.onMoveNode,
    onSelectionChange: input.onSelectionChange,
  };
}

function projectSelectionForSource(value, sceneRevision) {
  if (!isRecord(value) || value.sourceEntityId === null
    || value.meshEntityId === null || value.sceneRevision !== sceneRevision) {
    return value;
  }
  return {
    sceneRevision,
    sourceEntityId: value.sourceEntityId,
    meshEntityId: null,
    entityRole: 'SOURCE',
  };
}

function resultViewport(sourceViewport, packet) {
  const value = structuredClone(sourceViewport);
  value.displayOptions = {
    sourceAuthoring: false,
    wireframe: false,
    fieldBounds: structuredClone(packet.field.bounds),
    colorMapId: packet.field.colorMapId,
    deformationScale: 0,
  };
  return freeze(value);
}

function renderBlockedStatus(root, reasons) {
  const documentRef = root.ownerDocument;
  const section = documentRef.createElement('section');
  section.dataset.role = 'lafea-live-result-blocked-status';
  section.setAttribute('aria-live', 'polite');
  const title = documentRef.createElement('p');
  title.textContent = 'Qualified result display is BLOCKED; source authoring remains active.';
  const list = documentRef.createElement('ul');
  reasons.forEach((reason) => {
    const item = documentRef.createElement('li');
    item.textContent = reason;
    list.append(item);
  });
  section.append(title, list);
  root.append(section);
  return section;
}

function freeze(value) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)
    || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function liveViewportError(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}
