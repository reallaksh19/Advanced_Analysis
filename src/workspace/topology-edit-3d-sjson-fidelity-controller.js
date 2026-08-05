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

const BENCHMARK_SOURCE_HASH = 'fnv1a64:0fa77fc2c202d8ae';
const TOPO_VALIDATOR_ENGINEERING_CAMERA_DIRECTION = Object.freeze({ x: 1, y: 1, z: 0.8 });

export class TopologyEdit3DViewController extends ProfessionalController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.sjsonVisualByRole = new Map();
    this.sjsonBenchmarkView = null;
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
    const { overlays, projection: supportProjection } = supportAuthority;

    backend.clearGroup(supportGroup);
    backend.renderProjection(supportGroup, supportProjection, 0x22d3ee, 1, markerSizeMm);
    backend.engineeringRoot?.updateMatrixWorld(true);
    this.sjsonBenchmarkView = canonical.sourceHash === BENCHMARK_SOURCE_HASH
      ? applyTopoValidatorBenchmarkFit(backend)
      : null;
    backend.invalidate?.('sjson-topo-validator-restraint-projection');

    this.visualDiagnostics = [
      ...(draftVisual?.model?.diagnostics || []),
      ...overlays.flatMap((row) => row.diagnostics || []),
      ...overlays.flatMap((row) => (row.restraints || []).flatMap((restraint) => restraint.diagnostics || [])),
    ];
    this.visualModelHash = semanticHash({
      draftVisualGeometryHash: draftVisual?.model?.visualGeometryHash || '',
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
      draftVisual?.model,
      supportTopology,
      supportAuthority,
    );
  }

  publishSjsonFidelityEvidence(canonical, supportProjection, visualModel, supportTopology, supportAuthority) {
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
    host.dataset.topologyEditBenchmarkCameraEngineeringDirection = JSON.stringify(
      this.sjsonBenchmarkView?.engineeringDirection || null,
    );
    host.dataset.topologyEditBenchmarkCameraRenderDirection = JSON.stringify(
      this.sjsonBenchmarkView?.renderDirection || null,
    );
    host.dataset.topologyEditBenchmarkBounds = JSON.stringify(
      this.sjsonBenchmarkView?.renderBounds || null,
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
  const bounds = backend.lastBounds && !backend.lastBounds.isEmpty()
    ? backend.lastBounds.clone()
    : new THREE.Box3().setFromObject(backend.engineeringRoot);
  if (!backend.camera || !backend.controls || bounds.isEmpty()) return null;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const diagonalMm = size.length() || 1000;
  const cameraDistanceMm = diagonalMm * 0.9 + 200;
  const renderDirectionValue = engineeringDirectionToRender(
    TOPO_VALIDATOR_ENGINEERING_CAMERA_DIRECTION,
  );
  const renderDirection = new THREE.Vector3(
    renderDirectionValue.x,
    renderDirectionValue.y,
    renderDirectionValue.z,
  );

  backend.camera.up.set(0, 1, 0);
  backend.camera.position.copy(center).addScaledVector(renderDirection, cameraDistanceMm);
  backend.camera.lookAt(center);
  backend.controls.target.copy(center);
  backend.controls.update();
  backend.sceneBoundsCache = bounds.clone();
  backend.camera.near = Math.max(0.1, cameraDistanceMm - diagonalMm * 2);
  backend.camera.far = Math.max(
    backend.camera.near + 1000,
    cameraDistanceMm + diagonalMm * 4 + 1000,
  );
  backend.camera.updateProjectionMatrix();
  backend.initialCameraState = backend.captureCameraState?.() || backend.initialCameraState;

  const fittedRenderDirection = backend.camera.position.clone()
    .sub(backend.controls.target)
    .normalize();
  const engineeringDirection = renderDirectionToEngineering({
    x: fittedRenderDirection.x,
    y: fittedRenderDirection.y,
    z: fittedRenderDirection.z,
  });
  return Object.freeze({
    authority: 'TOPO_VALIDATOR_FIT_BOX_SIZE_0_9_PLUS_200_DIRECTION_1_1_0_8',
    sourceHash: BENCHMARK_SOURCE_HASH,
    engineeringDirection,
    renderDirection: {
      x: fittedRenderDirection.x,
      y: fittedRenderDirection.y,
      z: fittedRenderDirection.z,
    },
    renderBounds: {
      min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
      max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
      size: { x: size.x, y: size.y, z: size.z },
      diagonalMm,
    },
    cameraDistanceMm,
    cameraPosition: {
      x: backend.camera.position.x,
      y: backend.camera.position.y,
      z: backend.camera.position.z,
    },
    target: { x: center.x, y: center.y, z: center.z },
    fovDeg: Number(backend.camera.fov) || null,
    near: backend.camera.near,
    far: backend.camera.far,
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
