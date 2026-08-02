#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROFILE_KINDS,
  canonicalProfile,
} from '../src/core/lafea-profile-contract/index.js';
import {
  LAFEA_T6_CALLER_MESH_TEMPLATE_IDS,
  createTemplateCallerMeshBinding,
  validateTemplateCallerMeshBinding,
} from '../src/core/lafea-application-templates/caller-mesh-binding.js';
import {
  createTemplateReleaseRecordV2,
} from '../src/core/lafea-application-templates/release-record-v2.js';
import {
  createTemplateTargetAuthoritySnapshot,
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
  bindLafeaContinuumTemplateCallerMesh,
} from '../src/workspace/lafea-template-caller-mesh-binding.js';
import {
  createCurrentLafeaTargetAuthoritySnapshot,
} from '../src/workspace/lafea-target-compatibility-authority.js';

const FNV = 'fnv1a64:0123456789abcdef';
const SHA = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const HEAD = '982ae626e31d78b79605bd2c41bcb8957139d0cd';
const SOURCE_HASH = hash('B6-SOURCE');
const MODEL_HASH = hash('B6-MODEL');
const GEOMETRY_HASH = hash('B6-GEOMETRY');
const PROFILE = meshProfile('T6');
let negativeCount = 0;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

sourceGuards();

const snapshot = createCurrentLafeaTargetAuthoritySnapshot('LAFEA.3');
const evidence = createLafeaAnalysisMeshEvidence(intake(t6Mesh()));
assert.equal(evidence.status, 'CURRENT');
assert.equal(evidence.qualification, 'PASS');
assert.equal(evidence.mesh.elements.every((row) => row.elementType === 'T6'), true);

for (const templateId of LAFEA_T6_CALLER_MESH_TEMPLATE_IDS) {
  const authority = templateAuthority(templateId, snapshot);
  const pending = bindLafeaContinuumTemplateCallerMesh({
    ...authority,
    meshEvidence: evidence,
    sourceAuthorityHash: SHA,
    materialRegionEvidence: mapping('PENDING'),
    loadEdgeEvidence: mapping('PENDING'),
    boundaryEdgeEvidence: mapping('PENDING'),
  });
  assert.equal(pending.status, 'MAPPING_EVIDENCE_PENDING');
  assert.equal(pending.reasons.length, 3);
  assert.equal(pending.compilerGeneratedMesh, false);
  assert.equal(pending.productionMeshQualified, false);
  assert.equal(pending.engineExecutionAuthorized, false);
  assert.equal(pending.recoveryProduced, false);
  assert.equal(pending.convergenceProduced, false);
  assert.equal(pending.codeAssessmentProduced, false);
  assert.equal(pending.releaseQualified, false);
  assert.equal(validateTemplateCallerMeshBinding(pending).ok, true);

  const bound = bindLafeaContinuumTemplateCallerMesh({
    ...authority,
    meshEvidence: evidence,
    sourceAuthorityHash: SHA,
    materialRegionEvidence: mapping('PASS', hash(`${templateId}-MATERIALS`)),
    loadEdgeEvidence: mapping('PASS', hash(`${templateId}-LOAD-EDGES`)),
    boundaryEdgeEvidence: mapping('PASS', hash(`${templateId}-BOUNDARY-EDGES`)),
  });
  assert.equal(bound.status, 'BOUND');
  assert.deepEqual(bound.reasons, []);
  assert.equal(bound.productionMeshQualified, false);
  assert.equal(bound.engineExecutionAuthorized, false);
}

const blocked = bindLafeaContinuumTemplateCallerMesh({
  ...templateAuthority('C2D-LUG-PINHOLE', snapshot),
  meshEvidence: evidence,
  sourceAuthorityHash: SHA,
  materialRegionEvidence: mapping('PASS', hash('MATERIALS')),
  loadEdgeEvidence: mapping('BLOCK', hash('LOAD-EDGE-BLOCK')),
  boundaryEdgeEvidence: mapping('PASS', hash('BOUNDARIES')),
});
assert.equal(blocked.status, 'BLOCKED');
assert.equal(blocked.reasons.includes('LOAD_EDGE_BLOCKED'), true);

const missingAuthorityHash = bindLafeaContinuumTemplateCallerMesh({
  ...templateAuthority('C2D-LUG-PINHOLE', snapshot),
  meshEvidence: evidence,
  sourceAuthorityHash: null,
  materialRegionEvidence: mapping('PASS', hash('MATERIALS')),
  loadEdgeEvidence: mapping('PASS', hash('LOADS')),
  boundaryEdgeEvidence: mapping('PASS', hash('BOUNDARIES')),
});
assert.equal(missingAuthorityHash.status, 'MAPPING_EVIDENCE_PENDING');
assert.equal(missingAuthorityHash.reasons.includes(
  'SOURCE_AUTHORITY_RECORD_HASH_REQUIRED',
), true);

negativeCode('T3 mesh rejected', () => bindLafeaContinuumTemplateCallerMesh({
  ...templateAuthority('C2D-LUG-PINHOLE', snapshot),
  meshEvidence: createLafeaAnalysisMeshEvidence(intake(t3Mesh(), meshProfile('T3'))),
  sourceAuthorityHash: SHA,
  materialRegionEvidence: mapping('PENDING'),
  loadEdgeEvidence: mapping('PENDING'),
  boundaryEdgeEvidence: mapping('PENDING'),
}), 'LAFEA_TEMPLATE_CALLER_MESH_T6_REQUIRED');

negativeCode('tampered mesh evidence', () => {
  const tampered = structuredClone(evidence);
  tampered.quality.elementCount = 99;
  return bindLafeaContinuumTemplateCallerMesh({
    ...templateAuthority('C2D-LUG-PINHOLE', snapshot),
    meshEvidence: tampered,
    sourceAuthorityHash: SHA,
    materialRegionEvidence: mapping('PENDING'),
    loadEdgeEvidence: mapping('PENDING'),
    boundaryEdgeEvidence: mapping('PENDING'),
  });
}, 'LAFEA_TEMPLATE_CALLER_MESH_EVIDENCE_TAMPERED');

negativeCode('stale compatibility receipt', () => {
  const authority = templateAuthority('C2D-LUG-PINHOLE', snapshot);
  const changedInput = snapshotInput(snapshot);
  changedInput.compositionRoot.compositionRootHash = hash('CHANGED-COMPOSITION');
  const changed = createTemplateTargetAuthoritySnapshot(changedInput);
  const staleReceipt = evaluateTemplateTargetCompatibility(
    authority.releaseRecord, changed,
  );
  return bindLafeaContinuumTemplateCallerMesh({
    releaseRecord: authority.releaseRecord,
    compatibilityReceipt: staleReceipt,
    meshEvidence: evidence,
    sourceAuthorityHash: SHA,
    materialRegionEvidence: mapping('PENDING'),
    loadEdgeEvidence: mapping('PENDING'),
    boundaryEdgeEvidence: mapping('PENDING'),
  });
}, 'LAFEA_TEMPLATE_CALLER_MESH_TARGET_NOT_CURRENT');

negativeCode('template parent mismatch', () => {
  const authority = templateAuthority('C2D-LUG-PINHOLE', snapshot);
  const recordInput = releaseInput(snapshot, 'C2D-CLAMP-EAR');
  const otherRecord = createTemplateReleaseRecordV2(recordInput);
  return bindLafeaContinuumTemplateCallerMesh({
    releaseRecord: otherRecord,
    compatibilityReceipt: authority.compatibilityReceipt,
    meshEvidence: evidence,
    sourceAuthorityHash: SHA,
    materialRegionEvidence: mapping('PENDING'),
    loadEdgeEvidence: mapping('PENDING'),
    boundaryEdgeEvidence: mapping('PENDING'),
  });
}, 'LAFEA_TEMPLATE_CALLER_MESH_TEMPLATE_PARENT_MISMATCH');

negative('unauthorized template', () => createTemplateCallerMeshBinding({
  ...coreInput('C2D-LUG-PINHOLE'),
  templateId: 'C2D-FLANGE-HUB',
}));
negative('wrong stage', () => createTemplateCallerMeshBinding({
  ...coreInput('C2D-LUG-PINHOLE'),
  targetStageId: 'LAFEA.4',
}));
negative('PASS mapping missing hash', () => createTemplateCallerMeshBinding({
  ...coreInput('C2D-LUG-PINHOLE'),
  materialRegionEvidence: mapping('PASS'),
}));
negative('PENDING mapping with hash', () => createTemplateCallerMeshBinding({
  ...coreInput('C2D-LUG-PINHOLE'),
  loadEdgeEvidence: mapping('PENDING', SHA),
}));
negative('not-applicable mapping', () => createTemplateCallerMeshBinding({
  ...coreInput('C2D-LUG-PINHOLE'),
  boundaryEdgeEvidence: {
    applicability: 'NOT_APPLICABLE',
    evidenceHash: null,
    qualification: 'PENDING',
  },
}));
negative('unknown top-level key', () => createTemplateCallerMeshBinding({
  ...coreInput('C2D-LUG-PINHOLE'),
  unexpected: true,
}));
negative('tampered binding hash', () => validateOrThrow({
  ...createTemplateCallerMeshBinding(coreInput('C2D-LUG-PINHOLE')),
  semanticHash: SHA,
}));
negative('mutable binding', () => validateOrThrow(structuredClone(
  createTemplateCallerMeshBinding(coreInput('C2D-LUG-PINHOLE')),
)));

console.log(JSON.stringify({
  schema: 'lafea-template-b6-caller-mesh-binding-check/v1',
  status: 'PASS',
  templateIds: LAFEA_T6_CALLER_MESH_TEMPLATE_IDS,
  meshElementFamily: 'T6',
  acceptedMeshEvidence: evidence.artifactHash,
  negativeTestCount: negativeCount,
  authority: {
    compilerGeneratedMesh: false,
    productionMeshQualified: false,
    engineExecutionAuthorized: false,
    recoveryProduced: false,
    convergenceProduced: false,
    codeAssessmentProduced: false,
    releaseQualified: false,
  },
}));

function templateAuthority(templateId, currentSnapshot) {
  const compiled = createTemplateReleaseRecordV2(
    releaseInput(currentSnapshot, templateId),
  );
  const compatibilityReceipt = evaluateTemplateTargetCompatibility(
    compiled, currentSnapshot,
  );
  assert.equal(compatibilityReceipt.status, 'CURRENT');
  return { releaseRecord: compiled, compatibilityReceipt };
}

function releaseInput(currentSnapshot, templateId) {
  return {
    recordId: `LAFEA.RELEASE.${templateId}/B6`,
    candidateHeadSha: HEAD,
    template: {
      templateId,
      templateRevision: 1,
      templateSemanticHash: FNV,
      templateRegistryHash: FNV,
      bucketId: 'CONTINUUM_2D_FEA',
    },
    parameterSchema: {
      schemaId: `${templateId}.PARAMETERS/V1`,
      schemaHash: FNV,
    },
    parameterSet: {
      applicability: 'REQUIRED',
      parameterSetHash: FNV,
      validationResultHash: FNV,
    },
    compiler: {
      applicability: 'REQUIRED',
      bindingSchema: 'lafea-template-continuum-compiler-binding/v1',
      bindingHash: FNV,
      compilerVersion: 'T4.1',
      geometryCompilerId: 'T4-CONTINUUM-GEOMETRY',
      loadCompilerId: 'T4-CONTINUUM-LOADS',
      boundaryCompilerId: 'T4-CONTINUUM-BOUNDARIES',
      meshRequestCompilerId: 'T4-CALLER-T6-MESH-REQUEST',
    },
    handoff: {
      applicability: 'REQUIRED',
      handoffSchema: 'lafea-template-handoff/v1',
      compilationHash: FNV,
      handoffHash: FNV,
      entryStageId: 'LAFEA.3',
      stageSourceHash: FNV,
      handoffStatus: 'READY',
    },
    targetStage: {
      registrySchema: currentSnapshot.targetStage.registrySchema,
      stageId: 'LAFEA.3',
      stageEntryHash: currentSnapshot.targetStage.registryEntryHash,
      engineState: currentSnapshot.targetStage.engineState,
      enginePackage: currentSnapshot.targetStage.enginePackage,
      stageAuthority: currentSnapshot.targetStage.stageAuthority,
      inputContractRole: currentSnapshot.targetStage.inputContractRole,
      resultContractRole: currentSnapshot.targetStage.resultContractRole,
    },
    compositionRoot: {
      compositionSchema: currentSnapshot.compositionRoot.compositionSchema,
      compositionRootId: currentSnapshot.compositionRoot.compositionRootId,
      compositionRootHash: currentSnapshot.compositionRoot.compositionRootHash,
      componentIdsHash: currentSnapshot.compositionRoot.componentIdsHash,
      releaseStateBinding: currentSnapshot.compositionRoot.releaseStateBinding,
      compatibilityReceiptHash: null,
    },
    lifecycleProfile: { ...currentSnapshot.lifecycleProfile },
    sourceAuthority: {
      applicability: 'REQUIRED',
      requiredSchema: currentSnapshot.sourceContract.sourceAuthoritySchema,
      requiredRole: currentSnapshot.sourceContract.sourceAuthorityRole,
      authorityHash: null,
      sourceHash: null,
      canonicalizationProfile: currentSnapshot.sourceContract.canonicalizationProfile,
      documentRevisionDigest: null,
      originRef: null,
    },
    unitProjection: {
      sourceUnitContractHash: FNV,
      handoffUnitContractHash: FNV,
      targetUnitContractHash: currentSnapshot.unitProjection.targetUnitContractHash,
      projectionProfileHash: FNV,
    },
    meshAuthority: {
      applicability: 'REQUIRED',
      authoritySchema: currentSnapshot.meshRequirement.authoritySchema,
      authorityRole: currentSnapshot.meshRequirement.authorityRole,
      authorityStatus: currentSnapshot.meshRequirement.requiredStatus,
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
      bindingState: currentSnapshot.benchmarkBindings.bindingState,
      manifestIds: [...currentSnapshot.benchmarkBindings.manifestIds],
      manifestHashes: [...currentSnapshot.benchmarkBindings.manifestHashes],
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
    releaseState: {
      authorityState: 'COMPILED_READY',
      validity: 'BLOCKED',
      releaseQualified: false,
      blockedReasons: ['CALLER_MESH_BINDING_REQUIRED'],
    },
    diagnostics: [],
  };
}

function coreInput(templateId) {
  return {
    templateId,
    templateSemanticHash: FNV,
    compilationHash: FNV,
    handoffHash: FNV,
    compatibilityReceiptHash: SHA,
    targetStageId: 'LAFEA.3',
    targetCompositionRootHash: SHA,
    sourceAuthorityHash: SHA,
    sourceHash: SHA,
    canonicalModelHash: SHA,
    analysisGeometryHash: SHA,
    meshProfileHash: FNV,
    meshHash: SHA,
    meshAuthorityHash: SHA,
    qualityEvidenceHash: SHA,
    materialRegionEvidence: mapping('PENDING'),
    loadEdgeEvidence: mapping('PENDING'),
    boundaryEdgeEvidence: mapping('PENDING'),
  };
}

function mapping(qualification, evidenceHash = null) {
  return { applicability: 'REQUIRED', evidenceHash, qualification };
}

function intake(mesh, profile = PROFILE) {
  const meshHash = lafeaAnalysisMeshContentHash(mesh);
  return {
    schema: LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
    stageId: 'LAFEA.3',
    sourceHash: SOURCE_HASH,
    canonicalModelHash: MODEL_HASH,
    analysisGeometryHash: GEOMETRY_HASH,
    meshProfile: profile,
    mesh,
    authority: {
      schema: LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
      stageId: 'LAFEA.3',
      authorityRole: 'STAGE_AUTHORIZED_ANALYSIS_MESH',
      status: 'ACCEPTED_BY_STAGE_CONTRACT',
      producerRef: 'B6-INDEPENDENT-T6-MESHER',
      sourceHash: SOURCE_HASH,
      canonicalModelHash: MODEL_HASH,
      analysisGeometryHash: GEOMETRY_HASH,
      meshProfileHash: profile.semanticHash,
      meshHash,
    },
  };
}

function t6Mesh() {
  return {
    schema: LAFEA_ANALYSIS_MESH_SCHEMA,
    meshIdentity: 'B6-T6-MESH',
    nodes: [
      node('N1', 0, 0),
      node('N2', 100, 0),
      node('N3', 0, 100),
      node('N4', 50, 0),
      node('N5', 50, 50),
      node('N6', 0, 50),
    ],
    elements: [{
      elementId: 'E1',
      elementType: 'T6',
      nodeIds: ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'],
    }],
  };
}

function t3Mesh() {
  return {
    schema: LAFEA_ANALYSIS_MESH_SCHEMA,
    meshIdentity: 'B6-T3-MESH',
    nodes: [node('N1', 0, 0), node('N2', 100, 0), node('N3', 0, 100)],
    elements: [{
      elementId: 'E1',
      elementType: 'T3',
      nodeIds: ['N1', 'N2', 'N3'],
    }],
  };
}

function node(nodeId, x, y) {
  return { nodeId, x, y, z: 0 };
}

function meshProfile(continuumElement) {
  return canonicalProfile(PROFILE_KINDS.MESH, {
    schema: 'lafea-mesh-profile/v1',
    profileIdentity: `B6-${continuumElement}-PROFILE`,
    sourceRevision: 'B6.1',
    fields: {
      continuumElement,
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

function hash(value) {
  return canonicalLafeaSha256({ schema: 'b6-test-hash/v1', value });
}

function snapshotInput(value) {
  const copy = structuredClone(value);
  delete copy.schema;
  delete copy.semanticHash;
  return copy;
}

function validateOrThrow(value) {
  const result = validateTemplateCallerMeshBinding(value);
  if (!result.ok) throw new Error(result.errors.join(' '));
}

function negative(label, callback) {
  assert.throws(callback, undefined, label);
  negativeCount += 1;
}

function negativeCode(label, callback, code) {
  assert.throws(callback, (error) => {
    assert.equal(error?.code, code, label);
    return true;
  });
  negativeCount += 1;
}

function sourceGuards() {
  const files = [
    'src/core/lafea-application-templates/caller-mesh-binding.js',
    'src/workspace/lafea-template-caller-mesh-binding.js',
  ];
  const source = files.map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8'))
    .join('\n');
  assert.doesNotMatch(source, /\bexecuteLafeaStage\s*\(/u);
  assert.doesNotMatch(source, /\bcalculateLocal(?:Continuum|Shell)\s*\(/u);
  assert.doesNotMatch(source, /\bgenerateMesh\s*\(/u);
  assert.doesNotMatch(source, /\bregisterLafeaAnalysisMeshEvidence\s*\(/u);
  assert.doesNotMatch(source, /\bregisterLafeaLifecycle\w*\s*\(/u);
  assert.doesNotMatch(source, /\bsealRenderPacketV2\s*\(/u);
  assert.match(source, /productionMeshQualified:\s*false/u);
  assert.match(source, /engineExecutionAuthorized:\s*false/u);
  assert.match(source, /releaseQualified:\s*false/u);
}
