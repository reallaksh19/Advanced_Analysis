import {
  validateTemplateReleaseRecordV2,
} from '../core/lafea-application-templates/release-record-v2.js';
import {
  evaluateTemplateTargetCompatibility,
  validateTemplateTargetCompatibilityReceipt,
} from '../core/lafea-application-templates/target-compatibility.js';
import {
  createGeneralContinuumExecutionReceipt,
  validateGeneralContinuumExecutionRequest,
} from '../core/lafea-application-templates/general-continuum-execution-contract.js';
import {
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  createLafeaAnalysisMeshEvidence,
  registerLafeaAnalysisMeshEvidence,
} from './lafea-analysis-mesh-evidence.js';
import { bindLafeaContinuumTemplateCallerMesh } from './lafea-template-caller-mesh-binding.js';
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { lafeaDocumentDigest } from './lafea-edit-command.js';
import {
  createLafeaArtifactRecord,
  createLafeaLifecycle,
  lafeaLifecycleReadiness,
  registerLafeaArtifact,
} from './lafea-lifecycle.js';
import { issueLafeaSourceAuthority } from './lafea-source-authority.js';
import { createCurrentLafeaTargetAuthoritySnapshot } from './lafea-target-compatibility-authority.js';
import {
  executeControlledContinuumStageRoute,
  normalizeControlledContinuumStageSource,
  reconstructControlledContinuumResultHashes,
} from './lafea-controlled-continuum-stage-route.js';

export const LAFEA_GENERAL_CONTINUUM_CONTROLLER_SCHEMA = 'lafea-general-continuum-controller-result/v1';
const STAGE = 'LAFEA.3';
const PRODUCER = 'NB-T6H/REGISTERED-TEMPLATE/CALLER-MESH/LAFEA.3';
const INPUT_KEYS = Object.freeze(['request', 'releaseRecord', 'compatibilityReceipt', 'document', 'meshEvidence']);

export function executeGeneralLafeaContinuum(options) {
  const context = baseContext(options);
  try {
    exact(options, INPUT_KEYS, 'general continuum controller options');
    requireValid(validateGeneralContinuumExecutionRequest(options.request), 'request invalid');
    requireValid(validateTemplateReleaseRecordV2(options.releaseRecord), 'release record invalid');
    requireValid(validateTemplateTargetCompatibilityReceipt(options.compatibilityReceipt), 'compatibility receipt invalid');
    validateReleaseAndCompatibility(context);
    normalizeAndBind(context);
    issueSource(context);
    bindCallerMesh(context);
    buildLifecycle(context);
    executeStage(context);
    createReceipt(context, true);
    return result(context, 'ACCEPTED');
  } catch (error) {
    context.diagnostics.push(code(error, 'LAFEA_NB_T6H_CONTROLLER_BLOCKED'));
    if (context.request && context.sourceAuthority && context.callerMeshBinding) {
      createReceipt(context, false);
    }
    return result(context, 'BLOCKED');
  }
}

function baseContext(options) {
  const releaseRecord = options?.releaseRecord ?? null;
  let currentCompatibility = null;
  try {
    currentCompatibility = releaseRecord
      ? evaluateTemplateTargetCompatibility(
        releaseRecord, createCurrentLafeaTargetAuthoritySnapshot(STAGE),
      ) : null;
  } catch { currentCompatibility = null; }
  return {
    request: options?.request ?? null,
    releaseRecord,
    compatibilityReceipt: options?.compatibilityReceipt ?? null,
    currentCompatibility,
    document: options?.document ?? null,
    meshEvidence: options?.meshEvidence ?? null,
    normalized: null,
    sourceAuthority: null,
    sourceAuthorityHash: null,
    callerMeshBinding: null,
    lifecycle: null,
    execution: null,
    receipt: null,
    readiness: null,
    diagnostics: [],
  };
}

function validateReleaseAndCompatibility(c) {
  const { request, releaseRecord: release, compatibilityReceipt: provided, currentCompatibility: current } = c;
  if (release.template.templateId !== request.templateId
    || release.template.bucketId !== 'CONTINUUM_2D_FEA'
    || release.targetStage.stageId !== STAGE
    || release.semanticHash !== request.releaseRecordHash) {
    throw err('LAFEA_NB_T6H_RELEASE_TARGET_MISMATCH');
  }
  if (release.releaseState.authorityState !== 'ENGINE_EXECUTABLE'
    || release.releaseState.validity !== 'CURRENT'
    || release.releaseState.releaseQualified !== false
    || release.meshAuthority.applicability !== 'REQUIRED'
    || release.recoveryAuthority.applicability !== 'REQUIRED') {
    throw err('LAFEA_NB_T6H_RELEASE_NOT_ENGINE_EXECUTABLE');
  }
  if (!current || current.status !== 'CURRENT'
    || provided.status !== 'CURRENT'
    || current.semanticHash !== provided.semanticHash
    || provided.semanticHash !== request.compatibilityReceiptHash) {
    throw err('LAFEA_NB_T6H_TARGET_COMPATIBILITY_STALE');
  }
}

function normalizeAndBind(c) {
  c.normalized = normalizeControlledContinuumStageSource(c.document);
  if (lafeaDocumentDigest(c.normalized) !== c.request.documentRevisionDigest) {
    throw err('LAFEA_NB_T6H_DOCUMENT_REVISION_STALE');
  }
  const mesh = rebuildMesh(c.meshEvidence);
  c.meshEvidence = mesh;
  const checks = [
    [mesh.canonicalModelHash, c.request.canonicalModelHash, 'MODEL_PARENT_STALE'],
    [mesh.analysisGeometryHash, c.request.analysisGeometryHash, 'GEOMETRY_PARENT_STALE'],
    [mesh.artifactHash, c.request.meshArtifactHash, 'MESH_ARTIFACT_STALE'],
    [mesh.meshHash, c.request.meshHash, 'MESH_HASH_STALE'],
    [mesh.meshProfileHash, c.request.meshProfileHash, 'MESH_PROFILE_STALE'],
  ];
  for (const [actual, expected, suffix] of checks) {
    if (actual !== expected) throw err(`LAFEA_NB_T6H_${suffix}`);
  }
  const elementTypes = [...new Set(mesh.mesh.elements.map((row) => row.elementType))].sort();
  if (JSON.stringify(elementTypes) !== JSON.stringify(c.request.elementTypes)) {
    throw err('LAFEA_NB_T6H_ELEMENT_TYPE_MISMATCH');
  }
  assertMeshParity(c.normalized, mesh);
}

function issueSource(c) {
  const sourceRequest = c.request.sourceAuthorityRequest;
  c.sourceAuthority = issueLafeaSourceAuthority(STAGE, c.normalized, sourceRequest.originRef);
  c.sourceAuthorityHash = canonicalLafeaSha256(c.sourceAuthority);
  if (c.sourceAuthority.documentRevisionDigest !== c.request.documentRevisionDigest
    || c.sourceAuthority.sourceHash !== c.meshEvidence.sourceHash
    || c.meshEvidence.authority.sourceHash !== c.sourceAuthority.sourceHash) {
    throw err('LAFEA_NB_T6H_SOURCE_AUTHORITY_PARENT_MISMATCH');
  }
}

function bindCallerMesh(c) {
  const binding = bindLafeaContinuumTemplateCallerMesh({
    releaseRecord: c.releaseRecord,
    compatibilityReceipt: c.compatibilityReceipt,
    meshEvidence: c.meshEvidence,
    sourceAuthorityHash: c.sourceAuthorityHash,
    materialRegionEvidence: c.request.materialRegionEvidence,
    loadEdgeEvidence: c.request.loadEdgeEvidence,
    boundaryEdgeEvidence: c.request.boundaryEdgeEvidence,
  });
  if (binding.status !== 'BOUND' || binding.reasons.length !== 0
    || binding.templateId !== c.request.templateId
    || binding.targetStageId !== STAGE
    || binding.compilationHash !== c.request.compilationHash
    || binding.compatibilityReceiptHash !== c.request.compatibilityReceiptHash
    || binding.sourceAuthorityHash !== c.sourceAuthorityHash
    || binding.sourceHash !== c.sourceAuthority.sourceHash
    || binding.canonicalModelHash !== c.request.canonicalModelHash
    || binding.analysisGeometryHash !== c.request.analysisGeometryHash
    || binding.meshProfileHash !== c.request.meshProfileHash
    || binding.meshHash !== c.request.meshHash) {
    throw err('LAFEA_NB_T6H_B6_CALLER_MESH_BINDING_INVALID');
  }
  c.callerMeshBinding = binding;
}

function buildLifecycle(c) {
  let lifecycle = createLafeaLifecycle(STAGE, c.sourceAuthority.sourceHash);
  lifecycle = registerBase(lifecycle, 'CANONICAL_MODEL', c.request.canonicalModelHash,
    c.sourceAuthority.sourceHash);
  lifecycle = registerBase(lifecycle, 'ANALYSIS_GEOMETRY', c.request.analysisGeometryHash,
    c.request.canonicalModelHash);
  lifecycle = registerLafeaAnalysisMeshEvidence(lifecycle, c.meshEvidence);
  c.lifecycle = lifecycle;
}

function executeStage(c) {
  const execution = executeControlledContinuumStageRoute(c.normalized);
  if (execution.status !== 'QUALIFIED'
    || execution.result?.schema !== 'local-continuum-result/v1'
    || execution.result?.qualification?.state !== 'ACCEPTED') {
    throw err('LAFEA_NB_T6H_STAGE_CALCULATION_NOT_ACCEPTED');
  }
  c.execution = execution;
  const rebuilt = reconstructControlledContinuumResultHashes(execution.result);
  if (JSON.stringify(rebuilt) !== JSON.stringify(execution.result.semanticHashes)) {
    throw err('LAFEA_NB_T6H_RESULT_HASH_RECONSTRUCTION_FAILED');
  }
  const resultHash = canonicalLafeaSha256({
    schema: 'lafea-nb-t6h-result-hash-evidence/v1',
    reconstructed: rebuilt,
  });
  assertResultMesh(execution.result, c.meshEvidence);
  const retained = retainIntegrationPoints(execution.result, c.request.elementTypes);
  const integrationPointResultHash = canonicalLafeaSha256(retained);
  const executionHash = canonicalLafeaSha256({
    schema: 'lafea-nb-t6h-execution/v1',
    requestHash: c.request.semanticHash,
    callerMeshBindingHash: c.callerMeshBinding.semanticHash,
    sourceAuthorityHash: c.sourceAuthorityHash,
    sourceHash: c.sourceAuthority.sourceHash,
    meshArtifactHash: c.meshEvidence.artifactHash,
    resultHash,
  });
  c.lifecycle = register(c.lifecycle, executionRecord(c, executionHash));
  const recoveryHash = canonicalLafeaSha256({
    schema: 'lafea-nb-t6h-recovery/v1', executionHash,
    resultHash, integrationPointResultHash,
  });
  c.lifecycle = register(c.lifecycle, recoveryRecord(c, recoveryHash, executionHash));
  c.readiness = lafeaLifecycleReadiness(c.lifecycle);
  if (c.readiness.resultReady !== true || c.readiness.convergenceReady !== false
    || c.readiness.codeReady !== false || c.readiness.assessmentReady !== false
    || c.readiness.reportQualified !== false) {
    throw err('LAFEA_NB_T6H_READINESS_INVALID');
  }
  c.execution = { ...execution, resultHash, executionHash, recoveryHash, integrationPointResultHash };
}

function createReceipt(c, accepted) {
  c.receipt = createGeneralContinuumExecutionReceipt({
    receiptId: receiptId(c),
    request: c.request,
    sourceAuthorityHash: c.sourceAuthorityHash,
    sourceHash: c.sourceAuthority.sourceHash,
    callerMeshBindingHash: c.callerMeshBinding.semanticHash,
    executionHash: accepted ? c.execution.executionHash : null,
    resultHash: accepted ? c.execution.resultHash : null,
    recoveryHash: accepted ? c.execution.recoveryHash : null,
    integrationPointResultHash: accepted ? c.execution.integrationPointResultHash : null,
    calculationAccepted: accepted,
    diagnostics: c.diagnostics,
  });
}

function result(c, status) {
  return freeze({
    schema: LAFEA_GENERAL_CONTINUUM_CONTROLLER_SCHEMA,
    status,
    accepted: status === 'ACCEPTED',
    templateId: c.request?.templateId ?? null,
    stageId: STAGE,
    request: c.request,
    sourceAuthority: c.sourceAuthority,
    callerMeshBinding: c.callerMeshBinding,
    meshEvidence: c.meshEvidence,
    execution: c.execution,
    receipt: c.receipt,
    lifecycle: c.lifecycle,
    readiness: c.readiness,
    diagnostics: freeze([...new Set(c.diagnostics)].sort()),
    authority: freeze({
      registeredTemplateCallerMeshExecution: status === 'ACCEPTED',
      b6BoundMapping: status === 'ACCEPTED',
      compilerGeneratedMesh: false,
      arbitraryGeometryMesher: false,
      axisymmetricContinuum: false,
      shell: false,
      scl: false,
      structuralStress: false,
      convergence: false,
      assessment: false,
      code: false,
      report: false,
      lafea6: false,
      releaseQualified: false,
    }),
  });
}

function rebuildMesh(value) {
  const rebuilt = createLafeaAnalysisMeshEvidence({
    schema: LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
    stageId: value.stageId,
    sourceHash: value.sourceHash,
    canonicalModelHash: value.canonicalModelHash,
    analysisGeometryHash: value.analysisGeometryHash,
    meshProfile: value.meshProfile,
    mesh: value.mesh,
    authority: value.authority,
  });
  if (JSON.stringify(rebuilt) !== JSON.stringify(value)
    || rebuilt.stageId !== STAGE || rebuilt.status !== 'CURRENT'
    || rebuilt.qualification !== 'PASS') {
    throw err('LAFEA_NB_T6H_MESH_EVIDENCE_INVALID');
  }
  return rebuilt;
}
function assertMeshParity(document, evidence) {
  const nodes = new Map(document.nodes.map((row) => [row.nodeId, row]));
  if (nodes.size !== evidence.mesh.nodes.length) throw err('LAFEA_NB_T6H_NODE_SET_MISMATCH');
  for (const row of evidence.mesh.nodes) {
    const source = nodes.get(row.nodeId);
    if (!source || source.x !== row.x || source.y !== row.y || row.z !== 0) {
      throw err('LAFEA_NB_T6H_NODE_COORDINATE_MISMATCH');
    }
  }
  const elements = new Map(document.elements.map((row) => [row.elementId, row]));
  if (elements.size !== evidence.mesh.elements.length) throw err('LAFEA_NB_T6H_ELEMENT_SET_MISMATCH');
  for (const row of evidence.mesh.elements) {
    const source = elements.get(row.elementId);
    if (!source || source.elementType !== row.elementType
      || JSON.stringify(source.nodeIds) !== JSON.stringify(row.nodeIds)) {
      throw err('LAFEA_NB_T6H_CONNECTIVITY_MISMATCH');
    }
  }
}
function assertResultMesh(result, evidence) {
  const retained = result.meshEvidence?.elementEvidence;
  if (!Array.isArray(retained) || retained.length !== evidence.mesh.elements.length) {
    throw err('LAFEA_NB_T6H_RESULT_MESH_EVIDENCE_MISMATCH');
  }
  const expected = new Map(evidence.mesh.elements.map((row) => [row.elementId, row.nodeIds]));
  for (const row of retained) {
    if (!expected.has(row.elementId)
      || JSON.stringify(expected.get(row.elementId)) !== JSON.stringify(row.nodeIds)) {
      throw err('LAFEA_NB_T6H_RESULT_CONNECTIVITY_MISMATCH');
    }
  }
}
function retainIntegrationPoints(result, allowedTypes) {
  if (!Array.isArray(result.loadCaseResults) || result.loadCaseResults.length === 0) {
    throw err('LAFEA_NB_T6H_LOAD_CASE_RESULTS_REQUIRED');
  }
  return result.loadCaseResults.map((loadCase) => ({
    loadCaseId: loadCase.loadCaseId,
    elements: loadCase.elementResults.map((element) => {
      if (!allowedTypes.includes(element.elementType)
        || element.recoveryLayer !== 'INTEGRATION_POINT'
        || !Array.isArray(element.gaussPointResults)
        || element.gaussPointResults.length === 0) {
        throw err('LAFEA_NB_T6H_INTEGRATION_POINT_RECOVERY_REQUIRED');
      }
      return {
        elementId: element.elementId,
        elementType: element.elementType,
        recoveryLayer: element.recoveryLayer,
        gaussPointResults: element.gaussPointResults,
      };
    }),
  }));
}
function registerBase(lifecycle, kind, hash, parentHash) {
  const parentHashes = kind === 'CANONICAL_MODEL'
    ? { sourceHash: parentHash }
    : { sourceHash: lifecycle.source.sourceHash, canonicalModelHash: parentHash };
  const record = createLafeaArtifactRecord({
    stageId: STAGE,
    kind,
    status: 'CURRENT',
    artifactHash: hash,
    parentHashes,
    qualification: 'PASS',
    producerRef: PRODUCER,
    diagnostics: [],
  });
  return registerLafeaArtifact(
    lifecycle, record,
    `NB-T6H-${kind}-${hash.slice(7, 23).toUpperCase()}`,
  );
}
function executionRecord(c, hash) {
  const physicalLoadCaseHash = canonicalLafeaSha256({
    schema: 'lafea-nb-t6h-physical-load-cases/v1',
    loadCases: c.execution.canonicalInput.loadCases,
    resultRequests: c.execution.canonicalInput.resultRequests,
  });
  const solverProfileHash = canonicalLafeaSha256({
    schema: 'lafea-nb-t6h-solver-profile/v1',
    stageId: STAGE,
    qualificationProfile: c.execution.canonicalInput.qualificationProfile,
    formulation: c.normalized.formulation,
    elementTypes: c.request.elementTypes,
  });
  return createLafeaArtifactRecord({
    stageId: STAGE,
    kind: 'EXECUTION',
    status: 'CURRENT',
    artifactHash: hash,
    parentHashes: {
      canonicalModelHash: c.request.canonicalModelHash,
      meshHash: c.meshEvidence.artifactHash,
      physicalLoadCaseHash,
      solverProfileHash,
    },
    qualification: 'PASS',
    producerRef: PRODUCER,
    diagnostics: [],
  });
}
function recoveryRecord(c, hash, executionHash) {
  const recoveryProfileHash = canonicalLafeaSha256({
    schema: 'lafea-nb-t6h-recovery-profile/v1',
    recoveryLayer: 'INTEGRATION_POINT',
    elementTypes: c.request.elementTypes,
  });
  return createLafeaArtifactRecord({
    stageId: STAGE,
    kind: 'RECOVERY',
    status: 'CURRENT',
    artifactHash: hash,
    parentHashes: {
      executionHash,
      meshHash: c.meshEvidence.artifactHash,
      recoveryProfileHash,
    },
    qualification: 'PASS',
    producerRef: PRODUCER,
    diagnostics: [],
  });
}
function register(lifecycle, record) {
  return registerLafeaArtifact(
    lifecycle, record,
    `NB-T6H-${record.kind}-${record.artifactHash.slice(7, 23).toUpperCase()}`,
  );
}
function receiptId(c) {
  const digest = canonicalLafeaSha256({ requestHash: c.request.semanticHash,
    callerMeshBindingHash: c.callerMeshBinding.semanticHash,
    sourceHash: c.sourceAuthority.sourceHash, meshHash: c.meshEvidence.meshHash });
  return `NB-T6H-${c.request.templateId}-${digest.slice(7, 31).toUpperCase()}`;
}
function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new TypeError(`${label} exact-key contract mismatch.`);
  }
}
function requireValid(validation, message) { if (!validation.ok) throw err('LAFEA_NB_T6H_VALIDATION_FAILED', `${message}: ${validation.errors.join(' ')}`); }
function err(codeValue, message = codeValue) { const error = new TypeError(message); error.code = codeValue; return error; }
function code(error, fallback) { return typeof error?.code === 'string' ? error.code : fallback; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
