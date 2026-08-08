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
  deriveTopologyEditCommandCapability,
} from '../topology-edit/editor-state/topology-edit-capability-authority.js';
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
    this.valueChangeHandler = (event) => this.handleValueChange(event);
    this.originalUpdateActionButtons = null;
    this.capabilityUpdateActionButtons = () => {
      this.originalUpdateActionButtons?.call(this.controller);
      this.refreshCommandCapabilities();
    };
  }

  mount(element) {
    this.element?.removeEventListener?.('change', this.valueChangeHandler);
    this.element = element;
    this.element?.addEventListener?.('change', this.valueChangeHandler);
    this.installCommandCapabilityAdapter();
    this.render();
    this.refreshCommandCapabilities();
  }

  installCommandCapabilityAdapter() {
    if (this.originalUpdateActionButtons) return;
    this.originalUpdateActionButtons = this.controller.updateActionButtons;
    this.controller.updateActionButtons = this.capabilityUpdateActionButtons;
  }

  refreshCommandCapabilities() {
    const topology = this.controller.session?.currentTopology?.() ?? null;
    const stale = Boolean(this.controller.session?.staleReason);
    this.controller.hostElement?.querySelectorAll('[data-command-action]').forEach((button) => {
      const actionId = button.dataset.commandAction;
      const capability = deriveTopologyEditCommandCapability({
        actionId,
        selection: this.controller.selection,
        topology,
      });
      button.disabled = stale || capability.status !== 'AVAILABLE';
      button.dataset.capabilityStatus = stale ? 'BLOCKED' : capability.status;
      button.dataset.capabilityReason = stale ? 'STALE_CAPABILITY_BASIS' : capability.reasonCode;
      if (!button.dataset.baseTitle) button.dataset.baseTitle = button.title || button.textContent;
      button.title = capability.status === 'AVAILABLE'
        ? button.dataset.baseTitle
        : `${button.dataset.baseTitle} — ${capability.reason}`;
      const note = commandCapabilityNote(button, actionId);
      note.hidden = capability.status === 'AVAILABLE' && !stale;
      note.textContent = stale
        ? 'Canonical basis is stale; reload/reconcile before editing.'
        : capability.reason;
    });
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
    this.refreshCommandCapabilities();
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

  handleValueChange(event) {
    if (!event.target?.closest?.('[data-role^="professional-"]')) return;
    this.values = readTopologyEditProfessionalOperationValues(this.element);
    this.plan = null;
    this.candidate = null;
    this.validation = null;
    this.transactionPreview = null;
    this.error = null;
    this.message = 'Preflight updated for the current visible engineering inputs.';
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

  planOperation() { return planTopologyEditProfessionalOperation(this); }
  validateOperation() { return validateTopologyEditProfessionalOperation(this); }
  applyOperation() { return applyTopologyEditProfessionalOperation(this); }
  undoOperation() { return undoTopologyEditProfessionalOperation(this); }
  redoOperation() { return redoTopologyEditProfessionalOperation(this); }

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

  viewState() { return createTopologyEditProfessionalViewState(this); }

  restoreViewState(value) {
    restoreTopologyEditProfessionalViewState(this, value);
    this.reconcileComponentContext();
    this.render();
    this.updateEvidence();
  }

  render() { renderTopologyEditProfessionalRuntime(this); }
  updateEvidence() { updateTopologyEditProfessionalEvidence(this); }

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
    this.element?.removeEventListener?.('change', this.valueChangeHandler);
    if (this.originalUpdateActionButtons) {
      this.controller.updateActionButtons = this.originalUpdateActionButtons;
      this.originalUpdateActionButtons = null;
    }
    this.clear(false, true);
    this.validationClient.destroy();
    this.componentContext = null;
    this.element = null;
  }
}

function commandCapabilityNote(button, actionId) {
  const next = button.nextElementSibling;
  if (next?.dataset?.commandCapabilityFor === actionId) return next;
  const note = button.ownerDocument.createElement('small');
  note.dataset.commandCapabilityFor = actionId;
  note.className = 'topology-edit-command-capability-reason';
  note.id = `topology-edit-command-capability-${actionId}`;
  button.setAttribute('aria-describedby', note.id);
  button.after(note);
  return note;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
