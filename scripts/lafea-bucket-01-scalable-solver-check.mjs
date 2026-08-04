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
import { DENSE_STIFFNESS_DOF_LIMIT } from '../src/core/local-continuum/sparse-matrix.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_SCALABLE_SOLVER_REPORT_PATH
    ?? 'reports/qualification/lafea-bucket-01-scalable-solver.json',
);
const LENGTH = 100;
const HEIGHT = 50;
const THICKNESS = 10;
const ELASTIC_MODULUS = 200000;
const POISSON_RATIO = 0.3;
const SIGMA_X = 100;
const EPSILON_X = SIGMA_X / ELASTIC_MODULUS;
const EPSILON_Y = -POISSON_RATIO * EPSILON_X;
const EXPECTED_ENERGY = 0.5 * SIGMA_X * EPSILON_X
  * LENGTH * HEIGHT * THICKNESS;
const NORMALIZED_TOLERANCE = 1e-7;

const dense = evaluateGrid('DENSE_REFERENCE', 10, 5, 1);
const sparseRuns = Array.from(
  { length: 2 },
  () => evaluateGrid('SPARSE_PRODUCTION_SCALE', 40, 20, 2),
);
const sparse = sparseRuns[0];
assert.equal(new Set(sparseRuns.map(
  (row) => row.executionEvidenceHash,
)).size, 1, 'Sparse execution evidence changed across deterministic replays.');
assert.equal(new Set(sparseRuns.map(
  (row) => row.qualificationEvidenceHash,
)).size, 1, 'Sparse qualification evidence changed across deterministic replays.');

const crossRoute = {
  tipUxDifference: normalizedError(
    sparse.tipDisplacement.ux,
    dense.tipDisplacement.ux,
    Math.abs(EPSILON_X * LENGTH),
  ),
  tipUyDifference: normalizedError(
    sparse.tipDisplacement.uy,
    dense.tipDisplacement.uy,
    Math.abs(EPSILON_Y * HEIGHT),
  ),
  energyDifference: normalizedError(
    sparse.totalStrainEnergy,
    dense.totalStrainEnergy,
    EXPECTED_ENERGY,
  ),
};
const crossRouteMaximum = Math.max(...Object.values(crossRoute));
assert.ok(
  crossRouteMaximum <= NORMALIZED_TOLERANCE,
  `Dense/sparse route mismatch ${crossRouteMaximum}.`,
);

const reportBase = {
  schema: 'lafea-bucket-01-scalable-solver-evidence/v1',
  producerRevision: 'B01-SCALABLE-SOLVER.1',
  denseDofLimit: DENSE_STIFFNESS_DOF_LIMIT,
  dense,
  sparse,
  sparseReplayExecutionEvidenceHashes: sparseRuns.map(
    (row) => row.executionEvidenceHash,
  ),
  sparseReplayQualificationEvidenceHashes: sparseRuns.map(
    (row) => row.qualificationEvidenceHash,
  ),
  crossRoute,
  crossRouteMaximumNormalizedDifference: crossRouteMaximum,
  tolerance: NORMALIZED_TOLERANCE,
  authority: {
    productionCalculateRouteUsed: true,
    syntheticSidecarSolverUsed: false,
    smallSystemDenseCholeskyPreserved: true,
    largeSystemCsrAssemblyUsed: true,
    largeSystemJacobiPcgUsed: true,
    exactResidualRecomputed: true,
    bucketQualified: false,
  },
  status: 'PASS',
};
const report = {
  ...reportBase,
  evidenceHash: canonicalLafeaSha256(reportBase),
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));

function evaluateGrid(identity, cellsX, cellsY, version) {
  const source = rectangularSource(identity, cellsX, cellsY, version);
  const model = createCanonicalLocalContinuumModel(source);
  const result = calculateLocalContinuum(model);
  assert.equal(
    result.qualification.state,
    QUALIFICATION_STATES.ACCEPTED,
    `${identity} rejected: ${JSON.stringify(result.diagnostics ?? [])}`,
  );
  const loadCase = result.loadCaseResults[0];
  assert.equal(loadCase.equilibrium.accepted, true);
  assert.equal(loadCase.energyQualification.accepted, true);
  const dofCount = result.meshEvidence.dofOrdering.length;
  const sparseExpected = dofCount > DENSE_STIFFNESS_DOF_LIMIT;
  if (sparseExpected) {
    assert.equal(result.meshEvidence.globalStiffnessMatrix, null);
    assert.equal(result.meshEvidence.globalStiffnessStorage, 'CSR_FULL_SYMMETRIC');
    assert.equal(
      result.meshEvidence.globalStiffnessCsr.schema,
      'local-continuum-symmetric-csr/v1',
    );
    assert.equal(result.meshEvidence.globalStiffnessCsr.size, dofCount);
    assert.ok(result.meshEvidence.globalStiffnessCsr.nonzeroCount < dofCount ** 2);
    assert.equal(loadCase.solverEvidence.method, 'DETERMINISTIC_JACOBI_PCG');
    assert.equal(loadCase.solverEvidence.preconditioner, 'JACOBI');
    assert.ok(loadCase.solverEvidence.iterations > 0);
    assert.ok(
      loadCase.solverEvidence.finalResidualInfinity
        <= loadCase.solverEvidence.residualTolerance,
    );
    assert.ok(result.formulaTrace.includes(
      'DETERMINISTIC_SYMMETRIC_CSR_ASSEMBLY_V1',
    ));
    assert.ok(result.formulaTrace.includes(
      'DETERMINISTIC_JACOBI_PRECONDITIONED_CONJUGATE_GRADIENT_V1',
    ));
  } else {
    assert.ok(Array.isArray(result.meshEvidence.globalStiffnessMatrix));
    assert.equal('globalStiffnessCsr' in result.meshEvidence, false);
    assert.equal(loadCase.solverEvidence.method, 'DETERMINISTIC_CHOLESKY');
    assert.ok(loadCase.solverEvidence.pivots.length > 0);
  }

  const maximumStressError = Math.max(
    ...loadCase.elementResults.flatMap((element) => [
      normalizedError(element.stress.sigmaX, SIGMA_X, SIGMA_X),
      normalizedError(element.stress.sigmaY, 0, SIGMA_X),
      normalizedError(element.stress.tauXY, 0, SIGMA_X),
    ]),
  );
  const maximumStrainError = Math.max(
    ...loadCase.elementResults.flatMap((element) => [
      normalizedError(element.strain.epsilonX, EPSILON_X, Math.abs(EPSILON_X)),
      normalizedError(element.strain.epsilonY, EPSILON_Y, Math.abs(EPSILON_Y)),
      normalizedError(element.strain.gammaXY, 0, Math.abs(EPSILON_X)),
    ]),
  );
  const displacementErrors = loadCase.nodalDisplacements.flatMap((node) => {
    const coordinates = parseNodeCoordinates(node.nodeId, cellsX, cellsY);
    return [
      normalizedError(node.ux, EPSILON_X * coordinates.x, Math.abs(EPSILON_X * LENGTH)),
      normalizedError(
        node.uy,
        EPSILON_Y * (coordinates.y + HEIGHT / 2),
        Math.abs(EPSILON_Y * HEIGHT),
      ),
    ];
  });
  const energyError = normalizedError(
    loadCase.totalStrainEnergy,
    EXPECTED_ENERGY,
    EXPECTED_ENERGY,
  );
  const maximumNormalizedError = Math.max(
    maximumStressError,
    maximumStrainError,
    Math.max(...displacementErrors),
    energyError,
  );
  assert.ok(
    maximumNormalizedError <= NORMALIZED_TOLERANCE,
    `${identity} normalized error ${maximumNormalizedError}.`,
  );
  const tipNodeId = nodeId(cellsX, cellsY);
  const tipDisplacement = loadCase.nodalDisplacements.find(
    (node) => node.nodeId === tipNodeId,
  );
  assert.ok(tipDisplacement, `Missing tip node ${tipNodeId}.`);
  return {
    identity,
    cellsX,
    cellsY,
    nodeCount: result.meshEvidence.dofOrdering.length / 2,
    elementCount: loadCase.elementResults.length,
    dofCount,
    stiffnessStorage: sparseExpected ? 'CSR_FULL_SYMMETRIC' : 'DENSE',
    solverMethod: loadCase.solverEvidence.method,
    solverIterations: loadCase.solverEvidence.iterations ?? null,
    finalResidualInfinity:
      loadCase.solverEvidence.finalResidualInfinity ?? null,
    residualTolerance: loadCase.solverEvidence.residualTolerance ?? null,
    totalStrainEnergy: loadCase.totalStrainEnergy,
    expectedStrainEnergy: EXPECTED_ENERGY,
    tipDisplacement: {
      nodeId: tipNodeId,
      ux: tipDisplacement.ux,
      uy: tipDisplacement.uy,
    },
    maximumNormalizedError,
    executionEvidenceHash: result.semanticHashes.executionEvidenceHash,
    qualificationEvidenceHash: result.semanticHashes.qualificationEvidenceHash,
    status: 'PASS',
  };
}

function rectangularSource(identity, cellsX, cellsY, version) {
  const nodes = [];
  for (let j = 0; j <= cellsY; j += 1) {
    for (let i = 0; i <= cellsX; i += 1) {
      nodes.push({
        nodeId: nodeId(i, j),
        x: LENGTH * i / cellsX,
        y: -HEIGHT / 2 + HEIGHT * j / cellsY,
        sourceReference: `SCALABLE#NODE-${i}-${j}`,
      });
    }
  }
  const elements = [];
  const edgeTractions = [];
  for (let j = 0; j < cellsY; j += 1) {
    for (let i = 0; i < cellsX; i += 1) {
      const n00 = nodeId(i, j);
      const n10 = nodeId(i + 1, j);
      const n11 = nodeId(i + 1, j + 1);
      const n01 = nodeId(i, j + 1);
      const firstId = `E-${i}-${j}-A`;
      elements.push(element(firstId, [n00, n10, n11]));
      elements.push(element(`E-${i}-${j}-B`, [n00, n11, n01]));
      if (i === cellsX - 1) {
        edgeTractions.push({
          tractionId: `T-${j}`,
          elementId: firstId,
          edgeNodeIds: [n10, n11],
          tx: SIGMA_X,
          ty: 0,
          sourceReference: `SCALABLE#TRACTION-${j}`,
        });
      }
    }
  }
  const constraints = [];
  for (let j = 0; j <= cellsY; j += 1) {
    constraints.push(constraint(`C-UX-${j}`, nodeId(0, j), 'UX'));
  }
  constraints.push(constraint('C-UY-REFERENCE', nodeId(0, 0), 'UY'));
  return {
    schema: MODEL_SCHEMA,
    modelIdentity: `B01_${identity}`,
    modelVersion: String(version),
    sourceAncestry: {
      sourceModelIdentity: `B01_${identity}_SOURCE`,
      sourceVersion: '1',
      adapterIdentity: 'LAFEA3_BUCKET_01_SCALABLE_SOLVER',
      adapterVersion: '1',
    },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: FORMULATIONS.PLANE_STRESS,
    materials: [{
      materialId: 'MAT',
      elasticModulus: ELASTIC_MODULUS,
      poissonRatio: POISSON_RATIO,
      sourceReference: 'SCALABLE#MATERIAL',
    }],
    nodes,
    elements,
    elementTypePolicy: {
      allowT3Fallback: true,
      sourceReference: 'SCALABLE#T3_MANUFACTURED_FIELD',
    },
    constraints,
    loadCases: [{
      loadCaseId: 'LC1',
      nodalForces: [],
      edgeTractions,
      pressureLoads: [],
      bodyForces: [],
      temperatureLoads: [],
      imposedDisplacements: [],
      sourceReference: 'SCALABLE#LC1',
    }],
    resultRequests: { loadCaseIds: ['LC1'] },
    qualificationProfile: JSON.parse(JSON.stringify(QUALIFICATION_PROFILE)),
    limitations: ['MANUFACTURED_UNIAXIAL_FIELD_SCALABILITY_CHECK'],
  };
}

function element(elementId, nodeIds) {
  return {
    elementId,
    elementType: 'T3',
    nodeIds,
    materialId: 'MAT',
    thickness: THICKNESS,
    sourceReference: `SCALABLE#${elementId}`,
  };
}

function constraint(constraintId, nodeIdValue, dof) {
  return {
    constraintId,
    nodeId: nodeIdValue,
    dof,
    value: 0,
    sourceReference: `SCALABLE#${constraintId}`,
  };
}

function nodeId(i, j) {
  return `N-${i}-${j}`;
}

function parseNodeCoordinates(identity, cellsX, cellsY) {
  const match = /^N-(\d+)-(\d+)$/u.exec(identity);
  assert.ok(match, `Invalid node identity ${identity}.`);
  const i = Number(match[1]);
  const j = Number(match[2]);
  return {
    x: LENGTH * i / cellsX,
    y: -HEIGHT / 2 + HEIGHT * j / cellsY,
  };
}

function normalizedError(actual, expected, scale) {
  assert.ok(Number.isFinite(actual));
  assert.ok(Number.isFinite(expected));
  assert.ok(Number.isFinite(scale) && scale > 0);
  return Math.abs(actual - expected) / scale;
}
