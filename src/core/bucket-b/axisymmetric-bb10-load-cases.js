import assert from 'node:assert/strict';
import {
  evaluateAxisymmetricEdgeVirtualWork,
  integrateAxisymmetricQuadraticEdgeLoad,
} from './axisymmetric-edge-load.js';
import { axisymmetricQ8Element, zeroMatrix } from './axisymmetric-q8-kernel.js';
import {
  analyticalVariableAxialTractionResultant,
  oracleAxisymmetricEdgeLoad,
  oracleAxisymmetricQ8Element,
} from './axisymmetric-independent-oracle.js';
import { rectangleNodes } from './axisymmetric-bb10-patch.js';

export function buildCircumferenceCases() {
  const a = 50; const b = 100; const L = 25;
  const pressure = 10;
  const cylinderNodes = [
    { nodeId: 'C1-B', r: a, z: 0 },
    { nodeId: 'C1-M', r: a, z: L / 2 },
    { nodeId: 'C1-T', r: a, z: L },
  ];
  const cylindricalLoad = integrateAxisymmetricQuadraticEdgeLoad({
    edgeId: 'C1', nodes: cylinderNodes, pressureAt: pressure, outwardNormalAt: () => [-1, 0],
  });
  const reversed = integrateAxisymmetricQuadraticEdgeLoad({
    edgeId: 'C1-REVERSED', nodes: [...cylinderNodes].reverse(), pressureAt: pressure, outwardNormalAt: () => [-1, 0],
  });
  const expectedCylinder = 2 * Math.PI * a * L * pressure;
  const oracleCylinder = oracleAxisymmetricEdgeLoad({ nodes: cylinderNodes, pressureAt: pressure, outwardNormalAt: () => [-1, 0], order: 3 });
  assert.throws(() => integrateAxisymmetricQuadraticEdgeLoad({
    edgeId: 'C1-BAD-NORMAL',
    nodes: cylinderNodes,
    pressureAt: pressure,
    outwardNormalAt: () => [-2, 0],
  }), /NORMAL/);
  assert.ok(relativeError(cylindricalLoad.quadratureGeneralizedResultant.radial, expectedCylinder) <= 1e-13);
  assert.ok(relativeError(cylindricalLoad.nodalReconstructedResultant.radial, expectedCylinder) <= 1e-13);
  assert.ok(relativeError(cylindricalLoad.quadratureGeneralizedResultant.radial, oracleCylinder.generalizedResultant.radial) <= 1e-13);
  assert.deepEqual(forceMap(cylindricalLoad), forceMap(reversed));
  const cylinderVirtualWork = evaluateAxisymmetricEdgeVirtualWork({
    loadEvidence: cylindricalLoad,
    virtualNodalDisplacements: cylinderNodes.map((node) => ({ nodeId: node.nodeId, radial: 1, axial: 0 })),
  });
  assert.equal(cylinderVirtualWork.accepted, true);

  const qz = 4.5;
  const annularNodes = [
    { nodeId: 'C2-A', r: a, z: L },
    { nodeId: 'C2-M', r: (a + b) / 2, z: L },
    { nodeId: 'C2-B', r: b, z: L },
  ];
  const annularLoad = integrateAxisymmetricQuadraticEdgeLoad({ edgeId: 'C2', nodes: annularNodes, tractionAt: () => [0, qz] });
  const expectedAnnular = Math.PI * (b * b - a * a) * qz;
  const oracleAnnular = oracleAxisymmetricEdgeLoad({ nodes: annularNodes, tractionAt: () => [0, qz], order: 8 });
  assert.ok(relativeError(annularLoad.quadratureGeneralizedResultant.axial, expectedAnnular) <= 1e-13);
  assert.ok(relativeError(annularLoad.quadratureGeneralizedResultant.axial, oracleAnnular.generalizedResultant.axial) <= 1e-13);
  const annularVirtualWork = evaluateAxisymmetricEdgeVirtualWork({
    loadEvidence: annularLoad,
    virtualNodalDisplacements: annularNodes.map((node) => ({ nodeId: node.nodeId, radial: 0, axial: 1 })),
  });
  assert.equal(annularVirtualWork.accepted, true);

  const q0 = 3.2; const q1 = 5.7;
  const traction = (_s, r) => [0, q0 + q1 * (r - a) / (b - a)];
  const variableLoad = integrateAxisymmetricQuadraticEdgeLoad({ edgeId: 'C3', nodes: annularNodes, tractionAt: traction });
  const expectedVariable = analyticalVariableAxialTractionResultant({ innerRadius: a, outerRadius: b, q0, q1 });
  const oracleVariable = oracleAxisymmetricEdgeLoad({ nodes: annularNodes, tractionAt: traction, order: 8 });
  assert.ok(relativeError(variableLoad.quadratureGeneralizedResultant.axial, expectedVariable) <= 1e-13);
  assert.ok(relativeError(variableLoad.quadratureGeneralizedResultant.axial, oracleVariable.generalizedResultant.axial) <= 1e-13);
  const representativeRadiusMutation = 2 * Math.PI * ((a + b) / 2)
    * (b - a) * (q0 + q1 / 2);
  const representativeRadiusRelativeError = relativeError(
    representativeRadiusMutation,
    expectedVariable,
  );
  assert.ok(representativeRadiusRelativeError > 0.01);
  const variableVirtualConstant = evaluateAxisymmetricEdgeVirtualWork({
    loadEvidence: variableLoad,
    virtualNodalDisplacements: annularNodes.map((node) => ({ nodeId: node.nodeId, radial: 0, axial: 1 })),
  });
  const variableVirtualLinear = evaluateAxisymmetricEdgeVirtualWork({
    loadEvidence: variableLoad,
    virtualNodalDisplacements: annularNodes.map((node) => ({ nodeId: node.nodeId, radial: 0, axial: node.r / b })),
  });
  assert.equal(variableVirtualConstant.accepted, true);
  assert.equal(variableVirtualLinear.accepted, true);

  return {
    cylindrical: {
      expectedGeneralizedRadialLoad: expectedCylinder,
      production: cylindricalLoad,
      oracle: oracleCylinder,
      reversedNodeOrder: reversed,
      virtualWork: cylinderVirtualWork,
    },
    annular: {
      expectedAxialForce: expectedAnnular,
      production: annularLoad,
      oracle: oracleAnnular,
      virtualWork: annularVirtualWork,
    },
    variable: {
      q0, q1,
      expectedAxialForce: expectedVariable,
      production: variableLoad,
      oracleHighOrder: oracleVariable,
      virtualWorkConstant: variableVirtualConstant,
      virtualWorkLinear: variableVirtualLinear,
      representativeRadiusMutation,
      representativeRadiusRelativeError,
    },
  };
}

export function circumferenceMutationEvidence() {
  const nodes = rectangleNodes();
  const material = { youngsModulus: 210000, poissonRatio: 0.3 };
  const production = axisymmetricQ8Element({ nodes, material });
  const oracle = oracleAxisymmetricQ8Element({ nodes, material });
  const missing = mutatedStiffness(production, 'MISSING');
  const doubled = mutatedStiffness(production, 'DOUBLE');
  const exactLoad = 2 * Math.PI * 50 * 25 * 10;
  const missingLoad = 25 * 10;
  const doubleLoad = exactLoad * 2 * Math.PI * 50;
  return {
    missingLoadRelativeError: relativeError(missingLoad, exactLoad),
    doubleLoadRelativeError: relativeError(doubleLoad, exactLoad),
    missingStiffnessRelativeDifference: compareMatrices(missing, oracle.stiffness).maximumRelativeDifference,
    doubleStiffnessRelativeDifference: compareMatrices(doubled, oracle.stiffness).maximumRelativeDifference,
  };
}

function mutatedStiffness(element, mode) {
  const target = zeroMatrix(16, 16);
  element.gaussPoints.forEach((point) => {
    const circumference = point.circumferenceFactor;
    const factor = point.quadratureWeight * point.determinant
      * (mode === 'MISSING' ? 1 : circumference * circumference);
    for (let row = 0; row < 16; row += 1) {
      for (let column = 0; column < 16; column += 1) {
        let value = 0;
        for (let a = 0; a < 4; a += 1) {
          for (let b = 0; b < 4; b += 1) {
            value += point.B[a][row] * element.D[a][b] * point.B[b][column];
          }
        }
        target[row][column] += value * factor;
      }
    }
  });
  return target;
}

function forceMap(evidence) {
  return Object.fromEntries([...evidence.consistentNodalForces]
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId))
    .map((row) => [row.nodeId, { radial: roundForComparison(row.radial), axial: roundForComparison(row.axial) }]));
}
function roundForComparison(value) { return Number(value.toPrecision(14)); }
function relativeError(observed, reference) { return Math.abs(observed - reference) / Math.max(1e-30, Math.abs(reference)); }
function compareMatrices(left, right) {
  let maximumAbsoluteDifference = 0; let referenceMaximumMagnitude = 0;
  for (let row = 0; row < left.length; row += 1) for (let column = 0; column < left[row].length; column += 1) {
    maximumAbsoluteDifference = Math.max(maximumAbsoluteDifference, Math.abs(left[row][column] - right[row][column]));
    referenceMaximumMagnitude = Math.max(referenceMaximumMagnitude, Math.abs(right[row][column]));
  }
  return { maximumAbsoluteDifference, maximumRelativeDifference: maximumAbsoluteDifference / Math.max(1, referenceMaximumMagnitude) };
}
