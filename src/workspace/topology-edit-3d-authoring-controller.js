import {
  TopologyEdit3DViewController as ProfessionalController,
} from './topology-edit-3d-professional-controller.js';
import {
  applyTopologyEditAuthoredBendProjection,
} from './topology-edit/authoring/topology-edit-authored-bend-geometry.js';
import {
  TopologyEditAuthoringRuntime,
} from './viewport-productivity/topology-edit-authoring-runtime.js';

/** Production authoring layer; interaction state remains transient and topology authority stays journal-owned. */
export class TopologyEdit3DViewController extends ProfessionalController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.authoringElement = null;
    this.authoringRuntime = new TopologyEditAuthoringRuntime(this);
  }

  buildShell() {
    super.buildShell();
    const documentRef = this.hostElement?.ownerDocument;
    const sidecar = this.hostElement?.querySelector('[data-role="topology-edit-sidecar"]');
    if (!documentRef || !sidecar) {
      throw new Error('TopologyEditAuthoringController: clean-shell sidecar is unavailable.');
    }
    const details = documentRef.createElement('details');
    details.className = 'topology-edit-clean-shell__panel';
    details.dataset.panelKind = 'authoring';
    details.open = true;
    const summary = documentRef.createElement('summary');
    summary.textContent = 'Authoring HUD';
    const body = documentRef.createElement('div');
    body.className = 'topology-edit-clean-shell__panel-body';
    const section = documentRef.createElement('section');
    section.dataset.role = 'topology-edit-authoring';
    section.setAttribute('aria-label', '3D edit authoring properties');
    body.append(section);
    details.append(summary, body);
    sidecar.prepend(details);
    this.authoringElement = section;
    this.authoringRuntime.mount(section);
    // Non-authoritative mounted-instance reference used by browser qualification.
    // It does not serialize, own topology, or participate in journal history.
    this.hostElement.__topologyEditAuthoringController = this;
  }

  deactivate() {
    if (this.hostElement?.__topologyEditAuthoringController === this) {
      delete this.hostElement.__topologyEditAuthoringController;
    }
    this.authoringRuntime.destroy();
    this.authoringElement = null;
    super.deactivate();
  }

  deriveVisual(canonical, modelRole) {
    const result = super.deriveVisual(canonical, modelRole);
    return Object.freeze({
      ...result,
      projection: applyTopologyEditAuthoredBendProjection(
        result.projection,
        canonical,
      ),
    });
  }

  refreshView(canonical) {
    super.refreshView(canonical);
    this.exposeAuthoredRenderRoles();
    this.authoringRuntime.canonicalChanged(canonical);
  }

  exposeAuthoredRenderRoles() {
    const draftGroup = this.viewportBackend?.groups?.draftGroup;
    if (!draftGroup) return;
    let authoredPartCount = 0;
    draftGroup.traverse((object) => {
      const partRole = object.userData?.pickTarget?.partRole;
      if (!partRole) return;
      object.userData.partRole = partRole;
      if (String(partRole).startsWith('authored-')) authoredPartCount += 1;
    });
    if (this.hostElement) {
      this.hostElement.dataset.topologyEditAuthoredRenderPartCount = String(authoredPartCount);
    }
  }

  handleHostClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (this.authoringRuntime.handleAction(action)) return;
    return super.handleHostClick(event);
  }

  handleUnifiedSelectionChanged(payload) {
    super.handleUnifiedSelectionChanged(payload);
    this.authoringRuntime?.selectionChanged();
  }

  undo() {
    const receipt = this.authoringRuntime.transaction;
    if (receipt?.resultingCanonicalHash
      === this.session?.currentTopology()?.canonicalTopologyHash) {
      return this.authoringRuntime.undoOperation();
    }
    this.authoringRuntime.transaction = null;
    this.authoringRuntime.redoTransaction = null;
    return super.undo();
  }

  redo() {
    const receipt = this.authoringRuntime.redoTransaction;
    if (receipt?.priorCanonicalHash
      === this.session?.currentTopology()?.canonicalTopologyHash) {
      return this.authoringRuntime.redoOperation();
    }
    this.authoringRuntime.transaction = null;
    this.authoringRuntime.redoTransaction = null;
    return super.redo();
  }

  runCommandAction(actionId) {
    this.authoringRuntime.clear(false, true);
    return super.runCommandAction(actionId);
  }

  applyInteractionPreview() {
    this.authoringRuntime.clear(false, true);
    return super.applyInteractionPreview();
  }

  acceptAutofix() {
    this.authoringRuntime.clear(false, true);
    return super.acceptAutofix();
  }
}
