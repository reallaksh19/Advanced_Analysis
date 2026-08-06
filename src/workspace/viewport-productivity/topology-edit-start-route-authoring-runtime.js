import {
  activateStartRouteRuntime,
  beginStartRouteRuntimeValidation,
  cancelStartRouteRuntime,
  completeStartRouteRuntimeValidation,
  createStartRouteRuntime,
  markStartRouteRuntimeApplied,
  markStartRouteStartPointAcquired,
  publishStartRouteGhost,
} from './topology-edit-start-route-runtime.js';
import {
  createStartRouteHudValues,
  readStartRouteHud,
  renderStartRouteRuntime,
  updateStartRouteRuntimeEvidence,
  writeStartRouteHudPoint,
} from './topology-edit-start-route-hud.js';
import { START_ROUTE_TRANSACTION_SCHEMA } from '../topology-edit/authoring/topology-edit-start-route-transaction.js';
import {
  applyStartRouteAuthoring,
  cancelStartRouteAuthoring,
  prepareStartRouteAuthoring,
  redoStartRouteAuthoring,
  startRouteExactSnapAcquisition,
  startRoutePipeOptions,
  undoStartRouteAuthoring,
  validateStartRouteAuthoring,
} from './topology-edit-start-route-authoring-service.js';
import { TopologyEditBlindFlangeAuthoringRuntime } from './topology-edit-blind-flange-authoring-runtime.js';
export class TopologyEditStartRouteAuthoringRuntime
  extends TopologyEditBlindFlangeAuthoringRuntime {
  constructor(controller) {
    super(controller);
    this.startRouteActive = false;
    this.startRouteRuntime = createStartRouteRuntime();
    this.startRouteValues = createStartRouteHudValues();
    this.startAcquisition = null;
    this.endAcquisition = null;
    this.preview = null;
    this.cancelReceipt = null;
  }
  handleAction(action) {
    if (action === 'activate-authoring-start-route') return this.activateStartRoute();
    if (!this.startRouteActive) return super.handleAction(action);
    if (action?.startsWith('activate-authoring-')) {
      this.clear(false, false);
      return super.handleAction(action);
    }
    const actions = {
      'capture-start-route-start': () => this.captureSnap('start'),
      'capture-start-route-end': () => this.captureSnap('end'),
      'preview-authoring-operation': () => this.previewOperation(),
      'validate-authoring-operation': () => this.validateOperation(),
      'apply-authoring-operation': () => this.applyOperation(),
      'cancel-authoring-operation': () => this.clear(true, false),
      'undo-start-route-operation': () => this.undoOperation(),
      'redo-start-route-operation': () => this.redoOperation(),
    };
    return actions[action]?.() ?? false;
  }
  activateStartRoute() {
    super.clear(false, false);
    this.startRouteActive = true;
    this.startRouteRuntime = activateStartRouteRuntime(createStartRouteRuntime());
    this.startRouteValues = createStartRouteHudValues();
    this.startAcquisition = null;
    this.endAcquisition = null;
    this.preview = null;
    this.error = null;
    this.message = 'Start Route: enter exact XYZ or capture one exact deterministic snap per endpoint.';
    this.publish();
    return true;
  }
  selectionChanged() {
    return this.startRouteActive ? this.publish() : super.selectionChanged();
  }
  reconcileSelection() {
    if (!this.startRouteActive) return super.reconcileSelection();
  }
  canonicalChanged(canonical) {
    if (!this.startRouteActive) return super.canonicalChanged(canonical);
    if (this.plan?.basis?.priorCanonicalHash
      && this.plan.basis.priorCanonicalHash !== canonical?.canonicalTopologyHash) {
      this.clearStartRouteCandidate();
      this.message = 'Start Route preview cleared because its canonical basis changed.';
    }
    this.render();
    this.updateEvidence();
  }
  handleFieldChange() {
    if (!this.startRouteActive) return super.handleFieldChange(...arguments);
    const previousMode = this.startRouteValues.inputMode;
    this.startRouteValues = readStartRouteHud(this.element, this.startRouteValues);
    if (previousMode !== this.startRouteValues.inputMode) {
      this.startAcquisition = null;
      this.endAcquisition = null;
    }
    this.startRouteRuntime = activateStartRouteRuntime(this.startRouteRuntime);
    if (this.startAcquisition) {
      this.startRouteRuntime = markStartRouteStartPointAcquired(this.startRouteRuntime);
    }
    this.clearStartRouteCandidate();
    this.error = null;
    this.message = 'Start Route inputs changed; create a new preview.';
    this.publish();
  }
  captureSnap(role) {
    try {
      const acquisition = startRouteExactSnapAcquisition(this.controller);
      writeStartRouteHudPoint(this.element, role, acquisition.modelPointMm);
      this.startRouteValues = readStartRouteHud(this.element, this.startRouteValues);
      if (role === 'start') {
        this.startAcquisition = acquisition;
        this.startRouteRuntime = markStartRouteStartPointAcquired(this.startRouteRuntime);
      } else this.endAcquisition = acquisition;
      this.clearStartRouteCandidate();
      this.error = null;
      this.message = `Exact viewport snap captured as ${role} point.`;
    } catch (error) {
      this.reject(error, `Start Route ${role} acquisition blocked.`);
    }
    this.publish();
    return true;
  }
  async previewOperation() {
    if (!this.startRouteActive) return super.previewOperation();
    if (this.pending || !this.controller.session) return true;
    try {
      this.pending = true;
      this.error = null;
      this.startRouteValues = readStartRouteHud(this.element, this.startRouteValues);
      const catalogue = this.requiredCatalogue();
      const prepared = await prepareStartRouteAuthoring({
        controller: this.controller,
        values: this.startRouteValues,
        startAcquisition: this.startAcquisition,
        endAcquisition: this.endAcquisition,
        catalogue,
      });
      Object.assign(this, prepared, { validation: null });
      this.startRouteRuntime = publishStartRouteGhost(
        this.startRouteRuntime,
        this.preview,
        this.plan.geometry,
      );
      this.renderCandidateGhost();
      this.message = 'Start Route preview ready: two nodes and one governed pipe.';
    } catch (error) {
      this.reject(error, 'Start Route preview blocked.');
    } finally {
      this.pending = false;
      this.publish();
    }
    return true;
  }
  async validateOperation() {
    if (!this.startRouteActive) return super.validateOperation();
    if (this.pending || !this.plan || !this.candidate) return true;
    const { plan, candidate } = this;
    try {
      this.pending = true;
      this.error = null;
      this.startRouteRuntime = beginStartRouteRuntimeValidation(this.startRouteRuntime);
      this.message = 'Validating the exact Start Route candidate in the module worker…';
      this.publish();
      const result = await validateStartRouteAuthoring({
        controller: this.controller,
        validationClient: this.validationClient,
        plan,
        candidate,
      });
      this.assertCurrentCandidate(plan, candidate);
      this.validation = result.validation;
      this.startRouteRuntime = completeStartRouteRuntimeValidation(
        this.startRouteRuntime,
        this.validation,
      );
      this.message = this.validation.status === 'READY_TO_APPLY'
        ? 'Final-state validation passed; three certified commands are ready.'
        : `Start Route blocked by ${this.validation.blockingIssueCount} new high-severity issue(s).`;
    } catch (error) {
      if (error?.name !== 'AbortError') this.reject(error, 'Start Route validation blocked.');
    } finally {
      this.pending = false;
      this.publish();
    }
    return true;
  }
  async applyOperation() {
    if (!this.startRouteActive) return super.applyOperation();
    if (this.pending || !this.plan || !this.candidate || !this.preview || !this.validation) return true;
    const priorVersion = this.controller.session.journal.sessionVersion;
    const endNodeId = this.candidate.operationBindings['step-2.created-node'];
    try {
      this.pending = true;
      this.transaction = await applyStartRouteAuthoring({
        controller: this.controller,
        plan: this.plan,
        candidate: this.candidate,
        preview: this.preview,
        validation: this.validation,
        catalogue: this.requiredCatalogue(),
      });
      this.redoTransaction = null;
      this.startRouteRuntime = markStartRouteRuntimeApplied(this.startRouteRuntime);
      this.clearStartRouteCandidate();
      this.controller.refreshView(this.controller.session.currentTopology());
      if (endNodeId) this.controller.selection = { nodeIds: [endNodeId], edgeId: null };
      this.controller.autosaveAfterTransition?.(priorVersion);
      this.message = 'Atomic three-command Start Route operation accepted.';
      this.error = null;
    } catch (error) {
      this.reject(error, 'Start Route apply blocked.');
    } finally {
      this.pending = false;
      this.publish();
    }
    return true;
  }
  undoOperation() {
    if (this.transaction?.schema === START_ROUTE_TRANSACTION_SCHEMA) {
      return this.transitionHistory('undo', this.transaction);
    }
    return super.undoOperation();
  }
  redoOperation() {
    if (this.redoTransaction?.schema === START_ROUTE_TRANSACTION_SCHEMA) {
      return this.transitionHistory('redo', this.redoTransaction);
    }
    return super.redoOperation();
  }
  transitionHistory(direction, receipt) {
    if (!receipt || !this.controller.session) return false;
    const priorVersion = this.controller.session.journal.sessionVersion;
    try {
      if (direction === 'undo') {
        undoStartRouteAuthoring(this.controller, receipt);
        this.redoTransaction = receipt;
        this.transaction = null;
      } else {
        redoStartRouteAuthoring(this.controller, receipt);
        this.transaction = receipt;
        this.redoTransaction = null;
      }
      this.startRouteRuntime = cancelStartRouteRuntime(this.startRouteRuntime);
      this.controller.refreshView(this.controller.session.currentTopology());
      this.controller.autosaveAfterTransition?.(priorVersion);
      this.message = `Start Route ${direction} restored the exact canonical hash.`;
      this.error = null;
    } catch (error) {
      this.reject(error, `Start Route ${direction} blocked.`);
    }
    this.publish();
    return true;
  }
  clear(announce = false, clearTransaction = false) {
    if (!this.startRouteActive) return super.clear(announce, clearTransaction);
    this.cancelPendingValidation();
    try {
      this.cancelReceipt = cancelStartRouteAuthoring(this.controller, this.preview);
    } catch {
      this.cancelReceipt = null;
    }
    this.startRouteActive = false;
    this.startRouteRuntime = cancelStartRouteRuntime(this.startRouteRuntime);
    this.startAcquisition = null;
    this.endAcquisition = null;
    this.preview = null;
    return super.clear(announce, clearTransaction);
  }
  render() {
    super.render();
    renderStartRouteRuntime(this, startRoutePipeOptions(this.catalogue()));
  }
  updateEvidence() {
    super.updateEvidence();
    updateStartRouteRuntimeEvidence(this);
  }
  requiredCatalogue() {
    const catalogue = this.catalogue();
    if (!catalogue) throw new RangeError('The governed piping catalogue is not loaded.');
    return catalogue;
  }
  assertCurrentCandidate(plan, candidate) {
    if (this.plan?.planHash !== plan.planHash
      || this.candidate?.candidateHash !== candidate.candidateHash
      || this.controller.session?.currentTopology()?.canonicalTopologyHash
        !== candidate.priorCanonicalHash) {
      throw new RangeError('Start Route validation completed against a stale candidate.');
    }
  }
  clearStartRouteCandidate(clearGhost = true) {
    this.plan = null;
    this.candidate = null;
    this.preview = null;
    this.validation = null;
    if (clearGhost) this.controller.viewportBackend?.clearGhost();
  }
}
