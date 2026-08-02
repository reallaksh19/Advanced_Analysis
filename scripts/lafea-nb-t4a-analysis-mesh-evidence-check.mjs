#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PROFILE_KINDS,
  canonicalProfile,
} from '../src/core/lafea-profile-contract/index.js';
import {
  LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
  LAFEA_ANALYSIS_MESH_EVIDENCE_SCHEMA,
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  LAFEA_ANALYSIS_MESH_PRODUCER_REVISION,
  LAFEA_ANALYSIS_MESH_SCHEMA,
  createLafeaAnalysisMeshEvidence,
  lafeaAnalysisMeshContentHash,
  registerLafeaAnalysisMeshEvidence,
} from '../src/workspace/lafea-analysis-mesh-evidence.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  createLafeaArtifactRecord,
  createLafeaLifecycle,
  lafeaLifecycleReadiness,
  registerLafeaArtifact,
} from '../src/workspace/lafea-lifecycle.js';

const SOURCE_HASH = hash('NB-T4A-SOURCE');
const MODEL_HASH = hash('NB-T4A-CANONICAL-MODEL');
const GEOMETRY_HASH = hash('NB-T4A-ANALYSIS-GEOMETRY');
const PROFILE = meshProfile('T3', 'CST_DKT_TRI3_THIN_SHELL_V1');
const TRIANGLE = mesh('MESH-TRIANGLE', [
  node('N1', 0, 0, 0),
  node('N2', 100, 0, 0),
  node('N3', 0, 100, 0),
], [element('E1', 'T3', ['N1', 'N2', 'N3'])]);

const evidence = createLafeaAnalysisMeshEvidence(intake({ meshValue: TRIANGLE }));
assert.equal(evidence.schema, LAFEA_ANALYSIS_MESH_EVIDENCE_SCHEMA);
assert.equal(evidence.producerRevision, LAFEA_ANALYSIS_MESH_PRODUCER_REVISION);
assert.equal(evidence.stageId, 'LAFEA.3');
assert.equal(evidence.status, 'CURRENT');
assert.equal(evidence.qualification, 'PASS');
assert.equal(evidence.quality.worstStatus, 'OK');
assert.equal(evidence.quality.elementCount, 1);
assert.equal(evidence.releaseState, 'RELEASE_NOT_QUALIFIED');
assert.equal(evidence.convergenceProduced, false);
assert.equal(evidence.codeAssessmentProduced, false);
assert.equal(evidence.reportProduced, false);
assert.equal(evidence.releaseQualified, false);
assert.ok(Object.isFrozen(evidence));
assert.ok(Object.isFrozen(evidence.mesh));
assert.ok(Object.isFrozen(evidence.quality.elementResults));
assert.equal(evidence.artifactRecord.kind, 'ANALYSIS_MESH');
assert.deepEqual(evidence.artifactRecord.parentHashes, {
  analysisGeometryHash: GEOMETRY_HASH,
  meshProfileHash: PROFILE.semanticHash,
});

const lifecycle = lifecycleWithGeometry('LAFEA.3');
const registered = registerLafeaAnalysisMeshEvidence(lifecycle, evidence);
assert.equal(registered.artifacts.ANALYSIS_MESH.status, 'CURRENT');
assert.equal(registered.artifacts.ANALYSIS_MESH.qualification, 'PASS');
assert.equal(registered.artifacts.ANALYSIS_MESH.artifactHash, evidence.artifactHash);
assert.equal(lafeaLifecycleReadiness(registered).meshQualified, true);
assert.equal(lafeaLifecycleReadiness(registered).resultReady, false);

const permuted = structuredClone(TRIANGLE);
permuted.nodes.reverse();
permuted.elements.reverse();
const repeated = createLafeaAnalysisMeshEvidence(intake({ meshValue: permuted }));
assert.equal(repeated.meshHash, evidence.meshHash);
assert.equal(repeated.artifactHash, evidence.artifactHash);
assert.deepEqual(repeated.quality, evidence.quality);

const skinny = mesh('MESH-SKINNY', [
  node('N1', 0, 0, 0),
  node('N2', 100, 0, 0),
  node('N3', 0.01, 0.001, 0),
], [element('E1', 'T3', ['N1', 'N2', 'N3'])]);
const blockedEvidence = createLafeaAnalysisMeshEvidence(intake({ meshValue: skinny }));
assert.equal(blockedEvidence.status, 'BLOCKED');
assert.equal(blockedEvidence.qualification, 'BLOCK');
assert.equal(blockedEvidence.quality.worstStatus, 'BLOCK');
assert.deepEqual(blockedEvidence.quality.blockingElementIds, ['E1']);
const blockedLifecycle = registerLafeaAnalysisMeshEvidence(
  lifecycleWithGeometry('LAFEA.3'),
  blockedEvidence,
);
assert.equal(blockedLifecycle.artifacts.ANALYSIS_MESH.status, 'BLOCKED');
assert.equal(lafeaLifecycleReadiness(blockedLifecycle).meshQualified, false);

const shellProfile = meshProfile('T3', 'CST_DKT_TRI3_THIN_SHELL_V1');
const shellMesh = mesh('MESH-SHELL', [
  node('S1', 0, 0, 0),
  node('S2', 100, 0, 0),
  node('S3', 0, 100, 20),
], [element('SE1', 'CST_DKT_TRI3_THIN_SHELL_V1', ['S1', 'S2', 'S3'])]);
const shellEvidence = createLafeaAnalysisMeshEvidence(intake({
  stageId: 'LAFEA.4',
  meshValue: shellMesh,
  profile: shellProfile,
}));
assert.equal(shellEvidence.quality.worstStatus, 'OK');
assert.equal(shellEvidence.stageId, 'LAFEA.4');

expectCode(() => createLafeaAnalysisMeshEvidence(intake({
  stageId: 'LAFEA.1',
  meshValue: TRIANGLE,
})), 'LAFEA_ANALYSIS_MESH_STAGE_NOT_FEA');

const unqualified = intake({ meshValue: TRIANGLE });
unqualified.authority.status = 'CALLER_SUPPLIED';
expectCode(() => createLafeaAnalysisMeshEvidence(unqualified),
  'LAFEA_ANALYSIS_MESH_NOT_STAGE_AUTHORIZED');

const displayAuthority = intake({ meshValue: TRIANGLE });
displayAuthority.authority.authorityRole = 'DISPLAY_TESSELLATION';
expectCode(() => createLafeaAnalysisMeshEvidence(displayAuthority),
  'LAFEA_ANALYSIS_MESH_NOT_STAGE_AUTHORIZED');

const staleMeshAuthority = intake({ meshValue: TRIANGLE });
staleMeshAuthority.authority.meshHash = hash('OTHER-MESH');
expectCode(() => createLafeaAnalysisMeshEvidence(staleMeshAuthority),
  'LAFEA_ANALYSIS_MESH_AUTHORITY_PARENT_MISMATCH');

const staleProfileAuthority = intake({ meshValue: TRIANGLE });
staleProfileAuthority.authority.meshProfileHash = 'fnv1a64:0000000000000000';
expectCode(() => createLafeaAnalysisMeshEvidence(staleProfileAuthority),
  'LAFEA_ANALYSIS_MESH_AUTHORITY_PARENT_MISMATCH');

const withMeshConfig = structuredClone(TRIANGLE);
withMeshConfig.meshConfig = { size: 20 };
expectCode(() => createLafeaAnalysisMeshEvidence(intakeRaw({
  meshValue: withMeshConfig,
})), 'LAFEA_ANALYSIS_MESH_EXACT_KEYS_INVALID');

const withRenderBuffers = structuredClone(TRIANGLE);
withRenderBuffers.positions = [0, 0, 0];
expectCode(() => createLafeaAnalysisMeshEvidence(intakeRaw({
  meshValue: withRenderBuffers,
})), 'LAFEA_ANALYSIS_MESH_EXACT_KEYS_INVALID');

const unsupported = structuredClone(TRIANGLE);
unsupported.elements[0].elementType = 'CST_DKT_TRI3_THIN_SHELL_V1';
const unsupportedProfile = meshProfile('T3', 'CST_DKT_TRI3_THIN_SHELL_V1');
expectCode(() => createLafeaAnalysisMeshEvidence(intakeRaw({
  meshValue: unsupported,
  profile: unsupportedProfile,
})), 'LAFEA_ANALYSIS_MESH_ELEMENT_FAMILY_NOT_AUTHORIZED');

const profileMismatch = meshProfile('T6', 'CST_DKT_TRI3_THIN_SHELL_V1');
expectCode(() => createLafeaAnalysisMeshEvidence(intakeRaw({
  meshValue: TRIANGLE,
  profile: profileMismatch,
})), 'LAFEA_ANALYSIS_MESH_PROFILE_ELEMENT_MISMATCH');

const nonPlanar = structuredClone(TRIANGLE);
nonPlanar.nodes[2].z = 1;
expectCode(() => createLafeaAnalysisMeshEvidence(intake({ meshValue: nonPlanar })),
  'LAFEA_ANALYSIS_MESH_CONTINUUM_NODE_NOT_PLANAR');

const duplicateNode = structuredClone(TRIANGLE);
duplicateNode.nodes[1].nodeId = 'N1';
expectCode(() => createLafeaAnalysisMeshEvidence(intakeRaw({
  meshValue: duplicateNode,
})), 'LAFEA_ANALYSIS_MESH_NODE_ID_DUPLICATE');

const unknownNode = structuredClone(TRIANGLE);
unknownNode.elements[0].nodeIds[2] = 'MISSING';
expectCode(() => createLafeaAnalysisMeshEvidence(intakeRaw({
  meshValue: unknownNode,
})), 'LAFEA_ANALYSIS_MESH_ELEMENT_NODE_MISSING');

const staleLifecycle = lifecycleWithGeometry('LAFEA.3', {
  geometryHash: hash('STALE-GEOMETRY'),
});
expectCode(() => registerLafeaAnalysisMeshEvidence(staleLifecycle, evidence),
  'LAFEA_ANALYSIS_MESH_GEOMETRY_PARENT_STALE');

const tampered = structuredClone(evidence);
tampered.quality.elementCount = 99;
expectCode(() => registerLafeaAnalysisMeshEvidence(lifecycle, tampered),
  'LAFEA_ANALYSIS_MESH_EVIDENCE_TAMPERED');

const evidenceSource = fs.readFileSync(
  'src/workspace/lafea-analysis-mesh-evidence.js', 'utf8',
);
const contractSource = fs.readFileSync(
  'src/workspace/lafea-analysis-mesh-contract.js', 'utf8',
);
const qualitySource = fs.readFileSync(
  'src/workspace/lafea-analysis-mesh-quality.js', 'utf8',
);
const productionSource = `${contractSource}\n${qualitySource}\n${evidenceSource}`;
assert.doesNotMatch(productionSource,
  /from ['"][^'"]*(?:local-continuum|local-shell|lafea-canvas|render-packet)[^'"]*['"]/u);
assert.doesNotMatch(productionSource,
  /\b(?:calculateLocalContinuum|calculateLocalShell|executeLafeaStage|sealRenderPacketV2|generateMesh)\b/u);
assert.match(contractSource, /LAFEA_ANALYSIS_MESH_EXACT_KEYS_INVALID/u);
assert.match(evidenceSource, /RELEASE_NOT_QUALIFIED/u);
assert.match(evidenceSource, /convergenceProduced:\s*false/u);
assert.match(evidenceSource, /codeAssessmentProduced:\s*false/u);
assert.match(evidenceSource, /releaseQualified:\s*false/u);

console.log(JSON.stringify({
  check: 'lafea-nb-t4a-analysis-mesh-evidence',
  status: 'PASS',
  schema: LAFEA_ANALYSIS_MESH_EVIDENCE_SCHEMA,
  producerRevision: LAFEA_ANALYSIS_MESH_PRODUCER_REVISION,
  acceptedStages: ['LAFEA.3', 'LAFEA.4', 'LAFEA.5'],
  generatedMesh: false,
  displayTessellationAccepted: false,
  meshConfigAccepted: false,
  blockedQualityRegistersBlockedEvidence: true,
  releaseQualified: false,
}));

function intake({ stageId = 'LAFEA.3', meshValue, profile = PROFILE }) {
  return intakeRaw({ stageId, meshValue, profile });
}

function intakeRaw({ stageId = 'LAFEA.3', meshValue, profile = PROFILE }) {
  const meshHash = lafeaAnalysisMeshContentHash(meshValue);
  return {
    schema: LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
    stageId,
    sourceHash: SOURCE_HASH,
    canonicalModelHash: MODEL_HASH,
    analysisGeometryHash: GEOMETRY_HASH,
    meshProfile: profile,
    mesh: meshValue,
    authority: {
      schema: LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
      stageId,
      authorityRole: 'STAGE_AUTHORIZED_ANALYSIS_MESH',
      status: 'ACCEPTED_BY_STAGE_CONTRACT',
      producerRef: `TEST/${stageId}/ANALYSIS-MESH`,
      sourceHash: SOURCE_HASH,
      canonicalModelHash: MODEL_HASH,
      analysisGeometryHash: GEOMETRY_HASH,
      meshProfileHash: profile.semanticHash,
      meshHash,
    },
  };
}

function lifecycleWithGeometry(stageId, options = {}) {
  const sourceHash = options.sourceHash ?? SOURCE_HASH;
  const modelHash = options.modelHash ?? MODEL_HASH;
  const geometryHash = options.geometryHash ?? GEOMETRY_HASH;
  let value = createLafeaLifecycle(stageId, sourceHash);
  value = registerLafeaArtifact(value, createLafeaArtifactRecord({
    stageId,
    kind: 'CANONICAL_MODEL',
    status: 'CURRENT',
    artifactHash: modelHash,
    parentHashes: { sourceHash },
    qualification: 'PASS',
    producerRef: 'TEST/CANONICAL-MODEL',
  }), `TEST-${stageId}-MODEL`);
  value = registerLafeaArtifact(value, createLafeaArtifactRecord({
    stageId,
    kind: 'ANALYSIS_GEOMETRY',
    status: 'CURRENT',
    artifactHash: geometryHash,
    parentHashes: { sourceHash, canonicalModelHash: modelHash },
    qualification: 'PASS',
    producerRef: 'TEST/ANALYSIS-GEOMETRY',
  }), `TEST-${stageId}-GEOMETRY`);
  return value;
}

function meshProfile(continuumElement, shellElement) {
  return canonicalProfile(PROFILE_KINDS.MESH, {
    schema: 'lafea-mesh-profile/v1',
    profileIdentity: `NB-T4A-${continuumElement}-${shellElement}`,
    sourceRevision: 'TEST-1',
    fields: {
      continuumElement,
      shellElement,
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

function mesh(meshIdentity, nodes, elements) {
  return {
    schema: LAFEA_ANALYSIS_MESH_SCHEMA,
    meshIdentity,
    nodes,
    elements,
  };
}

function node(nodeId, x, y, z) {
  return { nodeId, x, y, z };
}

function element(elementId, elementType, nodeIds) {
  return { elementId, elementType, nodeIds };
}

function hash(value) {
  return canonicalLafeaSha256({ schema: 'nb-t4a-test-hash/v1', value });
}

function expectCode(body, code) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, code, `expected ${code}, received ${error?.code}`);
    return true;
  });
}
