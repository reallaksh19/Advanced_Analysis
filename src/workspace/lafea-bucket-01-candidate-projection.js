import {
  createControlledContinuumExecutionRequest,
} from '../core/lafea-application-templates/controlled-continuum-pilot-contract.js';
import {
  validateLafeaContinuumBenchmarkQualification,
} from '../core/lafea-application-templates/continuum-benchmark-convergence.js';
import {
  LAFEA_LUG_PINHOLE_MAPPING_DECLARATION_SCHEMA,
} from './lafea-lug-pinhole-mapping-evidence.js';
import {
  createContinuumApplicationMappingEvidence,
  createContinuumApplicationPathMappingEvidence,
  createLafeaLugPinholeMappingPackage,
  validateLafeaLugPinholeMappingPackage,
} from '../core/lafea-application-templates/continuum-application-mapping-evidence.js';
import {
  validateTemplateReleaseRecordV2,
} from '../core/lafea-application-templates/release-record-v2.js';
import {
  validateTemplateTargetCompatibilityReceipt,
} from '../core/lafea-application-templates/target-compatibility.js';
import {
  LAFEA_LUG_PINHOLE_PROBE_STABLE_T6_V3_GENERATOR_REVISION,
  validateLafeaLugPinholeProbeStableT6MeshV3Package,
} from '../core/lafea-meshing/lug-pinhole-probe-stable-t6-v3.js';
import {
  LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  createLafeaAnalysisMeshEvidence,
  lafeaAnalysisMeshContentHash,
} from './lafea-analysis-mesh-evidence.js';
import {
  validateLafeaBucket01ProbeStableCandidateIntakeEvidence,
} from './lafea-bucket-01-probe-stable-candidate-intake.js';
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { executeControlledLafeaContinuumPilot } from './lafea-controlled-continuum-execution-public.js';
import { lafeaDocumentDigest } from './lafea-edit-command.js';
import {
  LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA,
  LAFEA_LUG_PINHOLE_PROJECTION_INTAKE_SCHEMA,
  STAGE_ID,
  TEMPLATE_ID,
  batchError,
  canonicalExecutionInput,
  canonicalProjectionInput,
  deepFreeze,
  featureProjectionHash,
  pendingMapping,
  physicalProblemHash,
  requireValid,
} from './lafea-lug-pinhole-physical-problem-contract.js';
import {
  assertDocumentMatchesMesh,
  buildProjectedCandidateLevels,
} from './lafea-lug-pinhole-stage-projector.js';
import {
  lafeaLugPinholeAnalysisGeometryHash,
} from './lafea-lug-pinhole-mesh-ladder.js';
import { issueLafeaSourceAuthority } from './lafea-source-authority.js';
import {
  bindLafeaContinuumTemplateCallerMesh,
} from './lafea-template-caller-mesh-binding.js';
import {
  createTemplateCallerMeshBinding,
} from '../core/lafea-application-templates/caller-mesh-binding.js';

export const LAFEA_BUCKET_01_CANDIDATE_PROJECTION_INPUT_SCHEMA =
  'lafea-bucket-01-candidate-projection-input/v1';
export const LAFEA_BUCKET_01_CANDIDATE_PROJECTION_SCHEMA =
  'lafea-bucket-01-candidate-projection/v1';
export const LAFEA_BUCKET_01_CANDIDATE_EXECUTION_SCHEMA =
  'lafea-bucket-01-candidate-execution/v1';
export const LAFEA_BUCKET_01_CANDIDATE_PROJECTION_REVISION =
  'B01-CANDIDATE-PROJECTION.1';

const INPUT_KEYS = Object.freeze([
  'schema', 'exactHeadSha', 'designHash', 'candidateIntakeEvidence',
  'candidatePackages', 'meshProfiles', 'releaseRecord',
  'compatibilityReceipt', 'canonicalModelHash', 'geometry',
  'physicalProblem', 'featureProjection', 'applicationEvidence',
  'producerRef', 'sourceAuthorityOriginRef',
]);

export function createLafeaBucket01CandidateProjection(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'candidate projection input');
  if (inputValue.schema !== LAFEA_BUCKET_01_CANDIDATE_PROJECTION_INPUT_SCHEMA) {
    throw candidateError('LAFEA_B01_CANDIDATE_PROJECTION_INPUT_SCHEMA_INVALID');
  }
  const exactHeadSha = gitSha(inputValue.exactHeadSha);
  const designHash = sha256(inputValue.designHash, 'designHash');
  const intake = inputValue.candidateIntakeEvidence;
  if (validateLafeaBucket01ProbeStableCandidateIntakeEvidence(intake).ok
      !== true
    || intake.exactHeadSha !== exactHeadSha
    || intake.designHash !== designHash
    || intake.status
      !== 'CANDIDATE_ACCEPTED_FOR_PHASE_2C_INTEGRATION_REVIEW'
    || intake.authority?.executedRecomputation !== true
    || intake.authority?.productionMeshAuthority !== false
    || intake.authority?.qualificationAuthority !== false
    || intake.authority?.bucketQualified !== false) {
    throw candidateError('LAFEA_B01_CANDIDATE_PROJECTION_INTAKE_INVALID');
  }
  if (!Array.isArray(inputValue.candidatePackages)
    || inputValue.candidatePackages.length !== 4
    || !Array.isArray(inputValue.meshProfiles)
    || inputValue.meshProfiles.length !== 4) {
    throw candidateError('LAFEA_B01_CANDIDATE_PROJECTION_LEVELS_INVALID');
  }
  const candidatePackages = inputValue.candidatePackages.map((packageValue,
    index) => {
    const validation = validateLafeaLugPinholeProbeStableT6MeshV3Package(
      packageValue,
    );
    const intakeLevel = intake.levels[index];
    if (!validation.ok
      || packageValue.spec.ordinal !== index + 1
      || packageValue.status !== 'CANDIDATE_MESH_READY_NOT_PRODUCTION'
      || packageValue.authority?.productionMeshAuthority !== false
      || packageValue.authority?.qualificationAuthority !== false
      || packageValue.meshHash !== intakeLevel.meshHash
      || packageValue.mappingWindowHash !== intakeLevel.mappingWindowHash
      || packageValue.mesh.elements.length !== intakeLevel.elementCount) {
      throw candidateError('LAFEA_B01_CANDIDATE_PROJECTION_PACKAGE_INVALID');
    }
    return packageValue;
  });
  const canonical = canonicalProjectionInput({
    schema: LAFEA_LUG_PINHOLE_PROJECTION_INTAKE_SCHEMA,
    releaseRecord: inputValue.releaseRecord,
    compatibilityReceipt: inputValue.compatibilityReceipt,
    canonicalModelHash: inputValue.canonicalModelHash,
    geometry: inputValue.geometry,
    levels: candidatePackages.map((packageValue, index) => ({
      ordinal: index + 1,
      meshIdentity: packageValue.mesh.meshIdentity,
      radialDivisions:
        packageValue.spec.radialAxis.coordinates.length - 1,
      circumferentialDivisions:
        packageValue.spec.circumferentialAxis.coordinates.length - 1,
      meshProfile: inputValue.meshProfiles[index],
    })),
    physicalProblem: inputValue.physicalProblem,
    featureProjection: inputValue.featureProjection,
    applicationEvidence: inputValue.applicationEvidence,
    producerRef: inputValue.producerRef,
    sourceAuthorityOriginRef: inputValue.sourceAuthorityOriginRef,
  });
  requireValid(
    validateTemplateReleaseRecordV2(canonical.releaseRecord),
    'LAFEA_B01_CANDIDATE_RELEASE_INVALID',
  );
  requireValid(
    validateTemplateTargetCompatibilityReceipt(canonical.compatibilityReceipt),
    'LAFEA_B01_CANDIDATE_COMPATIBILITY_INVALID',
  );
  assertReleaseAuthority(canonical.releaseRecord, canonical.compatibilityReceipt);
  const built = buildProjectedCandidateLevels({
    meshPackages: candidatePackages,
    physicalProblem: canonical.physicalProblem,
    featureProjection: canonical.featureProjection,
    center: canonical.geometry.center,
  });
  const baseDocument = built[0].document;
  const sourceAuthority = issueLafeaSourceAuthority(
    STAGE_ID,
    baseDocument,
    canonical.sourceAuthorityOriginRef,
  );
  const sourceAuthorityHash = canonicalLafeaSha256(sourceAuthority);
  const analysisGeometryHash = lafeaLugPinholeAnalysisGeometryHash(
    canonical.geometry,
  );
  const meshEvidence = candidatePackages.map((packageValue, index) => {
    const meshHash = lafeaAnalysisMeshContentHash(packageValue.mesh);
    const evidence = createLafeaAnalysisMeshEvidence({
      schema: LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
      stageId: STAGE_ID,
      sourceHash: sourceAuthority.sourceHash,
      canonicalModelHash: canonical.canonicalModelHash,
      analysisGeometryHash,
      meshProfile: canonical.levels[index].meshProfile,
      mesh: packageValue.mesh,
      authority: {
        schema: LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
        stageId: STAGE_ID,
        authorityRole: 'STAGE_AUTHORIZED_ANALYSIS_MESH',
        status: 'ACCEPTED_BY_STAGE_CONTRACT',
        producerRef: canonical.producerRef,
        sourceHash: sourceAuthority.sourceHash,
        canonicalModelHash: canonical.canonicalModelHash,
        analysisGeometryHash,
        meshProfileHash: canonical.levels[index].meshProfile.semanticHash,
        meshHash,
      },
    });
    if (evidence.status !== 'CURRENT' || evidence.qualification !== 'PASS') {
      throw candidateError('LAFEA_B01_CANDIDATE_ANALYSIS_MESH_BLOCKED');
    }
    assertDocumentMatchesMesh(built[index].document, evidence);
    return evidence;
  });
  const mappingPackages = meshEvidence.map((evidence, index) =>
    createCandidateMappingPackage({
      canonical,
      sourceAuthorityHash,
      evidence,
      level: built[index],
    }));
  const candidateLadderHash = canonicalLafeaSha256({
    schema: 'lafea-bucket-01-candidate-ladder-hash-input/v1',
    exactHeadSha,
    designHash,
    candidateIntakeEvidenceHash: intake.semanticHash,
    packageHashes: candidatePackages.map((row) => row.semanticHash),
    meshArtifactHashes: meshEvidence.map((row) => row.artifactHash),
    mappingPackageHashes: mappingPackages.map((row) => row.semanticHash),
  });
  const levels = deepFreeze(built.map((level, index) => ({
    ordinal: index + 1,
    candidatePackageHash: candidatePackages[index].semanticHash,
    mappingWindowHash: candidatePackages[index].mappingWindowHash,
    document: level.document,
    documentRevisionDigest: lafeaDocumentDigest(level.document),
    meshEvidence: meshEvidence[index],
    mappingPackage: mappingPackages[index],
    loadEdges: level.loadEdges,
    boundaryEdges: level.boundaryEdges,
    loadEdgeNodeIds: level.loadEdgeNodeIds,
    boundaryEdgeNodeIds: level.boundaryEdgeNodeIds,
    loadResultant: level.loadResultant,
    mappingAuthority: level.mappingAuthority,
  })));
  const problemHash = physicalProblemHash(canonical.physicalProblem);
  const featureHash = featureProjectionHash(canonical.featureProjection);
  const projectionHash = canonicalLafeaSha256({
    schema: 'lafea-bucket-01-candidate-projection-hash-input/v1',
    exactHeadSha,
    designHash,
    candidateIntakeEvidenceHash: intake.semanticHash,
    releaseRecordHash: canonical.releaseRecord.semanticHash,
    compatibilityReceiptHash: canonical.compatibilityReceipt.semanticHash,
    sourceAuthorityHash,
    canonicalModelHash: canonical.canonicalModelHash,
    analysisGeometryHash,
    candidateLadderHash,
    physicalProblemHash: problemHash,
    featureProjectionHash: featureHash,
    levels: levels.map((level) => ({
      ordinal: level.ordinal,
      candidatePackageHash: level.candidatePackageHash,
      documentRevisionDigest: level.documentRevisionDigest,
      meshArtifactHash: level.meshEvidence.artifactHash,
      mappingPackageHash: level.mappingPackage.semanticHash,
      mappingWindowHash: level.mappingWindowHash,
      loadEdgeNodeIds: level.loadEdgeNodeIds,
      boundaryEdgeNodeIds: level.boundaryEdgeNodeIds,
      loadResultant: level.loadResultant,
    })),
  });
  const sourceInput = deepFreeze({
    ...structuredClone(inputValue),
    candidatePackages,
  });
  const base = {
    schema: LAFEA_BUCKET_01_CANDIDATE_PROJECTION_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_CANDIDATE_PROJECTION_REVISION,
    exactHeadSha,
    designHash,
    candidateIntakeEvidenceHash: intake.semanticHash,
    sourceInput,
    stageId: STAGE_ID,
    templateId: TEMPLATE_ID,
    releaseRecord: canonical.releaseRecord,
    compatibilityReceipt: canonical.compatibilityReceipt,
    sourceAuthority,
    sourceAuthorityHash,
    canonicalModelHash: canonical.canonicalModelHash,
    analysisGeometryHash,
    physicalProblem: canonical.physicalProblem,
    physicalProblemHash: problemHash,
    featureProjection: canonical.featureProjection,
    featureProjectionHash: featureHash,
    applicationEvidence: canonical.applicationEvidence,
    candidateLadderHash,
    mappingPackages,
    baseMappingPackage: mappingPackages[0],
    levels,
    projectionHash,
    status: 'CANDIDATE_PROJECTION_READY_NOT_PRODUCTION',
    authority: {
      candidateOnly: true,
      candidateIntakeVerified: true,
      exactPhysicalWindowMappedPerLevel: true,
      stageDocumentsGeneratedPerLevel: true,
      mappingPackagesQualifiedPerLevel: true,
      solverExecuted: false,
      productionSwitchAuthorized: false,
      productionSwitchApplied: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

export function validateLafeaBucket01CandidateProjection(value) {
  try {
    if (!value
      || value.schema !== LAFEA_BUCKET_01_CANDIDATE_PROJECTION_SCHEMA
      || value.producerRevision !== LAFEA_BUCKET_01_CANDIDATE_PROJECTION_REVISION) {
      throw candidateError('LAFEA_B01_CANDIDATE_PROJECTION_SCHEMA_INVALID');
    }
    const rebuilt = createLafeaBucket01CandidateProjection(value.sourceInput);
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
      throw candidateError('LAFEA_B01_CANDIDATE_PROJECTION_REBUILD_MISMATCH');
    }
    if (!isDeepFrozen(value)) {
      throw candidateError('LAFEA_B01_CANDIDATE_PROJECTION_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_CANDIDATE_PROJECTION_INVALID'],
    });
  }
}

export function executeLafeaBucket01CandidateProjection(options) {
  const projection = requireCandidateProjection(options.projection);
  const execution = canonicalExecutionInput({
    schema: LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA,
    projection,
    benchmarkQualification: options.benchmarkQualification,
    requestId: options.requestId,
    recoveryProfileHash: options.recoveryProfileHash,
    convergenceRequest: options.convergenceRequest,
  }, projection);
  requireValid(
    validateLafeaContinuumBenchmarkQualification(options.benchmarkQualification),
    'LAFEA_B01_CANDIDATE_BENCHMARK_QUALIFICATION_INVALID',
  );
  if (options.benchmarkQualification.mappingPackageHash
    !== projection.baseMappingPackage.semanticHash) {
    throw candidateError('LAFEA_B01_CANDIDATE_BENCHMARK_MAPPING_PARENT_STALE');
  }
  const baseDocument = projection.levels[0].document;
  const request = createControlledContinuumExecutionRequest({
    requestId: execution.requestId,
    releaseRecordHash: projection.releaseRecord.semanticHash,
    releaseAuthorityState: projection.releaseRecord.releaseState.authorityState,
    releaseValidity: projection.releaseRecord.releaseState.validity,
    compatibilityReceiptHash: projection.compatibilityReceipt.semanticHash,
    compatibilityStatus: projection.compatibilityReceipt.status,
    mappingPackageHash: projection.baseMappingPackage.semanticHash,
    mappingStatus: projection.baseMappingPackage.status,
    boundBindingHash: projection.baseMappingPackage.boundBinding.semanticHash,
    boundBindingStatus: projection.baseMappingPackage.boundBinding.status,
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
      options.benchmarkQualification.lifecycleParentProposal
        .convergenceProfileHash,
  });
  const controllerResult = executeControlledLafeaContinuumPilot({
    request,
    releaseRecord: projection.releaseRecord,
    compatibilityReceipt: projection.compatibilityReceipt,
    mappingPackage: projection.baseMappingPackage,
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
    schema: 'lafea-bucket-01-candidate-execution-hash-input/v1',
    projectionHash: projection.projectionHash,
    requestHash: request.semanticHash,
    benchmarkQualificationHash: options.benchmarkQualification.semanticHash,
    controllerReceiptHash: controllerResult.receipt?.evidenceHash ?? null,
    controllerStatus: controllerResult.status,
  });
  return deepFreeze({
    schema: LAFEA_BUCKET_01_CANDIDATE_EXECUTION_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_CANDIDATE_PROJECTION_REVISION,
    exactHeadSha: projection.exactHeadSha,
    designHash: projection.designHash,
    candidateIntakeEvidenceHash: projection.candidateIntakeEvidenceHash,
    projectionHash: projection.projectionHash,
    mappingPackageHashes: projection.mappingPackages.map(
      (row) => row.semanticHash,
    ),
    request,
    benchmarkQualification: options.benchmarkQualification,
    controllerResult,
    executionHash,
    status: controllerResult.status,
    accepted: controllerResult.accepted === true,
    authority: {
      candidateOnly: true,
      candidateSolverExecuted: true,
      selectedCandidateExecution: controllerResult.accepted === true,
      productionSwitchAuthorized: false,
      productionSwitchApplied: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  });
}

function createCandidateMappingPackage({
  canonical,
  sourceAuthorityHash,
  evidence,
  level,
}) {
  const pendingBinding = bindLafeaContinuumTemplateCallerMesh({
    releaseRecord: canonical.releaseRecord,
    compatibilityReceipt: canonical.compatibilityReceipt,
    meshEvidence: evidence,
    sourceAuthorityHash,
    materialRegionEvidence: pendingMapping(),
    loadEdgeEvidence: pendingMapping(),
    boundaryEdgeEvidence: pendingMapping(),
  });
  if (pendingBinding.status !== 'MAPPING_EVIDENCE_PENDING') {
    throw candidateError('LAFEA_B01_CANDIDATE_PENDING_BINDING_INVALID');
  }
  const stageSourceHash = canonicalLafeaSha256({
    schema: 'lafea-b01-candidate-stage-source-hash-input/v1',
    stageSource: level.document,
  });
  const applicationEvidenceHash = canonicalLafeaSha256({
    schema: 'lafea-b01-candidate-application-evidence-hash-input/v1',
    applicationEvidence: canonical.applicationEvidence,
  });
  const declaration = candidateDeclaration(
    level,
    canonical.physicalProblem,
    canonical.featureProjection,
  );
  const declarationHash = canonicalLafeaSha256({
    schema: 'lafea-b01-candidate-path-declaration-hash-input/v1',
    declaration,
  });
  const parents = {
    templateId: TEMPLATE_ID,
    stageId: STAGE_ID,
    sourceHash: pendingBinding.sourceHash,
    canonicalModelHash: pendingBinding.canonicalModelHash,
    analysisGeometryHash: pendingBinding.analysisGeometryHash,
    meshProfileHash: pendingBinding.meshProfileHash,
    meshHash: pendingBinding.meshHash,
    stageSourceHash,
    applicationEvidenceHash,
    declarationHash,
  };
  const materialRegionEvidence = createContinuumApplicationMappingEvidence({
    ...parents,
    kind: 'MATERIAL_REGION',
    qualification: 'PASS',
    metrics: {
      materialId: canonical.physicalProblem.material.materialId,
      elementIds: level.document.elements.map((row) => row.elementId).sort(),
      coveredElementCount: level.document.elements.length,
      totalElementCount: level.document.elements.length,
      completeCoverage: true,
    },
    reasons: [],
  });
  const loadMetrics = loadPathMetrics(
    level,
    canonical.physicalProblem,
    canonical.featureProjection,
  );
  const boundaryMetrics = boundaryPathMetrics(
    level,
    canonical.featureProjection,
  );
  const loadEdgeEvidence = createContinuumApplicationPathMappingEvidence({
    ...parents,
    kind: 'LOAD_EDGE',
    qualification: loadMetrics.reasons.length ? 'BLOCK' : 'PASS',
    metrics: loadMetrics.metrics,
    reasons: loadMetrics.reasons,
  });
  const boundaryEdgeEvidence = createContinuumApplicationPathMappingEvidence({
    ...parents,
    kind: 'BOUNDARY_EDGE',
    qualification: boundaryMetrics.reasons.length ? 'BLOCK' : 'PASS',
    metrics: boundaryMetrics.metrics,
    reasons: boundaryMetrics.reasons,
  });
  const boundBinding = createTemplateCallerMeshBinding({
    templateId: pendingBinding.templateId,
    templateSemanticHash: pendingBinding.templateSemanticHash,
    compilationHash: pendingBinding.compilationHash,
    handoffHash: pendingBinding.handoffHash,
    compatibilityReceiptHash: pendingBinding.compatibilityReceiptHash,
    targetStageId: pendingBinding.targetStageId,
    targetCompositionRootHash: pendingBinding.targetCompositionRootHash,
    sourceAuthorityHash: pendingBinding.sourceAuthorityHash,
    sourceHash: pendingBinding.sourceHash,
    canonicalModelHash: pendingBinding.canonicalModelHash,
    analysisGeometryHash: pendingBinding.analysisGeometryHash,
    meshProfileHash: pendingBinding.meshProfileHash,
    meshHash: pendingBinding.meshHash,
    meshAuthorityHash: pendingBinding.meshAuthorityHash,
    qualityEvidenceHash: pendingBinding.qualityEvidenceHash,
    materialRegionEvidence: bindingEvidence(materialRegionEvidence),
    loadEdgeEvidence: bindingEvidence(loadEdgeEvidence),
    boundaryEdgeEvidence: bindingEvidence(boundaryEdgeEvidence),
  });
  const mappingPackage = createLafeaLugPinholeMappingPackage({
    producerRevision: 'B01-CANDIDATE-PATH-MAPPING.1',
    pendingBindingHash: pendingBinding.semanticHash,
    ...parents,
    materialRegionEvidence,
    loadEdgeEvidence,
    boundaryEdgeEvidence,
    boundBinding,
  });
  if (validateLafeaLugPinholeMappingPackage(mappingPackage).ok !== true
    || mappingPackage.status !== 'MAPPING_EVIDENCE_QUALIFIED'
    || mappingPackage.boundBinding.status !== 'BOUND') {
    throw candidateError('LAFEA_B01_CANDIDATE_MAPPING_PACKAGE_BLOCKED');
  }
  return mappingPackage;
}

function candidateDeclaration(level, physicalProblem, featureProjection) {
  return {
    schema: LAFEA_LUG_PINHOLE_MAPPING_DECLARATION_SCHEMA,
    candidatePathExtension: 'B01-EXACT-PHYSICAL-WINDOW-PATH/V1',
    templateId: TEMPLATE_ID,
    stageId: STAGE_ID,
    ordinal: level.ordinal,
    mappingWindowHash: level.meshPackage.mappingWindowHash,
    radialStart: level.mappingAuthority.radialStart,
    radialEnd: level.mappingAuthority.radialEnd,
    materialId: physicalProblem.material.materialId,
    loadFeatureId: featureProjection.loadFeature.featureId,
    boundaryFeatureId: featureProjection.boundaryFeature.featureId,
    loadEdges: level.loadEdges,
    boundaryEdges: level.boundaryEdges,
  };
}

function loadPathMetrics(level, physicalProblem, featureProjection) {
  const loadCase = level.document.loadCases.find(
    (row) => row.loadCaseId === physicalProblem.loadCase.loadCaseId,
  );
  const pathNodeIds = orderedPathNodes(level.loadEdges);
  const selected = loadCase.nodalForces.filter((row) =>
    pathNodeIds.includes(row.nodeId));
  const reasons = [];
  if (selected.length !== loadCase.nodalForces.length) {
    reasons.push('LOAD_SELECTION_INCOMPLETE');
  }
  const observed = selected.reduce(
    (sum, row) => [sum[0] + row.fx, sum[1] + row.fy],
    [0, 0],
  );
  const expected = [...physicalProblem.loadCase.resultant];
  const residual = [observed[0] - expected[0], observed[1] - expected[1]];
  const scale = Math.max(1, ...observed.map(Math.abs), ...expected.map(Math.abs));
  const tolerance = featureProjection.loadTolerance.absolute
    + featureProjection.loadTolerance.relative * scale;
  const closureAccepted = residual.every((value) =>
    Math.abs(value) <= tolerance);
  if (!closureAccepted) reasons.push('LOAD_RESULTANT_CLOSURE_FAILED');
  return {
    reasons,
    metrics: {
      featureId: featureProjection.loadFeature.featureId,
      loadCaseId: physicalProblem.loadCase.loadCaseId,
      edgeNodePaths: level.loadEdges,
      pathNodeIds,
      radialStart: level.mappingAuthority.radialStart,
      radialEnd: level.mappingAuthority.radialEnd,
      mappingWindowHash: level.meshPackage.mappingWindowHash,
      loadIds: selected.map((row) => row.loadId).sort(),
      expectedResultant: expected,
      observedResultant: observed,
      residual,
      tolerance,
      closureAccepted,
    },
  };
}

function boundaryPathMetrics(level, featureProjection) {
  const pathNodeIds = orderedPathNodes(level.boundaryEdges);
  const selected = level.document.constraints.filter((row) =>
    pathNodeIds.includes(row.nodeId));
  const reasons = [];
  if (selected.some((row) => !['UX', 'UY'].includes(row.dof)
      || row.value !== 0)) {
    reasons.push('BOUNDARY_CONSTRAINT_NOT_ZERO_IN_PLANE');
  }
  const nodes = new Map(level.document.nodes.map((row) => [row.nodeId, row]));
  const rankRows = selected.map((constraint) => {
    const node = nodes.get(constraint.nodeId);
    return constraint.dof === 'UX'
      ? [1, 0, -node.y]
      : [0, 1, node.x];
  });
  const rigidBodyRank = matrixRank(rankRows, 1e-12);
  const restraintSufficient = rigidBodyRank === 3;
  if (!restraintSufficient) reasons.push('BOUNDARY_RIGID_BODY_RANK_DEFICIENT');
  return {
    reasons,
    metrics: {
      featureId: featureProjection.boundaryFeature.featureId,
      edgeNodePaths: level.boundaryEdges,
      pathNodeIds,
      radialStart: level.mappingAuthority.radialStart,
      radialEnd: level.mappingAuthority.radialEnd,
      mappingWindowHash: level.meshPackage.mappingWindowHash,
      constraintIds: selected.map((row) => row.constraintId).sort(),
      rigidBodyRank,
      requiredRank: 3,
      restraintSufficient,
    },
  };
}

function requireCandidateProjection(value) {
  if (validateLafeaBucket01CandidateProjection(value).ok !== true
    || value.status !== 'CANDIDATE_PROJECTION_READY_NOT_PRODUCTION'
    || value.authority?.productionSwitchAuthorized !== false
    || value.authority?.productionMeshAuthority !== false
    || value.authority?.qualificationAuthority !== false
    || value.authority?.bucketQualified !== false) {
    throw candidateError('LAFEA_B01_CANDIDATE_PROJECTION_INVALID');
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
    throw candidateError('LAFEA_B01_CANDIDATE_RELEASE_AUTHORITY_INVALID');
  }
}
function bindingEvidence(evidence) {
  return {
    applicability: 'REQUIRED',
    evidenceHash: evidence.semanticHash,
    qualification: evidence.qualification,
  };
}
function orderedPathNodes(edges) {
  const result = [];
  edges.forEach((edge, index) => {
    if (index === 0) result.push(...edge);
    else result.push(edge[1], edge[2]);
  });
  return result;
}
function matrixRank(rows, tolerance) {
  if (!rows.length) return 0;
  const matrix = rows.map((row) => [...row]);
  let rank = 0;
  for (let column = 0; column < 3 && rank < matrix.length; column += 1) {
    let pivot = rank;
    for (let row = rank + 1; row < matrix.length; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) {
        pivot = row;
      }
    }
    if (Math.abs(matrix[pivot][column]) <= tolerance) continue;
    [matrix[rank], matrix[pivot]] = [matrix[pivot], matrix[rank]];
    const divisor = matrix[rank][column];
    for (let c = column; c < 3; c += 1) matrix[rank][c] /= divisor;
    for (let row = 0; row < matrix.length; row += 1) {
      if (row === rank) continue;
      const factor = matrix[row][column];
      for (let c = column; c < 3; c += 1) {
        matrix[row][c] -= factor * matrix[rank][c];
      }
    }
    rank += 1;
  }
  return rank;
}
function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...expected].sort())) {
    throw candidateError('LAFEA_B01_CANDIDATE_EXACT_KEYS_INVALID', label);
  }
}
function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw candidateError('LAFEA_B01_CANDIDATE_HEAD_INVALID');
  }
  return value;
}
function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw candidateError('LAFEA_B01_CANDIDATE_HASH_INVALID', label);
  }
  return value;
}
function candidateError(code, message = code) {
  return batchError(code, message);
}
function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}
