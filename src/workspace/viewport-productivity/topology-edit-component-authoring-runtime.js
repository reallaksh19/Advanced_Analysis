import {
  activateTopologyEditAuthoringTool,
  markTopologyEditAuthoringApplied,
  publishTopologyEditAuthoringPreview,
  setTopologyEditAuthoringSelection,
  setTopologyEditAuthoringTarget,
  topologyEditAuthoringToolDefinition,
  updateTopologyEditAuthoringProperties,
} from '../topology-edit/authoring/topology-edit-authoring-session.js';
import {
  createTopologyEditAuthoringOperationPlan,
  deriveTopologyEditAuthoringTarget,
  topologyEditAuthoringDefaultProperties,
} from '../topology-edit/authoring/topology-edit-authoring-operation-planner.js';
import {
  topologyEditInlineAuthoringCatalogueOptions,
} from '../topology-edit/authoring/topology-edit-authoring-inline-component.js';
import {
  executeTopologyEditAuthoringTransaction,
  prepareTopologyEditAuthoringCandidate,
  topologyEditAuthoringCandidateChangedIds,
} from '../topology-edit/authoring/topology-edit-authoring-composite-operation.js';
import {
  TopologyEditAuthoringRuntime,
} from './topology-edit-authoring-runtime.js';

const INLINE_TOOLS = new Set(['FLANGE', 'REDUCER']);
const INLINE_TOOL_BUTTONS = Object.freeze([
  { id: 'FLANGE', label: 'Flange' },
  { id: 'REDUCER', label: 'Reducer' },
]);
const USER_FIELDS = Object.freeze({
  FLANGE: new Set(['stationMm', 'catalogueRecordId']),
  REDUCER: new Set(['stationMm', 'catalogueRecordId', 'inlineDirection']),
});

export class TopologyEditComponentAuthoringRuntime extends TopologyEditAuthoringRuntime {
  constructor(controller) {
    super(controller);
    this.boundFieldChange = (event) => this.handleFieldChange(event);
    this.suppressSelectionReconciles = 0;
  }

  mount(element) {
    super.mount(element);
    element?.addEventListener('change', this.boundFieldChange);
    this.render();
    this.updateEvidence();
  }

  activateTool(tool) {
    if (!INLINE_TOOLS.has(tool)) return super.activateTool(tool);
    this.cancelPendingValidation();
    this.clearCandidateState();
    this.state = activateTopologyEditAuthoringTool(this.state, tool);
    this.error = null;
    this.message = `${topologyEditAuthoringToolDefinition(tool).label}: select one straight canonical pipe edge.`;
    this.reconcileSelection();
    this.publish();
    return true;
  }

  selectionChanged() {
    if (this.suppressSelectionReconciles > 0) {
      this.suppressSelectionReconciles -= 1;
      this.publish();
      return;
    }
    super.selectionChanged();
  }

  reconcileSelection() {
    if (!INLINE_TOOLS.has(this.state.tool)) return super.reconcileSelection();
    const selection = canonicalSelection(this.controller.selection, this.state.tool);
    this.state = setTopologyEditAuthoringSelection(this.state, selection);
    if (!selection.primaryId) return;
    try {
      const topology = this.controller.session?.currentTopology();
      const catalogue = this.catalogue();
      if (!catalogue) throw new RangeError('The governed piping catalogue is not loaded.');
      const target = deriveTopologyEditAuthoringTarget({
        topology,
        tool: this.state.tool,
        edgeId: selection.primaryId,
      });
      this.state = setTopologyEditAuthoringTarget(this.state, target);
      this.applyInlineDefaults(topology, catalogue, {}, 'DERIVED');
      this.message = `${topologyEditAuthoringToolDefinition(this.state.tool).label} target ${selection.primaryId} is ready with exact catalogue options.`;
      this.error = null;
    } catch (error) {
      this.error = errorMessage(error);
      this.message = 'Selected geometry is not compatible with the active component tool.';
    }
  }

  async previewOperation() {
    if (!INLINE_TOOLS.has(this.state.tool)) return super.previewOperation();
    if (this.pending || !this.controller.session) return true;
    try {
      this.pending = true;
      this.error = null;
      const topology = this.controller.session.currentTopology();
      const catalogue = this.catalogue();
      if (!catalogue) throw new RangeError('The governed piping catalogue is not loaded.');
      const userValues = this.readInlineUserProperties();
      this.state = updateTopologyEditAuthoringProperties(
        this.state,
        userValues,
        'USER_INPUT',
      );
      this.applyInlineDefaults(topology, catalogue, userValues, 'USER_INPUT');
      this.plan = createTopologyEditAuthoringOperationPlan({
        topology,
        authoringSession: this.state,
        catalogue,
      });
      this.candidate = await prepareTopologyEditAuthoringCandidate({
        session: this.controller.session,
        operationPlan: this.plan,
      });
      this.validation = null;
      const changedCanonicalIds = topologyEditAuthoringCandidateChangedIds(this.candidate);
      this.state = publishTopologyEditAuthoringPreview(this.state, {
        previewHash: this.candidate.candidateHash,
        planHash: this.plan.planHash,
        candidateCanonicalHash: this.candidate.resultingCanonicalHash,
        changedCanonicalIds,
      });
      this.renderCandidateGhost();
      this.message = `${this.state.tool} preview ready: ${changedCanonicalIds.length} canonical object(s), ${this.candidate.commandCount} governed command(s).`;
    } catch (error) {
      this.reject(error, 'Component authoring preview blocked.');
    } finally {
      this.pending = false;
      this.publish();
    }
    return true;
  }

  async applyOperation() {
    if (!INLINE_TOOLS.has(this.state.tool)) return super.applyOperation();
    if (this.pending || !this.plan || !this.candidate || !this.validation) return true;
    const priorVersion = this.controller.session.journal.sessionVersion;
    try {
      this.pending = true;
      const receipt = await executeTopologyEditAuthoringTransaction({
        session: this.controller.session,
        operationPlan: this.plan,
        candidate: this.candidate,
        validationReceipt: this.validation,
      });
      this.transaction = receipt;
      this.redoTransaction = null;
      this.state = markTopologyEditAuthoringApplied(this.state, receipt.transactionHash);
      this.plan = null;
      this.candidate = null;
      this.validation = null;
      this.error = null;
      this.suppressSelectionReconciles = 1;
      this.controller.refreshView(this.controller.session.currentTopology());
      // The authoring controller performs one final selection reconciliation
      // after apply; preserve the APPLIED receipt through that exact callback.
      this.suppressSelectionReconciles = 1;
      this.controller.autosaveAfterTransition?.(priorVersion);
      this.message = `Atomic ${receipt.commandCount}-command ${this.state.tool.toLowerCase()} authoring operation accepted.`;
    } catch (error) {
      this.reject(error, 'Component authoring apply blocked.');
    } finally {
      this.pending = false;
      this.publish();
    }
    return true;
  }

  render() {
    super.render();
    if (!this.element) return;
    const tools = this.element.querySelector('.topology-edit-authoring-hud__tools');
    const documentRef = this.element.ownerDocument;
    if (tools && documentRef) {
      for (const tool of INLINE_TOOL_BUTTONS) {
        const action = `activate-authoring-${tool.id.toLowerCase()}`;
        if (tools.querySelector(`[data-action="${action}"]`)) continue;
        const button = documentRef.createElement('button');
        button.type = 'button';
        button.dataset.action = action;
        button.textContent = tool.label;
        button.disabled = this.pending;
        button.setAttribute('aria-pressed', String(this.state.tool === tool.id));
        tools.append(button);
      }
    }
    if (!INLINE_TOOLS.has(this.state.tool)) return;
    this.renderCatalogueSelector();
    this.lockCatalogueFields();
    const targetText = this.element.querySelector('.topology-edit-authoring-hud__target span');
    if (targetText) targetText.textContent = 'Select one compatible straight canonical pipe edge in the viewport or tree.';
  }

  updateEvidence() {
    super.updateEvidence();
    const host = this.controller.hostElement;
    if (!host) return;
    let optionCount = 0;
    if (INLINE_TOOLS.has(this.state.tool) && this.state.target && this.catalogue()) {
      try {
        optionCount = topologyEditInlineAuthoringCatalogueOptions({
          topology: this.controller.session?.currentTopology(),
          authoringSession: this.state,
          catalogue: this.catalogue(),
        }).length;
      } catch {
        optionCount = 0;
      }
    }
    host.dataset.topologyEditAuthoringCatalogueRecordId =
      this.state.properties.catalogueRecordId ?? '';
    host.dataset.topologyEditAuthoringCatalogueOptionCount = String(optionCount);
    host.dataset.topologyEditAuthoringInlineDirection =
      this.state.properties.inlineDirection ?? '';
  }

  handleFieldChange(event) {
    if (!INLINE_TOOLS.has(this.state.tool)) return;
    const field = event.target?.dataset?.authoringField;
    if (!['catalogueRecordId', 'inlineDirection'].includes(field)) return;
    try {
      const topology = this.controller.session?.currentTopology();
      const catalogue = this.catalogue();
      if (!topology || !catalogue || !this.state.target) return;
      const patch = this.readInlineUserProperties();
      this.state = updateTopologyEditAuthoringProperties(this.state, patch, 'USER_INPUT');
      this.applyInlineDefaults(topology, catalogue, patch, 'USER_INPUT');
      this.clearCandidateState();
      this.error = null;
      this.message = `${this.state.tool} catalogue evidence updated from the exact selected record.`;
    } catch (error) {
      this.error = errorMessage(error);
      this.message = 'Catalogue selection is not compatible with the selected edge.';
    }
    this.publish();
  }

  applyInlineDefaults(topology, catalogue, overrides, userAuthority) {
    const defaults = topologyEditAuthoringDefaultProperties({
      topology,
      authoringSession: this.state,
      catalogue,
      catalogueRecordId: overrides.catalogueRecordId,
      inlineDirection: overrides.inlineDirection,
      stationMm: overrides.stationMm,
    });
    const userFields = USER_FIELDS[this.state.tool];
    const derived = {};
    const catalogueValues = {};
    for (const [key, value] of Object.entries(defaults)) {
      if (userFields.has(key)) derived[key] = value;
      else catalogueValues[key] = value;
    }
    this.state = updateTopologyEditAuthoringProperties(this.state, derived, userAuthority);
    this.state = updateTopologyEditAuthoringProperties(this.state, catalogueValues, 'CATALOGUE');
  }

  readInlineUserProperties() {
    const fields = USER_FIELDS[this.state.tool];
    return Object.fromEntries([...fields].map((key) => {
      const control = this.element?.querySelector(`[data-authoring-field="${key}"]`);
      if (!control) throw new Error(`Authoring field ${key} is unavailable.`);
      return [key, control.value];
    }));
  }

  renderCatalogueSelector() {
    const input = this.element.querySelector('[data-authoring-field="catalogueRecordId"]');
    const catalogue = this.catalogue();
    if (!input || !catalogue || !this.state.target) return;
    let options = [];
    try {
      options = topologyEditInlineAuthoringCatalogueOptions({
        topology: this.controller.session?.currentTopology(),
        authoringSession: this.state,
        catalogue,
      });
    } catch {
      options = [];
    }
    const documentRef = this.element.ownerDocument;
    const select = documentRef.createElement('select');
    select.id = input.id;
    select.dataset.authoringField = 'catalogueRecordId';
    select.disabled = this.pending;
    for (const option of options) {
      const row = documentRef.createElement('option');
      row.value = option.recordId;
      row.textContent = option.label;
      row.dataset.inlineDirection = option.direction;
      row.selected = option.recordId === this.state.properties.catalogueRecordId
        && (this.state.tool !== 'REDUCER'
          || option.direction === this.state.properties.inlineDirection);
      select.append(row);
    }
    input.replaceWith(select);
  }

  lockCatalogueFields() {
    const definition = topologyEditAuthoringToolDefinition(this.state.tool);
    for (const field of definition.fields) {
      if (field.authority !== 'CATALOGUE') continue;
      const control = this.element.querySelector(`[data-authoring-field="${field.key}"]`);
      if (!control) continue;
      control.disabled = true;
      control.setAttribute('aria-readonly', 'true');
    }
  }

  catalogue() {
    return this.controller.professionalRuntime?.catalogue ?? null;
  }

  destroy() {
    this.element?.removeEventListener('change', this.boundFieldChange);
    super.destroy();
  }
}

function canonicalSelection(selection, tool) {
  const nodeIds = [...new Set(selection?.nodeIds ?? [])].sort();
  const edgeId = String(selection?.edgeId ?? '').trim() || null;
  const canonicalIds = [...nodeIds, ...(edgeId ? [edgeId] : [])].sort();
  return {
    canonicalIds,
    primaryId: INLINE_TOOLS.has(tool)
      ? edgeId
      : nodeIds.length === 1 ? nodeIds[0] : null,
  };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
