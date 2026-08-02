#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateLocalContinuum,
  createCanonicalLocalContinuumModel,
  FORMULATIONS,
  MODEL_SCHEMA,
  QUALIFICATION_PROFILE,
  QUALIFICATION_STATES,
} from '../src/core/local-continuum/index.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORACLE_PATH = path.join(ROOT, 'validation/bucket-01/05-pure-shear-oracle.json');
const REPORT_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_PURE_SHEAR_REPORT_PATH
    ?? 'reports/qualification/lafea-bucket-01-pure-shear.json',
);
const REPLAYS = 3;
const oracle = Object.freeze(JSON.parse(fs.readFileSync(ORACLE_PATH, 'utf8')));

validateOracle();
const formulationEvidence = [
  FORMULATIONS.PLANE_STRESS,
  FORMULATIONS.PLANE_STRAIN,
].map(evaluateFormulation);

const base = {
  schema: 'lafea-bucket-01-pure-shear-evidence/v2',
  producerRevision: 'B01-PURE-SHEAR.2',
  benchmarkId: oracle.benchmarkId,
  oracleId: oracle.oracleId,
  oracleHash: canonicalLafeaSha256(oracle),
  elementType: 'T3',
  replayCount: REPLAYS,
  formulationEvidence,
  authority: {
    closedFormExpectedValues: true,
    productionOutputGeneratedExpectedValues: false,
    integrationPointOrElementStressOnly: true,
    nodalProjectionUsed: false,
    crossElementAveragingUsed: false,
    movingMaximumUsed: false,
  },
  qualificationStates: {
    implemented: true,
    contractVerified: false,
    meshVerified: false,
    solverVerified: false,
    stressVerified: false,
    codeVerified: false,
    integrationVerified: false,
    bucketQualified: false,
  },
  disposition: 'TECHNICAL_FIX_IMPLEMENTED_PENDING_EXTERNAL_EXECUTION',
};
const report = { ...base, evidenceHash: canonicalLafeaSha256(base) };
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));

function evaluateFormulation(formulation) {
  const loadDrivenRuns = Array.from({ length: REPLAYS }, () => calculateLocalContinuum(
    createCanonicalLocalContinuumModel(loadDrivenSource(formulation)),
  ));
  const prescribedRuns = Array.from({ length: REPLAYS }, () => calculateLocalContinuum(
    createCanonicalLocalContinuumModel(prescribedSource(formulation)),
  ));
  [...loadDrivenRuns, ...prescribedRuns].forEach((result) => {
    assert.equal(result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
    assert.equal('nodalStress' in result, false);
    assert.equal('averagedStress' in result, false);
  });
  loadDrivenRuns.slice(1).forEach((result) => {
    assert.deepEqual(result.semanticHashes, loadDrivenRuns[0].semanticHashes);
  });
  prescribedRuns.slice(1).forEach((result) => {
    assert.deepEqual(result.semanticHashes, prescribedRuns[0].semanticHashes);
  });

  const loadDriven = loadDrivenRuns[0];
  const prescribedResult = prescribedRuns[0];
  const traction = byCase(loadDriven, 'TRACTION');
  const nodal = byCase(loadDriven, 'NODAL_EQUIVALENT');
  const prescribed = byCase(prescribedResult, 'PRESCRIBED_AFFINE');
  const evidence = {
    TRACTION: checkCase(loadDriven, traction, 'LOAD_DRIVEN'),
    NODAL_EQUIVALENT: checkCase(loadDriven, nodal, 'LOAD_DRIVEN'),
    PRESCRIBED_AFFINE: checkCase(prescribedResult, prescribed, 'PRESCRIBED'),
  };
  const parity = {
    tractionToNodal: compareCases(loadDriven, traction, loadDriven, nodal, true),
    tractionToPrescribed: compareCases(
      loadDriven, traction, prescribedResult, prescribed, false,
    ),
  };
  Object.entries(parity).forEach(([id, metrics]) => {
    within(maxMetric(metrics), oracle.tolerances.loadPathParity, `${formulation} ${id}`);
  });
  return {
    formulation,
    loadDrivenReplaySemanticHashes:
      loadDrivenRuns.map((result) => result.semanticHashes),
    prescribedReplaySemanticHashes:
      prescribedRuns.map((result) => result.semanticHashes),
    loadCases: evidence,
    parity,
  };
}

function checkCase(result, row, mode) {
  assert.equal(
    row.solverEvidence.method,
    mode === 'PRESCRIBED'
      ? 'FULLY_CONSTRAINED_NO_FREE_SOLVE'
      : 'DETERMINISTIC_CHOLESKY',
  );
  assert.equal(row.equilibrium.accepted, true);
  assert.equal(row.energyQualification.accepted, true);

  const field = fieldMetrics(row);
  const applied = vectorFromForce(result, row.forceEvidence.forceVector);
  const reaction = vectorFromReactions(row);
  const expectedApplied = mode === 'PRESCRIBED' ? zeroVector() : boundaryVector();
  const expectedReaction = mode === 'PRESCRIBED' ? boundaryVector() : zeroVector();
  const appliedError = vectorError(applied, expectedApplied);
  const reactionError = vectorError(reaction, expectedReaction);
  within(appliedError, oracle.tolerances.normalizedNodalForce, `${row.loadCaseId} applied vector`);
  within(reactionError, oracle.tolerances.normalizedNodalForce, `${row.loadCaseId} reaction vector`);

  const equilibrium = equilibriumMetrics(applied, reaction);
  within(
    Math.hypot(equilibrium.appliedResultant.x, equilibrium.appliedResultant.y)
      / boundaryForceScale(),
    oracle.tolerances.relativeForceEquilibrium,
    `${row.loadCaseId} applied force resultant`,
  );
  within(
    Math.abs(equilibrium.appliedMomentZ) / momentScale(),
    oracle.tolerances.relativeMomentEquilibrium,
    `${row.loadCaseId} applied moment`,
  );
  within(
    equilibrium.relativeForceEquilibriumError,
    oracle.tolerances.relativeForceEquilibrium,
    `${row.loadCaseId} force equilibrium`,
  );
  within(
    equilibrium.relativeMomentEquilibriumError,
    oracle.tolerances.relativeMomentEquilibrium,
    `${row.loadCaseId} moment equilibrium`,
  );

  return {
    solverMethod: row.solverEvidence.method,
    loadCaseInputSemanticHash: row.loadCaseInputSemanticHash,
    ...field,
    normalizedAppliedVectorError: appliedError,
    normalizedReactionVectorError: reactionError,
    ...equilibrium,
  };
}

function fieldMetrics(row) {
  const displacementScale = oracle.expected.maximumUx;
  const strainScale = oracle.kinematics.engineeringShearStrain;
  const stressScale = Math.abs(oracle.expected.tauXY);
  let displacementError = 0;
  let strainError = 0;
  let stressError = 0;

  const displacements = new Map(row.nodalDisplacements.map((item) => [item.nodeId, item]));
  Object.entries(oracle.expected.nodalDisplacements).forEach(([nodeId, expected]) => {
    const actual = displacements.get(nodeId);
    assert.ok(actual, `missing displacement ${nodeId}`);
    displacementError = Math.max(
      displacementError,
      normalized(actual.ux, expected.ux, displacementScale),
      normalized(actual.uy, expected.uy, displacementScale),
    );
  });

  row.elementResults.forEach((element) => {
    assert.equal('gaussPointResults' in element, false);
    strainError = Math.max(
      strainError,
      normalized(element.strain.epsilonX, 0, strainScale),
      normalized(element.strain.epsilonY, 0, strainScale),
      normalized(
        element.strain.gammaXY,
        oracle.kinematics.engineeringShearStrain,
        strainScale,
      ),
    );
    stressError = Math.max(
      stressError,
      normalized(element.stress.sigmaX, 0, stressScale),
      normalized(element.stress.sigmaY, 0, stressScale),
      normalized(element.stress.sigmaZ, 0, stressScale),
      normalized(element.stress.tauXY, oracle.expected.tauXY, stressScale),
      normalized(element.principalMaximum, oracle.expected.principalMaximum, stressScale),
      normalized(element.principalMinimum, oracle.expected.principalMinimum, stressScale),
      normalized(element.vonMises, oracle.expected.vonMises, stressScale),
    );
  });

  const energyError = normalized(
    row.totalStrainEnergy,
    oracle.expected.strainEnergy,
    oracle.expected.strainEnergy,
  );
  within(displacementError, oracle.tolerances.normalizedDisplacement, `${row.loadCaseId} displacement`);
  within(strainError, oracle.tolerances.normalizedStrain, `${row.loadCaseId} strain`);
  within(stressError, oracle.tolerances.normalizedStress, `${row.loadCaseId} stress`);
  within(energyError, oracle.tolerances.relativeEnergy, `${row.loadCaseId} energy`);
  return {
    normalizedDisplacementError: displacementError,
    normalizedStrainError: strainError,
    normalizedStressError: stressError,
    relativeEnergyError: energyError,
    observedStrainEnergy: row.totalStrainEnergy,
  };
}

function compareCases(
  leftResult, left, rightResult, right, compareForce,
) {
  const displacementScale = oracle.expected.maximumUx;
  const stressScale = Math.abs(oracle.expected.tauXY);
  let displacement = 0;
  let stress = 0;
  const rightDisplacements = new Map(right.nodalDisplacements.map((item) => [item.nodeId, item]));
  left.nodalDisplacements.forEach((item) => {
    const peer = rightDisplacements.get(item.nodeId);
    displacement = Math.max(
      displacement,
      normalized(item.ux, peer.ux, displacementScale),
      normalized(item.uy, peer.uy, displacementScale),
    );
  });
  const rightElements = new Map(right.elementResults.map((item) => [item.elementId, item]));
  left.elementResults.forEach((item) => {
    const peer = rightElements.get(item.elementId);
    stress = Math.max(
      stress,
      normalized(item.stress.sigmaX, peer.stress.sigmaX, stressScale),
      normalized(item.stress.sigmaY, peer.stress.sigmaY, stressScale),
      normalized(item.stress.sigmaZ, peer.stress.sigmaZ, stressScale),
      normalized(item.stress.tauXY, peer.stress.tauXY, stressScale),
    );
  });
  const force = compareForce
    ? vectorError(
      vectorFromForce(leftResult, left.forceEvidence.forceVector),
      vectorFromForce(rightResult, right.forceEvidence.forceVector),
    )
    : 0;
  return {
    normalizedDisplacementDifference: displacement,
    normalizedStressDifference: stress,
    relativeEnergyDifference: normalized(
      left.totalStrainEnergy,
      right.totalStrainEnergy,
      oracle.expected.strainEnergy,
    ),
    normalizedForceVectorDifference: force,
  };
}

function commonSource(formulation) {
  const { length, height, thickness } = oracle.geometry;
  return {
    schema: MODEL_SCHEMA,
    modelIdentity: `B01_T3_PURE_SHEAR_${formulation}`,
    modelVersion: '2',
    sourceAncestry: {
      sourceModelIdentity: oracle.benchmarkId,
      sourceVersion: '1',
      adapterIdentity: 'LAFEA3_BUCKET_01_GOVERNED_BENCHMARK',
      adapterVersion: '2',
    },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation,
    materials: [{
      materialId: 'MAT',
      elasticModulus: oracle.material.elasticModulus,
      poissonRatio: oracle.material.poissonRatio,
      sourceReference: 'ORACLE#MATERIAL',
    }],
    nodes: [
      node('A', 0, 0),
      node('B', length, 0),
      node('C', length, height),
      node('D', 0, height),
    ],
    elements: [
      element('E1', ['A', 'B', 'D'], thickness),
      element('E2', ['B', 'C', 'D'], thickness),
    ],
    elementTypePolicy: {
      allowT3Fallback: true,
      sourceReference: 'ORACLE#GOVERNED_T3',
    },
    qualificationProfile: JSON.parse(JSON.stringify(QUALIFICATION_PROFILE)),
    limitations: [],
  };
}

function loadDrivenSource(formulation) {
  const source = commonSource(formulation);
  const tau = oracle.expected.tauXY;
  const boundary = oracle.expected.nodalBoundaryForces;
  return {
    ...source,
    constraints: [
      constraint('C1', 'A', 'UX'),
      constraint('C2', 'A', 'UY'),
      constraint('C3', 'B', 'UY'),
    ],
    loadCases: [
      loadCase('TRACTION', [], [
        traction('T-BOTTOM', 'E1', ['A', 'B'], -tau, 0),
        traction('T-RIGHT', 'E2', ['B', 'C'], 0, tau),
        traction('T-TOP', 'E2', ['C', 'D'], tau, 0),
        traction('T-LEFT', 'E1', ['D', 'A'], 0, -tau),
      ], []),
      loadCase('NODAL_EQUIVALENT', [
        force('F-A', 'A', boundary.A),
        force('F-B', 'B', boundary.B),
        force('F-C', 'C', boundary.C),
        force('F-D', 'D', boundary.D),
      ], [], []),
    ],
    resultRequests: { loadCaseIds: ['TRACTION', 'NODAL_EQUIVALENT'] },
  };
}

function prescribedSource(formulation) {
  const source = commonSource(formulation);
  const gamma = oracle.kinematics.engineeringShearStrain;
  return {
    ...source,
    constraints: [],
    loadCases: [loadCase('PRESCRIBED_AFFINE', [], [], [
      imposed('D-A-UX', 'A', 'UX', 0),
      imposed('D-A-UY', 'A', 'UY', 0),
      imposed('D-B-UX', 'B', 'UX', 0),
      imposed('D-B-UY', 'B', 'UY', 0),
      imposed('D-C-UX', 'C', 'UX', gamma * oracle.geometry.height),
      imposed('D-C-UY', 'C', 'UY', 0),
      imposed('D-D-UX', 'D', 'UX', gamma * oracle.geometry.height),
      imposed('D-D-UY', 'D', 'UY', 0),
    ])],
    resultRequests: { loadCaseIds: ['PRESCRIBED_AFFINE'] },
  };
}

function validateOracle() {
  assert.equal(oracle.schema, 'lafea-bucket-01-pure-shear-oracle/v1');
  assert.equal(oracle.benchmarkId, 'C2D-PATCH-PURE-SHEAR-01');
  assert.equal(oracle.authority.productionOutputUsed, false);
  assert.equal(oracle.authority.smoothedStressUsed, false);
  assert.equal(oracle.authority.movingMaximumUsed, false);
  const g = oracle.material.elasticModulus / (2 * (1 + oracle.material.poissonRatio));
  const tau = g * oracle.kinematics.engineeringShearStrain;
  const energy = 0.5 * tau * oracle.kinematics.engineeringShearStrain
    * oracle.geometry.length * oracle.geometry.height * oracle.geometry.thickness;
  closeOracle(oracle.expected.shearModulus, g, 'G');
  closeOracle(oracle.expected.tauXY, tau, 'tau');
  closeOracle(oracle.expected.principalMaximum, tau, 'principal max');
  closeOracle(oracle.expected.principalMinimum, -tau, 'principal min');
  closeOracle(oracle.expected.vonMises, Math.sqrt(3) * Math.abs(tau), 'von Mises');
  closeOracle(oracle.expected.strainEnergy, energy, 'energy');
  closeOracle(
    oracle.expected.maximumUx,
    oracle.kinematics.engineeringShearStrain * oracle.geometry.height,
    'maximum ux',
  );
  const force = resultant(boundaryVector());
  closeOracle(force.x, 0, 'force x');
  closeOracle(force.y, 0, 'force y');
  closeOracle(momentZ(boundaryVector()), 0, 'moment');
}

function equilibriumMetrics(applied, reaction) {
  const combined = addVectors(applied, reaction);
  const appliedResultant = resultant(applied);
  const reactionResultant = resultant(reaction);
  const combinedResultant = resultant(combined);
  return {
    appliedResultant,
    reactionResultant,
    combinedResultant,
    appliedMomentZ: momentZ(applied),
    reactionMomentZ: momentZ(reaction),
    combinedMomentZ: momentZ(combined),
    relativeForceEquilibriumError:
      Math.hypot(combinedResultant.x, combinedResultant.y) / boundaryForceScale(),
    relativeMomentEquilibriumError: Math.abs(momentZ(combined)) / momentScale(),
  };
}

function vectorFromForce(result, values) {
  const output = zeroVector();
  const index = new Map(result.meshEvidence.dofOrdering.map((id, position) => [id, position]));
  Object.keys(output).forEach((nodeId) => {
    output[nodeId].fx = values[index.get(`${nodeId}:UX`)];
    output[nodeId].fy = values[index.get(`${nodeId}:UY`)];
  });
  return output;
}

function vectorFromReactions(row) {
  const output = zeroVector();
  row.supportReactions.forEach((item) => {
    const [nodeId, dof] = item.dofIdentity.split(':');
    output[nodeId][dof === 'UX' ? 'fx' : 'fy'] = item.value;
  });
  return output;
}

function boundaryVector() {
  return JSON.parse(JSON.stringify(oracle.expected.nodalBoundaryForces));
}

function zeroVector() {
  return Object.fromEntries(
    Object.keys(oracle.expected.nodalBoundaryForces).map((nodeId) => [nodeId, { fx: 0, fy: 0 }]),
  );
}

function addVectors(left, right) {
  const output = zeroVector();
  Object.keys(output).forEach((nodeId) => {
    output[nodeId].fx = left[nodeId].fx + right[nodeId].fx;
    output[nodeId].fy = left[nodeId].fy + right[nodeId].fy;
  });
  return output;
}

function resultant(vector) {
  return Object.values(vector).reduce(
    (sum, item) => ({ x: sum.x + item.fx, y: sum.y + item.fy }),
    { x: 0, y: 0 },
  );
}

function momentZ(vector) {
  const coordinates = {
    A: { x: 0, y: 0 },
    B: { x: oracle.geometry.length, y: 0 },
    C: { x: oracle.geometry.length, y: oracle.geometry.height },
    D: { x: 0, y: oracle.geometry.height },
  };
  return Object.entries(vector).reduce((sum, [nodeId, item]) => (
    sum + coordinates[nodeId].x * item.fy - coordinates[nodeId].y * item.fx
  ), 0);
}

function vectorError(actual, expected) {
  let maximum = 0;
  Object.keys(expected).forEach((nodeId) => {
    maximum = Math.max(
      maximum,
      Math.abs(actual[nodeId].fx - expected[nodeId].fx),
      Math.abs(actual[nodeId].fy - expected[nodeId].fy),
    );
  });
  return maximum / nodalForceScale();
}

function nodalForceScale() {
  return Math.max(
    ...Object.values(oracle.expected.nodalBoundaryForces)
      .flatMap((item) => [Math.abs(item.fx), Math.abs(item.fy)]),
  );
}

function boundaryForceScale() {
  return Math.abs(oracle.expected.tauXY) * oracle.geometry.thickness
    * Math.max(oracle.geometry.length, oracle.geometry.height);
}

function momentScale() {
  return Math.abs(oracle.expected.tauXY) * oracle.geometry.thickness
    * oracle.geometry.length * oracle.geometry.height;
}

function byCase(result, id) {
  const row = result.loadCaseResults.find((item) => item.loadCaseId === id);
  assert.ok(row, `missing load case ${id}`);
  return row;
}

function node(nodeId, x, y) {
  return { nodeId, x, y, sourceReference: `ORACLE#NODE-${nodeId}` };
}

function element(elementId, nodeIds, thickness) {
  return {
    elementId,
    elementType: 'T3',
    nodeIds,
    materialId: 'MAT',
    thickness,
    sourceReference: `ORACLE#ELEMENT-${elementId}`,
  };
}

function constraint(constraintId, nodeId, dof) {
  return {
    constraintId,
    nodeId,
    dof,
    value: 0,
    sourceReference: `ORACLE#CONSTRAINT-${constraintId}`,
  };
}

function force(loadId, nodeId, components) {
  return {
    loadId,
    nodeId,
    fx: components.fx,
    fy: components.fy,
    sourceReference: `ORACLE#FORCE-${loadId}`,
  };
}

function traction(tractionId, elementId, edgeNodeIds, tx, ty) {
  return {
    tractionId,
    elementId,
    edgeNodeIds,
    tx,
    ty,
    sourceReference: `ORACLE#TRACTION-${tractionId}`,
  };
}

function imposed(imposedDisplacementId, nodeId, dof, value) {
  return {
    imposedDisplacementId,
    nodeId,
    dof,
    value,
    sourceReference: `ORACLE#IMPOSED-${imposedDisplacementId}`,
  };
}

function loadCase(loadCaseId, nodalForces, edgeTractions, imposedDisplacements) {
  return {
    loadCaseId,
    nodalForces,
    edgeTractions,
    pressureLoads: [],
    bodyForces: [],
    temperatureLoads: [],
    imposedDisplacements,
    sourceReference: `ORACLE#CASE-${loadCaseId}`,
  };
}

function normalized(actual, expected, scale) {
  assert.ok(Number.isFinite(actual), `non-finite value ${actual}`);
  return Math.abs(actual - expected) / Math.max(Math.abs(scale), 1e-30);
}

function maxMetric(metrics) {
  return Math.max(...Object.values(metrics).map((value) => Math.abs(value)));
}

function closeOracle(actual, expected, label) {
  const scale = Math.max(Math.abs(actual), Math.abs(expected), 1e-30);
  assert.ok(Math.abs(actual - expected) / scale <= 1e-14, `${label}: ${actual} != ${expected}`);
}

function within(value, limit, label) {
  assert.ok(Number.isFinite(value) && value <= limit, `${label}: ${value} > ${limit}`);
}
