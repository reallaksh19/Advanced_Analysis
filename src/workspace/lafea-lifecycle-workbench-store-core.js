import { lafeaDocumentDigest } from './lafea-edit-command.js';
import { createLafeaLifecycleEvent } from './lafea-lifecycle.js';
import { createLafeaLifecycleProducerBatch } from './lafea-lifecycle-producers.js';
import {
  createLafeaSourceAuthorityEvent,
  issueLafeaSourceAuthority,
} from './lafea-source-authority.js';
import { lafeaStageInputDescriptors } from './lafea-stage-input-descriptors.js';
import {
  LAFEA_LIFECYCLE_BINDING_SCHEMA,
  LAFEA_LIFECYCLE_BINDING_STATUSES,
  LAFEA_WORKBENCH_STATE_SCHEMA,
  createLafeaWorkbenchStore as createRetainedStore,
} from './lafea-lifecycle-workbench-store-retained.js';
import { projectLafeaWorkbenchReadiness } from './lafea-workbench-readiness.js';

export { LAFEA_LIFECYCLE_BINDING_SCHEMA, LAFEA_LIFECYCLE_BINDING_STATUSES };
export { LAFEA_WORKBENCH_STATE_SCHEMA };
export const LAFEA_CALCULATION_STATES = Object.freeze([
  'CALCULATION_NOT_RUN',
  'CALCULATION_ACCEPTED_BY_STAGE_CONTRACT',
  'CALCULATION_NOT_ACCEPTED_BY_STAGE_CONTRACT',
]);
export const LAFEA_RESULT_STATES = Object.freeze(['RESULT_NOT_READY', 'RESULT_READY']);
export const LAFEA_CODE_STATES = Object.freeze(['CODE_NOT_READY', 'CODE_READY']);
export const LAFEA_RELEASE_STATES = Object.freeze([
  'RELEASE_NOT_QUALIFIED', 'RELEASE_QUALIFIED',
]);

const SOURCE_CHANGE_CLASSES = new Set([
  'MATERIAL_PROPERTY', 'GEOMETRY', 'LOAD_OR_BC', 'MODEL_METADATA',
]);

export function createLafeaWorkbenchStoreCore(options) {
  const retained = createRetainedStore(options);
  let retainedState = retained.getState();
  let suppress = false;
  let overlayStatus = null;
  let overlayDiagnostics = null;
  const listeners = new Set();
  const sourceByStage = Object.fromEntries(
    Object.keys(retainedState.stages).map((stageId) => [stageId, null]),
  );
  const sourceEventByStage = Object.fromEntries(
    Object.keys(retainedState.stages).map((stageId) => [stageId, null]),
  );
  const transitionClasses = Object.fromEntries(
    Object.keys(retainedState.stages).map((stageId) => [stageId, new Map()]),
  );
  const unsubscribe = retained.subscribe((next) => {
    retainedState = next;
    if (!suppress) publish();
  });

  function publish() {
    const state = deriveState();
    listeners.forEach((listener) => listener(state));
    return state;
  }

  function deriveState() {
    const stages = Object.fromEntries(Object.entries(retainedState.stages).map(([stageId, stage]) => [
      stageId,
      freeze({
        ...stage,
        sourceAuthority: sourceByStage[stageId],
        lastSourceAuthorityEvent: sourceEventByStage[stageId],
        lifecycleReadiness: projectLafeaWorkbenchReadiness(stageId, stage),
      }),
    ]));
    return freeze({
      ...retainedState,
      stages,
      status: overlayStatus ?? retainedState.status,
      diagnostics: overlayDiagnostics ?? retainedState.diagnostics,
    });
  }

  function compound(operation) {
    suppress = true;
    try {
      operation();
      retainedState = retained.getState();
    } finally {
      suppress = false;
    }
  }

  function mutateDocument(originRef, operation, explicitClass = null) {
    const before = retainedState;
    compound(operation);
    if (retainedState.status === 'FAILED') return publish();
    for (const stageId of Object.keys(retainedState.stages)) {
      const previousDocument = before.stages[stageId]?.document ?? null;
      const currentDocument = retainedState.stages[stageId]?.document ?? null;
      const previousDigest = digest(previousDocument);
      const currentDigest = digest(currentDocument);
      if (previousDigest === currentDigest || !currentDocument) continue;
      if (!previousDocument) {
        sourceByStage[stageId] = null;
        sourceEventByStage[stageId] = null;
        continue;
      }
      let previousAuthority = sourceByStage[stageId];
      const currentLifecycle = retainedState.stages[stageId].lifecycle;
      if (!previousAuthority || !currentLifecycle) {
        previousAuthority = issueLafeaSourceAuthority(
          stageId, previousDocument, `${originRef}/PREVIOUS_SOURCE`,
        );
        compound(() => retained.initializeLifecycle(
          previousAuthority.sourceHash, `${originRef}/PREVIOUS_SOURCE`,
        ));
      }
      const currentAuthority = issueLafeaSourceAuthority(stageId, currentDocument, originRef);
      if (currentAuthority.sourceHash === previousAuthority.sourceHash) {
        sourceByStage[stageId] = currentAuthority;
        continue;
      }
      const changeClass = resolveChangeClass(
        stageId, previousDigest, currentDigest, retainedState.stages[stageId], explicitClass,
      );
      rememberTransition(stageId, previousDigest, currentDigest, changeClass);
      const event = createLafeaSourceAuthorityEvent(
        previousAuthority, currentAuthority, changeClass, originRef,
      );
      compound(() => retained.applyLifecycleEvent(event.lifecycleEvent));
      sourceByStage[stageId] = currentAuthority;
      sourceEventByStage[stageId] = event;
    }
    clearOverlay();
    return publish();
  }

  function resolveChangeClass(stageId, beforeDigest, afterDigest, stage, explicitClass) {
    if (SOURCE_CHANGE_CLASSES.has(explicitClass)) return explicitClass;
    const descriptorClass = changeClassFromDescriptorDigest(
      stageId,
      stage.lastEditResult?.audit?.descriptorDigest,
    );
    if (SOURCE_CHANGE_CLASSES.has(descriptorClass)) return descriptorClass;
    const remembered = transitionClasses[stageId].get(`${beforeDigest}->${afterDigest}`);
    return SOURCE_CHANGE_CLASSES.has(remembered) ? remembered : 'GEOMETRY';
  }

  function changeClassFromDescriptorDigest(stageId, descriptorDigest) {
    if (typeof descriptorDigest !== 'string') return null;
    const descriptor = lafeaStageInputDescriptors(stageId).find(
      (candidate) => lafeaDocumentDigest(candidate) === descriptorDigest,
    );
    return descriptor?.invalidation?.invalidationClass ?? null;
  }

  function rememberTransition(stageId, beforeDigest, afterDigest, changeClass) {
    if (!beforeDigest || !afterDigest) return;
    transitionClasses[stageId].set(`${beforeDigest}->${afterDigest}`, changeClass);
    transitionClasses[stageId].set(`${afterDigest}->${beforeDigest}`, changeClass);
  }

  function run() {
    compound(() => retained.run());
    const stageId = retainedState.activeStageId;
    const stage = retainedState.stages[stageId];
    try {
      if (stage.execution?.status === 'QUALIFIED') {
        let authority = sourceByStage[stageId];
        if (!authority || !stage.lifecycle) {
          authority = issueLafeaSourceAuthority(
            stageId, stage.document, 'RUN_CALCULATION/SOURCE_AUTHORITY',
          );
          compound(() => retained.initializeLifecycle(
            authority.sourceHash, 'RUN_CALCULATION/SOURCE_AUTHORITY',
          ));
          sourceByStage[stageId] = authority;
        }
        const batch = createLafeaLifecycleProducerBatch({
          stageId,
          sourceAuthority: authority,
          execution: retainedState.stages[stageId].execution,
        });
        compound(() => {
          for (let index = 0; index < batch.records.length; index += 1) {
            retained.registerLifecycleArtifact(
              batch.records[index], batch.registrations[index].registrationId,
            );
          }
        });
      }
      clearOverlay();
    } catch (error) {
      failOverlay(error, 'LAFEA_PRODUCER_REGISTRATION_REJECTED');
    }
    return publish();
  }

  function importDocument(value, stageId, sourceHash = null) {
    compound(() => retained.importDocument(value, stageId, sourceHash));
    if (retainedState.status !== 'FAILED') {
      sourceByStage[stageId] = null;
      sourceEventByStage[stageId] = null;
      clearOverlay();
    }
    return publish();
  }

  function initializeLifecycle(sourceHash, originRef = 'EXTERNAL_SOURCE_AUTHORITY') {
    sourceByStage[retainedState.activeStageId] = null;
    sourceEventByStage[retainedState.activeStageId] = null;
    compound(() => retained.initializeLifecycle(sourceHash, originRef));
    return publish();
  }

  function applyLifecycleEvent(event) {
    compound(() => retained.applyLifecycleEvent(event));
    if (SOURCE_CHANGE_CLASSES.has(event?.changeClass)) {
      sourceByStage[retainedState.activeStageId] = null;
      sourceEventByStage[retainedState.activeStageId] = null;
    }
    return publish();
  }

  function delegate(method, ...args) {
    compound(() => retained[method](...args));
    return publish();
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('LAFEA subscriber must be a function.');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function clearOverlay() {
    overlayStatus = null;
    overlayDiagnostics = null;
  }

  function failOverlay(error, fallbackCode) {
    overlayStatus = 'FAILED';
    overlayDiagnostics = [freeze({
      severity: 'ERROR',
      code: typeof error?.code === 'string' ? error.code : fallbackCode,
      path: 'lifecycle',
      entityId: null,
      message: error instanceof Error ? error.message : String(error),
    })];
  }

  return Object.freeze({
    selectStage: (stageId) => delegate('selectStage', stageId),
    importDocument,
    applyEditCommand: (command) => mutateDocument(
      command?.commandId ?? 'APPLY_EDIT_COMMAND',
      () => retained.applyEditCommand(command),
    ),
    setScalar: (descriptorId, entityId, rawText, surface) => mutateDocument(
      `SET_SCALAR:${descriptorId}`,
      () => retained.setScalar(descriptorId, entityId, rawText, surface),
    ),
    replaceDocument: (value, surface) => mutateDocument(
      'REPLACE_DOCUMENT', () => retained.replaceDocument(value, surface), 'GEOMETRY',
    ),
    moveNode: (path, nodeId, x, y) => mutateDocument(
      `MOVE_NODE:${nodeId}`, () => retained.moveNode(path, nodeId, x, y), 'GEOMETRY',
    ),
    reportEditError: (...args) => delegate('reportEditError', ...args),
    run,
    undo: () => mutateDocument('UNDO', () => retained.undo()),
    redo: () => mutateDocument('REDO', () => retained.redo()),
    exportDocument: () => retained.exportDocument(),
    initializeLifecycle,
    applyLifecycleEvent,
    registerLifecycleArtifact: (...args) => delegate('registerLifecycleArtifact', ...args),
    revalidateLifecycleBinding: (...args) => delegate('revalidateLifecycleBinding', ...args),
    exportLifecycle: () => freeze({
      ...retained.exportLifecycle(),
      schema: 'lafea-workbench-lifecycle-export/v2',
      sourceAuthority: sourceByStage[retainedState.activeStageId],
      lastSourceAuthorityEvent: sourceEventByStage[retainedState.activeStageId],
      readiness: deriveState().stages[retainedState.activeStageId].lifecycleReadiness,
    }),
    subscribe,
    getState: deriveState,
    destroy: () => {
      unsubscribe();
      retained.destroy();
      listeners.clear();
    },
  });
}

function digest(document) {
  return document ? lafeaDocumentDigest(document) : null;
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
