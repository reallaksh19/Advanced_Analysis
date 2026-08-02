#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PROFILE_KINDS,
  canonicalProfile,
} from '../src/core/lafea-profile-contract/index.js';
import {
  createTemplateCallerMeshBinding,
} from '../src/core/lafea-application-templates/caller-mesh-binding.js';
import {
  createLafeaLugPinholePhysicalProjection,
  validateLafeaLugPinholePhysicalProjection,
} from '../src/workspace/lafea-controlled-continuum-public.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  createLafeaLugPinholeMappingEvidence,
} from '../src/workspace/lafea-lug-pinhole-mapping-evidence.js';

const FNV = 'fnv1a64:0123456789abcdef';
let adversarialCount = 0;
sourceGuards();

const intake = projectionIntake();
const projection = createLafeaLugPinholePhysicalProjection(intake);
assert.equal(projection.status, 'PHYSICAL_PROBLEM_PROJECTED');
assert.equal(projection.stageId, 'LAFEA.3');
assert.equal(projection.templateId, 'C2D-LUG-PINHOLE');
assert.equal(projection.authority.productionMeshGenerated, true);
assert.equal(projection.authority.materialMapped, true);
assert.equal(projection.authority.loadMapped, true);
assert.equal(projection.authority.restraintMapped, true);
assert.equal(projection.authority.stageDocumentsProduced, true);
assert.equal(projection.authority.mappingEvidenceQualified, false);
assert.equal(projection.authority.solverExecuted, false);
assert.equal(projection.authority.recoveryProduced, false);
assert.equal(projection.authority.convergenceProduced, false);
assert.equal(projection.authority.codeAssessmentProduced, false);
assert.equal(projection.authority.reportProduced, false);
assert.equal(projection.authority.releaseQualified, false);
assert.equal(projection.authority.shellAuthorized, false);
assert.equal(projection.authority.lafea6Enabled, false);
assert.equal(projection.levels.length, 3);
assert.deepEqual(
  projection.levels.map((row) => row.meshEvidence.mesh.elements.length),
  [64, 256, 1024],
);
assert.equal(projection.meshLadder.sourceHash, projection.sourceAuthority.sourceHash);
assert.equal(projection.sourceAuthorityHash,
  canonicalLafeaSha256(projection.sourceAuthority));
assert.equal(projection.baseDocumentRevisionDigest,
  projection.sourceAuthority.documentRevisionDigest);
assert.equal(validateLafeaLugPinholePhysicalProjection(projection).ok, true);
assert.equal(Object.isFrozen(projection), true);
assert.equal(Object.isFrozen(projection.levels[0].document), true);

for (const level of projection.levels) assertProjectedLevel(level, projection);

const pendingBinding = createPendingBinding(projection);
assert.equal(pendingBinding.status, 'MAPPING_EVIDENCE_PENDING');
const mappingPackage = createLafeaLugPinholeMappingEvidence({
  pendingBinding,
  meshEvidence: projection.levels[0].meshEvidence,
  stageSource: projection.levels[0].document,
  applicationEvidence: projection.applicationEvidence,
  declaration: projection.mappingDeclaration,
});
assert.equal(mappingPackage.status, 'MAPPING_EVIDENCE_QUALIFIED');
assert.equal(mappingPackage.boundBinding.status, 'BOUND');
assert.equal(mappingPackage.sourceHash, projection.sourceAuthority.sourceHash);
assert.equal(mappingPackage.canonicalModelHash, projection.canonicalModelHash);
assert.equal(mappingPackage.analysisGeometryHash, projection.analysisGeometryHash);
assert.equal(mappingPackage.materialRegionEvidence.qualification, 'PASS');
assert.equal(mappingPackage.loadEdgeEvidence.qualification, 'PASS');
assert.equal(mappingPackage.boundaryEdgeEvidence.qualification, 'PASS');

const repeated = createLafeaLugPinholePhysicalProjection(intake);
assert.equal(repeated.packageHash, projection.packageHash);
assert.equal(repeated.sourceAuthority.sourceHash,
  projection.sourceAuthority.sourceHash);
assert.deepEqual(
  repeated.levels.map((row) => row.projectionHash),
  projection.levels.map((row) => row.projectionHash),
);

const permuted = projectionIntake();
permuted.levels.reverse();
const reordered = createLafeaLugPinholePhysicalProjection(permuted);
assert.equal(reordered.packageHash, projection.packageHash);
assert.equal(reordered.sourceAuthority.sourceHash,
  projection.sourceAuthority.sourceHash);

const changedLoad = projectionIntake();
changedLoad.physicalProblem.loadCase.resultant.fx *= 1.25;
const changed = createLafeaLugPinholePhysicalProjection(changedLoad);
assert.notEqual(changed.canonicalModelHash, projection.canonicalModelHash);
assert.notEqual(changed.sourceAuthority.sourceHash,
  projection.sourceAuthority.sourceHash);
assert.notEqual(changed.packageHash, projection.packageHash);

expectCode('colliding selectors', () => {
  const value = projectionIntake();
  value.physicalProblem.restraintEdge = {
    ...value.physicalProblem.loadEdge,
    sourceReference: 'BC#COLLISION',
  };
  createLafeaLugPinholePhysicalProjection(value);
}, 'LAFEA_NB_T6C_LOAD_AND_RESTRAINT_SELECTOR_COLLISION');

expectCode('invalid feature role', () => {
  const value = projectionIntake();
  value.physicalProblem.loadEdge.featureRole = 'INFERRED_EDGE';
  createLafeaLugPinholePhysicalProjection(value);
}, 'LAFEA_NB_T6C_FEATURE_ROLE_INVALID');

expectCode('invalid quarter', () => {
  const value = projectionIntake();
  value.physicalProblem.loadEdge.quarter = 4;
  createLafeaLugPinholePhysicalProjection(value);
}, 'LAFEA_NB_T6C_FEATURE_QUARTER_INVALID');

expectCode('zero resultant', () => {
  const value = projectionIntake();
  value.physicalProblem.loadCase.resultant = { fx: 0, fy: 0 };
  createLafeaLugPinholePhysicalProjection(value);
}, 'LAFEA_NB_T6C_NONZERO_RESULTANT_REQUIRED');

expectCode('invalid poisson ratio', () => {
  const value = projectionIntake();
  value.physicalProblem.material.poissonRatio = 0.5;
  createLafeaLugPinholePhysicalProjection(value);
}, 'LAFEA_NB_T6C_POISSON_RATIO_INVALID');

const tampered = structuredClone(projection);
tampered.levels[0].document.materials[0].elasticModulus *= 0.9;
const tamperedValidation = validateLafeaLugPinholePhysicalProjection(tampered);
assert.equal(tamperedValidation.ok, false);
adversarialCount += 1;

console.log(JSON.stringify({
  schema: 'lafea-nb-t6c-lug-pinhole-physical-projection-check/v1',
  status: 'PASS',
  meshElementCounts: projection.levels.map(
    (row) => row.meshEvidence.mesh.elements.length,
  ),
  loadFeature: projection.physicalProblem.loadEdge,
  restraintFeature: projection.physicalProblem.restraintEdge,
  mappingStatus: mappingPackage.status,
  packageHash: projection.packageHash,
  sourceHash: projection.sourceAuthority.sourceHash,
  adversarialCount,
  authority: projection.authority,
}));

function assertProjectedLevel(level, packageValue) {
  assert.equal(level.status, 'PROJECTED');
  assert.equal(level.document.schema, 'local-continuum-model/v1');
  assert.equal(level.document.formulation, 'PLANE_STRESS');
  assert.equal(level.document.materials.length, 1);
  assert.equal(level.document.materials[0].materialId, 'MAT-LUG');
  assert.equal(level.document.elements.every((row) =>
    row.elementType === 'T6' && row.materialId === 'MAT-LUG'), true);
  assert.equal(level.document.nodes.length, level.meshEvidence.mesh.nodes.length);
  assert.equal(level.document.elements.length,
    level.meshEvidence.mesh.elements.length);
  assert.equal(level.meshEvidence.sourceHash,
    packageValue.sourceAuthority.sourceHash);
  assert.equal(level.meshEvidence.canonicalModelHash,
    packageValue.canonicalModelHash);
  assert.equal(level.meshEvidence.analysisGeometryHash,
    packageValue.analysisGeometryHash);
  assert.equal(level.loadSelection.edgeNodeIds.length, 3);
  assert.equal(level.restraintSelection.edgeNodeIds.length, 3);
  assert.equal(level.loadSelection.loadIds.length, 3);
  assert.equal(level.restraintSelection.constraintIds.length, 6);
  const loadCase = level.document.loadCases[0];
  assert.equal(loadCase.nodalForces.length, 3);
  const sum = loadCase.nodalForces.reduce(
    (total, row) => [total[0] + row.fx, total[1] + row.fy],
    [0, 0],
  );
  approx(sum[0], packageValue.physicalProblem.loadCase.resultant.fx);
  approx(sum[1], packageValue.physicalProblem.loadCase.resultant.fy);
  assert.equal(level.document.constraints.length, 6);
  assert.equal(level.document.constraints.every((row) =>
    level.restraintSelection.edgeNodeIds.includes(row.nodeId)
      && ['UX', 'UY'].includes(row.dof)
      && row.value === 0), true);
  assert.equal(level.mappingDeclaration.materialRegion.elementIds.length,
    level.document.elements.length);
  assert.deepEqual(level.mappingDeclaration.loadEdge.edgeNodeIds,
    [...level.loadSelection.edgeNodeIds]);
  assert.deepEqual(level.mappingDeclaration.boundaryEdge.edgeNodeIds,
    [...level.restraintSelection.edgeNodeIds]);
  adversarialCount += 1;
}

function createPendingBinding(packageValue) {
  const first = packageValue.levels[0].meshEvidence;
  const pending = Object.freeze({
    applicability: 'REQUIRED',
    evidenceHash: null,
    qualification: 'PENDING',
  });
  return createTemplateCallerMeshBinding({
    templateId: 'C2D-LUG-PINHOLE',
    templateSemanticHash: FNV,
    compilationHash: FNV,
    handoffHash: FNV,
    compatibilityReceiptHash: hash('NB-T6C-COMPATIBILITY'),
    targetStageId: 'LAFEA.3',
    targetCompositionRootHash: hash('NB-T6C-COMPOSITION-ROOT'),
    sourceAuthorityHash: packageValue.sourceAuthorityHash,
    sourceHash: packageValue.sourceAuthority.sourceHash,
    canonicalModelHash: packageValue.canonicalModelHash,
    analysisGeometryHash: packageValue.analysisGeometryHash,
    meshProfileHash: first.meshProfileHash,
    meshHash: first.meshHash,
    meshAuthorityHash: canonicalLafeaSha256({
      schema: 'lafea-nb-t6c-mesh-authority-hash-input/v1',
      authority: first.authority,
    }),
    qualityEvidenceHash: canonicalLafeaSha256({
      schema: 'lafea-nb-t6c-quality-evidence-hash-input/v1',
      quality: first.quality,
    }),
    materialRegionEvidence: pending,
    loadEdgeEvidence: pending,
    boundaryEdgeEvidence: pending,
  });
}

function projectionIntake() {
  return {
    schema: 'lafea-lug-pinhole-physical-projection-intake/v1',
    stageId: 'LAFEA.3',
    templateId: 'C2D-LUG-PINHOLE',
    geometry: {
      center: { x: 0, y: 0 },
      holeRadius: 20,
      outerRadius: 100,
      startAngleDegrees: 0,
    },
    levels: [
      level(1, 2, 16, 40),
      level(2, 4, 32, 20),
      level(3, 8, 64, 10),
    ],
    physicalProblem: {
      modelIdentity: 'NB-T6C-C2D-LUG-PINHOLE',
      modelVersion: '1',
      material: {
        materialId: 'MAT-LUG',
        elasticModulus: 200000,
        poissonRatio: 0.3,
        thickness: 10,
        sourceReference: 'MATERIAL#MAT-LUG',
      },
      loadCase: {
        loadCaseId: 'LC1',
        resultant: { fx: 10000, fy: 0 },
        sourceReference: 'LOADCASE#LC1',
      },
      loadEdge: {
        featureRole: 'HOLE_BOUNDARY',
        quarter: 0,
        sourceReference: 'FEATURE#PIN-LOAD-EAST',
      },
      restraintEdge: {
        featureRole: 'OUTER_BOUNDARY',
        quarter: 2,
        sourceReference: 'FEATURE#ROOT-FIXED-WEST',
      },
    },
    producerRef: 'NB-T6C/C2D-LUG-PINHOLE/LAFEA.3',
    originRef: 'NB-T6C/C2D-LUG-PINHOLE/PROJECTED-SOURCE',
  };
}

function level(ordinal, radialDivisions, circumferentialDivisions,
  globalTargetSize) {
  return {
    ordinal,
    meshIdentity: `NB-T6C-LUG-PINHOLE-L${ordinal}`,
    radialDivisions,
    circumferentialDivisions,
    meshProfile: canonicalProfile(PROFILE_KINDS.MESH, {
      schema: 'lafea-mesh-profile/v1',
      profileIdentity: `NB-T6C-LUG-PINHOLE-L${ordinal}-PROFILE`,
      sourceRevision: '1',
      fields: {
        continuumElement: 'T6',
        shellElement: 'CST_DKT_TRI3_THIN_SHELL_V1',
        globalTargetSize,
        adjacentSizeRatioMax: 1.5,
        aspectRatioWarn: 8,
        aspectRatioBlock: 12,
        scaledJacobianWarn: 0.2,
        scaledJacobianBlock: 0.05,
        adaptiveLevels: 3,
      },
      semanticHash: undefined,
    }),
  };
}

function expectCode(label, body, expectedCode) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, expectedCode,
      `${label}: ${error?.code} ${error?.message}`);
    return true;
  });
  adversarialCount += 1;
}

function approx(actual, expected) {
  const tolerance = 1e-9 + 1e-12 * Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${actual} != ${expected}`);
}

function sourceGuards() {
  const producer = fs.readFileSync(
    'src/workspace/lafea-lug-pinhole-physical-projection.js',
    'utf8',
  );
  const facade = fs.readFileSync(
    'src/workspace/lafea-controlled-continuum-public.js',
    'utf8',
  );
  assert.doesNotMatch(producer,
    /\b(?:calculateLocalContinuum|executeLafeaStage|executeControlledLafeaContinuumPilot|registerLafeaArtifact)\s*\(/u);
  assert.doesNotMatch(producer,
    /from ['"][^'"]*(?:code|report|local-shell)[^'"]*['"]/u);
  assert.match(producer, /mappingEvidenceQualified:\s*false/u);
  assert.match(producer, /solverExecuted:\s*false/u);
  assert.match(producer, /releaseQualified:\s*false/u);
  assert.match(facade, /createLafeaLugPinholePhysicalProjection/u);
  adversarialCount += 6;
}

function hash(value) {
  return canonicalLafeaSha256({
    schema: 'lafea-nb-t6c-test-hash-input/v1',
    value,
  });
}
