/** Pure custody classifier for domain-first LAFEA.3 mesh evidence v2. */
import { validateLafeaAnalysisMeshEvidenceV2 } from './lafea-analysis-mesh-evidence-v2.js';

export const LAFEA_DOMAIN_FIRST_MESH_CUSTODY_SCHEMA = 'lafea-domain-first-mesh-custody/v1';

export function buildLafeaDomainFirstMeshCustodyProjection(stage, retainedEvidence = null) {
  if (!stage?.domainFirstProfileActive) return freeze({
    schema: LAFEA_DOMAIN_FIRST_MESH_CUSTODY_SCHEMA,
    stageId: stage?.stageId ?? null,
    state: 'NOT_APPLICABLE',
    usableForAuthorization: true,
    reasons: [],
    meshHash: null,
    meshProfileHash: null,
  });
  if (!retainedEvidence) return result('ABSENT', false, ['ANALYSIS_MESH_EVIDENCE_V2_ABSENT']);
  let evidence;
  try { evidence = validateLafeaAnalysisMeshEvidenceV2(retainedEvidence); } catch (error) {
    return result('INVALID', false, [error.code ?? 'ANALYSIS_MESH_EVIDENCE_V2_INVALID']);
  }
  const reasons = [];
  if (stage.analysisDomainProjection?.state !== 'CURRENT_PASS'
    || evidence.analysisDomainHash !== stage.analysisDomainProjection?.analysisDomainHash) {
    reasons.push('ANALYSIS_MESH_V2_DOMAIN_PARENT_STALE');
  }
  if (stage.analysisGeometryProjection?.state !== 'CURRENT_PASS'
    || evidence.analysisGeometryHash !== stage.analysisGeometryProjection?.analysisGeometryHash) {
    reasons.push('ANALYSIS_MESH_V2_GEOMETRY_PARENT_STALE');
  }
  const sourceHash = stage.sourceAuthority?.sourceHash ?? stage.lifecycle?.source?.sourceHash ?? null;
  if (evidence.sourceHash !== sourceHash) reasons.push('ANALYSIS_MESH_V2_SOURCE_PARENT_STALE');
  if (reasons.length) return result('STALE', false, reasons, evidence);
  if (evidence.qualification === 'BLOCK') return result('CURRENT_BLOCK', false, ['ANALYSIS_MESH_QUALITY_BLOCK'], evidence);
  return result('CURRENT_PASS', true, [], evidence);
}

function result(state, usable, reasons, evidence = null) {
  return freeze({
    schema: LAFEA_DOMAIN_FIRST_MESH_CUSTODY_SCHEMA,
    stageId: 'LAFEA.3',
    state,
    usableForAdvance: usable,
    usableForAuthorization: usable,
    usableForRun: usable,
    canView: Boolean(evidence),
    canFocusFindings: state === 'CURRENT_BLOCK',
    advancePolicy: usable ? 'ALLOW' : 'DENY',
    authorizationPolicy: usable ? 'ALLOW' : 'DENY',
    runPolicy: usable ? 'ALLOW' : 'DENY',
    staleReasons: state === 'STALE' ? reasons : [],
    invalidReasons: state === 'INVALID' ? reasons : [],
    absenceReasons: state === 'ABSENT' ? reasons : [],
    meshHash: evidence?.meshHash ?? null,
    meshProfileHash: evidence?.meshProfileHash ?? null,
    analysisDomainHash: evidence?.analysisDomainHash ?? null,
    analysisGeometryHash: evidence?.analysisGeometryHash ?? null,
    producerRef: evidence?.authority?.producerRef ?? null,
    gateResults: evidence?.quality?.gateResults ?? [],
    warningElementIds: evidence?.quality?.warningElementIds ?? [],
    blockingElementIds: evidence?.quality?.blockingElementIds ?? [],
  });
}
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
