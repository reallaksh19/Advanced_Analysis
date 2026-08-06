#!/usr/bin/env node
import assert from 'node:assert/strict';
import { PROFILE_KINDS, canonicalProfile } from '../src/core/lafea-profile-contract/index.js';
import {
  LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  LAFEA_ANALYSIS_MESH_SCHEMA,
  createLafeaAnalysisMeshEvidence,
  lafeaAnalysisMeshContentHash,
} from '../src/workspace/lafea-analysis-mesh-evidence.js';
import { validateLafeaAnalysisMeshEvidence } from '../src/workspace/lafea-analysis-mesh-evidence-validator.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

const SOURCE = hash('SOURCE');
const MODEL = hash('MODEL');
const GEOMETRY = hash('GEOMETRY');
const PROFILE = meshProfile();
const originalMesh = mesh([
  node('N2', 10, 0),
  node('N1', 0, 0),
  node('N3', 0, 10),
]);
const canonical = evidence(originalMesh);
const reordered = evidence(mesh([
  node('N3', 0, 10),
  node('N2', 10, 0),
  node('N1', 0, 0),
]));
assert.equal(JSON.stringify(canonical), JSON.stringify(reordered));
assert.equal(canonical.meshHash, reordered.meshHash);
assert.deepEqual(validateLafeaAnalysisMeshEvidence(canonical), canonical);
assert.ok(Object.isFrozen(canonical));
assert.ok(Object.isFrozen(canonical.quality.gateResults));

reject(mutate(canonical, (value) => { value.extraDisplayCache = {}; }));
reject(mutate(canonical, (value) => { value.schema = 'lafea-analysis-mesh-evidence/v2'; }),
  'LAFEA_ANALYSIS_MESH_EVIDENCE_SCHEMA_INVALID');
reject(mutate(canonical, (value) => { value.quality.elementCount += 1; }));
reject(mutate(canonical, (value) => {
  value.quality.warningElementIds = ['E404'];
}));
reject(mutate(canonical, (value) => {
  value.quality.blockingElementIds = ['E404'];
}));
reject(mutate(canonical, (value) => {
  value.artifactRecord.producerRef = 'ATTACKER/REBOUND';
}));
reject(mutate(canonical, (value) => {
  value.registrationId = 'ATTACKER-REGISTRATION';
}));
reject(mutate(canonical, (value) => {
  value.mesh.nodes[0].x += 2;
  value.meshHash = lafeaAnalysisMeshContentHash(value.mesh);
}));
reject(mutate(canonical, (value) => {
  value.authority.producerRef = 'ATTACKER/INNER';
  value.artifactRecord.producerRef = 'ATTACKER/INNER';
}));

const duplicateNodeMesh = structuredClone(originalMesh);
duplicateNodeMesh.nodes[1].nodeId = duplicateNodeMesh.nodes[0].nodeId;
assert.throws(() => evidence(duplicateNodeMesh));

const missingNodeMesh = structuredClone(originalMesh);
missingNodeMesh.elements[0].nodeIds[2] = 'N404';
assert.throws(() => evidence(missingNodeMesh));

const duplicateElementMesh = structuredClone(originalMesh);
duplicateElementMesh.elements.push(structuredClone(duplicateElementMesh.elements[0]));
assert.throws(() => evidence(duplicateElementMesh));

const wrongFamily = structuredClone(originalMesh);
wrongFamily.elements[0].elementType = 'CST_DKT_TRI3_THIN_SHELL_V1';
assert.throws(() => evidence(wrongFamily));

console.log(JSON.stringify({
  check: 'lafea-nb-t4a-analysis-mesh-adversarial',
  status: 'PASS',
  canonicalPermutationStable: true,
  exactKeyTamperRejected: true,
  innerValueAndObviousHashRejected: true,
  qualityFindingTamperRejected: true,
  producerAndRegistrationTamperRejected: true,
  duplicateAndMissingIdentityRejected: true,
  incompatibleElementFamilyRejected: true,
  freezingEstablishesAuthenticity: false,
}));

function reject(value, code = null) {
  assert.throws(
    () => validateLafeaAnalysisMeshEvidence(value),
    (error) => !code || error?.code === code,
  );
}

function mutate(value, operation) {
  const copy = structuredClone(value);
  operation(copy);
  return copy;
}

function evidence(meshValue) {
  const meshHash = lafeaAnalysisMeshContentHash(meshValue);
  return createLafeaAnalysisMeshEvidence({
    schema: LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
    stageId: 'LAFEA.3',
    sourceHash: SOURCE,
    canonicalModelHash: MODEL,
    analysisGeometryHash: GEOMETRY,
    meshProfile: PROFILE,
    mesh: meshValue,
    authority: {
      schema: LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
      stageId: 'LAFEA.3',
      authorityRole: 'STAGE_AUTHORIZED_ANALYSIS_MESH',
      status: 'ACCEPTED_BY_STAGE_CONTRACT',
      producerRef: 'WP-MC1/ADVERSARIAL',
      sourceHash: SOURCE,
      canonicalModelHash: MODEL,
      analysisGeometryHash: GEOMETRY,
      meshProfileHash: PROFILE.semanticHash,
      meshHash,
    },
  });
}

function mesh(nodes) {
  return {
    schema: LAFEA_ANALYSIS_MESH_SCHEMA,
    meshIdentity: 'WP-MC1-ADVERSARIAL',
    nodes,
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

function meshProfile() {
  return canonicalProfile(PROFILE_KINDS.MESH, {
    schema: 'lafea-mesh-profile/v1',
    profileIdentity: 'WP-MC1-ADVERSARIAL-T3',
    sourceRevision: '1',
    fields: {
      continuumElement: 'T3',
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
  return canonicalLafeaSha256({
    schema: 'wp-mc1-adversarial-hash/v1',
    value,
  });
}
