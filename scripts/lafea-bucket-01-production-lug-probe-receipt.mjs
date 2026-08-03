#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_FIXED_PROBE_INPUT_SCHEMA,
  recoverLafeaBucket01FixedProbe,
  validateLafeaBucket01FixedProbeEvidence,
} from '../src/workspace/lafea-bucket-01-fixed-probe.js';
import {
  LAFEA_BUCKET_01_STRESS_CONVERGENCE_INPUT_SCHEMA,
  evaluateLafeaBucket01StressConvergence,
  validateLafeaBucket01StressConvergenceEvidence,
} from '../src/workspace/lafea-bucket-01-stress-convergence.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_PATH = path.join(
  ROOT,
  'validation/bucket-01/08-production-lug-fixed-probe-spec.json',
);
const PROJECTION_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_PRODUCTION_PROJECTION_PATH
    ?? 'reports/qualification/lafea-bucket-01-production-projection.json',
);
const EXECUTION_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_PRODUCTION_EXECUTION_PATH
    ?? 'reports/qualification/lafea-bucket-01-production-execution.json',
);
const REPORT_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_PRODUCTION_LUG_PROBE_REPORT_PATH
    ?? 'reports/qualification/lafea-bucket-01-production-lug-fixed-probes.json',
);
const exactHeadSha = process.env.EXPECTED_HEAD_SHA?.trim()
  || execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
const projection = JSON.parse(fs.readFileSync(PROJECTION_PATH, 'utf8'));
const execution = JSON.parse(fs.readFileSync(EXECUTION_PATH, 'utf8'));

validateSpec(spec);
validateEnvelope(
  projection,
  execution,
  exactHeadSha,
  spec.meshLadder.length,
);
const levels = spec.meshLadder.map((definition, index) => normalizeLevel(
  definition,
  projection.levels[index],
  execution.controllerResult.levelResults[index],
));
const standaloneProbeReceipts = spec.probes.map((definition) =>
  evaluateFixedLocation({
    probeId: definition.probeId,
    role: 'FIXED_PHYSICAL_PROBE',
    zone: definition.zone,
    component: definition.component,
    units: definition.units,
    x: definition.x,
    y: definition.y,
    radius: definition.radius,
    angleDegrees: definition.angleDegrees,
  }, levels));
const pathReceipts = spec.paths.map((pathDefinition) =>
  evaluatePath(pathDefinition, levels));
const fixedLocations = [
  ...standaloneProbeReceipts,
  ...pathReceipts.flatMap((row) => row.stationReceipts),
];
const failingLocations = fixedLocations
  .filter((row) => row.status !== 'PASS')
  .map((row) => ({
    probeId: row.probeId,
    role: row.role,
    pathId: row.pathId,
    stationId: row.stationId,
    zone: row.zone,
    reasons: row.reasons,
    observations: row.observations,
    fineGridGci: row.convergence.fineGridGci,
    observedOrder: row.convergence.observedOrder,
    classification: row.convergence.classification,
  }));
const status = failingLocations.length === 0 ? 'PASS' : 'BLOCKED';

const reportBase = {
  schema: 'lafea-bucket-01-production-lug-fixed-probe-evidence/v2',
  producerRevision: 'B01-PRODUCTION-LUG-PROBES.3',
  exactHeadSha,
  specId: spec.specId,
  benchmarkId: spec.benchmarkId,
  specHash: canonicalLafeaSha256(spec),
  projectionHash: projection.projectionHash,
  executionHash: execution.executionHash,
  governedLevelOrdinals: spec.convergenceWindow.governedLevelOrdinals,
  evaluatedLevelOrdinals: spec.convergenceWindow.evaluatedLevelOrdinals,
  levelParents: levels.map((level) => ({
    ordinal: level.ordinal,
    elementCount: level.definition.elementCount,
    meshSize: level.definition.meshSize,
    meshHash: level.meshHash,
    recoveryHash: level.recoveryHash,
    resultHash: level.resultHash,
    solverMethod: level.loadCase.solverEvidence.method,
    stiffnessStorage: level.result.meshEvidence.globalStiffnessStorage ?? 'DENSE',
  })),
  standaloneProbeReceipts,
  pathReceipts,
  failingLocations,
  status,
  reasons: failingLocations.map((row) =>
    `FIXED_LOCATION_BLOCKED:${row.probeId}:${row.reasons.join('+')}`),
  authority: {
    fixedPhysicalCoordinatesFrozenBeforeProductionStressObservation: true,
    directElementPointRecovery: true,
    retainedNodalDisplacementAuthority: true,
    retainedConstitutiveMatrixAuthority: true,
    integrationPointExtrapolationUsed: false,
    elementLocalReconstruction: true,
    finestThreeOfGovernedFourGciAcceptance: true,
    movingMaximumUsed: false,
    nodalProjectionUsed: false,
    crossElementAveragingUsed: false,
    codeAssessmentAuthorized: false,
    bucketQualified: false,
  },
  qualificationStates: {
    implemented: true,
    productionLugProbeReceiptProduced: true,
    solverVerified: true,
    stressVerified: status === 'PASS',
    codeVerified: false,
    integrationVerified: false,
    bucketQualified: false,
  },
};
const report = {
  ...reportBase,
  evidenceHash: canonicalLafeaSha256(reportBase),
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));
if (status !== 'PASS') process.exit(1);

function validateSpec(value) {
  assert.equal(value.schema, 'lafea-bucket-01-production-lug-probe-spec/v2');
  assert.equal(value.benchmarkId, 'C2D-LUG-PINHOLE-01');
  assert.equal(value.stageId, 'LAFEA.3');
  assert.equal(value.formulation, 'PLANE_STRESS');
  assert.equal(value.loadCaseId, 'LC1');
  assert.deepEqual(
    value.meshLadder.map((row) => row.elementCount),
    [64, 256, 1024, 4096],
  );
  assert.deepEqual(value.convergenceWindow.governedLevelOrdinals, [1, 2, 3, 4]);
  assert.deepEqual(value.convergenceWindow.evaluatedLevelOrdinals, [2, 3, 4]);
  assert.equal(value.authority.coordinatesFrozenBeforeProductionStressObservation, true);
  assert.equal(value.authority.productionOutputUsedToSelectCoordinates, false);
  assert.equal(value.authority.productionOutputUsedToSetTolerances, false);
  assert.equal(value.authority.movingMaximumUsed, false);
  assert.equal(value.authority.nodalProjectionUsed, false);
  assert.equal(value.authority.crossElementAveragingUsed, false);
  assert.equal(value.authority.integrationPointExtrapolationUsed, false);
  assert.equal(
    value.authority.recovery,
    'DIRECT_T6_B_MATRIX_AT_FIXED_PHYSICAL_COORDINATE',
  );
}

function validateEnvelope(projectionValue, executionValue, head, levelCount) {
  assert.equal(
    projectionValue.schema,
    'lafea-lug-pinhole-physical-problem-projection/v1',
  );
  assert.equal(projectionValue.status, 'PROJECTION_READY');
  assert.equal(projectionValue.releaseRecord.candidateHeadSha, head);
  assert.equal(
    executionValue.schema,
    'lafea-lug-pinhole-physical-problem-execution/v1',
  );
  assert.equal(executionValue.status, 'ACCEPTED');
  assert.equal(executionValue.accepted, true);
  assert.equal(executionValue.projectionHash, projectionValue.projectionHash);
  assert.equal(executionValue.controllerResult.status, 'ACCEPTED');
  assert.equal(executionValue.controllerResult.accepted, true);
  assert.equal(projectionValue.levels.length, levelCount);
  assert.equal(executionValue.controllerResult.levelResults.length, levelCount);
}

function normalizeLevel(definition, projected, controlled) {
  assert.equal(projected.ordinal, definition.ordinal);
  assert.equal(controlled.ordinal, definition.ordinal);
  assert.equal(controlled.levelEvidence.status, 'ACCEPTED');
  assert.equal(controlled.levelEvidence.calculationAccepted, true);
  assert.equal(
    projected.meshEvidence.mesh.elements.length,
    definition.elementCount,
  );
  assert.equal(controlled.meshEvidence.meshHash, projected.meshEvidence.meshHash);
  assert.equal(controlled.levelEvidence.meshHash, projected.meshEvidence.meshHash);
  assert.match(controlled.levelEvidence.recoveryHash, /^sha256:[0-9a-f]{64}$/u);
  assert.match(controlled.levelEvidence.resultHash, /^sha256:[0-9a-f]{64}$/u);
  const result = controlled.execution.result;
  assert.equal(result.schema, 'local-continuum-result/v1');
  assert.equal(result.qualification.state, 'ACCEPTED');
  assert.equal(result.meshEvidence.formulation, 'PLANE_STRESS');
  const loadCase = result.loadCaseResults.find(
    (row) => row.loadCaseId === spec.loadCaseId,
  );
  assert.ok(loadCase, `missing ${spec.loadCaseId} at level ${definition.ordinal}`);
  assert.equal(loadCase.equilibrium.accepted, true);
  assert.equal(loadCase.energyQualification.accepted, true);
  assert.equal(loadCase.solverEvidence.accepted, true);
  return {
    ordinal: definition.ordinal,
    definition,
    mesh: projected.meshEvidence.mesh,
    meshHash: controlled.levelEvidence.meshHash,
    recoveryHash: controlled.levelEvidence.recoveryHash,
    resultHash: controlled.levelEvidence.resultHash,
    result,
    loadCase,
  };
}

function evaluatePath(pathDefinition, levelsValue) {
  const stations = pathDefinition.stations.map((station) =>
    evaluateFixedLocation({
      probeId: `${pathDefinition.pathId}:${station.stationId}`,
      role: 'FIXED_STRESS_PATH_STATION',
      pathId: pathDefinition.pathId,
      stationId: station.stationId,
      zone: station.zone,
      component: pathDefinition.component,
      units: pathDefinition.units,
      x: station.x,
      y: station.y,
      radius: station.radius,
      angleDegrees: pathDefinition.angleDegrees,
    }, levelsValue));
  const status = stations.every((row) => row.status === 'PASS')
    ? 'PASS' : 'BLOCKED';
  const base = {
    schema: 'lafea-bucket-01-production-lug-fixed-path-evidence/v2',
    pathId: pathDefinition.pathId,
    component: pathDefinition.component,
    units: pathDefinition.units,
    angleDegrees: pathDefinition.angleDegrees,
    stationReceipts: stations,
    stationCount: stations.length,
    status,
    reasons: stations
      .filter((row) => row.status !== 'PASS')
      .map((row) => `STATION_BLOCKED:${row.probeId}`),
    authority: {
      samplingAuthority: 'FIXED_STRESS_PATH',
      allStationsFrozenBeforeProductionStressObservation: true,
      directElementPointRecovery: true,
      retainedNodalDisplacementAuthority: true,
      retainedConstitutiveMatrixAuthority: true,
      integrationPointExtrapolationUsed: false,
      movingMaximumUsed: false,
      nodalProjectionUsed: false,
      crossElementAveragingUsed: false,
    },
  };
  return { ...base, semanticHash: canonicalLafeaSha256(base) };
}

function evaluateFixedLocation(definition, levelsValue) {
  const locationDefinitionHash = canonicalLafeaSha256({
    schema: 'lafea-bucket-01-production-lug-fixed-location/v1',
    specId: spec.specId,
    benchmarkId: spec.benchmarkId,
    loadCaseId: spec.loadCaseId,
    probeId: definition.probeId,
    role: definition.role,
    pathId: definition.pathId ?? null,
    stationId: definition.stationId ?? null,
    radius: definition.radius,
    angleDegrees: definition.angleDegrees,
    x: definition.x,
    y: definition.y,
    component: definition.component,
    units: definition.units,
    zone: definition.zone,
  });
  const governedProbeEvidences = levelsValue.map((level) => {
    const evidence = recoverLafeaBucket01FixedProbe({
      schema: LAFEA_BUCKET_01_FIXED_PROBE_INPUT_SCHEMA,
      exactHeadSha,
      meshHash: level.meshHash,
      recoveryHash: level.recoveryHash,
      mesh: level.mesh,
      result: level.result,
      probe: {
        probeId: definition.probeId,
        loadCaseId: spec.loadCaseId,
        x: definition.x,
        y: definition.y,
        component: definition.component,
        units: definition.units,
        locationDefinitionHash,
      },
    });
    assert.equal(
      validateLafeaBucket01FixedProbeEvidence(
        evidence,
        level.mesh,
        level.result,
      ).ok,
      true,
    );
    assert.equal(evidence.status, 'PASS');
    assert.equal(
      evidence.recoveryAuthority,
      'ELEMENT_LOCAL_DIRECT_DISPLACEMENT_GRADIENT',
    );
    assert.equal(evidence.retainedIntegrationPointExtrapolationUsed, false);
    assert.ok(
      evidence.mappingResidual <= spec.tolerances.mappingResidualMax,
      `${definition.probeId} level ${level.ordinal} mapping residual`,
    );
    const naturalMargin = Math.min(
      evidence.naturalCoordinates.xi,
      evidence.naturalCoordinates.eta,
      1 - evidence.naturalCoordinates.xi - evidence.naturalCoordinates.eta,
    );
    assert.ok(
      naturalMargin >= spec.tolerances.naturalCoordinateMarginMin,
      `${definition.probeId} level ${level.ordinal} natural margin`,
    );
    return evidence;
  });
  const convergenceLevels = levelsValue.slice(-3);
  const probeEvidences = governedProbeEvidences.slice(-3);
  const gciTolerance = definition.zone === 'HIGH_GRADIENT'
    ? spec.tolerances.highGradientGciMax
    : spec.tolerances.nonSingularGciMax;
  const stressConvergenceEvidence = evaluateLafeaBucket01StressConvergence({
    schema: LAFEA_BUCKET_01_STRESS_CONVERGENCE_INPUT_SCHEMA,
    exactHeadSha,
    probeEvidences,
    meshSizes: convergenceLevels.map((row) => row.definition.meshSize),
    gciTolerance,
    minimumObservedOrder: spec.tolerances.minimumObservedOrder,
    asymptoticRatioBounds: spec.tolerances.asymptoticRatioBounds,
  });
  assert.equal(
    validateLafeaBucket01StressConvergenceEvidence(
      stressConvergenceEvidence,
      probeEvidences,
    ).ok,
    true,
  );
  return {
    probeId: definition.probeId,
    role: definition.role,
    pathId: definition.pathId ?? null,
    stationId: definition.stationId ?? null,
    zone: definition.zone,
    component: definition.component,
    units: definition.units,
    physicalCoordinates: { x: definition.x, y: definition.y },
    radius: definition.radius,
    angleDegrees: definition.angleDegrees,
    locationDefinitionHash,
    governedLevelOrdinals: levelsValue.map((row) => row.ordinal),
    evaluatedLevelOrdinals: convergenceLevels.map((row) => row.ordinal),
    governedObservations: governedProbeEvidences.map(
      (row) => row.authoritativeValue,
    ),
    observations: probeEvidences.map((row) => row.authoritativeValue),
    governedFixedProbeEvidenceHashes: governedProbeEvidences.map(
      (row) => row.semanticHash,
    ),
    fixedProbeEvidenceHashes: probeEvidences.map((row) => row.semanticHash),
    convergence: stressConvergenceEvidence.convergence,
    stressConvergenceEvidenceHash: stressConvergenceEvidence.semanticHash,
    gciTolerance,
    status: stressConvergenceEvidence.status,
    reasons: stressConvergenceEvidence.reasons,
  };
}
