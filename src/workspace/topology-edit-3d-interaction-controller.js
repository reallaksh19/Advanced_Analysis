import { TopologyEdit3DViewController as ReviewResponseController } from './topology-edit-3d-review-response-controller.js';
import { TopologyEditInteractionRuntime } from './viewport-interaction/topology-edit-interaction-runtime.js';
import {
  projectTopologyEditInteractionEvidence, topologyEditInteractionAxisDirection,
  topologyEditInteractionIsTextControl, topologyEditInteractionPointsEqual,
} from './viewport-productivity/topology-edit-interaction-controller-helpers.js';
import {
  assertCurrentTopologyEditInteractionRuntime, selectedTopologyEditNodeContext,
  verifyTopologyEditInteractionAcceptance,
} from './viewport-productivity/topology-edit-interaction-session.js';
import { renderTopologyEditInteractionPanel } from './viewport-productivity/topology-edit-interaction-panel.js';

export class TopologyEdit3DViewController extends ReviewResponseController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.interactionElement = null;
    this.interactionRuntime = new TopologyEditInteractionRuntime();
    this.interactionAcceptance = null;
    this.interactionError = null;
    this.nudgeIncrementMm = 1;
    this.interactionKeyHandler = (event) => this.handleInteractionKey(event);
  }

  buildShell() {
    super.buildShell();
    const section = this.hostElement?.ownerDocument.createElement('section');
    if (!section || !this.checkerElement) {
      throw new Error('TopologyEditInteractionController: panel host is unavailable.');
    }
    section.dataset.role = 'topology-edit-professional-interaction';
    section.className = 'topology-edit-professional-interaction';
    section.setAttribute('aria-label', 'Professional node interaction');
    this.checkerElement.before(section);
    this.interactionElement = section;
    if (this.hostElement.tabIndex < 0) this.hostElement.tabIndex = 0;
    this.hostElement.addEventListener('keydown', this.interactionKeyHandler);
    this.syncInteractionRuntime();
    this.renderInteractionPanel();
    this.updateInteractionEvidence();
  }

  deactivate() {
    this.hostElement?.removeEventListener('keydown', this.interactionKeyHandler);
    this.interactionRuntime.clear();
    this.interactionAcceptance = null;
    this.interactionError = null;
    this.interactionElement = null;
    super.deactivate();
  }

  handleHostClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'preview-professional-interaction') return this.previewNumericInteraction();
    if (action === 'apply-professional-interaction') return this.applyInteractionPreview();
    if (action === 'cancel-professional-interaction') return this.cancelInteractionPreview();
    if (action === 'nudge-professional-interaction') {
      const button = event.target.closest('[data-axis][data-sign]');
      return this.nudgeInteraction(button?.dataset.axis, Number(button?.dataset.sign));
    }
    return super.handleHostClick(event);
  }

  handleInteractionKey(event) {
    if (event.defaultPrevented) return;
    const preview = this.interactionRuntime.snapshot().preview;
    if (event.key === 'Escape' && preview) {
      event.preventDefault();
      this.cancelInteractionPreview();
      return;
    }
    if (event.key === 'Enter' && preview
        && !topologyEditInteractionIsTextControl(event.target)) {
      event.preventDefault();
      this.applyInteractionPreview();
      return;
    }
    if (topologyEditInteractionIsTextControl(event.target)) return;
    const axis = String(event.key ?? '').toUpperCase();
    if (!['X', 'Y', 'Z'].includes(axis) || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    this.nudgeInteraction(axis, event.shiftKey ? -1 : 1);
  }

  previewNumericInteraction() {
    try {
      this.syncInteractionRuntime(true);
      const entryMode = this.control('interaction-entry-mode')?.value;
      const axis = this.control('interaction-axis')?.value ?? 'X';
      const state = this.interactionRuntime.previewNumeric({
        entryMode,
        values: {
          x: this.control('interaction-value-x')?.value,
          y: this.control('interaction-value-y')?.value,
          z: this.control('interaction-value-z')?.value,
        },
        magnitudeMm: this.control('interaction-magnitude')?.value,
        direction: topologyEditInteractionAxisDirection(axis),
        mode: entryMode === 'MAGNITUDE' ? `AXIS_${axis}` : 'FREE',
      });
      this.acceptRuntimeState(state, 'Numeric interaction preview created');
    } catch (error) {
      this.rejectInteraction(error);
    }
  }

  nudgeInteraction(axis, direction) {
    try {
      this.syncInteractionRuntime(true);
      const increment = this.control('interaction-nudge-increment')?.value
        ?? this.nudgeIncrementMm;
      const state = this.interactionRuntime.nudge({ axis, direction, incrementMm: increment });
      this.nudgeIncrementMm = Number(increment);
      this.acceptRuntimeState(
        state,
        `${direction < 0 ? 'Negative' : 'Positive'} ${axis} nudge preview created`,
      );
    } catch (error) {
      this.rejectInteraction(error);
    }
  }

  acceptRuntimeState(state, prefix) {
    this.interactionAcceptance = null;
    this.interactionError = null;
    this.renderInteractionPanel();
    this.updateInteractionEvidence();
    this.setStatus(
      `${prefix}: ${state.preview.previewHash.slice(0, 12)}; display-only and not journaled.`,
    );
  }

  applyInteractionPreview() {
    if (!this.session) return;
    try {
      const state = this.interactionRuntime.snapshot();
      assertCurrentTopologyEditInteractionRuntime({
        runtimeState: state,
        topology: this.session.currentTopology(),
        selection: this.selection,
      });
      const compiled = this.interactionRuntime.compileApply();
      const priorVersion = this.session.journal.sessionVersion;
      const transition = this.session.execute('MOVE_NODE', compiled.payload);
      if (transition.disposition !== 'ACCEPTED') {
        throw new Error(`Certified MOVE_NODE rejected: ${transition.reason || 'candidate validation failed'}.`);
      }
      this.interactionAcceptance = verifyTopologyEditInteractionAcceptance({
        preview: compiled.preview,
        payload: compiled.payload,
        transition,
        priorSessionVersion: priorVersion,
      });
      this.interactionError = null;
      this.interactionRuntime.cancel();
      this.refreshView(this.session.currentTopology());
      this.autosaveAfterTransition?.(priorVersion);
      this.setStatus(
        `MOVE_NODE accepted from exact preview ${compiled.preview.previewHash.slice(0, 12)} at session version ${transition.sessionVersion}.`,
      );
    } catch (error) {
      this.rejectInteraction(error);
    }
  }

  cancelInteractionPreview(announce = true) {
    const hadPreview = Boolean(this.interactionRuntime.snapshot().preview);
    this.interactionRuntime.cancel();
    this.interactionError = null;
    this.renderInteractionPanel();
    this.updateInteractionEvidence();
    if (hadPreview && announce) {
      this.setStatus('Professional interaction preview cancelled; no journal or workspace change occurred.');
    }
  }

  syncInteractionRuntime(required = false) {
    let context = null;
    try {
      context = selectedTopologyEditNodeContext(
        this.session?.currentTopology(),
        this.selection,
      );
    } catch (error) {
      this.interactionRuntime.clear();
      if (required) throw error;
      return null;
    }
    const state = this.interactionRuntime.snapshot();
    if (state.status !== 'READY'
        || state.nodeId !== context.nodeId
        || state.basisHash !== context.basisHash
        || !topologyEditInteractionPointsEqual(state.anchorPosition, context.anchorPosition)) {
      this.interactionRuntime.rebase({ ...context, mode: 'AXIS_X' });
    }
    return context;
  }

  invalidateInteraction(clearAcceptance = true) {
    this.interactionRuntime.clear();
    this.interactionError = null;
    if (clearAcceptance) this.interactionAcceptance = null;
    this.syncInteractionRuntime();
    this.renderInteractionPanel();
    this.updateInteractionEvidence();
  }

  rejectInteraction(error) {
    this.interactionError = error instanceof Error ? error.message : String(error);
    this.renderInteractionPanel();
    this.updateInteractionEvidence();
    this.setStatus(`Professional interaction blocked: ${this.interactionError}`);
  }

  refreshView(canonical) {
    super.refreshView(canonical);
    this.syncInteractionRuntime();
    this.renderInteractionPanel();
    this.updateInteractionEvidence();
  }
  refreshFromWorkspace() {
    this.interactionRuntime.clear();
    this.interactionAcceptance = null;
    return super.refreshFromWorkspace();
  }
  applyCanonicalPick(pick, additive) {
    const result = super.applyCanonicalPick(pick, additive);
    this.invalidateInteraction(true);
    return result;
  }
  activateSearchResult(result, options = {}) {
    const value = super.activateSearchResult(result, options);
    this.invalidateInteraction(true);
    return value;
  }
  focusIssue(entry) {
    const value = super.focusIssue(entry);
    this.invalidateInteraction(true);
    return value;
  }
  runCommandAction(actionId) {
    this.invalidateInteraction(true);
    return super.runCommandAction(actionId);
  }
  undo() {
    this.invalidateInteraction(true);
    return super.undo();
  }
  redo() {
    this.invalidateInteraction(true);
    return super.redo();
  }
  acceptAutofix() {
    this.invalidateInteraction(true);
    return super.acceptAutofix();
  }
  buildReviewDossier() {
    this.cancelInteractionPreview(false);
    return super.buildReviewDossier();
  }
  acceptReviewResponse(response, fileName) {
    this.cancelInteractionPreview(false);
    return super.acceptReviewResponse(response, fileName);
  }

  renderInteractionPanel() {
    if (!this.interactionElement) return;
    let context = null;
    try {
      context = selectedTopologyEditNodeContext(
        this.session?.currentTopology(),
        this.selection,
      );
    } catch {
      context = null;
    }
    renderTopologyEditInteractionPanel(this.interactionElement, {
      context,
      runtimeState: this.interactionRuntime.snapshot(),
      acceptance: this.interactionAcceptance,
      error: this.interactionError,
      nudgeIncrementMm: this.nudgeIncrementMm,
    });
  }

  updateInteractionEvidence() {
    projectTopologyEditInteractionEvidence(
      this.hostElement,
      this.interactionRuntime.snapshot(),
      this.interactionAcceptance,
    );
  }

  control(role) {
    return this.interactionElement?.querySelector(`[data-role="${role}"]`) ?? null;
  }
}
