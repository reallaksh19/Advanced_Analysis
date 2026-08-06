import {
  activateTopologyEditAuthoringTool,
  beginTopologyEditAuthoringValidation,
  cancelTopologyEditAuthoring,
  completeTopologyEditAuthoringValidation,
  createTopologyEditAuthoringSession,
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
  createTopologyEditAuthoringValidationReceipt,
  executeTopologyEditAuthoringTransaction,
  prepareTopologyEditAuthoringCandidate,
  redoTopologyEditAuthoringTransaction,
  topologyEditAuthoringCandidateChangedIds,
  undoTopologyEditAuthoringTransaction,
} from '../topology-edit/authoring/topology-edit-authoring-composite-operation.js';
import {
  deriveTopologyEditAuthoredBendProjection,
} from '../topology-edit/authoring/topology-edit-authored-bend-geometry.js';
import {
  TopologyEditValidationWorkerClient,
} from '../topology-edit/professional/topology-edit-validation-worker-client.js';
import {
  ensureTopologyEditAuthoringStyles,
} from './topology-edit-authoring-styles.js';

const IMPLEMENTED_TOOLS = Object.freeze([
  { id: 'MOVE', label: 'Move' },
  { id: 'STRETCH', label: 'Stretch' },
  { id: 'ROUTE_ELBOW', label: 'Route + elbow' },
]);

export class TopologyEditAuthoringRuntime {
  constructor(controller) {
    this.controller = controller;
    this.element = null;
    this.state = createTopologyEditAuthoringSession();
    this.plan = null;
    this.candidate = null;
    this.validation = null;
    this.transaction = null;
    this.redoTransaction = null;
    this.pending = false;
    this.message = 'Choose an authoring tool, then select exact geometry.';
    this.error = null;
    this.validationClient = new TopologyEditValidationWorkerClient();
  }

  mount(element) {
    this.element = element;
    ensureTopologyEditAuthoringStyles(element?.ownerDocument);
    this.reconcileSelection();
    this.render();
    this.updateEvidence();
  }

  handleAction(action) {
    if (action?.startsWith('activate-authoring-')) {
      const tool = action.slice('activate-authoring-'.length).replaceAll('-', '_').toUpperCase();
      return this.activateTool(tool);
    }
    if (action === 'preview-authoring-operation') return this.previewOperation();
    if (action === 'validate-authoring-operation') return this.validateOperation();
    if (action === 'apply-authoring-operation') return this.applyOperation();
    if (action === 'cancel-authoring-operation') return this.clear(true, false);
    return false;
  }

  activateTool(tool) {
    if (!IMPLEMENTED_TOOLS.some((row) => row.id === tool)) return false;
    this.cancelPendingValidation();
    this.clearCandidateState();
    this.state = activateTopologyEditAuthoringTool(this.state, tool);
    this.error = null;
    this.message = `${topologyEditAuthoringToolDefinition(tool).label}: select a compatible canonical target.`;
    this.reconcileSelection();
    this.publish();
    return true;
  }

  selectionChanged() {
    this.reconcileSelection();
    this.clearCandidateState();
    this.publish();
  }

  canonicalChanged(canonical) {
    if (this.plan?.basisHash && this.plan.basisHash !== canonical?.canonicalTopologyHash) {
      this.clearCandidateState();
      if (this.state.tool) {
        this.message = 'Authoring preview cleared because its canonical basis changed.';
        this.reconcileSelection();
      }
    }
    this.render();
    this.updateEvidence();
  }

  reconcileSelection() {
    const selection = canonicalSelection(this.controller.selection);
    this.state = setTopologyEditAuthoringSelection(this.state, selection);
    if (!this.state.tool || !selection.primaryId) return;
    try {
      const topology = this.controller.session?.currentTopology();
      const target = deriveTopologyEditAuthoringTarget({
        topology,
        tool: this.state.tool,
        nodeId: selection.primaryId,
      });
      this.state = setTopologyEditAuthoringTarget(this.state, target);
      const defaults = topologyEditAuthoringDefaultProperties({
        topology,
        authoringSession: this.state,
      });
      this.state = updateTopologyEditAuthoringProperties(this.state, defaults, 'DERIVED');
      this.message = `${topologyEditAuthoringToolDefinition(this.state.tool).label} target ${selection.primaryId} ready for properties.`;
      this.error = null;
    } catch (error) {
      this.error = errorMessage(error);
      this.message = 'Selected geometry is not compatible with the active authoring tool.';
    }
  }

  async previewOperation() {
    if (this.pending || !this.controller.session) return true;
    try {
      this.pending = true;
      this.error = null;
      this.state = updateTopologyEditAuthoringProperties(
        this.state,
        this.readProperties(),
        'USER_INPUT',
      );
      this.plan = createTopologyEditAuthoringOperationPlan({
        topology: this.controller.session.currentTopology(),
        authoringSession: this.state,
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
      this.reject(error, 'Authoring preview blocked.');
    } finally {
      this.pending = false;
      this.publish();
    }
    return true;
  }

  async validateOperation() {
    if (this.pending || !this.plan || !this.candidate) return true;
    const plan = this.plan;
    const candidate = this.candidate;
    this.pending = true;
    this.error = null;
    this.state = beginTopologyEditAuthoringValidation(this.state);
    this.message = 'Validating the exact final candidate in a module worker…';
    this.publish();
    try {
      const result = await this.validationClient.validate({
        operationPlan: plan,
        canonicalTopology: candidate.canonicalTopology,
        previousDiagnostics: this.controller.issues ?? [],
        performancePolicy: {
          fastPathBudgetMs: 16,
          warningBudgetMs: 100,
          hysteresisMs: 4,
        },
        blockingSeverities: ['HIGH'],
      });
      if (this.plan?.planHash !== plan.planHash
        || this.candidate?.candidateHash !== candidate.candidateHash
        || this.controller.session?.currentTopology()?.canonicalTopologyHash
          !== candidate.priorCanonicalHash) {
        throw new RangeError('Authoring validation completed against a stale candidate.');
      }
      this.validation = createTopologyEditAuthoringValidationReceipt({
        candidate,
        workerReceipt: result.receipt,
      });
      this.state = completeTopologyEditAuthoringValidation(this.state, {
        validationHash: this.validation.validationHash,
        status: this.validation.status,
        blockingIssueCount: this.validation.blockingIssueCount,
        diagnostics: this.validation.blockingDiagnostics.map((row) => ({
          code: row.code ?? row.kind ?? row.id ?? 'BLOCKING_DIAGNOSTIC',
          severity: row.severity ?? 'HIGH',
          message: row.message ?? 'Final topology validation blocked the operation.',
        })),
      });
      this.message = this.validation.status === 'READY_TO_APPLY'
        ? `Final-state validation passed; ${candidate.commandCount} command(s) are ready for atomic apply.`
        : `Final-state validation blocked ${this.validation.blockingIssueCount} new high-severity issue(s).`;
    } catch (error) {
      if (error?.name !== 'AbortError') this.reject(error, 'Authoring validation blocked.');
    } finally {
      this.pending = false;
      this.publish();
    }
    return true;
  }

  async applyOperation() {
    if (this.pending || !this.plan || !this.candidate || !this.validation) return true;
    const priorVersion = this.controller.session.journal.sessionVersion;
    const nextSelectionId = this.candidate.operationBindings['step-2.created-node'] ?? null;
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
      this.controller.refreshView(this.controller.session.currentTopology());
      if (nextSelectionId) this.controller.selection = { nodeIds: [nextSelectionId], edgeId: null };
      this.controller.autosaveAfterTransition?.(priorVersion);
      this.message = `Atomic ${receipt.commandCount}-command authoring operation accepted.`;
    } catch (error) {
      this.reject(error, 'Authoring apply blocked.');
    } finally {
      this.pending = false;
      this.publish();
    }
    return true;
  }

  undoOperation() {
    if (!this.transaction || !this.controller.session) return false;
    const priorVersion = this.controller.session.journal.sessionVersion;
    try {
      undoTopologyEditAuthoringTransaction(this.controller.session, this.transaction);
      this.redoTransaction = this.transaction;
      this.transaction = null;
      this.controller.refreshView(this.controller.session.currentTopology());
      this.controller.autosaveAfterTransition?.(priorVersion);
      this.message = 'Authoring operation undone as one exact command group.';
      this.publish();
      return true;
    } catch (error) {
      this.reject(error, 'Authoring undo blocked.');
      this.publish();
      return true;
    }
  }

  redoOperation() {
    if (!this.redoTransaction || !this.controller.session) return false;
    const priorVersion = this.controller.session.journal.sessionVersion;
    try {
      redoTopologyEditAuthoringTransaction(this.controller.session, this.redoTransaction);
      this.transaction = this.redoTransaction;
      this.redoTransaction = null;
      this.controller.refreshView(this.controller.session.currentTopology());
      this.controller.autosaveAfterTransition?.(priorVersion);
      this.message = 'Authoring operation redone as one exact command group.';
      this.publish();
      return true;
    } catch (error) {
      this.reject(error, 'Authoring redo blocked.');
      this.publish();
      return true;
    }
  }

  clear(announce = false, clearTransaction = false) {
    this.cancelPendingValidation();
    this.controller.viewportBackend?.clearGhost();
    this.state = cancelTopologyEditAuthoring(this.state);
    this.clearCandidateState();
    if (clearTransaction) {
      this.transaction = null;
      this.redoTransaction = null;
    }
    this.error = null;
    this.message = 'Choose an authoring tool, then select exact geometry.';
    this.publish();
    if (announce) {
      this.controller.setStatus('Authoring state cancelled; no canonical change occurred.');
    }
    return true;
  }

  clearCandidateState() {
    this.plan = null;
    this.candidate = null;
    this.validation = null;
    this.controller.viewportBackend?.clearGhost();
  }

  cancelPendingValidation() {
    if (this.validationClient.cancel()) this.pending = false;
  }

  reject(error, message) {
    this.error = errorMessage(error);
    this.message = message;
  }

  readProperties() {
    const definition = this.state.tool
      ? topologyEditAuthoringToolDefinition(this.state.tool)
      : null;
    if (!definition) throw new RangeError('Choose an authoring tool first.');
    return Object.fromEntries(definition.fields.map((field) => {
      const control = this.element?.querySelector(`[data-authoring-field="${field.key}"]`);
      if (!control) throw new Error(`Authoring field ${field.key} is unavailable.`);
      return [field.key, control.value];
    }));
  }

  renderCandidateGhost() {
    if (!this.candidate) return;
    const projection = this.controller.deriveVisual(
      this.candidate.canonicalTopology,
      'DRAFT',
    ).projection;
    const changed = new Set(this.candidate.changedCanonicalIds);
    const accepted = (row) => changed.has(
      row.pickTarget?.objectId ?? row.entityId ?? row.id,
    );
    this.controller.viewportBackend?.renderGhost({
      elements: projection.elements.filter(accepted),
      segments: projection.segments.filter(accepted),
    });
  }

  publish() {
    this.render();
    this.updateEvidence();
    this.controller.setStatus(this.error || this.message);
  }

  render() {
    if (!this.element) return;
    const toolButtons = IMPLEMENTED_TOOLS.map((tool) => (
      `<button type="button" data-action="activate-authoring-${tool.id.toLowerCase().replaceAll('_', '-')}"`
      + `${this.state.tool === tool.id ? ' aria-pressed="true"' : ' aria-pressed="false"'}`
      + `${this.pending ? ' disabled' : ''}>${escapeHtml(tool.label)}</button>`
    )).join('');
    const definition = this.state.tool
      ? topologyEditAuthoringToolDefinition(this.state.tool)
      : null;
    const fields = definition?.fields.map((field) => renderField(
      field,
      this.state.properties[field.key],
      this.state.propertyAuthorities[field.key],
      this.pending,
    )).join('') ?? '';
    const target = this.state.target;
    const targetSummary = target
      ? `<strong>${escapeHtml(target.kind)}</strong><code>${escapeHtml(target.canonicalIds.join(', '))}</code>`
      : '<span>Select one compatible canonical node in the viewport or tree.</span>';
    const diagnostics = this.state.diagnostics.length
      ? `<ul>${this.state.diagnostics.map((row) => `<li>${escapeHtml(row.code)}: ${escapeHtml(row.message)}</li>`).join('')}</ul>`
      : '';
    this.element.innerHTML = `
      <div class="topology-edit-authoring-hud" data-authoring-phase="${escapeHtml(this.state.phase)}">
        <div class="topology-edit-authoring-hud__tools" role="group" aria-label="Authoring tools">${toolButtons}</div>
        <div class="topology-edit-authoring-hud__status">
          <span class="topology-edit-authoring-hud__phase">${escapeHtml(this.state.phase.replaceAll('_', ' '))}</span>
          <span>${escapeHtml(this.message)}</span>
        </div>
        <div class="topology-edit-authoring-hud__target">${targetSummary}</div>
        ${definition ? `<form class="topology-edit-authoring-hud__form" data-role="topology-edit-authoring-form">${fields}</form>` : ''}
        ${this.error ? `<p class="topology-edit-authoring-hud__error" role="alert">${escapeHtml(this.error)}</p>` : ''}
        ${diagnostics}
        <div class="topology-edit-authoring-hud__actions" role="group" aria-label="Authoring workflow">
          <button type="button" data-action="preview-authoring-operation" ${!target || this.pending ? 'disabled' : ''}>Preview</button>
          <button type="button" data-action="validate-authoring-operation" ${!this.candidate || this.pending ? 'disabled' : ''}>Validate</button>
          <button type="button" data-action="apply-authoring-operation" ${this.state.phase !== 'READY_TO_APPLY' || this.pending ? 'disabled' : ''}>Apply</button>
          <button type="button" data-action="cancel-authoring-operation" ${!this.state.tool && !this.candidate ? 'disabled' : ''}>Cancel</button>
        </div>
        <div class="topology-edit-authoring-hud__evidence">
          <span>${this.candidate ? `${this.candidate.commandCount} governed command(s)` : 'No candidate'}</span>
          <span>${this.validation ? `${this.validation.finalIssueCount} final issue(s)` : 'Not validated'}</span>
        </div>
      </div>`;
  }

  updateEvidence() {
    const host = this.controller.hostElement;
    if (!host) return;
    host.dataset.topologyEditAuthoringTool = this.state.tool ?? '';
    host.dataset.topologyEditAuthoringPhase = this.state.phase;
    host.dataset.topologyEditAuthoringSessionHash = this.state.sessionHash;
    host.dataset.topologyEditAuthoringTargetHash = this.state.target?.targetHash ?? '';
    host.dataset.topologyEditAuthoringPlanHash = this.plan?.planHash ?? '';
    host.dataset.topologyEditAuthoringCandidateHash = this.candidate?.candidateHash ?? '';
    host.dataset.topologyEditAuthoringCandidateCanonicalHash = this.candidate?.resultingCanonicalHash ?? '';
    host.dataset.topologyEditAuthoringCertificationMode = this.candidate?.certificationMode ?? '';
    host.dataset.topologyEditAuthoringCommandCount = String(this.candidate?.commandCount ?? 0);
    host.dataset.topologyEditAuthoringValidationHash = this.validation?.validationHash ?? '';
    host.dataset.topologyEditAuthoringBlockingIssueCount = String(this.validation?.blockingIssueCount ?? 0);
    host.dataset.topologyEditAuthoringTransactionHash = this.transaction?.transactionHash ?? '';
    host.dataset.topologyEditAuthoredBendProjectionHash = this.controller.session
      ? deriveTopologyEditAuthoredBendProjection(
        this.controller.session.currentTopology(),
      ).projectionHash
      : '';
  }

  destroy() {
    this.clear(false, true);
    this.validationClient.destroy();
    this.element = null;
  }
}

function canonicalSelection(selection) {
  const nodeIds = [...new Set(selection?.nodeIds ?? [])].sort();
  return {
    canonicalIds: nodeIds,
    primaryId: nodeIds.length === 1 ? nodeIds[0] : null,
  };
}

function renderField(field, value, authority, disabled) {
  const id = `topology-edit-authoring-${field.key}`;
  const badge = `<span class="topology-edit-authoring-hud__authority">${escapeHtml(authority ?? field.authority)}</span>`;
  let control;
  if (field.type === 'enum') {
    control = `<select id="${id}" data-authoring-field="${escapeHtml(field.key)}" ${disabled ? 'disabled' : ''}>${field.options.map((option) => (
      `<option value="${escapeHtml(option)}" ${String(value) === option ? 'selected' : ''}>${escapeHtml(option)}</option>`
    )).join('')}</select>`;
  } else {
    const type = field.type === 'number' ? 'number' : 'text';
    const step = field.type === 'number' ? ' step="any"' : '';
    control = `<input id="${id}" type="${type}"${step} data-authoring-field="${escapeHtml(field.key)}" value="${escapeHtml(value ?? '')}" ${disabled ? 'disabled' : ''}>`;
  }
  return `<label for="${id}"><span>${escapeHtml(field.label)}${field.unit ? ` (${escapeHtml(field.unit)})` : ''}</span>${badge}${control}</label>`;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}
