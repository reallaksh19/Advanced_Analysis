import {
  activateTopologyEditAuthoringTool,
  publishTopologyEditAuthoringPreview,
  setTopologyEditAuthoringSelection,
  setTopologyEditAuthoringTarget,
  topologyEditAuthoringToolDefinition,
  updateTopologyEditAuthoringProperties,
} from '../topology-edit/authoring/topology-edit-authoring-session.js';
import {
  deriveTopologyEditBlindFlangeTarget,
  planTopologyEditBlindFlangeAuthoringOperation,
  topologyEditBlindFlangeCatalogueOptions,
  topologyEditBlindFlangeDefaultProperties,
} from '../topology-edit/authoring/topology-edit-authoring-blind-flange.js';
import {
  prepareTopologyEditAuthoringCandidate,
  topologyEditAuthoringCandidateChangedIds,
} from '../topology-edit/authoring/topology-edit-authoring-composite-operation.js';
import {
  TopologyEditComponentAuthoringRuntime,
} from './topology-edit-component-authoring-runtime.js';

const TOOL = 'BLIND_FLANGE';

export class TopologyEditBlindFlangeAuthoringRuntime
  extends TopologyEditComponentAuthoringRuntime {
  activateTool(tool) {
    if (tool !== TOOL) return super.activateTool(tool);
    this.cancelPendingValidation();
    this.clearCandidateState();
    this.state = activateTopologyEditAuthoringTool(this.state, TOOL);
    this.error = null;
    this.message = 'Blind flange: select one graph-open canonical pipe endpoint.';
    this.reconcileSelection();
    this.publish();
    return true;
  }

  reconcileSelection() {
    if (this.state.tool !== TOOL) return super.reconcileSelection();
    const selection = blindSelection(this.controller.selection);
    this.state = setTopologyEditAuthoringSelection(this.state, selection);
    if (!selection.primaryId) return;
    try {
      const topology = this.controller.session?.currentTopology();
      const catalogue = this.catalogue();
      if (!catalogue) throw new RangeError('The governed piping catalogue is not loaded.');
      const target = deriveTopologyEditBlindFlangeTarget({
        topology,
        nodeId: selection.primaryId,
      });
      this.state = setTopologyEditAuthoringTarget(this.state, target);
      this.applyBlindDefaults(topology, catalogue, {}, 'DERIVED');
      this.message = `Blind flange endpoint ${selection.primaryId} is ready with exact catalogue options.`;
      this.error = null;
    } catch (error) {
      this.error = errorMessage(error);
      this.message = 'Selected geometry is not a compatible graph-open pipe endpoint.';
    }
  }

  async previewOperation() {
    if (this.state.tool !== TOOL) return super.previewOperation();
    if (this.pending || !this.controller.session) return true;
    try {
      this.pending = true;
      this.error = null;
      const topology = this.controller.session.currentTopology();
      const catalogue = this.catalogue();
      if (!catalogue) throw new RangeError('The governed piping catalogue is not loaded.');
      const userValues = this.readBlindUserProperties();
      this.state = updateTopologyEditAuthoringProperties(
        this.state,
        userValues,
        'USER_INPUT',
      );
      this.applyBlindDefaults(topology, catalogue, userValues, 'USER_INPUT');
      this.plan = planTopologyEditBlindFlangeAuthoringOperation({
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
      this.message = `BLIND_FLANGE preview ready: ${changedCanonicalIds.length} canonical object(s), ${this.candidate.commandCount} governed command(s).`;
    } catch (error) {
      this.reject(error, 'Blind flange authoring preview blocked.');
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
      const action = 'activate-authoring-blind-flange';
      if (!tools.querySelector(`[data-action="${action}"]`)) {
        const button = documentRef.createElement('button');
        button.type = 'button';
        button.dataset.action = action;
        button.textContent = 'Blind flange';
        button.disabled = this.pending;
        button.setAttribute('aria-pressed', String(this.state.tool === TOOL));
        tools.append(button);
      }
    }
    if (this.state.tool !== TOOL) return;
    this.renderBlindCatalogueSelector();
    this.lockGovernedFields();
    for (const key of ['nominalSizeMm']) {
      const control = this.element.querySelector(`[data-authoring-field="${key}"]`);
      if (!control) continue;
      control.disabled = true;
      control.setAttribute('aria-readonly', 'true');
    }
    const targetText = this.element.querySelector('.topology-edit-authoring-hud__target span');
    if (targetText) {
      targetText.textContent = 'Select one graph-open canonical pipe endpoint in the viewport or tree.';
    }
  }

  updateEvidence() {
    super.updateEvidence();
    if (this.state.tool !== TOOL) return;
    const host = this.controller.hostElement;
    if (!host) return;
    let options = [];
    if (this.state.target && this.catalogue()) {
      try {
        options = topologyEditBlindFlangeCatalogueOptions({
          topology: this.controller.session?.currentTopology(),
          authoringSession: this.state,
          catalogue: this.catalogue(),
        });
      } catch {
        options = [];
      }
    }
    host.dataset.topologyEditAuthoringCatalogueRecordId =
      this.state.properties.catalogueRecordId ?? '';
    host.dataset.topologyEditAuthoringCatalogueOptionCount = String(options.length);
    host.dataset.topologyEditAuthoringBlindFlangeThicknessMm = String(
      this.state.properties.thicknessMm ?? '',
    );
    host.dataset.topologyEditAuthoringBlindFlangeFacing =
      this.state.properties.facing ?? '';
  }

  handleFieldChange(event) {
    if (this.state.tool !== TOOL) return super.handleFieldChange(event);
    const field = event.target?.dataset?.authoringField;
    if (field !== 'catalogueRecordId') return;
    try {
      const topology = this.controller.session?.currentTopology();
      const catalogue = this.catalogue();
      if (!topology || !catalogue || !this.state.target) return;
      const patch = this.readBlindUserProperties();
      this.state = updateTopologyEditAuthoringProperties(
        this.state,
        patch,
        'USER_INPUT',
      );
      this.applyBlindDefaults(topology, catalogue, patch, 'USER_INPUT');
      this.clearCandidateState();
      this.error = null;
      this.message = 'Blind flange evidence updated from the exact selected catalogue record.';
    } catch (error) {
      this.error = errorMessage(error);
      this.message = 'Blind flange catalogue selection is not compatible with the endpoint.';
    }
    this.publish();
  }

  applyBlindDefaults(topology, catalogue, overrides, userAuthority) {
    const defaults = topologyEditBlindFlangeDefaultProperties({
      topology,
      authoringSession: this.state,
      catalogue,
      catalogueRecordId: overrides.catalogueRecordId,
    });
    this.state = updateTopologyEditAuthoringProperties(this.state, {
      catalogueRecordId: defaults.catalogueRecordId,
    }, userAuthority);
    this.state = updateTopologyEditAuthoringProperties(this.state, {
      nominalSizeMm: defaults.nominalSizeMm,
      pressureClass: defaults.pressureClass,
      facing: defaults.facing,
      thicknessMm: defaults.thicknessMm,
      componentMassKg: defaults.componentMassKg,
    }, 'CATALOGUE');
  }

  readBlindUserProperties() {
    const control = this.element?.querySelector(
      '[data-authoring-field="catalogueRecordId"]',
    );
    if (!control) throw new Error('Authoring field catalogueRecordId is unavailable.');
    return { catalogueRecordId: control.value };
  }

  renderBlindCatalogueSelector() {
    const input = this.element.querySelector('[data-authoring-field="catalogueRecordId"]');
    const catalogue = this.catalogue();
    if (!input || !catalogue || !this.state.target) return;
    let options = [];
    try {
      options = topologyEditBlindFlangeCatalogueOptions({
        topology: this.controller.session?.currentTopology(),
        authoringSession: this.state,
        catalogue,
      });
    } catch {
      options = [];
    }
    const select = input.ownerDocument.createElement('select');
    select.id = input.id;
    select.dataset.authoringField = input.dataset.authoringField;
    select.disabled = this.pending;
    for (const option of options) {
      const row = input.ownerDocument.createElement('option');
      row.value = option.recordId;
      row.textContent = option.label;
      row.selected = option.recordId === this.state.properties.catalogueRecordId;
      select.append(row);
    }
    input.replaceWith(select);
  }
}

function blindSelection(selection) {
  const rawNodeIds = typeof selection?.nodeIds === 'string'
    ? [selection.nodeIds]
    : selection?.nodeIds instanceof Set
      ? [...selection.nodeIds]
      : Array.isArray(selection?.nodeIds)
        ? selection.nodeIds
        : [];
  const nodeIds = [...new Set(rawNodeIds.map((id) => String(id).trim()).filter(Boolean))]
    .sort();
  const edgeId = String(selection?.edgeId ?? '').trim() || null;
  return {
    canonicalIds: [...nodeIds, ...(edgeId ? [edgeId] : [])].sort(),
    primaryId: nodeIds.length === 1 ? nodeIds[0] : null,
  };
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
