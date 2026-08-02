import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  PROFILE_KINDS,
  canonicalProfile,
} from '../src/core/lafea-profile-contract/index.js';
import {
  createContinuumBenchmarkManifest,
  createContinuumBenchmarkObservation,
  createLafeaContinuumBenchmarkQualification,
} from '../src/core/lafea-application-templates/continuum-benchmark-convergence.js';
import { createTemplateReleaseRecordV2 } from '../src/core/lafea-application-templates/release-record-v2.js';
import { evaluateTemplateTargetCompatibility } from '../src/core/lafea-application-templates/target-compatibility.js';
import {
  LAFEA_LUG_PINHOLE_FEATURE_PROJECTION_SCHEMA,
  LAFEA_LUG_PINHOLE_PHYSICAL_PROBLEM_SCHEMA,
  LAFEA_LUG_PINHOLE_PROJECTION_INTAKE_SCHEMA,
} from '../src/workspace/lafea-controlled-continuum-public.js';
import { createCurrentLafeaTargetAuthoritySnapshot } from '../src/workspace/lafea-target-compatibility-authority.js';

const PATCH_PATH = 'scripts/lafea.3-benchmark-cont-patch-01-check.mjs';
const HOLE_PATH = 'scripts/lafea.3-benchmark-cont-hole-01-check.mjs';

export function createNbT6cFixture(root, head) {
  const snapshot = createCurrentLafeaTargetAuthoritySnapshot('LAFEA.3');
  const authority = templateAuthority(snapshot, head);
  return {
    projectionInput: validProjectionInput(authority),
    benchmark: (mappingHash) => benchmarkEvidence(root, head, mappingHash),
    hash,
  };
}

function validProjectionInput(authority) {
  return {
    schema: LAFEA_LUG_PINHOLE_PROJECTION_INTAKE_SCHEMA,
    releaseRecord: authority.releaseRecord,
    compatibilityReceipt: authority.compatibilityReceipt,
    canonicalModelHash: hash('NB-T6C-CANONICAL-MODEL'),
    geometry: {
      center: { x: 0, y: 0 }, holeRadius: 20,
      outerRadius: 100, startAngleDegrees: 0,
    },
    levels: [level(1, 1, 8), level(2, 2, 16), level(3, 4, 32)],
    physicalProblem: {
      schema: LAFEA_LUG_PINHOLE_PHYSICAL_PROBLEM_SCHEMA,
      modelIdentity: 'NB-T6C-C2D-LUG-PINHOLE',
      modelVersion: '1',
      sourceAncestry: {
        sourceModelIdentity: 'NB-T6C-C2D-LUG-PINHOLE',
        sourceVersion: '1',
        adapterIdentity: 'NB-T6C-PHYSICAL-PROBLEM-PROJECTOR',
        adapterVersion: '1',
      },
      units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
      material: {
        materialId: 'MAT', elasticModulus: 200000, poissonRatio: 0.3,
        sourceReference: 'MATERIAL#MAT',
      },
      thickness: 10,
      loadCase: {
        loadCaseId: 'LC1', loadIdPrefix: 'LOAD-LC1',
        resultant: [0, 0], sourceReference: 'CASE#LC1',
      },
      resultRequests: { loadCaseIds: ['LC1'] },
      qualificationProfile: {
        schema: 'local-continuum-qualification-profile/v1',
        identity: 'NB-T6C-AFFINE-T6-PROFILE',
        tolerances: toleranceTable(),
      },
      limitations: [
        'CONCENTRIC_ANNULAR_LUG_PINHOLE_ONLY',
        'AFFINE_QUALIFICATION_FIELD',
      ],
      kinematics: {
        mode: 'AFFINE_FULL_FIELD',
        ux: { xCoefficient: 0.001, yCoefficient: 0, constant: 0 },
        uy: { xCoefficient: 0, yCoefficient: 0, constant: 0 },
      },
    },
    featureProjection: {
      schema: LAFEA_LUG_PINHOLE_FEATURE_PROJECTION_SCHEMA,
      loadFeature: {
        featureId: 'LOAD-EDGE', role: 'OUTER_BOUNDARY',
        baseStartEdge: 0, baseEdgeCount: 1,
      },
      boundaryFeature: {
        featureId: 'ROOT-REGION', role: 'RADIAL_QUARTER_1',
        baseStartEdge: 0, baseEdgeCount: 1,
      },
      loadTolerance: { absolute: 1e-10, relative: 1e-10 },
    },
    applicationEvidence: {
      geometryClass: 'LUG_PINHOLE',
      declarationBasis: 'CALLER_ENGINEERING_CLASSIFICATION',
      featureIds: ['LOAD-EDGE', 'ROOT-REGION'],
      sourceReference: 'APPLICATION#C2D-LUG-PINHOLE',
    },
    producerRef: 'NB-T6C/C2D-LUG-PINHOLE/LAFEA.3',
    sourceAuthorityOriginRef: 'NB-T6C/C2D-LUG-PINHOLE',
  };
}

function level(ordinal, radialDivisions, circumferentialDivisions) {
  return {
    ordinal,
    meshIdentity: `NB-T6C-T6-L${ordinal}`,
    radialDivisions,
    circumferentialDivisions,
    meshProfile: canonicalProfile(PROFILE_KINDS.MESH, {
      schema: 'lafea-mesh-profile/v1',
      profileIdentity: `NB-T6C-T6-LEVEL-${ordinal}`,
      sourceRevision: '1',
      fields: {
        continuumElement: 'T6',
        shellElement: 'CST_DKT_TRI3_THIN_SHELL_V1',
        globalTargetSize: 100 / circumferentialDivisions,
        adjacentSizeRatioMax: 1.5,
        aspectRatioWarn: 5,
        aspectRatioBlock: 20,
        scaledJacobianWarn: 0.2,
        scaledJacobianBlock: 0.01,
        adaptiveLevels: 3,
      },
      semanticHash: undefined,
    }),
  };
}

function templateAuthority(snapshot, head) {
  const compiled = createTemplateReleaseRecordV2(
    releaseInput(snapshot, head, null, {
      authorityState: 'COMPILED_READY', validity: 'BLOCKED',
      releaseQualified: false, blockedReasons: ['NB_T6C_COMPATIBILITY_REQUIRED'],
    }),
  );
  const provisional = evaluateTemplateTargetCompatibility(compiled, snapshot);
  assert.equal(provisional.status, 'CURRENT');
  const releaseRecord = createTemplateReleaseRecordV2(
    releaseInput(snapshot, head, provisional.semanticHash, {
      authorityState: 'ENGINE_EXECUTABLE', validity: 'CURRENT',
      releaseQualified: false, blockedReasons: [],
    }),
  );
  const compatibilityReceipt = evaluateTemplateTargetCompatibility(
    releaseRecord,
    snapshot,
  );
  assert.equal(compatibilityReceipt.status, 'CURRENT');
  assert.equal(compatibilityReceipt.semanticHash, provisional.semanticHash);
  return { releaseRecord, compatibilityReceipt };
}

function releaseInput(snapshot, head, compatibilityReceiptHash, releaseState) {
  const fnv = 'fnv1a64:0123456789abcdef';
  return {
    recordId: 'LAFEA.RELEASE.C2D-LUG-PINHOLE/NB-T6C',
    candidateHeadSha: head,
    template: {
      templateId: 'C2D-LUG-PINHOLE', templateRevision: 1,
      templateSemanticHash: fnv, templateRegistryHash: fnv,
      bucketId: 'CONTINUUM_2D_FEA',
    },
    parameterSchema: { schemaId: 'C2D-LUG-PINHOLE.PARAMETERS/V1', schemaHash: fnv },
    parameterSet: {
      applicability: 'REQUIRED', parameterSetHash: fnv, validationResultHash: fnv,
    },
    compiler: {
      applicability: 'REQUIRED',
      bindingSchema: 'lafea-template-continuum-compiler-binding/v1',
      bindingHash: fnv, compilerVersion: 'NB-T6C.1',
      geometryCompilerId: 'NB-T6C-CONTINUUM-GEOMETRY',
      loadCompilerId: 'NB-T6C-CONTINUUM-LOADS',
      boundaryCompilerId: 'NB-T6C-CONTINUUM-BOUNDARY',
      meshRequestCompilerId: 'NB-T6B-PRODUCTION-T6-LADDER',
    },
    handoff: {
      applicability: 'REQUIRED', handoffSchema: 'lafea-template-handoff/v1',
      compilationHash: fnv, handoffHash: fnv, entryStageId: 'LAFEA.3',
      stageSourceHash: fnv, handoffStatus: 'READY',
    },
    targetStage: {
      registrySchema: snapshot.targetStage.registrySchema,
      stageId: 'LAFEA.3', stageEntryHash: snapshot.targetStage.registryEntryHash,
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
      compatibilityReceiptHash,
    },
    lifecycleProfile: { ...snapshot.lifecycleProfile },
    sourceAuthority: {
      applicability: 'REQUIRED',
      requiredSchema: snapshot.sourceContract.sourceAuthoritySchema,
      requiredRole: snapshot.sourceContract.sourceAuthorityRole,
      authorityHash: null, sourceHash: null,
      canonicalizationProfile: snapshot.sourceContract.canonicalizationProfile,
      documentRevisionDigest: null, originRef: null,
    },
    unitProjection: {
      sourceUnitContractHash: fnv, handoffUnitContractHash: fnv,
      targetUnitContractHash: snapshot.unitProjection.targetUnitContractHash,
      projectionProfileHash: fnv,
    },
    meshAuthority: {
      applicability: 'REQUIRED',
      authoritySchema: snapshot.meshRequirement.authoritySchema,
      authorityRole: snapshot.meshRequirement.authorityRole,
      authorityStatus: snapshot.meshRequirement.requiredStatus,
      authorityHash: null, sourceHash: null, canonicalModelHash: null,
      analysisGeometryHash: null, meshProfileHash: null, meshHash: null,
      qualityEvidenceHash: null,
    },
    recoveryAuthority: {
      applicability: 'REQUIRED', recoveryProfileHash: null,
      recoveryEvidenceHash: null, convergenceProfileHash: null,
      convergenceEvidenceHash: null,
    },
    benchmarkManifests: {
      bindingState: snapshot.benchmarkBindings.bindingState,
      manifestIds: [...snapshot.benchmarkBindings.manifestIds],
      manifestHashes: [...snapshot.benchmarkBindings.manifestHashes],
      expectedResultHashes: [], benchmarkResultHashes: [],
      independentEvidenceBasisHashes: [],
    },
    productAdapter: {
      applicability: 'NOT_APPLICABLE', componentId: null, componentHash: null,
      productProfileHash: null, productEvidenceHash: null,
      productQualification: null,
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
    releaseState,
    diagnostics: [],
  };
}

function benchmarkEvidence(root, head, mappingPackageHash) {
  const patchManifest = createContinuumBenchmarkManifest({
    benchmarkId: 'CONT-PATCH-01', templateId: 'C2D-LUG-PINHOLE',
    stageId: 'LAFEA.3', kind: 'ASSEMBLED_Q8_PATCH',
    sourcePath: PATCH_PATH, sourceHash: fileHash(root, PATCH_PATH),
    expectedValueAuthority: 'FROZEN_BEFORE_OBSERVED_EVIDENCE_CONSUMPTION',
    expected: {
      elementType: 'Q8', elementCount: 2, gaussPointsPerElement: 9,
      freeNodeId: 'F', displacement: [0.05, -0.015],
      strain: [0.001, -0.0003, 0], stress: [200, 0, 0],
    },
    tolerances: { recovery: { absolute: 0, relative: 1e-10 } },
  });
  const holeManifest = createContinuumBenchmarkManifest({
    benchmarkId: 'CONT-HOLE-01', templateId: 'C2D-LUG-PINHOLE',
    stageId: 'LAFEA.3', kind: 'KIRSCH_Q8_THREE_LEVEL',
    sourcePath: HOLE_PATH, sourceHash: fileHash(root, HOLE_PATH),
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
      recoveryHash: hash('NB-T6C-PATCH-RECOVERY'),
      meshHash: hash('NB-T6C-PATCH-MESH'),
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
    producerRevision: 'B7B.1', exactHeadSha: head, mappingPackageHash,
    patchManifest, patchObservation, holeManifest, holeObservation,
  });
}

function holeLevel(ordinal, radialElements, circumferentialElements,
  peakFactor, fullFieldNormalizedError) {
  return {
    ordinal, radialElements, circumferentialElements,
    meshHash: hash(`NB-T6C-HOLE-MESH-${ordinal}`),
    recoveryHash: hash(`NB-T6C-HOLE-RECOVERY-${ordinal}`),
    peakFactor, fullFieldNormalizedError,
  };
}
function toleranceTable() {
  const tight = { absolute: 1e-9, relative: 1e-9 };
  const loose = { absolute: 1e-5, relative: 1e-5 };
  return {
    minimumElementArea: tight, stiffnessSymmetry: tight,
    constitutiveSymmetry: tight, choleskyPivot: tight,
    freeDofResidual: loose, reactionEquilibrium: loose,
    strainEnergy: loose, rigidBodyStrain: tight, patchTestStress: tight,
  };
}
function fileHash(root, filePath) {
  return `sha256:${createHash('sha256')
    .update(fs.readFileSync(path.join(root, filePath))).digest('hex')}`;
}
function hash(value) {
  return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
}
