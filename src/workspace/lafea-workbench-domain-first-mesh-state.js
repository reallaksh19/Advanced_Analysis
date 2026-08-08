import { validateLafeaAnalysisMeshEvidenceV2 } from './lafea-analysis-mesh-evidence-v2.js';
import { buildLafeaDomainFirstMeshCustodyProjection } from './lafea-domain-first-mesh-custody.js';
import {
  createLafeaDomainFirstArtifact,
  lafeaDomainFirstReadiness,
} from './lafea-domain-first-lifecycle.js';
import { validateLafeaDomainFirstMeshProducerOutputV2 } from './lafea-domain-first-producer-output-v2.js';
import { planLafeaDomainFirstT6Mesh } from './lafea-domain-first-t6-producer.js';
import {
  replaceLafeaDomainFirstAnalysisMeshArtifact,
} from './lafea-domain-first-lifecycle-mesh-transition.js';

const EXECUTION_SCHEMA = 'lafea-domain-first-t6-producer-execution/v1';
const EXECUTION_KEYS = Object.freeze([
  'schema', 'status', 'custodyEligible', 'intent', 'plan', 'output', 'evidence',
]);

export function createLafeaWorkbenchDomainFirstMeshState(stageIds) {
  const retained = new Map(stageIds.map((stageId) => [stageId, null]));

  function fields(stageId) {
    requireStage(stageId);
    return freeze({
      retainedDomainFirstAnalysisMeshEvidence: retained.get(stageId)?.evidence ?? null,
    });
  }

  function prepareRegistration(value, stage) {
    requireActive(stage);
    const receipt = validateExecutionReceipt(value, stage);
    const evidence = receipt.evidence;
    requireCurrentParents(evidence, stage);
    const current = retained.get('LAFEA.3');
    if (current?.epoch === stage.domainFirstCustodyEpoch
      && current.evidence.artifactHash === evidence.artifactHash
      && current.receipt.output.outputHash === receipt.output.outputHash) {
      return freeze({ changed: false, receipt: current.receipt, evidence: current.evidence, epoch: current.epoch });
    }
    if (current?.epoch === stage.domainFirstCustodyEpoch
      && current.receipt.plan.planHash === receipt.plan.planHash) {
      fail('LAFEA_MP3_MESH_CONFLICTING_REPLAY');
    }
    const lifecycle = replaceLafeaDomainFirstAnalysisMeshArtifact(
      stage.domainFirstLifecycle, meshArtifact(evidence), registrationId(evidence),
    );
    lafeaDomainFirstReadiness(lifecycle);
    return freeze({
      changed: true, receipt, evidence, lifecycle, epoch: stage.domainFirstCustodyEpoch,
      expectedArtifactHash: current?.evidence.artifactHash ?? null,
    });
  }

  function commitRegistration(prepared, stage) {
    if (!prepared.changed) return prepared.receipt;
    requireActive(stage);
    if (stage.domainFirstCustodyEpoch !== prepared.epoch) fail('LAFEA_MP3_MESH_REGISTRATION_STALE');
    const current = retained.get('LAFEA.3');
    if ((current?.evidence.artifactHash ?? null) !== prepared.expectedArtifactHash) {
      fail('LAFEA_MP3_MESH_REGISTRATION_RACE');
    }
    retained.set('LAFEA.3', freeze({
      receipt: prepared.receipt, evidence: prepared.evidence, epoch: prepared.epoch,
    }));
    return prepared.receipt;
  }

  function lifecycleOverlay(stage) {
    const entry = retained.get(stage.stageId);
    if (!stage.domainFirstProfileActive || !entry
      || entry.epoch !== stage.domainFirstCustodyEpoch) return freeze({});
    const evidence = entry.evidence;
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
      stage, entry?.evidence ?? null, entry?.epoch ?? null,
    );
  }
  function select(stageId = 'LAFEA.3') {
    requireStage(stageId);
    return retained.get(stageId)?.evidence ?? null;
  }
  function exportReceipt(stageId = 'LAFEA.3') {
    requireStage(stageId);
    return retained.get(stageId)?.receipt ?? null;
  }

  return Object.freeze({
    fields,
    validateEvidence: validateLafeaAnalysisMeshEvidenceV2,
    prepareRegistration,
    commitRegistration,
    lifecycleOverlay,
    buildProjection,
    select,
    exportReceipt,
  });

  function requireStage(stageId) {
    if (!retained.has(stageId)) fail('LAFEA_MP3_MESH_STAGE_NOT_FOUND');
  }
}

function validateExecutionReceipt(value, stage) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...EXECUTION_KEYS].sort())
    || value.schema !== EXECUTION_SCHEMA) fail('LAFEA_MP3_PRODUCER_EXECUTION_RECEIPT_INVALID');
  if (value.status !== 'QUALIFIED' || value.custodyEligible !== true) {
    fail('LAFEA_MP3_PRODUCER_EXECUTION_NOT_CUSTODY_ELIGIBLE');
  }
  const evidence = validateLafeaAnalysisMeshEvidenceV2(value.evidence);
  const expectedPlan = planLafeaDomainFirstT6Mesh({
    intent: value.intent,
    analysisDomain: stage.retainedAnalysisDomain,
    analysisGeometryEvidence: stage.retainedAnalysisGeometryEvidence,
    meshProfile: evidence.meshProfile,
  });
  if (value.plan?.planHash !== expectedPlan.planHash) fail('LAFEA_MP3_CUSTODY_PLAN_REPLAY_MISMATCH');
  const output = validateLafeaDomainFirstMeshProducerOutputV2(value.output, {
    intent: value.intent, plan: expectedPlan,
  });
  const authority = evidence.authority;
  const expectedProducerRef = `${output.producerId}@${output.producerRevision}`;
  if (evidence.meshHash !== output.meshHash
    || authority.planHash !== expectedPlan.planHash
    || authority.capabilityHash !== output.capabilityHash
    || authority.qualificationHash !== output.qualificationHash
    || authority.producerRef !== expectedProducerRef
    || authority.meshProfileHash !== output.meshProfileHash) {
    fail('LAFEA_MP3_CUSTODY_EXECUTION_CHAIN_MISMATCH');
  }
  return freeze({ ...value, plan: expectedPlan, output, evidence });
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
