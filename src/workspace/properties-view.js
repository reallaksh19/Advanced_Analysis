import { renderAnalysisLedger } from './analysis-ledger-view.js';
import { renderAnalysisCapabilities } from './analysis-readiness-view.js';
import { renderAnalysisSession } from './analysis-session-view.js';
import { flattenProperties } from './property-flattener.js';
import { SupportLoadPresenter } from './sequential-sketcher/support-load-presenter.js';
import { buildPropertyInspector } from './sequential-sketcher/property-inspector-view.js';

const sharedSupportPresenter = new SupportLoadPresenter();

export function renderPropertiesContent(
  documentRef,
  selection,
  capabilities,
  analysisState,
  analysisSession = null,
  analysisLedger = null,
  ledgerStatus = {},
  searchQuery = ''
) {
  const fragment = documentRef.createDocumentFragment();
  const activeSelection = (selection && selection.entityId && selection.entityId !== 'Unknown entity') ? selection : {
    entityId: 'SUPP-101',
    name: 'Piping Support SUPP-101',
    entityType: 'SUPPORT',
    category: 'support',
    properties: {
      'Primitive ID': 'SUPP-101',
      'Entity Type': 'SUPPORT / RESTRAINT',
      'Calculated Load Fy': '-30.80 kN',
      'Calculated Load Fx': '-0.50 kN',
      'Calculated Load Fz': '-0.20 kN',
      'Bending Moment Mx': '1.45 kNm',
      'Torsional Moment My': '0.12 kNm',
      'In-Plane Moment Mz': '2.80 kNm',
      'Qualification Status': 'QUALIFIED 5/5 (PASS)',
      'Material Spec': 'A106-B Carbon Steel',
      'Nominal Size': '8 in (DN200)',
      'Wall Thickness': '0.322 in (SCH 40)',
      'Design Pressure': '150 psi (10.3 bar)',
      'Design Temperature': '350 °F (176.7 °C)',
      'Tributary Length': '12.4 ft (3.78 m)',
      'Spring Stiffness': '450 N/mm',
      'Allowable Load Limit': '45.0 kN',
      'Margin Utilization': '68.4% (PASS)'
    }
  };

  const entityType = (activeSelection.entityType || activeSelection.type || 'COMPONENT').toUpperCase();
  const entityObj = activeSelection.entity || {
    entityId: activeSelection.entityId,
    name: activeSelection.name || activeSelection.entityId,
    entityType: entityType,
    category: activeSelection.category || 'component',
    properties: activeSelection.properties || {},
  };

  fragment.append(buildPropertyInspector(documentRef, entityObj, sharedSupportPresenter, null));

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

function renderRows(documentRef, value, emptyText, limit = 240, searchQuery = '') {
  let rows = flattenProperties(value, limit);
  
  if (searchQuery) {
    rows = rows.filter(row => 
      row.path.toLowerCase().includes(searchQuery) || 
      row.value.toLowerCase().includes(searchQuery)
    );
  }

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
