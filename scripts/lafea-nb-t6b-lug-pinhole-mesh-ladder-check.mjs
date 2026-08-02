#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PROFILE_KINDS,
  canonicalProfile,
} from '../src/core/lafea-profile-contract/index.js';
import {
  LAFEA_LUG_PINHOLE_T6_MESH_PACKAGE_SCHEMA,
  LAFEA_LUG_PINHOLE_T6_MESH_SPEC_SCHEMA,
  generateLafeaLugPinholeT6Mesh,
  validateLafeaLugPinholeT6MeshPackage,
} from '../src/core/lafea-meshing/index.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_LUG_PINHOLE_MESH_LADDER_INTAKE_SCHEMA,
  LAFEA_LUG_PINHOLE_MESH_LADDER_SCHEMA,
  createLafeaLugPinholeMeshLadder,
  lafeaLugPinholeAnalysisGeometryHash,
  validateLafeaLugPinholeMeshLadder,
} from '../src/workspace/lafea-lug-pinhole-mesh-ladder.js';

let adversarialCount = 0;
sourceGuards();

const geometry = Object.freeze({
  center: Object.freeze({ x: 12.5, y: -7.25 }),
  holeRadius: 20,
  outerRadius: 100,
  startAngleDegrees: 0,
});
const sourceHash = hash('NB-T6B-SOURCE');
const canonicalModelHash = hash('NB-T6B-CANONICAL-MODEL');
const analysisGeometryHash = lafeaLugPinholeAnalysisGeometryHash(geometry);
const levels = [
  level(1, 2, 16, 40),
  level(2, 4, 32, 20),
  level(3, 8, 64, 10),
];
const intake = {
  schema: LAFEA_LUG_PINHOLE_MESH_LADDER_INTAKE_SCHEMA,
  stageId: 'LAFEA.3',
  templateId: 'C2D-LUG-PINHOLE',
  sourceHash,
  canonicalModelHash,
  analysisGeometryHash,
  geometry,
  levels,
  producerRef: 'NB-T6B/C2D-LUG-PINHOLE/LAFEA.3',
};

const ladder = createLafeaLugPinholeMeshLadder(intake);
assert.equal(ladder.schema, LAFEA_LUG_PINHOLE_MESH_LADDER_SCHEMA);
assert.equal(ladder.status, 'MESH_LADDER_QUALIFIED');
assert.equal(ladder.productionMeshGenerated, true);
assert.equal(ladder.selectedGeometryClass, 'CONCENTRIC_ANNULAR_LUG_PINHOLE');
assert.equal(ladder.arbitraryOuterProfileSupported, false);
assert.equal(ladder.arbitraryHoleTopologySupported, false);
assert.equal(ladder.solverExecuted, false);
assert.equal(ladder.recoveryProduced, false);
assert.equal(ladder.convergenceProduced, false);
assert.equal(ladder.codeAssessmentProduced, false);
assert.equal(ladder.releaseQualified, false);
assert.deepEqual(
  ladder.levels.map((row) => row.meshEvidence.mesh.elements.length),
  [64, 256, 1024],
);
assert.equal(ladder.levels.every((row) => row.status === 'QUALIFIED'), true);
assert.equal(ladder.levels.every((row) =>
  row.meshEvidence.status === 'CURRENT'
  && row.meshEvidence.qualification === 'PASS'), true);
assert.equal(new Set(ladder.levels.map((row) => row.meshEvidence.meshHash)).size, 3);
assert.equal(new Set(ladder.levels.map((row) => row.levelHash)).size, 3);

const errors = ladder.levels.map((row) =>
  row.meshPackage.quality.relativeAreaError);
assert.ok(errors[1] <= errors[0]);
assert.ok(errors[2] <= errors[1]);
assert.equal(ladder.levels.every((row) =>
  row.meshPackage.quality.minimumScaledJacobian > 0
  && row.meshPackage.quality.minimumIntegrationPointJacobian > 0), true);
assert.equal(ladder.levels.every((row) =>
  row.meshPackage.quality.holeBoundaryMaximumRadiusError < 1e-10
  && row.meshPackage.quality.outerBoundaryMaximumRadiusError < 1e-10), true);

for (const row of ladder.levels) {
  const packageValue = row.meshPackage;
  assert.equal(packageValue.schema, LAFEA_LUG_PINHOLE_T6_MESH_PACKAGE_SCHEMA);
  assert.equal(validateLafeaLugPinholeT6MeshPackage(packageValue).ok, true);
  assert.equal(packageValue.mesh.elements.every((element) =>
    element.elementType === 'T6' && element.nodeIds.length === 6), true);
  assert.equal(packageValue.featureSets.holeBoundary.edgeNodeIds.length,
    packageValue.spec.circumferentialDivisions);
  assert.equal(packageValue.featureSets.outerBoundary.edgeNodeIds.length,
    packageValue.spec.circumferentialDivisions);
  assert.equal(packageValue.featureSets.radialLines.length, 4);
  assertSharedMidsideIdentity(packageValue.mesh);
  assertRadialContainment(packageValue.mesh, geometry);
  assertBoundaryTriplets(packageValue);
  assert.equal(Object.isFrozen(packageValue), true);
  assert.equal(Object.isFrozen(row.meshEvidence), true);
}

assert.equal(validateLafeaLugPinholeMeshLadder(ladder).ok, true);
const replay = createLafeaLugPinholeMeshLadder(intake);
assert.equal(replay.ladderHash, ladder.ladderHash);
assert.deepEqual(
  replay.levels.map((row) => row.meshEvidence.artifactHash),
  ladder.levels.map((row) => row.meshEvidence.artifactHash),
);

expectCode('geometry parent mismatch', () =>
  createLafeaLugPinholeMeshLadder({
    ...intake,
    analysisGeometryHash: hash('STALE-GEOMETRY'),
  }), 'LAFEA_LUG_PINHOLE_ANALYSIS_GEOMETRY_HASH_MISMATCH');

expectCode('invalid radius order', () =>
  generateLafeaLugPinholeT6Mesh({
    schema: LAFEA_LUG_PINHOLE_T6_MESH_SPEC_SCHEMA,
    meshIdentity: 'INVALID-RADIUS',
    center: { x: 0, y: 0 },
    holeRadius: 50,
    outerRadius: 50,
    radialDivisions: 2,
    circumferentialDivisions: 16,
    startAngleDegrees: 0,
  }), 'LUG_PINHOLE_T6_RADIUS_ORDER_INVALID');

expectCode('non-quarterable circumference', () =>
  generateLafeaLugPinholeT6Mesh({
    schema: LAFEA_LUG_PINHOLE_T6_MESH_SPEC_SCHEMA,
    meshIdentity: 'INVALID-SECTORS',
    center: { x: 0, y: 0 },
    holeRadius: 20,
    outerRadius: 100,
    radialDivisions: 2,
    circumferentialDivisions: 18,
    startAngleDegrees: 0,
  }), 'LUG_PINHOLE_T6_CIRCUMFERENTIAL_DIVISIONS_NOT_QUARTERABLE');

expectCode('non-increasing refinement', () =>
  createLafeaLugPinholeMeshLadder({
    ...intake,
    levels: [
      level(1, 2, 16, 40),
      level(2, 2, 16, 40),
      level(3, 8, 64, 10),
    ],
  }), 'LAFEA_LUG_PINHOLE_MESH_LADDER_NOT_REFINED');

expectAnyCode('profile element mismatch', () =>
  createLafeaLugPinholeMeshLadder({
    ...intake,
    levels: [
      level(1, 2, 16, 40),
      {
        ...level(2, 4, 32, 20),
        meshProfile: profile('INVALID-T3', 20, 'T3'),
      },
      level(3, 8, 64, 10),
    ],
  }), [
    'LAFEA_ANALYSIS_MESH_PROFILE_ELEMENT_MISMATCH',
    'LAFEA_ANALYSIS_MESH_ELEMENT_FAMILY_NOT_AUTHORIZED',
  ]);

const tampered = structuredClone(ladder);
tampered.levels[1].meshPackage.mesh.nodes[0].x += 0.25;
assert.equal(validateLafeaLugPinholeMeshLadder(tampered).ok, false);
adversarialCount += 1;

const rotated = generateLafeaLugPinholeT6Mesh({
  schema: LAFEA_LUG_PINHOLE_T6_MESH_SPEC_SCHEMA,
  meshIdentity: 'ROTATED-PILOT',
  center: { x: 0, y: 0 },
  holeRadius: 10,
  outerRadius: 50,
  radialDivisions: 3,
  circumferentialDivisions: 24,
  startAngleDegrees: 17.5,
});
assert.equal(rotated.quality.minimumScaledJacobian > 0, true);
assert.equal(rotated.quality.holeBoundaryMaximumRadiusError < 1e-10, true);
assert.equal(rotated.quality.outerBoundaryMaximumRadiusError < 1e-10, true);
adversarialCount += 1;

console.log(JSON.stringify({
  schema: 'lafea-nb-t6b-lug-pinhole-mesh-ladder-check/v1',
  status: 'PASS',
  ladderHash: ladder.ladderHash,
  elementCounts: ladder.levels.map((row) =>
    row.meshEvidence.mesh.elements.length),
  nodeCounts: ladder.levels.map((row) =>
    row.meshEvidence.mesh.nodes.length),
  relativeAreaErrors: errors,
  minimumScaledJacobians: ladder.levels.map((row) =>
    row.meshPackage.quality.minimumScaledJacobian),
  adversarialCount,
  authority: {
    productionMeshGenerated: ladder.productionMeshGenerated,
    selectedGeometryClass: ladder.selectedGeometryClass,
    arbitraryOuterProfileSupported: ladder.arbitraryOuterProfileSupported,
    arbitraryHoleTopologySupported: ladder.arbitraryHoleTopologySupported,
    solverExecuted: ladder.solverExecuted,
    recoveryProduced: ladder.recoveryProduced,
    convergenceProduced: ladder.convergenceProduced,
    codeAssessmentProduced: ladder.codeAssessmentProduced,
    releaseQualified: ladder.releaseQualified,
  },
}));

function level(ordinal, radialDivisions, circumferentialDivisions,
  globalTargetSize) {
  return {
    ordinal,
    meshIdentity: `NB-T6B-LUG-PINHOLE-L${ordinal}`,
    radialDivisions,
    circumferentialDivisions,
    meshProfile: profile(
      `NB-T6B-LUG-PINHOLE-L${ordinal}-PROFILE`,
      globalTargetSize,
      'T6',
    ),
  };
}

function profile(identity, globalTargetSize, continuumElement) {
  return canonicalProfile(PROFILE_KINDS.MESH, {
    schema: 'lafea-mesh-profile/v1',
    profileIdentity: identity,
    sourceRevision: '1',
    fields: {
      continuumElement,
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
  });
}

function assertSharedMidsideIdentity(mesh) {
  const midpointByCornerEdge = new Map();
  for (const element of mesh.elements) {
    const corners = element.nodeIds.slice(0, 3);
    const midsides = element.nodeIds.slice(3);
    for (let edge = 0; edge < 3; edge += 1) {
      const key = edgeKey(corners[edge], corners[(edge + 1) % 3]);
      const midpointId = midsides[edge];
      const previous = midpointByCornerEdge.get(key);
      if (previous) assert.equal(previous, midpointId, `edge ${key}`);
      else midpointByCornerEdge.set(key, midpointId);
    }
  }
}

function assertRadialContainment(mesh, geometryValue) {
  const tolerance = 1e-9;
  for (const node of mesh.nodes) {
    const radius = Math.hypot(
      node.x - geometryValue.center.x,
      node.y - geometryValue.center.y,
    );
    assert.ok(radius >= geometryValue.holeRadius - tolerance,
      `${node.nodeId} entered the hole.`);
    assert.ok(radius <= geometryValue.outerRadius + tolerance,
      `${node.nodeId} left the outer boundary.`);
  }
}

function assertBoundaryTriplets(packageValue) {
  const nodeIds = new Set(packageValue.mesh.nodes.map((node) => node.nodeId));
  for (const boundary of [
    packageValue.featureSets.holeBoundary,
    packageValue.featureSets.outerBoundary,
  ]) {
    for (const edge of boundary.edgeNodeIds) {
      assert.equal(edge.length, 3);
      assert.equal(edge.every((nodeId) => nodeIds.has(nodeId)), true);
      assert.equal(boundary.nodeIds.includes(edge[0]), true);
      assert.equal(boundary.nodeIds.includes(edge[1]), true);
    }
  }
}

function edgeKey(first, second) {
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

function expectCode(label, body, code) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, code, `${label}: ${error?.message}`);
    return true;
  });
  adversarialCount += 1;
}

function expectAnyCode(label, body, codes) {
  assert.throws(body, (error) => {
    assert.equal(codes.includes(error?.code), true,
      `${label}: ${error?.code} ${error?.message}`);
    return true;
  });
  adversarialCount += 1;
}

function sourceGuards() {
  const core = fs.readFileSync(
    'src/core/lafea-meshing/lug-pinhole-t6.js',
    'utf8',
  );
  const producer = fs.readFileSync(
    'src/workspace/lafea-lug-pinhole-mesh-ladder.js',
    'utf8',
  );
  assert.doesNotMatch(`${core}\n${producer}`,
    /from ['"][^'"]*(?:local-continuum|local-shell|lafea-lifecycle|code|report)[^'"]*['"]/u);
  assert.doesNotMatch(`${core}\n${producer}`,
    /\b(?:calculateLocalContinuum|executeLafeaStage|registerLafeaArtifact|registerLafeaAnalysisMeshEvidence)\s*\(/u);
  assert.match(core, /arbitraryOuterProfileSupported:\s*false/u);
  assert.match(core, /arbitraryHoleTopologySupported:\s*false/u);
  assert.match(producer, /productionMeshGenerated:\s*true/u);
  assert.match(producer, /releaseQualified:\s*false/u);
  adversarialCount += 6;
}

function hash(value) {
  return canonicalLafeaSha256({
    schema: 'lafea-nb-t6b-test-hash-input/v1',
    value,
  });
}
