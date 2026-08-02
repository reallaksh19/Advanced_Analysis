/** Certified Topology Edit controller with display-only presentation controls. */
import { WorkspaceState } from './workspace-state.js';
import { TopologyStore } from './topology-store.js';
import { SupportRestraintStore } from './support-restraint-store.js';
import { EVENT_TOPICS, APPLICATION_EVENTS } from './event-topics.js';
import { TopologyEditViewportBackend } from './topology-edit/topology-edit-viewport-backend.js';
import { buildCanonicalTopologyFromWorkspaceDataset } from './topology-edit/topology-edit-source-adapter.js';
import { finalizeCanonicalTopology } from './topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from './topology-edit/topology-edit-certified-session.js';
import { checkCanonicalTopology } from './topology-edit/topology-edit-checker.js';
import {
  TOPOLOGY_EDIT_COMMAND_ACTIONS,
  canRunTopologyEditAction,
  createTopologyEditCommandIntent,
  createTopologyEditSelection,
  topologyEditSelectionDescription,
  updateTopologyEditSelection,
} from './topology-edit/topology-edit-command-ui.js';
import {
  buildTopologyEditRenderPacket,
  topologyEditEntityIdsForObject,
} from './topology-edit/topology-edit-render-packet.js';
import {
  createTopologyEditPresentationBasis,
  createTopologyEditPresentationState,
  reduceTopologyEditPresentationState,
  topologyEditPresentationActions,
} from './viewport-presentation/topology-edit-presentation-contract.js';
import { TopologyEditPresentationRuntime } from './viewport-presentation/topology-edit-presentation-runtime.js';
import { TopologyEditPresentationToolbar } from './viewport-presentation/topology-edit-presentation-toolbar.js';

const PRESENTATION_ACTIONS = topologyEditPresentationActions();

export class TopologyEdit3DViewController {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.viewportBackend = null;
    this.presentationRuntime = null;
    this.presentationToolbar = null;
    this.presentationState = null;
    this.hostElement = null;
    this.canvasMount = null;
    this.presentationMount = null;
    this.statusElement = null;
    this.checkerElement = null;
    this.session = null;
    this.selection = createTopologyEditSelection();
    this.issues = [];
    this.unsubscribers = [];
    this.clickHandler = (event) => this.handleHostClick(event);
    this.pointerHandler = (event) => this.handleCanvasPointer(event);
  }

  async activate() {
    if (this.hostElement) return;
    this.hostElement = globalThis.document?.querySelector('[data-role="topology-edit-render-host"]');
    if (!this.hostElement) throw new Error('TopologyEdit3DViewController: render host is missing.');
    this.eventBus.publish(EVENT_TOPICS.TOPOLOGY_EDIT_3D_MODE_CHANGED, { active: true });
    this.buildShell();
    this.initializePresentation();
    this.viewportBackend = new TopologyEditViewportBackend();
    this.viewportBackend.mount(this.canvasMount);
    this.presentationRuntime = new TopologyEditPresentationRuntime(this.viewportBackend);
    this.presentationRuntime.apply(this.presentationState);
    this.unsubscribers = [
      this.eventBus.subscribe(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, () => this.refreshFromWorkspace()),
      this.eventBus.subscribe(APPLICATION_EVENTS.CHANGED, ({ state }) => {
        if (state?.activeViewId !== 'LOAD_CALC') this.deactivate();
      }),
    ];
    this.canvasMount.addEventListener('pointerdown', this.pointerHandler);
    this.refreshFromWorkspace();
  }

  deactivate() {
    if (!this.hostElement) return;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.canvasMount?.removeEventListener('pointerdown', this.pointerHandler);
    this.hostElement.removeEventListener('click', this.clickHandler);
    this.presentationToolbar?.destroy();
    this.presentationRuntime?.destroy();
    this.viewportBackend?.destroy();
    this.viewportBackend = null;
    this.presentationToolbar = null;
    this.presentationRuntime = null;
    this.presentationState = null;
    this.hostElement.replaceChildren();
    this.hostElement = null;
    this.canvasMount = null;
    this.presentationMount = null;
    this.statusElement = null;
    this.checkerElement = null;
    this.session = null;
    this.selection = createTopologyEditSelection();
    this.eventBus.publish(EVENT_TOPICS.TOPOLOGY_EDIT_3D_MODE_CHANGED, { active: false });
  }

  renderPane(pane) {
    if (!pane) return;
    pane.innerHTML = '<p class="panel-empty">The certified 3D topology editor is active in the shared viewport.</p>';
  }

  buildShell() {
    const commandButtons = TOPOLOGY_EDIT_COMMAND_ACTIONS.map((action) => (
      `<button type="button" data-command-action="${action.id}" title="${action.title}" disabled>${action.label}</button>`
    )).join('');
    this.hostElement.innerHTML = `
      <header class="topology-edit-3d-toolbar">
        <div role="toolbar" aria-label="Certified topology edit commands" data-role="topology-edit-tools">
          ${commandButtons}
          <button type="button" data-action="undo" disabled>Undo</button>
          <button type="button" data-action="redo" disabled>Redo</button>
        </div>
        <div data-role="topology-edit-presentation-toolbar"></div>
        <output data-role="topology-edit-status" aria-live="polite">Loading topology…</output>
        <div class="topology-edit-3d-toolbar__actions">
          <button type="button" disabled title="Deferred to Wave 3; no uncertified autofix path is enabled.">Autofix (Wave 3)</button>
          <button type="button" disabled title="Deferred to Wave 4; WorkspaceState remains unchanged in Wave 1.">Commit (Wave 4)</button>
        </div>
      </header>
      <div data-role="topology-edit-checker" class="topology-edit-3d-checker" aria-live="polite"></div>
      <div data-role="topology-edit-canvas-mount" class="topology-edit-3d-canvas"></div>`;
    this.canvasMount = this.hostElement.querySelector('[data-role="topology-edit-canvas-mount"]');
    this.presentationMount = this.hostElement.querySelector('[data-role="topology-edit-presentation-toolbar"]');
    this.statusElement = this.hostElement.querySelector('[data-role="topology-edit-status"]');
    this.checkerElement = this.hostElement.querySelector('[data-role="topology-edit-checker"]');
    this.hostElement.addEventListener('click', this.clickHandler);
  }

  initializePresentation() {
    this.presentationState = createTopologyEditPresentationState({
      basis: createTopologyEditPresentationBasis(),
    });
    this.presentationToolbar = new TopologyEditPresentationToolbar({
      onAction: (action) => this.applyPresentationAction(action),
      getSelectedCanonicalIds: () => this.selectedCanonicalIds(),
    });
    this.presentationToolbar.mount(this.presentationMount, this.presentationState);
  }

  applyPresentationAction(action) {
    this.presentationState = reduceTopologyEditPresentationState(this.presentationState, action);
    this.presentationToolbar?.update(this.presentationState);
    this.presentationRuntime?.apply(this.presentationState);
  }

  updatePresentationBasis(canonical) {
    const basis = createTopologyEditPresentationBasis({
      sourceHash: canonical.sourceHash,
      baseCanonicalHash: this.session?.baseCanonicalTopology?.canonicalTopologyHash ?? null,
      draftCanonicalHash: canonical.canonicalTopologyHash,
      visualModelHash: null,
      scopeHash: null,
    });
    this.applyPresentationAction({ type: PRESENTATION_ACTIONS.REBASE, basis });
  }

  reconcilePresentationVisibility(canonical) {
    const canonicalIds = [
      ...(canonical.nodes ?? []).map((node) => node.id),
      ...(canonical.edges ?? []).map((edge) => edge.id),
    ];
    this.applyPresentationAction({
      type: PRESENTATION_ACTIONS.RECONCILE_IDS,
      canonicalIds,
    });
  }

  selectedCanonicalIds() {
    return [
      ...(this.selection.nodeIds ?? []),
      ...(this.selection.edgeId ? [this.selection.edgeId] : []),
    ];
  }

  handleHostClick(event) {
    const commandButton = event.target.closest('[data-command-action]');
    if (commandButton) return this.runCommandAction(commandButton.dataset.commandAction);
    if (event.target.closest('[data-action="undo"]')) return this.undo();
    if (event.target.closest('[data-action="redo"]')) return this.redo();
  }

  handleCanvasPointer(event) {
    const pick = this.viewportBackend?.pickAt(event.clientX, event.clientY);
    if (!pick?.objectId || !this.session) return;
    this.selection = updateTopologyEditSelection(this.selection, pick.objectId, event.shiftKey);
    const entityIds = topologyEditEntityIdsForObject(this.session.currentTopology(), pick.objectId);
    if (entityIds.length) {
      this.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, {
        entityId: entityIds[0],
        source: 'topology-edit-3d',
      });
    }
    this.presentationToolbar?.update(this.presentationState);
    this.setStatus(topologyEditSelectionDescription(this.selection));
    this.updateActionButtons();
  }

  refreshFromWorkspace() {
    const dataset = WorkspaceState.getSnapshot()?.dataset;
    const graph = TopologyStore.getGraph();
    if (!dataset) return this.setStatus('No dataset loaded.');
    if (!graph) return this.setStatus('Topology graph not available yet.');
    try {
      const canonical = this.buildWorkspaceCanonical(dataset, graph);
      const disposition = this.reconcileSession(canonical);
      this.refreshView(this.session.currentTopology());
      this.setRefreshStatus(disposition);
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  buildWorkspaceCanonical(dataset, graph) {
    const attachmentModel = SupportRestraintStore.getAttachmentModel();
    const restraintModel = SupportRestraintStore.getRestraintModel();
    const topology = buildCanonicalTopologyFromWorkspaceDataset(
      dataset,
      graph,
      attachmentModel,
      restraintModel,
    );
    return finalizeCanonicalTopology(topology);
  }

  reconcileSession(canonical) {
    if (!this.session) {
      this.session = new TopologyEditCertifiedSession(canonical);
      return 'CREATED';
    }
    return this.session.reconcileBase(canonical);
  }

  setRefreshStatus(disposition) {
    const topology = this.session.currentTopology();
    if (disposition === 'STALE') {
      this.setStatus(`Editing blocked: ${this.session.staleReason}`);
      return;
    }
    this.setStatus(
      `${topology.nodes.length} nodes, ${topology.edges.length} edges, ${topology.supports.length} supports; `
      + `${this.session.journal.activeCommandIds.length} accepted command(s).`,
    );
  }

  runCommandAction(actionId) {
    if (!this.session) return;
    try {
      const intent = createTopologyEditCommandIntent(
        actionId,
        this.selection,
        this.session.currentTopology(),
      );
      const transition = this.session.execute(intent.commandType, intent.payload);
      if (transition.disposition !== 'ACCEPTED') {
        return this.setStatus(`Command rejected: ${transition.reason || 'candidate did not certify'}.`);
      }
      this.selection = createTopologyEditSelection();
      this.refreshView(this.session.currentTopology());
      this.setStatus(`${intent.commandType} accepted at session version ${this.session.journal.sessionVersion}.`);
    } catch (error) {
      this.setStatus(`Command failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  undo() {
    if (!this.session?.canUndo()) return;
    try {
      this.session.undo();
      this.selection = createTopologyEditSelection();
      this.refreshView(this.session.currentTopology());
      this.setStatus(`Undo accepted; ${this.session.journal.activeCommandIds.length} command(s) active.`);
    } catch (error) {
      this.setStatus(`Undo failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  redo() {
    if (!this.session?.canRedo()) return;
    try {
      this.session.redo();
      this.selection = createTopologyEditSelection();
      this.refreshView(this.session.currentTopology());
      this.setStatus(`Redo accepted; ${this.session.journal.activeCommandIds.length} command(s) active.`);
    } catch (error) {
      this.setStatus(`Redo failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  refreshView(canonical) {
    this.updatePresentationBasis(canonical);
    this.reconcilePresentationVisibility(canonical);
    this.viewportBackend?.renderSession(buildTopologyEditRenderPacket(
      this.session.baseCanonicalTopology,
      canonical,
    ));
    this.presentationRuntime?.apply(this.presentationState);
    this.issues = checkCanonicalTopology(canonical);
    this.renderCheckerPanel();
    this.updateActionButtons();
  }

  renderCheckerPanel() {
    if (!this.checkerElement) return;
    if (!this.issues.length) {
      this.checkerElement.textContent = 'No topology issues detected.';
      return;
    }
    const rows = this.issues.slice(0, 20).map((issue) => (
      `<li data-issue-kind="${issue.kind}">${issue.kind}: ${issue.message}</li>`
    )).join('');
    this.checkerElement.innerHTML = `<strong>${this.issues.length} topology issue(s)</strong><ul>${rows}</ul>`;
  }

  updateActionButtons() {
    const blocked = !this.session || Boolean(this.session.staleReason);
    this.hostElement?.querySelectorAll('[data-command-action]').forEach((button) => {
      button.disabled = blocked || !canRunTopologyEditAction(button.dataset.commandAction, this.selection);
    });
    const undoButton = this.hostElement?.querySelector('[data-action="undo"]');
    const redoButton = this.hostElement?.querySelector('[data-action="redo"]');
    if (undoButton) undoButton.disabled = blocked || !this.session.canUndo();
    if (redoButton) redoButton.disabled = blocked || !this.session.canRedo();
  }

  setStatus(message) {
    if (this.statusElement) this.statusElement.textContent = message;
  }
}
