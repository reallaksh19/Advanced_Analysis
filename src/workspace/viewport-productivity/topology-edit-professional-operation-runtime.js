import {
  createTopologyEditProfessionalOperationPlan,
  topologyEditProfessionalOperationDefaults,
} from '../topology-edit/professional/topology-edit-professional-operation-session.js';
import {
  executeTopologyEditOperationTransaction,
  previewTopologyEditOperationTransaction,
  redoTopologyEditOperationTransaction,
  undoTopologyEditOperationTransaction,
} from '../topology-edit/professional/topology-edit-operation-transaction.js';
import {
  createTopologyEditSpecificationCatalogue,
} from '../topology-edit/professional/topology-edit-spec-catalog.js';
import {
  TopologyEditValidationWorkerClient,
} from '../topology-edit/professional/topology-edit-validation-worker-client.js';
import {
  readTopologyEditProfessionalOperationValues,
} from './topology-edit-professional-operation-panel.js';
import {
  createTopologyEditProfessionalInitialValues,
  createTopologyEditProfessionalViewState,
  reconcileTopologyEditProfessionalReceipts,
  renderTopologyEditProfessionalRuntime,
  restoreTopologyEditProfessionalViewState,
  updateTopologyEditProfessionalEvidence,
} from './topology-edit-professional-operation-state.js';

const CATALOGUE_URL = 'fixtures/topology-edit-professional-spec-catalog.json';

export class TopologyEditProfessionalOperationRuntime {
  constructor(controller) {
    this.controller = controller;
    this.element = null;
    this.catalogue = null;
    this.values = createTopologyEditProfessionalInitialValues();
    this.plan = null;
    this.validation = null;
    this.validationPending = false;
    this.transactionPreview = null;
    this.transaction = null;
    this.redoTransaction = null;
    this.message = '';
    this.error = null;
    this.validationClient = new TopologyEditValidationWorkerClient();
  }

  mount(element) {
    this.element = element;
    this.render();
  }

  async loadCatalogue() {
    try {
      const url = new URL(CATALOGUE_URL, this.element?.ownerDocument.baseURI);
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`catalogue request returned ${response.status}`);
      this.catalogue = createTopologyEditSpecificationCatalogue(await response.json());
      if (!this.values.catalogueRecordId) {
        this.values = {
          ...this.values,
          catalogueRecordId: this.catalogue.records.find(
            (record) => record.componentType === 'PIPE',
          )?.recordId ?? '',
        };
      }
      this.message = `Catalogue ${this.catalogue.catalogueId} loaded from exact source digest.`;
      this.error = null;
    } catch (error) {
      this.catalogue = null;
      this.error = errorMessage(error);
    }
    this.render();
    this.updateEvidence();
  }

  selectionChanged() {
    this.values = {
      ...this.values,
      ...topologyEditProfessionalOperationDefaults(this.controller.selection),
    };
    this.clear(false, false);
  }

  canonicalChanged(canonical) {
    if (this.plan?.basisHash && this.plan.basisHash !== canonical?.canonicalTopologyHash) {
      this.clear(false, false);
      this.message = 'Professional plan cleared because its canonical basis changed.';
    }
    reconcileTopologyEditProfessionalReceipts(this, canonical);
    this.render();
    this.updateEvidence();
  }

  handleAction(action) {
    if (action === 'plan-professional-operation') return this.planOperation();
    if (action === 'validate-professional-operation') return this.validateOperation();
    if (action === 'cancel-professional-validation') return this.cancelValidation();
    if (action === 'apply-professional-operation') return this.applyOperation();
    if (action === 'clear-professional-operation') return this.clear(true, false);
    if (action === 'undo-professional-operation') return this.undoOperation();
    if (action === 'redo-professional-operation') return this.redoOperation();
    return false;
  }

  planOperation() {
    const session = this.controller.session;
    if (!session) return true;
    try {
      this.values = readTopologyEditProfessionalOperationValues(this.element);
      this.plan = createTopologyEditProfessionalOperationPlan({
        topology: session.currentTopology(),
        selection: this.controller.selection,
        values: this.values,
        catalogue: this.catalogue,
      });
      this.validation = null;
      this.transactionPreview = null;
      this.error = null;
      this.message = this.plan.status === 'PLANNED'
        ? `Plan ${this.plan.planHash.slice(0, 18)} created with ${this.plan.commandIntents.length} governed command(s).`
        : this.plan.reason;
      this.publishState();
    } catch (error) {
      this.reject(error);
    }
    return true;
  }

  async validateOperation() {
    const session = this.controller.session;
    if (!session || this.plan?.status !== 'PLANNED') return true;
    const plan = this.plan;
    const topology = session.currentTopology();
    this.validationPending = true;
    this.validation = null;
    this.transactionPreview = null;
    this.error = null;
    this.message = 'Validating changed scope in a cancellable module worker…';
    this.render();
    try {
      const result = await this.validationClient.validate({
        operationPlan: plan,
        canonicalTopology: topology,
        previousDiagnostics: this.controller.issues ?? [],
        performancePolicy: {
          fastPathBudgetMs: 16,
          warningBudgetMs: 100,
          hysteresisMs: 4,
        },
        blockingSeverities: ['HIGH'],
      });
      if (!this.controller.session
        || this.controller.session.currentTopology().canonicalTopologyHash
          !== topology.canonicalTopologyHash
        || this.plan?.planHash !== plan.planHash) {
        throw new RangeError('Validation completed against a stale professional plan.');
      }
      this.validation = result.receipt;
      this.transactionPreview = previewTopologyEditOperationTransaction({
        session: this.controller.session,
        operationPlan: plan,
        validationReceipt: result.receipt,
      });
      this.message = `Validation ${result.receipt.status}; atomic preview ${this.transactionPreview.previewHash.slice(0, 18)} ready.`;
    } catch (error) {
      if (error?.name !== 'AbortError') this.error = errorMessage(error);
      this.message = error?.name === 'AbortError'
        ? 'Professional validation cancelled.'
        : 'Professional validation blocked.';
    } finally {
      this.validationPending = false;
      this.publishState();
    }
    return true;
  }

  cancelValidation() {
    const cancelled = this.validationClient.cancel();
    if (!cancelled) return false;
    this.validationPending = false;
    this.message = 'Professional validation cancelled by terminating its worker.';
    this.render();
    return true;
  }

  applyOperation() {
    const session = this.controller.session;
    if (!session || !this.plan || !this.validation || !this.transactionPreview) return true;
    const priorVersion = session.journal.sessionVersion;
    try {
      this.transaction = executeTopologyEditOperationTransaction({
        session,
        operationPlan: this.plan,
        validationReceipt: this.validation,
        preview: this.transactionPreview,
      });
      this.redoTransaction = null;
      this.plan = null;
      this.validation = null;
      this.transactionPreview = null;
      this.error = null;
      this.controller.refreshView(session.currentTopology());
      this.controller.autosaveAfterTransition?.(priorVersion);
      this.message = `Atomic operation accepted: ${this.transaction.commandCount} command(s), ${this.transaction.transactionHash.slice(0, 18)}.`;
      this.publishState();
    } catch (error) {
      this.reject(error);
    }
    return true;
  }

  undoOperation() {
    const session = this.controller.session;
    if (!session || !this.transaction) return true;
    const priorVersion = session.journal.sessionVersion;
    try {
      undoTopologyEditOperationTransaction(session, this.transaction);
      this.redoTransaction = this.transaction;
      this.transaction = null;
      this.controller.refreshView(session.currentTopology());
      this.controller.autosaveAfterTransition?.(priorVersion);
      this.message = 'Professional operation undone as one exact command group.';
      this.publishState();
    } catch (error) {
      this.reject(error);
    }
    return true;
  }

  redoOperation() {
    const session = this.controller.session;
    if (!session || !this.redoTransaction) return true;
    const priorVersion = session.journal.sessionVersion;
    try {
      redoTopologyEditOperationTransaction(session, this.redoTransaction);
      this.transaction = this.redoTransaction;
      this.redoTransaction = null;
      this.controller.refreshView(session.currentTopology());
      this.controller.autosaveAfterTransition?.(priorVersion);
      this.message = 'Professional operation redone as one exact command group.';
      this.publishState();
    } catch (error) {
      this.reject(error);
    }
    return true;
  }

  clear(announce = false, clearTransaction = false) {
    this.cancelValidation();
    this.plan = null;
    this.validation = null;
    this.transactionPreview = null;
    this.error = null;
    if (clearTransaction) {
      this.transaction = null;
      this.redoTransaction = null;
    }
    this.render();
    this.updateEvidence();
    if (announce) {
      this.controller.setStatus(
        'Professional operation state cleared; no canonical change occurred.',
      );
    }
    return true;
  }

  viewState() {
    return createTopologyEditProfessionalViewState(this);
  }

  restoreViewState(value) {
    restoreTopologyEditProfessionalViewState(this, value);
    this.render();
    this.updateEvidence();
  }

  render() {
    renderTopologyEditProfessionalRuntime(this);
  }

  updateEvidence() {
    updateTopologyEditProfessionalEvidence(this);
  }

  publishState() {
    this.render();
    this.updateEvidence();
    this.controller.setStatus(this.error || this.message);
  }

  reject(error) {
    this.error = errorMessage(error);
    this.message = 'Professional operation blocked.';
    this.publishState();
  }

  destroy() {
    this.clear(false, true);
    this.validationClient.destroy();
    this.element = null;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
