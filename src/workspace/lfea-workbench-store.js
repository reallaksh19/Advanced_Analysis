/**
 * Immutable LFEA mesh editor store with bounded undo and redo history.
 *
 * Valid imports retain their declared semantic hash. Only explicit local edits
 * are resealed, and every committed edit must satisfy mesh-package validation.
 */
import {
  LFEA_COLLECTION_PATHS,
  LFEA_RESULT_MODES,
  LFEA_WORKBENCH_DOCUMENT_SCHEMA,
  normalizeLfeaMeshPackage,
  resealLfeaMeshPackage,
} from './lfea-workbench-model.js';
import { executeLfeaWorkbench } from './lfea-workbench-pipeline.js';

const HISTORY_LIMIT = 50;

/**
 * Create a standalone LFEA workbench store.
 *
 * @param {{initialDocument?:unknown,resultMode?:string,pipelineOptions?:unknown}|undefined} options Explicit initial state.
 * @returns {Readonly<Record<string, Function>>} Store API.
 */
export function createLfeaWorkbenchStore(options) {
  const configuration = options ?? {};
  const resultMode = configuration.resultMode ?? 'MODEL';
  assertResultMode(resultMode);
  let state = freeze({
    schema: 'lfea-workbench-state/v1',
    status: 'EMPTY',
    packageValue: null,
    execution: null,
    resultMode,
    past: [],
    future: [],
    diagnostics: [],
  });
  const listeners = new Set();
  if (configuration.initialDocument !== undefined) {
    state = importedState(state, configuration.initialDocument);
  }

  function publish(next) {
    state = freeze(next);
    listeners.forEach((listener) => listener(state));
    return state;
  }

  function importDocument(value) {
    try {
      return publish(importedState(state, value));
    } catch (error) {
      return publish(failedState(state, error, 'LFEA_IMPORT_REJECTED'));
    }
  }

  function replaceDocument(value) {
    try {
      const packageValue = resealLfeaMeshPackage(value);
      return publish(committedState(state, packageValue));
    } catch (error) {
      return publish(failedState(state, error, 'LFEA_EDIT_REJECTED'));
    }
  }

  function replaceCollection(path, rows) {
    assertCollectionPath(path);
    if (!Array.isArray(rows)) throw new TypeError('LFEA collection replacement requires an array.');
    return replaceDocument(setAtPath(requirePackage(state), path, structuredClone(rows)));
  }

  function addRecord(path, record) {
    assertRecord(record);
    return replaceCollection(path, [...collectionAt(requirePackage(state), path), structuredClone(record)]);
  }

  function updateRecord(path, index, record) {
    assertRecord(record);
    const rows = collectionAt(requirePackage(state), path);
    assertIndex(rows, index, path);
    return replaceCollection(path, rows.map((row, rowIndex) => rowIndex === index ? structuredClone(record) : row));
  }

  function deleteRecord(path, index) {
    const rows = collectionAt(requirePackage(state), path);
    assertIndex(rows, index, path);
    return replaceCollection(path, rows.filter((_, rowIndex) => rowIndex !== index));
  }

  function moveNode(nodeId, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('LFEA node coordinates must be finite.');
    const rows = collectionAt(requirePackage(state), 'nodes');
    const index = rows.findIndex((row) => row.nodeId === nodeId);
    if (index < 0) throw new TypeError(`Unknown LFEA node: ${nodeId}.`);
    return updateRecord('nodes', index, { ...rows[index], x, y });
  }

  function setResultMode(mode) {
    assertResultMode(mode);
    if (mode === 'PROJECTED_STRESS' && !state.execution?.stressProjection) {
      return publish(failedState(state, new TypeError('Projected stress is unavailable until a qualified projection is generated.'), 'LFEA_PROJECTED_STRESS_UNAVAILABLE'));
    }
    return publish({ ...state, resultMode: mode, diagnostics: [] });
  }

  function run() {
    const execution = executeLfeaWorkbench(requirePackage(state), configuration.pipelineOptions);
    return publish({
      ...state,
      status: execution.status,
      execution,
      diagnostics: execution.diagnostics,
    });
  }

  function undo() {
    if (!state.past.length) return state;
    const packageValue = state.past.at(-1);
    return publish({
      ...state,
      status: 'READY',
      packageValue,
      execution: null,
      past: state.past.slice(0, -1),
      future: [state.packageValue, ...state.future].filter(Boolean).slice(0, HISTORY_LIMIT),
      diagnostics: [],
    });
  }

  function redo() {
    if (!state.future.length) return state;
    const packageValue = state.future[0];
    return publish({
      ...state,
      status: 'READY',
      packageValue,
      execution: null,
      past: [...state.past, state.packageValue].filter(Boolean).slice(-HISTORY_LIMIT),
      future: state.future.slice(1),
      diagnostics: [],
    });
  }

  function exportDocument() {
    return freeze({
      schema: LFEA_WORKBENCH_DOCUMENT_SCHEMA,
      packageValue: normalizeLfeaMeshPackage(requirePackage(state)),
    });
  }

  function exportPackage() {
    return normalizeLfeaMeshPackage(requirePackage(state));
  }

  function exportEvidence() {
    if (state.execution?.evidenceExport?.status !== 'QUALIFIED_EXPORT') {
      throw new TypeError('Qualified LFEA evidence export is unavailable.');
    }
    return state.execution.evidenceExport;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('LFEA subscriber must be a function.');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({
    importDocument,
    replaceDocument,
    replaceCollection,
    addRecord,
    updateRecord,
    deleteRecord,
    moveNode,
    setResultMode,
    run,
    undo,
    redo,
    exportDocument,
    exportPackage,
    exportEvidence,
    subscribe,
    getState: () => state,
    destroy: () => listeners.clear(),
  });
}

function importedState(state, value) {
  const envelope = isRecord(value) && value.schema === LFEA_WORKBENCH_DOCUMENT_SCHEMA;
  const packageValue = normalizeLfeaMeshPackage(envelope ? value.packageValue : value);
  return committedState(state, packageValue);
}

function committedState(state, packageValue) {
  return {
    ...state,
    status: 'READY',
    packageValue,
    execution: null,
    past: [...state.past, state.packageValue].filter(Boolean).slice(-HISTORY_LIMIT),
    future: [],
    diagnostics: [],
  };
}

function failedState(state, error, fallbackCode) {
  return {
    ...state,
    status: 'FAILED',
    diagnostics: [{
      severity: 'ERROR',
      code: typeof error?.code === 'string' ? error.code : fallbackCode,
      message: error instanceof Error ? error.message : 'Unknown LFEA workbench failure.',
    }],
  };
}

function requirePackage(state) {
  if (!state.packageValue) throw new TypeError('Import a valid lfea-mesh-package/v1 before editing or solving.');
  return state.packageValue;
}

function collectionAt(packageValue, path) {
  assertCollectionPath(path);
  const value = getAtPath(packageValue, path);
  if (!Array.isArray(value)) throw new TypeError(`${path} is not an LFEA collection.`);
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
    if (!isRecord(current[key])) throw new TypeError(`Missing LFEA package path: ${path}.`);
    current = current[key];
  }
  current[keys.at(-1)] = replacement;
  return result;
}

function assertCollectionPath(path) {
  if (!LFEA_COLLECTION_PATHS.includes(path)) throw new TypeError(`Unsupported LFEA collection path: ${path}.`);
}

function assertResultMode(mode) {
  if (!LFEA_RESULT_MODES.includes(mode)) throw new TypeError(`Unsupported LFEA result mode: ${mode}.`);
}

function assertRecord(value) {
  if (!isRecord(value)) throw new TypeError('LFEA record must be a JSON object.');
}

function assertIndex(rows, index, path) {
  if (!Number.isInteger(index) || index < 0 || index >= rows.length) {
    throw new RangeError(`LFEA record index ${index} is outside ${path}.`);
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
