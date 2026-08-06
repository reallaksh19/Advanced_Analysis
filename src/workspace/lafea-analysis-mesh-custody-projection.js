/** Pure, closed projection consumed by UI and action-policy adapters. */
import { selectLafeaAnalysisMeshCustody } from './lafea-analysis-mesh-custody.js';
import { validateLafeaAnalysisMeshEvidence } from './lafea-analysis-mesh-evidence-validator.js';
import { requireLafeaLifecycleProfileForStage } from './lafea-lifecycle-profiles.js';

export const LAFEA_ANALYSIS_MESH_CUSTODY_PROJECTION_SCHEMA =
  'lafea-analysis-mesh-custody-projection/v1';

const CURRENT_STATES = new Set([
  'CURRENT_PASS', 'CURRENT_WARNING', 'CURRENT_BLOCK',
]);

export function buildAnalysisMeshCustodyProjection(stageState, retainedEvidence) {
  const stageId = stageState?.stageId
    ?? stageState?.lifecycle?.stageId
    ?? retainedEvidence?.stageId;
  const profile = requireLafeaLifecycleProfileForStage(stageId);

  let evidence = null;
  if (retainedEvidence) {
    try {
      evidence = validateLafeaAnalysisMeshEvidence(retainedEvidence);
    } catch (error) {
      return projection(stageId, 'INVALID', null, [
        error?.code ?? 'LAFEA_ANALYSIS_MESH_EVIDENCE_INVALID',
      ]);
    }
  }

  if (!profile.meshApplicable) {
    return evidence
      ? projection(stageId, 'INVALID', evidence, [
        'ANALYSIS_MESH_EVIDENCE_NOT_APPLICABLE',
      ])
      : projection(stageId, 'NOT_APPLICABLE', null, []);
  }
  if (!stageState?.lifecycle) {
    return evidence
      ? projection(stageId, 'STALE', evidence, ['LIFECYCLE_NOT_INITIALIZED'])
      : projection(stageId, 'ABSENT', null, []);
  }

  const profileHash = stageState.analysisMeshProfileHash
    ?? 'UNBOUND_MESH_PROFILE';
  let classification = selectLafeaAnalysisMeshCustody({
    stageId,
    lifecycle: stageState.lifecycle,
    evidence,
    meshProfileHash: profileHash,
  });

  const staleReasons = [...classification.reasons];
  if (stageState.lifecycleBinding?.status !== 'CURRENT') {
    staleReasons.push(
      `LIFECYCLE_SOURCE_BINDING_${stageState.lifecycleBinding?.status ?? 'UNKNOWN'}`,
    );
  }
  if (evidence && !sourceAuthorityMatches(stageState.sourceAuthority, evidence)) {
    staleReasons.push('SOURCE_AUTHORITY_BINDING_STALE');
  }
  if (staleReasons.length
    && classification.state !== 'INVALID'
    && classification.state !== 'ABSENT'
    && classification.state !== 'NOT_APPLICABLE') {
    classification = {
      ...classification,
      state: 'STALE',
      reasons: [...new Set(staleReasons)],
    };
  }

  return projection(
    stageId,
    classification.state,
    evidence,
    classification.reasons,
  );
}

function projection(stageId, state, evidence, reasons) {
  const usable = state === 'CURRENT_PASS' || state === 'NOT_APPLICABLE';
  const warning = state === 'CURRENT_WARNING';
  const findings = warning || state === 'CURRENT_BLOCK';
  const staleReasons = state === 'STALE' ? [...reasons] : [];
  const invalidReasons = state === 'INVALID' ? [...reasons] : [];
  const absenceReasons = state === 'ABSENT' ? [...reasons] : [];
  return freeze({
    schema: LAFEA_ANALYSIS_MESH_CUSTODY_PROJECTION_SCHEMA,
    stageId,
    state,
    usableForAdvance: usable,
    usableForAuthorization: usable,
    usableForRun: usable,
    canView: CURRENT_STATES.has(state) || state === 'STALE',
    canFocusFindings: findings,
    advancePolicy: warning ? 'REVIEW_REQUIRED' : usable ? 'ALLOW' : 'DENY',
    authorizationPolicy: usable ? 'ALLOW' : 'DENY',
    runPolicy: usable ? 'ALLOW' : 'DENY',
    staleReasons,
    invalidReasons,
    absenceReasons,
    meshIdentity: evidence?.mesh?.meshIdentity ?? null,
    meshHash: evidence?.meshHash ?? null,
    meshProfileIdentity: evidence?.meshProfile?.profileIdentity ?? null,
    meshProfileHash: evidence?.meshProfileHash ?? null,
    sourceHash: evidence?.sourceHash ?? null,
    canonicalModelHash: evidence?.canonicalModelHash ?? null,
    analysisGeometryHash: evidence?.analysisGeometryHash ?? null,
    artifactHash: evidence?.artifactHash ?? null,
    registrationId: evidence?.registrationId ?? null,
    producerRef: evidence?.authority?.producerRef ?? null,
    authorityStatus: evidence?.authority?.status ?? null,
    nodeCount: evidence?.mesh?.nodes?.length ?? 0,
    elementCount: evidence?.mesh?.elements?.length ?? 0,
    gateResults: evidence?.quality?.gateResults ?? [],
    warningElementIds: evidence?.quality?.warningElementIds ?? [],
    blockingElementIds: evidence?.quality?.blockingElementIds ?? [],
  });
}

function sourceAuthorityMatches(authority, evidence) {
  if (!authority) return true;
  return authority.stageId === evidence.stageId
    && authority.sourceHash === evidence.sourceHash;
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
