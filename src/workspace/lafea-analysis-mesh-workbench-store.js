/** Live-store adapter for atomic full analysis-mesh evidence custody. */
import {
  createLafeaAnalysisMeshCustodyController,
} from './lafea-analysis-mesh-custody-controller.js';
import {
  buildAnalysisMeshCustodyProjection,
} from './lafea-analysis-mesh-custody-projection.js';
import { validateLafeaAnalysisMeshEvidence } from './lafea-analysis-mesh-evidence-validator.js';

export function decorateLafeaAnalysisMeshWorkbenchStore(baseValue) {
  const base = requireBaseStore(baseValue);
  let baseState = base.getState();
  let suppressBasePublish = false;
  const listeners = new Set();
  const overlays = Object.fromEntries(
    Object.keys(baseState.stages).map((stageId) => [stageId, emptyOverlay()]),
  );
  const unsubscribeBase = base.subscribe((next) => {
    baseState = next;
    if (!suppressBasePublish) publish();
  });

  function combinedStage(stageId) {
    const stage = baseState.stages[stageId];
    if (!stage) throw storeError('LAFEA_ANALYSIS_MESH_STAGE_NOT_FOUND');
    const overlay = overlays[stageId] ?? emptyOverlay();
    const combined = { ...stage, stageId, ...overlay };
    return freeze({
      ...combined,
      analysisMeshCustodyProjection: buildAnalysisMeshCustodyProjection(
        combined,
        overlay.retainedAnalysisMeshEvidence,
      ),
    });
  }

  function deriveState() {
    return freeze({
      ...baseState,
      stages: Object.fromEntries(
        Object.keys(baseState.stages).map((stageId) => [
          stageId,
          combinedStage(stageId),
        ]),
      ),
    });
  }

  function publish() {
    const state = deriveState();
    for (const listener of listeners) {
      try { listener(state); } catch { /* one subscriber cannot block others */ }
    }
    return state;
  }

  function commitStageState(stageId, next, expectedVersion) {
    if (baseState.activeStageId !== stageId) {
      throw storeError('LAFEA_ANALYSIS_MESH_ACTIVE_STAGE_MISMATCH');
    }
    const currentOverlay = overlays[stageId] ?? emptyOverlay();
    if (currentOverlay.analysisMeshCustodyVersion !== expectedVersion) {
      throw storeError('LAFEA_ANALYSIS_MESH_CUSTODY_STATE_CHANGED');
    }
    const previous = combinedStage(stageId);
    const lifecycleChanged = JSON.stringify(previous.lifecycle)
      !== JSON.stringify(next.lifecycle);
    const nextOverlay = freeze({
      analysisMeshCustodyVersion: expectedVersion + 1,
      analysisMeshProfileHash: next.analysisMeshProfileHash ?? null,
      retainedAnalysisMeshEvidence: next.retainedAnalysisMeshEvidence ?? null,
      lastAnalysisMeshCustodyAction: next.lastAnalysisMeshCustodyAction ?? null,
    });

    suppressBasePublish = true;
    try {
      if (lifecycleChanged) {
        const evidence = nextOverlay.retainedAnalysisMeshEvidence;
        if (!evidence) {
          throw storeError('LAFEA_ANALYSIS_MESH_COMMIT_EVIDENCE_REQUIRED');
        }
        const returned = base.registerLifecycleArtifact(
          evidence.artifactRecord,
          evidence.registrationId,
        );
        baseState = returned ?? base.getState();
        if (baseState.status === 'FAILED') {
          throw storeError(
            baseState.diagnostics?.[0]?.code
              ?? 'LAFEA_ANALYSIS_MESH_ATOMIC_COMMIT_REJECTED',
          );
        }
      }
      overlays[stageId] = nextOverlay;
    } finally {
      suppressBasePublish = false;
    }
  }

  const custody = createLafeaAnalysisMeshCustodyController({
    getActiveStageId: () => baseState.activeStageId,
    readStageState: combinedStage,
    commitStageState,
    publish,
  });

  function delegate(method, args, after = null) {
    suppressBasePublish = true;
    try {
      const returned = base[method](...args);
      baseState = returned ?? base.getState();
      after?.();
    } finally {
      suppressBasePublish = false;
    }
    return publish();
  }

  function applyLifecycleEvent(event) {
    const stageId = baseState.activeStageId;
    return delegate('applyLifecycleEvent', [event], () => {
      if (baseState.status === 'FAILED'
        || event?.changeClass !== 'ANALYSIS_MESH_PROFILE'
        || typeof event.profileHash !== 'string') return;
      const previous = overlays[stageId] ?? emptyOverlay();
      overlays[stageId] = freeze({
        ...previous,
        analysisMeshCustodyVersion:
          previous.analysisMeshCustodyVersion + 1,
        analysisMeshProfileHash: event.profileHash,
        lastAnalysisMeshCustodyAction: 'BIND_ANALYSIS_MESH_PROFILE',
      });
    });
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('LAFEA subscriber must be a function.');
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({
    selectStage: (stageId) => delegate('selectStage', [stageId]),
    importDocument: (...args) => delegate('importDocument', args),
    applyEditCommand: (...args) => delegate('applyEditCommand', args),
    setScalar: (...args) => delegate('setScalar', args),
    replaceDocument: (...args) => delegate('replaceDocument', args),
    moveNode: (...args) => delegate('moveNode', args),
    reportEditError: (...args) => delegate('reportEditError', args),
    run: (...args) => delegate('run', args),
    undo: (...args) => delegate('undo', args),
    redo: (...args) => delegate('redo', args),
    exportDocument: (...args) => base.exportDocument(...args),
    initializeLifecycle: (...args) => delegate('initializeLifecycle', args),
    applyLifecycleEvent,
    registerLifecycleArtifact: (...args) => delegate('registerLifecycleArtifact', args),
    revalidateLifecycleBinding: (...args) => delegate('revalidateLifecycleBinding', args),
    exportLifecycle: (...args) => base.exportLifecycle(...args),
    validateLafeaAnalysisMeshEvidence,
    registerAnalysisMeshEvidence: custody.registerAnalysisMeshEvidence,
    selectRetainedAnalysisMeshEvidence: custody.selectRetainedAnalysisMeshEvidence,
    buildAnalysisMeshCustodyProjection,
    exportAnalysisMeshEvidence: custody.exportAnalysisMeshEvidence,
    recoverAnalysisMeshEvidence: custody.recoverAnalysisMeshEvidence,
    subscribe,
    getState: deriveState,
    destroy: () => {
      unsubscribeBase();
      base.destroy();
      listeners.clear();
    },
  });
}

function emptyOverlay() {
  return freeze({
    analysisMeshCustodyVersion: 0,
    analysisMeshProfileHash: null,
    retainedAnalysisMeshEvidence: null,
    lastAnalysisMeshCustodyAction: null,
  });
}

function requireBaseStore(value) {
  const methods = [
    'getState', 'subscribe', 'registerLifecycleArtifact',
    'applyLifecycleEvent', 'destroy',
  ];
  if (!value || typeof value !== 'object'
    || methods.some((name) => typeof value[name] !== 'function')) {
    throw storeError('LAFEA_ANALYSIS_MESH_BASE_STORE_INVALID');
  }
  return value;
}

function storeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
