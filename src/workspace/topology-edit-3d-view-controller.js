/** Mounts the certified visual projection inside the topology-edit 3D tab. */
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
import { createDimensionAuthority } from './topology-edit/dimension-authority.js';
import { deriveAllSupportRestraintGeometry, projectSupportGeometryToViewport } from './topology-edit/support-restraint-family.js';
import { deriveTopologyVisualGeometry, projectVisualGeometryToViewport, visualPolicySummary } from './topology-edit/topology-edit-render-model.js';
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
const DIMENSION_AUTHORITY = createDimensionAuthority();
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
    this.workspaceDataset = null;
    this.visualModelHash = null;
    this.visualDiagnostics = [];
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
    this.workspaceDataset = null;
    this.visualModelHash = null;
    this.visualDiagnostics = [];
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
    this.presentationState = createTopologyEditPresentationState({ basis: createTopologyEditPresentationBasis() });
    this.presentationToolbar = new TopologyEditPresentationToolbar({ onAction: (action) => this.applyPresentationAction(action) });
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
      visualModelHash: this.visualModelHash,
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
    if (!pick?.objectId) return;
    if (pick.objectKind === 'node') return this.selectNode(pick.objectId);
    const entityId = pick.workspaceEntityIds?.[0];
    if (entityId) this.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, { entityId, source: 'topology-edit-3d' });
    this.setStatus(selectionMessage(pick));
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
    try {
      const attachmentModel = SupportRestraintStore.getAttachmentModel();
      const restraintModel = SupportRestraintStore.getRestraintModel();
      const canonical = buildCanonicalTopologyFromWorkspaceDataset(dataset, graph, attachmentModel, restraintModel);
      this.workspaceDataset = dataset;
      this.canonicalTopology = canonical;
      if (!this.baseCanonicalTopology || this.baseCanonicalTopology.datasetVersion !== canonical.datasetVersion) this.baseCanonicalTopology = canonical;
      this.renderScene(canonical);
      this.runChecker();
      this.setStatus(`${canonical.nodes.length} nodes, ${canonical.edges.length} edges, ${canonical.supports.length} supports, ${this.visualDiagnostics.length} visual diagnostic(s).`);
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
    const visualRows = this.visualDiagnostics.map((row) => ({ kind: row.code, message: row.message }));
    const issues = [...this.issues, ...visualRows];
    if (!issues.length) { this.checkerElement.textContent = 'No topology or visual-evidence issues detected.'; return; }
    const fixable = this.issues.filter((issue) => issue.suggestedAutofix).length;
    const rows = issues.slice(0, 20).map((issue) => `<li data-issue-kind="${issue.kind}">${issue.kind}: ${issue.message}</li>`).join('');
    this.checkerElement.innerHTML = `<strong>${issues.length} issue(s)</strong> (${fixable} auto-fixable) <ul>${rows}</ul>${issues.length > 20 ? `<span>…and ${issues.length - 20} more</span>` : ''}`;
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
    this.renderScene(this.canonicalTopology);
    this.runChecker();
    this.setStatus(`Autofix: ${result.applied.length} applied, ${result.rejected.length} rejected (draft, not committed).`);
    this.updateActionButtons();
  }

  renderScene(canonical) {
    if (!this.viewportBackend) return;
    const componentEvidence = buildComponentEvidence(this.workspaceDataset);
    const visualModel = deriveTopologyVisualGeometry({ canonicalTopology: canonical, componentEvidence, dimensionAuthority: DIMENSION_AUTHORITY });
    const projection = projectVisualGeometryToViewport(visualModel, canonical);
    const supportOverlays = deriveAllSupportRestraintGeometry({ canonicalTopology: canonical, verticalAxis: 'Z' });
    const supportProjection = projectSupportGeometryToViewport(supportOverlays);
    this.visualModelHash = visualModel.visualGeometryHash;
    this.visualDiagnostics = [...visualModel.diagnostics, ...supportOverlays.flatMap((row) => row.diagnostics || []), ...supportOverlays.flatMap((row) => row.restraints.flatMap((restraint) => restraint.diagnostics || []))];
    this.updatePresentationBasis(canonical);
    this.statusElement.title = visualPolicySummary();
    this.viewportBackend.renderSession({ source: projection, draft: projection, supports: supportProjection });
    this.presentationRuntime?.apply(this.presentationState);
  }

  nudgeSelectedNode() {
    if (!this.selectedNodeId || !this.canonicalTopology) { this.setStatus('Select a node first (click it in the 3D view).'); return; }
    const nodes = this.canonicalTopology.nodes.map((node) => (
      node.id === this.selectedNodeId ? { ...node, position: { x: node.position.x, y: node.position.y, z: node.position.z + 100 } } : node
    ));
    this.canonicalTopology = { ...this.canonicalTopology, nodes };
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

function buildComponentEvidence(dataset) {
  const evidence = {};
  for (const entity of dataset?.entities || []) {
    const attributes = { ...(entity.properties?.sourceAttributes || {}), ...(entity.properties?.attributes || {}), ...(entity.properties?.nativeParams || {}) };
    evidence[entity.entityId] = {
      workspaceEntityIds: [entity.entityId], sourcePath: entity.sourcePath,
      outsideDiameterMm: firstFinite(entity.outsideDiameterMm, attributes.outsideDiameterMm, attributes.OUTSIDE_DIAMETER),
      boreMm: firstFinite(entity.boreMm, attributes.boreMm, attributes.BORE),
      wallThicknessMm: firstFinite(entity.wallThicknessMm, attributes.wallThicknessMm, attributes.WALL_THICKNESS),
      centerlineRadiusMm: firstFinite(attributes.centerlineRadiusMm, attributes.CENTERLINE_RADIUS, attributes.BEND_RADIUS),
      center: finitePoint(entity.properties?.geometry?.center),
      reducerType: attributes.reducerType || attributes.REDUCER_TYPE,
      startOutsideDiameterMm: firstFinite(attributes.startOutsideDiameterMm, attributes.START_OUTSIDE_DIAMETER),
      endOutsideDiameterMm: firstFinite(attributes.endOutsideDiameterMm, attributes.END_OUTSIDE_DIAMETER),
      eccentricOffsetDirection: finitePoint(attributes.eccentricOffsetDirection),
      branchOutsideDiameterMm: firstFinite(attributes.branchOutsideDiameterMm, attributes.BRANCH_OUTSIDE_DIAMETER),
      hostEntityId: attributes.hostEntityId || attributes.HOST_ENTITY_ID,
      branchNodeId: attributes.branchNodeId || attributes.BRANCH_NODE_ID,
      runNodeIds: Array.isArray(attributes.runNodeIds) ? attributes.runNodeIds : undefined,
    };
  }
  return evidence;
}

function selectionMessage(pick) {
  if (pick.objectKind === 'restraint') return `Selected ${pick.restraintFamily || 'restraint'} ${pick.restraintId} on support ${pick.supportId}.`;
  if (pick.objectKind === 'support') return `Selected support ${pick.supportId || pick.objectId}.`;
  return `Selected ${pick.objectKind || 'component'} ${pick.objectId}.`;
}

function firstFinite(...values) { for (const value of values) { const number = Number(value); if (Number.isFinite(number)) return number; } return undefined; }
function finitePoint(value) { return value && [value.x, value.y, value.z].every((row) => Number.isFinite(Number(row))) ? { x: Number(value.x), y: Number(value.y), z: Number(value.z) } : undefined; }
function draftTopologyHash(canonical) { return semanticHash({ schema: canonical.schema, datasetId: canonical.datasetId, nodes: canonical.nodes, edges: canonical.edges, junctions: canonical.junctions, supports: canonical.supports }); }
