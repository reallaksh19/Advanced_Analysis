/**
 * Immutable LAFEA editor state with bounded document-level undo/redo history.
 *
 * The store owns no Workspace data and accepts only explicit LAFEA documents.
 */
import {
  LAFEA_STAGE_IDS,
  LAFEA_WORKBENCH_DOCUMENT_SCHEMA,
  executeLafeaStage,
  normalizeLafeaStageEdit,
  normalizeLafeaStageDocument,
} from './lafea-workbench-model.js';

const HISTORY_LIMIT = 50;

/**
 * Create an independent LAFEA workbench store.
 *
 * @param {{initialStage?: string, initialDocument?: unknown}|undefined} options Explicit initialization values.
 * @returns {Readonly<Record<string, unknown>>} LAFEA store API.
 */
export function createLafeaWorkbenchStore(options) {
  const configuration = options ?? {};
  const initialStage = configuration.initialStage ?? LAFEA_STAGE_IDS[0];
  assertStage(initialStage);
  let state = initialState(initialStage);
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

  function replaceDocument(value) {
    try {
      const document = normalizeLafeaStageEdit(state.activeStageId, value);
      return publish(commitDocument(state, document));
    } catch (error) {
      return publish(failedState(state, error, 'LAFEA_EDIT_REJECTED'));
    }
  }

  function replaceCollection(path, rows) {
    if (!Array.isArray(rows)) throw new TypeError('LAFEA collection replacement requires an array.');
    const document = requireDocument(state);
    return replaceDocument(setAtPath(document, path, structuredClone(rows)));
  }

  function updateRecord(path, index, record) {
    const rows = collectionAt(requireDocument(state), path);
    if (!Number.isInteger(index) || index < 0 || index >= rows.length) {
      throw new RangeError(`LAFEA record index ${index} is outside ${path}.`);
    }
    if (!isRecord(record)) throw new TypeError('LAFEA record must be a JSON object.');
    const next = rows.map((row, rowIndex) => rowIndex === index ? structuredClone(record) : row);
    return replaceCollection(path, next);
  }

  function addRecord(path, record) {
    if (!isRecord(record)) throw new TypeError('LAFEA record must be a JSON object.');
    return replaceCollection(path, [...collectionAt(requireDocument(state), path), structuredClone(record)]);
  }

  function deleteRecord(path, index) {
    const rows = collectionAt(requireDocument(state), path);
    if (!Number.isInteger(index) || index < 0 || index >= rows.length) {
      throw new RangeError(`LAFEA record index ${index} is outside ${path}.`);
    }
    return replaceCollection(path, rows.filter((_, rowIndex) => rowIndex !== index));
  }

  function moveNode(nodePath, nodeId, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Node coordinates must be finite.');
    const rows = collectionAt(requireDocument(state), nodePath);
    const index = rows.findIndex((row) => row.nodeId === nodeId);
    if (index < 0) throw new TypeError(`Unknown LAFEA node: ${nodeId}.`);
    const row = structuredClone(rows[index]);
    if (Array.isArray(row.position)) row.position = [x, y, row.position[2] ?? 0];
    else {
      row.x = x;
      row.y = y;
    }
    return updateRecord(nodePath, index, row);
  }

  function reportEditError(path, index, error) {
    return publish({
      ...failedState(state, error, 'LAFEA_RECORD_EDIT_REJECTED'),
      diagnostics: [{
        severity: 'ERROR',
        code: 'LAFEA_RECORD_EDIT_REJECTED',
        path,
        index,
        message: error instanceof Error ? error.message : 'Unknown LAFEA record edit failure.',
      }],
    });
  }

  function run() {
    const document = requireDocument(state);
    const execution = executeLafeaStage(state.activeStageId, document);
    const stage = { ...state.stages[state.activeStageId], execution };
    return publish({
      ...state,
      status: execution.status,
      stages: { ...state.stages, [state.activeStageId]: stage },
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
      past: stage.past.slice(0, -1),
      future: [stage.document, ...stage.future].filter(Boolean).slice(0, HISTORY_LIMIT),
    };
    return publish(withStage(state, nextStage, 'READY'));
  }

  function redo() {
    const stage = currentStage(state);
    if (!stage.future.length) return state;
    const document = stage.future[0];
    const nextStage = {
      ...stage,
      document,
      execution: null,
      past: [...stage.past, stage.document].filter(Boolean).slice(-HISTORY_LIMIT),
      future: stage.future.slice(1),
    };
    return publish(withStage(state, nextStage, 'READY'));
  }

  function exportDocument() {
    const document = normalizeLafeaStageDocument(state.activeStageId, requireDocument(state));
    return freeze({
      schema: LAFEA_WORKBENCH_DOCUMENT_SCHEMA,
      stageId: state.activeStageId,
      document,
    });
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('LAFEA subscriber must be a function.');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({
    selectStage,
    importDocument,
    replaceDocument,
    replaceCollection,
    updateRecord,
    addRecord,
    deleteRecord,
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

function initialState(activeStageId) {
  const stages = Object.fromEntries(LAFEA_STAGE_IDS.map((stageId) => [
    stageId,
    freeze({ document: null, execution: null, past: [], future: [] }),
  ]));
  return freeze({
    schema: 'lafea-workbench-state/v1',
    activeStageId,
    status: 'EMPTY',
    stages,
    diagnostics: [],
  });
}

function importIntoState(state, stageId, value) {
  assertStage(stageId);
  const envelope = isRecord(value) && value.schema === LAFEA_WORKBENCH_DOCUMENT_SCHEMA;
  const targetStage = envelope ? value.stageId : stageId;
  assertStage(targetStage);
  const document = normalizeLafeaStageDocument(targetStage, envelope ? value.document : value);
  const stage = state.stages[targetStage];
  const nextStage = {
    document,
    execution: null,
    past: stage.document ? [...stage.past, stage.document].slice(-HISTORY_LIMIT) : stage.past,
    future: [],
  };
  return withStage({ ...state, activeStageId: targetStage }, nextStage, 'READY');
}

function commitDocument(state, document) {
  const stage = currentStage(state);
  const nextStage = {
    document,
    execution: null,
    past: [...stage.past, stage.document].filter(Boolean).slice(-HISTORY_LIMIT),
    future: [],
  };
  return withStage(state, nextStage, 'READY');
}

function withStage(state, stage, status) {
  return {
    ...state,
    status,
    stages: { ...state.stages, [state.activeStageId]: freeze(stage) },
    diagnostics: [],
  };
}

function failedState(state, error, code) {
  return {
    ...state,
    status: 'FAILED',
    diagnostics: [{
      severity: 'ERROR',
      code: typeof error?.code === 'string' ? error.code : code,
      message: error instanceof Error ? error.message : 'Unknown LAFEA workbench failure.',
    }],
  };
}

function currentStage(state) {
  return state.stages[state.activeStageId];
}

function requireDocument(state) {
  const document = currentStage(state).document;
  if (!document) throw new TypeError(`Import a ${state.activeStageId} document before editing or calculating.`);
  return document;
}

function collectionAt(document, path) {
  const value = getAtPath(document, path);
  if (!Array.isArray(value)) throw new TypeError(`${path} is not an editable LAFEA collection.`);
  return structuredClone(value);
}

function getAtPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}

function setAtPath(value, path, replacement) {
  const result = structuredClone(value);
  const keys = path.split('.');
  let current = result;
  for (const key of keys.slice(0, -1)) {
    if (!isRecord(current[key])) throw new TypeError(`Missing LAFEA document path: ${path}.`);
    current = current[key];
  }
  current[keys.at(-1)] = replacement;
  return result;
}

function assertStage(stageId) {
  if (!LAFEA_STAGE_IDS.includes(stageId)) throw new TypeError(`Unsupported LAFEA stage: ${stageId}.`);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
