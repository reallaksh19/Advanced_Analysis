import { LFEA_COLLECTION_PATHS } from '../lfea-workbench-model.js';
import { qualityEvidenceRows } from '../lfea-quality-adapter.js';
import { lfeaRecordTable, lfeaResultTable } from '../lfea-workbench-tables.js';
import {
  valueAtPath,
  workbenchButton,
  workbenchElement,
  workbenchJsonBlock,
} from '../workbench-dom.js';

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
  const textarea = workbenchElement(root, 'textarea');
  textarea.dataset.role = 'lfea-record-json';
  textarea.spellcheck = false;
  textarea.value = uiState.selectedIndex >= 0
    ? JSON.stringify(rows[uiState.selectedIndex], null, 2)
    : '{}';

  const actions = workbenchElement(root, 'div', 'lfea-workbench__record-actions');
  const add = workbenchButton(root, 'Add record', () =>
    handlers.onAddRecord(uiState.collectionPath, textarea.value));
  const update = workbenchButton(root, 'Update record', () =>
    handlers.onUpdateRecord(uiState.collectionPath, uiState.selectedIndex, textarea.value));
  update.disabled = uiState.selectedIndex < 0;
  const remove = workbenchButton(root, 'Delete record', () => {
    handlers.onDeleteRecord(uiState.collectionPath, uiState.selectedIndex);
    handlers.onRecordSelect(-1);
  });
  remove.disabled = uiState.selectedIndex < 0;
  actions.append(add, update, remove);

  wrapper.append(
    workbenchElement(root, 'label', 'lfea-shell-v2__control-label', 'Collection '),
    select,
    table,
    textarea,
    actions,
  );
  return wrapper;
}

function resultsInspector(root, state) {
  const wrapper = workbenchElement(root, 'div', 'lfea-shell-v2__results');
  const execution = state.execution;
  if (!execution) {
    wrapper.append(message(root, 'No current execution exists for this model.'));
    return wrapper;
  }
  wrapper.append(summaryFacts(root, execution));
  if (execution.result) {
    wrapper.append(
      lfeaResultTable(root, 'Displacements', execution.result.nodalDisplacements ?? []),
      lfeaResultTable(root, 'Reactions', execution.result.reactions ?? []),
      lfeaResultTable(root, 'Raw stress', rawStressRows(execution.result)),
      lfeaResultTable(
        root,
        'Mesh quality evidence — no acceptance threshold applied',
        qualityEvidenceRows(execution.result),
      ),
    );
  }
  if (execution.stressProjection) {
    wrapper.append(
      workbenchElement(root, 'h3', null, 'Projected stress — NON-AUTHORITATIVE REVIEW PROJECTION'),
      lfeaResultTable(root, 'Projected nodal stress', execution.stressProjection.nodalValues ?? []),
    );
  }
  wrapper.append(workbenchJsonBlock(root, reviewSummary(execution), 'lfea-review-summary'));
  return wrapper;
}

function summaryFacts(root, execution) {
  const section = workbenchElement(root, 'section', 'lfea-shell-v2__result-summary');
  section.append(
    fact(root, 'Pipeline', execution.status),
    fact(root, 'Preflight', execution.preflight?.status ?? 'Not run'),
    fact(root, 'Solver', execution.result?.status ?? 'Not run'),
    fact(root, 'Review', execution.review?.status ?? 'Not run'),
    fact(root, 'Export', execution.evidenceExport?.status ?? 'Not available'),
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
