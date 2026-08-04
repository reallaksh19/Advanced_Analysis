#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_PRODUCTION_RESPONSE_INPUT_SCHEMA,
  evaluateLafeaBucket01ProductionResponse,
  validateLafeaBucket01ProductionResponseEvidence,
} from '../src/workspace/lafea-bucket-01-production-response.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_PATH = path.join(
  ROOT,
  'validation/bucket-01/06-production-response-convergence-spec.json',
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
  process.env.LAFEA_BUCKET_01_PRODUCTION_RESPONSE_REPORT_PATH
    ?? 'reports/qualification/lafea-bucket-01-production-response.json',
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
validateEnvelope(projection, execution, exactHeadSha, spec.meshLadder.length);
const levels = spec.meshLadder.map((definition, index) => extractLevel(
  definition,
  projection.levels[index],
  execution.controllerResult.levelResults[index],
  spec,
));
const locationDefinitionHash = canonicalLafeaSha256({
  schema: 'lafea-bucket-01-production-response-location/v1',
  geometry: spec.geometry,
  load: spec.load,
  restraint: spec.restraint,
  responseAuthority: spec.responseAuthority,
  solverPolicy: spec.solverPolicy,
});
const evidence = evaluateLafeaBucket01ProductionResponse({
  schema: LAFEA_BUCKET_01_PRODUCTION_RESPONSE_INPUT_SCHEMA,
  exactHeadSha,
  specHash: canonicalLafeaSha256(spec),
  locationDefinitionHash,
  expectedAppliedForce: spec.load.resultant,
  expectedAppliedMomentZ: spec.load.expectedMomentAboutCenter,
  levels,
  tolerances: {
    ...spec.tolerances,
    minimumObservedOrder: spec.convergence.strainEnergy.minimumObservedOrder,
    asymptoticRatioBounds: spec.convergence.strainEnergy.asymptoticRatioBounds,
  },
});
assert.equal(validateLafeaBucket01ProductionResponseEvidence(evidence).ok, true);
assert.deepEqual(evidence.energyConvergenceLevelOrdinals, [2, 3, 4]);
assert.deepEqual(evidence.energyConvergenceElementCounts, [256, 1024, 4096]);
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(evidence));
if (evidence.status !== 'PASS') process.exit(1);

function validateSpec(value) {
  assert.equal(value.schema, 'lafea-bucket-01-production-response-spec/v3');
  assert.deepEqual(
    value.meshLadder.map((row) => row.elementCount),
    [64, 256, 1024, 4096],
  );
  assert.deepEqual(
    value.convergence.strainEnergy.governedLevelOrdinals,
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    value.convergence.strainEnergy.evaluatedLevelOrdinals,
    [2, 3, 4],
  );
  assert.equal(
    value.convergence.strainEnergy.method,
    'FINEST_THREE_OF_GOVERNED_FOUR_LEVEL_RICHARDSON_GCI',
  );
}

function validateEnvelope(projectionValue, executionValue, head, levelCount) {
  assert.equal(projectionValue.schema, 'lafea-lug-pinhole-physical-problem-projection/v1');
  assert.equal(projectionValue.status, 'PROJECTION_READY');
  assert.equal(projectionValue.releaseRecord.candidateHeadSha, head);
  assert.equal(executionValue.schema, 'lafea-lug-pinhole-physical-problem-execution/v1');
  assert.equal(executionValue.status, 'ACCEPTED');
  assert.equal(executionValue.accepted, true);
  assert.equal(executionValue.projectionHash, projectionValue.projectionHash);
  assert.equal(executionValue.controllerResult.status, 'ACCEPTED');
  assert.equal(executionValue.controllerResult.accepted, true);
  assert.equal(projectionValue.levels.length, levelCount);
  assert.equal(executionValue.controllerResult.levelResults.length, levelCount);
}

function extractLevel(definition, projected, controlled, specValue) {
  assert.equal(projected.ordinal, definition.ordinal);
  assert.equal(controlled.ordinal, definition.ordinal);
  assert.equal(controlled.levelEvidence.status, 'ACCEPTED');
  assert.equal(
    projected.meshEvidence.mesh.elements.length,
    definition.elementCount,
  );
  assert.equal(
    controlled.meshEvidence.meshHash,
    projected.meshEvidence.meshHash,
  );
  const result = controlled.execution.result;
  assert.equal(result.schema, 'local-continuum-result/v1');
  assert.equal(result.qualification.state, 'ACCEPTED');
  assertStiffnessStorage(result.meshEvidence, definition);
  const row = result.loadCaseResults.find(
    (candidate) => candidate.loadCaseId === specValue.load.loadCaseId,
  );
  assert.ok(row, `missing load case ${specValue.load.loadCaseId}`);
  assert.equal(row.equilibrium.accepted, true);
  assert.equal(row.energyQualification.accepted, true);
  assertSolverEvidence(row.solverEvidence, definition);
  const coordinates = new Map(projected.document.nodes.map(
    (node) => [node.nodeId, { x: node.x, y: node.y }],
  ));
  const applied = vectorFromForceVector(
    result.meshEvidence.dofOrdering,
    row.forceEvidence.forceVector,
  );
  const reactions = vectorFromReactions(row.supportReactions);
  const displacementByNode = new Map(row.nodalDisplacements.map(
    (node) => [node.nodeId, node],
  ));
  return {
    ordinal: definition.ordinal,
    elementCount: definition.elementCount,
    meshSize: definition.meshSize,
    meshHash: controlled.levelEvidence.meshHash,
    recoveryHash: controlled.levelEvidence.recoveryHash,
    resultHash: controlled.levelEvidence.resultHash,
    solverMethod: row.solverEvidence.method,
    freeDofCount: row.solverEvidence.freeDofIdentities.length,
    appliedForce: resultant(applied),
    reactionForce: resultant(reactions),
    appliedMomentZ: momentZ(applied, coordinates, specValue.geometry.center),
    reactionMomentZ: momentZ(reactions, coordinates, specValue.geometry.center),
    totalStrainEnergy: row.totalStrainEnergy,
    halfExternalWork: halfExternalWork(applied, displacementByNode),
    energyQualificationAccepted: row.energyQualification.accepted,
  };
}

function assertStiffnessStorage(meshEvidence, definition) {
  if (definition.stiffnessStorage === 'DENSE') {
    assert.ok(Array.isArray(meshEvidence.globalStiffnessMatrix));
    assert.equal('globalStiffnessCsr' in meshEvidence, false);
    assert.equal('globalStiffnessStorage' in meshEvidence, false);
    return;
  }
  assert.equal(definition.stiffnessStorage, 'CSR_FULL_SYMMETRIC');
  assert.equal(meshEvidence.globalStiffnessMatrix, null);
  assert.equal(meshEvidence.globalStiffnessStorage, 'CSR_FULL_SYMMETRIC');
  assert.equal(
    meshEvidence.globalStiffnessCsr.schema,
    'local-continuum-symmetric-csr/v1',
  );
  assert.equal(meshEvidence.globalStiffnessCsr.storage, 'CSR_FULL_SYMMETRIC');
  assert.equal(
    meshEvidence.globalStiffnessCsr.size,
    meshEvidence.dofOrdering.length,
  );
  assert.ok(meshEvidence.globalStiffnessCsr.nonzeroCount > 0);
  assert.ok(
    meshEvidence.globalStiffnessCsr.nonzeroCount
      < meshEvidence.globalStiffnessCsr.size ** 2,
  );
}

function assertSolverEvidence(solverEvidence, definition) {
  assert.equal(solverEvidence.method, definition.solverMethod);
  assert.equal(solverEvidence.accepted, true);
  assert.ok(Array.isArray(solverEvidence.freeDofIdentities));
  assert.ok(solverEvidence.freeDofIdentities.length > 0);
  if (definition.solverMethod === 'DETERMINISTIC_CHOLESKY') {
    assert.ok(Array.isArray(solverEvidence.pivots));
    assert.ok(solverEvidence.pivots.length > 0);
    assert.equal(solverEvidence.minimumPivot > 0, true);
    return;
  }
  assert.equal(definition.solverMethod, 'DETERMINISTIC_JACOBI_PCG');
  assert.equal(solverEvidence.preconditioner, 'JACOBI');
  assert.ok(Number.isInteger(solverEvidence.iterations));
  assert.ok(solverEvidence.iterations > 0);
  assert.ok(solverEvidence.iterations <= solverEvidence.iterationLimit);
  assert.ok(solverEvidence.minimumDiagonal > solverEvidence.diagonalTolerance);
  assert.ok(
    solverEvidence.finalResidualInfinity <= solverEvidence.residualTolerance,
  );
  assert.deepEqual(solverEvidence.pivots, []);
}

function vectorFromForceVector(dofOrdering, forceVector) {
  assert.equal(dofOrdering.length, forceVector.length);
  const byNode = new Map();
  dofOrdering.forEach((identity, index) => {
    const { nodeId, axis } = parseDof(identity);
    const row = byNode.get(nodeId) ?? { nodeId, fx: 0, fy: 0 };
    row[axis === 'UX' ? 'fx' : 'fy'] += forceVector[index];
    byNode.set(nodeId, row);
  });
  return [...byNode.values()];
}

function vectorFromReactions(supportReactions) {
  const byNode = new Map();
  supportReactions.forEach((reaction) => {
    const { nodeId, axis } = parseDof(reaction.dofIdentity);
    const row = byNode.get(nodeId) ?? { nodeId, fx: 0, fy: 0 };
    row[axis === 'UX' ? 'fx' : 'fy'] += reaction.value;
    byNode.set(nodeId, row);
  });
  return [...byNode.values()];
}

function parseDof(identity) {
  const separator = identity.lastIndexOf(':');
  assert.ok(separator > 0, `invalid DOF identity ${identity}`);
  const nodeId = identity.slice(0, separator);
  const axis = identity.slice(separator + 1);
  assert.ok(axis === 'UX' || axis === 'UY', `invalid DOF axis ${identity}`);
  return { nodeId, axis };
}

function resultant(rows) {
  return rows.reduce(
    (sum, row) => ({ x: sum.x + row.fx, y: sum.y + row.fy }),
    { x: 0, y: 0 },
  );
}

function momentZ(rows, coordinates, center) {
  return rows.reduce((sum, row) => {
    const point = coordinates.get(row.nodeId);
    assert.ok(point, `missing node coordinate ${row.nodeId}`);
    return sum + (point.x - center.x) * row.fy
      - (point.y - center.y) * row.fx;
  }, 0);
}

function halfExternalWork(appliedRows, displacementByNode) {
  return 0.5 * appliedRows.reduce((sum, row) => {
    const displacement = displacementByNode.get(row.nodeId);
    assert.ok(displacement, `missing displacement ${row.nodeId}`);
    return sum + row.fx * displacement.ux + row.fy * displacement.uy;
  }, 0);
}
