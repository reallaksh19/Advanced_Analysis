import { semanticHash } from '../../core/shared-piping-model/index.js';
import {
  distinctExactSupportOriginCount,
  visualPrimitiveKindCounts,
} from './topology-edit-sjson-visual-authority.js';

export function publishSjsonFidelityEvidence({
  host,
  canonical,
  supportProjection,
  visualResult,
  supportTopology,
  supportAuthority,
  benchmarkView,
  visualModelHash,
  journalHash,
}) {
  if (!host) return;
  const visualModel = visualResult?.model;
  const metrics = visualResult?.editDraftMetrics || {};
  const counts = visualPrimitiveKindCounts(visualModel);
  const diagnostics = visualModel?.diagnostics || [];
  const supportMetrics = supportAuthority?.metrics || {};
  const typedPrimitiveCount = Object.values(counts).reduce((sum, value) => (
    sum + (Number.isFinite(Number(value)) ? Number(value) : 0)
  ), 0);
  const supportOverlays = supportProjection?.glyphOverlays || [];
  const set = (name, value) => { host.dataset[name] = String(value ?? ''); };

  set('topologyEditTypedPrimitiveCount', typedPrimitiveCount);
  set('topologyEditFlangePrimitiveCount', counts.FLANGE_DISC || 0);
  set('topologyEditValvePrimitiveCount', counts.VALVE_BODY || 0);
  set('topologyEditSupportOverlayCount', supportOverlays.length);
  set('topologyEditResolvedSupportOriginCount', supportOverlays.filter((row) => row?.origin).length);

  set('topologyEditPipePrimitiveCount', counts.PIPE_CYLINDER || 0);
  set('topologyEditElbowPrimitiveCount', counts.ELBOW_ARC || 0);
  set('topologyEditReducerPrimitiveCount',
    (counts.CONICAL_REDUCER || 0) + (counts.ECCENTRIC_REDUCER || 0));
  set('topologyEditTeePrimitiveCount', counts.TEE_JUNCTION || 0);
  set('topologyEditOletPrimitiveCount', counts.OLET_BRANCH || 0);
  set('topologyEditDiagnosticPrimitiveCount', counts.DIAGNOSTIC_CENTERLINE || 0);

  set('topologyEditExactSupportOriginCount', distinctExactSupportOriginCount(canonical));
  set('topologyEditDistinctSupportOriginCount', distinctProjectionOrigins(supportProjection));
  set('topologyEditRawSupportCount', supportMetrics.rawSupportCount || 0);
  set('topologyEditProjectedSourceSupportCount', supportMetrics.projectedSourceSupportCount || 0);
  set('topologyEditDeferredSourceSupportCount', supportMetrics.deferredSourceSupportCount || 0);
  set('topologyEditSupportAnchorCount', supportMetrics.supportAnchorCount || 0);
  set('topologyEditNativeRestraintRecordCount', supportMetrics.nativeRestraintRecordCount || 0);
  set('topologyEditCollapsedSourceSupportCount', supportMetrics.collapsedSourceSupportCount || 0);
  set('topologyEditHierarchySupportMergeCount', supportMetrics.hierarchyMergeCount || 0);
  set('topologyEditPositionSupportMergeCount', supportMetrics.positionMergeCount || 0);
  set('topologyEditProjectedRestraintDirectionCount',
    supportMetrics.projectedRestraintDirectionCount || 0);
  set('topologyEditSupportRestraintAuthority', supportAuthority?.authority || '');
  set('topologyEditSupportRestraintGroupingAuthority', supportAuthority?.groupingAuthority || '');
  set('topologyEditSupportRestraintResolutionAuthority', supportAuthority?.restraintAuthority || '');
  set('topologyEditSupportRestraintAuthorityHash', supportAuthority?.authorityHash || '');
  set('topologyEditSupportRenderStyle', supportProjection?.renderStyle || '');
  set('topologyEditSupportRenderAuthority', supportProjection?.renderAuthority || '');
  set('topologyEditCompactSupportMarkerRadiusMm', supportProjection?.compactMarkerRadiusMm || 0);

  set('topologyEditEditDraftRenderAuthority', metrics.authority || '');
  set('topologyEditEditDraftElbowAuthority', metrics.elbowCurveAuthority || '');
  set('topologyEditEditDraftCompactSegmentCount', metrics.compactSegmentCount || 0);
  set('topologyEditEditDraftSourceTangentElbowCount', metrics.sourceTangentElbowCount || 0);
  set('topologyEditEditDraftMaxStartTangentError', metrics.maxStartTangentError ?? '');
  set('topologyEditEditDraftMaxEndTangentError', metrics.maxEndTangentError ?? '');
  set('topologyEditEditDraftFirstElbow', JSON.stringify(metrics.firstElbow || null));
  set('topologyEditExactTeeCount', metrics.exactTeeCount || 0);
  set('topologyEditExactTeeSegmentCount', metrics.exactTeeSegmentCount || 0);
  set('topologyEditExactTeeAuthority', metrics.teeAuthority || '');
  set('topologyEditActiveRichPrimitiveCount', metrics.activeRichPrimitiveCount || 0);
  set('topologyEditSjsonSingleRenderPacket', 'true');

  set('topologyEditVisualProxyWarningCount', countDiagnostic(diagnostics, 'VISUAL_NOMINAL_BORE_PROXY_USED'));
  set('topologyEditParentBranchDiameterCount', countDiagnostic(diagnostics, 'VISUAL_PARENT_BRANCH_DIAMETER_USED'));
  set('topologyEditReferencedBranchDiameterCount',
    countDiagnostic(diagnostics, 'VISUAL_REFERENCED_BRANCH_DIAMETER_USED'));
  set('topologyEditSupportParentBranchDiameterCount',
    supportTopology?.supportVisualDiameterAdaptations?.length || 0);

  set('topologyEditBenchmarkCameraAuthority', benchmarkView?.authority || '');
  set('topologyEditBenchmarkCameraFitAlgorithm', benchmarkView?.fitAlgorithm || '');
  set('topologyEditBenchmarkCameraEngineeringDirection',
    JSON.stringify(benchmarkView?.engineeringDirection || null));
  set('topologyEditBenchmarkCameraRenderDirection',
    JSON.stringify(benchmarkView?.renderDirection || null));
  set('topologyEditBenchmarkBounds', JSON.stringify(benchmarkView?.renderBounds || null));
  set('topologyEditBenchmarkScreenBounds', JSON.stringify(benchmarkView?.screenBoundsNdc || null));
  set('topologyEditVisualModelHash', visualModelHash || '');
  set('topologyEditSupportProjectionHash', semanticHash(supportProjection));
  set('topologyEditJournalHash', journalHash || '');
}

function countDiagnostic(rows, code) {
  return rows.filter((row) => row.code === code).length;
}

function distinctProjectionOrigins(projection) {
  return new Set(
    (projection?.glyphOverlays || [])
      .filter((overlay) => overlay.origin)
      .map((overlay) => [overlay.origin.x, overlay.origin.y, overlay.origin.z]
        .map((value) => Number(value).toFixed(6)).join('|')),
  ).size;
}
