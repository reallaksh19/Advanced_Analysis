/**
 * U3 lifecycle-aware facade over the U2 immutable LAFEA workbench store.
 *
 * The facade binds producer-owned lifecycle evidence to an exact editor
 * document revision. The U2 FNV document digest remains a revision token only;
 * it is never used as an engineering source/model/mesh/result hash.
 */
import { lafeaDocumentDigest } from './lafea-edit-command.js';
import {
  applyLafeaLifecycleEvent,
  createLafeaLifecycle,
  lafeaLifecycleReadiness,
  registerLafeaArtifact,
} from './lafea-lifecycle.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';
import { createLafeaWorkbenchStore as createBaseLafeaWorkbenchStore } from './lafea-workbench-store.js';

export const LAFEA_WORKBENCH_STATE_SCHEMA = 'lafea-workbench-state/v2';
export const LAFEA_LIFECYCLE_BINDING_SCHEMA = 'lafea-lifecycle-binding/v1';
export const LAFEA_LIFECYCLE_BINDING_STATUSES = Object.freeze([
  'UNINITIALIZED',
  'CURRENT',
  'STALE_DOCUMENT_REVISION',
  'REVALIDATION_REQUIRED',
]);

const SOURCE_CHANGE_CLASSES = Object.freeze(new Set([
  'MATERIAL_PROPERTY', 'GEOMETRY', 'LOAD_OR_BC', 'MODEL_METADATA',
]));
const DISPLAY_CHANGE_CLASSES = Object.freeze(new Set([
  'DISPLAY_MESH_DENSITY', 'CONTOUR_PALETTE', 'REPORT_RENDER_PROFILE',
]));

/** Create the public lifecycle-aware LAFEA workbench store. */
export function createLafeaWorkbenchStore(options) {
  const configuration = options ?? {};
  const base = createBaseLafeaWorkbenchStore(configuration);
  let baseState = base.getState();
  let overlayStatus = null;
  let overlayDiagnostics = null;
  let lifecycleSequence = 0;
  let suppressBasePublish = false;
  const listeners = new Set();
  const lifecycleByStage = Object.fromEntries(
    Object.entries(baseState.stages).map(([stageId, stage]) => [
      stageId,
      initialOverlay(stage.document),
    ]),
  );

  if (typeof configuration.initialSourceHash === 'string') {
    const stageId = baseState.activeStageId;
    const document = requireStageDocument(baseState, stageId);
    lifecycleByStage[stageId] = freeze({
      lifecycle: createLafeaLifecycle(stageId, configuration.initialSourceHash),
      binding: currentBinding(document, 'INITIAL_SOURCE_AUTHORITY'),
      lastLifecycleAction: action('INITIALIZE', 'INITIAL_SOURCE_AUTHORITY', null),
    });
  }

  const unsubscribeBase = base.subscribe((next) => {
    baseState = next;
    if (!suppressBasePublish) publish();
  });

  function publish() {
    const state = deriveState();
    listeners.forEach((listener) => listener(state));
    return state;
  }

  function deriveState() {
    const stages = Object.fromEntries(Object.entries(baseState.stages).map(([stageId, stage]) => {
      const overlay = lifecycleByStage[stageId] ?? initialOverlay(stage.document);
      return [stageId, freeze({
        ...stage,
        lifecycle: overlay.lifecycle,
        lifecycleBinding: overlay.binding,
        lifecycleReadiness: projectedReadiness(stageId, overlay.lifecycle, overlay.binding),
        lastLifecycleAction: overlay.lastLifecycleAction,
      })];
    }));
    return freeze({
      ...baseState,
      schema: LAFEA_WORKBENCH_STATE_SCHEMA,
      stages,
      status: overlayStatus ?? baseState.status,
      diagnostics: overlayDiagnostics ?? baseState.diagnostics,
    });
  }

  function mutateBase(originRef, operation, sourceHash = null) {
    const previous = baseState;
    suppressBasePublish = true;
    try {
      baseState = operation();
    } finally {
      suppressBasePublish = false;
    }
    updateBindingsAfterDocumentTransition(previous, baseState, originRef);
    if (sourceHash !== null && baseState.status !== 'FAILED') {
      const stageId = baseState.activeStageId;
      const document = requireStageDocument(baseState, stageId);
      lifecycleByStage[stageId] = freeze({
        lifecycle: createLafeaLifecycle(stageId, sourceHash),
        binding: currentBinding(document, originRef),
        lastLifecycleAction: action('INITIALIZE', originRef, null),
      });
    }
    clearOverlayMessage();
    return publish();
  }

  function updateBindingsAfterDocumentTransition(previous, next, originRef) {
    for (const stageId of Object.keys(next.stages)) {
      const beforeDocument = previous.stages[stageId]?.document ?? null;
      const afterDocument = next.stages[stageId]?.document ?? null;
      if (safeDocumentDigest(beforeDocument) === safeDocumentDigest(afterDocument)) continue;
      const overlay = lifecycleByStage[stageId] ?? initialOverlay(beforeDocument);
      lifecycleByStage[stageId] = freeze({
        ...overlay,
        binding: transitionedBinding(overlay, afterDocument, originRef),
        lastLifecycleAction: action('DOCUMENT_TRANSITION', originRef, null),
      });
    }
  }

  function requireLifecycleOverlay(stageId) {
    requireLafeaStageRegistryEntry(stageId);
    const overlay = lifecycleByStage[stageId];
    if (!overlay?.lifecycle) {
      throw storeError(
        'LAFEA_LIFECYCLE_NOT_INITIALIZED',
        'Initialize lifecycle with an opaque source hash before registering evidence.',
      );
    }
    return overlay;
  }

  function initializeLifecycle(sourceHash, originRef = 'EXTERNAL_SOURCE_AUTHORITY') {
    try {
      const stageId = baseState.activeStageId;
      const document = requireStageDocument(baseState, stageId);
      lifecycleByStage[stageId] = freeze({
        lifecycle: createLafeaLifecycle(stageId, sourceHash),
        binding: currentBinding(document, originRef),
        lastLifecycleAction: action('INITIALIZE', originRef, null),
      });
      successfulLifecycleAction();
    } catch (error) {
      failedLifecycleAction(error, 'LAFEA_LIFECYCLE_INITIALIZATION_REJECTED');
    }
    return publish();
  }

  function applyLifecycleEvent(event) {
    try {
      const stageId = baseState.activeStageId;
      const overlay = requireLifecycleOverlay(stageId);
      if (event?.stageId !== stageId) {
        throw storeError('LAFEA_LIFECYCLE_STAGE_MISMATCH', `Active stage ${stageId} cannot apply a ${event?.stageId ?? 'missing'} lifecycle event.`);
      }
      if (!SOURCE_CHANGE_CLASSES.has(event.changeClass) && !DISPLAY_CHANGE_CLASSES.has(event.changeClass)) {
        requireCurrentBinding(overlay.binding);
      }
      const lifecycle = applyLafeaLifecycleEvent(overlay.lifecycle, event);
      const binding = SOURCE_CHANGE_CLASSES.has(event.changeClass)
        ? currentBinding(requireStageDocument(baseState, stageId), event.originRef)
        : overlay.binding;
      lifecycleByStage[stageId] = freeze({
        lifecycle,
        binding,
        lastLifecycleAction: action('EVENT', event.originRef, event.eventId),
      });
      successfulLifecycleAction();
    } catch (error) {
      failedLifecycleAction(error, 'LAFEA_LIFECYCLE_EVENT_REJECTED');
    }
    return publish();
  }

  function registerLifecycleArtifact(record, registrationId) {
    try {
      const stageId = baseState.activeStageId;
      const overlay = requireLifecycleOverlay(stageId);
      requireCurrentBinding(overlay.binding);
      const lifecycle = registerLafeaArtifact(overlay.lifecycle, record, registrationId);
      lifecycleByStage[stageId] = freeze({
        lifecycle,
        binding: overlay.binding,
        lastLifecycleAction: action(
          'REGISTER_ARTIFACT',
          record?.producerRef ?? 'UNKNOWN_PRODUCER',
          registrationId,
        ),
      });
      successfulLifecycleAction();
    } catch (error) {
      failedLifecycleAction(error, 'LAFEA_LIFECYCLE_REGISTRATION_REJECTED');
    }
    return publish();
  }

  function revalidateLifecycleBinding(sourceHash, originRef = 'EXTERNAL_REVALIDATION') {
    try {
      const stageId = baseState.activeStageId;
      const overlay = requireLifecycleOverlay(stageId);
      const document = requireStageDocument(baseState, stageId);
      if (overlay.lifecycle.source.sourceHash !== sourceHash) {
        throw storeError(
          'LAFEA_LIFECYCLE_SOURCE_HASH_MISMATCH',
          'Revalidation source hash does not match the retained lifecycle source.',
        );
      }
      const digest = lafeaDocumentDigest(document);
      if (digest !== overlay.binding.boundDocumentDigest) {
        throw storeError(
          'LAFEA_LIFECYCLE_DOCUMENT_REVISION_MISMATCH',
          'The current document does not match the editor revision bound to this lifecycle.',
        );
      }
      lifecycleByStage[stageId] = freeze({
        ...overlay,
        binding: currentBinding(document, originRef),
        lastLifecycleAction: action('REVALIDATE_BINDING', originRef, null),
      });
      successfulLifecycleAction();
    } catch (error) {
      failedLifecycleAction(error, 'LAFEA_LIFECYCLE_REVALIDATION_REJECTED');
    }
    return publish();
  }

  function exportLifecycle() {
    const stageId = baseState.activeStageId;
    const overlay = lifecycleByStage[stageId] ?? initialOverlay(baseState.stages[stageId].document);
    return freeze({
      schema: 'lafea-workbench-lifecycle-export/v1',
      stageId,
      lifecycle: overlay.lifecycle,
      binding: overlay.binding,
      readiness: projectedReadiness(stageId, overlay.lifecycle, overlay.binding),
    });
  }

  function action(actionName, originRef, referenceId) {
    lifecycleSequence += 1;
    return freeze({
      schema: 'lafea-workbench-lifecycle-action/v1',
      sequence: lifecycleSequence,
      action: actionName,
      originRef,
      referenceId,
    });
  }

  function successfulLifecycleAction() {
    overlayStatus = 'READY';
    overlayDiagnostics = [];
  }

  function failedLifecycleAction(error, fallbackCode) {
    overlayStatus = 'FAILED';
    overlayDiagnostics = [freeze({
      severity: 'ERROR',
      code: typeof error?.code === 'string' ? error.code : fallbackCode,
      path: typeof error?.path === 'string' ? error.path : 'lifecycle',
      entityId: typeof error?.entityId === 'string' ? error.entityId : null,
      message: error instanceof Error ? error.message : 'Unknown LAFEA lifecycle failure.',
    })];
  }

  function clearOverlayMessage() {
    overlayStatus = null;
    overlayDiagnostics = null;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('LAFEA subscriber must be a function.');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({
    selectStage: (stageId) => mutateBase('SELECT_STAGE', () => base.selectStage(stageId)),
    importDocument: (value, stageId, sourceHash = null) => mutateBase(
      'IMPORT_DOCUMENT',
      () => base.importDocument(value, stageId),
      sourceHash,
    ),
    applyEditCommand: (command) => mutateBase(
      command?.commandId ?? 'APPLY_EDIT_COMMAND',
      () => base.applyEditCommand(command),
    ),
    setScalar: (descriptorId, entityId, rawText, surface) => mutateBase(
      `SET_SCALAR:${descriptorId}`,
      () => base.setScalar(descriptorId, entityId, rawText, surface),
    ),
    replaceDocument: (value, surface) => mutateBase(
      'REPLACE_DOCUMENT',
      () => base.replaceDocument(value, surface),
    ),
    moveNode: (path, nodeId, x, y) => mutateBase(
      `MOVE_NODE:${nodeId}`,
      () => base.moveNode(path, nodeId, x, y),
    ),
    reportEditError: (path, entityId, error) => mutateBase(
      'REPORT_EDIT_ERROR',
      () => base.reportEditError(path, entityId, error),
    ),
    run: () => mutateBase('RUN_CALCULATION', () => base.run()),
    undo: () => mutateBase('UNDO', () => base.undo()),
    redo: () => mutateBase('REDO', () => base.redo()),
    exportDocument: () => base.exportDocument(),
    initializeLifecycle,
    applyLifecycleEvent,
    registerLifecycleArtifact,
    revalidateLifecycleBinding,
    exportLifecycle,
    subscribe,
    getState: deriveState,
    destroy: () => {
      unsubscribeBase();
      base.destroy();
      listeners.clear();
    },
  });
}

function initialOverlay(document) {
  return freeze({
    lifecycle: null,
    binding: uninitializedBinding(safeDocumentDigest(document), 'NO_SOURCE_AUTHORITY'),
    lastLifecycleAction: null,
  });
}

function currentBinding(document, originRef) {
  const digest = lafeaDocumentDigest(document);
  return freeze({
    schema: LAFEA_LIFECYCLE_BINDING_SCHEMA,
    status: 'CURRENT',
    boundDocumentDigest: digest,
    currentDocumentDigest: digest,
    reason: null,
    originRef,
  });
}

function uninitializedBinding(currentDocumentDigest, originRef) {
  return freeze({
    schema: LAFEA_LIFECYCLE_BINDING_SCHEMA,
    status: 'UNINITIALIZED',
    boundDocumentDigest: null,
    currentDocumentDigest,
    reason: 'OPAQUE_SOURCE_HASH_NOT_REGISTERED',
    originRef,
  });
}

function transitionedBinding(overlay, document, originRef) {
  const currentDocumentDigest = safeDocumentDigest(document);
  if (!overlay.lifecycle) return uninitializedBinding(currentDocumentDigest, originRef);
  const boundDocumentDigest = overlay.binding.boundDocumentDigest;
  const status = currentDocumentDigest === boundDocumentDigest
    ? 'REVALIDATION_REQUIRED'
    : 'STALE_DOCUMENT_REVISION';
  return freeze({
    schema: LAFEA_LIFECYCLE_BINDING_SCHEMA,
    status,
    boundDocumentDigest,
    currentDocumentDigest,
    reason: status === 'REVALIDATION_REQUIRED'
      ? 'EXACT_DOCUMENT_REVISION_RESTORED_REVALIDATION_REQUIRED'
      : 'DOCUMENT_REVISION_CHANGED_WITHOUT_SOURCE_HASH_EVENT',
    originRef,
  });
}

function projectedReadiness(stageId, lifecycle, binding) {
  if (!lifecycle) {
    return freeze({
      schema: 'lafea-workbench-lifecycle-readiness/v1',
      stageId,
      lifecycleInitialized: false,
      bindingStatus: binding.status,
      sourceCurrent: false,
      modelCurrent: false,
      meshGenerated: false,
      meshQualified: false,
      resultReady: false,
      codeReady: false,
      reportCurrent: false,
      blockingReasons: ['LIFECYCLE_NOT_INITIALIZED'],
    });
  }
  const base = lafeaLifecycleReadiness(lifecycle);
  if (binding.status === 'CURRENT') {
    return freeze({
      schema: 'lafea-workbench-lifecycle-readiness/v1',
      stageId,
      lifecycleInitialized: true,
      bindingStatus: binding.status,
      sourceCurrent: base.sourceCurrent,
      modelCurrent: base.modelCurrent,
      meshGenerated: base.meshGenerated,
      meshQualified: base.meshQualified,
      resultReady: base.resultReady,
      codeReady: base.codeReady,
      reportCurrent: base.reportCurrent,
      blockingReasons: [...base.blockingReasons],
    });
  }
  return freeze({
    schema: 'lafea-workbench-lifecycle-readiness/v1',
    stageId,
    lifecycleInitialized: true,
    bindingStatus: binding.status,
    sourceCurrent: false,
    modelCurrent: false,
    meshGenerated: base.meshGenerated,
    meshQualified: false,
    resultReady: false,
    codeReady: false,
    reportCurrent: false,
    blockingReasons: [
      `LIFECYCLE_SOURCE_BINDING_${binding.status}`,
      ...base.blockingReasons,
    ],
  });
}

function requireCurrentBinding(binding) {
  if (binding.status !== 'CURRENT') {
    throw storeError(
      'LAFEA_LIFECYCLE_BINDING_NOT_CURRENT',
      `Lifecycle source binding is ${binding.status}.`,
    );
  }
}

function requireStageDocument(state, stageId) {
  requireLafeaStageRegistryEntry(stageId);
  const document = state.stages[stageId]?.document;
  if (!document) throw storeError('LAFEA_DOCUMENT_REQUIRED', `Import a ${stageId} document before lifecycle operations.`);
  return document;
}

function safeDocumentDigest(document) {
  return document ? lafeaDocumentDigest(document) : null;
}

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
