/**
 * DOM view for LFEA mesh editing, solving, result review, and evidence export.
 */
import {
  LFEA_COLLECTION_PATHS,
  LFEA_RESULT_MODES,
  lfeaDisplayGeometry,
  lfeaPreviewPackage,
} from './lfea-workbench-model.js';
import { renderLfeaWorkbenchSvg } from './lfea-workbench-svg.js';
import {
  captureWorkbenchFocus,
  restoreWorkbenchFocus,
  workbenchButton as actionButton,
  workbenchCard as card,
  workbenchElement as element,
  valueAtPath as valueAt,
} from './workbench-dom.js';
import {
  lfeaRecordTable as recordTable,
} from './lfea-workbench-tables.js';
import {
  renderLfeaNodeDraftEditor,
  renderLfeaResults,
  renderLfeaToolbar,
} from './lfea-workbench-panels.js';
export class LfeaWorkbenchView {
  /**
   * @param {Element|null} rootElement Workbench host.
   */
  constructor(rootElement) {
    this.rootElement = rootElement;
    this.handlers = null;
    this.collectionPath = LFEA_COLLECTION_PATHS[0];
    this.selectedIndex = -1;
    this.benchmarkHost = null;
    this.convergenceHost = null;
    this.section = null;
    this.slots = null;
  }

  /**
   * Attach the persistent benchmark host element.
   *
   * @param {Element} hostElement Host owned by the controller.
   * @returns {void}
   */
  setBenchmarkHost(hostElement) {
    this.benchmarkHost = hostElement;
  }

  setConvergenceHost(hostElement) {
    this.convergenceHost = hostElement;
  }

  init(handlers) {
    this.handlers = handlers;
  }

  render(state) {
    if (!this.rootElement || !this.handlers) return;
    const focused = captureWorkbenchFocus(this.rootElement);
    this.ensureShell();
    this.slots.header.replaceChildren(this.header(state));
    this.slots.toolbar.replaceChildren(renderLfeaToolbar(
      this.rootElement,
      state,
      LFEA_RESULT_MODES,
      this.handlers,
    ));
    this.slots.content.replaceChildren(this.content(state));
    restoreWorkbenchFocus(this.rootElement, focused);
  }

  ensureShell() {
    if (this.section) return;
    this.section = element(this.rootElement, 'section', 'lfea-workbench');
    this.section.dataset.role = 'lfea-workbench';
    this.slots = Object.fromEntries(
      ['header', 'toolbar', 'content'].map((name) => {
        const slot = element(this.rootElement, 'div');
        slot.dataset.lfeaSlot = name;
        this.section.append(slot);
        return [name, slot];
      }),
    );
    this.rootElement.append(this.section);
  }

  destroy() {
    this.rootElement?.replaceChildren();
    this.section = null;
    this.slots = null;
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
    const statusGroup = element(this.rootElement, 'div', 'lfea-workbench__status-group');
    const status = element(this.rootElement, 'output', 'lfea-workbench__status', state.status);
    status.dataset.status = state.status;
    status.setAttribute('aria-live', 'polite');
    statusGroup.append(status);
    header.append(block, statusGroup);

    if (state.status === 'FAILED' && Array.isArray(state.diagnostics) && state.diagnostics.length > 0) {
      const errorMsg = state.diagnostics.map((d) => d.message).filter(Boolean).join(' ');
      const hint = errorMsg.includes('lfea-mesh-package/v1') || errorMsg.includes('schema')
        ? ' Note: Piping datasets (e.g. Sjson.json, .inputxml) belong in the 3D Piping Workspace (W) tab.'
        : '';
      const errorBanner = element(
        this.rootElement,
        'div',
        'lfea-workbench__error-banner',
        `⚠️ Failed: ${errorMsg}${hint}`,
      );
      errorBanner.setAttribute('role', 'alert');
      errorBanner.setAttribute('aria-live', 'assertive');
      header.append(errorBanner);
    }
    return header;
  }

  content(state) {
    const grid = element(this.rootElement, 'div', 'lfea-workbench__grid');
    const documentCard = card(this.rootElement, 'Validated lfea-mesh-package/v1');
    documentCard.body.append(this.documentEditor(state.packageValue));
    const recordsCard = card(this.rootElement, 'Mesh, materials, assignments, loads and constraints');
    recordsCard.body.append(this.recordEditor(state));
    const svgCard = card(this.rootElement, 'Mesh and result field');
    const svg = element(this.rootElement, 'div', 'lfea-workbench__svg');
    const previewPackage = lfeaPreviewPackage(
      state.packageValue,
      state.nodeDraft,
    );
    const geometry = lfeaDisplayGeometry(
      previewPackage,
      state.execution,
      state.display.resultMode,
      {
        deformation: {
          enabled: state.display.resultMode === 'DEFORMED',
          scale: state.display.deformationScale,
        },
      },
    );
    renderLfeaWorkbenchSvg(svg, geometry, previewPackage, {
      onMoveNode: this.handlers.onPreviewNode,
      onCancelNode: this.handlers.onCancelNode,
    });
    svgCard.body.append(
      svg,
      element(
        this.rootElement,
        'p',
        'lfea-workbench__authority',
        geometry.authority,
      ),
      renderLfeaNodeDraftEditor(
        this.rootElement,
        state.nodeDraft,
        this.handlers,
      ),
    );
    const resultsCard = card(this.rootElement, 'Qualified results, review and diagnostics');
    resultsCard.body.append(renderLfeaResults(this.rootElement, state));
    grid.append(documentCard.section, recordsCard.section, svgCard.section, resultsCard.section);
    if (this.benchmarkHost) {
      const benchmarkCard = element(this.rootElement, 'div', 'lfea-workbench__benchmark');
      benchmarkCard.append(this.benchmarkHost);
      grid.append(benchmarkCard);
    }
    if (this.convergenceHost) {
      const convergenceCard = element(
        this.rootElement,
        'div',
        'lfea-workbench__convergence',
      );
      convergenceCard.append(this.convergenceHost);
      grid.append(convergenceCard);
    }
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
      const mock = element(this.rootElement, 'button', null, '[SIMULATED] Load Collection Mock Data');
      mock.type = 'button';
      mock.addEventListener('click', this.handlers.onMock);
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
    const collectionMock = element(this.rootElement, 'button', null, `[SIMULATED] Reload Mock for ${this.collectionPath}`);
    collectionMock.type = 'button';
    collectionMock.addEventListener('click', this.handlers.onMock);
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
    const add = element(this.rootElement, 'button', null, 'Add record');
    add.type = 'button';
    add.addEventListener('click', () => this.handlers.onAddRecord(this.collectionPath, textarea.value));
    const update = element(this.rootElement, 'button', null, 'Update record');
    update.type = 'button';
    update.addEventListener('click', () => this.handlers.onUpdateRecord(this.collectionPath, this.selectedIndex, textarea.value));
    update.disabled = this.selectedIndex < 0;
    const remove = element(this.rootElement, 'button', null, 'Delete record');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      this.handlers.onDeleteRecord(this.collectionPath, this.selectedIndex);
      this.selectedIndex = -1;
    });
    remove.disabled = this.selectedIndex < 0;
    const actions = element(this.rootElement, 'div', 'lfea-workbench__record-actions');
    actions.append(add, update, remove);
    wrapper.append(select, collectionMock, table, textarea, actions);
    return wrapper;
  }
}
