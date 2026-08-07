import { LFEA_COLLECTION_PATHS } from '../lfea-workbench-model.js';
import { qualityEvidenceRows } from '../lfea-quality-adapter.js';
import { lfeaRecordTable, lfeaResultTable } from '../lfea-workbench-tables.js';
import {
  valueAtPath,
  workbenchElement,
  workbenchJsonBlock,
} from '../workbench-dom.js';
import { renderLfeaStructuredEditor } from './structured-editor.js';

export function renderLfeaInspector(root, state, uiState, handlers) {
  const panel = workbenchElement(root, 'aside', 'lfea-shell-v2__inspector');
  panel.append(workbenchElement(root, 'h2', null, 'Inspector'));

  if (uiState.activeSection === 'RESULTS') {
    panel.append(resultsInspector(root, state));
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

function resultsInspector(root, state) {
  const wrapper = workbenchElement(root, 'div', 'lfea-shell-v2__results');
  const snapshot = createLfeaInspectorValueSnapshot(state);
  if (!state.execution) {
    wrapper.append(message(root, 'No current execution exists for this model.'));
    return wrapper;
  }
  wrapper.append(summaryFacts(root, snapshot));
  if (state.execution.result) {
    wrapper.append(
      lfeaResultTable(root, 'Displacements', snapshot.displacements),
      lfeaResultTable(root, 'Reactions', snapshot.reactions),
      lfeaResultTable(root, 'Raw stress', snapshot.rawStress),
      lfeaResultTable(
        root,
        'Mesh quality evidence — no acceptance threshold applied',
        snapshot.qualityEvidence,
      ),
    );
  }
  if (state.execution.stressProjection) {
    wrapper.append(
      workbenchElement(root, 'h3', null, 'Projected stress — NON-AUTHORITATIVE REVIEW PROJECTION'),
      lfeaResultTable(root, 'Projected nodal stress', snapshot.projectedStress),
    );
  }
  wrapper.append(workbenchJsonBlock(
    root,
    snapshot.reviewSummary,
    'lfea-review-summary-detail',
  ));
  return wrapper;
}

function summaryFacts(root, snapshot) {
  const section = workbenchElement(root, 'section', 'lfea-shell-v2__result-summary');
  section.append(
    fact(root, 'Pipeline', snapshot.pipelineStatus ?? 'Not run'),
    fact(root, 'Preflight', snapshot.preflightStatus ?? 'Not run'),
    fact(root, 'Solver', snapshot.solverStatus ?? 'Not run'),
    fact(root, 'Review', snapshot.reviewStatus ?? 'Not run'),
    fact(root, 'Export', snapshot.evidenceExportStatus ?? 'Not available'),
  );
  return section;
}

function fact(root, label, value) {
  const row = workbenchElement(root, 'div', 'lfea-shell-v2__fact');
  row.append(workbenchElement(root, 'span', null, label), workbenchElement(root, 'strong', null, String(value)));
  return row;
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
