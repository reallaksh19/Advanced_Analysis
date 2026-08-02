import {
  TopologyEdit3DViewController as InteractionController,
} from './topology-edit-3d-interaction-controller.js';
import {
  createTopologyEditProfessionalOperationPlan,
  topologyEditProfessionalOperationDefaults,
} from './topology-edit/professional/topology-edit-professional-operation-session.js';
import {
  executeTopologyEditOperationTransaction,
  previewTopologyEditOperationTransaction,
  redoTopologyEditOperationTransaction,
  undoTopologyEditOperationTransaction,
} from './topology-edit/professional/topology-edit-operation-transaction.js';
import {
  createTopologyEditSpecificationCatalogue,
} from './topology-edit/professional/topology-edit-spec-catalog.js';
import {
  TopologyEditValidationWorkerClient,
} from './topology-edit/professional/topology-edit-validation-worker-client.js';
import {
  readTopologyEditProfessionalOperationValues,
  renderTopologyEditProfessionalOperationPanel,
} from './viewport-productivity/topology-edit-professional-operation-panel.js';

const CATALOGUE_URL = 'fixtures/topology-edit-professional-spec-catalog.json';

export class TopologyEdit3DViewController extends InteractionController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.professionalElement = null;
    this.professionalCatalogue = null;
    this.professionalValues = initialValues();
    this.professionalPlan = null;
    this.professionalValidation = null;
    this.professionalValidationPending = false;
    this.professionalTransactionPreview = null;
    this.professionalTransaction = null;
    this.professionalRedoTransaction = null;
    this.professionalMessage = '';
    this.professionalError = null;
    this.professionalValidationClient = new TopologyEditValidationWorkerClient();
  }

  async activate() {
    await super.activate();
    await this.loadProfessionalCatalogue();
  }

  buildShell() {
    super.buildShell();
    const section = this.hostElement?.ownerDocument.createElement('section');
    if (!section || !this.checkerElement) {
      throw new Error('TopologyEditProfessionalController: panel host is unavailable.');
    }
    section.dataset.role = 'topology-edit-professional-operation';
    section.className = 'topology-edit-professional-operation';
    section.setAttribute('aria-label', 'Professional engineering operation');
    this.checkerElement.before(section);
    this.professionalElement = section;
    this.renderProfessionalPanel();
  }

  deactivate() {
    this.professionalValidationClient.destroy();
    this.professionalElement = null;
    this.clearProfessionalState(false, true);
    super.deactivate();
  }

  refreshView(canonical) {
    super.refreshView(canonical);
    if (this.professionalPlan?.basisHash
      && this.professionalPlan.basisHash !== canonical?.canonicalTopologyHash) {
      this.clearProfessionalState(false, false);
      this.professionalMessage = 'Professional plan cleared because its canonical basis changed.';
    }
    this.renderProfessionalPanel();
    this.updateProfessionalEvidence();
  }

  handleCanvasPointer(event) {
    const before = professionalSelectionKey(this.selection);
    super.handleCanvasPointer(event);
    if (before !== professionalSelectionKey(this.selection)) {
      this.professionalValues = {
        ...this.professionalValues,
        ...topologyEditProfessionalOperationDefaults(this.selection),
      };
      this.clearProfessionalState(false, false);
      this.renderProfessionalPanel();
    }
  }

  handleHostClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'plan-professional-operation') return this.planProfessionalOperation();
    if (action === 'validate-professional-operation') return this.validateProfessionalOperation();
    if (action === 'cancel-professional-validation') return this.cancelProfessionalValidation();
    if (action === 'apply-professional-operation') return this.applyProfessionalOperation();
    if (action === 'clear-professional-operation') return this.clearProfessionalState(true, false);
    if (action === 'undo-professional-operation') return this.undoProfessionalOperation();
    if (action === 'redo-professional-operation') return this.redoProfessionalOperation();
    return super.handleHostClick(event);
  }

  planProfessionalOperation() {
    if (!this.session) return;
    try {
      this.professionalValues = readTopologyEditProfessionalOperationValues(
        this.professionalElement,
      );
      const plan = createTopologyEditProfessionalOperationPlan({
        topology: this.session.currentTopology(),
        selection: this.selection,
        values: this.professionalValues,
        catalogue: this.professionalCatalogue,
      });
      this.professionalPlan = plan;
      this.professionalValidation = null;
      this.professionalTransactionPreview = null;
      this.professionalTransaction = null;
      this.professionalRedoTransaction = null;
      this.professionalError = null;
      this.professionalMessage = plan.status === 'PLANNED'
        ? `Plan ${plan.planHash.slice(0, 18)} created with ${plan.commandIntents.length} governed command(s).`
        : plan.reason;
      this.renderProfessionalPanel();
      this.updateProfessionalEvidence();
      this.setStatus(this.professionalMessage);
    } catch (error) {
      this.rejectProfessionalOperation(error);
    }
  }

  async validateProfessionalOperation() {
    if (!this.session || this.professionalPlan?.status !== 'PLANNED') return;
    const plan = this.professionalPlan;
    const topology = this.session.currentTopology();
    this.professionalValidationPending = true;
    this.professionalValidation = null;
    this.professionalTransactionPreview = null;
    this.professionalError = null;
    this.professionalMessage = 'Validating changed scope in a cancellable module worker…';
    this.renderProfessionalPanel();
    try {
      const result = await this.professionalValidationClient.validate({
        operationPlan: plan,
        canonicalTopology: topology,
        previousDiagnostics: this.issues ?? [],
        performancePolicy: {
          fastPathBudgetMs: 16,
          warningBudgetMs: 100,
          hysteresisMs: 4,
        },
        blockingSeverities: ['HIGH'],
      });
      if (!this.session
        || this.session.currentTopology().canonicalTopologyHash !== topology.canonicalTopologyHash
        || this.professionalPlan?.planHash !== plan.planHash) {
        throw new RangeError('Validation completed against a stale professional plan.');
      }
      this.professionalValidation = result.receipt;
      this.professionalTransactionPreview = previewTopologyEditOperationTransaction({
        session: this.session,
        operationPlan: plan,
        validationReceipt: result.receipt,
      });
      this.professionalMessage = `Validation ${result.receipt.status}; atomic preview ${this.professionalTransactionPreview.previewHash.slice(0, 18)} ready.`;
    } catch (error) {
      if (error?.name !== 'AbortError') this.professionalError = errorMessage(error);
      this.professionalMessage = error?.name === 'AbortError'
        ? 'Professional validation cancelled.'
        : 'Professional validation blocked.';
    } finally {
      this.professionalValidationPending = false;
      this.renderProfessionalPanel();
      this.updateProfessionalEvidence();
      this.setStatus(this.professionalError || this.professionalMessage);
    }
  }

  cancelProfessionalValidation() {
    const cancelled = this.professionalValidationClient.cancel();
    if (!cancelled) return;
    this.professionalValidationPending = false;
    this.professionalMessage = 'Professional validation cancelled by terminating its worker.';
    this.renderProfessionalPanel();
  }

  applyProfessionalOperation() {
    if (!this.session
      || !this.professionalPlan
      || !this.professionalValidation
      || !this.professionalTransactionPreview) return;
    const priorVersion = this.session.journal.sessionVersion;
    try {
      const receipt = executeTopologyEditOperationTransaction({
        session: this.session,
        operationPlan: this.professionalPlan,
        validationReceipt: this.professionalValidation,
        preview: this.professionalTransactionPreview,
      });
      this.professionalTransaction = receipt;
      this.professionalRedoTransaction = null;
      this.professionalPlan = null;
      this.professionalValidation = null;
      this.professionalTransactionPreview = null;
      this.professionalError = null;
      this.refreshView(this.session.currentTopology());
      this.autosaveAfterTransition?.(priorVersion);
      this.professionalMessage = `Atomic operation accepted: ${receipt.commandCount} command(s), ${receipt.transactionHash.slice(0, 18)}.`;
      this.setStatus(this.professionalMessage);
      this.renderProfessionalPanel();
    } catch (error) {
      this.rejectProfessionalOperation(error);
    }
  }

  undoProfessionalOperation() {
    if (!this.session || !this.professionalTransaction) return;
    const priorVersion = this.session.journal.sessionVersion;
    try {
      undoTopologyEditOperationTransaction(this.session, this.professionalTransaction);
      this.professionalRedoTransaction = this.professionalTransaction;
      this.professionalTransaction = null;
      this.refreshView(this.session.currentTopology());
      this.autosaveAfterTransition?.(priorVersion);
      this.setStatus('Professional operation undone as one exact command group.');
    } catch (error) {
      this.rejectProfessionalOperation(error);
    }
  }

  redoProfessionalOperation() {
    if (!this.session || !this.professionalRedoTransaction) return;
    const priorVersion = this.session.journal.sessionVersion;
    try {
      redoTopologyEditOperationTransaction(this.session, this.professionalRedoTransaction);
      this.professionalTransaction = this.professionalRedoTransaction;
      this.professionalRedoTransaction = null;
      this.refreshView(this.session.currentTopology());
      this.autosaveAfterTransition?.(priorVersion);
      this.setStatus('Professional operation redone as one exact command group.');
    } catch (error) {
      this.rejectProfessionalOperation(error);
    }
  }

  undo() {
    if (this.professionalTransaction) return this.undoProfessionalOperation();
    this.professionalRedoTransaction = null;
    return super.undo();
  }

  redo() {
    if (this.professionalRedoTransaction) return this.redoProfessionalOperation();
    this.professionalTransaction = null;
    return super.redo();
  }

  async loadProfessionalCatalogue() {
    try {
      const url = new URL(CATALOGUE_URL, this.hostElement?.ownerDocument.baseURI);
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`catalogue request returned ${response.status}`);
      this.professionalCatalogue = createTopologyEditSpecificationCatalogue(
        await response.json(),
      );
      if (!this.professionalValues.catalogueRecordId) {
        this.professionalValues = {
          ...this.professionalValues,
          catalogueRecordId: this.professionalCatalogue.records.find(
            (record) => record.componentType === 'PIPE',
          )?.recordId ?? '',
        };
      }
      this.professionalMessage = `Catalogue ${this.professionalCatalogue.catalogueId} loaded from exact source digest.`;
    } catch (error) {
      this.professionalCatalogue = null;
      this.professionalError = errorMessage(error);
    }
    this.renderProfessionalPanel();
    this.updateProfessionalEvidence();
  }

  clearProfessionalState(announce = false, clearTransaction = false) {
    this.cancelProfessionalValidation();
    this.professionalPlan = null;
    this.professionalValidation = null;
    this.professionalTransactionPreview = null;
    this.professionalError = null;
    if (clearTransaction) {
      this.professionalTransaction = null;
      this.professionalRedoTransaction = null;
    }
    this.renderProfessionalPanel();
    this.updateProfessionalEvidence();
    if (announce) this.setStatus('Professional operation state cleared; no canonical change occurred.');
  }

  rejectProfessionalOperation(error) {
    this.professionalError = errorMessage(error);
    this.professionalMessage = 'Professional operation blocked.';
    this.renderProfessionalPanel();
    this.updateProfessionalEvidence();
    this.setStatus(`${this.professionalMessage} ${this.professionalError}`);
  }

  renderProfessionalPanel() {
    if (!this.professionalElement) return;
    const currentHash = this.session?.currentTopology()?.canonicalTopologyHash;
    renderTopologyEditProfessionalOperationPanel(this.professionalElement, {
      values: this.professionalValues,
      catalogue: this.professionalCatalogue,
      plan: this.professionalPlan,
      validation: this.professionalValidation,
      validationPending: this.professionalValidationPending,
      transactionPreview: this.professionalTransactionPreview,
      transaction: this.professionalTransaction,
      canUndoTransaction: Boolean(
        this.professionalTransaction?.resultingCanonicalHash === currentHash,
      ),
      canRedoTransaction: Boolean(
        this.professionalRedoTransaction?.priorCanonicalHash === currentHash,
      ),
      message: this.professionalMessage,
      error: this.professionalError,
    });
  }

  updateProfessionalEvidence() {
    if (!this.hostElement) return;
    this.hostElement.dataset.topologyEditProfessionalCatalogueHash = this.professionalCatalogue?.catalogueHash ?? '';
    this.hostElement.dataset.topologyEditProfessionalPlanHash = this.professionalPlan?.planHash ?? '';
    this.hostElement.dataset.topologyEditProfessionalValidationHash = this.professionalValidation?.validationHash ?? '';
    this.hostElement.dataset.topologyEditProfessionalTransactionPreviewHash = this.professionalTransactionPreview?.previewHash ?? '';
    this.hostElement.dataset.topologyEditProfessionalTransactionHash = this.professionalTransaction?.transactionHash ?? '';
  }
}

function initialValues() {
  return {
    operationType: 'EXTEND_EDGE',
    endpoint: 'TO',
    distanceMm: 100,
    diameterMm: 100,
    entityType: 'PIPE',
    deltaX: 0,
    deltaY: 0,
    deltaZ: 0,
    riseMm: 1,
    runMm: 100,
    direction: 'ASCENDING',
  };
}
function professionalSelectionKey(selection) {
  return `${(selection?.nodeIds ?? []).join('|')}::${selection?.edgeId ?? ''}`;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
