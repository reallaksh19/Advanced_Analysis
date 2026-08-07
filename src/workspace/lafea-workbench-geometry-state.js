/** Listener-free domain/geometry custody slice owned by the canonical workbench orchestrator. */
import {
  createLafeaDomainFirstArtifact,
  createLafeaDomainFirstLifecycle,
  lafeaDomainFirstReadiness,
  registerLafeaDomainFirstArtifact,
} from './lafea-domain-first-lifecycle.js';
import {
  validateLafeaAnalysisGeometryEvidence,
} from './lafea-analysis-geometry-evidence.js';
import {
  validateLafeaContinuumAnalysisDomain,
} from './lafea-continuum-analysis-domain.js';

export const LAFEA_ANALYSIS_DOMAIN_PROJECTION_SCHEMA = 'lafea-analysis-domain-projection/v1';
export const LAFEA_ANALYSIS_GEOMETRY_PROJECTION_SCHEMA = 'lafea-analysis-geometry-projection/v1';
export const LAFEA_DOMAIN_FIRST_PROJECTION_STATES = Object.freeze([
  'NOT_APPLICABLE', 'ABSENT', 'STALE', 'CURRENT_PASS', 'INVALID',
]);

export function createLafeaWorkbenchGeometryState(stageIds) {
  const active = new Map(stageIds.map((stageId) => [stageId, false]));
  const epoch = new Map(stageIds.map((stageId) => [stageId, 0]));
  const lifecycle = new Map(stageIds.map((stageId) => [stageId, null]));
  const domain = new Map(stageIds.map((stageId) => [stageId, null]));
  const geometry = new Map(stageIds.map((stageId) => [stageId, null]));

  function fields(stageId) {
    requireStage(stageId);
    return freeze({
      domainFirstProfileActive: active.get(stageId),
      domainFirstCustodyEpoch: epoch.get(stageId),
      domainFirstLifecycle: lifecycle.get(stageId),
      retainedAnalysisDomain: domain.get(stageId)?.value ?? null,
      retainedAnalysisGeometryEvidence: geometry.get(stageId)?.value ?? null,
    });
  }

  function activate(stageState) {
    requireLafea3(stageState);
    const sourceHash = currentSourceHash(stageState);
    requireCurrentBinding(stageState);
    if (active.get('LAFEA.3') && lifecycle.get('LAFEA.3')?.sourceHash === sourceHash) {
      return freeze({ changed: false, profileId: lifecycle.get('LAFEA.3').profileId });
    }
    const nextEpoch = epoch.get('LAFEA.3') + 1;
    active.set('LAFEA.3', true);
    epoch.set('LAFEA.3', nextEpoch);
    lifecycle.set('LAFEA.3', createLafeaDomainFirstLifecycle(sourceHash, nextEpoch));
    return freeze({ changed: true, profileId: lifecycle.get('LAFEA.3').profileId });
  }

  function invalidate(stageId) {
    requireStage(stageId);
    if (!active.get(stageId)) return false;
    epoch.set(stageId, epoch.get(stageId) + 1);
    lifecycle.set(stageId, null);
    return true;
  }

  function clear(stageId) {
    requireStage(stageId);
    active.set(stageId, false);
    epoch.set(stageId, epoch.get(stageId) + 1);
    lifecycle.set(stageId, null);
    domain.set(stageId, null);
    geometry.set(stageId, null);
  }

  function registerDomain(value, stageState) {
    requireActive(stageState);
    const retained = validateLafeaContinuumAnalysisDomain(value);
    const sourceHash = currentSourceHash(stageState);
    if (retained.sourceHash !== sourceHash) fail('LAFEA_ANALYSIS_DOMAIN_SOURCE_PARENT_STALE');
    const lifecycleValue = candidateLifecycle(stageState);
    const current = domain.get('LAFEA.3');
    if (current?.value.semanticHash === retained.semanticHash
      && current.epoch === epoch.get('LAFEA.3')) {
      return freeze({ changed: false, domain: current.value });
    }
    const record = createLafeaDomainFirstArtifact({
      kind: 'ANALYSIS_DOMAIN',
      status: 'CURRENT',
      artifactHash: retained.semanticHash,
      parentHashes: { sourceHash },
      qualification: 'PASS',
      producerRef: 'LAFEA_DOMAIN_CONTRACT_V1',
    });
    const nextLifecycle = registerLafeaDomainFirstArtifact(
      lifecycleValue, record, registrationId('DOMAIN', retained.semanticHash),
    );
    lifecycle.set('LAFEA.3', nextLifecycle);
    domain.set('LAFEA.3', freeze({ value: retained, epoch: epoch.get('LAFEA.3') }));
    geometry.set('LAFEA.3', null);
    return freeze({ changed: true, domain: retained });
  }

  function registerGeometryEvidence(value, stageState) {
    requireActive(stageState);
    const lifecycleValue = candidateLifecycle(stageState);
    const evidence = validateLafeaAnalysisGeometryEvidence(value);
    const retainedDomain = currentDomain(stageState);
    if (evidence.sourceHash !== currentSourceHash(stageState)
      || evidence.analysisDomainHash !== retainedDomain.semanticHash
      || evidence.analysisGeometryHash !== retainedDomain.region.analysisGeometryHash) {
      fail('LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_PARENT_STALE');
    }
    const current = geometry.get('LAFEA.3');
    if (current?.value.semanticHash === evidence.semanticHash
      && current.epoch === epoch.get('LAFEA.3')) {
      return freeze({ changed: false, evidence: current.value });
    }
    if (current?.epoch === epoch.get('LAFEA.3')
      && current.value.analysisDomainHash === evidence.analysisDomainHash) {
      fail('LAFEA_ANALYSIS_GEOMETRY_CONFLICTING_REPLAY');
    }
    const record = createLafeaDomainFirstArtifact({
      kind: 'ANALYSIS_GEOMETRY',
      status: 'CURRENT',
      artifactHash: evidence.analysisGeometryHash,
      parentHashes: {
        sourceHash: evidence.sourceHash,
        analysisDomainHash: evidence.analysisDomainHash,
      },
      qualification: 'PASS',
      producerRef: evidence.producerRef,
    });
    const nextLifecycle = registerLafeaDomainFirstArtifact(
      lifecycleValue, record, registrationId('GEOMETRY', evidence.semanticHash),
    );
    lifecycle.set('LAFEA.3', nextLifecycle);
    geometry.set('LAFEA.3', freeze({ value: evidence, epoch: epoch.get('LAFEA.3') }));
    return freeze({ changed: true, evidence });
  }

  function buildProjections(stageState) {
    if (stageState.stageId !== 'LAFEA.3' || !active.get(stageState.stageId)) {
      return freeze({
        analysisDomainProjection: projection(LAFEA_ANALYSIS_DOMAIN_PROJECTION_SCHEMA, stageState.stageId, 'NOT_APPLICABLE', []),
        analysisGeometryProjection: projection(LAFEA_ANALYSIS_GEOMETRY_PROJECTION_SCHEMA, stageState.stageId, 'NOT_APPLICABLE', []),
        domainFirstReadiness: null,
      });
    }
    const domainProjection = buildDomainProjection(stageState);
    const geometryProjection = buildGeometryProjection(stageState, domainProjection);
    const ready = lifecycle.get('LAFEA.3') ? lafeaDomainFirstReadiness(lifecycle.get('LAFEA.3')) : null;
    return freeze({
      analysisDomainProjection: domainProjection,
      analysisGeometryProjection: geometryProjection,
      domainFirstReadiness: ready,
    });
  }

  function buildDomainProjection(stageState) {
    const entry = domain.get('LAFEA.3');
    if (!entry) return projection(LAFEA_ANALYSIS_DOMAIN_PROJECTION_SCHEMA, 'LAFEA.3', 'ABSENT', ['ANALYSIS_DOMAIN_EVIDENCE_ABSENT']);
    let value;
    try { value = validateLafeaContinuumAnalysisDomain(entry.value); } catch (error) {
      return projection(LAFEA_ANALYSIS_DOMAIN_PROJECTION_SCHEMA, 'LAFEA.3', 'INVALID', [error.code ?? 'ANALYSIS_DOMAIN_INVALID']);
    }
    const reasons = currentness(stageState, entry.epoch, value.sourceHash);
    const row = lifecycle.get('LAFEA.3')?.artifacts?.ANALYSIS_DOMAIN;
    if (row?.artifactHash !== value.semanticHash || row?.status !== 'CURRENT') reasons.push('ANALYSIS_DOMAIN_LIFECYCLE_NOT_CURRENT');
    return projection(LAFEA_ANALYSIS_DOMAIN_PROJECTION_SCHEMA, 'LAFEA.3',
      reasons.length ? 'STALE' : 'CURRENT_PASS', reasons, {
        analysisDomainHash: value.semanticHash,
        analysisGeometryHash: value.region.analysisGeometryHash,
      });
  }

  function buildGeometryProjection(stageState, domainProjection) {
    const entry = geometry.get('LAFEA.3');
    if (!entry) return projection(LAFEA_ANALYSIS_GEOMETRY_PROJECTION_SCHEMA, 'LAFEA.3', 'ABSENT', ['ANALYSIS_GEOMETRY_EVIDENCE_ABSENT']);
    let value;
    try { value = validateLafeaAnalysisGeometryEvidence(entry.value); } catch (error) {
      return projection(LAFEA_ANALYSIS_GEOMETRY_PROJECTION_SCHEMA, 'LAFEA.3', 'INVALID', [error.code ?? 'ANALYSIS_GEOMETRY_INVALID']);
    }
    const reasons = currentness(stageState, entry.epoch, value.sourceHash);
    if (domainProjection.state !== 'CURRENT_PASS'
      || domainProjection.analysisDomainHash !== value.analysisDomainHash) reasons.push('ANALYSIS_GEOMETRY_DOMAIN_PARENT_STALE');
    const row = lifecycle.get('LAFEA.3')?.artifacts?.ANALYSIS_GEOMETRY;
    if (row?.artifactHash !== value.analysisGeometryHash || row?.status !== 'CURRENT') reasons.push('ANALYSIS_GEOMETRY_LIFECYCLE_NOT_CURRENT');
    return projection(LAFEA_ANALYSIS_GEOMETRY_PROJECTION_SCHEMA, 'LAFEA.3',
      reasons.length ? 'STALE' : 'CURRENT_PASS', reasons, {
        analysisDomainHash: value.analysisDomainHash,
        analysisGeometryHash: value.analysisGeometryHash,
        evidenceHash: value.semanticHash,
      });
  }

  function currentDomain(stageState) {
    const projectionValue = buildDomainProjection(stageState);
    if (projectionValue.state !== 'CURRENT_PASS') fail('LAFEA_ANALYSIS_DOMAIN_NOT_CURRENT');
    return domain.get('LAFEA.3').value;
  }
  function selectDomain(stageId = 'LAFEA.3') { requireStage(stageId); return domain.get(stageId)?.value ?? null; }
  function selectGeometryEvidence(stageId = 'LAFEA.3') { requireStage(stageId); return geometry.get(stageId)?.value ?? null; }
  function exportGeometryEvidence(stageId = 'LAFEA.3') { return selectGeometryEvidence(stageId); }
  function recoverGeometryEvidence(value, stageState) { return registerGeometryEvidence(value, stageState); }

  return Object.freeze({
    fields, activate, invalidate, clear, registerDomain, registerGeometryEvidence,
    buildProjections, selectDomain, selectGeometryEvidence, exportGeometryEvidence,
    recoverGeometryEvidence,
  });

  function candidateLifecycle(stageState) {
    const sourceHash = currentSourceHash(stageState);
    const current = lifecycle.get('LAFEA.3');
    return current && current.sourceHash === sourceHash
      && current.custodyEpoch === epoch.get('LAFEA.3')
      ? current
      : createLafeaDomainFirstLifecycle(sourceHash, epoch.get('LAFEA.3'));
  }
  function requireStage(stageId) { if (!active.has(stageId)) fail('LAFEA_DOMAIN_FIRST_STAGE_NOT_FOUND'); }
}

function currentness(stage, registeredEpoch, sourceHash) {
  const reasons = [];
  if (stage.lifecycleBinding?.status !== 'CURRENT') reasons.push(`LIFECYCLE_SOURCE_BINDING_${stage.lifecycleBinding?.status ?? 'UNKNOWN'}`);
  if (currentSourceHash(stage, false) !== sourceHash) reasons.push('DOMAIN_FIRST_SOURCE_STALE');
  if (registeredEpoch !== stage.domainFirstCustodyEpoch) reasons.push('DOMAIN_FIRST_EXPLICIT_REVALIDATION_REQUIRED');
  return [...new Set(reasons)];
}
function currentSourceHash(stage, required = true) {
  const value = stage.sourceAuthority?.sourceHash ?? stage.lifecycle?.source?.sourceHash ?? null;
  if (required && (!value || !/^sha256:[0-9a-f]{64}$/u.test(value))) fail('LAFEA_DOMAIN_FIRST_SOURCE_AUTHORITY_REQUIRED');
  return value;
}
function requireCurrentBinding(stage) { if (stage.lifecycleBinding?.status !== 'CURRENT') fail('LAFEA_DOMAIN_FIRST_SOURCE_BINDING_NOT_CURRENT'); }
function requireLafea3(stage) { if (!stage || stage.stageId !== 'LAFEA.3') fail('LAFEA_DOMAIN_FIRST_STAGE_NOT_AUTHORIZED'); }
function requireActive(stage) { requireLafea3(stage); if (!stage.domainFirstProfileActive) fail('LAFEA_DOMAIN_FIRST_PROFILE_NOT_ACTIVE'); requireCurrentBinding(stage); }
function registrationId(kind, hash) { return `MP2-${kind}-${hash.slice(7, 23).toUpperCase()}`; }
function projection(schema, stageId, state, reasons, extra = {}) { return freeze({ schema, stageId, state, reasons: [...new Set(reasons)], usableForAdvance: state === 'CURRENT_PASS', usableForAuthorization: state === 'CURRENT_PASS', ...extra }); }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
