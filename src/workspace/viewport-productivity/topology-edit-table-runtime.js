import { TopologyStore } from '../topology-store.js';
import {
  createTopologyEditTableBatch,
} from '../topology-edit/table/topology-edit-table-batch.js';
import {
  planTopologyEditTableBatch,
} from '../topology-edit/table/topology-edit-table-batch-planner.js';
import {
  createTopologyEditTableIntent,
} from '../topology-edit/table/topology-edit-table-intent.js';
import {
  buildTopologyEditTableProjection,
} from '../topology-edit/table/topology-edit-table-projection.js';
import {
  rebaseTopologyEditTableBatchPlan,
} from '../topology-edit/table/topology-edit-table-rebase.js';
import {
  applyTopologyEditTableTransaction,
  prepareTopologyEditTablePreview,
  redoTopologyEditTableTransaction,
  undoTopologyEditTableTransaction,
  validateTopologyEditTablePreview,
} from '../topology-edit/table/topology-edit-table-transaction.js';
import {
  createTopologyEditTableViewState,
  reduceTopologyEditTableViewState,
} from '../topology-edit/table/topology-edit-table-view-state.js';
import {
  TopologyEditValidationWorkerClient,
} from '../topology-edit/professional/topology-edit-validation-worker-client.js';
import { renderTopologyEditTableGrid } from './topology-edit-table-grid-view.js';
import { ensureTopologyEditTableStyles } from './topology-edit-table-styles.js';

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
      this.error = message(error);
      this.projection = null;
      this.render();
    }
  }

  canonicalChanged(canonical) {
    const priorBatch = this.batch;
    const priorPlan = this.batchPlan;
    this.clearCandidate();
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
    this.viewState = reduceTopologyEditTableViewState(this.viewState, {
      type: 'QUERY', query: event.target.value,
    });
    this.render();
  }

  handleClick(event) {
    const select = event.target.closest?.('[data-table-select]');
    if (select && this.element?.contains(select)) return this.selectRow(select.dataset.tableSelect, event);
    const sort = event.target.closest?.('[data-table-sort]');
    if (sort && this.element?.contains(sort)) return this.sortRows(sort.dataset.tableSort);
    const action = event.target.closest?.('[data-table-action]');
    if (!action || !this.element?.contains(action)) return false;
    if (action.dataset.tableAction === 'stage-pipe-length') return this.stagePipeLength(action.dataset.canonicalId);
    if (action.dataset.tableAction === 'preview') return this.previewBatch();
    if (action.dataset.tableAction === 'validate') return this.validatePreview();
    if (action.dataset.tableAction === 'apply') return this.applyBatch();
    if (action.dataset.tableAction === 'discard') return this.discardStaged();
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
      const lengthMm = Number(this.element.querySelector('[data-table-edit-length]')?.value);
      const anchor = this.element.querySelector('[data-table-edit-anchor]')?.value;
      const propagation = this.element.querySelector('[data-table-edit-propagation]')?.value;
      const intent = createTopologyEditTableIntent({
        projection: this.projection,
        sessionSnapshot: this.controller.session.snapshot(),
        canonicalId,
        intentKind: 'PIPE_LENGTH',
        requestedValue: { lengthMm },
        geometryPolicy: { anchor, propagation },
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
    } catch (error) { this.error = message(error); }
    this.render();
    return true;
  }

  async previewBatch() {
    if (this.pending || !this.batchPlan || this.staleResult) return true;
    try {
      this.pending = true; this.error = null;
      this.preview = await prepareTopologyEditTablePreview({ session: this.controller.session, batchPlan: this.batchPlan });
      this.validation = null;
      this.renderGhost();
      this.message = `${this.preview.candidate.commandCount} governed command(s) ready in non-mutating Preview.`;
    } catch (error) { this.error = message(error); }
    finally { this.pending = false; this.render(); }
    return true;
  }

  async validatePreview() {
    if (this.pending || !this.preview || !this.batchPlan) return true;
    const preview = this.preview;
    try {
      this.pending = true; this.error = null;
      const result = await this.validationClient.validate({
        operationPlan: this.batchPlan.operationPlan,
        canonicalTopology: preview.candidate.canonicalTopology,
        previousDiagnostics: this.controller.issues ?? [],
        performancePolicy: { fastPathBudgetMs: 16, warningBudgetMs: 100, hysteresisMs: 4 },
        blockingSeverities: ['HIGH'],
      });
      if (this.preview?.previewHash !== preview.previewHash
        || this.controller.session.currentTopology().canonicalTopologyHash !== preview.priorCanonicalHash) {
        throw new RangeError('TopologyEditTableRuntime: validation completed against a stale Preview.');
      }
      this.validation = validateTopologyEditTablePreview({ preview, workerReceipt: result.receipt });
      this.message = this.validation.status === 'READY_TO_APPLY'
        ? 'Final-state validation passed; Apply is enabled.'
        : `${this.validation.blockingIssueCount} blocking validation issue(s).`;
    } catch (error) { if (error?.name !== 'AbortError') this.error = message(error); }
    finally { this.pending = false; this.render(); }
    return true;
  }

  async applyBatch() {
    if (this.pending || !this.validation || !this.preview || !this.batchPlan) return true;
    const priorVersion = this.controller.session.journal.sessionVersion;
    try {
      this.pending = true;
      const transaction = await applyTopologyEditTableTransaction({
        session: this.controller.session,
        batchPlan: this.batchPlan,
        preview: this.preview,
        tableValidation: this.validation,
      });
      this.transaction = transaction; this.redoTransaction = null;
      this.resetStaged(false);
      this.controller.refreshView(this.controller.session.currentTopology());
      this.controller.autosaveAfterTransition?.(priorVersion);
      this.message = `Atomic ${transaction.commandCount}-command Table transaction accepted.`;
      this.error = null;
    } catch (error) { this.error = message(error); }
    finally { this.pending = false; this.render(); }
    return true;
  }

  undoOperation() {
    if (!this.transaction) return false;
    const priorVersion = this.controller.session.journal.sessionVersion;
    undoTopologyEditTableTransaction(this.controller.session, this.transaction);
    this.redoTransaction = this.transaction; this.transaction = null;
    this.controller.refreshView(this.controller.session.currentTopology());
    this.controller.autosaveAfterTransition?.(priorVersion);
    this.message = 'Table transaction undone as one exact command group.'; this.render(); return true;
  }

  redoOperation() {
    if (!this.redoTransaction) return false;
    const priorVersion = this.controller.session.journal.sessionVersion;
    redoTopologyEditTableTransaction(this.controller.session, this.redoTransaction);
    this.transaction = this.redoTransaction; this.redoTransaction = null;
    this.controller.refreshView(this.controller.session.currentTopology());
    this.controller.autosaveAfterTransition?.(priorVersion);
    this.message = 'Table transaction redone exactly.'; this.render(); return true;
  }

  discardStaged() { this.resetStaged(true); this.message = 'Staged Table edits discarded; canonical authority unchanged.'; this.render(); return true; }
  resetStaged(clearGhost = true) {
    this.intents = []; this.batch = null; this.batchPlan = null; this.staleResult = null; this.preview = null; this.validation = null;
    if (clearGhost) this.controller.viewportBackend?.clearGhost();
  }
  clearCandidate() { this.validationClient.cancel(); this.preview = null; this.validation = null; this.controller.viewportBackend?.clearGhost(); }
  renderGhost() {
    const candidate = this.preview?.candidate;
    if (!candidate) return;
    const projection = this.controller.deriveVisual(candidate.canonicalTopology, 'DRAFT').projection;
    const changed = new Set(candidate.changedCanonicalIds ?? []);
    const accepted = (row) => changed.has(row.pickTarget?.objectId ?? row.entityId ?? row.id);
    this.controller.viewportBackend?.renderGhost({
      elements: (projection.compactElements ?? projection.elements ?? []).filter(accepted),
      segments: (projection.compactSegments ?? projection.segments ?? []).filter(accepted),
    });
  }
  render() { renderTopologyEditTableGrid(this); }
  destroyElementOnly() { this.element?.removeEventListener('click', this.onClick); this.element?.removeEventListener('input', this.onInput); this.element?.replaceChildren(); this.element = null; }
  destroy() { this.validationClient.destroy(); this.resetStaged(true); this.destroyElementOnly(); }
}

function message(error) { return error instanceof Error ? error.message : String(error); }
