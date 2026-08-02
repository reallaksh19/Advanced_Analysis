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
const ORACLE_PATH = path.join(ROOT, 'validation/bucket-01/04-t3-patch-oracle.json');
const REPORT_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_T3_PATCH_REPORT_PATH
    ?? 'reports/qualification/lafea-bucket-01-t3-patch.json',
);
const REPLAY_COUNT = 3;
const oracle = Object.freeze(JSON.parse(fs.readFileSync(ORACLE_PATH, 'utf8')));

validateOracle(oracle);
const formulationEvidence = [
  FORMULATIONS.PLANE_STRESS,
  FORMULATIONS.PLANE_STRAIN,
].map((formulation) => evaluateFormulation(formulation));

const reportBase = {
  schema: 'lafea-bucket-01-t3-patch-evidence/v1',
  producerRevision: 'B01-T3-PATCH.1',
  benchmarkId: oracle.benchmarkId,
  oracleId: oracle.oracleId,
  oracleHash: canonicalLafeaSha256(oracle),
  elementType: 'T3',
  replayCount: REPLAY_COUNT,
  formulationEvidence,
  tolerance: oracle.tolerances.normalizedErrorMax,
  authority: {
    expectedValuesFromClosedFormOracle: true,
    productionOutputUsedToGenerateExpectedValues: false,
    tractionAndNodalLoadingBothExercised: true,
    elementStressAuthority: 'T3_CONSTANT_ELEMENT_STRESS',
    smoothedOrProjectedStressUsed: false,
  },
  qualificationStates: {
    implemented: true,
    governedT3PatchReceiptProduced: true,
    solverVerified: false,
    stressVerified: false,
    bucketQualified: false,
  },
  status: 'PASS',
};
const report = { ...reportBase, evidenceHash: canonicalLafeaSha256(reportBase) };
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));

function evaluateFormulation(formulation) {
  const expected = oracle.expectedByFormulation[formulation];
  assert.ok(expected, `Missing oracle formulation ${formulation}.`);
  const source = sourceFromOracle(formulation);
  const model = createCanonicalLocalContinuumModel(source);
  const results = Array.from(
    { length: REPLAY_COUNT },
    () => calculateLocalContinuum(model),
  );
  results.forEach((result) => {
    assert.equal(result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
  });
  assert.equal(new Set(results.map(
    (result) => result.semanticHashes.executionEvidenceHash,
  )).size, 1, `${formulation} execution evidence changed across replays.`);
  assert.equal(new Set(results.map(
    (result) => result.semanticHashes.qualificationEvidenceHash,
  )).size, 1, `${formulation} qualification evidence changed across replays.`);

  const result = results[0];
  const traction = caseBy(result, 'TRACTION');
  const nodal = caseBy(result, 'NODAL');
  const tractionReceipt = evaluateLoadCase(result, traction, expected);
  const nodalReceipt = evaluateLoadCase(result, nodal, expected);
  const parity = compareCases(traction, nodal, expected);
  const maximumNormalizedError = Math.max(
    tractionReceipt.maximumNormalizedError,
    nodalReceipt.maximumNormalizedError,
    parity.maximumNormalizedDifference,
  );
  within(
    maximumNormalizedError,
    oracle.tolerances.normalizedErrorMax,
    `${formulation} governed patch error`,
  );

  return {
    formulation,
    canonicalModelSemanticHash: result.canonicalModelSemanticHash,
    executionEvidenceHash: result.semanticHashes.executionEvidenceHash,
    qualificationEvidenceHash: result.semanticHashes.qualificationEvidenceHash,
    replayExecutionEvidenceHashes: results.map(
      (row) => row.semanticHashes.executionEvidenceHash,
    ),
    traction: tractionReceipt,
    nodal: nodalReceipt,
    tractionNodalParity: parity,
    maximumNormalizedError,
    status: 'PASS',
  };
}

function evaluateLoadCase(result, loadCase, expected) {
  const nodeMap = new Map(result.meshEvidence.dofOrdering.map((identity, index) => [
    identity,
    loadCase.forceEvidence.forceVector[index],
  ]));
  const applied = resultantFromDofs(nodeMap);
  const reaction = resultantFromReactions(loadCase.supportReactions);
  const displacementErrors = expected.nodalDisplacements.flatMap((expectedNode) => {
    const actualNode = loadCase.nodalDisplacements.find(
      (row) => row.nodeId === expectedNode.nodeId,
    );
    assert.ok(actualNode, `Missing displacement node ${expectedNode.nodeId}.`);
    return [
      normalizedError(actualNode.ux, expectedNode.ux, expected.scales.displacement),
      normalizedError(actualNode.uy, expectedNode.uy, expected.scales.displacement),
    ];
  });
  const stressErrors = loadCase.elementResults.flatMap((element) => [
    normalizedError(element.stress.sigmaX, expected.stress.sigmaX, expected.scales.stress),
    normalizedError(element.stress.sigmaY, expected.stress.sigmaY, expected.scales.stress),
    normalizedError(element.stress.sigmaZ, expected.stress.sigmaZ, expected.scales.stress),
    normalizedError(element.stress.tauXY, expected.stress.tauXY, expected.scales.stress),
  ]);
  const strainErrors = loadCase.elementResults.flatMap((element) => [
    normalizedError(element.strain.epsilonX, expected.strain.epsilonX, expected.scales.strain),
    normalizedError(element.strain.epsilonY, expected.strain.epsilonY, expected.scales.strain),
    normalizedError(element.strain.gammaXY, expected.strain.gammaXY, expected.scales.strain),
  ]);
  const equilibriumErrors = [
    normalizedError(applied.force.x, oracle.expectedResultants.appliedForce.x, expected.scales.force),
    normalizedError(applied.force.y, oracle.expectedResultants.appliedForce.y, expected.scales.force),
    normalizedError(applied.momentZ, oracle.expectedResultants.appliedMomentZ, expected.scales.moment),
    normalizedError(reaction.force.x, oracle.expectedResultants.reactionForce.x, expected.scales.force),
    normalizedError(reaction.force.y, oracle.expectedResultants.reactionForce.y, expected.scales.force),
    normalizedError(reaction.momentZ, oracle.expectedResultants.reactionMomentZ, expected.scales.moment),
    normalizedError(applied.force.x + reaction.force.x, 0, expected.scales.force),
    normalizedError(applied.force.y + reaction.force.y, 0, expected.scales.force),
    normalizedError(applied.momentZ + reaction.momentZ, 0, expected.scales.moment),
  ];
  const energyError = normalizedError(
    loadCase.totalStrainEnergy,
    expected.totalStrainEnergy,
    expected.scales.energy,
  );
  const maximumNormalizedError = Math.max(
    0,
    ...displacementErrors,
    ...stressErrors,
    ...strainErrors,
    ...equilibriumErrors,
    energyError,
  );
  within(
    maximumNormalizedError,
    oracle.tolerances.normalizedErrorMax,
    `${expected.formulation} ${loadCase.loadCaseId}`,
  );
  assert.equal(loadCase.equilibrium.accepted, true);
  assert.equal(loadCase.energyQualification.accepted, true);

  return {
    loadCaseId: loadCase.loadCaseId,
    loadCaseInputSemanticHash: loadCase.loadCaseInputSemanticHash,
    appliedResultant: applied,
    reactionResultant: reaction,
    totalStrainEnergy: loadCase.totalStrainEnergy,
    displacementMaximumNormalizedError: Math.max(0, ...displacementErrors),
    strainMaximumNormalizedError: Math.max(0, ...strainErrors),
    stressMaximumNormalizedError: Math.max(0, ...stressErrors),
    equilibriumMaximumNormalizedError: Math.max(0, ...equilibriumErrors),
    energyNormalizedError: energyError,
    maximumNormalizedError,
  };
}

function compareCases(traction, nodal, expected) {
  const nodalById = new Map(nodal.nodalDisplacements.map((row) => [row.nodeId, row]));
  const displacementDifferences = traction.nodalDisplacements.flatMap((row) => {
    const other = nodalById.get(row.nodeId);
    return [
      normalizedError(row.ux, other.ux, expected.scales.displacement),
      normalizedError(row.uy, other.uy, expected.scales.displacement),
    ];
  });
  const nodalElements = new Map(nodal.elementResults.map((row) => [row.elementId, row]));
  const stressDifferences = traction.elementResults.flatMap((row) => {
    const other = nodalElements.get(row.elementId);
    return [
      normalizedError(row.stress.sigmaX, other.stress.sigmaX, expected.scales.stress),
      normalizedError(row.stress.sigmaY, other.stress.sigmaY, expected.scales.stress),
      normalizedError(row.stress.sigmaZ, other.stress.sigmaZ, expected.scales.stress),
      normalizedError(row.stress.tauXY, other.stress.tauXY, expected.scales.stress),
    ];
  });
  const energyDifference = normalizedError(
    traction.totalStrainEnergy,
    nodal.totalStrainEnergy,
    expected.scales.energy,
  );
  return {
    displacementMaximumNormalizedDifference: Math.max(0, ...displacementDifferences),
    stressMaximumNormalizedDifference: Math.max(0, ...stressDifferences),
    energyNormalizedDifference: energyDifference,
    maximumNormalizedDifference: Math.max(
      0,
      ...displacementDifferences,
      ...stressDifferences,
      energyDifference,
    ),
  };
}

function sourceFromOracle(formulation) {
  const { length, height, thickness } = oracle.geometry;
  const { elasticModulus, poissonRatio } = oracle.material;
  const edgeForce = oracle.loading.uniformSigmaX * height * thickness / 2;
  return {
    schema: MODEL_SCHEMA,
    modelIdentity: `B01_T3_PATCH_${formulation}`,
    modelVersion: '1',
    sourceAncestry: {
      sourceModelIdentity: oracle.oracleId,
      sourceVersion: oracle.schema,
      adapterIdentity: 'LAFEA3_BUCKET_01_T3_PATCH',
      adapterVersion: '1',
    },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation,
    materials: [{
      materialId: 'MAT',
      elasticModulus,
      poissonRatio,
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
      sourceReference: 'ORACLE#GOVERNED_T3_BENCHMARK',
    },
    constraints: [
      constraint('C1', 'A', 'UX'),
      constraint('C2', 'A', 'UY'),
      constraint('C3', 'D', 'UX'),
    ],
    loadCases: [
      loadCase('TRACTION', [], [{
        tractionId: 'T1',
        elementId: 'E2',
        edgeNodeIds: ['B', 'C'],
        tx: oracle.loading.uniformSigmaX,
        ty: 0,
        sourceReference: 'ORACLE#TRACTION',
      }]),
      loadCase('NODAL', [
        force('F1', 'B', edgeForce, 0),
        force('F2', 'C', edgeForce, 0),
      ], []),
    ],
    resultRequests: { loadCaseIds: ['TRACTION', 'NODAL'] },
    qualificationProfile: JSON.parse(JSON.stringify(QUALIFICATION_PROFILE)),
    limitations: [],
  };
}

function resultantFromDofs(dofValues) {
  let fx = 0;
  let fy = 0;
  let momentZ = 0;
  for (const [identity, value] of dofValues) {
    const separator = identity.lastIndexOf(':');
    const nodeId = identity.slice(0, separator);
    const axis = identity.slice(separator + 1);
    const coordinates = oracle.nodeCoordinates[nodeId];
    assert.ok(coordinates, `Unknown force node ${nodeId}.`);
    if (axis === 'UX') {
      fx += value;
      momentZ -= coordinates.y * value;
    } else {
      fy += value;
      momentZ += coordinates.x * value;
    }
  }
  return { force: { x: clean(fx), y: clean(fy) }, momentZ: clean(momentZ) };
}

function resultantFromReactions(reactions) {
  const dofValues = new Map(reactions.map((row) => [row.dofIdentity, row.value]));
  return resultantFromDofs(dofValues);
}

function validateOracle(value) {
  assert.equal(value.schema, 'lafea-bucket-01-t3-patch-oracle/v1');
  assert.equal(value.benchmarkId, 'C2D-PATCH-T3-01');
  assert.equal(value.authority.productionOutputUsed, false);
  assert.equal(value.authority.source, 'CLOSED_FORM_AFFINE_UNIAXIAL_STRESS');
  const { length, height, thickness } = value.geometry;
  const { elasticModulus: e, poissonRatio: nu } = value.material;
  const sigma = value.loading.uniformSigmaX;
  const volume = length * height * thickness;
  const forceX = sigma * height * thickness;
  close(value.expectedResultants.appliedForce.x, forceX, 'applied force x');
  close(value.expectedResultants.appliedForce.y, 0, 'applied force y');
  close(value.expectedResultants.appliedMomentZ, -forceX * height / 2, 'applied moment');
  close(value.expectedResultants.reactionForce.x, -forceX, 'reaction force x');
  close(value.expectedResultants.reactionForce.y, 0, 'reaction force y');
  close(value.expectedResultants.reactionMomentZ, forceX * height / 2, 'reaction moment');

  const planeStress = value.expectedByFormulation.PLANE_STRESS;
  checkExpected(
    planeStress,
    sigma / e,
    -nu * sigma / e,
    0,
    0.5 * sigma * (sigma / e) * volume,
  );
  const planeStrainEpsilonX = (1 - nu ** 2) * sigma / e;
  const planeStrainEpsilonY = -nu * (1 + nu) * sigma / e;
  checkExpected(
    value.expectedByFormulation.PLANE_STRAIN,
    planeStrainEpsilonX,
    planeStrainEpsilonY,
    nu * sigma,
    0.5 * sigma * planeStrainEpsilonX * volume,
  );
}

function checkExpected(expected, epsilonX, epsilonY, sigmaZ, energy) {
  close(expected.strain.epsilonX, epsilonX, `${expected.formulation} epsilon x`);
  close(expected.strain.epsilonY, epsilonY, `${expected.formulation} epsilon y`);
  close(expected.strain.gammaXY, 0, `${expected.formulation} gamma xy`);
  close(expected.stress.sigmaX, oracle.loading.uniformSigmaX, `${expected.formulation} sigma x`);
  close(expected.stress.sigmaY, 0, `${expected.formulation} sigma y`);
  close(expected.stress.sigmaZ, sigmaZ, `${expected.formulation} sigma z`);
  close(expected.stress.tauXY, 0, `${expected.formulation} tau xy`);
  close(expected.totalStrainEnergy, energy, `${expected.formulation} energy`);
  for (const row of expected.nodalDisplacements) {
    const coordinates = oracle.nodeCoordinates[row.nodeId];
    close(row.ux, epsilonX * coordinates.x, `${expected.formulation} ${row.nodeId} ux`);
    close(row.uy, epsilonY * coordinates.y, `${expected.formulation} ${row.nodeId} uy`);
  }
}

function caseBy(result, loadCaseId) {
  const loadCase = result.loadCaseResults.find((row) => row.loadCaseId === loadCaseId);
  assert.ok(loadCase, `Missing load case ${loadCaseId}.`);
  return loadCase;
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
function force(loadId, nodeId, fx, fy) {
  return { loadId, nodeId, fx, fy, sourceReference: `ORACLE#FORCE-${loadId}` };
}
function loadCase(loadCaseId, nodalForces, edgeTractions) {
  return {
    loadCaseId,
    nodalForces,
    edgeTractions,
    pressureLoads: [],
    bodyForces: [],
    temperatureLoads: [],
    imposedDisplacements: [],
    sourceReference: `ORACLE#CASE-${loadCaseId}`,
  };
}
function normalizedError(actual, expected, scale) {
  assert.ok(Number.isFinite(actual), `Non-finite observed value ${actual}.`);
  assert.ok(Number.isFinite(expected), `Non-finite expected value ${expected}.`);
  assert.ok(Number.isFinite(scale) && scale > 0, `Invalid normalization scale ${scale}.`);
  return Math.abs(actual - expected) / scale;
}
function within(value, limit, label) {
  assert.ok(Number.isFinite(value) && value <= limit, `${label}: ${value} > ${limit}`);
}
function close(actual, expected, label) {
  const scale = Math.max(Math.abs(actual), Math.abs(expected), 1e-30);
  assert.ok(Math.abs(actual - expected) / scale <= 1e-14, label);
}
function clean(value) {
  return Object.is(value, -0) || Math.abs(value) < 1e-15 ? 0 : value;
}
