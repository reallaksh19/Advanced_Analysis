/** Canonical LAFEA workbench orchestrator with one public publication boundary. */
import { createLafeaLifecycleProducerBatch } from './lafea-lifecycle-producers.js';
import {
  LAFEA_LIFECYCLE_BINDING_SCHEMA,
  LAFEA_LIFECYCLE_BINDING_STATUSES,
  LAFEA_WORKBENCH_STATE_SCHEMA,
  createLafeaWorkbenchStore as createRetainedStore,
} from './lafea-lifecycle-workbench-store-retained.js';
import {
  buildLafeaWorkbenchOrchestrationProjection,
} from './lafea-workbench-orchestration-projection.js';
import { createLafeaWorkbenchMeshState } from './lafea-workbench-mesh-state.js';
import { projectLafeaWorkbenchReadiness } from './lafea-workbench-readiness.js';
import { createLafeaWorkbenchSourceState } from './lafea-workbench-source-state.js';

export { LAFEA_LIFECYCLE_BINDING_SCHEMA, LAFEA_LIFECYCLE_BINDING_STATUSES };
export { LAFEA_WORKBENCH_STATE_SCHEMA };
export const LAFEA_CALCULATION_STATES = Object.freeze([
  'CALCULATION_NOT_RUN',
  'CALCULATION_ACCEPTED_BY_STAGE_CONTRACT',
  'CALCULATION_NOT_ACCEPTED_BY_STAGE_CONTRACT',
]);
export const LAFEA_RESULT_STATES = Object.freeze(['RESULT_NOT_READY', 'RESULT_READY']); export const LAFEA_CODE_STATES = Object.freeze(['CODE_NOT_READY', 'CODE_READY']);
export const LAFEA_RELEASE_STATES = Object.freeze([
  'RELEASE_NOT_QUALIFIED', 'RELEASE_QUALIFIED',
]);

export function createLafeaWorkbenchOrchestratorStore(options) {
  const retained = createRetainedStore(options);
  let retainedState = retained.getState();
  let suppressRetainedPublish = false;
  let orchestratorStatus = null;
  let orchestratorDiagnostics = null;
  const listeners = new Set();
  const stageIds = Object.keys(retainedState.stages);

  const source = createLafeaWorkbenchSourceState(stageIds, {
    getRetainedState: () => retainedState,
    getActiveStageId: () => retainedState.activeStageId,
    invokeRetained,
  });
  const mesh = createLafeaWorkbenchMeshState(stageIds, {
    getActiveStageId: () => retainedState.activeStageId,
    readStageState,
    invokeRetained,
    publish,
  });

  const unsubscribe = retained.subscribe((next) => {
    retainedState = next;
    if (!suppressRetainedPublish) publish();
  });

  function rawStage(stageId) {
    const stage = retainedState.stages[stageId];
    if (!stage) throw storeError('LAFEA_WORKBENCH_STAGE_NOT_FOUND');
    return freeze({
      ...stage,
      stageId,
      ...source.fields(stageId),
      ...mesh.fields(stageId),
    });
  }

  function readStageState(stageId) {
    const stage = rawStage(stageId);
    const lifecycleReadiness = projectLafeaWorkbenchReadiness(stageId, stage);
    const withReadiness = freeze({ ...stage, lifecycleReadiness });
    const analysisMeshCustodyProjection = mesh.buildAnalysisMeshCustodyProjection(
      withReadiness,
      stage.retainedAnalysisMeshEvidence,
    );
    return freeze({
      ...withReadiness,
      analysisMeshCustodyProjection,
    });
  }

  function deriveStage(stageId) {
    const stage = readStageState(stageId);
    return freeze({
      ...stage,
      orchestration: buildLafeaWorkbenchOrchestrationProjection(stage),
    });
  }

  function deriveState() {
    return freeze({
      ...retainedState,
      stages: Object.fromEntries(stageIds.map((stageId) => [
        stageId,
        deriveStage(stageId),
      ])),
      status: orchestratorStatus ?? retainedState.status,
      diagnostics: orchestratorDiagnostics ?? retainedState.diagnostics,
    });
  }

  function publish() {
    const state = deriveState();
    for (const listener of listeners) {
      try { listener(state); } catch { /* one subscriber cannot block authority state */ }
    }
    return state;
  }

  function invokeRetained(method, args = []) {
    if (typeof retained[method] !== 'function') {
      throw storeError(`LAFEA_RETAINED_METHOD_NOT_FOUND:${method}`);
    }
    suppressRetainedPublish = true;
    try {
      const returned = retained[method](...args);
      retainedState = returned ?? retained.getState();
      return retainedState;
    } finally {
      suppressRetainedPublish = false;
    }
  }

  function mutateDocument(originRef, method, args, explicitClass = null) {
    const before = retainedState;
    invokeRetained(method, args);
    if (retainedState.status === 'FAILED') return publish();
    source.reconcileDocumentMutation(before, originRef, explicitClass);
    clearOrchestratorDiagnostic();
    return publish();
  }

  function run() {
    invokeRetained('run');
    const stageId = retainedState.activeStageId;
    let stage = retainedState.stages[stageId];
    try {
      if (stage.execution?.status === 'QUALIFIED') {
        const authority = source.ensureRunAuthority(
          stageId,
          'RUN_CALCULATION/SOURCE_AUTHORITY',
        );
        stage = retainedState.stages[stageId];
        const batch = createLafeaLifecycleProducerBatch({
          stageId,
          sourceAuthority: authority,
          execution: stage.execution,
        });
        for (let index = 0; index < batch.records.length; index += 1) {
          invokeRetained('registerLifecycleArtifact', [
            batch.records[index],
            batch.registrations[index].registrationId,
          ]);
          if (retainedState.status === 'FAILED') {
            throw storeError(
              retainedState.diagnostics?.[0]?.code
                ?? 'LAFEA_PRODUCER_REGISTRATION_REJECTED',
            );
          }
        }
      }
      clearOrchestratorDiagnostic();
    } catch (error) {
      failOrchestrator(error, 'LAFEA_PRODUCER_REGISTRATION_REJECTED');
    }
    return publish();
  }

  function importDocument(value, stageId = retainedState.activeStageId, sourceHash = null) {
    invokeRetained('importDocument', [value, stageId, sourceHash]);
    if (retainedState.status !== 'FAILED') {
      source.clear(stageId);
      clearOrchestratorDiagnostic();
    }
    return publish();
  }

  function initializeLifecycle(sourceHash, originRef = 'EXTERNAL_SOURCE_AUTHORITY') {
    source.clear(retainedState.activeStageId);
    invokeRetained('initializeLifecycle', [sourceHash, originRef]);
    clearOrchestratorDiagnosticIfReady();
    return publish();
  }

  function applyLifecycleEvent(event) {
    invokeRetained('applyLifecycleEvent', [event]);
    const succeeded = retainedState.status !== 'FAILED';
    source.afterLifecycleEvent(event, succeeded);
    mesh.afterLifecycleEvent(event, succeeded);
    if (succeeded) clearOrchestratorDiagnostic();
    return publish();
  }

  function delegate(method, args = []) {
    invokeRetained(method, args);
    clearOrchestratorDiagnosticIfReady();
    return publish();
  }

  function exportLifecycle() {
    const stageId = retainedState.activeStageId;
    const stage = deriveStage(stageId);
    return freeze({
      ...retained.exportLifecycle(),
      schema: 'lafea-workbench-lifecycle-export/v2',
      sourceAuthority: stage.sourceAuthority,
      lastSourceAuthorityEvent: stage.lastSourceAuthorityEvent,
      readiness: stage.lifecycleReadiness,
      orchestration: stage.orchestration,
    });
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('LAFEA subscriber must be a function.');
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function clearOrchestratorDiagnosticIfReady() {
    if (retainedState.status !== 'FAILED') clearOrchestratorDiagnostic();
  }

  function clearOrchestratorDiagnostic() {
    orchestratorStatus = null;
    orchestratorDiagnostics = null;
  }

  function failOrchestrator(error, fallbackCode) {
    orchestratorStatus = 'FAILED';
    orchestratorDiagnostics = [freeze({
      severity: 'ERROR',
      code: typeof error?.code === 'string' ? error.code : fallbackCode,
      path: 'orchestration',
      entityId: null,
      message: error instanceof Error ? error.message : String(error),
    })];
  }

  return Object.freeze({
    selectStage: (stageId) => delegate('selectStage', [stageId]),
    importDocument,
    applyEditCommand: (command) => mutateDocument(
      command?.commandId ?? 'APPLY_EDIT_COMMAND',
      'applyEditCommand',
      [command],
    ),
    setScalar: (descriptorId, entityId, rawText, surface) => mutateDocument(
      `SET_SCALAR:${descriptorId}`,
      'setScalar',
      [descriptorId, entityId, rawText, surface],
    ),
    replaceDocument: (value, surface) => mutateDocument(
      'REPLACE_DOCUMENT', 'replaceDocument', [value, surface], 'GEOMETRY',
    ),
    moveNode: (path, nodeId, x, y) => mutateDocument(
      `MOVE_NODE:${nodeId}`, 'moveNode', [path, nodeId, x, y], 'GEOMETRY',
    ),
    reportEditError: (...args) => delegate('reportEditError', args),
    run,
    undo: () => mutateDocument('UNDO', 'undo', []),
    redo: () => mutateDocument('REDO', 'redo', []),
    exportDocument: () => retained.exportDocument(),
    initializeLifecycle,
    applyLifecycleEvent,
    registerLifecycleArtifact: (...args) => delegate('registerLifecycleArtifact', args),
    revalidateLifecycleBinding: (...args) => delegate('revalidateLifecycleBinding', args),
    exportLifecycle,
    validateLafeaAnalysisMeshEvidence: mesh.validateLafeaAnalysisMeshEvidence,
    registerAnalysisMeshEvidence: mesh.registerAnalysisMeshEvidence,
    selectRetainedAnalysisMeshEvidence: mesh.selectRetainedAnalysisMeshEvidence,
    buildAnalysisMeshCustodyProjection: mesh.buildAnalysisMeshCustodyProjection,
    exportAnalysisMeshEvidence: mesh.exportAnalysisMeshEvidence,
    recoverAnalysisMeshEvidence: mesh.recoverAnalysisMeshEvidence,
    buildOrchestrationProjection: (stageId = retainedState.activeStageId) =>
      deriveStage(stageId).orchestration,
    subscribe,
    getState: deriveState,
    destroy: () => {
      unsubscribe();
      retained.destroy();
      listeners.clear();
    },
  });
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
