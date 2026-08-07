import {
  validateLafeaAnalysisMeshEvidenceV2,
} from './lafea-analysis-mesh-evidence-v2.js';
import { buildLafeaDomainFirstMeshCustodyProjection } from './lafea-domain-first-mesh-custody.js';
import {
  createLafeaDomainFirstArtifact,
  lafeaDomainFirstReadiness,
} from './lafea-domain-first-lifecycle.js';
import {
  replaceLafeaDomainFirstAnalysisMeshArtifact,
} from './lafea-domain-first-lifecycle-mesh-transition.js';

export function createLafeaWorkbenchDomainFirstMeshState(stageIds) {
  const retained = new Map(stageIds.map((stageId) => [stageId, null]));

  function fields(stageId) {
    requireStage(stageId);
    return freeze({
      retainedDomainFirstAnalysisMeshEvidence: retained.get(stageId)?.value ?? null,
    });
  }

  function prepareRegistration(value, stage) {
    requireActive(stage);
    const evidence = validateLafeaAnalysisMeshEvidenceV2(value);
    if (evidence.qualification !== 'PASS' || evidence.status !== 'CURRENT') {
      fail('LAFEA_MP3_MESH_EVIDENCE_NOT_CUSTODY_ELIGIBLE');
    }
    requireCurrentParents(evidence, stage);
    const current = retained.get('LAFEA.3');
    if (current?.epoch === stage.domainFirstCustodyEpoch
      && current.value.artifactHash === evidence.artifactHash) {
      return freeze({ changed: false, evidence: current.value, epoch: current.epoch });
    }
    if (current?.epoch === stage.domainFirstCustodyEpoch
      && current.value.authority.planHash === evidence.authority.planHash) {
      fail('LAFEA_MP3_MESH_CONFLICTING_REPLAY');
    }
    const lifecycle = replaceLafeaDomainFirstAnalysisMeshArtifact(
      stage.domainFirstLifecycle, meshArtifact(evidence), registrationId(evidence),
    );
    lafeaDomainFirstReadiness(lifecycle);
    return freeze({
      changed: true, evidence, lifecycle, epoch: stage.domainFirstCustodyEpoch,
      expectedArtifactHash: current?.value.artifactHash ?? null,
    });
  }

  function commitRegistration(prepared, stage) {
    if (!prepared.changed) return prepared.evidence;
    requireActive(stage);
    if (stage.domainFirstCustodyEpoch !== prepared.epoch) fail('LAFEA_MP3_MESH_REGISTRATION_STALE');
    const current = retained.get('LAFEA.3');
    if ((current?.value.artifactHash ?? null) !== prepared.expectedArtifactHash) {
      fail('LAFEA_MP3_MESH_REGISTRATION_RACE');
    }
    retained.set('LAFEA.3', freeze({ value: prepared.evidence, epoch: prepared.epoch }));
    return prepared.evidence;
  }

  function lifecycleOverlay(stage) {
    const entry = retained.get(stage.stageId);
    if (!stage.domainFirstProfileActive || !entry
      || entry.epoch !== stage.domainFirstCustodyEpoch) return freeze({});
    const evidence = entry.value;
    const projection = buildLafeaDomainFirstMeshCustodyProjection(stage, evidence, entry.epoch);
    if (projection.state !== 'CURRENT_PASS') return freeze({});
    const domainFirstLifecycle = replaceLafeaDomainFirstAnalysisMeshArtifact(
      stage.domainFirstLifecycle, meshArtifact(evidence), registrationId(evidence),
    );
    return freeze({
      domainFirstLifecycle,
      domainFirstReadiness: lafeaDomainFirstReadiness(domainFirstLifecycle),
    });
  }

  function buildProjection(stage) {
    const entry = retained.get(stage.stageId);
    return buildLafeaDomainFirstMeshCustodyProjection(
      stage,
      entry?.value ?? null,
      entry?.epoch ?? null,
    );
  }
  function select(stageId = 'LAFEA.3') {
    requireStage(stageId);
    return retained.get(stageId)?.value ?? null;
  }
  function exportEvidence(stageId = 'LAFEA.3') { return select(stageId); }

  return Object.freeze({
    fields,
    validateEvidence: validateLafeaAnalysisMeshEvidenceV2,
    prepareRegistration,
    commitRegistration,
    lifecycleOverlay,
    buildProjection,
    select,
    exportEvidence,
  });

  function requireStage(stageId) {
    if (!retained.has(stageId)) fail('LAFEA_MP3_MESH_STAGE_NOT_FOUND');
  }
}

function meshArtifact(evidence) {
  return createLafeaDomainFirstArtifact({
    kind: 'ANALYSIS_MESH', status: 'CURRENT', artifactHash: evidence.meshHash,
    parentHashes: {
      analysisDomainHash: evidence.analysisDomainHash,
      analysisGeometryHash: evidence.analysisGeometryHash,
      meshProfileHash: evidence.meshProfileHash,
    },
    qualification: 'PASS', producerRef: evidence.authority.producerRef,
  });
}
function registrationId(evidence) {
  return `MP3-MESH-${evidence.artifactHash.slice(7, 23).toUpperCase()}`;
}

function requireCurrentParents(evidence, stage) {
  const sourceHash = stage.sourceAuthority?.sourceHash ?? stage.lifecycle?.source?.sourceHash ?? null;
  if (stage.analysisDomainProjection?.state !== 'CURRENT_PASS'
    || stage.analysisGeometryProjection?.state !== 'CURRENT_PASS'
    || evidence.sourceHash !== sourceHash
    || evidence.analysisDomainHash !== stage.analysisDomainProjection.analysisDomainHash
    || evidence.analysisGeometryHash !== stage.analysisGeometryProjection.analysisGeometryHash) {
    fail('LAFEA_MP3_MESH_EVIDENCE_PARENT_STALE');
  }
}
function requireActive(stage) {
  if (!stage || stage.stageId !== 'LAFEA.3' || !stage.domainFirstProfileActive) {
    fail('LAFEA_MP3_DOMAIN_FIRST_PROFILE_NOT_ACTIVE');
  }
  if (stage.lifecycleBinding?.status !== 'CURRENT') fail('LAFEA_MP3_SOURCE_BINDING_NOT_CURRENT');
}
function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
