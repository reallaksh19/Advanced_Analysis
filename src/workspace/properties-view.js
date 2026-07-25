import { renderAnalysisLedger } from './analysis-ledger-view.js';
import { renderAnalysisCapabilities } from './analysis-readiness-view.js';
import { renderAnalysisSession } from './analysis-session-view.js';
import { flattenProperties } from './property-flattener.js';

export function renderPropertiesContent(
  documentRef,
  selection,
  capabilities,
  analysisState,
  analysisSession = null,
  analysisLedger = null,
  ledgerStatus = {},
) {
  const fragment = documentRef.createDocumentFragment();
  fragment.append(renderSelectionHeader(documentRef, selection));
  fragment.append(renderRows(documentRef, selection.properties, 'No properties supplied for this selection.'));
  fragment.append(renderAnalysisCapabilities(documentRef, capabilities, analysisSession));
  fragment.append(renderAnalysisSession(documentRef, analysisSession));
  fragment.append(renderAnalysis(documentRef, analysisState));
  fragment.append(renderAnalysisLedger(documentRef, analysisLedger, ledgerStatus));
  return fragment;
}

function renderSelectionHeader(documentRef, selection) {
  const heading = documentRef.createElement('div');
  heading.className = 'properties-selection';
  const label = documentRef.createElement('span');
  label.textContent = 'Selected entity';
  const identity = documentRef.createElement('strong');
  identity.textContent = selection.entityId;
  const type = documentRef.createElement('em');
  type.textContent = selection.entityType;
  heading.append(label, identity, type);
  return heading;
}

function renderAnalysis(documentRef, state) {
  const section = documentRef.createElement('section');
  section.className = 'analysis-result';
  section.dataset.role = 'analysis-result';
  const heading = documentRef.createElement('h3');
  heading.textContent = 'Analysis result';
  const status = documentRef.createElement('output');
  status.dataset.role = 'analysis-status';
  status.textContent = analysisStatusText(state);
  section.append(heading, status);

  if (state.status === 'completed') {
    section.append(renderRows(documentRef, {
      summary: state.result.summary,
      results: state.result.results,
      warnings: state.result.warnings,
      diagnostics: state.result.diagnostics,
    }, 'Analysis completed without displayable result fields.', 120));
  }
  if (state.status === 'failed') {
    const error = documentRef.createElement('p');
    error.className = 'analysis-error';
    error.textContent = `${state.code}: ${state.message}`;
    section.append(error);
    if (state.details && Object.keys(state.details).length) {
      section.append(renderRows(documentRef, state.details, '', 40));
    }
  }
  return section;
}

function renderRows(documentRef, value, emptyText, limit = 240) {
  const rows = flattenProperties(value, limit);
  if (!rows.length) {
    const empty = documentRef.createElement('p');
    empty.className = 'panel-empty';
    empty.textContent = emptyText;
    return empty;
  }

  const table = documentRef.createElement('dl');
  table.className = 'properties-grid';
  rows.forEach((row) => {
    const term = documentRef.createElement('dt');
    term.textContent = row.path;
    term.title = row.path;
    const description = documentRef.createElement('dd');
    description.textContent = row.value;
    description.title = row.value;
    table.append(term, description);
  });
  return table;
}

function analysisStatusText(state) {
  if (state.status === 'running') return `Running ${state.analysisType} for ${state.targetId}…`;
  if (state.status === 'completed') return `${state.analysisType} completed · ${state.result.status}`;
  if (state.status === 'failed') return `${state.analysisType} failed`;
  return 'No analysis has been run for this selection.';
}
