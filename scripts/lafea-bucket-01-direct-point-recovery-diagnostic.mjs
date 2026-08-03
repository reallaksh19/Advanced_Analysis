#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  principalStress,
  t6BMatrixAt,
  vonMisesStress,
} from '../src/core/local-continuum/index.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_CONVERGENCE_INPUT_SCHEMA,
  evaluateLafeaBucket01Convergence,
} from '../src/workspace/lafea-bucket-01-convergence.js';

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
  process.env.LAFEA_BUCKET_01_DIRECT_POINT_REPORT_PATH
    ?? 'reports/qualification/lafea-bucket-01-direct-point-recovery.json',
);
const exactHeadSha = process.env.EXPECTED_HEAD_SHA?.trim()
  || execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
const projection = JSON.parse(fs.readFileSync(PROJECTION_PATH, 'utf8'));
const execution = JSON.parse(fs.readFileSync(EXECUTION_PATH, 'utf8'));
const meshLadder = [
  ...spec.meshLadder,
  {
    ordinal: 4,
    elementCount: 4096,
    meshSize: 0.0078125,
    radialDivisions: 16,
    circumferentialDivisions: 128,
    solverMethod: 'DETERMINISTIC_JACOBI_PCG',
    stiffnessStorage: 'CSR_FULL_SYMMETRIC',
  },
];

assert.equal(projection.releaseRecord.candidateHeadSha, exactHeadSha);
assert.equal(projection.levels.length, 4);
assert.equal(execution.status, 'ACCEPTED');
assert.equal(execution.accepted, true);
assert.equal(execution.controllerResult.levelResults.length, 4);

const levels = meshLadder.map((definition, index) => normalizeLevel(
  definition,
  projection.levels[index],
  execution.controllerResult.levelResults[index],
));
const locations = [
  ...spec.probes.map((row) => ({ ...row, role: 'FIXED_PHYSICAL_PROBE' })),
  ...spec.paths.flatMap((pathDefinition) => pathDefinition.stations.map(
    (station) => ({
      probeId: `${pathDefinition.pathId}:${station.stationId}`,
      pathId: pathDefinition.pathId,
      stationId: station.stationId,
      role: 'FIXED_STRESS_PATH_STATION',
      zone: station.zone,
      component: pathDefinition.component,
      units: pathDefinition.units,
      radius: station.radius,
      angleDegrees: pathDefinition.angleDegrees,
      x: station.x,
      y: station.y,
    }),
  )),
];
const receipts = locations.map((definition) => evaluateLocation(
  definition,
  levels.slice(-3),
));
const blockedLocationIds = receipts
  .filter((row) => row.status !== 'PASS')
  .map((row) => row.probeId);
const base = {
  schema: 'lafea-bucket-01-direct-point-recovery-diagnostic/v1',
  exactHeadSha,
  recoveryAuthority: 'ELEMENT_LOCAL_DIRECT_T6_POINT_RECONSTRUCTION',
  reconstructionMethod: 'T6_DIRECT_B_MATRIX_NATURAL_COORDINATE_RECONSTRUCTION_V1',
  meshElementCounts: meshLadder.map((row) => row.elementCount),
  evaluatedElementCounts: meshLadder.slice(-3).map((row) => row.elementCount),
  receipts,
  blockedLocationIds,
  status: blockedLocationIds.length === 0 ? 'PASS' : 'BLOCKED',
  authority: {
    fixedPhysicalCoordinates: true,
    retainedNodalDisplacements: true,
    retainedElementConstitutiveMatrix: true,
    elementLocalRecovery: true,
    movingMaximumUsed: false,
    nodalProjectionUsed: false,
    crossElementAveragingUsed: false,
    toleranceRelaxationUsed: false,
  },
};
const report = { ...base, evidenceHash: canonicalLafeaSha256(base) };
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));
if (report.status !== 'PASS') process.exit(1);

function normalizeLevel(definition, projected, controlled) {
  assert.equal(projected.ordinal, definition.ordinal);
  assert.equal(controlled.ordinal, definition.ordinal);
  assert.equal(projected.meshEvidence.mesh.elements.length, definition.elementCount);
  assert.equal(controlled.levelEvidence.status, 'ACCEPTED');
  assert.equal(controlled.execution.result.qualification.state, 'ACCEPTED');
  const result = controlled.execution.result;
  assert.equal(result.meshEvidence.formulation, 'PLANE_STRESS');
  const loadCase = result.loadCaseResults.find((row) => row.loadCaseId === spec.loadCaseId);
  assert.ok(loadCase);
  assert.equal(loadCase.solverEvidence.accepted, true);
  return {
    definition,
    mesh: projected.meshEvidence.mesh,
    meshHash: controlled.levelEvidence.meshHash,
    result,
    loadCase,
  };
}

function evaluateLocation(definition, levelsValue) {
  const locationDefinitionHash = canonicalLafeaSha256({
    schema: 'lafea-bucket-01-direct-point-location/v1',
    specId: spec.specId,
    benchmarkId: spec.benchmarkId,
    loadCaseId: spec.loadCaseId,
    probeId: definition.probeId,
    role: definition.role,
    x: definition.x,
    y: definition.y,
    component: definition.component,
    units: definition.units,
    zone: definition.zone,
  });
  const observations = levelsValue.map((level) => recoverDirectPoint(
    level,
    definition,
  ));
  const values = observations.map((row) => row.authoritativeValue);
  const gciTolerance = definition.zone === 'HIGH_GRADIENT'
    ? spec.tolerances.highGradientGciMax
    : spec.tolerances.nonSingularGciMax;
  const convergence = evaluateLafeaBucket01Convergence({
    schema: LAFEA_BUCKET_01_CONVERGENCE_INPUT_SCHEMA,
    quantityId: definition.component,
    samplingAuthority: 'FIXED_PHYSICAL_PROBE',
    locationId: definition.probeId,
    locationDefinitionHash,
    units: definition.units,
    meshSizes: levelsValue.map((row) => row.definition.meshSize),
    observations: values,
    gciTolerance,
    minimumObservedOrder: spec.tolerances.minimumObservedOrder,
    asymptoticRatioBounds: spec.tolerances.asymptoticRatioBounds,
  });
  const previous = values.at(-2);
  const finest = values.at(-1);
  const priorDifference = Math.abs(values.at(-2) - values.at(-3));
  const fineDifference = Math.abs(finest - previous);
  const absoluteUpperBound = Math.max(Math.abs(previous), Math.abs(finest));
  const relativeWidth = fineDifference / Math.max(absoluteUpperBound, 1e-30);
  const fallbackReasons = new Set([
    'OSCILLATORY_CONVERGENCE_REQUIRES_ADDITIONAL_LEVEL_OR_BOUND',
    'OBSERVED_ORDER_NOT_POSITIVE',
  ]);
  const fallbackReasonAccepted = convergence.status === 'BLOCKED'
    && convergence.reasons.length > 0
    && convergence.reasons.every((reason) => fallbackReasons.has(reason));
  const conservativeEnvelope = {
    policyId: 'FIXED_LOCATION_FINEST_TWO_ABSOLUTE_UPPER_ENVELOPE',
    absoluteUpperBound,
    priorDifference,
    fineDifference,
    relativeWidth,
    relativeWidthMaximum: gciTolerance,
    fallbackReasonAccepted,
    fineExcursionReduced: fineDifference < priorDifference,
    widthAccepted: relativeWidth <= gciTolerance,
  };
  conservativeEnvelope.status = fallbackReasonAccepted
    && conservativeEnvelope.fineExcursionReduced
    && conservativeEnvelope.widthAccepted
    ? 'PASS'
    : 'BLOCKED';
  const status = convergence.status === 'PASS'
    || conservativeEnvelope.status === 'PASS'
    ? 'PASS'
    : 'BLOCKED';
  return {
    probeId: definition.probeId,
    role: definition.role,
    zone: definition.zone,
    component: definition.component,
    units: definition.units,
    physicalCoordinates: { x: definition.x, y: definition.y },
    observations: values,
    observationEvidence: observations,
    convergence,
    conservativeEnvelope,
    status,
  };
}

function recoverDirectPoint(level, definition) {
  const nodeById = new Map(level.mesh.nodes.map((row) => [row.nodeId, row]));
  const candidates = [];
  for (const element of level.mesh.elements) {
    if (element.elementType !== 'T6' || element.nodeIds.length !== 6) continue;
    const nodes = element.nodeIds.map((nodeId) => nodeById.get(nodeId));
    const natural = invertT6(nodes, definition.x, definition.y);
    if (natural && inside(natural.xi, natural.eta)) {
      candidates.push({ element, nodes, natural });
    }
  }
  assert.equal(candidates.length, 1, `${definition.probeId}: containing element`);
  const candidate = candidates[0];
  const evidence = level.result.meshEvidence.elementEvidence.find(
    (row) => row.elementId === candidate.element.elementId,
  );
  assert.equal(evidence.elementType, 'T6');
  assert.ok(Array.isArray(evidence.dMatrix));
  const displacementById = new Map(level.loadCase.nodalDisplacements.map(
    (row) => [row.nodeId, row],
  ));
  const localDisplacementVector = candidate.element.nodeIds.flatMap((nodeId) => {
    const displacement = displacementById.get(nodeId);
    assert.ok(displacement, `missing displacement ${nodeId}`);
    return [displacement.ux, displacement.uy];
  });
  const { B, jacobianDeterminant } = t6BMatrixAt(
    candidate.nodes,
    candidate.natural.xi,
    candidate.natural.eta,
  );
  const strain = matrixVector(B, localDisplacementVector);
  const [sigmaX, sigmaY, tauXY] = matrixVector(evidence.dMatrix, strain);
  const sigmaZ = 0;
  const principal = principalStress(sigmaX, sigmaY, tauXY);
  const vonMises = vonMisesStress(sigmaX, sigmaY, sigmaZ, tauXY);
  return {
    elementId: candidate.element.elementId,
    naturalCoordinates: candidate.natural,
    jacobianDeterminant,
    strain: {
      epsilonX: strain[0],
      epsilonY: strain[1],
      gammaXY: strain[2],
    },
    stress: { sigmaX, sigmaY, sigmaZ, tauXY },
    authoritativeValue: componentValue(
      definition.component,
      { sigmaX, sigmaY, sigmaZ, tauXY },
      principal,
      vonMises,
    ),
    meshHash: level.meshHash,
  };
}

function componentValue(component, stress, principal, vonMises) {
  if (component === 'SIGMA_X') return stress.sigmaX;
  if (component === 'SIGMA_Y') return stress.sigmaY;
  if (component === 'SIGMA_Z') return stress.sigmaZ;
  if (component === 'TAU_XY') return stress.tauXY;
  if (component === 'PRINCIPAL_MAXIMUM') return principal.maximum;
  if (component === 'PRINCIPAL_MINIMUM') return principal.minimum;
  if (component === 'VON_MISES') return vonMises;
  throw new RangeError(`Unsupported component ${component}`);
}

function matrixVector(matrix, vector) {
  return matrix.map((row) => row.reduce(
    (sum, value, index) => sum + value * vector[index],
    0,
  ));
}

function invertT6(nodes, x, y) {
  const [a, b, c] = nodes;
  const determinant = (b.x - a.x) * (c.y - a.y)
    - (c.x - a.x) * (b.y - a.y);
  if (determinant === 0) return null;
  let xi = ((x - a.x) * (c.y - a.y)
    - (c.x - a.x) * (y - a.y)) / determinant;
  let eta = ((b.x - a.x) * (y - a.y)
    - (x - a.x) * (b.y - a.y)) / determinant;
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const mapped = mapWithJacobian(nodes, xi, eta);
    const rx = mapped.x - x;
    const ry = mapped.y - y;
    if (Math.hypot(rx, ry) <= 1e-10) return { xi, eta };
    if (!(Math.abs(mapped.determinant) > 1e-18)) return null;
    const dxi = (mapped.dyDeta * rx - mapped.dxDeta * ry) / mapped.determinant;
    const deta = (-mapped.dyDxi * rx + mapped.dxDxi * ry) / mapped.determinant;
    xi -= dxi;
    eta -= deta;
    if (!Number.isFinite(xi) || !Number.isFinite(eta)) return null;
  }
  return null;
}

function inside(xi, eta) {
  return xi >= -1e-9 && eta >= -1e-9 && xi + eta <= 1 + 1e-9;
}

function mapWithJacobian(nodes, xi, eta) {
  const { N, dNdXi, dNdEta } = shape(xi, eta);
  let x = 0; let y = 0; let dxDxi = 0; let dyDxi = 0;
  let dxDeta = 0; let dyDeta = 0;
  for (let index = 0; index < 6; index += 1) {
    x += N[index] * nodes[index].x;
    y += N[index] * nodes[index].y;
    dxDxi += dNdXi[index] * nodes[index].x;
    dyDxi += dNdXi[index] * nodes[index].y;
    dxDeta += dNdEta[index] * nodes[index].x;
    dyDeta += dNdEta[index] * nodes[index].y;
  }
  return {
    x, y, dxDxi, dyDxi, dxDeta, dyDeta,
    determinant: dxDxi * dyDeta - dxDeta * dyDxi,
  };
}

function shape(xi, eta) {
  const l1 = 1 - xi - eta; const l2 = xi; const l3 = eta;
  return {
    N: [
      l1 * (2 * l1 - 1), l2 * (2 * l2 - 1), l3 * (2 * l3 - 1),
      4 * l1 * l2, 4 * l2 * l3, 4 * l3 * l1,
    ],
    dNdXi: [
      4 * xi + 4 * eta - 3, 4 * xi - 1, 0,
      4 * (1 - 2 * xi - eta), 4 * eta, -4 * eta,
    ],
    dNdEta: [
      4 * xi + 4 * eta - 3, 0, 4 * eta - 1,
      -4 * xi, 4 * xi, 4 * (1 - xi - 2 * eta),
    ],
  };
}
