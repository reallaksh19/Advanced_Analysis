import {
  LFEA_WORKBENCH_DOCUMENT_SCHEMA,
  normalizeLfeaMeshPackage,
  resealLfeaMeshPackage,
} from './lfea-workbench-model.js';
import {
  assertCollectionPath,
  assertIndex,
  assertNodeCoordinates,
  assertRecord,
  collectionAt,
  committedState,
  freeze,
  importedState,
  requirePackage,
  setAtPath,
} from './lfea-workbench-state.js';
import { editFailureState, isCurrentExecution } from './lfea-workbench-run-state.js';

export function createLfeaWorkbenchDocumentStore(options) {
  const {
    getState,
    publish,
    commitTransition,
    historyLimit,
  } = options;

  function importDocument(value) {
    const state = getState();
    try {
      return commitTransition(importedState(state, value, historyLimit));
    } catch (error) {
      return publish(editFailureState(state, error, 'LFEA_IMPORT_REJECTED'));
    }
  }

  function replaceDocument(value) {
    const state = getState();
    try {
      const packageValue = resealLfeaMeshPackage(value);
      return commitTransition(committedState(state, packageValue, historyLimit));
    } catch (error) {
      return publish(editFailureState(state, error, 'LFEA_EDIT_REJECTED'));
    }
  }

  function replaceCollection(path, rows) {
    assertCollectionPath(path);
    if (!Array.isArray(rows)) {
      throw new TypeError('LFEA collection replacement requires an array.');
    }
    return replaceDocument(setAtPath(
      requirePackage(getState()),
      path,
      structuredClone(rows),
    ));
  }

  function addRecord(path, record) {
    assertRecord(record);
    return replaceCollection(path, [
      ...collectionAt(requirePackage(getState()), path),
      structuredClone(record),
    ]);
  }

  function updateRecord(path, index, record) {
    assertRecord(record);
    const rows = collectionAt(requirePackage(getState()), path);
    assertIndex(rows, index, path);
    return replaceCollection(path, rows.map((row, rowIndex) =>
      rowIndex === index ? structuredClone(record) : row));
  }

  function deleteRecord(path, index) {
    const rows = collectionAt(requirePackage(getState()), path);
    assertIndex(rows, index, path);
    return replaceCollection(path, rows.filter((_, rowIndex) => rowIndex !== index));
  }

  function moveNode(nodeId, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError('LFEA node coordinates must be finite.');
    }
    const rows = collectionAt(requirePackage(getState()), 'nodes');
    const index = rows.findIndex((row) => row.nodeId === nodeId);
    if (index < 0) throw new TypeError(`Unknown LFEA node: ${nodeId}.`);
    return updateRecord('nodes', index, { ...rows[index], x, y });
  }

  function previewNodeMove(nodeId, x, y) {
    assertNodeCoordinates(nodeId, x, y);
    const state = getState();
    return publish({
      ...state,
      nodeDraft: freeze({ nodeId, x, y }),
      diagnostics: [],
    });
  }

  function commitNodeMove() {
    const state = getState();
    if (!state.nodeDraft) return state;
    const { nodeId, x, y } = state.nodeDraft;
    return moveNode(nodeId, x, y);
  }

  function cancelNodeMove() {
    const state = getState();
    if (!state.nodeDraft) return state;
    return publish({ ...state, nodeDraft: null, diagnostics: [] });
  }

  function reportEditError(path, index, error) {
    const state = getState();
    const location = Number.isInteger(index) ? `${path}[${index}]` : path;
    return publish(editFailureState(
      state,
      new TypeError(`${location}: ${error instanceof Error ? error.message : 'Invalid record edit.'}`),
      'LFEA_RECORD_EDIT_REJECTED',
    ));
  }

  function undo() {
    const state = getState();
    if (!state.past.length) return state;
    return commitTransition({
      ...state,
      status: 'READY',
      packageValue: state.past.at(-1),
      execution: null,
      progress: null,
      nodeDraft: null,
      past: state.past.slice(0, -1),
      future: [state.packageValue, ...state.future].filter(Boolean).slice(0, historyLimit),
      diagnostics: [],
    });
  }

  function redo() {
    const state = getState();
    if (!state.future.length) return state;
    return commitTransition({
      ...state,
      status: 'READY',
      packageValue: state.future[0],
      execution: null,
      progress: null,
      nodeDraft: null,
      past: [...state.past, state.packageValue].filter(Boolean).slice(-historyLimit),
      future: state.future.slice(1),
      diagnostics: [],
    });
  }

  function exportDocument() {
    return freeze({
      schema: LFEA_WORKBENCH_DOCUMENT_SCHEMA,
      packageValue: normalizeLfeaMeshPackage(requirePackage(getState())),
    });
  }

  function exportPackage() {
    return normalizeLfeaMeshPackage(requirePackage(getState()));
  }

  function exportEvidence() {
    const state = getState();
    if (!isCurrentExecution(state)
      || state.execution?.evidenceExport?.status !== 'QUALIFIED_EXPORT') {
      throw new TypeError('Qualified LFEA evidence export is unavailable.');
    }
    return state.execution.evidenceExport;
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
    reportEditError,
    undo,
    redo,
    exportDocument,
    exportPackage,
    exportEvidence,
  });
}
