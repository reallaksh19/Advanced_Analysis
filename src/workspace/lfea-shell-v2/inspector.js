import { LFEA_COLLECTION_PATHS } from '../lfea-workbench-model.js';
import { qualityEvidenceRows } from '../lfea-quality-adapter.js';
import { lfeaRecordTable } from '../lfea-workbench-tables.js';
import {
  valueAtPath,
  workbenchElement,
} from '../workbench-dom.js';
import { renderLfeaResultsExplorer } from './results-explorer.js';
import { renderLfeaStructuredEditor } from './structured-editor.js';

export function renderLfeaInspector(root, state, uiState, handlers) {
  const panel = workbenchElement(root, 'aside', 'lfea-shell-v2__inspector');
  panel.append(workbenchElement(root, 'h2', null, 'Inspector'));

  if (uiState.activeSection === 'RESULTS') {
    panel.append(renderLfeaResultsExplorer(root, state, uiState.results, handlers));
    return panel;
  }
  if (uiState.activeSection === 'VERIFICATION') {
    panel.append(message(root, 'Benchmark and convergence evidence are available in the verification area below the viewport.'));
    return panel;
  }
  if (uiState.activeSection === 'SOURCE') {
    panel.append(message(root, 'The full hash-valid package is available in the Advanced source drawer.'));
    return panel;
  }
  panel.append(recordInspector(root, state, uiState, handlers));
  return panel;
}

export function createLfeaInspectorValueSnapshot(state) {
  const execution = state.execution;
  const result = execution?.result;
  return Object.freeze({
    pipelineStatus: execution?.status ?? null,
    preflightStatus: execution?.preflight?.status ?? null,
    solverStatus: result?.status ?? null,
    reviewStatus: execution?.review?.status ?? null,
    evidenceExportStatus: execution?.evidenceExport?.status ?? null,
    displacements: result?.nodalDisplacements ?? [],
    reactions: result?.reactions ?? [],
    rawStress: rawStressRows(result),
    qualityEvidence: result ? qualityEvidenceRows(result) : [],
    projectedStress: execution?.stressProjection?.nodalValues ?? [],
    reviewSummary: execution ? reviewSummary(execution) : null,
  });
}

function recordInspector(root, state, uiState, handlers) {
  const wrapper = workbenchElement(root, 'div', 'lfea-shell-v2__record-inspector');
  if (!state.packageValue) {
    wrapper.append(message(root, 'No model is loaded.'));
    return wrapper;
  }

  const select = workbenchElement(root, 'select');
  select.dataset.role = 'lfea-collection-path';
  for (const path of LFEA_COLLECTION_PATHS) {
    const option = workbenchElement(root, 'option', null, path);
    option.value = path;
    option.selected = path === uiState.collectionPath;
    select.append(option);
  }
  select.addEventListener('change', () => handlers.onCollectionPath(select.value));

  const rows = valueAtPath(state.packageValue, uiState.collectionPath);
  const table = lfeaRecordTable(root, rows, uiState.selectedIndex, handlers.onRecordSelect);
  wrapper.append(
    workbenchElement(root, 'label', 'lfea-shell-v2__control-label', 'Collection '),
    select,
    table,
    renderLfeaStructuredEditor(
      root,
      state,
      uiState.collectionPath,
      uiState.selectedIndex,
      handlers,
    ),
  );
  return wrapper;
}

function message(root, text) {
  return workbenchElement(root, 'p', 'lfea-shell-v2__muted', text);
}

function rawStressRows(result) {
  if (!result) return [];
  return Array.isArray(result.integrationPointResults)
    ? result.integrationPointResults
    : result.elementStresses ?? [];
}

function reviewSummary(execution) {
  return {
    pipelineStatus: execution.status,
    failedStage: execution.failedStage,
    solverStatus: execution.result?.status ?? null,
    reviewStatus: execution.review?.status ?? null,
    evidenceExportStatus: execution.evidenceExport?.status ?? null,
    authorityPolicy: execution.authorityPolicy,
    equilibriumTotals: execution.result?.equilibriumTotals ?? null,
    energyConsistency: execution.result?.energyConsistency ?? null,
  };
}
