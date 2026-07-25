/**
 * DOM view for the independent LAFEA calculation workbench.
 *
 * The view exposes complete JSON editing plus collection-oriented record forms,
 * an SVG source editor, diagnostics, and exact qualified-kernel result evidence.
 */
import {
  LAFEA_STAGE_DEFINITIONS,
  lafeaCollectionPaths,
  lafeaPreviewGeometry,
} from './lafea-workbench-model.js';
import { renderLafeaWorkbenchSvg } from './lafea-workbench-svg.js';

export class LafeaWorkbenchView {
  /**
   * @param {Element|null} rootElement Workbench host.
   */
  constructor(rootElement) {
    this.rootElement = rootElement;
    this.handlers = null;
    this.collectionPath = null;
    this.selectedIndex = -1;
  }

  /**
   * Register controller callbacks and render the first state.
   *
   * @param {Record<string, Function>} handlers Controller callbacks.
   * @returns {void}
   */
  init(handlers) {
    this.handlers = handlers;
  }

  /**
   * Render immutable LAFEA state.
   *
   * @param {Readonly<Record<string, unknown>>} state Store snapshot.
   * @returns {void}
   */
  render(state) {
    if (!this.rootElement || !this.handlers) return;
    const stage = state.stages[state.activeStageId];
    const paths = lafeaCollectionPaths(state.activeStageId);
    if (!paths.includes(this.collectionPath)) {
      this.collectionPath = paths[0] ?? null;
      this.selectedIndex = -1;
    }
    const section = element(this.rootElement, 'section', 'lafea-workbench');
    section.dataset.role = 'lafea-workbench';
    section.append(this.header(state), this.stageNavigation(state), this.toolbar(state.activeStageId, stage), this.content(state, stage));
    this.rootElement.replaceChildren(section);
  }

  destroy() {
    this.rootElement?.replaceChildren();
    this.handlers = null;
  }

  header(state) {
    const header = element(this.rootElement, 'header', 'lafea-workbench__header');
    const block = element(this.rootElement, 'div');
    const eyebrow = element(this.rootElement, 'span', 'panel-eyebrow', 'Independent qualified-kernel calculator');
    const title = element(this.rootElement, 'h1', null, 'LAFEA Workbench');
    const purpose = element(this.rootElement, 'p', null, stageDefinition(state.activeStageId).purpose);
    block.append(eyebrow, title, purpose);
    const status = element(this.rootElement, 'output', 'lafea-workbench__status', state.status);
    status.dataset.status = state.status;
    status.setAttribute('aria-live', 'polite');
    header.append(block, status);
    return header;
  }

  stageNavigation(state) {
    const nav = element(this.rootElement, 'nav', 'lafea-workbench__stages');
    nav.setAttribute('aria-label', 'LAFEA stages');
    for (const definition of LAFEA_STAGE_DEFINITIONS) {
      const button = actionButton(this.rootElement, `${definition.stageId} ${definition.label}`, () => {
        this.selectedIndex = -1;
        this.handlers.onStage(definition.stageId);
      });
      button.dataset.stageId = definition.stageId;
      button.setAttribute('aria-current', definition.stageId === state.activeStageId ? 'step' : 'false');
      nav.append(button);
    }
    return nav;
  }

  toolbar(stageId, stage) {
    const toolbar = element(this.rootElement, 'div', 'lafea-workbench__toolbar');
    const file = element(this.rootElement, 'input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.dataset.role = 'lafea-import';
    file.addEventListener('change', () => this.handlers.onFile(file.files?.[0] ?? null));
    const mock = actionButton(this.rootElement, `[SIMULATED] Load ${stageId} Mock Data`, () => this.handlers.onMock(stageId));
    mock.dataset.role = 'lafea-mock';
    mock.dataset.mockData = 'true';
    const run = actionButton(this.rootElement, 'Validate & calculate', this.handlers.onRun);
    run.dataset.role = 'lafea-run';
    run.disabled = !stage.document;
    const exportButton = actionButton(this.rootElement, 'Export document', this.handlers.onExport);
    exportButton.disabled = !stage.document;
    const undo = actionButton(this.rootElement, 'Undo', this.handlers.onUndo);
    undo.disabled = !stage.past.length;
    const redo = actionButton(this.rootElement, 'Redo', this.handlers.onRedo);
    redo.disabled = !stage.future.length;
    toolbar.append(mock, file, run, exportButton, undo, redo);
    return toolbar;
  }

  content(state, stage) {
    const grid = element(this.rootElement, 'div', 'lafea-workbench__grid');
    const modelCard = card(this.rootElement, 'Validated source document');
    modelCard.body.append(this.jsonEditor(stage.document));
    const collectionsCard = card(this.rootElement, 'Geometry, materials, loads and constraints');
    collectionsCard.body.append(this.collectionEditor(state, stage.document));
    const previewCard = card(this.rootElement, 'Editable 2D geometry preview');
    const preview = element(this.rootElement, 'div', 'lafea-workbench__svg');
    renderLafeaWorkbenchSvg(preview, lafeaPreviewGeometry(state.activeStageId, stage.document), {
      onMoveNode: this.handlers.onMoveNode,
    });
    previewCard.body.append(preview);
    const evidenceCard = card(this.rootElement, 'Results and diagnostics');
    evidenceCard.body.append(this.evidence(state, stage.execution));
    grid.append(modelCard.section, collectionsCard.section, previewCard.section, evidenceCard.section);
    return grid;
  }

  jsonEditor(documentValue) {
    const wrapper = element(this.rootElement, 'div', 'lafea-workbench__editor');
    const textarea = element(this.rootElement, 'textarea');
    textarea.dataset.role = 'lafea-document-json';
    textarea.spellcheck = false;
    textarea.value = documentValue ? JSON.stringify(documentValue, null, 2) : '';
    textarea.placeholder = 'Import a valid stage JSON document.';
    const apply = actionButton(this.rootElement, 'Apply validated JSON', () => this.handlers.onApplyJson(textarea.value));
    apply.disabled = !documentValue;
    wrapper.append(textarea, apply);
    return wrapper;
  }

  collectionEditor(state, documentValue) {
    const wrapper = element(this.rootElement, 'div', 'lafea-workbench__collections');
    if (!documentValue || !this.collectionPath) {
      wrapper.append(element(this.rootElement, 'p', null, 'No editable source document is loaded.'));
      return wrapper;
    }
    const select = element(this.rootElement, 'select');
    for (const path of lafeaCollectionPaths(state.activeStageId)) {
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
    const rows = valueAt(documentValue, this.collectionPath);
    const table = collectionTable(this.rootElement, rows, this.selectedIndex, (index) => {
      this.selectedIndex = index;
      this.render(state);
    });
    const recordEditor = element(this.rootElement, 'textarea');
    recordEditor.dataset.role = 'lafea-record-json';
    recordEditor.value = this.selectedIndex >= 0 ? JSON.stringify(rows[this.selectedIndex], null, 2) : '{}';
    const add = actionButton(this.rootElement, 'Add record', () => this.handlers.onAddRecord(this.collectionPath, recordEditor.value));
    const update = actionButton(this.rootElement, 'Update record', () => this.handlers.onUpdateRecord(this.collectionPath, this.selectedIndex, recordEditor.value));
    update.disabled = this.selectedIndex < 0;
    const remove = actionButton(this.rootElement, 'Delete record', () => {
      this.handlers.onDeleteRecord(this.collectionPath, this.selectedIndex);
      this.selectedIndex = -1;
    });
    remove.disabled = this.selectedIndex < 0;
    const actions = element(this.rootElement, 'div', 'lafea-workbench__record-actions');
    actions.append(add, update, remove);
    wrapper.append(select, table, recordEditor, actions);
    return wrapper;
  }

  evidence(state, execution) {
    const wrapper = element(this.rootElement, 'div', 'lafea-workbench__evidence');
    const diagnostics = state.diagnostics?.length ? state.diagnostics : execution?.diagnostics ?? [];
    if (diagnostics.length) wrapper.append(jsonBlock(this.rootElement, diagnostics, 'lafea-diagnostics'));
    if (!execution) {
      wrapper.append(element(this.rootElement, 'p', null, 'No calculation has been run for this stage.'));
      return wrapper;
    }
    const warning = element(this.rootElement, 'p', 'lafea-workbench__authority', execution.status === 'QUALIFIED'
      ? 'Qualified result evidence from the stage-specific retained API.'
      : 'No authoritative result: the retained API rejected this document.');
    wrapper.append(warning, jsonBlock(this.rootElement, execution.result, 'lafea-result'));
    return wrapper;
  }
}

function collectionTable(root, rows, selectedIndex, onSelect) {
  const wrapper = element(root, 'div', 'lafea-workbench__table');
  const table = element(root, 'table');
  const header = element(root, 'tr');
  ['#', 'Identity', 'Record'].forEach((label) => header.append(element(root, 'th', null, label)));
  table.append(header);
  rows.forEach((row, index) => {
    const tr = element(root, 'tr');
    tr.tabIndex = 0;
    tr.dataset.selected = String(index === selectedIndex);
    tr.addEventListener('click', () => onSelect(index));
    tr.append(
      element(root, 'td', null, String(index + 1)),
      element(root, 'td', null, recordIdentity(row)),
      element(root, 'td', null, compactJson(row)),
    );
    table.append(tr);
  });
  wrapper.append(table);
  return wrapper;
}

function card(root, titleText) {
  const section = element(root, 'section', 'lafea-workbench__card');
  const title = element(root, 'h2', null, titleText);
  const body = element(root, 'div');
  section.append(title, body);
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

function stageDefinition(stageId) {
  return LAFEA_STAGE_DEFINITIONS.find((row) => row.stageId === stageId);
}

function recordIdentity(row) {
  const key = Object.keys(row ?? {}).find((name) => /(?:Id|ID|identity)$/u.test(name));
  return key ? String(row[key]) : 'record';
}

function compactJson(row) {
  const text = JSON.stringify(row);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}
