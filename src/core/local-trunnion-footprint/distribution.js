import { FORMULA_IDS } from './constants.js';
import { distributionError } from './errors.js';
import { semanticHash } from './json.js';
import { choleskySolve, maxResidual, qualification } from './numeric.js';
import { add, clean, cross, matrixVector, maxAbs, multiply, scale, subtract, transpose } from './vector.js';

export function transferAndDistribute(mapping, sourceCase, footprint, nodeMap, profile) {
  const sourceForce = scale(sourceCase.canonicalForceGlobal, mapping.mechanicalScaleFactor);
  const sourceMoment = scale(sourceCase.canonicalMomentAtSourceGlobal, mapping.mechanicalScaleFactor);
  const sourcePoint = sourceCase.sourcePointGlobal;
  const leverArm = subtract(sourcePoint, footprint.referencePoint);
  const transferredMoment = add(sourceMoment, cross(leverArm, sourceForce));
  const reconstructedSourceMoment = subtract(transferredMoment, cross(leverArm, sourceForce));
  const transferResidual = subtract(reconstructedSourceMoment, sourceMoment);
  const transferQualification = qualification(maxResidual(transferResidual), Math.max(1, maxAbs(sourceMoment), maxAbs(transferredMoment)), profile.referenceTransfer);
  if (!transferQualification.accepted) throw distributionError('REFERENCE_TRANSFER_FAILED', `loadCaseMappings.${mapping.workflowLoadCaseId}`, 'Reference-point transfer did not reconstruct the source moment.', transferQualification);
  const input = distributionInput(mapping, sourceForce, transferredMoment, footprint, nodeMap);
  const fitted = weightedFit(input, profile);
  return {
    workflowLoadCaseId: mapping.workflowLoadCaseId,
    attachmentLoadCaseId: mapping.attachmentLoadCaseId,
    shellLoadCaseId: mapping.shellLoadCaseId,
    mechanicalScaleFactor: mapping.mechanicalScaleFactor,
    sourceReferencePoint: sourcePoint,
    footprintReferencePoint: footprint.referencePoint,
    leverArm,
    sourceForce,
    sourceMoment,
    transferredForce: sourceForce,
    transferredMoment,
    reconstructedSourceMoment,
    referenceTransferResidual: transferResidual,
    referenceTransferQualification: transferQualification,
    ...fitted,
    formulaIds: [FORMULA_IDS.REFERENCE_TRANSFER, FORMULA_IDS.TRIBUTARY_WEIGHT, FORMULA_IDS.WEIGHTED_FIT, FORMULA_IDS.RECONSTRUCTION],
  };
}

function distributionInput(mapping, force, moment, footprint, nodeMap) {
  const nodes = footprint.tributaryWeights.map((weight) => ({
    ...weight,
    position: [...nodeMap.get(weight.nodeId).position],
    offset: subtract(nodeMap.get(weight.nodeId).position, footprint.referencePoint),
  }));
  const body = { mapping, force, moment, referencePoint: footprint.referencePoint, perimeter: footprint.perimeter, nodes };
  return { ...body, loadDistributionInputHash: semanticHash(body) };
}

function weightedFit(input, profile) {
  const matrix = constraintMatrix(input.nodes);
  const weights = input.nodes.flatMap((node) => [node.normalizedWeight, node.normalizedWeight, node.normalizedWeight]);
  const gram = weightedGram(matrix, weights);
  const lengthScale = Math.max(1, input.perimeter, ...input.nodes.map((node) => Math.hypot(...node.offset)));
  const rowScales = [1, 1, 1, 1 / lengthScale, 1 / lengthScale, 1 / lengthScale];
  const scaledGram = gram.map((row, i) => row.map((value, j) => value * rowScales[i] * rowScales[j]));
  const target = [...input.force, ...input.moment];
  const scaledTarget = target.map((value, index) => value * rowScales[index]);
  const solved = choleskySolve(scaledGram, scaledTarget, profile.resultantFitPivot);
  const lambda = solved.solution.map((value, index) => value * rowScales[index]);
  const forceVector = transpose(matrix).map((column, index) => clean(weights[index] * column.reduce((sum, value, row) => sum + value * lambda[row], 0)));
  const nodalForces = input.nodes.map((node, index) => ({ nodeId: node.nodeId, fx: forceVector[3 * index], fy: forceVector[3 * index + 1], fz: forceVector[3 * index + 2], normalizedWeight: node.normalizedWeight }));
  const reconstructed = matrixVector(matrix, forceVector);
  const forceResidual = subtract(reconstructed.slice(0, 3), input.force);
  const momentResidual = subtract(reconstructed.slice(3), input.moment);
  const forceQualification = qualification(maxResidual(forceResidual), Math.max(1, maxAbs(input.force), maxAbs(reconstructed.slice(0, 3))), profile.forceReconstruction);
  const momentQualification = qualification(maxResidual(momentResidual), Math.max(1, maxAbs(input.moment), maxAbs(reconstructed.slice(3))), profile.momentReconstruction);
  if (!forceQualification.accepted || !momentQualification.accepted) throw distributionError('RESULTANT_RECONSTRUCTION_FAILED', 'loadDistribution', 'Nodal forces did not reconstruct the six-component resultant.', { forceQualification, momentQualification });
  const resultBody = {
    loadDistributionInputHash: input.loadDistributionInputHash,
    tributaryWeights: input.nodes.map(({ nodeId, previousEdgeLength, nextEdgeLength, tributaryLength, normalizedWeight }) => ({ nodeId, previousEdgeLength, nextEdgeLength, tributaryLength, normalizedWeight })),
    rowScaling: { characteristicLength: lengthScale, factors: rowScales },
    fitEvidence: { method: 'DETERMINISTIC_SCALED_CHOLESKY_6X6', gram, scaledGram, lower: solved.lower, pivots: solved.pivots, matrixScale: solved.matrixScale, pivotTolerance: solved.pivotTolerance },
    nodalForces,
    reconstructedForce: reconstructed.slice(0, 3),
    reconstructedMoment: reconstructed.slice(3),
    forceResidual,
    momentResidual,
    forceQualification,
    momentQualification,
  };
  return { ...resultBody, loadDistributionResultHash: semanticHash(resultBody) };
}

function constraintMatrix(nodes) {
  const matrix = Array.from({ length: 6 }, () => Array(3 * nodes.length).fill(0));
  nodes.forEach((node, index) => {
    const base = 3 * index; const [x, y, z] = node.offset;
    matrix[0][base] = 1; matrix[1][base + 1] = 1; matrix[2][base + 2] = 1;
    matrix[3][base + 1] = -z; matrix[3][base + 2] = y;
    matrix[4][base] = z; matrix[4][base + 2] = -x;
    matrix[5][base] = -y; matrix[5][base + 1] = x;
  });
  return matrix;
}
function weightedGram(matrix, weights) {
  const weightedTranspose = transpose(matrix).map((row, index) => row.map((value) => value * weights[index]));
  return multiply(matrix, weightedTranspose);
}