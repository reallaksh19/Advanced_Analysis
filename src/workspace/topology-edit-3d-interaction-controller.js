import {
  TopologyEdit3DViewController as ReviewResponseController,
} from './topology-edit-3d-review-response-controller.js';
import {
  assertCurrentTopologyEditInteractionPreview,
  createTopologyEditNudgeSessionPreview,
  createTopologyEditNumericSessionPreview,
  selectedTopologyEditNodeContext,
  verifyTopologyEditInteractionAcceptance,
} from './viewport-productivity/topology-edit-interaction-session.js';
import {
  renderTopologyEditInteractionPanel,
} from './viewport-productivity/topology-edit-interaction-panel.js';

export class TopologyEdit3DViewController extends ReviewResponseController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.interactionElement = null;
    this.interactionPreview = null;
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
    this.hostElement.tabIndex = this.hostElement.tabIndex >= 0
      ? this.hostElement.tabIndex
      : 0;
    this.hostElement.addEventListener('keydown', this.interactionKeyHandler);
    this.renderInteractionPanel();
    this.updateInteractionEvidence();
  }

  deactivate() {
    this.hostElement?.removeEventListener('keydown', this.interactionKeyHandler);
    this.clearInteractionState(false, true);
    this.interactionElement = null;
    super.deactivate();
  }

  handleHostClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'preview-professional-interaction') {
      this.previewNumericInteraction();
      return;
    }
    if (action === 'apply-professional-interaction') {
      this.applyInteractionPreview();
      return;
    }
    if (action === 'cancel-professional-interaction') {
      this.cancelInteractionPreview();
      return;
    }
    if (action === 'nudge-professional-interaction') {
      const button = event.target.closest('[data-axis][data-sign]');
      this.nudgeInteraction(button?.dataset.axis, Number(button?.dataset.sign));
      return;
    }
    return super.handleHostClick(event);
  }

  handleInteractionKey(event) {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape' && this.interactionPreview) {
      event.preventDefault();
      this.cancelInteractionPreview();
      return;
    }
    if (event.key === 'Enter' && this.interactionPreview && !isTextControl(event.target)) {
      event.preventDefault();
      this.applyInteractionPreview();
      return;
    }
    if (isTextControl(event.target)) return;
    const axis = String(event.key ?? '').toUpperCase();
    if (!['X', 'Y', 'Z'].includes(axis) || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    this.nudgeInteraction(axis, event.shiftKey ? -1 : 1);
  }

  previewNumericInteraction() {
    try {
      const topology = this.session?.currentTopology();
      const entryMode = this.control('interaction-entry-mode')?.value;
      const axis = this.control('interaction-axis')?.value ?? 'X';
      const preview = createTopologyEditNumericSessionPreview({
        topology,
        selection: this.selection,
        entryMode,
        values: {
          x: this.control('interaction-value-x')?.value,
          y: this.control('interaction-value-y')?.value,
          z: this.control('interaction-value-z')?.value,
        },
        magnitudeMm: this.control('interaction-magnitude')?.value,
        direction: axisDirection(axis),
        transformMode: entryMode === 'MAGNITUDE' ? `AXIS_${axis}` : 'FREE',
      });
      this.retainInteractionPreview(preview, 'Numeric interaction preview created');
    } catch (error) {
      this.rejectInteraction(error);
    }
  }

  nudgeInteraction(axis, directionSign) {
    try {
      const increment = this.control('interaction-nudge-increment')?.value
        ?? this.nudgeIncrementMm;
      const preview = createTopologyEditNudgeSessionPreview({
        topology: this.session?.currentTopology(),
        selection: this.selection,
        preview: this.interactionPreview,
        axis,
        directionSign,
        incrementMm: increment,
      });
      this.nudgeIncrementMm = Number(increment);
      this.retainInteractionPreview(
        preview,
        `${directionSign < 0 ? 'Negative' : 'Positive'} ${axis} nudge preview created`,
      );
    } catch (error) {
      this.rejectInteraction(error);
    }
  }

  retainInteractionPreview(preview, prefix) {
    this.interactionPreview = preview;
    this.interactionAcceptance = null;
    this.interactionError = null;
    this.renderInteractionPanel();
    this.updateInteractionEvidence();
    this.setStatus(
      `${prefix}: ${preview.previewHash.slice(0, 12)}; display-only and not journaled.`,
    );
  }

  applyInteractionPreview() {
    if (!this.interactionPreview || !this.session) return;
    const preview = this.interactionPreview;
    const priorVersion = this.session.journal.sessionVersion;
    try {
      assertCurrentTopologyEditInteractionPreview({
        preview,
        topology: this.session.currentTopology(),
        selection: this.selection,
      });
      const transition = this.session.execute('MOVE_NODE', preview.movePayload);
      if (transition.disposition !== 'ACCEPTED') {
        throw new Error(`Certified MOVE_NODE rejected: ${transition.reason || 'candidate validation failed'}.`);
      }
      const acceptance = verifyTopologyEditInteractionAcceptance({
        preview,
        transition,
        priorSessionVersion: priorVersion,
      });
      this.interactionPreview = null;
      this.interactionAcceptance = acceptance;
      this.interactionError = null;
      this.refreshView(this.session.currentTopology());
      this.autosaveAfterTransition?.(priorVersion);
      this.renderInteractionPanel();
      this.updateInteractionEvidence();
      this.setStatus(
        `MOVE_NODE accepted from exact preview ${acceptance.previewHash.slice(0, 12)} at session version ${acceptance.sessionVersion}.`,
      );
    } catch (error) {
      this.rejectInteraction(error);
    }
  }

  cancelInteractionPreview(announce = true) {
    const hadPreview = Boolean(this.interactionPreview);
    this.interactionPreview = null;
    this.interactionError = null;
    this.renderInteractionPanel();
    this.updateInteractionEvidence();
    if (hadPreview && announce) {
      this.setStatus('Professional interaction preview cancelled; no journal or workspace change occurred.');
    }
  }

  clearInteractionState(announce = false, clearAcceptance = false) {
    const hadPreview = Boolean(this.interactionPreview);
    this.interactionPreview = null;
    this.interactionError = null;
    if (clearAcceptance) this.interactionAcceptance = null;
    this.renderInteractionPanel();
    this.updateInteractionEvidence();
    if (announce && hadPreview) this.setStatus('Interaction preview cleared by review-state change.');
  }

  rejectInteraction(error) {
    this.interactionError = error instanceof Error ? error.message : String(error);
    this.renderInteractionPanel();
    this.updateInteractionEvidence();
    this.setStatus(`Professional interaction blocked: ${this.interactionError}`);
  }

  refreshFromWorkspace() {
    this.clearInteractionState(false, true);
    return super.refreshFromWorkspace();
  }
  applyCanonicalPick(pick, additive) {
    this.clearInteractionState(false, true);
    return super.applyCanonicalPick(pick, additive);
  }
  activateSearchResult(result, options = {}) {
    this.clearInteractionState(false, true);
    return super.activateSearchResult(result, options);
  }
  focusIssue(entry) {
    this.clearInteractionState(false, true);
    return super.focusIssue(entry);
  }
  clearInspectionSelection() {
    this.clearInteractionState(false, true);
    return super.clearInspectionSelection();
  }
  runCommandAction(actionId) {
    this.clearInteractionState(false, true);
    return super.runCommandAction(actionId);
  }
  undo() {
    this.clearInteractionState(false, true);
    return super.undo();
  }
  redo() {
    this.clearInteractionState(false, true);
    return super.redo();
  }
  acceptAutofix() {
    this.clearInteractionState(false, true);
    return super.acceptAutofix();
  }
  buildReviewDossier() {
    this.clearInteractionState(false, false);
    return super.buildReviewDossier();
  }
  reconcileImportedDossier(dossier, fileName) {
    this.clearInteractionState(false, false);
    return super.reconcileImportedDossier(dossier, fileName);
  }
  acceptReviewResponse(response, fileName) {
    this.clearInteractionState(false, false);
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
      preview: this.interactionPreview,
      acceptance: this.interactionAcceptance,
      error: this.interactionError,
      nudgeIncrementMm: this.nudgeIncrementMm,
    });
  }

  updateInteractionEvidence() {
    if (!this.hostElement) return;
    this.hostElement.dataset.topologyEditInteractionPreviewHash =
      this.interactionPreview?.previewHash ?? '';
    this.hostElement.dataset.topologyEditInteractionIntentHash =
      this.interactionPreview?.intentHash ?? '';
    this.hostElement.dataset.topologyEditInteractionBasisHash =
      this.interactionPreview?.basisHash ?? '';
    this.hostElement.dataset.topologyEditInteractionAcceptanceHash =
      this.interactionAcceptance?.acceptanceHash ?? '';
    this.hostElement.dataset.topologyEditInteractionCertificationHash =
      this.interactionAcceptance?.certificationHash ?? '';
    this.hostElement.dataset.topologyEditInteractionCandidateHash =
      this.interactionAcceptance?.candidateDraftHash ?? '';
  }

  control(role) {
    return this.interactionElement?.querySelector(`[data-role="${role}"]`) ?? null;
  }
}

function axisDirection(axisInput) {
  const axis = String(axisInput ?? '').trim().toUpperCase();
  if (!['X', 'Y', 'Z'].includes(axis)) throw new RangeError('Axis must be X, Y or Z.');
  return {
    x: axis === 'X' ? 1 : 0,
    y: axis === 'Y' ? 1 : 0,
    z: axis === 'Z' ? 1 : 0,
  };
}
function isTextControl(target) {
  const name = String(target?.tagName ?? '').toUpperCase();
  return target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(name);
}
