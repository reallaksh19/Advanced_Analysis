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
import {
  assertCollectionPath,
  assertIndex,
  assertNodeCoordinates,
  assertRecord,
  assertResultMode,
  collectionAt,
  committedState,
  failedState,
  freeze,
  importedState,
  isRecord,
  requirePackage,
  setAtPath,
} from './lfea-workbench-state.js';

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
    progress: null,
    nodeDraft: null,
    resultMode,
    past: [],
    future: [],
    diagnostics: [],
  });
  const listeners = new Set();
  if (configuration.initialDocument !== undefined) {
    state = importedState(state, configuration.initialDocument, HISTORY_LIMIT);
  }

  function publish(next) {
    state = freeze(next);
    listeners.forEach((listener) => listener(state));
    return state;
  }

  function importDocument(value) {
    try {
      return publish(importedState(state, value, HISTORY_LIMIT));
    } catch (error) {
      return publish(failedState(state, error, 'LFEA_IMPORT_REJECTED'));
    }
  }

  function replaceDocument(value) {
    try {
      const packageValue = resealLfeaMeshPackage(value);
      return publish(committedState(state, packageValue, HISTORY_LIMIT));
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
    beginRun();
    const execution = executeLfeaWorkbench(
      requirePackage(state),
      configuration.pipelineOptions,
    );
    return completeRun(execution);
  }

  function beginRun() {
    requirePackage(state);
    return publish({
      ...state,
      status: 'RUNNING',
      progress: { stage: 'QUEUED', index: 0, total: 7 },
      diagnostics: [],
    });
  }

  function updateRunProgress(progress) {
    if (state.status !== 'RUNNING') return state;
    return publish({ ...state, progress: freeze(structuredClone(progress)) });
  }

  function completeRun(execution) {
    if (!isRecord(execution)) {
      throw new TypeError('LFEA execution result must be an object.');
    }
    return publish({
      ...state,
      status: execution.status,
      execution,
      progress: null,
      diagnostics: execution.diagnostics ?? [],
    });
  }

  function failRun(error) {
    return publish({
      ...failedState(state, error, 'LFEA_WORKER_FAILURE'),
      progress: null,
    });
  }

  function cancelRun() {
    return publish({
      ...state,
      status: state.packageValue ? 'READY' : 'EMPTY',
      progress: null,
      diagnostics: [{
        severity: 'WARNING',
        code: 'LFEA_RUN_CANCELLED',
        message: 'LFEA execution was cancelled before qualification completed.',
      }],
    });
  }

  function previewNodeMove(nodeId, x, y) {
    assertNodeCoordinates(nodeId, x, y);
    return publish({
      ...state,
      nodeDraft: freeze({ nodeId, x, y }),
      diagnostics: [],
    });
  }

  function commitNodeMove() {
    if (!state.nodeDraft) return state;
    const { nodeId, x, y } = state.nodeDraft;
    const next = moveNode(nodeId, x, y);
    return publish({ ...next, nodeDraft: null });
  }

  function cancelNodeMove() {
    if (!state.nodeDraft) return state;
    return publish({ ...state, nodeDraft: null, diagnostics: [] });
  }

  function reportEditError(path, index, error) {
    const location = Number.isInteger(index) ? `${path}[${index}]` : path;
    return publish(failedState(
      state,
      new TypeError(`${location}: ${error instanceof Error ? error.message : 'Invalid record edit.'}`),
      'LFEA_RECORD_EDIT_REJECTED',
    ));
  }

  function undo() {
    if (!state.past.length) return state;
    const packageValue = state.past.at(-1);
    return publish({
      ...state,
      status: 'READY',
      packageValue,
      execution: null,
      progress: null,
      nodeDraft: null,
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
      progress: null,
      nodeDraft: null,
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
    previewNodeMove,
    commitNodeMove,
    cancelNodeMove,
    setResultMode,
    run,
    beginRun,
    updateRunProgress,
    completeRun,
    failRun,
    cancelRun,
    reportEditError,
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
