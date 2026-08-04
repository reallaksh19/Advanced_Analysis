#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  generateLafeaLugPinholeT6Mesh,
} from '../src/core/lafea-meshing/lug-pinhole-t6.js';
import {
  LAFEA_BUCKET_01_MESH_QUALIFICATION_INPUT_SCHEMA,
  qualifyLafeaBucket01Mesh,
  validateLafeaBucket01MeshQualificationEvidence,
} from '../src/workspace/lafea-bucket-01-mesh-qualification.js';

const levels = [
  { radialDivisions: 2, circumferentialDivisions: 16 },
  { radialDivisions: 4, circumferentialDivisions: 32 },
  { radialDivisions: 8, circumferentialDivisions: 64 },
  { radialDivisions: 16, circumferentialDivisions: 128 },
];
const tolerances = {
  areaRelative: 0.005,
  holeRadiusRelative: 0.001,
  holeCenterOverRadius: 1e-12,
  criticalLigamentRelative: 0.0025,
  perimeterRelative: 0.001,
  boundaryDeviationOverRadius: 0.001,
  midsideOverReference: 1e-12,
  rotationalSymmetryOverReference: 1e-12,
  duplicateNodeDistance: 1e-12,
};
const evidences = levels.map((level, index) => {
  const meshPackage = generateLafeaLugPinholeT6Mesh({
    schema: 'lafea-lug-pinhole-t6-mesh-spec/v1',
    meshIdentity: `B01-L${index + 1}`,
    center: { x: 2, y: -1 },
    holeRadius: 1,
    outerRadius: 3,
    ...level,
    startAngleDegrees: 11,
  });
  const evidence = qualifyLafeaBucket01Mesh({
    schema: LAFEA_BUCKET_01_MESH_QUALIFICATION_INPUT_SCHEMA,
    exactHeadSha: 'a'.repeat(40),
    meshPackageHash: `sha256:${String(index + 1).repeat(64)}`,
    qualificationProfileHash: `sha256:${'b'.repeat(64)}`,
    meshPackage,
    tolerances,
  });
  assert.equal(evidence.status, 'PASS');
  assert.equal(evidence.topology.connectedComponentCount, 1);
  assert.equal(evidence.validity.nonPositiveDenseJacobianCount, 0);
  assert.equal(evidence.validity.duplicateNodePairCount, 0);
  assert.equal(
    validateLafeaBucket01MeshQualificationEvidence(evidence, meshPackage).ok,
    true,
  );
  return { evidence, meshPackage };
});

assert.deepEqual(
  evidences.map(({ evidence }) => evidence.topology.elementCount),
  [64, 256, 1024, 4096],
);
for (let index = 1; index < evidences.length; index += 1) {
  assert.ok(
    evidences[index].evidence.geometry.areaRelativeError
      < evidences[index - 1].evidence.geometry.areaRelativeError,
  );
}

const duplicated = structuredClone(evidences[0].meshPackage);
duplicated.mesh.nodes[1].x = duplicated.mesh.nodes[0].x;
duplicated.mesh.nodes[1].y = duplicated.mesh.nodes[0].y;
const blocked = qualifyLafeaBucket01Mesh({
  schema: LAFEA_BUCKET_01_MESH_QUALIFICATION_INPUT_SCHEMA,
  exactHeadSha: 'a'.repeat(40),
  meshPackageHash: `sha256:${'c'.repeat(64)}`,
  qualificationProfileHash: `sha256:${'b'.repeat(64)}`,
  meshPackage: duplicated,
  tolerances,
});
assert.equal(blocked.status, 'BLOCKED');
assert.ok(blocked.reasons.includes('UNINTENDED_DUPLICATE_NODE_COORDINATES'));

const altered = structuredClone(evidences[0].evidence);
altered.geometry.areaRelativeError = 0;
assert.equal(
  validateLafeaBucket01MeshQualificationEvidence(
    altered,
    evidences[0].meshPackage,
  ).ok,
  false,
);

console.log('Bucket-01 governed 64/256/1024/4096 annular T6 mesh qualification checks passed.');
