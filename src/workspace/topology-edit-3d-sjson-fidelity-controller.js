import * as THREE from 'three';
import {
  TopologyEdit3DViewController as ProfessionalController,
} from './topology-edit-3d-professional-controller.js';
import { SupportRestraintStore } from './support-restraint-store.js';
import { semanticHash } from '../core/shared-piping-model/index.js';
import {
  engineeringDirectionToRender,
  renderDirectionToEngineering,
} from './topology-edit/topology-edit-coordinate-transform.js';
import {
  distinctExactSupportOriginCount,
  enrichCanonicalSupportsWithExactOrigins,
  supportTopologyForExactOrigins,
  visualPrimitiveKindCounts,
} from './topology-edit/topology-edit-sjson-visual-authority.js';
import { deriveSjsonCompleteVisualGeometry } from './topology-edit/topology-edit-sjson-parent-branch-diameter.js';
import {
  applySjsonParentBranchDiametersToSupportTopology,
} from './topology-edit/topology-edit-sjson-support-parent-branch-diameter.js';
import {
  deriveSjsonTopoValidatorSupportProjection,
} from './topology-edit/topology-edit-sjson-restraint-projection.js';
import {
  fitPerspectiveCameraToRenderBounds,
} from './topology-edit/topology-edit-sjson-benchmark-camera.js';
import {
  TOPOLOGY_EDIT_SUPPORT_RENDER_STYLES,
} from './topology-edit/topology-edit-support-viewport-backend.js';
import {
  adaptSjsonVisualToEditDraftProjection,
} from './topology-edit/topology-edit-sjson-edit-draft-projection.js';
import {
  TopologyEditSjsonEditDraftViewportBackend,
} from './topology-edit/topology-edit-sjson-edit-draft-viewport-backend.js';

const BENCHMARK_SOURCE_HASH = 'fnv1a64:0fa77fc2c202d8ae';
const TOPO_VALIDATOR_ENGINEERING_CAMERA_DIRECTION = Object.freeze({ x: 1, y: 1, z: 0.8 });
const TOPO_VALIDATOR_COMPACT_MARKER_RADIUS_RATIO = 0.18;
const TOPO_VALIDATOR_COMPACT_RENDER_AUTHORITY =
  'TOPO_VALIDATOR_SUPPORT_MARKER_AND_DIRECTION_GEOMETRY';

export class TopologyEdit3DViewController extends ProfessionalController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.sjsonVisualByRole = new Map();
    this.sjsonBenchmarkView = null;
  }

  createViewportBackend() {
    return new TopologyEditSjsonEditDraftViewportBackend();
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
    const complete = deriveSjsonCompleteVisualGeometry({
      canonicalTopology: canonical,
      dataset: this.workspaceDataset,
      modelRole,
    });
    const result = adaptSjsonVisualToEditDraftProjection({
      visualResult: complete,
      dataset: this.workspaceDataset,
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

    const draftVisual = this.sjsonVisualByRole.get('DRAFT');
    const exactSupportTopology = supportTopologyForExactOrigins(canonical);
    const supportTopology = applySjsonParentBranchDiametersToSupportTopology(
      exactSupportTopology,
      this.workspaceDataset,
      draftVisual?.parentBranchDiameterIndex,
    );
    const markerSizeMm = Number(backend.navigationConfiguration?.supportMarkerSize);
    if (!Number.isFinite(markerSizeMm) || markerSizeMm <= 0) {
      throw new Error('TOPOLOGY_EDIT_SUPPORT_MARKER_POLICY_MISSING: Approved supportMarkerSize is required.');
    }
    const supportAuthority = deriveSjsonTopoValidatorSupportProjection({
      canonicalTopology: supportTopology,
      dataset: this.workspaceDataset,
      verticalAxis: 'Z',
      markerSizeMm,
    });
    const overlays = supportAuthority.overlays;
    const supportProjection = Object.freeze({
      ...supportAuthority.projection,
      renderStyle: TOPOLOGY_EDIT_SUPPORT_RENDER_STYLES.TOPO_VALIDATOR_COMPACT,
      renderAuthority: TOPO_VALIDATOR_COMPACT_RENDER_AUTHORITY,
      compactMarkerRadiusMm: Math.max(
        markerSizeMm * TOPO_VALIDATOR_COMPACT_MARKER_RADIUS_RATIO,
        1,
      ),
    });

    backend.clearGroup(supportGroup);
    backend.renderProjection(supportGroup, supportProjection, 0x22d3ee, 1, markerSizeMm);
    backend.engineeringRoot?.updateMatrixWorld(true);
    this.sjsonBenchmarkView = canonical.sourceHash === BENCHMARK_SOURCE_HASH
      ? applyTopoValidatorBenchmarkFit(backend)
      : null;
    backend.invalidate?.('sjson-topo-validator-edit-draft-restraint-projection');

    this.visualDiagnostics = [
      ...(draftVisual?.model?.diagnostics || []),
      ...overlays.flatMap((row) => row.diagnostics || []),
      ...overlays.flatMap((row) => (row.restraints || []).flatMap((restraint) => restraint.diagnostics || [])),
    ];
    this.visualModelHash = semanticHash({
      draftVisualGeometryHash: draftVisual?.model?.visualGeometryHash || '',
      editDraftMetrics: draftVisual?.editDraftMetrics || null,
      supportProjection,
      supportRestraintAuthorityHash: supportAuthority.authorityHash,
      supportRestraintMetrics: supportAuthority.metrics,
      supportVisualDiameterIndexHash: supportTopology.supportVisualDiameterIndexHash || '',
      supportVisualDiameterAdaptations: supportTopology.supportVisualDiameterAdaptations || [],
      benchmarkView: this.sjsonBenchmarkView,
    });
    this.updatePresentationBasis(canonical);
    this.presentationRuntime?.apply(this.presentationState);
    this.renderCheckerPanel();
    this.publishSjsonFidelityEvidence(
      canonical,
      supportProjection,
      draftVisual,
      supportTopology,
      supportAuthority,
    );
  }

  publishSjsonFidelityEvidence(canonical, supportProjection, visualResult, supportTopology, supportAuthority) {
    const host = this.canvasMount;
    if (!host) return;
    const visualModel = visualResult?.model;
    const editDraftMetrics = visualResult?.editDraftMetrics;
    const counts = visualPrimitiveKindCounts(visualModel);
    const reducerCount = (counts.CONICAL_REDUCER || 0) + (counts.ECCENTRIC_REDUCER || 0);
    const diagnostics = visualModel?.diagnostics || [];
    host.dataset.topologyEditPipePrimitiveCount = String(counts.PIPE_CYLINDER || 0);
    host.dataset.topologyEditElbowPrimitiveCount = String(counts.ELBOW_ARC || 0);
    host.dataset.topologyEditReducerPrimitiveCount = String(reducerCount);
    host.dataset.topologyEditTeePrimitiveCount = String(counts.TEE_JUNCTION || 0);
    host.dataset.topologyEditOletPrimitiveCount = String(counts.OLET_BRANCH || 0);
    host.dataset.topologyEditDiagnosticPrimitiveCount = String(counts.DIAGNOSTIC_CENTERLINE || 0);
    host.dataset.topologyEditExactSupportOriginCount = String(distinctExactSupportOriginCount(canonical));
    host.dataset.topologyEditDistinctSupportOriginCount = String(distinctProjectionOrigins(supportProjection));
    host.dataset.topologyEditRawSupportCount = String(supportAuthority?.metrics?.rawSupportCount || 0);
    host.dataset.topologyEditProjectedSourceSupportCount = String(
      supportAuthority?.metrics?.projectedSourceSupportCount || 0,
    );
    host.dataset.topologyEditDeferredSourceSupportCount = String(
      supportAuthority?.metrics?.deferredSourceSupportCount || 0,
    );
    host.dataset.topologyEditSupportAnchorCount = String(
      supportAuthority?.metrics?.supportAnchorCount || 0,
    );
    host.dataset.topologyEditNativeRestraintRecordCount = String(
      supportAuthority?.metrics?.nativeRestraintRecordCount || 0,
    );
    host.dataset.topologyEditCollapsedSourceSupportCount = String(
      supportAuthority?.metrics?.collapsedSourceSupportCount || 0,
    );
    host.dataset.topologyEditHierarchySupportMergeCount = String(
      supportAuthority?.metrics?.hierarchyMergeCount || 0,
    );
    host.dataset.topologyEditPositionSupportMergeCount = String(
      supportAuthority?.metrics?.positionMergeCount || 0,
    );
    host.dataset.topologyEditProjectedRestraintDirectionCount = String(
      supportAuthority?.metrics?.projectedRestraintDirectionCount || 0,
    );
    host.dataset.topologyEditSupportRestraintAuthority = supportAuthority?.authority || '';
    host.dataset.topologyEditSupportRestraintGroupingAuthority = supportAuthority?.groupingAuthority || '';
    host.dataset.topologyEditSupportRestraintResolutionAuthority = supportAuthority?.restraintAuthority || '';
    host.dataset.topologyEditSupportRestraintAuthorityHash = supportAuthority?.authorityHash || '';
    host.dataset.topologyEditSupportRenderStyle = supportProjection?.renderStyle || '';
    host.dataset.topologyEditSupportRenderAuthority = supportProjection?.renderAuthority || '';
    host.dataset.topologyEditCompactSupportMarkerRadiusMm = String(
      supportProjection?.compactMarkerRadiusMm || 0,
    );
    host.dataset.topologyEditEditDraftRenderAuthority = editDraftMetrics?.authority || '';
    host.dataset.topologyEditEditDraftElbowAuthority = editDraftMetrics?.elbowCurveAuthority || '';
    host.dataset.topologyEditEditDraftCompactSegmentCount = String(
      editDraftMetrics?.compactSegmentCount || 0,
    );
    host.dataset.topologyEditEditDraftSourceTangentElbowCount = String(
      editDraftMetrics?.sourceTangentElbowCount || 0,
    );
    host.dataset.topologyEditEditDraftMaxStartTangentError = String(
      editDraftMetrics?.maxStartTangentError ?? '',
    );
    host.dataset.topologyEditEditDraftMaxEndTangentError = String(
      editDraftMetrics?.maxEndTangentError ?? '',
    );
    host.dataset.topologyEditEditDraftFirstElbow = JSON.stringify(
      editDraftMetrics?.firstElbow || null,
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
    host.dataset.topologyEditSupportParentBranchDiameterCount = String(
      supportTopology?.supportVisualDiameterAdaptations?.length || 0,
    );
    host.dataset.topologyEditBenchmarkCameraAuthority = this.sjsonBenchmarkView?.authority || '';
    host.dataset.topologyEditBenchmarkCameraFitAlgorithm = this.sjsonBenchmarkView?.fitAlgorithm || '';
    host.dataset.topologyEditBenchmarkCameraEngineeringDirection = JSON.stringify(
      this.sjsonBenchmarkView?.engineeringDirection || null,
    );
    host.dataset.topologyEditBenchmarkCameraRenderDirection = JSON.stringify(
      this.sjsonBenchmarkView?.renderDirection || null,
    );
    host.dataset.topologyEditBenchmarkBounds = JSON.stringify(
      this.sjsonBenchmarkView?.renderBounds || null,
    );
    host.dataset.topologyEditBenchmarkScreenBounds = JSON.stringify(
      this.sjsonBenchmarkView?.screenBoundsNdc || null,
    );
    host.dataset.topologyEditVisualModelHash = this.visualModelHash || '';
    host.dataset.topologyEditSupportProjectionHash = semanticHash(supportProjection);
    host.dataset.topologyEditJournalHash = this.session?.journal?.journalHash || '';
  }

  deactivate() {
    this.sjsonVisualByRole.clear();
    this.sjsonBenchmarkView = null;
    super.deactivate();
  }
}

function applyTopoValidatorBenchmarkFit(backend) {
  backend.engineeringRoot?.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(backend.engineeringRoot);
  if (!backend.camera || !backend.controls || bounds.isEmpty()) return null;
  const renderDirectionValue = engineeringDirectionToRender(
    TOPO_VALIDATOR_ENGINEERING_CAMERA_DIRECTION,
  );
  const fitMargin = Number(backend.navigationConfiguration?.cameraFitMargin);
  if (!Number.isFinite(fitMargin) || fitMargin < 1) {
    throw new Error('TOPOLOGY_EDIT_CAMERA_FIT_MARGIN_INVALID: Approved cameraFitMargin is required.');
  }
  const cameraFit = fitPerspectiveCameraToRenderBounds({
    camera: backend.camera,
    controls: backend.controls,
    bounds,
    direction: renderDirectionValue,
    fitMargin,
  });

  backend.lastBounds = bounds.clone();
  backend.sceneBoundsCache = bounds.clone();
  backend.initialCameraState = backend.captureCameraState?.() || backend.initialCameraState;

  const engineeringDirection = renderDirectionToEngineering(cameraFit.renderDirection);
  return Object.freeze({
    ...cameraFit,
    sourceHash: BENCHMARK_SOURCE_HASH,
    engineeringDirection,
  });
}

function distinctProjectionOrigins(projection) {
  return new Set(
    (projection?.glyphOverlays || [])
      .filter((overlay) => overlay.origin)
      .map((overlay) => [overlay.origin.x, overlay.origin.y, overlay.origin.z]
        .map((value) => Number(value).toFixed(6)).join('|')),
  ).size;
}
