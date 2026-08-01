/**
 * Mounts the ported Topology Edit Draft 3D canvas as the "3D" sub-tab of the
 * "Edit, Topo fix and Load Calc" tab. Owns the mount/destroy lifecycle of
 * TopologyEditViewportBackend (full viewport-stack height, via
 * WorkspaceShellController.setTopologyEdit3DActive), builds the canonical
 * topology draft from the live workspace dataset (topology-edit-source-adapter.js),
 * and commits accepted edits back through the fixed commit service.
 */
import { WorkspaceState } from './workspace-state.js';
import { TopologyStore } from './topology-store.js';
import { SupportRestraintStore } from './support-restraint-store.js';
import { EVENT_TOPICS, APPLICATION_EVENTS } from './event-topics.js';
import { TopologyEditViewportBackend } from './topology-edit/topology-edit-viewport-backend.js';
import { TopologyEditToolsController, EDIT_TOOLS } from './topology-edit/topology-edit-tools-controller.js';
import { buildCanonicalTopologyFromWorkspaceDataset, applyCanonicalTopologyToWorkspaceEntities } from './topology-edit/topology-edit-source-adapter.js';
import { commitDraftToWorkspace } from './topology-edit/topology-edit-commit-service.js';
import { checkCanonicalTopology } from './topology-edit/topology-edit-checker.js';
import { TopologyEditAutofixController } from './topology-edit/topology-edit-autofix-controller.js';
import {
  createTopologyEditPresentationBasis,
  createTopologyEditPresentationState,
  reduceTopologyEditPresentationState,
  topologyEditPresentationActions,
} from './viewport-presentation/topology-edit-presentation-contract.js';
import { TopologyEditPresentationRuntime } from './viewport-presentation/topology-edit-presentation-runtime.js';
import { TopologyEditPresentationToolbar } from './viewport-presentation/topology-edit-presentation-toolbar.js';
import { semanticHash } from '../core/shared-piping-model/index.js';

const PRESENTATION_ACTIONS = topologyEditPresentationActions();
let sessionSequence = 0;

export class TopologyEdit3DViewController {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.viewportBackend = null;
    this.toolsController = null;
    this.presentationRuntime = null;
    this.presentationToolbar = null;
    this.presentationState = null;
    this.hostElement = null;
    this.canvasMount = null;
    this.presentationMount = null;
    this.statusElement = null;
    this.baseCanonicalTopology = null;
    this.canonicalTopology = null;
    this.issues = [];
    this.selectedNodeId = null;
    this.editSessionId = null;
    this.unsubscribers = [];
    this.clickHandler = (event) => this.handleHostClick(event);
    this.pointerHandler = (event) => this.handleCanvasPointer(event);
  }

  async activate() {
    if (this.hostElement) return;
    this.hostElement = globalThis.document?.querySelector('[data-role="topology-edit-render-host"]');
    if (!this.hostElement) throw new Error('TopologyEdit3DViewController: render host is missing.');
    sessionSequence += 1;
    this.editSessionId = `session:${semanticHash({ startedAt: Date.now(), sequence: sessionSequence }).slice(0, 20)}`;
    this.eventBus.publish(EVENT_TOPICS.TOPOLOGY_EDIT_3D_MODE_CHANGED, { active: true });
    this.buildShell();
    this.initializePresentation();
    this.viewportBackend = new TopologyEditViewportBackend();
    this.viewportBackend.mount(this.canvasMount);
    this.presentationRuntime = new TopologyEditPresentationRuntime(this.viewportBackend);
    this.presentationRuntime.apply(this.presentationState);
    this.toolsController = new TopologyEditToolsController(EDIT_TOOLS.SELECT);
    this.unsubscribers = [
      this.eventBus.subscribe(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, () => this.refreshFromWorkspace()),
      this.eventBus.subscribe(APPLICATION_EVENTS.CHANGED, ({ state }) => { if (state?.activeViewId !== 'LOAD_CALC') this.deactivate(); }),
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
    this.toolsController = null;
    this.presentationToolbar = null;
    this.presentationRuntime = null;
    this.presentationState = null;
    this.hostElement.replaceChildren();
    this.hostElement = null;
    this.canvasMount = null;
    this.presentationMount = null;
    this.statusElement = null;
    this.baseCanonicalTopology = null;
    this.canonicalTopology = null;
    this.selectedNodeId = null;
    this.eventBus.publish(EVENT_TOPICS.TOPOLOGY_EDIT_3D_MODE_CHANGED, { active: false });
  }

  renderPane(pane) {
    if (!pane) return;
    pane.innerHTML = '<p class="panel-empty">The 3D topology editor is active in the shared viewport above, and shares the left tree, right properties panel, and bottom live table with the rest of the workspace.</p>';
  }

  buildShell() {
    this.hostElement.innerHTML = `
      <header class="topology-edit-3d-toolbar">
        <div role="tablist" aria-label="Topology edit tools" data-role="topology-edit-tools"></div>
        <div data-role="topology-edit-presentation-toolbar"></div>
        <output data-role="topology-edit-status" aria-live="polite">Loading topology…</output>
        <div class="topology-edit-3d-toolbar__actions">
          <button type="button" data-action="nudge-selected">Nudge selected +Z 100mm</button>
          <button type="button" data-action="run-autofix" disabled>Autofix</button>
          <button type="button" data-action="commit-draft" disabled>Commit</button>
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
      baseCanonicalHash: this.baseCanonicalTopology?.canonicalTopologyHash,
      draftCanonicalHash: draftTopologyHash(canonical),
      visualModelHash: null,
      scopeHash: null,
    });
    this.applyPresentationAction({ type: PRESENTATION_ACTIONS.REBASE, basis });
  }

  handleHostClick(event) {
    if (event.target.closest('[data-action="nudge-selected"]')) return this.nudgeSelectedNode();
    if (event.target.closest('[data-action="run-autofix"]')) return this.runAutofix();
    if (event.target.closest('[data-action="commit-draft"]')) return this.commitDraft();
  }

  handleCanvasPointer(event) {
    if (!this.viewportBackend) return;
    const pick = this.viewportBackend.pickAt(event.clientX, event.clientY);
    if (!pick || !pick.objectId) return;
    this.selectNode(pick.objectId);
  }

  selectNode(nodeId) {
    this.selectedNodeId = nodeId;
    const workspaceEntityIds = this.entityIdsForNode(nodeId);
    if (workspaceEntityIds.length) {
      this.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, { entityId: workspaceEntityIds[0], source: 'topology-edit-3d' });
    }
    this.setStatus(`Selected node ${nodeId}${workspaceEntityIds.length ? ` (${workspaceEntityIds.length} attached entities)` : ''}.`);
  }

  entityIdsForNode(nodeId) {
    if (!this.canonicalTopology) return [];
    const entityIds = new Set();
    this.canonicalTopology.edges.forEach((edge) => {
      if ((edge.fromNodeId === nodeId || edge.toNodeId === nodeId) && edge.componentKey) entityIds.add(edge.componentKey);
    });
    this.canonicalTopology.supports.forEach((support) => {
      if (support.nodeId === nodeId && support.entityId) entityIds.add(support.entityId);
    });
    return [...entityIds];
  }

  refreshFromWorkspace() {
    const snapshot = WorkspaceState.getSnapshot();
    const dataset = snapshot?.dataset;
    if (!dataset) { this.setStatus('No dataset loaded.'); return; }
    const graph = TopologyStore.getGraph();
    if (!graph) { this.setStatus('Topology graph not available yet.'); return; }
    const attachmentModel = SupportRestraintStore.getAttachmentModel();
    const restraintModel = SupportRestraintStore.getRestraintModel();
    try {
      const canonical = buildCanonicalTopologyFromWorkspaceDataset(dataset, graph, attachmentModel, restraintModel);
      this.canonicalTopology = canonical;
      if (!this.baseCanonicalTopology || this.baseCanonicalTopology.datasetVersion !== canonical.datasetVersion) {
        this.baseCanonicalTopology = canonical;
      }
      this.updatePresentationBasis(canonical);
      this.renderScene(canonical);
      this.runChecker();
      this.setStatus(`${canonical.nodes.length} nodes, ${canonical.edges.length} edges, ${canonical.supports.length} supports.`);
      this.updateActionButtons();
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  runChecker() {
    this.issues = this.canonicalTopology ? checkCanonicalTopology(this.canonicalTopology) : [];
    this.renderCheckerPanel();
    this.updateActionButtons();
  }

  renderCheckerPanel() {
    if (!this.checkerElement) return;
    if (!this.issues.length) { this.checkerElement.textContent = 'No topology issues detected.'; return; }
    const fixable = this.issues.filter((issue) => issue.suggestedAutofix).length;
    const rows = this.issues.slice(0, 20).map((issue) => `<li data-issue-kind="${issue.kind}">${issue.kind}: ${issue.message}</li>`).join('');
    this.checkerElement.innerHTML = `<strong>${this.issues.length} topology issue(s)</strong> (${fixable} auto-fixable) <ul>${rows}</ul>${this.issues.length > 20 ? `<span>…and ${this.issues.length - 20} more</span>` : ''}`;
  }

  updateActionButtons() {
    const commitButton = this.hostElement?.querySelector('[data-action="commit-draft"]');
    if (commitButton) commitButton.disabled = this.canonicalTopology === this.baseCanonicalTopology;
    const autofixButton = this.hostElement?.querySelector('[data-action="run-autofix"]');
    if (autofixButton) autofixButton.disabled = !this.issues.some((issue) => issue.suggestedAutofix);
  }

  runAutofix() {
    if (!this.canonicalTopology) return;
    const fixable = this.issues.filter((issue) => issue.suggestedAutofix);
    if (!fixable.length) { this.setStatus('No auto-fixable issues.'); return; }
    const result = TopologyEditAutofixController.applyAutofix(this.canonicalTopology, fixable);
    this.canonicalTopology = result.finalTopology;
    this.updatePresentationBasis(this.canonicalTopology);
    this.renderScene(this.canonicalTopology);
    this.runChecker();
    this.setStatus(`Autofix: ${result.applied.length} applied, ${result.rejected.length} rejected (draft, not committed).`);
    this.updateActionButtons();
  }

  renderScene(canonical) {
    if (!this.viewportBackend) return;
    const nodesById = new Map(canonical.nodes.map((node) => [node.id, node]));
    const elements = canonical.nodes.map((node) => ({ id: node.id, entityId: node.id, type: 'node', x: node.position.x, y: node.position.y, z: node.position.z }));
    const segments = canonical.edges.map((edge) => {
      const from = nodesById.get(edge.fromNodeId);
      const to = nodesById.get(edge.toNodeId);
      if (!from || !to) return null;
      return {
        id: edge.id,
        entityId: edge.componentKey || edge.id,
        type: edge.entityType || 'edge',
        start: from.position,
        end: to.position,
        radiusMm: Number.isFinite(edge.diameterMm) ? edge.diameterMm / 2 : null,
      };
    }).filter(Boolean);
    this.viewportBackend.renderSession({ source: { elements, segments }, draft: { elements, segments } });
    this.presentationRuntime?.apply(this.presentationState);
  }

  nudgeSelectedNode() {
    if (!this.selectedNodeId || !this.canonicalTopology) { this.setStatus('Select a node first (click it in the 3D view).'); return; }
    const nodes = this.canonicalTopology.nodes.map((node) => (
      node.id === this.selectedNodeId
        ? { ...node, position: { x: node.position.x, y: node.position.y, z: node.position.z + 100 } }
        : node
    ));
    this.canonicalTopology = { ...this.canonicalTopology, nodes };
    this.updatePresentationBasis(this.canonicalTopology);
    this.renderScene(this.canonicalTopology);
    this.runChecker();
    this.setStatus(`Node ${this.selectedNodeId} moved +Z 100mm (draft, not committed).`);
    this.updateActionButtons();
  }

  commitDraft() {
    if (!this.baseCanonicalTopology || !this.canonicalTopology || this.canonicalTopology === this.baseCanonicalTopology) return;
    const dataset = WorkspaceState.getSnapshot()?.dataset;
    if (!dataset) return;
    try {
      const updatedEntities = applyCanonicalTopologyToWorkspaceEntities(dataset, this.baseCanonicalTopology, this.canonicalTopology, this.editSessionId);
      const journalPackage = { schema: 'topology-edit-draft-journal/v1', editSessionId: this.editSessionId, baseCanonicalTopologyHash: this.baseCanonicalTopology.canonicalTopologyHash, editedCanonicalTopologyHash: semanticHash(this.canonicalTopology) };
      commitDraftToWorkspace(journalPackage, updatedEntities);
      this.setStatus('Committed.');
    } catch (error) {
      this.setStatus(`Commit failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  setStatus(message) {
    if (this.statusElement) this.statusElement.textContent = message;
  }
}

function draftTopologyHash(canonical) {
  return semanticHash({
    schema: canonical.schema,
    datasetId: canonical.datasetId,
    nodes: canonical.nodes,
    edges: canonical.edges,
    junctions: canonical.junctions,
    supports: canonical.supports,
  });
}
