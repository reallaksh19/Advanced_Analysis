import { createControlledContinuumExecutionRequest } from '../core/lafea-application-templates/controlled-continuum-pilot-contract.js';
import { validateLafeaContinuumBenchmarkQualification } from '../core/lafea-application-templates/continuum-benchmark-convergence.js';
import { validateLafeaLugPinholeMappingPackage } from '../core/lafea-application-templates/continuum-application-mapping-evidence.js';
import { validateTemplateReleaseRecordV2 } from '../core/lafea-application-templates/release-record-v2.js';
import { validateTemplateTargetCompatibilityReceipt } from '../core/lafea-application-templates/target-compatibility.js';
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { executeControlledLafeaContinuumPilot } from './lafea-controlled-continuum-execution-public.js';
import { lafeaDocumentDigest } from './lafea-edit-command.js';
import {
  LAFEA_LUG_PINHOLE_MAPPING_DECLARATION_SCHEMA,
  createLafeaLugPinholeMappingEvidence,
} from './lafea-lug-pinhole-mapping-evidence.js';
import {
  LAFEA_LUG_PINHOLE_MESH_LADDER_INTAKE_SCHEMA,
  createLafeaLugPinholeMeshLadder,
  lafeaLugPinholeAnalysisGeometryHash,
  validateLafeaLugPinholeMeshLadder,
} from './lafea-lug-pinhole-mesh-ladder.js';
import { issueLafeaSourceAuthority } from './lafea-source-authority.js';
import { bindLafeaContinuumTemplateCallerMesh } from './lafea-template-caller-mesh-binding.js';
import {
  LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA,
  LAFEA_LUG_PINHOLE_EXECUTION_SCHEMA,
  LAFEA_LUG_PINHOLE_FEATURE_PROJECTION_SCHEMA,
  LAFEA_LUG_PINHOLE_PHYSICAL_PROBLEM_PRODUCER_REVISION,
  LAFEA_LUG_PINHOLE_PHYSICAL_PROBLEM_SCHEMA,
  LAFEA_LUG_PINHOLE_PROJECTION_INTAKE_SCHEMA,
  LAFEA_LUG_PINHOLE_PROJECTION_SCHEMA,
  STAGE_ID,
  TEMPLATE_ID,
  batchError,
  canonicalExecutionInput,
  canonicalProjectionInput,
  deepFreeze,
  featureProjectionHash,
  physicalProblemHash,
  pendingMapping,
  projectionSemanticHash,
  requireValid,
} from './lafea-lug-pinhole-physical-problem-contract.js';
import {
  assertDocumentMatchesMesh,
  buildProjectedLevels,
  mappingDeclaration,
} from './lafea-lug-pinhole-stage-projector.js';

export {
  LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA,
  LAFEA_LUG_PINHOLE_EXECUTION_SCHEMA,
  LAFEA_LUG_PINHOLE_FEATURE_PROJECTION_SCHEMA,
  LAFEA_LUG_PINHOLE_PHYSICAL_PROBLEM_PRODUCER_REVISION,
  LAFEA_LUG_PINHOLE_PHYSICAL_PROBLEM_SCHEMA,
  LAFEA_LUG_PINHOLE_PROJECTION_INTAKE_SCHEMA,
  LAFEA_LUG_PINHOLE_PROJECTION_SCHEMA,
};

export function createLafeaLugPinholePhysicalProblemProjection(options) {
  const input = canonicalProjectionInput(options);
  requireValid(validateTemplateReleaseRecordV2(input.releaseRecord),
    'LAFEA_NB_T6C_RELEASE_RECORD_INVALID');
  requireValid(validateTemplateTargetCompatibilityReceipt(input.compatibilityReceipt),
    'LAFEA_NB_T6C_COMPATIBILITY_RECEIPT_INVALID');
  assertReleaseAuthority(input.releaseRecord, input.compatibilityReceipt);

  const built = buildProjectedLevels(input);
  const baseDocument = built[0].document;
  const sourceAuthority = issueLafeaSourceAuthority(
    STAGE_ID,
    baseDocument,
    input.sourceAuthorityOriginRef,
  );
  const sourceAuthorityHash = canonicalLafeaSha256(sourceAuthority);
  const analysisGeometryHash = lafeaLugPinholeAnalysisGeometryHash(input.geometry);
  const ladder = createLafeaLugPinholeMeshLadder({
    schema: LAFEA_LUG_PINHOLE_MESH_LADDER_INTAKE_SCHEMA,
    stageId: STAGE_ID,
    templateId: TEMPLATE_ID,
    sourceHash: sourceAuthority.sourceHash,
    canonicalModelHash: input.canonicalModelHash,
    analysisGeometryHash,
    geometry: input.geometry,
    levels: input.levels,
    producerRef: input.producerRef,
  });
  requireValid(validateLafeaLugPinholeMeshLadder(ladder),
    'LAFEA_NB_T6C_GENERATED_LADDER_INVALID');
  ladder.levels.forEach((level, index) =>
    assertDocumentMatchesMesh(built[index].document, level.meshEvidence));

  const pendingBinding = bindLafeaContinuumTemplateCallerMesh({
    releaseRecord: input.releaseRecord,
    compatibilityReceipt: input.compatibilityReceipt,
    meshEvidence: ladder.levels[0].meshEvidence,
    sourceAuthorityHash,
    materialRegionEvidence: pendingMapping(),
    loadEdgeEvidence: pendingMapping(),
    boundaryEdgeEvidence: pendingMapping(),
  });
  if (pendingBinding.status !== 'MAPPING_EVIDENCE_PENDING') {
    throw batchError('LAFEA_NB_T6C_PENDING_BINDING_STATE_INVALID');
  }
  const mappingPackage = createLafeaLugPinholeMappingEvidence({
    pendingBinding,
    meshEvidence: ladder.levels[0].meshEvidence,
    stageSource: baseDocument,
    applicationEvidence: input.applicationEvidence,
    declaration: mappingDeclaration(
      built[0],
      input.physicalProblem,
      input.featureProjection,
      LAFEA_LUG_PINHOLE_MAPPING_DECLARATION_SCHEMA,
    ),
  });
  if (mappingPackage.status !== 'MAPPING_EVIDENCE_QUALIFIED'
    || mappingPackage.boundBinding.status !== 'BOUND') {
    throw batchError('LAFEA_NB_T6C_MAPPING_NOT_QUALIFIED');
  }

  const levels = deepFreeze(built.map((level, index) => ({
    ordinal: index + 1,
    document: level.document,
    documentRevisionDigest: lafeaDocumentDigest(level.document),
    meshEvidence: ladder.levels[index].meshEvidence,
    loadEdgeNodeIds: level.loadEdgeNodeIds,
    boundaryEdgeNodeIds: level.boundaryEdgeNodeIds,
    loadResultant: level.loadResultant,
  })));
  const problemHash = physicalProblemHash(input.physicalProblem);
  const featureHash = featureProjectionHash(input.featureProjection);
  const projectionHash = projectionSemanticHash({
    releaseRecordHash: input.releaseRecord.semanticHash,
    compatibilityReceiptHash: input.compatibilityReceipt.semanticHash,
    sourceAuthorityHash,
    canonicalModelHash: input.canonicalModelHash,
    analysisGeometryHash,
    ladderHash: ladder.ladderHash,
    mappingPackageHash: mappingPackage.semanticHash,
    physicalProblemHash: problemHash,
    featureProjectionHash: featureHash,
    levels,
  });
  return deepFreeze({
    schema: LAFEA_LUG_PINHOLE_PROJECTION_SCHEMA,
    producerRevision: LAFEA_LUG_PINHOLE_PHYSICAL_PROBLEM_PRODUCER_REVISION,
    stageId: STAGE_ID,
    templateId: TEMPLATE_ID,
    releaseRecord: input.releaseRecord,
    compatibilityReceipt: input.compatibilityReceipt,
    sourceAuthority,
    sourceAuthorityHash,
    canonicalModelHash: input.canonicalModelHash,
    analysisGeometryHash,
    physicalProblem: input.physicalProblem,
    physicalProblemHash: problemHash,
    featureProjection: input.featureProjection,
    featureProjectionHash: featureHash,
    applicationEvidence: input.applicationEvidence,
    ladder,
    mappingPackage,
    levels,
    projectionHash,
    status: 'PROJECTION_READY',
    authority: projectionAuthority(),
  });
}

export function validateLafeaLugPinholePhysicalProblemProjection(value) {
  try {
    requireProjection(value);
    return Object.freeze({ ok: true, errors: Object.freeze([]) });
  } catch (error) {
    return Object.freeze({
      ok: false,
      errors: Object.freeze([error?.code ?? 'LAFEA_NB_T6C_PROJECTION_INVALID']),
    });
  }
}

export function executeLafeaLugPinholePhysicalProblemBatch(options) {
  const projection = requireProjection(options.projection);
  const execution = canonicalExecutionInput(options, projection);
  requireValid(
    validateLafeaContinuumBenchmarkQualification(options.benchmarkQualification),
    'LAFEA_NB_T6C_BENCHMARK_QUALIFICATION_INVALID',
  );
  if (options.benchmarkQualification.mappingPackageHash
    !== projection.mappingPackage.semanticHash) {
    throw batchError('LAFEA_NB_T6C_BENCHMARK_MAPPING_PARENT_STALE');
  }
  const baseDocument = projection.levels[0].document;
  const request = createControlledContinuumExecutionRequest({
    requestId: execution.requestId,
    releaseRecordHash: projection.releaseRecord.semanticHash,
    releaseAuthorityState: projection.releaseRecord.releaseState.authorityState,
    releaseValidity: projection.releaseRecord.releaseState.validity,
    compatibilityReceiptHash: projection.compatibilityReceipt.semanticHash,
    compatibilityStatus: projection.compatibilityReceipt.status,
    mappingPackageHash: projection.mappingPackage.semanticHash,
    mappingStatus: projection.mappingPackage.status,
    boundBindingHash: projection.mappingPackage.boundBinding.semanticHash,
    boundBindingStatus: projection.mappingPackage.boundBinding.status,
    benchmarkQualificationHash: options.benchmarkQualification.semanticHash,
    benchmarkStatus: options.benchmarkQualification.status,
    importedDocumentRevisionDigest: lafeaDocumentDigest(baseDocument),
    sourceAuthorityRequest: {
      originRef: projection.sourceAuthority.originRef,
      expectedStageId: STAGE_ID,
      expectedDocumentRevisionDigest: lafeaDocumentDigest(baseDocument),
      requestedRole: 'AUTHORITATIVE_EDITABLE_STAGE_SOURCE',
    },
    canonicalModelHash: projection.canonicalModelHash,
    analysisGeometryHash: projection.analysisGeometryHash,
    meshLevels: projection.levels.map((level) => ({
      ordinal: level.ordinal,
      meshHash: level.meshEvidence.meshHash,
      meshProfileHash: level.meshEvidence.meshProfileHash,
      elementType: 'T6',
      canonicalModelHash: projection.canonicalModelHash,
      analysisGeometryHash: projection.analysisGeometryHash,
    })),
    recoveryProfileHash: execution.recoveryProfileHash,
    convergenceProfileHash:
      options.benchmarkQualification.lifecycleParentProposal.convergenceProfileHash,
  });
  const controllerResult = executeControlledLafeaContinuumPilot({
    request,
    releaseRecord: projection.releaseRecord,
    compatibilityReceipt: projection.compatibilityReceipt,
    mappingPackage: projection.mappingPackage,
    benchmarkQualification: options.benchmarkQualification,
    document: baseDocument,
    levels: projection.levels.map((level) => ({
      ordinal: level.ordinal,
      document: level.document,
      meshEvidence: level.meshEvidence,
    })),
    convergenceRequest: execution.convergenceRequest,
  });
  const executionHash = canonicalLafeaSha256({
    schema: 'lafea-nb-t6c-execution-hash-input/v1',
    projectionHash: projection.projectionHash,
    requestHash: request.semanticHash,
    benchmarkQualificationHash: options.benchmarkQualification.semanticHash,
    controllerReceiptHash: controllerResult.receipt?.evidenceHash ?? null,
    controllerStatus: controllerResult.status,
  });
  return deepFreeze({
    schema: LAFEA_LUG_PINHOLE_EXECUTION_SCHEMA,
    producerRevision: LAFEA_LUG_PINHOLE_PHYSICAL_PROBLEM_PRODUCER_REVISION,
    stageId: STAGE_ID,
    templateId: TEMPLATE_ID,
    projectionHash: projection.projectionHash,
    request,
    benchmarkQualification: options.benchmarkQualification,
    controllerResult,
    executionHash,
    status: controllerResult.status,
    accepted: controllerResult.accepted === true,
    authority: {
      selectedGeometryClass: 'CONCENTRIC_ANNULAR_LUG_PINHOLE',
      selectedPilotExecution: controllerResult.accepted === true,
      arbitraryOuterProfileSupported: false,
      arbitraryHoleTopologySupported: false,
      generalT7dAuthorized: false,
      shellAuthorized: false,
      assessmentReady: false,
      codeReady: false,
      reportAuthority: false,
      releaseQualified: false,
    },
  });
}

function requireProjection(value) {
  if (!value || value.schema !== LAFEA_LUG_PINHOLE_PROJECTION_SCHEMA
    || value.producerRevision !== LAFEA_LUG_PINHOLE_PHYSICAL_PROBLEM_PRODUCER_REVISION
    || value.stageId !== STAGE_ID || value.templateId !== TEMPLATE_ID
    || value.status !== 'PROJECTION_READY') {
    throw batchError('LAFEA_NB_T6C_PROJECTION_CONTRACT_INVALID');
  }
  requireValid(validateTemplateReleaseRecordV2(value.releaseRecord),
    'LAFEA_NB_T6C_PROJECTION_RELEASE_INVALID');
  requireValid(validateTemplateTargetCompatibilityReceipt(value.compatibilityReceipt),
    'LAFEA_NB_T6C_PROJECTION_COMPATIBILITY_INVALID');
  requireValid(validateLafeaLugPinholeMappingPackage(value.mappingPackage),
    'LAFEA_NB_T6C_PROJECTION_MAPPING_INVALID');
  requireValid(validateLafeaLugPinholeMeshLadder(value.ladder),
    'LAFEA_NB_T6C_PROJECTION_LADDER_INVALID');
  if (physicalProblemHash(value.physicalProblem) !== value.physicalProblemHash
    || featureProjectionHash(value.featureProjection) !== value.featureProjectionHash) {
    throw batchError('LAFEA_NB_T6C_PROJECTION_DECLARATION_TAMPERED');
  }
  if (canonicalLafeaSha256(value.sourceAuthority) !== value.sourceAuthorityHash
    || value.sourceAuthority.sourceHash !== value.ladder.sourceHash
    || value.canonicalModelHash !== value.ladder.canonicalModelHash
    || value.analysisGeometryHash !== value.ladder.analysisGeometryHash
    || value.mappingPackage.sourceHash !== value.sourceAuthority.sourceHash
    || value.mappingPackage.meshHash !== value.ladder.levels[0].meshEvidence.meshHash
    || value.mappingPackage.boundBinding.status !== 'BOUND') {
    throw batchError('LAFEA_NB_T6C_PROJECTION_PARENT_MISMATCH');
  }
  if (!Array.isArray(value.levels) || value.levels.length !== 3) {
    throw batchError('LAFEA_NB_T6C_PROJECTION_THREE_LEVELS_REQUIRED');
  }
  value.levels.forEach((level, index) => {
    if (level.ordinal !== index + 1
      || lafeaDocumentDigest(level.document) !== level.documentRevisionDigest
      || JSON.stringify(level.meshEvidence)
        !== JSON.stringify(value.ladder.levels[index].meshEvidence)) {
      throw batchError('LAFEA_NB_T6C_PROJECTION_LEVEL_TAMPERED');
    }
    assertDocumentMatchesMesh(level.document, level.meshEvidence);
  });
  const expected = projectionSemanticHash({
    releaseRecordHash: value.releaseRecord.semanticHash,
    compatibilityReceiptHash: value.compatibilityReceipt.semanticHash,
    sourceAuthorityHash: value.sourceAuthorityHash,
    canonicalModelHash: value.canonicalModelHash,
    analysisGeometryHash: value.analysisGeometryHash,
    ladderHash: value.ladder.ladderHash,
    mappingPackageHash: value.mappingPackage.semanticHash,
    physicalProblemHash: value.physicalProblemHash,
    featureProjectionHash: value.featureProjectionHash,
    levels: value.levels,
  });
  if (expected !== value.projectionHash) {
    throw batchError('LAFEA_NB_T6C_PROJECTION_HASH_TAMPERED');
  }
  return value;
}

function assertReleaseAuthority(release, receipt) {
  if (release.template.templateId !== TEMPLATE_ID
    || release.targetStage.stageId !== STAGE_ID
    || release.releaseState.authorityState !== 'ENGINE_EXECUTABLE'
    || release.releaseState.validity !== 'CURRENT'
    || release.releaseState.releaseQualified
    || receipt.status !== 'CURRENT') {
    throw batchError('LAFEA_NB_T6C_RELEASE_AUTHORITY_INVALID');
  }
}

function projectionAuthority() {
  return deepFreeze({
    selectedGeometryClass: 'CONCENTRIC_ANNULAR_LUG_PINHOLE',
    productionMeshGenerated: true,
    stageDocumentsGenerated: true,
    mappingQualified: true,
    solverExecuted: false,
    recoveryProduced: false,
    convergenceProduced: false,
    arbitraryOuterProfileSupported: false,
    arbitraryHoleTopologySupported: false,
    generalT7dAuthorized: false,
    shellAuthorized: false,
    assessmentReady: false,
    codeReady: false,
    reportAuthority: false,
    releaseQualified: false,
  });
}
