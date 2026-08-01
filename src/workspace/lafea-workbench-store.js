/**
 * Immutable LAFEA editor state with bounded document-level undo/redo history.
 *
 * All source edits enter through StageEditCommand/v2. The store does not expose
 * array-index record mutation and owns no Workspace or U3 lifecycle state.
 */
import {
  createLafeaReplaceDocumentCommand,
  createLafeaSetScalarCommand,
  applyLafeaStageEditCommand,
  lafeaDocumentDigest,
} from './lafea-edit-command.js';
import {
  LAFEA_STAGE_IDS,
  LAFEA_WORKBENCH_DOCUMENT_SCHEMA,
  executeLafeaStage,
  normalizeLafeaStageDocument,
} from './lafea-workbench-model.js';
import { requireLafeaInputDescriptor } from './lafea-stage-input-descriptors.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';
import {
  HISTORY_LIMIT,
  assertStage,
  commandError,
  commitDocument,
  currentStage,
  failedState,
  freeze,
  importIntoState,
  initialState,
  requireDocument,
  withCurrentStage,
} from './lafea-workbench-store-state.js';

const NODE_COORDINATE_DESCRIPTORS = Object.freeze({
  'LAFEA.3': Object.freeze({ x: 'LAFEA.3.node.x', y: 'LAFEA.3.node.y' }),
  'LAFEA.4': Object.freeze({ x: 'LAFEA.4.node.position.x', y: 'LAFEA.4.node.position.y' }),
  'LAFEA.5': Object.freeze({ x: 'LAFEA.5.shell.node.position.x', y: 'LAFEA.5.shell.node.position.y' }),
});

/** Create an independent LAFEA workbench store. */
export function createLafeaWorkbenchStore(options) {
  const configuration = options ?? {};
  const initialStage = configuration.initialStage ?? LAFEA_STAGE_IDS[0];
  assertStage(initialStage);
  let state = initialState(initialStage);
  let commandSequence = 0;
  const listeners = new Set();

  if (configuration.initialDocument !== undefined) {
    state = importIntoState(state, initialStage, configuration.initialDocument);
  }

  function publish(next) {
    state = freeze(next);
    listeners.forEach((listener) => listener(state));
    return state;
  }

  function selectStage(stageId) {
    assertStage(stageId);
    return publish({ ...state, activeStageId: stageId, diagnostics: [] });
  }

  function importDocument(value, stageId) {
    const targetStage = stageId ?? state.activeStageId;
    try {
      return publish(importIntoState(state, targetStage, value));
    } catch (error) {
      return publish(failedState(state, error, 'LAFEA_IMPORT_REJECTED'));
    }
  }

  function applyEditCommand(command) {
    const document = requireDocument(state);
    if (command?.stageId !== state.activeStageId) {
      return publish(failedState(
        state,
        commandError(
          'LAFEA_EDIT_STAGE_MISMATCH',
          `Active stage ${state.activeStageId} cannot apply a ${command?.stageId ?? 'missing'} command.`,
        ),
        'LAFEA_EDIT_STAGE_MISMATCH',
      ));
    }
    const editResult = applyLafeaStageEditCommand(document, command);
    if (editResult.status === 'APPLIED') {
      return publish(commitDocument(state, editResult.document, editResult));
    }
    if (editResult.status === 'NO_CHANGE') {
      return publish(withCurrentStage(state, {
        ...currentStage(state),
        lastEditResult: editResult,
      }, 'READY', editResult.diagnostics));
    }
    return publish(withCurrentStage(state, {
      ...currentStage(state),
      lastEditResult: editResult,
    }, 'FAILED', editResult.diagnostics));
  }

  function setScalar(descriptorId, entityId, rawText, surface = 'FORM') {
    const document = requireDocument(state);
    const descriptor = requireLafeaInputDescriptor(state.activeStageId, descriptorId);
    const command = createLafeaSetScalarCommand({
      commandId: nextCommandId('SET'),
      stageId: state.activeStageId,
      descriptorId: descriptor.descriptorId,
      expectedDocumentDigest: lafeaDocumentDigest(document),
      entityId: entityId ?? null,
      rawText,
      origin: commandOrigin(surface),
    });
    return applyEditCommand(command);
  }

  function replaceDocument(value, surface = 'RAW_JSON') {
    try {
      const document = requireDocument(state);
      const command = createLafeaReplaceDocumentCommand({
        commandId: nextCommandId('REPLACE'),
        stageId: state.activeStageId,
        expectedDocumentDigest: lafeaDocumentDigest(document),
        documentValue: value,
        origin: commandOrigin(surface),
      });
      return applyEditCommand(command);
    } catch (error) {
      return publish(failedState(state, error, 'LAFEA_EDIT_REJECTED'));
    }
  }

  function moveNode(nodePath, nodeId, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return publish(failedState(
        state,
        new TypeError('Node coordinates must be finite.'),
        'LAFEA_NODE_MOVE_REJECTED',
      ));
    }
    const route = NODE_COORDINATE_DESCRIPTORS[state.activeStageId];
    const registeredNodePath = requireLafeaStageRegistryEntry(
      state.activeStageId,
    ).previewSource.nodePath;
    if (!route || nodePath !== registeredNodePath) {
      return publish(failedState(
        state,
        commandError(
          'LAFEA_NODE_PATH_NOT_AUTHORIZED',
          `${nodePath} is not the registered editable node path for ${state.activeStageId}.`,
        ),
        'LAFEA_NODE_PATH_NOT_AUTHORIZED',
      ));
    }

    const initialDocument = requireDocument(state);
    const xCommand = scalarCommand(
      route.x,
      nodeId,
      String(x),
      initialDocument,
      'SVG_DRAG',
    );
    const xResult = applyLafeaStageEditCommand(initialDocument, xCommand);
    if (!['APPLIED', 'NO_CHANGE'].includes(xResult.status)) {
      return publishEditFailure(xResult);
    }

    const yCommand = scalarCommand(
      route.y,
      nodeId,
      String(y),
      xResult.document,
      'SVG_DRAG',
    );
    const yResult = applyLafeaStageEditCommand(xResult.document, yCommand);
    if (!['APPLIED', 'NO_CHANGE'].includes(yResult.status)) {
      return publishEditFailure(yResult);
    }

    if (xResult.status === 'NO_CHANGE' && yResult.status === 'NO_CHANGE') {
      return publish(withCurrentStage(state, {
        ...currentStage(state),
        lastEditResult: yResult,
      }, 'READY', []));
    }
    return publish(commitDocument(state, yResult.document, yResult));
  }

  function publishEditFailure(editResult) {
    return publish(withCurrentStage(state, {
      ...currentStage(state),
      lastEditResult: editResult,
    }, 'FAILED', editResult.diagnostics));
  }

  function scalarCommand(descriptorId, entityId, rawText, document, surface) {
    const descriptor = requireLafeaInputDescriptor(state.activeStageId, descriptorId);
    return createLafeaSetScalarCommand({
      commandId: nextCommandId('SET'),
      stageId: state.activeStageId,
      descriptorId: descriptor.descriptorId,
      expectedDocumentDigest: lafeaDocumentDigest(document),
      entityId,
      rawText,
      origin: commandOrigin(surface),
    });
  }

  function reportEditError(path, entityId, error) {
    return publish({
      ...failedState(state, error, 'LAFEA_SOURCE_EDIT_REJECTED'),
      diagnostics: [{
        severity: 'ERROR',
        code: typeof error?.code === 'string'
          ? error.code
          : 'LAFEA_SOURCE_EDIT_REJECTED',
        path,
        entityId: typeof entityId === 'string' ? entityId : null,
        message: error instanceof Error
          ? error.message
          : 'Unknown LAFEA source-edit failure.',
      }],
    });
  }

  function run() {
    const document = requireDocument(state);
    const execution = executeLafeaStage(state.activeStageId, document);
    const stage = { ...currentStage(state), execution };
    return publish({
      ...state,
      status: execution.status,
      stages: { ...state.stages, [state.activeStageId]: freeze(stage) },
      diagnostics: execution.diagnostics,
    });
  }

  function undo() {
    const stage = currentStage(state);
    if (!stage.past.length) return state;
    const document = stage.past.at(-1);
    const nextStage = {
      ...stage,
      document,
      execution: null,
      lastEditResult: null,
      past: stage.past.slice(0, -1),
      future: [stage.document, ...stage.future]
        .filter(Boolean)
        .slice(0, HISTORY_LIMIT),
    };
    return publish(withCurrentStage(state, nextStage, 'READY', []));
  }

  function redo() {
    const stage = currentStage(state);
    if (!stage.future.length) return state;
    const document = stage.future[0];
    const nextStage = {
      ...stage,
      document,
      execution: null,
      lastEditResult: null,
      past: [...stage.past, stage.document]
        .filter(Boolean)
        .slice(-HISTORY_LIMIT),
      future: stage.future.slice(1),
    };
    return publish(withCurrentStage(state, nextStage, 'READY', []));
  }

  function exportDocument() {
    const document = normalizeLafeaStageDocument(
      state.activeStageId,
      requireDocument(state),
    );
    return freeze({
      schema: LAFEA_WORKBENCH_DOCUMENT_SCHEMA,
      stageId: state.activeStageId,
      document,
    });
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('LAFEA subscriber must be a function.');
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function nextCommandId(action) {
    commandSequence += 1;
    return `LAFEA-${state.activeStageId}-${action}-${String(commandSequence).padStart(8, '0')}`;
  }

  function commandOrigin(surface) {
    return {
      surface,
      sessionId: configuration.sessionId ?? 'LAFEA_WORKBENCH_SESSION',
      sequence: commandSequence,
    };
  }

  return Object.freeze({
    selectStage,
    importDocument,
    applyEditCommand,
    setScalar,
    replaceDocument,
    moveNode,
    reportEditError,
    run,
    undo,
    redo,
    exportDocument,
    subscribe,
    getState: () => state,
    destroy: () => listeners.clear(),
  });
}
