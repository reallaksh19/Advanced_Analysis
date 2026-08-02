#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_LOAD_DRIVEN_PILOT_QUALIFICATION_SCHEMA,
  LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA,
  createLafeaLoadDrivenPilotQualification,
  createLafeaLugPinholePhysicalProblemProjection,
  evaluateLafeaLoadDrivenConvergence,
  executeLafeaLugPinholePhysicalProblemBatch,
  validateLafeaLoadDrivenPilotQualification,
} from '../src/workspace/lafea-controlled-continuum-public.js';
import { createNbT6cFixture } from './lafea-nb-t6c-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: ROOT,
  encoding: 'utf8',
}).trim();
let adversarialCount = 0;
sourceGuards();

const fixture = createNbT6cFixture(ROOT, HEAD);
const positive = executeLoadDriven([1000, 250]);
assert.equal(positive.execution.status, 'ACCEPTED');
assert.equal(positive.execution.accepted, true);
assert.equal(positive.execution.controllerResult.receipt.convergenceReady, true);
assert.equal(
  positive.execution.controllerResult.receipt.pilotConvergence.quantityId,
  'PLANE_STRESS_SIGMA_Z_INVARIANT',
);
assert.deepEqual(
  positive.projection.levels.map((row) => row.meshEvidence.mesh.elements.length),
  [16, 64, 256],
);

const qualification = createLafeaLoadDrivenPilotQualification({
  qualificationId: 'NB-T6D-C2D-LUG-PINHOLE-001',
  exactHeadSha: HEAD,
  projection: positive.projection,
  execution: positive.execution,
  tolerances: {
    equilibriumAbsolute: 1e-5,
    displacementRelative: 1,
    stressRelative: 1,
  },
});
assert.equal(
  qualification.schema,
  LAFEA_LOAD_DRIVEN_PILOT_QUALIFICATION_SCHEMA,
);
assert.equal(qualification.status, 'LOAD_DRIVEN_SELECTED_PILOT_QUALIFIED');
assert.equal(qualification.receipt.selectedPilotQualified, true);
assert.equal(qualification.receipt.freeDofSolveReady, true);
assert.equal(qualification.receipt.equilibriumReady, true);
assert.equal(qualification.receipt.displacementConvergence.status, 'PASS');
assert.equal(qualification.receipt.stressConvergence.status, 'PASS');
assert.equal(qualification.receipt.levelEvidence.length, 3);
assert.equal(qualification.receipt.levelEvidence.every((row) =>
  row.status === 'PASS'
  && row.freeDofCount > 0
  && row.solverMethod === 'DETERMINISTIC_CHOLESKY'
  && row.maximumDisplacementMagnitude > 0
  && row.maximumRetainedVonMises > 0), true);
assert.equal(qualification.authority.selectedPilotQualification, true);
assert.equal(qualification.authority.generalT7dAuthorized, false);
assert.equal(qualification.authority.shellAuthorized, false);
assert.equal(qualification.authority.codeReady, false);
assert.equal(qualification.authority.releaseQualified, false);
assert.equal(validateLafeaLoadDrivenPilotQualification(qualification).ok, true);
assert.equal(Object.isFrozen(qualification), true);

const replay = createLafeaLoadDrivenPilotQualification({
  qualificationId: 'NB-T6D-C2D-LUG-PINHOLE-001',
  exactHeadSha: HEAD,
  projection: positive.projection,
  execution: positive.execution,
  tolerances: {
    equilibriumAbsolute: 1e-5,
    displacementRelative: 1,
    stressRelative: 1,
  },
});
assert.equal(replay.semanticHash, qualification.semanticHash);
assert.equal(replay.manifest.semanticHash, qualification.manifest.semanticHash);
assert.equal(replay.receipt.evidenceHash, qualification.receipt.evidenceHash);

expectCode('stale exact head', () => createLafeaLoadDrivenPilotQualification({
  qualificationId: 'NB-T6D-STALE-HEAD',
  exactHeadSha: '0000000000000000000000000000000000000000',
  projection: positive.projection,
  execution: positive.execution,
  tolerances: {
    equilibriumAbsolute: 1e-5,
    displacementRelative: 1,
    stressRelative: 1,
  },
}), 'LAFEA_NB_T6D_EXACT_HEAD_PARENT_STALE');

const zero = executeLoadDriven([0, 0]);
expectCode('zero resultant', () => createLafeaLoadDrivenPilotQualification({
  qualificationId: 'NB-T6D-ZERO',
  exactHeadSha: HEAD,
  projection: zero.projection,
  execution: zero.execution,
  tolerances: {
    equilibriumAbsolute: 1e-5,
    displacementRelative: 1,
    stressRelative: 1,
  },
}), 'LAFEA_NB_T6D_NONZERO_RESULTANT_REQUIRED');

const staleBenchmark = structuredClone(positive.execution);
staleBenchmark.benchmarkQualification.mappingPackageHash = fixture.hash('STALE-MAPPING');
expectOneOfCodes('stale benchmark parent', () => qualifyWith(staleBenchmark), [
  'LAFEA_NB_T6D_EXECUTION_HASH_TAMPERED',
  'LAFEA_NB_T6D_EXECUTION_PARENT_STALE',
]);

const tamperedEquilibrium = structuredClone(positive.execution);
tamperedEquilibrium.controllerResult.levelResults[1]
  .execution.result.loadCaseResults[0]
  .equilibrium.reactionPlusAppliedForce.x = 1;
expectOneOfCodes('tampered result evidence', () => qualifyWith(tamperedEquilibrium), [
  'LAFEA_NB_T6D_RESULT_HASH_RECONSTRUCTION_FAILED',
  'LAFEA_NB_T6D_REACTION_EQUILIBRIUM_FAILED',
]);

const fullyConstrainedClaim = structuredClone(positive.execution);
fullyConstrainedClaim.controllerResult.levelResults[0]
  .execution.result.loadCaseResults[0]
  .solverEvidence.method = 'FULLY_CONSTRAINED_NO_FREE_SOLVE';
expectOneOfCodes('fully constrained claim', () => qualifyWith(fullyConstrainedClaim), [
  'LAFEA_NB_T6D_RESULT_HASH_RECONSTRUCTION_FAILED',
  'LAFEA_NB_T6D_FREE_DOF_SOLVE_EVIDENCE_INVALID',
]);

const tamperedRestraintProjection = structuredClone(positive.projection);
tamperedRestraintProjection.levels[0].document.constraints = [];
expectCode('tampered restraint projection', () =>
  createLafeaLoadDrivenPilotQualification({
    qualificationId: 'NB-T6D-RESTRAINT-TAMPER',
    exactHeadSha: HEAD,
    projection: tamperedRestraintProjection,
    execution: positive.execution,
    tolerances: {
      equilibriumAbsolute: 1e-5,
      displacementRelative: 1,
      stressRelative: 1,
    },
  }), 'LAFEA_NB_T6D_PROJECTION_INVALID');

const blockedConvergence = evaluateLafeaLoadDrivenConvergence(
  'ADVERSARIAL_QUANTITY',
  'MPa',
  [100, 120, 180],
  0.1,
);
assert.equal(blockedConvergence.status, 'BLOCKED');
assert.deepEqual(
  blockedConvergence.reasons,
  ['FINE_LEVEL_CHANGE_EXCEEDS_TOLERANCE'],
);
adversarialCount += 1;

const tamperedQualification = structuredClone(qualification);
tamperedQualification.receipt.selectedPilotQualified = false;
assert.equal(validateLafeaLoadDrivenPilotQualification(tamperedQualification).ok, false);
adversarialCount += 1;

console.log(JSON.stringify({
  schema: 'lafea-nb-t6d-load-driven-qualification-check/v1',
  status: 'PASS',
  exactHead: HEAD,
  pilot: 'C2D-LUG-PINHOLE -> LAFEA.3',
  elementCounts: qualification.receipt.levelEvidence.map((row) => row.elementCount),
  freeDofCounts: qualification.receipt.levelEvidence.map((row) => row.freeDofCount),
  solverMethods: qualification.receipt.levelEvidence.map((row) => row.solverMethod),
  displacementConvergence: qualification.receipt.displacementConvergence,
  stressConvergence: qualification.receipt.stressConvergence,
  qualificationHash: qualification.semanticHash,
  receiptHash: qualification.receipt.evidenceHash,
  adversarialCount,
  authority: qualification.authority,
}));

function sourceGuards() {
  const publicSource = fs.readFileSync(
    path.join(ROOT, 'src/workspace/lafea-controlled-continuum-public.js'),
    'utf8',
  );
  assert.match(publicSource, /createLafeaLoadDrivenPilotQualification/u);
  assert.match(publicSource, /validateLafeaLoadDrivenPilotQualification/u);
  assert.match(publicSource, /evaluateLafeaLoadDrivenConvergence/u);
  const workspace = path.join(ROOT, 'src/workspace');
  for (const file of walk(workspace)) {
    if (!file.endsWith('.js')
      || !/(?:wizard|panel|view|ui|import)/iu.test(path.basename(file))) {
      continue;
    }
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(
      source,
      /lafea-load-driven-pilot-qualification\.js/u,
      `${path.relative(ROOT, file)} must not import NB-T6D qualification.`,
    );
    assert.doesNotMatch(
      source,
      /\bcreateLafeaLoadDrivenPilotQualification\s*\(/u,
      `${path.relative(ROOT, file)} must not invoke NB-T6D qualification.`,
    );
  }
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function executeLoadDriven(resultant) {
  const input = structuredClone(fixture.projectionInput);
  input.physicalProblem.modelIdentity = 'NB-T6D-C2D-LUG-PINHOLE';
  input.physicalProblem.sourceAncestry.sourceModelIdentity =
    'NB-T6D-C2D-LUG-PINHOLE';
  input.physicalProblem.sourceAncestry.adapterIdentity =
    'NB-T6D-LOAD-DRIVEN-QUALIFICATION';
  input.physicalProblem.loadCase.resultant = resultant;
  input.physicalProblem.limitations = [
    'CONCENTRIC_ANNULAR_LUG_PINHOLE_ONLY',
    'LOAD_DRIVEN_SELECTED_PILOT_QUALIFICATION',
  ];
  input.physicalProblem.kinematics = {
    mode: 'BOUNDARY_ZERO',
    ux: { xCoefficient: 0, yCoefficient: 0, constant: 0 },
    uy: { xCoefficient: 0, yCoefficient: 0, constant: 0 },
  };
  input.featureProjection.loadFeature = {
    featureId: 'LOAD-EDGE',
    role: 'RADIAL_QUARTER_0',
    baseStartEdge: 0,
    baseEdgeCount: 1,
  };
  input.featureProjection.boundaryFeature = {
    featureId: 'ROOT-REGION',
    role: 'RADIAL_QUARTER_2',
    baseStartEdge: 0,
    baseEdgeCount: 1,
  };
  input.producerRef = 'NB-T6D/C2D-LUG-PINHOLE/LAFEA.3';
  input.sourceAuthorityOriginRef = 'NB-T6D/C2D-LUG-PINHOLE';
  const projection = createLafeaLugPinholePhysicalProblemProjection(input);
  const benchmarkQualification = fixture.benchmark(
    projection.mappingPackage.semanticHash,
  );
  const execution = executeLafeaLugPinholePhysicalProblemBatch({
    schema: LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA,
    projection,
    benchmarkQualification,
    requestId: 'NB-T6D-C2D-LUG-PINHOLE-LOAD-DRIVEN',
    recoveryProfileHash: fixture.hash('NB-T6D-INTEGRATION-POINT-RECOVERY'),
    convergenceRequest: {
      quantityId: 'PLANE_STRESS_SIGMA_Z_INVARIANT',
      units: 'MPa',
      tolerance: 1e-12,
      loadCaseId: 'LC1',
      component: 'SIGMA_Z',
      reducer: 'MAXIMUM_SIGNED',
    },
  });
  return { projection, execution };
}

function qualifyWith(execution) {
  return createLafeaLoadDrivenPilotQualification({
    qualificationId: 'NB-T6D-ADVERSARIAL',
    exactHeadSha: HEAD,
    projection: positive.projection,
    execution,
    tolerances: {
      equilibriumAbsolute: 1e-5,
      displacementRelative: 1,
      stressRelative: 1,
    },
  });
}

function expectCode(label, body, code) {
  expectOneOfCodes(label, body, [code]);
}

function expectOneOfCodes(label, body, codes) {
  assert.throws(body, (error) => codes.includes(error?.code), label);
  adversarialCount += 1;
}
