/** Pure presentation model for the governed Discretization step. */
import { buildMeshQualityPanel } from './lafea-mesh-quality-panel.js';
import { requireLafeaLifecycleProfileForStage } from './lafea-lifecycle-profiles.js';

export const LAFEA_DISCRETIZATION_VIEW_MODEL_SCHEMA =
  'lafea-discretization-view-model/v1';

export const LAFEA_DISCRETIZATION_MODES = Object.freeze([
  'RETAIN_AUTHORIZED_MESH',
  'SOURCE_DISCRETIZATION',
  'AUTOMATIC_MESH',
  'MANUAL_REFINEMENT',
]);

export function buildLafeaDiscretizationViewModel(stageValue) {
  const stage = requireStage(stageValue);
  const profile = requireLafeaLifecycleProfileForStage(stage.stageId);
  const custody = requireCustody(stage.analysisMeshCustodyProjection, stage.stageId);
  const evidence = stage.retainedAnalysisMeshEvidence ?? null;
  const reasons = custodyReasons(custody);
  const qualityPanel = custody.gateResults.length && custody.meshProfileIdentity
    ? buildMeshQualityPanel(custody.gateResults, {
      stageId: stage.stageId,
      meshProfileIdentity: custody.meshProfileIdentity,
    })
    : null;

  return freeze({
    schema: LAFEA_DISCRETIZATION_VIEW_MODEL_SCHEMA,
    stageId: stage.stageId,
    applicable: profile.meshApplicable,
    state: custody.state,
    stepStatus: stepStatus(custody.state),
    reasons,
    configuration: {
      declaredMode: profile.meshApplicable ? 'RETAIN_AUTHORIZED_MESH' : null,
      modes: modeOptions(profile.meshApplicable),
      meshProfileHash: stage.analysisMeshProfileHash ?? null,
      retainedProfileIdentity: custody.meshProfileIdentity,
      retainedProfileHash: custody.meshProfileHash,
      legacyMeshConfigStatus: isRecord(stage.document?.meshConfig)
        ? 'UNAPPLIED_PREFERENCE'
        : 'NOT_CONFIGURED',
      legacyMeshConfig: isRecord(stage.document?.meshConfig)
        ? structuredClone(stage.document.meshConfig)
        : null,
      legacyMeshConfigEngineeringEffect: 'NONE',
    },
    preview: {
      status: previewStatus(custody.state),
      producerQualified: false,
      proposedMesh: null,
      proposedNodeCount: null,
      proposedElementCount: null,
      proposedDofCount: null,
      resourceEstimate: null,
      configurationSemanticHash: null,
      retainedNodeCount: custody.nodeCount,
      retainedElementCount: custody.elementCount,
    },
    evidence: evidence ? {
      present: true,
      meshIdentity: custody.meshIdentity,
      meshHash: custody.meshHash,
      meshProfileIdentity: custody.meshProfileIdentity,
      meshProfileHash: custody.meshProfileHash,
      sourceHash: custody.sourceHash,
      canonicalModelHash: custody.canonicalModelHash,
      analysisGeometryHash: custody.analysisGeometryHash,
      artifactHash: custody.artifactHash,
      registrationId: custody.registrationId,
      producerRef: custody.producerRef,
      authorityStatus: custody.authorityStatus,
      nodeCount: custody.nodeCount,
      elementCount: custody.elementCount,
      warningElementIds: [...custody.warningElementIds],
      blockingElementIds: [...custody.blockingElementIds],
      qualityPanel,
    } : {
      present: false,
      meshIdentity: null,
      meshHash: null,
      meshProfileIdentity: null,
      meshProfileHash: null,
      sourceHash: null,
      canonicalModelHash: null,
      analysisGeometryHash: null,
      artifactHash: null,
      registrationId: null,
      producerRef: null,
      authorityStatus: null,
      nodeCount: 0,
      elementCount: 0,
      warningElementIds: [],
      blockingElementIds: [],
      qualityPanel: null,
    },
    actions: {
      canImportAuthorizedMesh: profile.meshApplicable,
      canValidateEvidence: profile.meshApplicable,
      canExportEvidence: custody.canView === true,
      canFocusWarnings: custody.canFocusFindings === true
        && custody.warningElementIds.length > 0,
      canFocusBlocking: custody.canFocusFindings === true
        && custody.blockingElementIds.length > 0,
      canAdvance: custody.usableForAdvance === true,
      canAuthorize: custody.usableForAuthorization === true,
      canRun: custody.usableForRun === true,
      warningReviewRequired: custody.state === 'CURRENT_WARNING',
      automaticMeshEnabled: false,
      manualRefinementEnabled: false,
    },
  });
}

function requireStage(value) {
  if (!isRecord(value) || typeof value.stageId !== 'string') {
    throw new TypeError('LAFEA_DISCRETIZATION_STAGE_REQUIRED');
  }
  return value;
}

function requireCustody(value, stageId) {
  if (!isRecord(value)
    || value.schema !== 'lafea-analysis-mesh-custody-projection/v1'
    || value.stageId !== stageId
    || !Array.isArray(value.gateResults)
    || !Array.isArray(value.warningElementIds)
    || !Array.isArray(value.blockingElementIds)) {
    throw new TypeError('LAFEA_DISCRETIZATION_CUSTODY_PROJECTION_REQUIRED');
  }
  return value;
}

function modeOptions(applicable) {
  if (!applicable) {
    return LAFEA_DISCRETIZATION_MODES.map((mode) => ({
      mode,
      enabled: false,
      reason: 'ANALYSIS_MESH_NOT_APPLICABLE',
    }));
  }
  return [
    { mode: 'RETAIN_AUTHORIZED_MESH', enabled: true, reason: null },
    {
      mode: 'SOURCE_DISCRETIZATION',
      enabled: false,
      reason: 'NO_STAGE_SOURCE_DISCRETIZATION_AUTHORITY',
    },
    {
      mode: 'AUTOMATIC_MESH',
      enabled: false,
      reason: 'QUALIFIED_MESH_PRODUCER_NOT_AVAILABLE',
    },
    {
      mode: 'MANUAL_REFINEMENT',
      enabled: false,
      reason: 'GOVERNED_REFINEMENT_COMMAND_NOT_AVAILABLE',
    },
  ];
}

function custodyReasons(custody) {
  const reasons = [
    ...custody.staleReasons,
    ...custody.invalidReasons,
    ...custody.absenceReasons,
  ];
  if (custody.state === 'ABSENT' && !reasons.length) {
    reasons.push('ANALYSIS_MESH_EVIDENCE_ABSENT');
  }
  return [...new Set(reasons)];
}

function stepStatus(state) {
  if (state === 'NOT_APPLICABLE' || state === 'CURRENT_PASS') return 'COMPLETE';
  if (state === 'CURRENT_WARNING') return 'WARNING';
  if (state === 'ABSENT') return 'NOT_STARTED';
  return 'BLOCKED';
}

function previewStatus(state) {
  if (state === 'STALE') return 'STALE_RETAINED_EVIDENCE';
  if (state === 'CURRENT_PASS' || state === 'CURRENT_WARNING'
    || state === 'CURRENT_BLOCK') return 'RETAINED_EVIDENCE_AVAILABLE';
  if (state === 'INVALID') return 'INVALID_RETAINED_EVIDENCE';
  if (state === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
  return 'NO_QUALIFIED_PRODUCER';
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
