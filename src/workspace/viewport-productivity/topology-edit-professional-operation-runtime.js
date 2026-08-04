import {
  topologyEditProfessionalOperationDefaults,
} from '../topology-edit/professional/topology-edit-professional-operation-session.js';
import {
  deriveTopologyEditComponentHudContext,
  topologyEditComponentHudCandidateRecords,
} from '../topology-edit/professional/topology-edit-component-hud-context.js';
import {
  createTopologyEditSpecificationCatalogue,
} from '../topology-edit/professional/topology-edit-spec-catalog.js';
import {
  TopologyEditValidationWorkerClient,
} from '../topology-edit/professional/topology-edit-validation-worker-client.js';
import {
  applyTopologyEditProfessionalOperation,
  planTopologyEditProfessionalOperation,
  redoTopologyEditProfessionalOperation,
  undoTopologyEditProfessionalOperation,
  validateTopologyEditProfessionalOperation,
} from './topology-edit-professional-operation-actions.js';
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
    this.componentContext = null;
    this.values = createTopologyEditProfessionalInitialValues();
    this.plan = null;
    this.candidate = null;
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
      this.reconcileComponentContext();
      this.message = `Catalogue ${this.catalogue.catalogueId} loaded from exact source digest.`;
      this.error = null;
    } catch (error) {
      this.catalogue = null;
      this.componentContext = null;
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
    this.reconcileComponentContext();
    this.clear(false, false);
  }

  canonicalChanged(canonical) {
    if (this.plan?.basisHash && this.plan.basisHash !== canonical?.canonicalTopologyHash) {
      this.clear(false, false);
      this.message = 'Professional plan cleared because its canonical basis changed.';
    }
    this.reconcileComponentContext(canonical);
    reconcileTopologyEditProfessionalReceipts(this, canonical);
    this.render();
    this.updateEvidence();
  }

  reconcileComponentContext(canonical = this.controller.session?.currentTopology?.()) {
    if (!canonical || !this.catalogue) {
      this.componentContext = null;
      return null;
    }
    this.componentContext = deriveTopologyEditComponentHudContext({
      topology: canonical,
      selection: this.controller.selection,
      catalogue: this.catalogue,
      workspaceDataset: this.controller.workspaceDataset,
    });
    if (!this.componentContext.supported) return this.componentContext;
    const candidateIds = new Set(
      topologyEditComponentHudCandidateRecords(this.componentContext, this.catalogue)
        .map((record) => record.recordId),
    );
    const retained = candidateIds.has(this.values.catalogueRecordId)
      ? this.values.catalogueRecordId
      : '';
    this.values = {
      ...this.values,
      catalogueRecordId: retained || this.componentContext.recommendedRecordId || '',
      entityType: this.componentContext.componentType,
      diameterMm: this.componentContext.sourceEvidence?.nominalSizeMm
        ?? this.values.diameterMm,
    };
    return this.componentContext;
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
    return planTopologyEditProfessionalOperation(this);
  }

  validateOperation() {
    return validateTopologyEditProfessionalOperation(this);
  }

  applyOperation() {
    return applyTopologyEditProfessionalOperation(this);
  }

  undoOperation() {
    return undoTopologyEditProfessionalOperation(this);
  }

  redoOperation() {
    return redoTopologyEditProfessionalOperation(this);
  }

  cancelValidation() {
    const cancelled = this.validationClient.cancel();
    if (!cancelled) return false;
    this.validationPending = false;
    this.message = 'Professional validation cancelled by terminating its worker.';
    this.render();
    return true;
  }

  clear(announce = false, clearTransaction = false) {
    this.cancelValidation();
    this.plan = null;
    this.candidate = null;
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
    this.reconcileComponentContext();
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
    this.componentContext = null;
    this.element = null;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
