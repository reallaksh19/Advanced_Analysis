#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROFILE_KINDS,
  canonicalProfile,
} from '../src/core/lafea-profile-contract/index.js';
import {
  createControlledContinuumExecutionRequest,
} from '../src/core/lafea-application-templates/controlled-continuum-pilot-contract.js';
import {
  createContinuumBenchmarkManifest,
  createContinuumBenchmarkObservation,
  createLafeaContinuumBenchmarkQualification,
} from '../src/core/lafea-application-templates/continuum-benchmark-convergence.js';
import {
  createTemplateReleaseRecordV2,
} from '../src/core/lafea-application-templates/release-record-v2.js';
import {
  evaluateTemplateTargetCompatibility,
} from '../src/core/lafea-application-templates/target-compatibility.js';
import {
  LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  LAFEA_ANALYSIS_MESH_SCHEMA,
  createLafeaAnalysisMeshEvidence,
  lafeaAnalysisMeshContentHash,
} from '../src/workspace/lafea-analysis-mesh-evidence.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  executeControlledLafeaContinuumPilot,
} from '../src/workspace/lafea-controlled-continuum-public.js';
import { lafeaDocumentDigest } from '../src/workspace/lafea-edit-command.js';
import {
  LAFEA_LUG_PINHOLE_MAPPING_DECLARATION_SCHEMA,
  createLafeaLugPinholeMappingEvidence,
} from '../src/workspace/lafea-lug-pinhole-mapping-evidence.js';
import { issueLafeaSourceAuthority } from '../src/workspace/lafea-source-authority.js';
import {
  createCurrentLafeaTargetAuthoritySnapshot,
} from '../src/workspace/lafea-target-compatibility-authority.js';
import {
  bindLafeaContinuumTemplateCallerMesh,
} from '../src/workspace/lafea-template-caller-mesh-binding.js';
import {
  normalizeLafeaStageDocument,
} from '../src/workspace/lafea-workbench-model.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const PATCH_PATH = 'scripts/lafea.3-benchmark-cont-patch-01-check.mjs';
const HOLE_PATH = 'scripts/lafea.3-benchmark-cont-hole-01-check.mjs';
const MODEL_HASH = hash('B7D-CANONICAL-MODEL');
const GEOMETRY_HASH = hash('B7D-ANALYSIS-GEOMETRY');
const EPS_X = 0.001;
let negativeCount = 0;

sourceGuards();

const stageLevels = [2, 4, 8].map((subdivisions, index) =>
  continuumLevel(index + 1, subdivisions));
const baseDocument = stageLevels[0].document;
const sourceAuthority = issueLafeaSourceAuthority(
  'LAFEA.3', baseDocument, 'B7D/C2D-LUG-PINHOLE',
);
const sourceAuthorityHash = canonicalLafeaSha256(sourceAuthority);
const meshEvidence = stageLevels.map((row) => createMeshEvidence(
  row, sourceAuthority.sourceHash,
));

const snapshot = createCurrentLafeaTargetAuthoritySnapshot('LAFEA.3');
const authority = templateAuthority(snapshot);
const pendingBinding = bindLafeaContinuumTemplateCallerMesh({
  releaseRecord: authority.releaseRecord,
  compatibilityReceipt: authority.compatibilityReceipt,
  meshEvidence: meshEvidence[0],
  sourceAuthorityHash,
  materialRegionEvidence: pendingMapping(),
  loadEdgeEvidence: pendingMapping(),
  boundaryEdgeEvidence: pendingMapping(),
});
assert.equal(pendingBinding.status, 'MAPPING_EVIDENCE_PENDING');

const mappingPackage = createLafeaLugPinholeMappingEvidence({
  pendingBinding,
  meshEvidence: meshEvidence[0],
  stageSource: baseDocument,
  applicationEvidence: {
    geometryClass: 'LUG_PINHOLE',
    declarationBasis: 'CALLER_ENGINEERING_CLASSIFICATION',
    featureIds: ['LOAD-EDGE', 'ROOT-REGION'],
    sourceReference: 'APPLICATION#C2D-LUG-PINHOLE',
  },
  declaration: mappingDeclaration(stageLevels[0]),
});
assert.equal(mappingPackage.status, 'MAPPING_EVIDENCE_QUALIFIED');
assert.equal(mappingPackage.boundBinding.status, 'BOUND');

const benchmarkQualification = benchmarkEvidence(mappingPackage.semanticHash);
assert.equal(
  benchmarkQualification.status,
  'BENCHMARK_EVIDENCE_QUALIFIED',
);

const request = createControlledContinuumExecutionRequest({
  requestId: 'B7D-C2D-LUG-PINHOLE-001',
  releaseRecordHash: authority.releaseRecord.semanticHash,
  releaseAuthorityState: authority.releaseRecord.releaseState.authorityState,
  releaseValidity: authority.releaseRecord.releaseState.validity,
  compatibilityReceiptHash: authority.compatibilityReceipt.semanticHash,
  compatibilityStatus: authority.compatibilityReceipt.status,
  mappingPackageHash: mappingPackage.semanticHash,
  mappingStatus: mappingPackage.status,
  boundBindingHash: mappingPackage.boundBinding.semanticHash,
  boundBindingStatus: mappingPackage.boundBinding.status,
  benchmarkQualificationHash: benchmarkQualification.semanticHash,
  benchmarkStatus: benchmarkQualification.status,
  importedDocumentRevisionDigest: lafeaDocumentDigest(baseDocument),
  sourceAuthorityRequest: {
    originRef: 'B7D/C2D-LUG-PINHOLE',
    expectedStageId: 'LAFEA.3',
    expectedDocumentRevisionDigest: lafeaDocumentDigest(baseDocument),
    requestedRole: 'AUTHORITATIVE_EDITABLE_STAGE_SOURCE',
  },
  canonicalModelHash: MODEL_HASH,
  analysisGeometryHash: GEOMETRY_HASH,
  meshLevels: meshEvidence.map((evidence, index) => ({
    ordinal: index + 1,
    meshHash: evidence.meshHash,
    meshProfileHash: evidence.meshProfileHash,
    elementType: 'T6',
    canonicalModelHash: MODEL_HASH,
    analysisGeometryHash: GEOMETRY_HASH,
  })),
  recoveryProfileHash: hash('B7D-RETAINED-INTEGRATION-POINT-RECOVERY'),
  convergenceProfileHash:
    benchmarkQualification.lifecycleParentProposal.convergenceProfileHash,
});

const options = {
  request,
  releaseRecord: authority.releaseRecord,
  compatibilityReceipt: authority.compatibilityReceipt,
  mappingPackage,
  benchmarkQualification,
  document: baseDocument,
  levels: stageLevels.map((row, index) => ({
    ordinal: index + 1,
    document: row.document,
    meshEvidence: meshEvidence[index],
  })),
  convergenceRequest: {
    quantityId: 'PINHOLE_MAX_RETAINED_VON_MISES',
    units: 'MPa',
    tolerance: 1e-8,
    loadCaseId: 'LC1',
    component: 'VON_MISES',
    reducer: 'MAXIMUM_SIGNED',
  },
};

const accepted = executeControlledLafeaContinuumPilot(options);
assert.equal(accepted.status, 'ACCEPTED');
assert.equal(accepted.accepted, true);
assert.equal(accepted.levelResults.length, 3);
assert.deepEqual(
  accepted.levelResults.map((row) => row.meshEvidence.mesh.elements.length),
  [4, 16, 64],
);
assert.equal(accepted.levelResults.every((row) =>
  row.levelEvidence.status === 'ACCEPTED'
  && row.levelEvidence.recoveryAuthority
    === 'RETAINED_INTEGRATION_POINT_VALUES'
  && row.levelEvidence.projectedDisplayHash === null), true);
assert.equal(accepted.receipt.calculationAccepted, true);
assert.equal(accepted.receipt.recoveryReady, true);
assert.equal(accepted.receipt.resultReady, true);
assert.equal(accepted.receipt.convergenceReady, true);
assert.equal(accepted.receipt.assessmentReady, false);
assert.equal(accepted.receipt.codeReady, false);
assert.equal(accepted.receipt.releaseQualified, false);
assert.equal(accepted.receipt.generalT7dAuthorized, false);
assert.equal(accepted.readiness.resultReady, true);
assert.equal(accepted.readiness.convergenceReady, true);
assert.equal(accepted.readiness.codeReady, false);
assert.equal(accepted.lifecycle.artifacts.CONVERGENCE.qualification, 'PASS');
assert.equal(accepted.authority.boundedPilotExecution, true);
assert.equal(accepted.authority.generalT7dAuthorized, false);
assert.equal(accepted.authority.shellAuthorized, false);
assert.ok(Object.isFrozen(accepted));

const deterministic = executeControlledLafeaContinuumPilot(options);
assert.equal(deterministic.receipt.semanticHash, accepted.receipt.semanticHash);
assert.equal(deterministic.receipt.evidenceHash, accepted.receipt.evidenceHash);

blocked('edited document after request', {
  ...options,
  document: { ...structuredClone(baseDocument), modelVersion: 'EDITED' },
}, 'LAFEA_B7D_IMPORTED_DOCUMENT_REVISION_STALE');

const staleBenchmark = benchmarkEvidence(hash('OTHER-MAPPING'));
const staleBenchmarkRequest = createControlledContinuumExecutionRequest({
  ...requestInput(request),
  benchmarkQualificationHash: staleBenchmark.semanticHash,
  benchmarkStatus: staleBenchmark.status,
});
blocked('stale benchmark mapping parent', {
  ...options,
  request: staleBenchmarkRequest,
  benchmarkQualification: staleBenchmark,
}, 'LAFEA_B7D_BENCHMARK_MAPPING_PARENT_STALE');

blocked('physical problem drift', {
  ...options,
  levels: options.levels.map((row, index) => index === 1
    ? {
        ...row,
        document: {
          ...structuredClone(row.document),
          materials: row.document.materials.map((material) => ({
            ...material,
            elasticModulus: material.elasticModulus * 0.9,
          })),
        },
      }
    : row),
}, 'LAFEA_B7D_LEVEL_PHYSICAL_PROBLEM_CHANGED');

const sameCountLevel = alternateSameCountLevel(stageLevels[1], 3);
const sameCountEvidence = createMeshEvidence(
  sameCountLevel,
  sourceAuthority.sourceHash,
);
const sameCountRequest = createControlledContinuumExecutionRequest({
  ...requestInput(request),
  meshLevels: [
    request.meshLevels[0],
    request.meshLevels[1],
    {
      ordinal: 3,
      meshHash: sameCountEvidence.meshHash,
      meshProfileHash: sameCountEvidence.meshProfileHash,
      elementType: 'T6',
      canonicalModelHash: MODEL_HASH,
      analysisGeometryHash: GEOMETRY_HASH,
    },
  ],
});
blocked('non-increasing refinement', {
  ...options,
  request: sameCountRequest,
  levels: [
    options.levels[0],
    options.levels[1],
    {
      ordinal: 3,
      document: sameCountLevel.document,
      meshEvidence: sameCountEvidence,
    },
  ],
}, 'LAFEA_B7D_MESH_REFINEMENT_NOT_INCREASING');

const tamperedMesh = structuredClone(meshEvidence[1]);
tamperedMesh.quality.elementCount += 1;
blocked('tampered mesh evidence', {
  ...options,
  levels: options.levels.map((row, index) => index === 1
    ? { ...row, meshEvidence: tamperedMesh } : row),
}, 'LAFEA_B7D_MESH_EVIDENCE_TAMPERED');

const convergenceDrift = structuredClone(stageLevels[2].document);
convergenceDrift.constraints = convergenceDrift.constraints.map((row) =>
  row.dof === 'UX' ? { ...row, value: row.value * 1.5 } : row);
const convergenceDriftResult = executeControlledLafeaContinuumPilot({
  ...options,
  levels: options.levels.map((row, index) => index === 2
    ? { ...row, document: convergenceDrift } : row),
});
assert.equal(convergenceDriftResult.status, 'BLOCKED');
assert.equal(convergenceDriftResult.receipt.resultReady, true);
assert.equal(convergenceDriftResult.receipt.convergenceReady, false);
assert.equal(
  convergenceDriftResult.receipt.diagnostics.includes(
    'PILOT_FINE_LEVEL_CHANGE_EXCEEDS_TOLERANCE',
  ),
  true,
);
negativeCount += 1;

const invalidRequest = structuredClone(request);
invalidRequest.semanticHash = hash('TAMPERED-REQUEST');
negative('tampered B7C request', () => executeControlledLafeaContinuumPilot({
  ...options,
  request: invalidRequest,
}));

console.log(JSON.stringify({
  schema: 'lafea-template-b7d-controlled-continuum-controller-check/v1',
  status: 'PASS',
  exactHead: HEAD,
  pilot: 'C2D-LUG-PINHOLE -> LAFEA.3',
  meshElementCounts: [4, 16, 64],
  retainedRecovery: 'INTEGRATION_POINT',
  levelEvidenceHashes: accepted.levelResults.map(
    (row) => row.levelEvidence.evidenceHash,
  ),
  receiptHash: accepted.receipt.evidenceHash,
  negativeTestCount: negativeCount,
  authority: {
    boundedPilotExecution: true,
    generalT7dAuthorized: false,
    shellAuthorized: false,
    assessmentReady: false,
    codeReady: false,
    releaseQualified: false,
  },
}));

function continuumLevel(ordinal, subdivisions) {
  const generated = refinedT6Mesh(subdivisions, `B7D-T6-L${ordinal}`);
  const document = normalizeLafeaStageDocument('LAFEA.3', {
    schema: 'local-continuum-model/v1',
    modelIdentity: 'B7D-C2D-LUG-PINHOLE',
    modelVersion: '1',
    sourceAncestry: {
      sourceModelIdentity: 'B7D-C2D-LUG-PINHOLE',
      sourceVersion: '1',
      adapterIdentity: 'B7D-THREE-LEVEL-T6',
      adapterVersion: '1',
    },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: 'PLANE_STRESS',
    materials: [{
      materialId: 'MAT',
      elasticModulus: 200000,
      poissonRatio: 0.3,
      sourceReference: 'MATERIAL#MAT',
    }],
    nodes: generated.nodes.map((row) => ({
      nodeId: row.nodeId,
      x: row.x,
      y: row.y,
      sourceReference: `NODE#${row.nodeId}`,
    })),
    elements: generated.elements.map((row) => ({
      elementId: row.elementId,
      elementType: 'T6',
      nodeIds: row.nodeIds,
      materialId: 'MAT',
      thickness: 10,
      sourceReference: `ELEMENT#${row.elementId}`,
    })),
    elementTypePolicy: {
      allowT3Fallback: false,
      sourceReference: 'B7D-T6-ONLY',
    },
    constraints: generated.nodes.flatMap((node) => [
      constraint(node, 'UX', EPS_X * node.x),
      constraint(node, 'UY', 0),
    ]),
    loadCases: [{
      loadCaseId: 'LC1',
      nodalForces: [{
        loadId: 'F1',
        nodeId: generated.loadEdge[0],
        fx: 0,
        fy: 0,
        sourceReference: 'LOAD#F1',
      }],
      edgeTractions: [],
      pressureLoads: [],
      bodyForces: [],
      temperatureLoads: [],
      imposedDisplacements: [],
      sourceReference: 'CASE#LC1',
    }],
    resultRequests: { loadCaseIds: ['LC1'] },
    qualificationProfile: {
      schema: 'local-continuum-qualification-profile/v1',
      identity: 'B7D-AFFINE-T6-PROFILE',
      tolerances: toleranceTable(),
    },
    limitations: [],
  });
  return { ordinal, subdivisions, ...generated, document };
}

function alternateSameCountLevel(source, ordinal) {
  const document = normalizeLafeaStageDocument(
    'LAFEA.3',
    structuredClone(source.document),
  );
  return {
    ...source,
    ordinal,
    meshIdentity: `B7D-T6-L${ordinal}-SAME-COUNT`,
    document,
  };
}

function createMeshEvidence(level, sourceHash) {
  const profile = meshProfile(level.ordinal, level.subdivisions);
  const mesh = {
    schema: LAFEA_ANALYSIS_MESH_SCHEMA,
    meshIdentity: level.meshIdentity,
    nodes: level.nodes.map((row) => ({ ...row, z: 0 })),
    elements: level.elements.map((row) => ({
      elementId: row.elementId,
      elementType: 'T6',
      nodeIds: row.nodeIds,
    })),
  };
  const meshHash = lafeaAnalysisMeshContentHash(mesh);
  return createLafeaAnalysisMeshEvidence({
    schema: LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
    stageId: 'LAFEA.3',
    sourceHash,
    canonicalModelHash: MODEL_HASH,
    analysisGeometryHash: GEOMETRY_HASH,
    meshProfile: profile,
    mesh,
    authority: {
      schema: LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
      stageId: 'LAFEA.3',
      authorityRole: 'STAGE_AUTHORIZED_ANALYSIS_MESH',
      status: 'ACCEPTED_BY_STAGE_CONTRACT',
      producerRef: `B7D/TEST/T6-LEVEL-${level.ordinal}`,
      sourceHash,
      canonicalModelHash: MODEL_HASH,
      analysisGeometryHash: GEOMETRY_HASH,
      meshProfileHash: profile.semanticHash,
      meshHash,
    },
  });
}

function meshProfile(ordinal, subdivisions) {
  return canonicalProfile(PROFILE_KINDS.MESH, {
    schema: 'lafea-mesh-profile/v1',
    profileIdentity: `B7D-T6-LEVEL-${ordinal}`,
    sourceRevision: '1',
    fields: {
      continuumElement: 'T6',
      shellElement: 'CST_DKT_TRI3_THIN_SHELL_V1',
      globalTargetSize: 100 / subdivisions,
      adjacentSizeRatioMax: 1.5,
      aspectRatioWarn: 3,
      aspectRatioBlock: 6,
      scaledJacobianWarn: 0.3,
      scaledJacobianBlock: 0.1,
      adaptiveLevels: 3,
    },
    semanticHash: undefined,
  });
}

function refinedT6Mesh(n, meshIdentity) {
  const vertices = new Map();
  const coordinate = (i, j) => ({ x: 100 * i / n, y: 100 * j / n });
  const vertexId = (i, j) => `V${i}_${j}`;
  for (let i = 0; i <= n; i += 1) {
    for (let j = 0; j <= n - i; j += 1) {
      vertices.set(vertexId(i, j), {
        nodeId: vertexId(i, j),
        ...coordinate(i, j),
      });
    }
  }
  const triangles = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n - i; j += 1) {
      triangles.push([
        vertexId(i, j),
        vertexId(i + 1, j),
        vertexId(i, j + 1),
      ]);
      if (i + j <= n - 2) {
        triangles.push([
          vertexId(i + 1, j),
          vertexId(i + 1, j + 1),
          vertexId(i, j + 1),
        ]);
      }
    }
  }
  const nodes = new Map(vertices);
  const midsides = new Map();
  const midpointId = (left, right) => {
    const key = [left, right].sort().join('__');
    if (!midsides.has(key)) {
      const a = nodes.get(left);
      const b = nodes.get(right);
      const nodeId = `M_${key}`;
      midsides.set(key, nodeId);
      nodes.set(nodeId, {
        nodeId,
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      });
    }
    return midsides.get(key);
  };
  const elements = triangles.map(([a, b, c], index) => ({
    elementId: `E${index + 1}`,
    nodeIds: [
      a,
      b,
      c,
      midpointId(a, b),
      midpointId(b, c),
      midpointId(c, a),
    ],
  }));
  const loadA = vertexId(n, 0);
  const loadB = vertexId(n - 1, 1);
  const rootA = vertexId(0, 0);
  const rootB = vertexId(0, 1);
  return {
    meshIdentity,
    nodes: [...nodes.values()].sort((a, b) =>
      a.nodeId.localeCompare(b.nodeId)),
    elements,
    loadEdge: [loadA, midpointId(loadA, loadB), loadB],
    rootEdge: [rootA, midpointId(rootA, rootB), rootB],
  };
}

function mappingDeclaration(level) {
  const constraintIds = level.rootEdge.flatMap((nodeId) => [
    constraintId(nodeId, 'UX'),
    constraintId(nodeId, 'UY'),
  ]);
  return {
    schema: LAFEA_LUG_PINHOLE_MAPPING_DECLARATION_SCHEMA,
    templateId: 'C2D-LUG-PINHOLE',
    stageId: 'LAFEA.3',
    materialRegion: {
      materialId: 'MAT',
      elementIds: level.elements.map((row) => row.elementId),
    },
    loadEdge: {
      featureId: 'LOAD-EDGE',
      loadCaseId: 'LC1',
      edgeNodeIds: level.loadEdge,
      loadIds: ['F1'],
      expectedResultant: [0, 0],
      tolerance: { absolute: 1e-12, relative: 1e-12 },
    },
    boundaryEdge: {
      featureId: 'ROOT-REGION',
      edgeNodeIds: level.rootEdge,
      constraintIds,
    },
  };
}

function templateAuthority(currentSnapshot) {
  const compiled = createTemplateReleaseRecordV2(
    releaseInput(currentSnapshot, null, {
      authorityState: 'COMPILED_READY',
      validity: 'BLOCKED',
      releaseQualified: false,
      blockedReasons: ['B7D_COMPATIBILITY_REQUIRED'],
    }),
  );
  const provisional = evaluateTemplateTargetCompatibility(
    compiled,
    currentSnapshot,
  );
  assert.equal(provisional.status, 'CURRENT');
  const releaseRecord = createTemplateReleaseRecordV2(
    releaseInput(currentSnapshot, provisional.semanticHash, {
      authorityState: 'ENGINE_EXECUTABLE',
      validity: 'CURRENT',
      releaseQualified: false,
      blockedReasons: [],
    }),
  );
  const compatibilityReceipt = evaluateTemplateTargetCompatibility(
    releaseRecord,
    currentSnapshot,
  );
  assert.equal(compatibilityReceipt.status, 'CURRENT');
  assert.equal(compatibilityReceipt.semanticHash, provisional.semanticHash);
  return { releaseRecord, compatibilityReceipt };
}

function releaseInput(snapshot, compatibilityReceiptHash, releaseState) {
  const fnv = 'fnv1a64:0123456789abcdef';
  return {
    recordId: 'LAFEA.RELEASE.C2D-LUG-PINHOLE/B7D',
    candidateHeadSha: HEAD,
    template: {
      templateId: 'C2D-LUG-PINHOLE',
      templateRevision: 1,
      templateSemanticHash: fnv,
      templateRegistryHash: fnv,
      bucketId: 'CONTINUUM_2D_FEA',
    },
    parameterSchema: {
      schemaId: 'C2D-LUG-PINHOLE.PARAMETERS/V1',
      schemaHash: fnv,
    },
    parameterSet: {
      applicability: 'REQUIRED',
      parameterSetHash: fnv,
      validationResultHash: fnv,
    },
    compiler: {
      applicability: 'REQUIRED',
      bindingSchema: 'lafea-template-continuum-compiler-binding/v1',
      bindingHash: fnv,
      compilerVersion: 'B7D.1',
      geometryCompilerId: 'B7D-CONTINUUM-GEOMETRY',
      loadCompilerId: 'B7D-CONTINUUM-LOADS',
      boundaryCompilerId: 'B7D-CONTINUUM-BOUNDARY',
      meshRequestCompilerId: 'B7D-CALLER-T6-THREE-LEVEL',
    },
    handoff: {
      applicability: 'REQUIRED',
      handoffSchema: 'lafea-template-handoff/v1',
      compilationHash: fnv,
      handoffHash: fnv,
      entryStageId: 'LAFEA.3',
      stageSourceHash: fnv,
      handoffStatus: 'READY',
    },
    targetStage: {
      registrySchema: snapshot.targetStage.registrySchema,
      stageId: 'LAFEA.3',
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
      compatibilityReceiptHash,
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
      sourceUnitContractHash: fnv,
      handoffUnitContractHash: fnv,
      targetUnitContractHash: snapshot.unitProjection.targetUnitContractHash,
      projectionProfileHash: fnv,
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
      applicability: 'NOT_APPLICABLE',
      componentId: null,
      componentHash: null,
      productProfileHash: null,
      productEvidenceHash: null,
      productQualification: null,
    },
    executionEvidence: {
      applicability: 'REQUIRED',
      requestHash: null,
      receiptHash: null,
      stageExecutionEvidenceHash: null,
      lifecycleProducerBatchHash: null,
      resultEvidenceHash: null,
      calculationAccepted: false,
      resultReady: false,
      assessmentReady: false,
      codeReady: false,
    },
    qualificationEvidence: {
      exactHeadArtifactHash: null,
      buildEvidenceHash: null,
      browserEvidenceHash: null,
      performanceEvidenceHash: null,
      accessibilityEvidenceHash: null,
      independentReviewHash: null,
      repositoryIntegrationEvidenceHash: null,
    },
    releaseState,
    diagnostics: [],
  };
}

function benchmarkEvidence(mappingPackageHash) {
  const patchManifest = createContinuumBenchmarkManifest({
    benchmarkId: 'CONT-PATCH-01',
    templateId: 'C2D-LUG-PINHOLE',
    stageId: 'LAFEA.3',
    kind: 'ASSEMBLED_Q8_PATCH',
    sourcePath: PATCH_PATH,
    sourceHash: fileHash(PATCH_PATH),
    expectedValueAuthority: 'FROZEN_BEFORE_OBSERVED_EVIDENCE_CONSUMPTION',
    expected: {
      elementType: 'Q8',
      elementCount: 2,
      gaussPointsPerElement: 9,
      freeNodeId: 'F',
      displacement: [0.05, -0.015],
      strain: [0.001, -0.0003, 0],
      stress: [200, 0, 0],
    },
    tolerances: { recovery: { absolute: 0, relative: 1e-10 } },
  });
  const holeManifest = createContinuumBenchmarkManifest({
    benchmarkId: 'CONT-HOLE-01',
    templateId: 'C2D-LUG-PINHOLE',
    stageId: 'LAFEA.3',
    kind: 'KIRSCH_Q8_THREE_LEVEL',
    sourcePath: HOLE_PATH,
    sourceHash: fileHash(HOLE_PATH),
    expectedValueAuthority: 'FROZEN_BEFORE_OBSERVED_EVIDENCE_CONSUMPTION',
    expected: {
      elementType: 'Q8',
      remoteStress: 50,
      theoreticalPeakFactor: 3,
      outerBoundaryCondition:
        'EXACT_KIRSCH_TRACTION_ON_TRUNCATED_OUTER_BOUNDARY',
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
      recoveryHash: hash('PATCH-RECOVERY'),
      meshHash: hash('PATCH-MESH'),
      elementType: 'Q8',
      elementCount: 2,
      gaussPointsPerElement: 9,
      freeNodeId: 'F',
      displacement: [0.05, -0.015],
      strain: [0.001, -0.0003, 0],
      stress: [200, 0, 0],
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
    producerRevision: 'B7B.1',
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
    ordinal,
    radialElements,
    circumferentialElements,
    meshHash: hash(`HOLE-MESH-${ordinal}`),
    recoveryHash: hash(`HOLE-RECOVERY-${ordinal}`),
    peakFactor,
    fullFieldNormalizedError,
  };
}

function requestInput(value) {
  const input = {};
  for (const key of [
    'requestId', 'releaseRecordHash', 'releaseAuthorityState',
    'releaseValidity', 'compatibilityReceiptHash', 'compatibilityStatus',
    'mappingPackageHash', 'mappingStatus', 'boundBindingHash',
    'boundBindingStatus', 'benchmarkQualificationHash', 'benchmarkStatus',
    'importedDocumentRevisionDigest', 'sourceAuthorityRequest',
    'canonicalModelHash', 'analysisGeometryHash', 'meshLevels',
    'recoveryProfileHash', 'convergenceProfileHash',
  ]) input[key] = structuredClone(value[key]);
  return input;
}

function pendingMapping() {
  return {
    applicability: 'REQUIRED',
    evidenceHash: null,
    qualification: 'PENDING',
  };
}

function constraint(node, dof, value) {
  return {
    constraintId: constraintId(node.nodeId, dof),
    nodeId: node.nodeId,
    dof,
    value,
    sourceReference: `CONSTRAINT#${node.nodeId}-${dof}`,
  };
}

function constraintId(nodeId, dof) {
  return `C-${nodeId}-${dof}`;
}

function toleranceTable() {
  const tight = { absolute: 1e-9, relative: 1e-9 };
  const loose = { absolute: 1e-5, relative: 1e-5 };
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

function blocked(label, input, expectedDiagnostic) {
  const result = executeControlledLafeaContinuumPilot(input);
  assert.equal(result.status, 'BLOCKED', label);
  assert.equal(result.accepted, false, label);
  assert.equal(result.authority.codeReady, false, label);
  assert.equal(result.authority.releaseQualified, false, label);
  assert.equal(result.authority.generalT7dAuthorized, false, label);
  assert.equal(
    result.diagnostics.some((row) => row.includes(expectedDiagnostic)),
    true,
    label,
  );
  negativeCount += 1;
}

function negative(label, body) {
  assert.throws(body, undefined, label);
  negativeCount += 1;
}

function sourceGuards() {
  const controller = fs.readFileSync(
    path.join(ROOT, 'src/workspace/lafea-controlled-continuum-controller.js'),
    'utf8',
  );
  const route = fs.readFileSync(
    path.join(ROOT, 'src/workspace/lafea-controlled-continuum-stage-route.js'),
    'utf8',
  );
  assert.doesNotMatch(
    controller,
    /from ['"][^'"]*local-continuum[^'"]*['"]/u,
  );
  assert.doesNotMatch(controller, /\bcalculateLocalContinuum\s*\(/u);
  assert.match(controller, /executeControlledContinuumStageRoute/u);
  assert.match(controller, /issueLafeaSourceAuthority/u);
  assert.match(controller, /registerLafeaArtifact/u);
  assert.match(route, /executeLafeaStage/u);
  assert.match(route, /reconstructContinuumResultHashes/u);

  const workspace = path.join(ROOT, 'src/workspace');
  for (const file of walk(workspace)) {
    if (!file.endsWith('.js')
      || !/(?:wizard|panel|view|ui|import)/iu.test(path.basename(file))) {
      continue;
    }
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(
      source,
      /from ['"][^'"]*lafea-controlled-continuum-(?:controller|public|stage-route)\.js['"]/u,
      `${path.relative(ROOT, file)} must not import the B7D controller.`,
    );
    assert.doesNotMatch(
      source,
      /\bexecuteControlledLafeaContinuumPilot\s*\(/u,
      `${path.relative(ROOT, file)} must not invoke B7D.`,
    );
    assert.doesNotMatch(
      source,
      /\bexecuteLafeaStage\s*\(/u,
      `${path.relative(ROOT, file)} must not bypass the controller.`,
    );
  }
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function fileHash(filePath) {
  return `sha256:${createHash('sha256')
    .update(fs.readFileSync(filePath)).digest('hex')}`;
}

function hash(value) {
  return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
}
