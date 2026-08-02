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

validateEnvelope(projection, execution, exactHeadSha);
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
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(evidence));
if (evidence.status !== 'PASS') process.exit(1);

function validateEnvelope(projectionValue, executionValue, head) {
  assert.equal(projectionValue.schema, 'lafea-lug-pinhole-physical-problem-projection/v1');
  assert.equal(projectionValue.status, 'PROJECTION_READY');
  assert.equal(projectionValue.releaseRecord.candidateHeadSha, head);
  assert.equal(executionValue.schema, 'lafea-lug-pinhole-physical-problem-execution/v1');
  assert.equal(executionValue.status, 'ACCEPTED');
  assert.equal(executionValue.accepted, true);
  assert.equal(executionValue.projectionHash, projectionValue.projectionHash);
  assert.equal(executionValue.controllerResult.status, 'ACCEPTED');
  assert.equal(executionValue.controllerResult.accepted, true);
  assert.equal(projectionValue.levels.length, 3);
  assert.equal(executionValue.controllerResult.levelResults.length, 3);
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
  const row = result.loadCaseResults.find(
    (candidate) => candidate.loadCaseId === specValue.load.loadCaseId,
  );
  assert.ok(row, `missing load case ${specValue.load.loadCaseId}`);
  assert.equal(row.equilibrium.accepted, true);
  assert.equal(row.energyQualification.accepted, true);
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
