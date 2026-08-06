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
  topologyEditValveAssemblyCatalogueOptions,
} from '../topology-edit/authoring/topology-edit-authoring-valve-assembly.js';
import {
  topologyEditBranchAuthoringCatalogueOptions,
} from '../topology-edit/authoring/topology-edit-authoring-branch.js';
import {
  executeTopologyEditAuthoringTransaction,
  prepareTopologyEditAuthoringCandidate,
  topologyEditAuthoringCandidateChangedIds,
} from '../topology-edit/authoring/topology-edit-authoring-composite-operation.js';
import {
  TopologyEditAuthoringRuntime,
} from './topology-edit-authoring-runtime.js';

const COMPONENT_TOOLS = new Set(['FLANGE', 'REDUCER', 'VALVE_ASSEMBLY', 'BRANCH']);
const COMPONENT_TOOL_BUTTONS = Object.freeze([
  { id: 'VALVE_ASSEMBLY', label: 'Valve assembly' },
  { id: 'FLANGE', label: 'Flange' },
  { id: 'REDUCER', label: 'Reducer' },
  { id: 'BRANCH', label: 'Tee / Olet branch' },
]);
const USER_FIELDS = Object.freeze({
  FLANGE: new Set(['stationMm', 'catalogueRecordId']),
  REDUCER: new Set(['stationMm', 'catalogueRecordId', 'inlineDirection']),
  VALVE_ASSEMBLY: new Set([
    'stationMm',
    'valveRecordId',
    'upstreamFlangeRecordId',
    'downstreamFlangeRecordId',
  ]),
  BRANCH: new Set([
    'stationMm',
    'catalogueRecordId',
    'clockingDeg',
    'branchPipeLengthMm',
  ]),
});
const RECORD_FIELDS = new Set([
  'catalogueRecordId',
  'inlineDirection',
  'valveRecordId',
  'upstreamFlangeRecordId',
  'downstreamFlangeRecordId',
]);

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
    if (!COMPONENT_TOOLS.has(tool)) return super.activateTool(tool);
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
    if (!COMPONENT_TOOLS.has(this.state.tool)) return super.reconcileSelection();
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
      this.applyComponentDefaults(topology, catalogue, {}, 'DERIVED');
      this.message = `${topologyEditAuthoringToolDefinition(this.state.tool).label} target ${selection.primaryId} is ready with exact catalogue options.`;
      this.error = null;
    } catch (error) {
      this.error = errorMessage(error);
      this.message = 'Selected geometry is not compatible with the active component tool.';
    }
  }

  async previewOperation() {
    if (!COMPONENT_TOOLS.has(this.state.tool)) return super.previewOperation();
    if (this.pending || !this.controller.session) return true;
    try {
      this.pending = true;
      this.error = null;
      const topology = this.controller.session.currentTopology();
      const catalogue = this.catalogue();
      if (!catalogue) throw new RangeError('The governed piping catalogue is not loaded.');
      const userValues = this.readComponentUserProperties();
      this.state = updateTopologyEditAuthoringProperties(this.state, userValues, 'USER_INPUT');
      this.applyComponentDefaults(topology, catalogue, userValues, 'USER_INPUT');
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
    if (!COMPONENT_TOOLS.has(this.state.tool)) return super.applyOperation();
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
      this.suppressSelectionReconciles = 1;
      this.controller.autosaveAfterTransition?.(priorVersion);
      this.message = `Atomic ${receipt.commandCount}-command ${toolLabel(this.state.tool)} authoring operation accepted.`;
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
      for (const tool of COMPONENT_TOOL_BUTTONS) {
        const action = `activate-authoring-${tool.id.toLowerCase().replaceAll('_', '-')}`;
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
    if (!COMPONENT_TOOLS.has(this.state.tool)) return;
    if (this.state.tool === 'VALVE_ASSEMBLY') this.renderAssemblySelectors();
    else if (this.state.tool === 'BRANCH') this.renderBranchCatalogueSelector();
    else this.renderInlineCatalogueSelector();
    this.lockGovernedFields();
    const targetText = this.element.querySelector('.topology-edit-authoring-hud__target span');
    if (targetText) targetText.textContent = 'Select one compatible straight canonical pipe edge in the viewport or tree.';
  }

  updateEvidence() {
    super.updateEvidence();
    const host = this.controller.hostElement;
    if (!host) return;
    let optionCount = 0;
    if (COMPONENT_TOOLS.has(this.state.tool) && this.state.target && this.catalogue()) {
      try {
        if (this.state.tool === 'VALVE_ASSEMBLY') {
          optionCount = topologyEditValveAssemblyCatalogueOptions({
            topology: this.controller.session?.currentTopology(),
            authoringSession: this.state,
            catalogue: this.catalogue(),
          }).compatibleAssemblyCount;
        } else if (this.state.tool === 'BRANCH') {
          optionCount = topologyEditBranchAuthoringCatalogueOptions({
            topology: this.controller.session?.currentTopology(),
            authoringSession: this.state,
            catalogue: this.catalogue(),
          }).length;
        } else {
          optionCount = topologyEditInlineAuthoringCatalogueOptions({
            topology: this.controller.session?.currentTopology(),
            authoringSession: this.state,
            catalogue: this.catalogue(),
          }).length;
        }
      } catch {
        optionCount = 0;
      }
    }
    host.dataset.topologyEditAuthoringCatalogueRecordId = this.state.properties.catalogueRecordId ?? '';
    host.dataset.topologyEditAuthoringCatalogueOptionCount = String(optionCount);
    host.dataset.topologyEditAuthoringInlineDirection = this.state.properties.inlineDirection ?? '';
    host.dataset.topologyEditAuthoringValveRecordId = this.state.properties.valveRecordId ?? '';
    host.dataset.topologyEditAuthoringUpstreamFlangeRecordId = this.state.properties.upstreamFlangeRecordId ?? '';
    host.dataset.topologyEditAuthoringDownstreamFlangeRecordId = this.state.properties.downstreamFlangeRecordId ?? '';
    host.dataset.topologyEditAuthoringAssemblyLengthMm = String(this.state.properties.assemblyLengthMm ?? '');
    host.dataset.topologyEditAuthoringAssemblyMassKg = String(this.state.properties.assemblyMassKg ?? '');
    host.dataset.topologyEditAuthoringBranchFamily = this.state.properties.branchFamily ?? '';
    host.dataset.topologyEditAuthoringBranchClockingDeg = String(this.state.properties.clockingDeg ?? '');
    host.dataset.topologyEditAuthoringBranchPipeLengthMm = String(this.state.properties.branchPipeLengthMm ?? '');
    host.dataset.topologyEditAuthoringBranchReachMm = String(this.state.properties.totalBranchReachMm ?? '');
  }

  handleFieldChange(event) {
    if (!COMPONENT_TOOLS.has(this.state.tool)) return;
    const field = event.target?.dataset?.authoringField;
    if (!RECORD_FIELDS.has(field)) return;
    try {
      const topology = this.controller.session?.currentTopology();
      const catalogue = this.catalogue();
      if (!topology || !catalogue || !this.state.target) return;
      const patch = this.readComponentUserProperties();
      this.state = updateTopologyEditAuthoringProperties(this.state, patch, 'USER_INPUT');
      this.applyComponentDefaults(topology, catalogue, patch, 'USER_INPUT');
      this.clearCandidateState();
      this.error = null;
      this.message = `${toolLabel(this.state.tool)} catalogue evidence updated from exact selected records.`;
    } catch (error) {
      this.error = errorMessage(error);
      this.message = 'Catalogue selection is not compatible with the selected edge.';
    }
    this.publish();
  }

  applyComponentDefaults(topology, catalogue, overrides, userAuthority) {
    const defaults = topologyEditAuthoringDefaultProperties({
      topology,
      authoringSession: this.state,
      catalogue,
      catalogueRecordId: overrides.catalogueRecordId,
      inlineDirection: overrides.inlineDirection,
      stationMm: overrides.stationMm,
      valveRecordId: overrides.valveRecordId,
      upstreamFlangeRecordId: overrides.upstreamFlangeRecordId,
      downstreamFlangeRecordId: overrides.downstreamFlangeRecordId,
      clockingDeg: overrides.clockingDeg,
      branchPipeLengthMm: overrides.branchPipeLengthMm,
    });
    const userFields = USER_FIELDS[this.state.tool];
    const definition = topologyEditAuthoringToolDefinition(this.state.tool);
    const authorityByKey = new Map(definition.fields.map((field) => [field.key, field.authority]));
    const patches = { user: {}, catalogue: {}, derived: {} };
    for (const [key, value] of Object.entries(defaults)) {
      if (userFields.has(key)) patches.user[key] = value;
      else if (authorityByKey.get(key) === 'DERIVED') patches.derived[key] = value;
      else patches.catalogue[key] = value;
    }
    if (Object.keys(patches.user).length) {
      this.state = updateTopologyEditAuthoringProperties(this.state, patches.user, userAuthority);
    }
    if (Object.keys(patches.catalogue).length) {
      this.state = updateTopologyEditAuthoringProperties(this.state, patches.catalogue, 'CATALOGUE');
    }
    if (Object.keys(patches.derived).length) {
      this.state = updateTopologyEditAuthoringProperties(this.state, patches.derived, 'DERIVED');
    }
  }

  readComponentUserProperties() {
    const fields = USER_FIELDS[this.state.tool];
    return Object.fromEntries([...fields].map((key) => {
      const control = this.element?.querySelector(`[data-authoring-field="${key}"]`);
      if (!control) throw new Error(`Authoring field ${key} is unavailable.`);
      return [key, control.value];
    }));
  }

  renderInlineCatalogueSelector() {
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
    replaceWithSelect(input, options, this.state.properties.catalogueRecordId, this.pending, (row) => ({
      value: row.recordId,
      label: row.label,
      selected: row.recordId === this.state.properties.catalogueRecordId
        && (this.state.tool !== 'REDUCER' || row.direction === this.state.properties.inlineDirection),
      data: { inlineDirection: row.direction },
    }));
  }

  renderBranchCatalogueSelector() {
    const input = this.element.querySelector('[data-authoring-field="catalogueRecordId"]');
    const catalogue = this.catalogue();
    if (!input || !catalogue || !this.state.target) return;
    let options = [];
    try {
      options = topologyEditBranchAuthoringCatalogueOptions({
        topology: this.controller.session?.currentTopology(),
        authoringSession: this.state,
        catalogue,
      });
    } catch {
      options = [];
    }
    replaceWithSelect(input, options, this.state.properties.catalogueRecordId, this.pending, (row) => ({
      value: row.recordId,
      label: row.label,
      selected: row.recordId === this.state.properties.catalogueRecordId,
    }));
  }

  renderAssemblySelectors() {
    const catalogue = this.catalogue();
    if (!catalogue || !this.state.target) return;
    let options;
    try {
      options = topologyEditValveAssemblyCatalogueOptions({
        topology: this.controller.session?.currentTopology(),
        authoringSession: this.state,
        catalogue,
      });
    } catch {
      options = {
        valveOptions: [], upstreamFlangeOptions: [], downstreamFlangeOptions: [],
      };
    }
    const definitions = [
      ['valveRecordId', options.valveOptions],
      ['upstreamFlangeRecordId', options.upstreamFlangeOptions],
      ['downstreamFlangeRecordId', options.downstreamFlangeOptions],
    ];
    for (const [key, rows] of definitions) {
      const input = this.element.querySelector(`[data-authoring-field="${key}"]`);
      if (!input) continue;
      replaceWithSelect(input, rows, this.state.properties[key], this.pending, (row) => ({
        value: row.recordId,
        label: row.label,
        selected: row.recordId === this.state.properties[key],
      }));
    }
  }

  lockGovernedFields() {
    const definition = topologyEditAuthoringToolDefinition(this.state.tool);
    for (const field of definition.fields) {
      if (!['CATALOGUE', 'DERIVED'].includes(field.authority)) continue;
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

function replaceWithSelect(input, rows, selectedValue, disabled, project) {
  const documentRef = input.ownerDocument;
  const select = documentRef.createElement('select');
  select.id = input.id;
  select.dataset.authoringField = input.dataset.authoringField;
  select.disabled = disabled;
  for (const source of rows ?? []) {
    const option = project(source);
    const row = documentRef.createElement('option');
    row.value = option.value;
    row.textContent = option.label;
    row.selected = option.selected ?? option.value === selectedValue;
    for (const [key, value] of Object.entries(option.data ?? {})) row.dataset[key] = value;
    select.append(row);
  }
  input.replaceWith(select);
}

function canonicalSelection(selection, tool) {
  const nodeIds = [...new Set(selection?.nodeIds ?? [])].sort();
  const edgeId = String(selection?.edgeId ?? '').trim() || null;
  const canonicalIds = [...nodeIds, ...(edgeId ? [edgeId] : [])].sort();
  return {
    canonicalIds,
    primaryId: COMPONENT_TOOLS.has(tool)
      ? edgeId
      : nodeIds.length === 1 ? nodeIds[0] : null,
  };
}

function toolLabel(tool) {
  return topologyEditAuthoringToolDefinition(tool).label.toLowerCase();
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
