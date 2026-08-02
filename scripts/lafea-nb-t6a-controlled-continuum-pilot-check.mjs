#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import {
  PROFILE_KINDS,
  canonicalProfile,
} from '../src/core/lafea-profile-contract/index.js';
import {
  createTemplateCallerMeshBinding,
} from '../src/core/lafea-application-templates/caller-mesh-binding.js';
import {
  createContinuumBenchmarkManifest,
  createContinuumBenchmarkObservation,
  createLafeaContinuumBenchmarkQualification,
} from '../src/core/lafea-application-templates/continuum-benchmark-convergence.js';
import {
  createControlledContinuumExecutionRequest,
} from '../src/core/lafea-application-templates/controlled-continuum-pilot-contract.js';
import {
  createTemplateReleaseRecordV2,
} from '../src/core/lafea-application-templates/release-record-v2.js';
import {
  evaluateTemplateTargetCompatibility,
} from '../src/core/lafea-application-templates/target-compatibility.js';
import {
  createCanonicalLocalContinuumModel,
} from '../src/core/local-continuum/index.js';
import {
  LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  LAFEA_ANALYSIS_MESH_SCHEMA,
  createLafeaAnalysisMeshEvidence,
  lafeaAnalysisMeshContentHash,
} from '../src/workspace/lafea-analysis-mesh-evidence.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_CONTROLLED_CONTINUUM_CONVERGENCE_PROFILE_SCHEMA,
  LAFEA_CONTROLLED_CONTINUUM_CONTROLLER_RESULT_SCHEMA,
  LAFEA_CONTROLLED_CONTINUUM_RECOVERY_PROFILE_SCHEMA,
  executeControlledLafeaContinuumPilot,
} from '../src/workspace/lafea-controlled-continuum-pilot-controller.js';
import { lafeaDocumentDigest } from '../src/workspace/lafea-edit-command.js';
import {
  LAFEA_LUG_PINHOLE_MAPPING_DECLARATION_SCHEMA,
  createLafeaLugPinholeMappingEvidence,
} from '../src/workspace/lafea-lug-pinhole-mapping-evidence.js';
import { issueLafeaSourceAuthority } from '../src/workspace/lafea-source-authority.js';
import {
  createCurrentLafeaTargetAuthoritySnapshot,
} from '../src/workspace/lafea-target-compatibility-authority.js';

const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const FNV = 'fnv1a64:0123456789abcdef';
const MODEL_HASH = hash('NB-T6A-CANONICAL-MODEL');
const GEOMETRY_HASH = hash('NB-T6A-ANALYSIS-GEOMETRY');
let antiDriftCount = 0;

sourceGuards();

const rawLevels = [1, 2, 3].map((refinement) =>
  buildRawLevel(refinement, `LEVEL-${refinement}`));
const document = rawLevels[0].source;
const sourceAuthority = issueLafeaSourceAuthority(
  'LAFEA.3', document, 'NB-T6A-CONTROLLED-PILOT',
);
const authority = releaseAuthority();
const levels = rawLevels.map((raw) => finalizeLevel(raw, sourceAuthority.sourceHash));
const mappingPackage = mappingAuthority(
  authority, sourceAuthority, levels[0], document,
);
const benchmarkQualification = benchmarkAuthority(mappingPackage.semanticHash);
const recoveryProfile = {
  schema: LAFEA_CONTROLLED_CONTINUUM_RECOVERY_PROFILE_SCHEMA,
  loadCaseId: 'LC1',
  quantity: 'VON_MISES',
  reduction: 'MAX_ABSOLUTE',
  units: 'MPa',
  authority: 'RETAINED_INTEGRATION_POINT_VALUES',
};
const convergenceProfile = {
  schema: LAFEA_CONTROLLED_CONTINUUM_CONVERGENCE_PROFILE_SCHEMA,
  quantityId: 'PINHOLE_PEAK_INTEGRATION_POINT_VON_MISES',
  units: 'MPa',
  tolerance: 0.01,
  requireImprovement: true,
};
const request = executionRequest({
  authority,
  mappingPackage,
  benchmarkQualification,
  document,
  levels,
  recoveryProfile,
  convergenceProfile,
});
const options = {
  request,
  releaseRecord: authority.releaseRecord,
  compatibilityReceipt: authority.compatibilityReceipt,
  mappingPackage,
  benchmarkQualification,
  document,
  levels: levels.map((row) => ({
    ordinal: row.ordinal,
    meshEvidence: row.meshEvidence,
    canonicalModel: row.canonicalModel,
  })),
  recoveryProfile,
  convergenceProfile,
};

const accepted = executeControlledLafeaContinuumPilot(options);
assert.equal(accepted.schema, LAFEA_CONTROLLED_CONTINUUM_CONTROLLER_RESULT_SCHEMA);
assert.equal(accepted.status, 'ACCEPTED');
assert.equal(accepted.accepted, true);
assert.equal(accepted.levels.length, 3);
assert.equal(accepted.levels.every((row) => row.evidence.status === 'ACCEPTED'), true);
assert.equal(accepted.levels.every((row) => row.recovery.authority
  === 'RETAINED_INTEGRATION_POINT_VALUES'), true);
assert.deepEqual(accepted.levels.map((row) => row.observedQuantity), [200, 200, 200]);
assert.equal(accepted.receipt.calculationAccepted, true);
assert.equal(accepted.receipt.recoveryReady, true);
assert.equal(accepted.receipt.resultReady, true);
assert.equal(accepted.receipt.convergenceReady, true);
assert.equal(accepted.receipt.assessmentReady, false);
assert.equal(accepted.receipt.codeReady, false);
assert.equal(accepted.receipt.releaseQualified, false);
assert.equal(accepted.receipt.generalT7dAuthorized, false);
assert.equal(accepted.authority.productionMeshGenerated, false);
assert.equal(accepted.authority.lifecycleRegistered, false);
assert.equal(accepted.authority.shellAuthorized, false);
assert.equal(accepted.authority.lafea6Enabled, false);
assert.equal(Object.isFrozen(accepted), true);
assert.equal(Object.isFrozen(accepted.receipt), true);

const repeated = executeControlledLafeaContinuumPilot(options);
assert.equal(repeated.receipt.semanticHash, accepted.receipt.semanticHash);
assert.equal(repeated.receipt.evidenceHash, accepted.receipt.evidenceHash);
antiDriftCount += 1;

blocked('edited source after request', {
  ...options,
  document: { ...structuredClone(document), modelVersion: 'EDITED' },
}, 'LAFEA_NB_T6A_IMPORTED_DOCUMENT_REVISION_STALE');

blocked('recovery profile hash drift', {
  ...options,
  recoveryProfile: { ...recoveryProfile, quantity: 'SIGMA_X' },
}, 'LAFEA_NB_T6A_RECOVERY_PROFILE_HASH_MISMATCH');

const compiled = compiledRelease(authority.snapshot);
const compiledReceipt = evaluateTemplateTargetCompatibility(compiled, authority.snapshot);
const compiledRequest = executionRequest({
  authority: {
    releaseRecord: compiled,
    compatibilityReceipt: compiledReceipt,
  },
  mappingPackage,
  benchmarkQualification,
  document,
  levels,
  recoveryProfile,
  convergenceProfile,
});
blocked('release not engine executable', {
  ...options,
  request: compiledRequest,
  releaseRecord: compiled,
  compatibilityReceipt: compiledReceipt,
}, 'LAFEA_NB_T6A_RELEASE_NOT_ENGINE_EXECUTABLE');

const foreignBenchmark = benchmarkAuthority(hash('OTHER-MAPPING-PACKAGE'));
const foreignBenchmarkRequest = executionRequest({
  authority,
  mappingPackage,
  benchmarkQualification: foreignBenchmark,
  document,
  levels,
  recoveryProfile,
  convergenceProfile,
});
blocked('benchmark mapped to another package', {
  ...options,
  request: foreignBenchmarkRequest,
  benchmarkQualification: foreignBenchmark,
}, 'LAFEA_NB_T6A_BENCHMARK_PARENT_MISMATCH');

const wrongSourceLevel = finalizeLevel(
  buildRawLevel(2, 'WRONG-SOURCE'), hash('WRONG-SOURCE'),
);
const sourceDriftLevels = [levels[0], wrongSourceLevel, levels[2]];
const sourceDriftRequest = executionRequest({
  authority,
  mappingPackage,
  benchmarkQualification,
  document,
  levels: sourceDriftLevels,
  recoveryProfile,
  convergenceProfile,
});
blocked('mesh source parent drift', {
  ...options,
  request: sourceDriftRequest,
  levels: sourceDriftLevels.map(levelOption),
}, 'LAFEA_NB_T6A_SOURCE_PARENT_MISMATCH');

const flatSecond = finalizeLevel(
  buildRawLevel(1, 'FLAT-SECOND'), sourceAuthority.sourceHash,
);
const flatLevels = [levels[0], flatSecond, levels[2]];
const flatRequest = executionRequest({
  authority,
  mappingPackage,
  benchmarkQualification,
  document,
  levels: flatLevels,
  recoveryProfile,
  convergenceProfile,
});
blocked('non-increasing mesh refinement', {
  ...options,
  request: flatRequest,
  levels: flatLevels.map(levelOption),
}, 'LAFEA_NB_T6A_MESH_REFINEMENT_NOT_INCREASING');

const missingLoadRecovery = {
  ...recoveryProfile,
  loadCaseId: 'MISSING',
};
const missingLoadRequest = executionRequest({
  authority,
  mappingPackage,
  benchmarkQualification,
  document,
  levels,
  recoveryProfile: missingLoadRecovery,
  convergenceProfile,
});
blocked('recovery load case absent', {
  ...options,
  request: missingLoadRequest,
  recoveryProfile: missingLoadRecovery,
}, 'LAFEA_NB_T6A_LOAD_CASE_NOT_REQUESTED');

assert.equal(accepted.levels.some((row) =>
  row.recovery.elements.some((element) =>
    element.points.some((point) => Object.hasOwn(point, 'nodalStress')))), false);
assert.equal(accepted.receipt.lifecycleParents.registrationAuthorized, true);
assert.equal(accepted.receipt.lifecycleParents.recoveryHash,
  accepted.levels[2].evidence.recoveryHash);
antiDriftCount += 3;

console.log(JSON.stringify({
  schema: 'lafea-nb-t6a-controlled-continuum-pilot-check/v1',
  status: 'PASS',
  exactHead: HEAD,
  controllerStatus: accepted.status,
  meshElementCounts: levels.map((row) => row.meshEvidence.mesh.elements.length),
  observedQuantity: accepted.levels.map((row) => row.observedQuantity),
  convergenceRelativeChanges: accepted.receipt.pilotConvergence.relativeChanges,
  antiDriftTestCount: antiDriftCount,
  authority: accepted.authority,
}));

function blocked(label, changedOptions, expectedCode) {
  const result = executeControlledLafeaContinuumPilot(changedOptions);
  assert.equal(result.status, 'BLOCKED', label);
  assert.equal(result.accepted, false, label);
  assert.equal(result.diagnostics.includes(expectedCode), true,
    `${label}: ${JSON.stringify(result.diagnostics)}`);
  assert.equal(result.authority.codeReady, false, label);
  assert.equal(result.authority.releaseQualified, false, label);
  antiDriftCount += 1;
}

function levelOption(row) {
  return {
    ordinal: row.ordinal,
    meshEvidence: row.meshEvidence,
    canonicalModel: row.canonicalModel,
  };
}

function executionRequest({
  authority: releaseAuthorityValue,
  mappingPackage: mapping,
  benchmarkQualification: benchmark,
  document: documentValue,
  levels: levelValues,
  recoveryProfile: recovery,
  convergenceProfile: convergence,
}) {
  const revision = lafeaDocumentDigest(documentValue);
  const releaseRecord = releaseAuthorityValue.releaseRecord;
  const compatibilityReceipt = releaseAuthorityValue.compatibilityReceipt;
  return createControlledContinuumExecutionRequest({
    requestId: 'NB-T6A-C2D-LUG-PINHOLE-001',
    releaseRecordHash: releaseRecord.semanticHash,
    releaseAuthorityState: 'ENGINE_EXECUTABLE',
    releaseValidity: 'CURRENT',
    compatibilityReceiptHash: compatibilityReceipt.semanticHash,
    compatibilityStatus: 'CURRENT',
    mappingPackageHash: mapping.semanticHash,
    mappingStatus: mapping.status,
    boundBindingHash: mapping.boundBinding.semanticHash,
    boundBindingStatus: mapping.boundBinding.status,
    benchmarkQualificationHash: benchmark.semanticHash,
    benchmarkStatus: benchmark.status,
    importedDocumentRevisionDigest: revision,
    sourceAuthorityRequest: {
      originRef: 'NB-T6A-CONTROLLED-PILOT',
      expectedStageId: 'LAFEA.3',
      expectedDocumentRevisionDigest: revision,
      requestedRole: 'AUTHORITATIVE_EDITABLE_STAGE_SOURCE',
    },
    canonicalModelHash: MODEL_HASH,
    analysisGeometryHash: GEOMETRY_HASH,
    meshLevels: levelValues.map((row) => ({
      ordinal: row.ordinal,
      meshHash: row.meshEvidence.meshHash,
      meshProfileHash: row.meshEvidence.meshProfileHash,
      elementType: 'T6',
      canonicalModelHash: MODEL_HASH,
      analysisGeometryHash: GEOMETRY_HASH,
    })),
    recoveryProfileHash: canonicalLafeaSha256(recovery),
    convergenceProfileHash: canonicalLafeaSha256(convergence),
  });
}

function releaseAuthority() {
  const snapshot = createCurrentLafeaTargetAuthoritySnapshot('LAFEA.3');
  const compiled = compiledRelease(snapshot);
  const compatibilityReceipt = evaluateTemplateTargetCompatibility(
    compiled, snapshot,
  );
  assert.equal(compatibilityReceipt.status, 'CURRENT');
  const input = releaseInput(compiled);
  input.compositionRoot.compatibilityReceiptHash = compatibilityReceipt.semanticHash;
  input.releaseState = {
    authorityState: 'ENGINE_EXECUTABLE',
    validity: 'CURRENT',
    releaseQualified: false,
    blockedReasons: [],
  };
  const releaseRecord = createTemplateReleaseRecordV2(input);
  const current = evaluateTemplateTargetCompatibility(releaseRecord, snapshot);
  assert.equal(current.status, 'CURRENT');
  assert.equal(current.semanticHash, compatibilityReceipt.semanticHash);
  return { releaseRecord, compatibilityReceipt: current, snapshot };
}

function compiledRelease(snapshot) {
  return createTemplateReleaseRecordV2({
    recordId: 'LAFEA.RELEASE.C2D-LUG-PINHOLE/NB-T6A',
    candidateHeadSha: HEAD,
    template: {
      templateId: 'C2D-LUG-PINHOLE',
      templateRevision: 1,
      templateSemanticHash: FNV,
      templateRegistryHash: FNV,
      bucketId: 'CONTINUUM_2D_FEA',
    },
    parameterSchema: {
      schemaId: 'C2D-LUG-PINHOLE.PARAMETERS/V1', schemaHash: FNV,
    },
    parameterSet: {
      applicability: 'REQUIRED', parameterSetHash: FNV,
      validationResultHash: FNV,
    },
    compiler: {
      applicability: 'REQUIRED',
      bindingSchema: 'lafea-template-compiler-binding/v1',
      bindingHash: FNV,
      compilerVersion: 'NB-T6A.1',
      geometryCompilerId: 'NB-T6A-GEOMETRY',
      loadCompilerId: 'NB-T6A-LOAD',
      boundaryCompilerId: 'NB-T6A-BOUNDARY',
      meshRequestCompilerId: 'NB-T6A-MESH-REQUEST',
    },
    handoff: {
      applicability: 'REQUIRED',
      handoffSchema: 'lafea-template-handoff/v1',
      compilationHash: FNV,
      handoffHash: FNV,
      entryStageId: snapshot.targetStage.stageId,
      stageSourceHash: FNV,
      handoffStatus: 'IMPORTED_FOR_EDITING',
    },
    targetStage: {
      registrySchema: snapshot.targetStage.registrySchema,
      stageId: snapshot.targetStage.stageId,
      stageEntryHash: snapshot.targetStage.registryEntryHash,
      engineState: snapshot.targetStage.engineState,
      enginePackage: snapshot.targetStage.enginePackage,
      stageAuthority: snapshot.targetStage.stageAuthority,
      inputContractRole: snapshot.targetStage.inputContractRole,
      resultContractRole: snapshot.targetStage.resultContractRole,
    },
    compositionRoot: {
      compositionSchema: snapshot.compositionRoot.compositionSchema,
      compositionRootId: snapshot.compositionRoot.compositionRootId,
      compositionRootHash: snapshot.compositionRoot.compositionRootHash,
      componentIdsHash: snapshot.compositionRoot.componentIdsHash,
      releaseStateBinding: snapshot.compositionRoot.releaseStateBinding,
      compatibilityReceiptHash: null,
    },
    lifecycleProfile: { ...snapshot.lifecycleProfile },
    sourceAuthority: {
      applicability: 'REQUIRED',
      requiredSchema: snapshot.sourceContract.sourceAuthoritySchema,
      requiredRole: snapshot.sourceContract.sourceAuthorityRole,
      authorityHash: null,
      sourceHash: null,
      canonicalizationProfile: snapshot.sourceContract.canonicalizationProfile,
      documentRevisionDigest: null,
      originRef: null,
    },
    unitProjection: {
      sourceUnitContractHash: FNV,
      handoffUnitContractHash: FNV,
      targetUnitContractHash: snapshot.unitProjection.targetUnitContractHash,
      projectionProfileHash: FNV,
    },
    meshAuthority: {
      applicability: 'REQUIRED',
      authoritySchema: snapshot.meshRequirement.authoritySchema,
      authorityRole: snapshot.meshRequirement.authorityRole,
      authorityStatus: snapshot.meshRequirement.requiredStatus,
      authorityHash: null,
      sourceHash: null,
      canonicalModelHash: null,
      analysisGeometryHash: null,
      meshProfileHash: null,
      meshHash: null,
      qualityEvidenceHash: null,
    },
    recoveryAuthority: {
      applicability: 'REQUIRED',
      recoveryProfileHash: null,
      recoveryEvidenceHash: null,
      convergenceProfileHash: null,
      convergenceEvidenceHash: null,
    },
    benchmarkManifests: {
      bindingState: snapshot.benchmarkBindings.bindingState,
      manifestIds: [...snapshot.benchmarkBindings.manifestIds],
      manifestHashes: [...snapshot.benchmarkBindings.manifestHashes],
      expectedResultHashes: [],
      benchmarkResultHashes: [],
      independentEvidenceBasisHashes: [],
    },
    productAdapter: {
      applicability: 'NOT_APPLICABLE', componentId: null,
      componentHash: null, productProfileHash: null,
      productEvidenceHash: null, productQualification: null,
    },
    executionEvidence: {
      applicability: 'REQUIRED', requestHash: null, receiptHash: null,
      stageExecutionEvidenceHash: null, lifecycleProducerBatchHash: null,
      resultEvidenceHash: null, calculationAccepted: false,
      resultReady: false, assessmentReady: false, codeReady: false,
    },
    qualificationEvidence: {
      exactHeadArtifactHash: null, buildEvidenceHash: null,
      browserEvidenceHash: null, performanceEvidenceHash: null,
      accessibilityEvidenceHash: null, independentReviewHash: null,
      repositoryIntegrationEvidenceHash: null,
    },
    releaseState: {
      authorityState: 'COMPILED_READY', validity: 'BLOCKED',
      releaseQualified: false,
      blockedReasons: ['B2_COMPATIBILITY_RECEIPT_REQUIRED'],
    },
    diagnostics: [],
  });
}

function releaseInput(record) {
  const input = structuredClone(record);
  delete input.schema;
  delete input.hashProfile;
  delete input.semanticHash;
  delete input.evidenceHash;
  return input;
}

function mappingAuthority(release, source, level, stageSource) {
  const pendingBinding = createTemplateCallerMeshBinding({
    templateId: 'C2D-LUG-PINHOLE',
    templateSemanticHash: release.releaseRecord.template.templateSemanticHash,
    compilationHash: release.releaseRecord.handoff.compilationHash,
    handoffHash: release.releaseRecord.handoff.handoffHash,
    compatibilityReceiptHash: release.compatibilityReceipt.semanticHash,
    targetStageId: 'LAFEA.3',
    targetCompositionRootHash: release.snapshot.compositionRoot.compositionRootHash,
    sourceAuthorityHash: canonicalLafeaSha256(source),
    sourceHash: source.sourceHash,
    canonicalModelHash: MODEL_HASH,
    analysisGeometryHash: GEOMETRY_HASH,
    meshProfileHash: level.meshEvidence.meshProfileHash,
    meshHash: level.meshEvidence.meshHash,
    meshAuthorityHash: canonicalLafeaSha256(level.meshEvidence.authority),
    qualityEvidenceHash: canonicalLafeaSha256(level.meshEvidence.quality),
    materialRegionEvidence: pendingMapping(),
    loadEdgeEvidence: pendingMapping(),
    boundaryEdgeEvidence: pendingMapping(),
  });
  return createLafeaLugPinholeMappingEvidence({
    pendingBinding,
    meshEvidence: level.meshEvidence,
    stageSource,
    applicationEvidence: {
      geometryClass: 'LUG_PINHOLE',
      declarationBasis: 'CALLER_ENGINEERING_CLASSIFICATION',
      featureIds: ['LOAD-EDGE', 'ROOT-REGION'],
      sourceReference: 'APPLICATION#C2D-LUG-PINHOLE',
    },
    declaration: {
      schema: LAFEA_LUG_PINHOLE_MAPPING_DECLARATION_SCHEMA,
      templateId: 'C2D-LUG-PINHOLE',
      stageId: 'LAFEA.3',
      materialRegion: {
        materialId: 'MAT',
        elementIds: level.meshEvidence.mesh.elements.map((row) => row.elementId),
      },
      loadEdge: {
        featureId: 'LOAD-EDGE',
        loadCaseId: 'LC1',
        edgeNodeIds: level.metadata.loadEdgeNodeIds,
        loadIds: ['F1'],
        expectedResultant: [1000, 0],
        tolerance: { absolute: 1e-9, relative: 1e-12 },
      },
      boundaryEdge: {
        featureId: 'ROOT-REGION',
        edgeNodeIds: level.metadata.boundaryEdgeNodeIds,
        constraintIds: level.metadata.boundaryConstraintIds,
      },
    },
  });
}

function pendingMapping() {
  return { applicability: 'REQUIRED', evidenceHash: null, qualification: 'PENDING' };
}

function benchmarkAuthority(mappingPackageHash) {
  const patchManifest = createContinuumBenchmarkManifest({
    benchmarkId: 'CONT-PATCH-01',
    templateId: 'C2D-LUG-PINHOLE',
    stageId: 'LAFEA.3',
    kind: 'ASSEMBLED_Q8_PATCH',
    sourcePath: 'scripts/lafea.3-benchmark-cont-patch-01-check.mjs',
    sourceHash: hash('NB-T6A-PATCH-SOURCE'),
    expectedValueAuthority: 'FROZEN_BEFORE_OBSERVED_EVIDENCE_CONSUMPTION',
    expected: {
      elementType: 'Q8', elementCount: 2, gaussPointsPerElement: 9,
      freeNodeId: 'F', displacement: [0.05, -0.015],
      strain: [0.001, -0.0003, 0], stress: [200, 0, 0],
    },
    tolerances: { recovery: { absolute: 0, relative: 1e-10 } },
  });
  const holeManifest = createContinuumBenchmarkManifest({
    benchmarkId: 'CONT-HOLE-01',
    templateId: 'C2D-LUG-PINHOLE',
    stageId: 'LAFEA.3',
    kind: 'KIRSCH_Q8_THREE_LEVEL',
    sourcePath: 'scripts/lafea.3-benchmark-cont-hole-01-check.mjs',
    sourceHash: hash('NB-T6A-HOLE-SOURCE'),
    expectedValueAuthority: 'FROZEN_BEFORE_OBSERVED_EVIDENCE_CONSUMPTION',
    expected: {
      elementType: 'Q8', remoteStress: 50, theoreticalPeakFactor: 3,
      outerBoundaryCondition: 'EXACT_KIRSCH_TRACTION_ON_TRUNCATED_OUTER_BOUNDARY',
      levels: [
        { ordinal: 1, radialElements: 3, circumferentialElements: 6 },
        { ordinal: 2, radialElements: 6, circumferentialElements: 12 },
        { ordinal: 3, radialElements: 10, circumferentialElements: 20 },
      ],
      requirements: {
        peakFinestRelativeErrorMax: 0.05,
        fullFieldFinestNormalizedErrorMax: 0.05,
        requirePeakImprovementFirstToFinest: true,
        requireStrictFieldMonotonicity: true,
      },
    },
    tolerances: { comparison: { absolute: 0, relative: 0 } },
  });
  const patchObservation = createContinuumBenchmarkObservation({
    manifest: patchManifest,
    sourceHash: patchManifest.sourceHash,
    observed: {
      recoveryHash: hash('NB-T6A-PATCH-RECOVERY'),
      meshHash: hash('NB-T6A-PATCH-MESH'),
      elementType: 'Q8', elementCount: 2, gaussPointsPerElement: 9,
      freeNodeId: 'F', displacement: [0.05, -0.015],
      strain: [0.001, -0.0003, 0], stress: [200, 0, 0],
    },
  });
  const holeObservation = createContinuumBenchmarkObservation({
    manifest: holeManifest,
    sourceHash: holeManifest.sourceHash,
    observed: {
      levels: [
        holeLevel(1, 3, 6, 2.70, 0.12),
        holeLevel(2, 6, 12, 2.90, 0.07),
        holeLevel(3, 10, 20, 2.98, 0.03),
      ],
    },
  });
  return createLafeaContinuumBenchmarkQualification({
    producerRevision: 'NB-T6A/B7B.1',
    exactHeadSha: HEAD,
    mappingPackageHash,
    patchManifest,
    patchObservation,
    holeManifest,
    holeObservation,
  });
}

function holeLevel(ordinal, radialElements, circumferentialElements,
  peakFactor, fullFieldNormalizedError) {
  return {
    ordinal, radialElements, circumferentialElements,
    meshHash: hash(`NB-T6A-HOLE-MESH-${ordinal}`),
    recoveryHash: hash(`NB-T6A-HOLE-RECOVERY-${ordinal}`),
    peakFactor, fullFieldNormalizedError,
  };
}

function finalizeLevel(raw, sourceHash) {
  const meshHash = lafeaAnalysisMeshContentHash(raw.mesh);
  const meshEvidence = createLafeaAnalysisMeshEvidence({
    schema: LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
    stageId: 'LAFEA.3',
    sourceHash,
    canonicalModelHash: MODEL_HASH,
    analysisGeometryHash: GEOMETRY_HASH,
    meshProfile: raw.profile,
    mesh: raw.mesh,
    authority: {
      schema: LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
      stageId: 'LAFEA.3',
      authorityRole: 'STAGE_AUTHORIZED_ANALYSIS_MESH',
      status: 'ACCEPTED_BY_STAGE_CONTRACT',
      producerRef: `NB-T6A/TEST/${raw.identity}`,
      sourceHash,
      canonicalModelHash: MODEL_HASH,
      analysisGeometryHash: GEOMETRY_HASH,
      meshProfileHash: raw.profile.semanticHash,
      meshHash,
    },
  });
  return {
    ordinal: raw.ordinal,
    meshEvidence,
    canonicalModel: createCanonicalLocalContinuumModel(raw.source),
    metadata: raw.metadata,
  };
}

function buildRawLevel(refinement, identity) {
  const generated = structuredT6Mesh(refinement, identity);
  const profile = canonicalProfile(PROFILE_KINDS.MESH, {
    schema: 'lafea-mesh-profile/v1',
    profileIdentity: `NB-T6A-${identity}-PROFILE`,
    sourceRevision: '1',
    fields: {
      continuumElement: 'T6',
      shellElement: 'CST_DKT_TRI3_THIN_SHELL_V1',
      globalTargetSize: 100 / refinement,
      adjacentSizeRatioMax: 1.5,
      aspectRatioWarn: 3,
      aspectRatioBlock: 6,
      scaledJacobianWarn: 0.3,
      scaledJacobianBlock: 0.1,
      adaptiveLevels: 3,
    },
    semanticHash: undefined,
  });
  const constraints = generated.nodes.flatMap((node) => [
    constraint(node, 'UX', 0.001 * node.x),
    constraint(node, 'UY', -0.0003 * node.y),
  ]);
  const source = {
    schema: 'local-continuum-model/v1',
    modelIdentity: `NB-T6A-${identity}`,
    modelVersion: '1',
    sourceAncestry: {
      sourceModelIdentity: 'C2D-LUG-PINHOLE',
      sourceVersion: '1',
      adapterIdentity: 'NB-T6A-CONTROLLED-PILOT',
      adapterVersion: '1',
    },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: 'PLANE_STRESS',
    materials: [{
      materialId: 'MAT', elasticModulus: 200000, poissonRatio: 0.3,
      sourceReference: 'MATERIAL#MAT',
    }],
    nodes: generated.nodes.map((node) => ({
      nodeId: node.nodeId, x: node.x, y: node.y,
      sourceReference: `NODE#${node.nodeId}`,
    })),
    elements: generated.elements.map((element) => ({
      elementId: element.elementId,
      elementType: 'T6',
      nodeIds: element.nodeIds,
      materialId: 'MAT',
      thickness: 10,
      sourceReference: `ELEMENT#${element.elementId}`,
    })),
    elementTypePolicy: {
      allowT3Fallback: false,
      sourceReference: 'NB-T6A-T6-ONLY',
    },
    constraints,
    loadCases: [{
      loadCaseId: 'LC1',
      nodalForces: [{
        loadId: 'F1', nodeId: generated.metadata.loadNodeId,
        fx: 1000, fy: 0, sourceReference: 'LOAD#F1',
      }],
      edgeTractions: [], pressureLoads: [], bodyForces: [],
      temperatureLoads: [], imposedDisplacements: [],
      sourceReference: 'CASE#LC1',
    }],
    resultRequests: { loadCaseIds: ['LC1'] },
    qualificationProfile: {
      schema: 'local-continuum-qualification-profile/v1',
      identity: `NB-T6A-${identity}-QUALIFICATION`,
      tolerances: toleranceTable(),
    },
    limitations: [],
  };
  return {
    ordinal: refinement,
    identity,
    source,
    profile,
    mesh: {
      schema: LAFEA_ANALYSIS_MESH_SCHEMA,
      meshIdentity: `NB-T6A-${identity}-MESH`,
      nodes: generated.nodes.map((node) => ({ ...node, z: 0 })),
      elements: generated.elements,
    },
    metadata: generated.metadata,
  };
}

function structuredT6Mesh(divisions, identity) {
  const nodes = new Map();
  const elements = [];
  const cornerId = (i, j) => `V-${i}-${j}`;
  for (let j = 0; j <= divisions; j += 1) {
    for (let i = 0; i <= divisions; i += 1) {
      nodes.set(cornerId(i, j), {
        nodeId: cornerId(i, j),
        x: 100 * i / divisions,
        y: 100 * j / divisions,
      });
    }
  }
  const midpoint = (leftId, rightId) => {
    const pair = [leftId, rightId].sort();
    const nodeId = `M-${pair[0]}--${pair[1]}`;
    if (!nodes.has(nodeId)) {
      const left = nodes.get(leftId);
      const right = nodes.get(rightId);
      nodes.set(nodeId, {
        nodeId,
        x: (left.x + right.x) / 2,
        y: (left.y + right.y) / 2,
      });
    }
    return nodeId;
  };
  const addTriangle = (elementId, a, b, c) => {
    elements.push({
      elementId,
      elementType: 'T6',
      nodeIds: [a, b, c, midpoint(a, b), midpoint(b, c), midpoint(c, a)],
    });
  };
  for (let j = 0; j < divisions; j += 1) {
    for (let i = 0; i < divisions; i += 1) {
      const v00 = cornerId(i, j);
      const v10 = cornerId(i + 1, j);
      const v11 = cornerId(i + 1, j + 1);
      const v01 = cornerId(i, j + 1);
      addTriangle(`E-${identity}-${i}-${j}-A`, v00, v10, v11);
      addTriangle(`E-${identity}-${i}-${j}-B`, v00, v11, v01);
    }
  }
  const first = elements[0];
  const v00 = cornerId(0, 0);
  const v10 = cornerId(1, 0);
  const v11 = cornerId(1, 1);
  return {
    nodes: [...nodes.values()],
    elements,
    metadata: {
      loadNodeId: v10,
      loadEdgeNodeIds: [v10, midpoint(v10, v11), v11],
      boundaryEdgeNodeIds: [v00, midpoint(v00, v10), v10],
      boundaryConstraintIds: [
        `C-${v00}-UX`, `C-${v00}-UY`, `C-${v10}-UY`,
      ],
      firstElementId: first.elementId,
    },
  };
}

function constraint(node, dof, value) {
  return {
    constraintId: `C-${node.nodeId}-${dof}`,
    nodeId: node.nodeId,
    dof,
    value,
    sourceReference: `CONSTRAINT#${node.nodeId}-${dof}`,
  };
}

function toleranceTable() {
  const tight = { absolute: 1e-9, relative: 1e-9 };
  const loose = { absolute: 1e-4, relative: 1e-4 };
  return {
    minimumElementArea: tight,
    stiffnessSymmetry: tight,
    constitutiveSymmetry: tight,
    choleskyPivot: tight,
    freeDofResidual: loose,
    reactionEquilibrium: loose,
    strainEnergy: loose,
    rigidBodyStrain: tight,
    patchTestStress: tight,
  };
}

function sourceGuards() {
  const source = fs.readFileSync(
    'src/workspace/lafea-controlled-continuum-pilot-controller.js', 'utf8',
  );
  assert.match(source, /calculateLocalContinuum/u);
  assert.match(source, /issueLafeaSourceAuthority/u);
  assert.doesNotMatch(source, /\bexecuteLafeaStage\s*\(/u);
  assert.doesNotMatch(source, /\bregisterLafeaArtifact\s*\(/u);
  assert.doesNotMatch(source, /\bregisterLafeaLifecycle\w*\s*\(/u);
  assert.doesNotMatch(source, /from ['"][^'"]*(?:local-shell|local-trunnion|canvas|workbench-view|wizard|panel)[^'"]*['"]/u);
  assert.doesNotMatch(source, /\b(?:projectElementGaussStressToNodes|averageWithinGroups)\s*\(/u);
  assert.doesNotMatch(source, /MITC4|MITC3/u);
  antiDriftCount += 8;
}

function hash(value) {
  return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
}
