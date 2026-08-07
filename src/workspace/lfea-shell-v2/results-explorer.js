import {
  workbenchButton,
  workbenchElement,
  workbenchJsonDisclosure,
} from '../workbench-dom.js';
import { renderLfeaExplorerTable } from './results-table.js';
import { createLfeaResultsViewModel } from './results-view-model.js';

export function renderLfeaResultsExplorer(root, state, uiState, handlers) {
  const model = createLfeaResultsViewModel(state);
  const section = workbenchElement(root, 'section', 'lfea-results-explorer');
  section.dataset.role = 'lfea-results-explorer';
  if (!state.execution) {
    section.append(workbenchElement(root, 'p', 'lfea-shell-v2__muted', 'No current execution exists for this model.'));
    return section;
  }

  const selected = model.views.find((view) => view.id === uiState.viewId) ?? model.views[0];
  section.append(
    explorerTabs(root, model, selected.id, handlers),
    provenanceStrip(root, model, selected),
    explorerBody(root, model, selected, uiState, handlers),
  );
  return section;
}

function explorerTabs(root, model, selectedId, handlers) {
  const nav = workbenchElement(root, 'div', 'lfea-results-explorer__tabs');
  nav.setAttribute('role', 'tablist');
  for (const view of model.views) {
    const suffix = view.available ? '' : ' — unavailable';
    const button = workbenchButton(root, `${view.label}${suffix}`, () => handlers.onResultsView(view.id));
    button.dataset.role = 'lfea-results-view';
    button.dataset.view = view.id;
    button.dataset.available = String(view.available);
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(view.id === selectedId));
    nav.append(button);
  }
  return nav;
}

function provenanceStrip(root, model, view) {
  const strip = workbenchElement(root, 'section', 'lfea-results-explorer__provenance');
  strip.dataset.role = 'lfea-results-provenance';
  strip.append(
    fact(root, 'Source', view.sourcePath),
    fact(root, 'Source class', view.sourceClass),
    fact(root, 'Rows', view.rowCount),
    fact(root, 'Package', model.packageSemanticHash ?? '—'),
    fact(root, 'Model version', model.modelVersion ?? '—'),
    fact(root, 'Run', model.runId ?? '—'),
  );
  if (view.authority) {
    const authority = fact(root, 'Authority', view.authority);
    authority.dataset.role = 'lfea-results-authority';
    authority.dataset.authority = view.authority;
    strip.append(authority);
  }
  if (view.id === 'RAW_STRESS' || view.id === 'PROJECTED_STRESS') {
    strip.append(fact(root, 'Stress unit', model.stressUnit ?? 'Not declared'));
  }
  return strip;
}

function explorerBody(root, model, view, uiState, handlers) {
  const body = workbenchElement(root, 'div', 'lfea-results-explorer__body');
  body.dataset.role = 'lfea-results-view-body';
  body.dataset.view = view.id;
  body.append(workbenchElement(root, 'h3', null, view.label));
  if (!view.available) {
    body.append(workbenchElement(root, 'p', 'lfea-shell-v2__muted', 'This result category is not available for the current execution.'));
    return body;
  }
  if (view.id === 'OVERVIEW') {
    body.append(overview(root, model));
    return body;
  }
  if (view.id === 'REVIEW') {
    body.append(reviewEvidence(root, model));
    return body;
  }
  body.append(renderLfeaExplorerTable(root, model.datasets[view.id] ?? [], uiState, handlers));
  return body;
}

function overview(root, model) {
  const wrapper = workbenchElement(root, 'div', 'lfea-results-explorer__overview');
  wrapper.append(
    fact(root, 'Pipeline', model.pipelineStatus ?? 'Not run'),
    fact(root, 'Preflight', model.preflightStatus ?? 'Not run'),
    fact(root, 'Solver', model.solverStatus ?? 'Not run'),
    fact(root, 'Review', model.reviewStatus ?? 'Not run'),
    fact(root, 'Export', model.evidenceExportStatus ?? 'Not available'),
    fact(root, 'Result hash', model.resultSemanticHash ?? '—'),
    fact(root, 'Review hash', model.reviewSemanticHash ?? '—'),
    fact(root, 'Evidence hash', model.evidenceExportSemanticHash ?? '—'),
  );
  const inventory = workbenchElement(root, 'dl', 'lfea-results-explorer__inventory');
  for (const view of model.views.filter((row) => !['OVERVIEW', 'REVIEW'].includes(row.id))) {
    inventory.append(
      workbenchElement(root, 'dt', null, view.label),
      workbenchElement(root, 'dd', null, view.available ? `${view.rowCount} rows` : 'Unavailable'),
    );
  }
  wrapper.append(inventory);
  return wrapper;
}

function reviewEvidence(root, model) {
  const wrapper = workbenchElement(root, 'div', 'lfea-results-explorer__review');
  wrapper.append(
    fact(root, 'Authority policy', model.authorityPolicy ?? '—'),
    fact(root, 'Result hash', model.resultSemanticHash ?? '—'),
    fact(root, 'Review hash', model.reviewSemanticHash ?? '—'),
    fact(root, 'Evidence hash', model.evidenceExportSemanticHash ?? '—'),
  );
  if (model.review) {
    wrapper.append(
      workbenchJsonDisclosure(root, model.review.equilibriumTotals, 'lfea-results-equilibrium', 'Equilibrium totals'),
      workbenchJsonDisclosure(root, model.review.energyConsistency, 'lfea-results-energy', 'Energy consistency'),
      workbenchJsonDisclosure(root, model.review.review, 'lfea-results-review-record', 'Review record'),
      workbenchJsonDisclosure(root, model.review.evidenceExport, 'lfea-results-evidence-record', 'Evidence export record'),
    );
  }
  return wrapper;
}

function fact(root, label, value) {
  const row = workbenchElement(root, 'div', 'lfea-shell-v2__fact');
  row.append(
    workbenchElement(root, 'span', null, label),
    workbenchElement(root, 'strong', null, String(value)),
  );
  return row;
}
