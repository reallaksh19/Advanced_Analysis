import assert from 'node:assert/strict';
import {
  axisymmetricConstitutiveMatrix,
  axisymmetricQ8BMatrix,
  axisymmetricQ8Element,
  axisymmetricQ8InternalForce,
  axisymmetricQ8StrainEnergy,
  evaluateAxisymmetricQ8State,
  matrixVector,
} from './axisymmetric-q8-kernel.js';
import {
  oracleAxisymmetricQ8Element,
  oracleEvaluateState,
} from './axisymmetric-independent-oracle.js';
import { semanticHash } from '../shared-piping-model/index.js';

export function buildPatchSuite() {
  const material = { youngsModulus: 210000, poissonRatio: 0.3 };
  const single = { patchId: 'A1', ...singleRectanglePatch() };
  const regular = { patchId: 'A2', ...multiElementPatch(false) };
  const distorted = { patchId: 'A3', ...multiElementPatch(true) };
  const rectangularComparison = comparePatchToOracle(single, material);
  const regularComparison = comparePatchToOracle(regular, material);
  const distortedComparison = comparePatchToOracle(distorted, material);
  const fieldDefinitions = [
    { fieldId: 'FIELD-RH', a: 2e-4, b: 0, c: 0, d: 0 },
    { fieldId: 'FIELD-Z', a: 0, b: -1.5e-4, c: 0, d: 0 },
    { fieldId: 'FIELD-S', a: 0, b: 0, c: 3e-4, d: 0 },
    { fieldId: 'FIELD-C', a: 2e-4, b: -1.5e-4, c: 3e-4, d: 2.75 },
  ];
  const fields = fieldDefinitions.map((definition) => evaluateManufacturedField(
    [single, regular, distorted], material, definition,
  ));
  return {
    rectangular: mergeComparison(rectangularComparison, regularComparison),
    distorted: { ...distortedComparison, genuinelyDistorted: true },
    fields,
  };
}

function evaluateManufacturedField(patches, material, definition) {
  let maximumStrainAbsoluteError = 0;
  let maximumStressRelativeError = 0;
  let maximumInternalForceRelativeDifference = 0;
  let maximumEnergyRelativeDifference = 0;
  const expectedStrain = [definition.a, definition.b, definition.a, definition.c];
  const expectedStress = matrixVector(axisymmetricConstitutiveMatrix(material), expectedStrain);
  const patchRows = [];
  for (const patch of patches) {
    const nodeById = new Map(patch.nodes.map((node) => [node.nodeId, node]));
    const elementRows = [];
    for (const element of patch.elements) {
      const nodes = element.nodeIds.map((nodeId) => nodeById.get(nodeId));
      const displacement = nodes.flatMap((node) => [
        definition.a * node.r,
        definition.b * node.z + definition.c * node.r + definition.d,
      ]);
      const productionStates = evaluateAxisymmetricQ8State({ nodes, material, displacementVector: displacement });
      const oracleStates = oracleEvaluateState({ nodes, material, displacementVector: displacement });
      productionStates.forEach((state, index) => {
        state.strainVector.forEach((value, component) => {
          maximumStrainAbsoluteError = Math.max(maximumStrainAbsoluteError, Math.abs(value - expectedStrain[component]));
          maximumStrainAbsoluteError = Math.max(maximumStrainAbsoluteError, Math.abs(value - oracleStates[index].strainVector[component]));
        });
        const stressScale = Math.max(1, ...expectedStress.map(Math.abs));
        maximumStressRelativeError = Math.max(
          maximumStressRelativeError,
          Math.max(...state.stressVector.map(
            (value, component) => Math.abs(value - expectedStress[component]),
          )) / stressScale,
          Math.max(...state.stressVector.map(
            (value, component) => Math.abs(
              value - oracleStates[index].stressVector[component],
            ),
          )) / stressScale,
        );
      });
      const productionForce = axisymmetricQ8InternalForce({ nodes, material, displacementVector: displacement });
      const oracleElement = oracleAxisymmetricQ8Element({ nodes, material });
      const oracleForce = matrixVector(oracleElement.stiffness, displacement);
      maximumInternalForceRelativeDifference = Math.max(
        maximumInternalForceRelativeDifference,
        vectorRelativeDifference(productionForce, oracleForce),
      );
      const productionEnergy = axisymmetricQ8StrainEnergy({ nodes, material, displacementVector: displacement });
      const oracleEnergy = oracleStates.reduce((total, state) => total + 0.5
        * dot(state.strainVector, state.stressVector)
        * state.circumferenceFactor
        * state.determinant
        * state.quadratureWeight, 0);
      maximumEnergyRelativeDifference = Math.max(maximumEnergyRelativeDifference, relativeError(productionEnergy, oracleEnergy));
      elementRows.push({
        elementId: element.elementId,
        gaussStateHash: semanticHash(productionStates),
        internalForceHash: semanticHash(productionForce),
        productionEnergy,
        oracleEnergy,
      });
    }
    patchRows.push({ patchId: patch.patchId, elements: elementRows });
  }
  return {
    fieldId: definition.fieldId,
    coefficients: { a: definition.a, b: definition.b, c: definition.c, d: definition.d },
    expectedStrain,
    expectedStress,
    maximumStrainAbsoluteError,
    maximumStressRelativeError,
    maximumInternalForceRelativeDifference,
    maximumEnergyRelativeDifference,
    patchRows,
  };
}

function comparePatchToOracle(patch, material) {
  const nodeById = new Map(patch.nodes.map((node) => [node.nodeId, node]));
  let maximumStiffnessAbsoluteDifference = 0;
  let maximumStiffnessRelativeDifference = 0;
  let maximumBAbsoluteDifference = 0;
  let maximumRadiusAbsoluteDifference = 0;
  let minimumDeterminant = Number.POSITIVE_INFINITY;
  const elements = [];
  patch.elements.forEach((element) => {
    const nodes = element.nodeIds.map((nodeId) => nodeById.get(nodeId));
    const production = axisymmetricQ8Element({ nodes, material });
    const oracle = oracleAxisymmetricQ8Element({ nodes, material });
    const stiffness = compareMatrices(production.stiffness, oracle.stiffness);
    maximumStiffnessAbsoluteDifference = Math.max(maximumStiffnessAbsoluteDifference, stiffness.maximumAbsoluteDifference);
    maximumStiffnessRelativeDifference = Math.max(maximumStiffnessRelativeDifference, stiffness.maximumRelativeDifference);
    production.gaussPoints.forEach((point, index) => {
      maximumBAbsoluteDifference = Math.max(maximumBAbsoluteDifference, compareMatrices(point.B, oracle.gaussPoints[index].B).maximumAbsoluteDifference);
      maximumRadiusAbsoluteDifference = Math.max(maximumRadiusAbsoluteDifference, Math.abs(point.radius - oracle.gaussPoints[index].radius));
      minimumDeterminant = Math.min(minimumDeterminant, point.determinant);
    });
    elements.push({
      elementId: element.elementId,
      stiffnessHash: semanticHash(production.stiffness),
      oracleStiffnessHash: semanticHash(oracle.stiffness),
      stiffness,
      minimumDeterminant: Math.min(...production.gaussPoints.map((row) => row.determinant)),
    });
  });
  return {
    patchId: patch.patchId,
    elementCount: patch.elements.length,
    maximumStiffnessAbsoluteDifference,
    maximumStiffnessRelativeDifference,
    maximumBAbsoluteDifference,
    maximumRadiusAbsoluteDifference,
    minimumDeterminant,
    elements,
  };
}

export function formulationMutationEvidence() {
  const nodes = rectangleNodes();
  const material = { youngsModulus: 210000, poissonRatio: 0.3 };
  const center = axisymmetricQ8BMatrix(nodes, 0, 0);
  const D = axisymmetricConstitutiveMatrix(material);

  const radialCoefficient = 2e-4;
  const radialField = nodes.flatMap((node) => [radialCoefficient * node.r, 0]);
  const correctRadialStrain = matrixVector(center.B, radialField);
  const missingHoopB = center.B.map((row) => [...row]);
  missingHoopB[2].fill(0);
  const missingHoopStrain = matrixVector(missingHoopB, radialField);

  const combinedField = nodes.flatMap((node) => [
    2e-4 * node.r,
    -1.5e-4 * node.z + 3e-4 * node.r,
  ]);
  const combinedStrain = matrixVector(center.B, combinedField);
  const correctCombinedStress = matrixVector(D, combinedStrain);
  const E = material.youngsModulus;
  const nu = material.poissonRatio;
  const planarFactor = E / ((1 + nu) * (1 - 2 * nu));
  const planarD = [
    [planarFactor * (1 - nu), planarFactor * nu, 0],
    [planarFactor * nu, planarFactor * (1 - nu), 0],
    [0, 0, planarFactor * (1 - 2 * nu) / 2],
  ];
  const planarStress3 = matrixVector(
    planarD,
    [combinedStrain[0], combinedStrain[1], combinedStrain[3]],
  );
  const planarStressMutation = [
    planarStress3[0],
    planarStress3[1],
    0,
    planarStress3[2],
  ];

  const shearCoefficient = 3e-4;
  const shearField = nodes.flatMap((node) => [0, shearCoefficient * node.r]);
  const shearStrain = matrixVector(center.B, shearField);
  const correctShearStress = matrixVector(D, shearStrain);
  const incorrectShearD = D.map((row) => [...row]);
  incorrectShearD[3][3] *= 2;
  const incorrectShearStress = matrixVector(incorrectShearD, shearStrain);

  const incorrectlyOrderedStress = [
    correctCombinedStress[0],
    correctCombinedStress[2],
    correctCombinedStress[1],
    correctCombinedStress[3],
  ];
  return {
    missingHoopRow: {
      correctHoopStrain: correctRadialStrain[2],
      mutatedHoopStrain: missingHoopStrain[2],
      relativeStrainError: relativeError(
        missingHoopStrain[2],
        correctRadialStrain[2],
      ),
    },
    planarConstitutive: {
      correctStress: correctCombinedStress,
      mutatedStress: planarStressMutation,
      relativeStressError: vectorRelativeDifference(
        planarStressMutation,
        correctCombinedStress,
      ),
    },
    incorrectEngineeringShear: {
      correctTauRZ: correctShearStress[3],
      mutatedTauRZ: incorrectShearStress[3],
      relativeStressError: relativeError(
        incorrectShearStress[3],
        correctShearStress[3],
      ),
    },
    incorrectStressOrdering: {
      correctStress: correctCombinedStress,
      mutatedStress: incorrectlyOrderedStress,
      relativeStressError: vectorRelativeDifference(
        incorrectlyOrderedStress,
        correctCombinedStress,
      ),
    },
  };
}

function singleRectanglePatch() {
  return { nodes: rectangleNodes(), elements: [{ elementId: 'A1-E1', nodeIds: rectangleNodes().map((row) => row.nodeId) }] };
}
export function rectangleNodes() {
  return [
    { nodeId: 'R1', r: 40, z: 0 }, { nodeId: 'R2', r: 80, z: 0 },
    { nodeId: 'R3', r: 80, z: 60 }, { nodeId: 'R4', r: 40, z: 60 },
    { nodeId: 'R5', r: 60, z: 0 }, { nodeId: 'R6', r: 80, z: 30 },
    { nodeId: 'R7', r: 60, z: 60 }, { nodeId: 'R8', r: 40, z: 30 },
  ];
}
function multiElementPatch(distorted) {
  const nodes = [];
  for (let j = 0; j <= 4; j += 1) {
    for (let i = 0; i <= 4; i += 1) {
      if (i % 2 === 1 && j % 2 === 1) continue;
      const baseR = 40 + 10 * i;
      const baseZ = 15 * j;
      const warp = Math.sin(Math.PI * i / 4) * Math.sin(Math.PI * j / 4);
      nodes.push({
        nodeId: patchNodeId(i, j),
        r: distorted ? baseR + 2.2 * warp + 0.4 * j : baseR,
        z: distorted ? baseZ + 1.8 * warp - 0.3 * i : baseZ,
      });
    }
  }
  const elements = [];
  for (let j = 0; j < 2; j += 1) {
    for (let i = 0; i < 2; i += 1) {
      elements.push({
        elementId: `${distorted ? 'A3' : 'A2'}-E${i + 1}-${j + 1}`,
        nodeIds: [
          patchNodeId(2 * i, 2 * j), patchNodeId(2 * i + 2, 2 * j),
          patchNodeId(2 * i + 2, 2 * j + 2), patchNodeId(2 * i, 2 * j + 2),
          patchNodeId(2 * i + 1, 2 * j), patchNodeId(2 * i + 2, 2 * j + 1),
          patchNodeId(2 * i + 1, 2 * j + 2), patchNodeId(2 * i, 2 * j + 1),
        ],
      });
    }
  }
  return { nodes, elements };
}

function compareMatrices(left, right) {
  assert.equal(left.length, right.length);
  let maximumAbsoluteDifference = 0;
  let referenceMaximumMagnitude = 0;
  for (let row = 0; row < left.length; row += 1) {
    assert.equal(left[row].length, right[row].length);
    for (let column = 0; column < left[row].length; column += 1) {
      maximumAbsoluteDifference = Math.max(maximumAbsoluteDifference, Math.abs(left[row][column] - right[row][column]));
      referenceMaximumMagnitude = Math.max(referenceMaximumMagnitude, Math.abs(right[row][column]));
    }
  }
  return { maximumAbsoluteDifference, maximumRelativeDifference: maximumAbsoluteDifference / Math.max(1, referenceMaximumMagnitude) };
}
function vectorRelativeDifference(left, right) {
  const maximumAbsoluteDifference = Math.max(...left.map((value, index) => Math.abs(value - right[index])));
  return maximumAbsoluteDifference / Math.max(1, ...right.map(Math.abs));
}
function mergeComparison(left, right) {
  return {
    patchId: 'A1+A2', elementCount: left.elementCount + right.elementCount,
    maximumStiffnessAbsoluteDifference: Math.max(left.maximumStiffnessAbsoluteDifference, right.maximumStiffnessAbsoluteDifference),
    maximumStiffnessRelativeDifference: Math.max(left.maximumStiffnessRelativeDifference, right.maximumStiffnessRelativeDifference),
    maximumBAbsoluteDifference: Math.max(left.maximumBAbsoluteDifference, right.maximumBAbsoluteDifference),
    maximumRadiusAbsoluteDifference: Math.max(left.maximumRadiusAbsoluteDifference, right.maximumRadiusAbsoluteDifference),
    minimumDeterminant: Math.min(left.minimumDeterminant, right.minimumDeterminant),
    elements: [...left.elements, ...right.elements],
  };
}
function relativeError(observed, reference) { return Math.abs(observed - reference) / Math.max(1e-30, Math.abs(reference)); }
function dot(left, right) { return left.reduce((sum, value, index) => sum + value * right[index], 0); }
function patchNodeId(i, j) { return `P-${i}-${j}`; }
