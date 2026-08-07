import { TopologyStore } from '../topology-store.js';
import { createTopologyEditTableBatch } from '../topology-edit/table/topology-edit-table-batch.js';
import { planTopologyEditTableBatch } from '../topology-edit/table/topology-edit-table-batch-planner.js';
import { createTopologyEditTableIntent } from '../topology-edit/table/topology-edit-table-intent.js';
import { buildTopologyEditTableProjection } from '../topology-edit/table/topology-edit-table-projection.js';
import { rebaseTopologyEditTableBatchPlan } from '../topology-edit/table/topology-edit-table-rebase.js';
import {
  createTopologyEditTableViewState,
  reduceTopologyEditTableViewState,
} from '../topology-edit/table/topology-edit-table-view-state.js';
import { TopologyEditValidationWorkerClient } from '../topology-edit/professional/topology-edit-validation-worker-client.js';
import {
  downloadTopologyEditTableCsv,
  downloadTopologyEditTableXlsx,
} from './topology-edit-table-export-download.js';
import { renderTopologyEditTableGrid } from './topology-edit-table-grid-view.js';
import { ensureTopologyEditTableStyles } from './topology-edit-table-styles.js';
import {
  applyTopologyEditTableRuntime,
  previewTopologyEditTableRuntime,
  redoTopologyEditTableRuntime,
  undoTopologyEditTableRuntime,
  validateTopologyEditTableRuntime,
} from './topology-edit-table-workflow.js';

export class TopologyEditTableRuntime {
  constructor(controller) {
    this.controller = controller;
    this.element = null;
    this.coordinator = null;
    this.projection = null;
    this.viewState = createTopologyEditTableViewState();
    this.intents = [];
    this.batch = null;
    this.batchPlan = null;
    this.staleResult = null;
    this.preview = null;
    this.validation = null;
    this.transaction = null;
    this.redoTransaction = null;
    this.lastExport = null;
    this.pending = false;
    this.message = 'Table is a read-only projection until an explicit edit is staged.';
    this.error = null;
    this.validationClient = new TopologyEditValidationWorkerClient();
    this.onClick = (event) => this.handleClick(event);
    this.onInput = (event) => this.handleInput(event);
  }

  mount(element) {
    if (!element?.ownerDocument) throw new TypeError('TopologyEditTableRuntime: mount element is required.');
    this.destroyElementOnly();
    if (this.validationClient.destroyed) this.validationClient = new TopologyEditValidationWorkerClient();
    this.element = element;
    ensureTopologyEditTableStyles(element.ownerDocument);
    element.addEventListener('click', this.onClick);
    element.addEventListener('input', this.onInput);
    this.refreshProjection();
  }

  setCoordinator(coordinator) { this.coordinator = coordinator; }

  refreshProjection(canonical = this.controller.session?.currentTopology?.()) {
    const dataset = this.controller.workspaceDataset;
    const topologyGraph = TopologyStore.getGraph();
    if (!canonical || !dataset || !topologyGraph) {
      this.projection = null;
      this.message = 'Canonical/source topology authority is not available yet.';
      this.render();
      return;
    }
    try {
      this.projection = buildTopologyEditTableProjection({ canonicalTopology: canonical, dataset, topologyGraph });
      this.error = null;
      this.render();
    } catch (error) {
      this.error = errorMessage(error);
      this.projection = null;
      this.render();
    }
  }

  canonicalChanged(canonical) {
    const priorBatch = this.batch;
    const priorPlan = this.batchPlan;
    this.clearCandidate();
    this.lastExport = null;
    this.refreshProjection(canonical);
    if (!this.projection || !priorBatch || !priorPlan
      || priorBatch.authority.priorDraftHash === canonical?.canonicalTopologyHash) return;
    const result = rebaseTopologyEditTableBatchPlan({
      batch: priorBatch,
      plan: priorPlan,
      projection: this.projection,
      canonicalTopology: canonical,
      sessionSnapshot: this.controller.session.snapshot(),
    });
    if (result.disposition === 'REBASED') {
      this.batch = result.rebasedBatch;
      this.batchPlan = result.rebasedPlan;
      this.intents = [...result.rebasedBatch.intents];
      this.staleResult = null;
      this.message = 'Staged edits rebased safely; Preview must be regenerated.';
    } else {
      this.batch = priorBatch;
      this.batchPlan = priorPlan;
      this.staleResult = result;
      this.message = 'Staged edits conflict with the current canonical revision.';
    }
    this.render();
  }

  applyCanonicalSelection({ rowIds, primaryRowId = null, anchorRowId = null } = {}) {
    this.viewState = reduceTopologyEditTableViewState(this.viewState, {
      type: 'SELECTION', selectedRowIds: rowIds, primaryRowId, anchorRowId,
    });
    this.render();
  }

  phase() {
    if (this.staleResult) return 'STALE_CONFLICT';
    if (this.validation?.status === 'READY_TO_APPLY') return 'READY_TO_APPLY';
    if (this.preview) return 'PREVIEW_READY';
    if (this.batch) return 'STAGED';
    return 'IDLE';
  }

  handleInput(event) {
    if (!event.target.matches?.('[data-table-filter]')) return;
    const caret = event.target.selectionStart;
    this.viewState = reduceTopologyEditTableViewState(this.viewState, { type: 'QUERY', query: event.target.value });
    this.render();
    const filter = this.element?.querySelector('[data-table-filter]');
    filter?.focus();
    if (Number.isInteger(caret)) filter?.setSelectionRange?.(caret, caret);
  }

  handleClick(event) {
    const select = event.target.closest?.('[data-table-select]');
    if (select && this.element?.contains(select)) return this.selectRow(select.dataset.tableSelect, event);
    const sort = event.target.closest?.('[data-table-sort]');
    if (sort && this.element?.contains(sort)) return this.sortRows(sort.dataset.tableSort);
    const action = event.target.closest?.('[data-table-action]');
    if (!action || !this.element?.contains(action)) return false;
    const kind = action.dataset.tableAction;
    if (kind === 'stage-pipe-length') return this.stagePipeLength(action.dataset.canonicalId);
    if (kind === 'preview') return this.previewBatch();
    if (kind === 'validate') return this.validatePreview();
    if (kind === 'apply') return this.applyBatch();
    if (kind === 'discard') return this.discardStaged();
    if (kind === 'export-csv') return this.exportCsv();
    if (kind === 'export-xlsx') return this.exportXlsx();
    return false;
  }

  selectRow(rowId, event) {
    const action = event.ctrlKey || event.metaKey ? 'TOGGLE' : event.shiftKey ? 'ADD' : 'REPLACE';
    this.coordinator?.tableSelection(action, [rowId], rowId);
    return true;
  }

  sortRows(sortKey) {
    const same = this.viewState.sortKey === sortKey;
    const sortDirection = same && this.viewState.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    this.viewState = reduceTopologyEditTableViewState(this.viewState, { type: 'SORT', sortKey, sortDirection });
    this.render();
    return true;
  }

  stagePipeLength(canonicalId) {
    try {
      const intent = createTopologyEditTableIntent({
        projection: this.projection,
        sessionSnapshot: this.controller.session.snapshot(),
        canonicalId,
        intentKind: 'PIPE_LENGTH',
        requestedValue: { lengthMm: Number(this.element.querySelector('[data-table-edit-length]')?.value) },
        geometryPolicy: {
          anchor: this.element.querySelector('[data-table-edit-anchor]')?.value,
          propagation: this.element.querySelector('[data-table-edit-propagation]')?.value,
        },
      });
      const intents = [...this.intents.filter((row) => row.target.canonicalId !== canonicalId), intent];
      const batch = createTopologyEditTableBatch({ intents });
      const batchPlan = planTopologyEditTableBatch({
        batch, projection: this.projection, canonicalTopology: this.controller.session.currentTopology(),
      });
      this.intents = intents;
      this.batch = batch;
      this.batchPlan = batchPlan;
      this.staleResult = null;
      this.clearCandidate();
      this.error = null;
      this.message = `${batch.intentCount} table change(s) staged against the exact certified revision.`;
    } catch (error) { this.error = errorMessage(error); }
    this.render();
    return true;
  }

  previewBatch() { return previewTopologyEditTableRuntime(this); }
  validatePreview() { return validateTopologyEditTableRuntime(this); }
  applyBatch() { return applyTopologyEditTableRuntime(this); }
  undoOperation() { return undoTopologyEditTableRuntime(this); }
  redoOperation() { return redoTopologyEditTableRuntime(this); }

  exportCsv() { return this.runExport('CSV', () => downloadTopologyEditTableCsv(this)); }
  exportXlsx() { return this.runExport('XLSX', () => downloadTopologyEditTableXlsx(this)); }
  async runExport(format, operation) {
    if (this.pending) return true;
    try {
      this.pending = true; this.error = null;
      const result = await operation();
      this.lastExport = { format, exportHash: result.exportModel.exportHash, byteLength: result.byteLength };
      this.message = `${format} exported from certified canonical ${shortHash(result.exportModel.authority.canonicalHash)}.`;
    } catch (error) { this.error = errorMessage(error); }
    finally { this.pending = false; this.render(); }
    return true;
  }

  discardStaged() {
    this.resetStaged(true);
    this.message = 'Staged Table edits discarded; canonical authority unchanged.';
    this.render();
    return true;
  }

  resetStaged(clearGhost = true) {
    this.intents = []; this.batch = null; this.batchPlan = null; this.staleResult = null;
    this.preview = null; this.validation = null;
    if (clearGhost) this.controller.viewportBackend?.clearGhost();
  }
  clearCandidate() {
    this.validationClient.cancel(); this.preview = null; this.validation = null;
    this.controller.viewportBackend?.clearGhost();
  }
  render() { renderTopologyEditTableGrid(this); }
  destroyElementOnly() {
    this.element?.removeEventListener('click', this.onClick);
    this.element?.removeEventListener('input', this.onInput);
    this.element?.replaceChildren(); this.element = null;
  }
  destroy() { this.validationClient.destroy(); this.resetStaged(true); this.destroyElementOnly(); }
}

function errorMessage(error) { return error instanceof Error ? error.message : String(error); }
function shortHash(value) { const text = String(value ?? ''); return text.length > 16 ? `${text.slice(0, 13)}…` : text; }
