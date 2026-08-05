import {
  TopologyEdit3DViewController as ProfessionalController,
} from './topology-edit-3d-professional-controller.js';
import { SupportRestraintStore } from './support-restraint-store.js';
import { semanticHash } from '../core/shared-piping-model/index.js';
import {
  deriveAllSupportRestraintGeometry,
  projectSupportGeometryToViewport,
} from './topology-edit/support-restraint-family.js';
import {
  distinctExactSupportOriginCount,
  enrichCanonicalSupportsWithExactOrigins,
  supportTopologyForExactOrigins,
  visualPrimitiveKindCounts,
} from './topology-edit/topology-edit-sjson-visual-authority.js';
import { deriveSjsonCompleteVisualGeometry } from './topology-edit/topology-edit-sjson-parent-branch-diameter.js';

/**
 * Production adapter for staged SJSON visual fidelity. Engineering topology,
 * command certification, journaling, Undo/Redo, and persistence remain owned
 * by the inherited professional controller and certified session.
 */
export class TopologyEdit3DViewController extends ProfessionalController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.sjsonVisualByRole = new Map();
  }

  buildWorkspaceCanonical(dataset, graph) {
    const canonical = super.buildWorkspaceCanonical(dataset, graph);
    return enrichCanonicalSupportsWithExactOrigins(
      canonical,
      dataset,
      SupportRestraintStore.getAttachmentModel(),
    );
  }

  deriveVisual(canonical, modelRole) {
    const result = deriveSjsonCompleteVisualGeometry({
      canonicalTopology: canonical,
      dataset: this.workspaceDataset,
      modelRole,
    });
    this.sjsonVisualByRole.set(String(modelRole || 'DRAFT').toUpperCase(), result);
    return result;
  }

  refreshView(canonical) {
    super.refreshView(canonical);
    this.applyExactSupportProjection(canonical);
  }

  applyExactSupportProjection(canonical) {
    const backend = this.viewportBackend;
    const supportGroup = backend?.groups?.supportGroup;
    if (!backend || !supportGroup) return;

    const supportTopology = supportTopologyForExactOrigins(canonical);
    const overlays = deriveAllSupportRestraintGeometry({
      canonicalTopology: supportTopology,
      verticalAxis: 'Z',
    });
    const markerSizeMm = Number(backend.navigationConfiguration?.supportMarkerSize);
    if (!Number.isFinite(markerSizeMm) || markerSizeMm <= 0) {
      throw new Error(
        'TOPOLOGY_EDIT_SUPPORT_MARKER_POLICY_MISSING: Approved supportMarkerSize is required.',
      );
    }
    const supportProjection = projectSupportGeometryToViewport(overlays, { markerSizeMm });

    backend.clearGroup(supportGroup);
    backend.renderProjection(supportGroup, supportProjection, 0x22d3ee, 1, markerSizeMm);
    backend.engineeringRoot?.updateMatrixWorld(true);
    backend.invalidate?.('sjson-exact-support-projection');

    const draftVisual = this.sjsonVisualByRole.get('DRAFT');
    this.visualDiagnostics = [
      ...(draftVisual?.model?.diagnostics || []),
      ...overlays.flatMap((row) => row.diagnostics || []),
      ...overlays.flatMap((row) => (
        row.restraints || []
      ).flatMap((restraint) => restraint.diagnostics || [])),
    ];
    this.visualModelHash = semanticHash({
      draftVisualGeometryHash: draftVisual?.model?.visualGeometryHash || '',
      supportProjection,
    });
    this.updatePresentationBasis(canonical);
    this.presentationRuntime?.apply(this.presentationState);
    this.renderCheckerPanel();
    this.publishSjsonFidelityEvidence(canonical, supportProjection, draftVisual?.model);
  }

  publishSjsonFidelityEvidence(canonical, supportProjection, visualModel) {
    const host = this.canvasMount;
    if (!host) return;
    const counts = visualPrimitiveKindCounts(visualModel);
    const reducerCount = (counts.CONICAL_REDUCER || 0) + (counts.ECCENTRIC_REDUCER || 0);
    const diagnostics = visualModel?.diagnostics || [];
    host.dataset.topologyEditPipePrimitiveCount = String(counts.PIPE_CYLINDER || 0);
    host.dataset.topologyEditElbowPrimitiveCount = String(counts.ELBOW_ARC || 0);
    host.dataset.topologyEditReducerPrimitiveCount = String(reducerCount);
    host.dataset.topologyEditTeePrimitiveCount = String(counts.TEE_JUNCTION || 0);
    host.dataset.topologyEditOletPrimitiveCount = String(counts.OLET_BRANCH || 0);
    host.dataset.topologyEditDiagnosticPrimitiveCount = String(
      counts.DIAGNOSTIC_CENTERLINE || 0,
    );
    host.dataset.topologyEditExactSupportOriginCount = String(
      distinctExactSupportOriginCount(canonical),
    );
    host.dataset.topologyEditDistinctSupportOriginCount = String(
      distinctProjectionOrigins(supportProjection),
    );
    host.dataset.topologyEditVisualProxyWarningCount = String(
      diagnostics.filter((row) => row.code === 'VISUAL_NOMINAL_BORE_PROXY_USED').length,
    );
    host.dataset.topologyEditParentBranchDiameterCount = String(
      diagnostics.filter((row) => row.code === 'VISUAL_PARENT_BRANCH_DIAMETER_USED').length,
    );
    host.dataset.topologyEditReferencedBranchDiameterCount = String(
      diagnostics.filter((row) => row.code === 'VISUAL_REFERENCED_BRANCH_DIAMETER_USED').length,
    );
    host.dataset.topologyEditVisualModelHash = this.visualModelHash || '';
    host.dataset.topologyEditSupportProjectionHash = semanticHash(supportProjection);
    host.dataset.topologyEditJournalHash = this.session?.journal?.journalHash || '';
  }

  deactivate() {
    this.sjsonVisualByRole.clear();
    super.deactivate();
  }
}

function distinctProjectionOrigins(projection) {
  return new Set(
    (projection?.glyphOverlays || [])
      .filter((overlay) => overlay.origin)
      .map((overlay) => [overlay.origin.x, overlay.origin.y, overlay.origin.z]
        .map((value) => Number(value).toFixed(6)).join('|')),
  ).size;
}
