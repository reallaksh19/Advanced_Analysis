/**
 * B7D bounded controller for C2D-LUG-PINHOLE -> LAFEA.3.
 *
 * The controller revalidates B1/B2/B7A/B7B/B7C authority, issues one exact
 * source authority, executes three or four governed T6 meshes through the
 * retained public stage route, retains integration-point recovery and
 * registers the stage-correct lifecycle. It does not expose a UI callback,
 * project stress, assess code, authorize shell work, qualify release or
 * authorize general T7D.
 */
import {
  createControlledContinuumExecutionReceipt,
  createControlledContinuumLevelEvidence,
  validateControlledContinuumExecutionRequest,
} from '../core/lafea-application-templates/controlled-continuum-pilot-contract.js';
import {
  validateLafeaLugPinholeMappingPackage,
} from '../core/lafea-application-templates/continuum-application-mapping-evidence.js';
import {
  validateLafeaContinuumBenchmarkQualification,
} from '../core/lafea-application-templates/continuum-benchmark-convergence.js';
import {
  validateTemplateReleaseRecordV2,
} from '../core/lafea-application-templates/release-record-v2.js';
import {
  evaluateTemplateTargetCompatibility,
  validateTemplateTargetCompatibilityReceipt,
} from '../core/lafea-application-templates/target-compatibility.js';
import {
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  createLafeaAnalysisMeshEvidence,
  registerLafeaAnalysisMeshEvidence,
} from './lafea-analysis-mesh-evidence.js';
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { lafeaDocumentDigest } from './lafea-edit-command.js';
import {
  createLafeaArtifactRecord,
  createLafeaLifecycle,
  lafeaLifecycleReadiness,
  registerLafeaArtifact,
} from './lafea-lifecycle.js';
import { issueLafeaSourceAuthority } from './lafea-source-authority.js';
import {
  createCurrentLafeaTargetAuthoritySnapshot,
} from './lafea-target-compatibility-authority.js';
import {
  executeControlledContinuumStageRoute,
  normalizeControlledContinuumStageSource,
  reconstructControlledContinuumResultHashes,
} from './lafea-controlled-continuum-stage-route.js';

export const LAFEA_CONTROLLED_CONTINUUM_CONTROLLER_RESULT_SCHEMA =
  'lafea-controlled-continuum-controller-result/v1';
export const LAFEA_CONTROLLED_CONTINUUM_CONTROLLER_REVISION = 'B7D.1';

const STAGE_ID = 'LAFEA.3';
const TEMPLATE_ID = 'C2D-LUG-PINHOLE';
const PILOT_ID = 'C2D-LUG-PINHOLE->LAFEA.3/B7C';
const PRODUCER_REF = 'B7D/C2D-LUG-PINHOLE/LAFEA.3/B7D.1';
const SUPPORTED_LEVEL_COUNTS = Object.freeze(new Set([3, 4]));
const INPUT_KEYS = Object.freeze([
  'request', 'releaseRecord', 'compatibilityReceipt', 'mappingPackage',
  'benchmarkQualification', 'document', 'levels', 'convergenceRequest',
]);
const LEVEL_INPUT_KEYS = Object.freeze(['ordinal', 'document', 'meshEvidence']);
const CONVERGENCE_REQUEST_KEYS = Object.freeze([
  'quantityId', 'units', 'tolerance', 'loadCaseId', 'component', 'reducer',
]);
const COMPONENTS = Object.freeze([
  'SIGMA_X', 'SIGMA_Y', 'SIGMA_Z', 'TAU_XY', 'VON_MISES',
  'PRINCIPAL_MAXIMUM', 'PRINCIPAL_MINIMUM',
]);

export function executeControlledLafeaContinuumPilot(options) {
  exactKeys(options, INPUT_KEYS, 'Controlled continuum controller options');
  requirePlainRecord(options.document, 'document');
  requireValid(
    validateControlledContinuumExecutionRequest(options.request),
    'LAFEA_B7D_REQUEST_INVALID',
  );
  requireValid(
    validateTemplateReleaseRecordV2(options.releaseRecord),
    'LAFEA_B7D_RELEASE_RECORD_INVALID',
  );
  requireValid(
    validateTemplateTargetCompatibilityReceipt(options.compatibilityReceipt),
    'LAFEA_B7D_COMPATIBILITY_RECEIPT_INVALID',
  );
  requireValid(
    validateLafeaLugPinholeMappingPackage(options.mappingPackage),
    'LAFEA_B7D_MAPPING_PACKAGE_INVALID',
  );
  requireValid(
    validateLafeaContinuumBenchmarkQualification(
      options.benchmarkQualification,
    ),
    'LAFEA_B7D_BENCHMARK_QUALIFICATION_INVALID',
  );
  const levels = normalizeControllerLevels(options.levels);
  const convergenceRequest = normalizeConvergenceRequest(
    options.convergenceRequest,
  );
  const context = createContext(options, levels, convergenceRequest);

  try {
    assertBoundedAuthority(context);
    assertCurrentCompatibility(context);
    assertMappingAndBenchmarkAuthority(context);
    normalizeAndVerifyImportedSource(context);
    issueExactSourceAuthority(context);
    assertIssuedSourceParents(context);
    createBaseLifecycle(context);
    executeAllLevels(context);
    createPilotReceipt(context);
    registerConvergenceWhenAccepted(context);
    return controllerResult(context, acceptedOrBlocked(context));
  } catch (error) {
    context.diagnostics.push(errorCode(error, 'LAFEA_B7D_CONTROLLER_BLOCKED'));
    return controllerResult(context, 'BLOCKED');
  }
}

function createContext(options, levels, convergenceRequest) {
  const request = options.request;
  const releaseRecord = options.releaseRecord;
  const snapshot = createCurrentLafeaTargetAuthoritySnapshot(STAGE_ID);
  const currentCompatibilityReceipt = evaluateTemplateTargetCompatibility(
    releaseRecord,
    snapshot,
  );
  return {
    request,
    releaseRecord,
    providedCompatibilityReceipt: options.compatibilityReceipt,
    mappingPackage: options.mappingPackage,
    benchmarkQualification: options.benchmarkQualification,
    document: structuredClone(options.document),
    levels,
    convergenceRequest,
    snapshot,
    currentCompatibilityReceipt,
    normalizedSource: null,
    sourceAuthority: null,
    sourceAuthorityHash: null,
    lifecycle: null,
    readiness: null,
    levelResults: [],
    receipt: null,
    diagnostics: [],
  };
}

function assertBoundedAuthority(context) {
  const { request, releaseRecord, providedCompatibilityReceipt } = context;
  if (request.pilotId !== PILOT_ID || request.templateId !== TEMPLATE_ID
    || request.stageId !== STAGE_ID) {
    throw controllerError('LAFEA_B7D_PILOT_IDENTITY_INVALID');
  }
  if (releaseRecord.template.templateId !== TEMPLATE_ID
    || releaseRecord.targetStage.stageId !== STAGE_ID) {
    throw controllerError('LAFEA_B7D_RELEASE_TARGET_INVALID');
  }
  if (releaseRecord.releaseState.authorityState !== 'ENGINE_EXECUTABLE'
    || releaseRecord.releaseState.validity !== 'CURRENT'
    || releaseRecord.releaseState.releaseQualified) {
    throw controllerError('LAFEA_B7D_RELEASE_NOT_ENGINE_EXECUTABLE');
  }
  if (releaseRecord.meshAuthority.applicability !== 'REQUIRED'
    || releaseRecord.recoveryAuthority.applicability !== 'REQUIRED') {
    throw controllerError('LAFEA_B7D_FEA_AUTHORITY_APPLICABILITY_INVALID');
  }
  const checks = [
    [request.releaseRecordHash, releaseRecord.semanticHash,
      'LAFEA_B7D_RELEASE_HASH_MISMATCH'],
    [request.compatibilityReceiptHash, providedCompatibilityReceipt.semanticHash,
      'LAFEA_B7D_REQUEST_COMPATIBILITY_HASH_MISMATCH'],
    [request.releaseAuthorityState, releaseRecord.releaseState.authorityState,
      'LAFEA_B7D_RELEASE_AUTHORITY_STATE_MISMATCH'],
    [request.releaseValidity, releaseRecord.releaseState.validity,
      'LAFEA_B7D_RELEASE_VALIDITY_MISMATCH'],
  ];
  for (const [actual, expected, code] of checks) {
    if (actual !== expected) throw controllerError(code);
  }
  if (providedCompatibilityReceipt.status !== 'CURRENT'
    || request.compatibilityStatus !== 'CURRENT') {
    throw controllerError('LAFEA_B7D_PROVIDED_COMPATIBILITY_NOT_CURRENT');
  }
}

function assertCurrentCompatibility(context) {
  const { currentCompatibilityReceipt, providedCompatibilityReceipt,
    releaseRecord, snapshot } = context;
  if (currentCompatibilityReceipt.status !== 'CURRENT') {
    throw controllerError(`LAFEA_B7D_TARGET_${currentCompatibilityReceipt.status}`);
  }
  if (currentCompatibilityReceipt.semanticHash
    !== providedCompatibilityReceipt.semanticHash) {
    throw controllerError('LAFEA_B7D_TARGET_COMPATIBILITY_CHANGED');
  }
  const checks = [
    [releaseRecord.targetStage.stageEntryHash,
      snapshot.targetStage.registryEntryHash,
      'LAFEA_B7D_STAGE_REGISTRY_CHANGED'],
    [releaseRecord.compositionRoot.compositionRootHash,
      snapshot.compositionRoot.compositionRootHash,
      'LAFEA_B7D_COMPOSITION_ROOT_CHANGED'],
    [releaseRecord.lifecycleProfile.profileHash,
      snapshot.lifecycleProfile.profileHash,
      'LAFEA_B7D_LIFECYCLE_PROFILE_CHANGED'],
  ];
  for (const [actual, expected, code] of checks) {
    if (actual !== expected) throw controllerError(code);
  }
}

function assertMappingAndBenchmarkAuthority(context) {
  const { request, mappingPackage, benchmarkQualification } = context;
  if (mappingPackage.templateId !== TEMPLATE_ID
    || mappingPackage.stageId !== STAGE_ID
    || mappingPackage.status !== 'MAPPING_EVIDENCE_QUALIFIED'
    || mappingPackage.boundBinding.status !== 'BOUND'
    || request.mappingStatus !== mappingPackage.status
    || request.boundBindingStatus !== mappingPackage.boundBinding.status) {
    throw controllerError('LAFEA_B7D_MAPPING_NOT_QUALIFIED');
  }
  if (benchmarkQualification.templateId !== TEMPLATE_ID
    || benchmarkQualification.stageId !== STAGE_ID
    || benchmarkQualification.status !== 'BENCHMARK_EVIDENCE_QUALIFIED'
    || request.benchmarkStatus !== benchmarkQualification.status) {
    throw controllerError('LAFEA_B7D_BENCHMARK_NOT_QUALIFIED');
  }
  const checks = [
    [request.mappingPackageHash, mappingPackage.semanticHash,
      'LAFEA_B7D_MAPPING_HASH_MISMATCH'],
    [request.boundBindingHash, mappingPackage.boundBinding.semanticHash,
      'LAFEA_B7D_BOUND_BINDING_HASH_MISMATCH'],
    [request.benchmarkQualificationHash, benchmarkQualification.semanticHash,
      'LAFEA_B7D_BENCHMARK_HASH_MISMATCH'],
    [benchmarkQualification.mappingPackageHash, mappingPackage.semanticHash,
      'LAFEA_B7D_BENCHMARK_MAPPING_PARENT_STALE'],
    [request.canonicalModelHash, mappingPackage.canonicalModelHash,
      'LAFEA_B7D_CANONICAL_MODEL_PARENT_STALE'],
    [request.analysisGeometryHash, mappingPackage.analysisGeometryHash,
      'LAFEA_B7D_ANALYSIS_GEOMETRY_PARENT_STALE'],
    [request.convergenceProfileHash,
      benchmarkQualification.lifecycleParentProposal.convergenceProfileHash,
      'LAFEA_B7D_CONVERGENCE_PROFILE_PARENT_STALE'],
  ];
  for (const [actual, expected, code] of checks) {
    if (actual !== expected) throw controllerError(code);
  }
  const first = request.meshLevels[0];
  if (mappingPackage.meshHash !== first.meshHash
    || mappingPackage.meshProfileHash !== first.meshProfileHash) {
    throw controllerError('LAFEA_B7D_BOUND_LEVEL_ONE_MESH_STALE');
  }
}

function normalizeAndVerifyImportedSource(context) {
  const revision = lafeaDocumentDigest(context.document);
  if (revision !== context.request.importedDocumentRevisionDigest
    || revision !== context.request.sourceAuthorityRequest
      .expectedDocumentRevisionDigest) {
    throw controllerError('LAFEA_B7D_IMPORTED_DOCUMENT_REVISION_STALE');
  }
  const source = normalizeControlledContinuumStageSource(context.document);
  if (lafeaDocumentDigest(source) !== revision) {
    throw controllerError('LAFEA_B7D_NORMALIZED_SOURCE_REVISION_CHANGED');
  }
  if (lafeaDocumentDigest(context.levels[0].document) !== revision) {
    throw controllerError('LAFEA_B7D_LEVEL_ONE_SOURCE_REVISION_MISMATCH');
  }
  context.normalizedSource = source;
}

function issueExactSourceAuthority(context) {
  const authority = issueLafeaSourceAuthority(
    STAGE_ID,
    context.normalizedSource,
    context.request.sourceAuthorityRequest.originRef,
  );
  if (authority.documentRevisionDigest
    !== context.request.importedDocumentRevisionDigest) {
    throw controllerError('LAFEA_B7D_SOURCE_AUTHORITY_REVISION_MISMATCH');
  }
  context.sourceAuthority = authority;
  context.sourceAuthorityHash = canonicalLafeaSha256(authority);
}

function assertIssuedSourceParents(context) {
  const { request, mappingPackage, sourceAuthority, sourceAuthorityHash } =
    context;
  const stageSourceHash = canonicalLafeaSha256({
    schema: 'lafea-b7a-stage-source-hash-input/v1',
    stageSource: context.normalizedSource,
  });
  const checks = [
    [mappingPackage.stageSourceHash, stageSourceHash,
      'LAFEA_B7D_MAPPING_STAGE_SOURCE_STALE'],
    [mappingPackage.sourceHash, sourceAuthority.sourceHash,
      'LAFEA_B7D_MAPPING_SOURCE_HASH_STALE'],
    [mappingPackage.boundBinding.sourceHash, sourceAuthority.sourceHash,
      'LAFEA_B7D_BINDING_SOURCE_HASH_STALE'],
    [mappingPackage.boundBinding.sourceAuthorityHash, sourceAuthorityHash,
      'LAFEA_B7D_BINDING_SOURCE_AUTHORITY_STALE'],
  ];
  for (const [actual, expected, code] of checks) {
    if (actual !== expected) throw controllerError(code);
  }
  if (request.sourceAuthorityRequest.requestedRole
    !== 'AUTHORITATIVE_EDITABLE_STAGE_SOURCE') {
    throw controllerError('LAFEA_B7D_SOURCE_AUTHORITY_ROLE_INVALID');
  }
}

function createBaseLifecycle(context) {
  let lifecycle = createLafeaLifecycle(
    STAGE_ID,
    context.sourceAuthority.sourceHash,
  );
  const canonicalModel = createLafeaArtifactRecord({
    stageId: STAGE_ID,
    kind: 'CANONICAL_MODEL',
    status: 'CURRENT',
    artifactHash: context.request.canonicalModelHash,
    parentHashes: { sourceHash: context.sourceAuthority.sourceHash },
    qualification: 'PASS',
    producerRef: PRODUCER_REF,
    diagnostics: [],
  });
  lifecycle = registerLafeaArtifact(
    lifecycle,
    canonicalModel,
    registrationId('CANONICAL-MODEL', canonicalModel.artifactHash),
  );
  const geometry = createLafeaArtifactRecord({
    stageId: STAGE_ID,
    kind: 'ANALYSIS_GEOMETRY',
    status: 'CURRENT',
    artifactHash: context.request.analysisGeometryHash,
    parentHashes: {
      sourceHash: context.sourceAuthority.sourceHash,
      canonicalModelHash: context.request.canonicalModelHash,
    },
    qualification: 'PASS',
    producerRef: PRODUCER_REF,
    diagnostics: [],
  });
  lifecycle = registerLafeaArtifact(
    lifecycle,
    geometry,
    registrationId('ANALYSIS-GEOMETRY', geometry.artifactHash),
  );
  context.lifecycle = lifecycle;
}

function executeAllLevels(context) {
  let previousElementCount = 0;
  for (const input of context.levels) {
    let levelResult;
    try {
      const evidence = reconstructMeshEvidence(input.meshEvidence);
      assertLevelParents(context, input, evidence);
      const levelDocument = normalizeControlledContinuumStageSource(
        input.document,
      );
      assertControlledPhysicalProblem(context.normalizedSource, levelDocument);
      assertStageSourceMatchesMesh(levelDocument, evidence);
      if (evidence.mesh.elements.length <= previousElementCount) {
        throw controllerError('LAFEA_B7D_MESH_REFINEMENT_NOT_INCREASING');
      }
      previousElementCount = evidence.mesh.elements.length;
      context.lifecycle = registerLafeaAnalysisMeshEvidence(
        context.lifecycle,
        evidence,
      );
      levelResult = executeAcceptedLevel(
        context,
        input,
        levelDocument,
        evidence,
      );
    } catch (error) {
      levelResult = blockedLevelResult(context, input, error);
    }
    context.levelResults.push(levelResult);
  }
}

function executeAcceptedLevel(context, input, levelDocument, meshEvidence) {
  const execution = executeControlledContinuumStageRoute(levelDocument);
  if (execution.status !== 'QUALIFIED') {
    const diagnostics = (execution.diagnostics ?? [])
      .map((row) => row?.code)
      .filter((row) => typeof row === 'string');
    throw controllerError(
      diagnostics[0] ?? 'LAFEA_B7D_STAGE_CALCULATION_NOT_ACCEPTED',
    );
  }
  const result = execution.result;
  if (result?.schema !== 'local-continuum-result/v1'
    || result?.qualification?.state !== 'ACCEPTED') {
    throw controllerError('LAFEA_B7D_RESULT_CONTRACT_NOT_ACCEPTED');
  }
  assertResultMeshMatchesEvidence(result, meshEvidence);
  const reconstructed = reconstructControlledContinuumResultHashes(result);
  if (JSON.stringify(reconstructed) !== JSON.stringify(result.semanticHashes)) {
    throw controllerError('LAFEA_B7D_RESULT_HASH_RECONSTRUCTION_FAILED');
  }
  const integrationPoints = retainedIntegrationPointRecovery(result);
  const integrationPointResultHash = canonicalLafeaSha256({
    schema: 'lafea-b7d-integration-point-recovery/v1',
    requestHash: context.request.semanticHash,
    ordinal: input.ordinal,
    meshHash: meshEvidence.meshHash,
    loadCases: integrationPoints,
  });
  const resultHash = canonicalLafeaSha256({
    schema: 'lafea-b7d-result-hash-evidence/v1',
    reconstructed,
  });
  const physicalLoadCaseHash = canonicalLafeaSha256({
    schema: 'lafea-b7d-physical-load-cases/v1',
    loadCases: execution.canonicalInput.loadCases,
    resultRequests: execution.canonicalInput.resultRequests,
  });
  const solverProfileHash = canonicalLafeaSha256({
    schema: 'lafea-b7d-solver-profile/v1',
    enginePackage: context.snapshot.targetStage.enginePackage,
    stageAuthority: context.snapshot.targetStage.stageAuthority,
    qualificationProfile: execution.canonicalInput.qualificationProfile,
  });
  const canonicalInputHash = canonicalLafeaSha256({
    schema: 'lafea-b7d-canonical-input/v1',
    canonicalInput: execution.canonicalInput,
  });
  const executionHash = canonicalLafeaSha256({
    schema: 'lafea-b7d-execution-evidence/v1',
    requestHash: context.request.semanticHash,
    ordinal: input.ordinal,
    sourceHash: context.sourceAuthority.sourceHash,
    canonicalModelHash: context.request.canonicalModelHash,
    canonicalInputHash,
    meshArtifactHash: meshEvidence.artifactHash,
    physicalLoadCaseHash,
    solverProfileHash,
    resultHash,
  });
  const executionRecord = createLafeaArtifactRecord({
    stageId: STAGE_ID,
    kind: 'EXECUTION',
    status: 'CURRENT',
    artifactHash: executionHash,
    parentHashes: {
      canonicalModelHash: context.request.canonicalModelHash,
      meshHash: meshEvidence.artifactHash,
      physicalLoadCaseHash,
      solverProfileHash,
    },
    qualification: 'PASS',
    producerRef: PRODUCER_REF,
    diagnostics: [],
  });
  context.lifecycle = registerLafeaArtifact(
    context.lifecycle,
    executionRecord,
    registrationId(`LEVEL-${input.ordinal}-EXECUTION`, executionHash),
  );
  const recoveryHash = canonicalLafeaSha256({
    schema: 'lafea-b7d-recovery-evidence/v1',
    requestHash: context.request.semanticHash,
    ordinal: input.ordinal,
    executionHash,
    meshArtifactHash: meshEvidence.artifactHash,
    recoveryProfileHash: context.request.recoveryProfileHash,
    integrationPointResultHash,
  });
  const recoveryRecord = createLafeaArtifactRecord({
    stageId: STAGE_ID,
    kind: 'RECOVERY',
    status: 'CURRENT',
    artifactHash: recoveryHash,
    parentHashes: {
      executionHash,
      meshHash: meshEvidence.artifactHash,
      recoveryProfileHash: context.request.recoveryProfileHash,
    },
    qualification: 'PASS',
    producerRef: PRODUCER_REF,
    diagnostics: [],
  });
  context.lifecycle = registerLafeaArtifact(
    context.lifecycle,
    recoveryRecord,
    registrationId(`LEVEL-${input.ordinal}-RECOVERY`, recoveryHash),
  );
  const observedQuantity = reduceIntegrationPointQuantity(
    integrationPoints,
    context.convergenceRequest,
  );
  const levelEvidence = createControlledContinuumLevelEvidence({
    requestHash: context.request.semanticHash,
    ordinal: input.ordinal,
    meshHash: meshEvidence.meshHash,
    sourceAuthorityHash: context.sourceAuthorityHash,
    exactSourceHash: context.sourceAuthority.sourceHash,
    importedDocumentRevisionDigest:
      context.request.importedDocumentRevisionDigest,
    executionHash,
    resultHash,
    recoveryHash,
    resultSchema: result.schema,
    calculationAccepted: true,
    recoveryAuthority: 'RETAINED_INTEGRATION_POINT_VALUES',
    integrationPointResultHash,
    projectedDisplayHash: null,
    projectedDisplayRole: 'NOT_PRODUCED',
    status: 'ACCEPTED',
    diagnostics: [],
  });
  return deepFreeze({
    ordinal: input.ordinal,
    meshEvidence,
    execution,
    reconstructedResultHashes: reconstructed,
    integrationPointResultHash,
    observedQuantity,
    executionRecord,
    recoveryRecord,
    levelEvidence,
  });
}

function blockedLevelResult(context, input, error) {
  const code = errorCode(error, 'LAFEA_B7D_LEVEL_BLOCKED');
  const status = failedLevelStatus(code);
  context.diagnostics.push(`LEVEL_${input.ordinal}:${code}`);
  const levelEvidence = createControlledContinuumLevelEvidence({
    requestHash: context.request.semanticHash,
    ordinal: input.ordinal,
    meshHash: context.request.meshLevels[input.ordinal - 1].meshHash,
    sourceAuthorityHash: context.sourceAuthorityHash,
    exactSourceHash: context.sourceAuthority.sourceHash,
    importedDocumentRevisionDigest:
      context.request.importedDocumentRevisionDigest,
    executionHash: null,
    resultHash: null,
    recoveryHash: null,
    resultSchema: 'local-continuum-result/v1',
    calculationAccepted: false,
    recoveryAuthority: 'NOT_PRODUCED',
    integrationPointResultHash: null,
    projectedDisplayHash: null,
    projectedDisplayRole: 'NOT_PRODUCED',
    status,
    diagnostics: [code],
  });
  return deepFreeze({
    ordinal: input.ordinal,
    meshEvidence: null,
    execution: null,
    reconstructedResultHashes: null,
    integrationPointResultHash: null,
    observedQuantity: null,
    executionRecord: null,
    recoveryRecord: null,
    levelEvidence,
  });
}

function createPilotReceipt(context) {
  const accepted = context.levelResults.every(
    (row) => row.levelEvidence.status === 'ACCEPTED',
  );
  const pilotConvergence = accepted
    ? {
        quantityId: context.convergenceRequest.quantityId,
        units: context.convergenceRequest.units,
        tolerance: context.convergenceRequest.tolerance,
        levels: context.levelResults.map((row) => ({
          ordinal: row.ordinal,
          meshHash: row.levelEvidence.meshHash,
          recoveryHash: row.levelEvidence.recoveryHash,
          observedQuantity: row.observedQuantity,
        })),
      }
    : null;
  context.receipt = createControlledContinuumExecutionReceipt({
    receiptId: receiptId(context),
    request: context.request,
    currentDocumentRevisionDigest: lafeaDocumentDigest(context.document),
    sourceAuthorityHash: context.sourceAuthorityHash,
    exactSourceHash: context.sourceAuthority.sourceHash,
    levelEvidence: context.levelResults.map((row) => row.levelEvidence),
    pilotConvergence,
    diagnostics: [...context.diagnostics],
  });
}

function registerConvergenceWhenAccepted(context) {
  if (context.receipt.status !== 'ACCEPTED'
    || !context.receipt.lifecycleParents.registrationAuthorized) return;
  const convergence = createLafeaArtifactRecord({
    stageId: STAGE_ID,
    kind: 'CONVERGENCE',
    status: 'CURRENT',
    artifactHash: context.receipt.pilotConvergence.semanticHash,
    parentHashes: {
      recoveryHash: context.receipt.lifecycleParents.recoveryHash,
      recoverySetHash: context.receipt.lifecycleParents.recoverySetHash,
      convergenceProfileHash:
        context.receipt.lifecycleParents.convergenceProfileHash,
    },
    qualification: 'PASS',
    producerRef: PRODUCER_REF,
    diagnostics: [],
  });
  context.lifecycle = registerLafeaArtifact(
    context.lifecycle,
    convergence,
    registrationId('CONVERGENCE', convergence.artifactHash),
  );
  context.readiness = lafeaLifecycleReadiness(context.lifecycle);
}

function acceptedOrBlocked(context) {
  context.readiness ??= context.lifecycle
    ? lafeaLifecycleReadiness(context.lifecycle) : null;
  if (context.receipt?.status !== 'ACCEPTED') return 'BLOCKED';
  if (context.readiness?.resultReady !== true
    || context.readiness?.convergenceReady !== true
    || context.readiness?.codeReady !== false) {
    context.diagnostics.push('LAFEA_B7D_LIFECYCLE_READINESS_MISMATCH');
    return 'BLOCKED';
  }
  return 'ACCEPTED';
}

function controllerResult(context, status) {
  const diagnostics = [...new Set([
    ...context.diagnostics,
    ...(context.receipt?.diagnostics ?? []),
  ])].sort();
  return deepFreeze({
    schema: LAFEA_CONTROLLED_CONTINUUM_CONTROLLER_RESULT_SCHEMA,
    controllerRevision: LAFEA_CONTROLLED_CONTINUUM_CONTROLLER_REVISION,
    pilotId: PILOT_ID,
    status,
    accepted: status === 'ACCEPTED',
    request: context.request,
    currentCompatibilityReceipt: context.currentCompatibilityReceipt,
    sourceAuthority: context.sourceAuthority,
    levelResults: context.levelResults,
    lifecycle: context.lifecycle,
    readiness: context.readiness,
    receipt: context.receipt,
    diagnostics,
    authority: {
      boundedPilotExecution: status === 'ACCEPTED',
      generalT7dAuthorized: false,
      shellAuthorized: false,
      assessmentReady: false,
      codeReady: false,
      releaseQualified: false,
    },
  });
}

function normalizeControllerLevels(value) {
  if (!Array.isArray(value) || !SUPPORTED_LEVEL_COUNTS.has(value.length)) {
    throw new TypeError(
      'Controlled continuum controller requires three or four levels.',
    );
  }
  const levels = [...value].sort((left, right) => left.ordinal - right.ordinal)
    .map((row) => {
      exactKeys(row, LEVEL_INPUT_KEYS, 'Controlled continuum level input');
      if (!Number.isInteger(row.ordinal)
        || row.ordinal < 1
        || row.ordinal > value.length) {
        throw new TypeError('Controlled continuum level ordinal is invalid.');
      }
      requirePlainRecord(row.document, 'level.document');
      requirePlainRecord(row.meshEvidence, 'level.meshEvidence');
      return deepFreeze({
        ordinal: row.ordinal,
        document: structuredClone(row.document),
        meshEvidence: row.meshEvidence,
      });
    });
  if (levels.some((row, index) => row.ordinal !== index + 1)) {
    throw new TypeError(
      'Controlled continuum levels must use contiguous ordinals.',
    );
  }
  return levels;
}

function normalizeConvergenceRequest(value) {
  exactKeys(value, CONVERGENCE_REQUEST_KEYS, 'convergenceRequest');
  requireText(value.quantityId, 'convergenceRequest.quantityId');
  requireText(value.units, 'convergenceRequest.units');
  positive(value.tolerance, 'convergenceRequest.tolerance');
  requireText(value.loadCaseId, 'convergenceRequest.loadCaseId');
  if (!COMPONENTS.includes(value.component)) {
    throw new TypeError('Controlled continuum convergence component is invalid.');
  }
  if (value.reducer !== 'MAXIMUM_SIGNED') {
    throw new TypeError('Controlled continuum convergence reducer is invalid.');
  }
  return deepFreeze({ ...value });
}

function reconstructMeshEvidence(value) {
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
  if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
    throw controllerError('LAFEA_B7D_MESH_EVIDENCE_TAMPERED');
  }
  if (rebuilt.stageId !== STAGE_ID || rebuilt.status !== 'CURRENT'
    || rebuilt.qualification !== 'PASS'
    || rebuilt.mesh.elements.some((row) => row.elementType !== 'T6')) {
    throw controllerError('LAFEA_B7D_CURRENT_T6_MESH_REQUIRED');
  }
  return rebuilt;
}

function assertLevelParents(context, input, evidence) {
  const expected = context.request.meshLevels[input.ordinal - 1];
  const checks = [
    [evidence.sourceHash, context.sourceAuthority.sourceHash,
      'LAFEA_B7D_LEVEL_SOURCE_PARENT_STALE'],
    [evidence.canonicalModelHash, context.request.canonicalModelHash,
      'LAFEA_B7D_LEVEL_MODEL_PARENT_STALE'],
    [evidence.analysisGeometryHash, context.request.analysisGeometryHash,
      'LAFEA_B7D_LEVEL_GEOMETRY_PARENT_STALE'],
    [evidence.meshProfileHash, expected.meshProfileHash,
      'LAFEA_B7D_LEVEL_MESH_PROFILE_STALE'],
    [evidence.meshHash, expected.meshHash,
      'LAFEA_B7D_LEVEL_MESH_HASH_STALE'],
  ];
  for (const [actual, wanted, code] of checks) {
    if (actual !== wanted) throw controllerError(code);
  }
}

function assertStageSourceMatchesMesh(document, evidence) {
  if (document.schema !== 'local-continuum-model/v1'
    || document.formulation !== 'PLANE_STRESS'
    || !Array.isArray(document.nodes) || !Array.isArray(document.elements)
    || document.elements.some((row) => row.elementType !== 'T6')) {
    throw controllerError('LAFEA_B7D_LEVEL_STAGE_SOURCE_INVALID');
  }
  const nodes = new Map(document.nodes.map((row) => [row.nodeId, row]));
  if (nodes.size !== evidence.mesh.nodes.length) {
    throw controllerError('LAFEA_B7D_LEVEL_NODE_SET_MISMATCH');
  }
  for (const node of evidence.mesh.nodes) {
    const source = nodes.get(node.nodeId);
    if (!source || source.x !== node.x || source.y !== node.y || node.z !== 0) {
      throw controllerError('LAFEA_B7D_LEVEL_NODE_COORDINATE_MISMATCH');
    }
  }
  const elements = new Map(document.elements.map((row) => [row.elementId, row]));
  if (elements.size !== evidence.mesh.elements.length) {
    throw controllerError('LAFEA_B7D_LEVEL_ELEMENT_SET_MISMATCH');
  }
  for (const element of evidence.mesh.elements) {
    const source = elements.get(element.elementId);
    if (!source
      || JSON.stringify(source.nodeIds) !== JSON.stringify(element.nodeIds)) {
      throw controllerError('LAFEA_B7D_LEVEL_CONNECTIVITY_MISMATCH');
    }
  }
}

function assertControlledPhysicalProblem(baseDocument, levelDocument) {
  const base = physicalProblemBasis(baseDocument);
  const current = physicalProblemBasis(levelDocument);
  if (JSON.stringify(base) !== JSON.stringify(current)) {
    throw controllerError('LAFEA_B7D_LEVEL_PHYSICAL_PROBLEM_CHANGED');
  }
}

function physicalProblemBasis(document) {
  return {
    schema: document.schema,
    modelIdentity: document.modelIdentity,
    modelVersion: document.modelVersion,
    sourceAncestry: document.sourceAncestry,
    units: document.units,
    formulation: document.formulation,
    materials: document.materials,
    elementTypePolicy: document.elementTypePolicy,
    loadCaseIds: Array.isArray(document.loadCases)
      ? document.loadCases.map((row) => row.loadCaseId).sort() : [],
    requestedLoadCaseIds: Array.isArray(document.resultRequests?.loadCaseIds)
      ? [...document.resultRequests.loadCaseIds].sort() : [],
    qualificationProfile: document.qualificationProfile,
    limitations: document.limitations,
  };
}

function assertResultMeshMatchesEvidence(result, meshEvidence) {
  const retained = result.meshEvidence?.elementEvidence;
  if (!Array.isArray(retained)
    || retained.length !== meshEvidence.mesh.elements.length) {
    throw controllerError('LAFEA_B7D_RESULT_MESH_EVIDENCE_MISMATCH');
  }
  const expected = new Map(
    meshEvidence.mesh.elements.map((row) => [row.elementId, row.nodeIds]),
  );
  for (const row of retained) {
    const nodeIds = expected.get(row.elementId);
    if (!nodeIds || JSON.stringify(row.nodeIds) !== JSON.stringify(nodeIds)) {
      throw controllerError('LAFEA_B7D_RESULT_MESH_CONNECTIVITY_MISMATCH');
    }
  }
}

function failedLevelStatus(code) {
  return /(?:NUMERICAL|CALCULATION|SOLVER|SINGULAR|PIVOT)/u.test(code)
    ? 'FAILED' : 'BLOCKED';
}

function retainedIntegrationPointRecovery(result) {
  if (!Array.isArray(result.loadCaseResults) || !result.loadCaseResults.length) {
    throw controllerError('LAFEA_B7D_LOAD_CASE_RESULTS_REQUIRED');
  }
  return result.loadCaseResults.map((loadCase) => {
    if (!Array.isArray(loadCase.elementResults)
      || !loadCase.elementResults.length) {
      throw controllerError('LAFEA_B7D_ELEMENT_RESULTS_REQUIRED');
    }
    return {
      loadCaseId: loadCase.loadCaseId,
      elements: loadCase.elementResults.map((element) => {
        if (element.elementType !== 'T6'
          || element.recoveryLayer !== 'INTEGRATION_POINT'
          || !Array.isArray(element.gaussPointResults)
          || !element.gaussPointResults.length) {
          throw controllerError(
            'LAFEA_B7D_INTEGRATION_POINT_RECOVERY_REQUIRED',
          );
        }
        return {
          elementId: element.elementId,
          elementType: element.elementType,
          recoveryLayer: element.recoveryLayer,
          gaussPointResults: element.gaussPointResults,
        };
      }),
    };
  });
}

function reduceIntegrationPointQuantity(loadCases, request) {
  const loadCase = loadCases.find((row) => row.loadCaseId === request.loadCaseId);
  if (!loadCase) {
    throw controllerError('LAFEA_B7D_CONVERGENCE_LOAD_CASE_MISSING');
  }
  const values = loadCase.elements.flatMap((element) =>
    element.gaussPointResults.map((point) =>
      pointComponent(point, request.component)));
  if (!values.length || values.some((value) => !Number.isFinite(value))) {
    throw controllerError('LAFEA_B7D_CONVERGENCE_QUANTITY_INVALID');
  }
  return Math.max(...values);
}

function pointComponent(point, component) {
  if (component === 'SIGMA_X') return point.stress?.sigmaX;
  if (component === 'SIGMA_Y') return point.stress?.sigmaY;
  if (component === 'SIGMA_Z') return point.stress?.sigmaZ;
  if (component === 'TAU_XY') return point.stress?.tauXY;
  if (component === 'VON_MISES') return point.vonMises;
  if (component === 'PRINCIPAL_MAXIMUM') return point.principalMaximum;
  return point.principalMinimum;
}

function receiptId(context) {
  const digest = canonicalLafeaSha256({
    schema: 'lafea-b7d-receipt-id/v1',
    requestHash: context.request.semanticHash,
    sourceHash: context.sourceAuthority?.sourceHash ?? null,
    levelEvidenceHashes: context.levelResults.map(
      (row) => row.levelEvidence.semanticHash,
    ),
  });
  return `B7D-LAFEA-3-${digest.slice(7, 31).toUpperCase()}`;
}

function registrationId(role, artifactHash) {
  return `B7D-LAFEA-3-${role}-${artifactHash.slice(7, 23).toUpperCase()}`;
}

function requireValid(validation, code) {
  if (!validation.ok) {
    throw controllerError(code, `${code}: ${validation.errors.join(' ')}`);
  }
}

function exactKeys(value, expected, label) {
  requirePlainRecord(value, label);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new TypeError(`${label} exact-key contract mismatch.`);
  }
}

function requirePlainRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} is required.`);
  }
}

function positive(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finite number.`);
  }
}

function controllerError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function errorCode(error, fallback) {
  return typeof error?.code === 'string' ? error.code : fallback;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
