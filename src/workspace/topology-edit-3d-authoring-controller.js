import {
  TopologyEdit3DViewController as ProfessionalController,
} from './topology-edit-3d-professional-controller.js';
import {
  applyTopologyEditAuthoredBendProjection,
  deriveTopologyEditAuthoredBendProjection,
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
    const reconcileSelection = this.authoringRuntime.reconcileSelection.bind(this.authoringRuntime);
    this.authoringRuntime.reconcileSelection = (...args) => {
      normalizeControllerNodeSelection(this);
      return reconcileSelection(...args);
    };
    const applyOperation = this.authoringRuntime.applyOperation.bind(this.authoringRuntime);
    this.authoringRuntime.applyOperation = async (...args) => {
      const result = await applyOperation(...args);
      normalizeControllerNodeSelection(this);
      this.authoringRuntime.selectionChanged();
      return result;
    };
    this.authoringRuntime.renderCandidateGhost = () => renderAuthoringCandidateGhost(
      this,
      this.authoringRuntime.candidate,
    );

    // Final subclasses such as the governed SJSON controller own their source
    // visual derivation. Decorate that exact downstream result instead of
    // introducing a second render packet or renderer authority.
    const downstreamDeriveVisual = this.deriveVisual;
    if (downstreamDeriveVisual !== TopologyEdit3DViewController.prototype.deriveVisual) {
      this.deriveVisual = (canonical, modelRole) => this.decorateAuthoringVisualResult(
        downstreamDeriveVisual.call(this, canonical, modelRole),
        canonical,
        modelRole,
      );
    }
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
    details.dataset.authoringContextual = 'true';
    details.open = false;
    const summary = documentRef.createElement('summary');
    summary.textContent = 'Authoring tools — Move · Stretch · Route + elbow';
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
    return this.decorateAuthoringVisualResult(
      super.deriveVisual(canonical, modelRole),
      canonical,
      modelRole,
    );
  }

  decorateAuthoringVisualResult(result, canonical, modelRole) {
    if (!result?.projection) {
      throw new Error('TopologyEditAuthoringController: governed visual projection is unavailable.');
    }
    // The governed SJSON packet carries both standard and compact segment
    // arrays. Apply the idempotent adapter every time so one pre-decorated
    // array cannot suppress authored bends in the renderer-owned compact list.
    const projection = applyTopologyEditAuthoredBendProjection(
      result.projection,
      canonical,
    );
    const decorated = projection === result.projection
      ? result
      : Object.freeze({ ...result, projection });
    const role = String(modelRole || 'DRAFT').toUpperCase();

    // Keep downstream role caches aligned with the exact packet returned to
    // the sole production renderer. This remains disposable presentation data.
    if (this.sjsonVisualByRole instanceof Map
      && this.sjsonVisualByRole.get(role) === result) {
      this.sjsonVisualByRole.set(role, decorated);
    }
    if (role === 'DRAFT' && this.hostElement) {
      this.hostElement.dataset.topologyEditAuthoredBendProjectionHash =
        projection.authoredBendProjectionHash ?? '';
      this.hostElement.dataset.topologyEditAuthoredBendArcCount = String(
        projection.authoredBendArcCount ?? 0,
      );
    }
    return decorated;
  }

  refreshView(canonical) {
    super.refreshView(canonical);
    this.exposeAuthoredRenderRoles();
    this.authoringRuntime.canonicalChanged(canonical);
  }

  exposeAuthoredRenderRoles() {
    const canonical = this.session?.currentTopology?.();
    const draftGroup = this.viewportBackend?.groups?.draftGroup;
    if (!canonical || !draftGroup) return;
    const authoredProjection = deriveTopologyEditAuthoredBendProjection(canonical);
    const authoredBendIds = new Set(authoredProjection.segments.map((segment) => (
      segment.pickTarget?.objectId
    )).filter(Boolean));
    let authoredPartCount = 0;
    draftGroup.traverse((object) => {
      const directTarget = object.userData?.pickTarget ?? null;
      const pickTable = Array.isArray(object.userData?.pickTable)
        ? object.userData.pickTable
        : [];
      const authoredTarget = [directTarget, ...pickTable].find((target) => (
        target?.partRole === 'authored-elbow-arc'
        || authoredBendIds.has(target?.objectId)
      ));
      const canonicalId = directTarget?.objectId
        ?? object.userData?.canonicalId
        ?? authoredTarget?.objectId
        ?? null;
      const partRole = directTarget?.partRole
        ?? authoredTarget?.partRole
        ?? (authoredBendIds.has(canonicalId) ? 'authored-elbow-arc' : null);
      if (!partRole) return;
      object.userData.partRole = partRole;
      if (String(partRole).startsWith('authored-')) authoredPartCount += 1;
    });
    if (this.hostElement) {
      this.hostElement.dataset.topologyEditAuthoredBendProjectionHash =
        authoredProjection.projectionHash;
      this.hostElement.dataset.topologyEditAuthoredBendArcCount = String(
        authoredProjection.segments.length,
      );
      this.hostElement.dataset.topologyEditAuthoredBendDiagnosticCount = String(
        authoredProjection.diagnostics.length,
      );
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
    normalizeControllerNodeSelection(this);
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

function renderAuthoringCandidateGhost(controller, candidate) {
  if (!candidate) return;
  const projection = controller.deriveVisual(
    candidate.canonicalTopology,
    'DRAFT',
  ).projection;
  const elements = Array.isArray(projection.compactElements)
    ? projection.compactElements
    : (projection.elements || []);
  const segments = Array.isArray(projection.compactSegments)
    ? projection.compactSegments
    : (projection.segments || []);
  const changed = new Set(candidate.changedCanonicalIds);
  const accepted = (row) => changed.has(
    row.pickTarget?.objectId ?? row.entityId ?? row.id,
  );
  controller.viewportBackend?.renderGhost({
    elements: elements.filter(accepted),
    segments: segments.filter(accepted),
  });
}

function normalizeControllerNodeSelection(controller) {
  const nodeIds = controller?.selection?.nodeIds;
  const normalized = typeof nodeIds === 'string'
    ? (nodeIds ? [nodeIds] : [])
    : nodeIds instanceof Set
      ? [...nodeIds]
      : Array.isArray(nodeIds)
        ? nodeIds
        : [];
  if (nodeIds === normalized) return;
  controller.selection = {
    ...controller.selection,
    nodeIds: normalized,
  };
}
