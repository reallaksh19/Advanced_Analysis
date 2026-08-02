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
  validateLafeaLugPinholeMappingPackage,
} from '../src/core/lafea-application-templates/continuum-application-mapping-evidence.js';
import {
  LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  LAFEA_ANALYSIS_MESH_SCHEMA,
  createLafeaAnalysisMeshEvidence,
  lafeaAnalysisMeshContentHash,
} from '../src/workspace/lafea-analysis-mesh-evidence.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_LUG_PINHOLE_MAPPING_DECLARATION_SCHEMA,
  createLafeaLugPinholeMappingEvidence,
} from '../src/workspace/lafea-lug-pinhole-mapping-evidence.js';

const SOURCE_HASH = hash('B7A-SOURCE');
const MODEL_HASH = hash('B7A-MODEL');
const GEOMETRY_HASH = hash('B7A-GEOMETRY');
const PROFILE = meshProfile();
const MESH = t6Mesh();
const MESH_EVIDENCE = createLafeaAnalysisMeshEvidence(meshIntake(MESH));
const APPLICATION = Object.freeze({
  geometryClass: 'LUG_PINHOLE',
  declarationBasis: 'CALLER_ENGINEERING_CLASSIFICATION',
  featureIds: Object.freeze(['LOAD-EDGE', 'ROOT-REGION']),
  sourceReference: 'APPLICATION#C2D-LUG-PINHOLE',
});
let negativeCount = 0;

sourceGuards();

const qualified = produce();
assert.equal(qualified.status, 'MAPPING_EVIDENCE_QUALIFIED');
assert.equal(qualified.materialRegionEvidence.qualification, 'PASS');
assert.equal(qualified.loadEdgeEvidence.qualification, 'PASS');
assert.equal(qualified.boundaryEdgeEvidence.qualification, 'PASS');
assert.equal(qualified.boundBinding.status, 'BOUND');
assert.deepEqual(
  qualified.loadEdgeEvidence.metrics.observedResultant,
  [1000, 0],
);
assert.deepEqual(qualified.loadEdgeEvidence.metrics.residual, [0, 0]);
assert.equal(qualified.loadEdgeEvidence.metrics.closureAccepted, true);
assert.equal(qualified.boundaryEdgeEvidence.metrics.rigidBodyRank, 3);
assert.equal(qualified.boundaryEdgeEvidence.metrics.restraintSufficient, true);
assert.equal(qualified.engineExecutionAuthorized, false);
assert.equal(qualified.recoveryProduced, false);
assert.equal(qualified.convergenceProduced, false);
assert.equal(qualified.codeAssessmentProduced, false);
assert.equal(qualified.releaseQualified, false);
assert.equal(validateLafeaLugPinholeMappingPackage(qualified).ok, true);
assert.ok(Object.isFrozen(qualified));
assert.ok(Object.isFrozen(qualified.boundBinding));

const incompleteMaterial = produce({
  declarationMutator(value) { value.materialRegion.elementIds = ['MISSING']; },
});
assert.equal(incompleteMaterial.status, 'MAPPING_EVIDENCE_BLOCKED');
assert.equal(incompleteMaterial.materialRegionEvidence.qualification, 'BLOCK');
assert.equal(incompleteMaterial.boundBinding.status, 'BLOCKED');
assert.equal(incompleteMaterial.materialRegionEvidence.reasons
  .includes('MATERIAL_REGION_INCOMPLETE'), true);

const wrongLoadEdge = produce({
  declarationMutator(value) { value.loadEdge.edgeNodeIds = ['A', 'AB', 'B']; },
});
assert.equal(wrongLoadEdge.status, 'MAPPING_EVIDENCE_BLOCKED');
assert.equal(wrongLoadEdge.loadEdgeEvidence.reasons
  .some((row) => row.startsWith('LOAD_NODE_NOT_ON_EDGE')), true);

const residualFailure = produce({
  declarationMutator(value) { value.loadEdge.expectedResultant = [999, 0]; },
});
assert.equal(residualFailure.loadEdgeEvidence.qualification, 'BLOCK');
assert.equal(residualFailure.loadEdgeEvidence.reasons
  .includes('LOAD_RESULTANT_CLOSURE_FAILED'), true);

const deficientBoundary = produce({
  declarationMutator(value) { value.boundaryEdge.constraintIds = ['C1', 'C2']; },
});
assert.equal(deficientBoundary.boundaryEdgeEvidence.qualification, 'BLOCK');
assert.equal(deficientBoundary.boundaryEdgeEvidence.metrics.rigidBodyRank, 2);
assert.equal(deficientBoundary.boundaryEdgeEvidence.reasons
  .includes('BOUNDARY_RIGID_BODY_RANK_DEFICIENT'), true);

negativeCode('stale mesh parent', () => produce({
  pendingBinding: pendingBinding({ meshHash: hash('STALE-MESH') }),
}), 'LAFEA_B7A_MESH_HASH_STALE');

negativeCode('tampered mesh evidence', () => {
  const tampered = structuredClone(MESH_EVIDENCE);
  tampered.quality.elementCount = 99;
  return produce({ meshEvidence: tampered });
}, 'LAFEA_B7A_MESH_EVIDENCE_TAMPERED');

negativeCode('source authority absent', () => produce({
  pendingBinding: pendingBinding({ sourceAuthorityHash: null }),
}), 'LAFEA_B7A_SOURCE_AUTHORITY_HASH_REQUIRED');

negativeCode('wrong template binding', () => produce({
  pendingBinding: pendingBinding({ templateId: 'C2D-CLAMP-EAR' }),
}), 'LAFEA_B7A_PENDING_BINDING_STATE_INVALID');

negativeCode('stage source connectivity changed', () => produce({
  sourceMutator(value) { value.elements[0].nodeIds = ['A', 'C', 'B', 'CA', 'BC', 'AB']; },
}), 'LAFEA_B7A_STAGE_SOURCE_MESH_CONNECTIVITY_MISMATCH');

negativeCode('stage source coordinate changed', () => produce({
  sourceMutator(value) { value.nodes[0].x = 1; },
}), 'LAFEA_B7A_STAGE_SOURCE_MESH_COORDINATE_MISMATCH');

negativeCode('application feature missing', () => produce({
  application: { ...structuredClone(APPLICATION), featureIds: ['LOAD-EDGE'] },
}), 'LAFEA_B7A_APPLICATION_EVIDENCE_INVALID');

negativeCode('declaration unknown key', () => produce({
  declarationMutator(value) { value.unexpected = true; },
}), 'LAFEA_B7A_EXACT_KEYS_INVALID');

negative('tampered package hash', () => validateOrThrow({
  ...qualified,
  semanticHash: hash('TAMPERED-PACKAGE'),
}));
negative('mutable package', () => validateOrThrow(structuredClone(qualified)));

console.log(JSON.stringify({
  schema: 'lafea-template-b7a-lug-pinhole-mapping-check/v1',
  status: 'PASS',
  templateId: 'C2D-LUG-PINHOLE',
  stageId: 'LAFEA.3',
  meshElementFamily: 'T6',
  materialRegionQualified: true,
  loadEdgeResultantClosure: true,
  boundaryRigidBodyRank: 3,
  boundBindingStatus: 'BOUND',
  negativeTestCount: negativeCount,
  authority: {
    engineExecutionAuthorized: false,
    recoveryProduced: false,
    convergenceProduced: false,
    codeAssessmentProduced: false,
    releaseQualified: false,
    generalT7dAuthorized: false,
  },
}));

function produce(options = {}) {
  const source = stageSource();
  options.sourceMutator?.(source);
  const declaration = mappingDeclaration();
  options.declarationMutator?.(declaration);
  return createLafeaLugPinholeMappingEvidence({
    pendingBinding: options.pendingBinding ?? pendingBinding(),
    meshEvidence: options.meshEvidence ?? MESH_EVIDENCE,
    stageSource: source,
    applicationEvidence: options.application ?? structuredClone(APPLICATION),
    declaration,
  });
}

function pendingBinding(overrides = {}) {
  const input = {
    templateId: 'C2D-LUG-PINHOLE',
    templateSemanticHash: 'fnv1a64:0123456789abcdef',
    compilationHash: 'fnv1a64:1111111111111111',
    handoffHash: 'fnv1a64:2222222222222222',
    compatibilityReceiptHash: hash('B7A-COMPATIBILITY'),
    targetStageId: 'LAFEA.3',
    targetCompositionRootHash: hash('B7A-COMPOSITION'),
    sourceAuthorityHash: hash('B7A-SOURCE-AUTHORITY'),
    sourceHash: SOURCE_HASH,
    canonicalModelHash: MODEL_HASH,
    analysisGeometryHash: GEOMETRY_HASH,
    meshProfileHash: MESH_EVIDENCE.meshProfileHash,
    meshHash: MESH_EVIDENCE.meshHash,
    meshAuthorityHash: canonicalLafeaSha256(MESH_EVIDENCE.authority),
    qualityEvidenceHash: canonicalLafeaSha256(MESH_EVIDENCE.quality),
    materialRegionEvidence: pendingMapping(),
    loadEdgeEvidence: pendingMapping(),
    boundaryEdgeEvidence: pendingMapping(),
    ...overrides,
  };
  return createTemplateCallerMeshBinding(input);
}

function pendingMapping() {
  return { applicability: 'REQUIRED', evidenceHash: null, qualification: 'PENDING' };
}

function mappingDeclaration() {
  return {
    schema: LAFEA_LUG_PINHOLE_MAPPING_DECLARATION_SCHEMA,
    templateId: 'C2D-LUG-PINHOLE',
    stageId: 'LAFEA.3',
    materialRegion: { materialId: 'MAT', elementIds: ['E1'] },
    loadEdge: {
      featureId: 'LOAD-EDGE',
      loadCaseId: 'LC1',
      edgeNodeIds: ['B', 'BC', 'C'],
      loadIds: ['F1'],
      expectedResultant: [1000, 0],
      tolerance: { absolute: 1e-9, relative: 1e-12 },
    },
    boundaryEdge: {
      featureId: 'ROOT-REGION',
      edgeNodeIds: ['A', 'AB', 'B'],
      constraintIds: ['C1', 'C2', 'C3'],
    },
  };
}

function stageSource() {
  return {
    schema: 'local-continuum-model/v1',
    modelIdentity: 'B7A-LUG-PINHOLE',
    modelVersion: '1',
    sourceAncestry: {
      sourceModelIdentity: 'B7A-CALLER-SOURCE',
      sourceVersion: '1',
      adapterIdentity: 'B7A-MAPPING-FIXTURE',
      adapterVersion: '1',
    },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: 'PLANE_STRESS',
    materials: [{
      materialId: 'MAT', elasticModulus: 200000, poissonRatio: 0.3,
      sourceReference: 'MATERIAL#MAT',
    }],
    nodes: [
      sourceNode('A', 0, 0), sourceNode('B', 100, 0), sourceNode('C', 0, 100),
      sourceNode('AB', 50, 0), sourceNode('BC', 50, 50), sourceNode('CA', 0, 50),
    ],
    elements: [{
      elementId: 'E1', elementType: 'T6',
      nodeIds: ['A', 'B', 'C', 'AB', 'BC', 'CA'],
      materialId: 'MAT', thickness: 10, sourceReference: 'ELEMENT#E1',
    }],
    elementTypePolicy: {
      allowT3Fallback: false, sourceReference: 'PRODUCTION_T6_REQUIRED',
    },
    constraints: [
      constraint('C1', 'A', 'UX'), constraint('C2', 'A', 'UY'),
      constraint('C3', 'B', 'UY'),
    ],
    loadCases: [{
      loadCaseId: 'LC1',
      nodalForces: [{
        loadId: 'F1', nodeId: 'B', fx: 1000, fy: 0,
        sourceReference: 'FORCE#F1',
      }],
      edgeTractions: [], pressureLoads: [], bodyForces: [],
      temperatureLoads: [], imposedDisplacements: [],
      sourceReference: 'CASE#LC1',
    }],
    resultRequests: { loadCaseIds: ['LC1'] },
    qualificationProfile: { schema: 'fixture', identity: 'B7A' },
    limitations: [],
  };
}

function meshIntake(mesh) {
  const meshHash = lafeaAnalysisMeshContentHash(mesh);
  return {
    schema: LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
    stageId: 'LAFEA.3',
    sourceHash: SOURCE_HASH,
    canonicalModelHash: MODEL_HASH,
    analysisGeometryHash: GEOMETRY_HASH,
    meshProfile: PROFILE,
    mesh,
    authority: {
      schema: LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
      stageId: 'LAFEA.3',
      authorityRole: 'STAGE_AUTHORIZED_ANALYSIS_MESH',
      status: 'ACCEPTED_BY_STAGE_CONTRACT',
      producerRef: 'B7A/TEST/T6-MESH',
      sourceHash: SOURCE_HASH,
      canonicalModelHash: MODEL_HASH,
      analysisGeometryHash: GEOMETRY_HASH,
      meshProfileHash: PROFILE.semanticHash,
      meshHash,
    },
  };
}

function meshProfile() {
  return canonicalProfile(PROFILE_KINDS.MESH, {
    schema: 'lafea-mesh-profile/v1',
    profileIdentity: 'B7A-T6-CALLER-MESH',
    sourceRevision: '1',
    fields: {
      continuumElement: 'T6',
      shellElement: 'CST_DKT_TRI3_THIN_SHELL_V1',
      globalTargetSize: 25,
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

function t6Mesh() {
  return {
    schema: LAFEA_ANALYSIS_MESH_SCHEMA,
    meshIdentity: 'B7A-T6-MESH',
    nodes: [
      meshNode('A', 0, 0), meshNode('B', 100, 0), meshNode('C', 0, 100),
      meshNode('AB', 50, 0), meshNode('BC', 50, 50), meshNode('CA', 0, 50),
    ],
    elements: [{
      elementId: 'E1', elementType: 'T6',
      nodeIds: ['A', 'B', 'C', 'AB', 'BC', 'CA'],
    }],
  };
}

function sourceNode(nodeId, x, y) {
  return { nodeId, x, y, sourceReference: `NODE#${nodeId}` };
}

function meshNode(nodeId, x, y) {
  return { nodeId, x, y, z: 0 };
}

function constraint(constraintId, nodeId, dof) {
  return { constraintId, nodeId, dof, value: 0, sourceReference: `CONSTRAINT#${constraintId}` };
}

function sourceGuards() {
  const producer = fs.readFileSync(
    'src/workspace/lafea-lug-pinhole-mapping-evidence.js', 'utf8',
  );
  const contract = fs.readFileSync(
    'src/core/lafea-application-templates/continuum-application-mapping-evidence.js',
    'utf8',
  );
  const source = `${producer}\n${contract}`;
  assert.doesNotMatch(source, /\bexecuteLafeaStage\s*\(/u);
  assert.doesNotMatch(source, /\bcalculateLocalContinuum\s*\(/u);
  assert.doesNotMatch(source, /\bcreateLafeaLifecycleProducerBatch\s*\(/u);
  assert.doesNotMatch(source, /\bregisterLafeaArtifact\s*\(/u);
  assert.doesNotMatch(source, /from ['"][^'"]*(?:recovery|render|canvas)[^'"]*['"]/u);
}

function validateOrThrow(value) {
  const validation = validateLafeaLugPinholeMappingPackage(value);
  if (!validation.ok) throw new TypeError(validation.errors.join(' '));
  return value;
}

function negative(label, body) {
  negativeCount += 1;
  assert.throws(body, undefined, label);
}

function negativeCode(label, body, code) {
  negativeCount += 1;
  assert.throws(body, (error) => {
    assert.equal(error?.code, code, `${label}: expected ${code}, received ${error?.code}`);
    return true;
  });
}

function hash(value) {
  return canonicalLafeaSha256({ schema: 'lafea-b7a-test-hash/v1', value });
}
