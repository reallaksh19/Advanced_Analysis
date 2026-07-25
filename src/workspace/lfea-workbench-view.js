/**
 * DOM view for LFEA mesh editing, solving, result review, and evidence export.
 */
import {
  LFEA_COLLECTION_PATHS,
  LFEA_RESULT_MODES,
  lfeaDisplayGeometry,
} from './lfea-workbench-model.js';
import { renderLfeaWorkbenchSvg } from './lfea-workbench-svg.js';
export class LfeaWorkbenchView {
  /**
   * @param {Element|null} rootElement Workbench host.
   */
  constructor(rootElement) {
    this.rootElement = rootElement;
    this.handlers = null;
    this.collectionPath = LFEA_COLLECTION_PATHS[0];
    this.selectedIndex = -1;
  }

  init(handlers) {
    this.handlers = handlers;
  }

  render(state) {
    if (!this.rootElement || !this.handlers) return;
    const section = element(this.rootElement, 'section', 'lfea-workbench');
    section.dataset.role = 'lfea-workbench';
    section.append(this.header(state), this.toolbar(state), this.content(state));
    this.rootElement.replaceChildren(section);
  }

  destroy() {
    this.rootElement?.replaceChildren();
    this.handlers = null;
  }

  header(state) {
    const header = element(this.rootElement, 'header', 'lfea-workbench__header');
    const block = element(this.rootElement, 'div');
    block.append(
      element(this.rootElement, 'span', 'panel-eyebrow', 'Independent mesh-to-evidence pipeline'),
      element(this.rootElement, 'h1', null, 'LFEA Workbench'),
      element(this.rootElement, 'p', null, 'Edit T3/Q4 mesh packages, solve, review raw evidence, and export deterministically.'),
    );
    const status = element(this.rootElement, 'output', 'lfea-workbench__status', state.status);
    status.dataset.status = state.status;
    status.setAttribute('aria-live', 'polite');
    header.append(block, status);
    return header;
  }

  toolbar(state) {
    const toolbar = element(this.rootElement, 'div', 'lfea-workbench__toolbar');
    const mock = actionButton(this.rootElement, '[SIMULATED] Load Mock Data', this.handlers.onMock);
    mock.dataset.role = 'lfea-mock';
    mock.dataset.mockData = 'true';
    const file = element(this.rootElement, 'input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.dataset.role = 'lfea-import';
    file.addEventListener('change', () => this.handlers.onFile(file.files?.[0] ?? null));
    const run = actionButton(this.rootElement, 'Validate, adapt & solve', this.handlers.onRun);
    run.dataset.role = 'lfea-run';
    run.disabled = !state.packageValue;
    const exportDocument = actionButton(this.rootElement, 'Export mesh package', this.handlers.onExportDocument);
    exportDocument.disabled = !state.packageValue;
    const exportEvidence = actionButton(this.rootElement, 'Export evidence bundle', this.handlers.onExportEvidence);
    exportEvidence.disabled = state.execution?.evidenceExport?.status !== 'QUALIFIED_EXPORT';
    const undo = actionButton(this.rootElement, 'Undo', this.handlers.onUndo);
    undo.disabled = !state.past.length;
    const redo = actionButton(this.rootElement, 'Redo', this.handlers.onRedo);
    redo.disabled = !state.future.length;
    const mode = element(this.rootElement, 'select');
    mode.dataset.role = 'lfea-result-mode';
    for (const value of LFEA_RESULT_MODES) {
      const option = element(this.rootElement, 'option', null, value.replaceAll('_', ' '));
      option.value = value;
      option.selected = value === state.resultMode;
      option.disabled = value === 'PROJECTED_STRESS' && !state.execution?.stressProjection;
      mode.append(option);
    }
    mode.addEventListener('change', () => this.handlers.onResultMode(mode.value));
    toolbar.append(mock, file, run, exportDocument, exportEvidence, undo, redo, mode);
    return toolbar;
  }

  content(state) {
    const grid = element(this.rootElement, 'div', 'lfea-workbench__grid');
    const documentCard = card(this.rootElement, 'Validated lfea-mesh-package/v1');
    documentCard.body.append(this.documentEditor(state.packageValue));
    const recordsCard = card(this.rootElement, 'Mesh, materials, assignments, loads and constraints');
    recordsCard.body.append(this.recordEditor(state));
    const svgCard = card(this.rootElement, 'Mesh and result field');
    const svg = element(this.rootElement, 'div', 'lfea-workbench__svg');
    const geometry = lfeaDisplayGeometry(state.packageValue, state.execution, state.resultMode);
    renderLfeaWorkbenchSvg(svg, geometry, state.packageValue, { onMoveNode: this.handlers.onMoveNode });
    svgCard.body.append(svg, element(this.rootElement, 'p', 'lfea-workbench__authority', geometry.authority));
    const resultsCard = card(this.rootElement, 'Qualified results, review and diagnostics');
    resultsCard.body.append(this.results(state));
    grid.append(documentCard.section, recordsCard.section, svgCard.section, resultsCard.section);
    return grid;
  }

  documentEditor(packageValue) {
    const wrapper = element(this.rootElement, 'div', 'lfea-workbench__editor');
    const textarea = element(this.rootElement, 'textarea');
    textarea.dataset.role = 'lfea-package-json';
    textarea.spellcheck = false;
    textarea.value = packageValue ? JSON.stringify(packageValue, null, 2) : '';
    textarea.placeholder = 'Import a hash-valid lfea-mesh-package/v1.';
    const apply = actionButton(this.rootElement, 'Apply and reseal local edit', () => this.handlers.onApplyJson(textarea.value));
    apply.disabled = !packageValue;
    wrapper.append(textarea, apply);
    return wrapper;
  }

  recordEditor(state) {
    const wrapper = element(this.rootElement, 'div', 'lfea-workbench__records');
    if (!state.packageValue) {
      const mock = actionButton(this.rootElement, '[SIMULATED] Load Collection Mock Data', this.handlers.onMock);
      mock.dataset.role = 'lfea-collection-mock';
      mock.dataset.mockData = 'true';
      wrapper.append(element(this.rootElement, 'p', null, 'No mesh package is loaded.'), mock);
      return wrapper;
    }
    const select = element(this.rootElement, 'select');
    for (const path of LFEA_COLLECTION_PATHS) {
      const option = element(this.rootElement, 'option', null, path);
      option.value = path;
      option.selected = path === this.collectionPath;
      select.append(option);
    }
    select.addEventListener('change', () => {
      this.collectionPath = select.value;
      this.selectedIndex = -1;
      this.render(state);
    });
    const collectionMock = actionButton(this.rootElement, `[SIMULATED] Reload Mock for ${this.collectionPath}`, this.handlers.onMock);
    collectionMock.dataset.role = 'lfea-collection-mock';
    collectionMock.dataset.mockData = 'true';
    const rows = valueAt(state.packageValue, this.collectionPath);
    const table = recordTable(this.rootElement, rows, this.selectedIndex, (index) => {
      this.selectedIndex = index;
      this.render(state);
    });
    const textarea = element(this.rootElement, 'textarea');
    textarea.dataset.role = 'lfea-record-json';
    textarea.value = this.selectedIndex >= 0 ? JSON.stringify(rows[this.selectedIndex], null, 2) : '{}';
    const add = actionButton(this.rootElement, 'Add record', () => this.handlers.onAddRecord(this.collectionPath, textarea.value));
    const update = actionButton(this.rootElement, 'Update record', () => this.handlers.onUpdateRecord(this.collectionPath, this.selectedIndex, textarea.value));
    update.disabled = this.selectedIndex < 0;
    const remove = actionButton(this.rootElement, 'Delete record', () => {
      this.handlers.onDeleteRecord(this.collectionPath, this.selectedIndex);
      this.selectedIndex = -1;
    });
    remove.disabled = this.selectedIndex < 0;
    const actions = element(this.rootElement, 'div', 'lfea-workbench__record-actions');
    actions.append(add, update, remove);
    wrapper.append(select, collectionMock, table, textarea, actions);
    return wrapper;
  }

  results(state) {
    const wrapper = element(this.rootElement, 'div', 'lfea-workbench__results');
    if (state.diagnostics?.length) wrapper.append(jsonBlock(this.rootElement, state.diagnostics, 'lfea-diagnostics'));
    const execution = state.execution;
    if (!execution) {
      wrapper.append(element(this.rootElement, 'p', null, 'No solve has been run for this mesh package.'));
      return wrapper;
    }
    const policy = element(this.rootElement, 'p', 'lfea-workbench__authority', `Raw: ${execution.authorityPolicy.rawStress}. Projected: ${execution.authorityPolicy.projectedStress}.`);
    wrapper.append(policy);
    if (execution.result) {
      wrapper.append(
        resultTable(this.rootElement, 'Displacements', execution.result.nodalDisplacements ?? []),
        resultTable(this.rootElement, 'Reactions', execution.result.reactions ?? []),
        resultTable(this.rootElement, 'Raw stress', rawStressRows(execution.result)),
      );
    }
    if (execution.stressProjection) {
      wrapper.append(
        element(this.rootElement, 'h3', null, 'Projected stress — NON-AUTHORITATIVE REVIEW PROJECTION'),
        resultTable(this.rootElement, 'Projected nodal stress', execution.stressProjection.nodalValues ?? []),
      );
    }
    wrapper.append(jsonBlock(this.rootElement, reviewSummary(execution), 'lfea-review-summary'));
    return wrapper;
  }
}

function recordTable(root, rows, selectedIndex, onSelect) {
  const wrapper = element(root, 'div', 'lfea-workbench__table');
  const table = element(root, 'table');
  const heading = element(root, 'tr');
  ['#', 'Identity', 'Record'].forEach((label) => heading.append(element(root, 'th', null, label)));
  table.append(heading);
  rows.forEach((row, index) => {
    const tr = element(root, 'tr');
    tr.dataset.selected = String(index === selectedIndex);
    tr.tabIndex = 0;
    tr.addEventListener('click', () => onSelect(index));
    tr.append(element(root, 'td', null, String(index + 1)), element(root, 'td', null, identity(row)), element(root, 'td', null, compactJson(row)));
    table.append(tr);
  });
  wrapper.append(table);
  return wrapper;
}

function resultTable(root, title, rows) {
  const section = element(root, 'section', 'lfea-workbench__result-table');
  section.append(element(root, 'h3', null, title));
  const values = rows.slice(0, 200);
  if (!values.length) {
    section.append(element(root, 'p', null, 'No rows.'));
    return section;
  }
  const keys = [...new Set(values.flatMap((row) => Object.keys(row)))].slice(0, 8);
  const table = element(root, 'table');
  const header = element(root, 'tr');
  keys.forEach((key) => header.append(element(root, 'th', null, key)));
  table.append(header);
  values.forEach((row) => {
    const tr = element(root, 'tr');
    keys.forEach((key) => tr.append(element(root, 'td', null, scalar(row[key]))));
    table.append(tr);
  });
  const scroll = element(root, 'div', 'lfea-workbench__table');
  scroll.append(table);
  section.append(scroll);
  return section;
}

function rawStressRows(result) {
  if (Array.isArray(result.integrationPointResults)) return result.integrationPointResults;
  return result.elementStresses ?? [];
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

function card(root, titleText) {
  const section = element(root, 'section', 'lfea-workbench__card');
  const body = element(root, 'div');
  section.append(element(root, 'h2', null, titleText), body);
  return { section, body };
}

function jsonBlock(root, value, role) {
  const pre = element(root, 'pre');
  pre.dataset.role = role;
  pre.textContent = JSON.stringify(value, null, 2);
  return pre;
}

function actionButton(root, text, handler) {
  const button = element(root, 'button', null, text);
  button.type = 'button';
  button.addEventListener('click', handler);
  return button;
}

function element(root, tag, className, text) {
  const value = root.ownerDocument.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function valueAt(value, path) {
  const rows = path.split('.').reduce((current, key) => current?.[key], value);
  return Array.isArray(rows) ? rows : [];
}

function identity(row) {
  const key = Object.keys(row ?? {}).find((name) => /(?:Id|ID|identity)$/u.test(name));
  return key ? String(row[key]) : 'record';
}

function compactJson(row) {
  const text = JSON.stringify(row);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function scalar(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return compactJson(value);
  return String(value);
}
