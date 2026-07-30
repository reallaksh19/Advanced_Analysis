import { ShellModelError } from './errors.js';
import { symmetricEigen3 } from './eigen3.js';
import {
  addMatrices,
  identity,
  multiply,
  scaleMatrix,
  transpose,
  zeros,
} from './matrix.js';
import { maxAbs, qualification, tolerance } from './numeric.js';
import { dot } from './vector.js';

/**
 * Generalized to N nodes (spec §8: MITC4's 4-node quad reuses this same
 * per-node tangent-basis machinery, not a duplicate). Every dimension below
 * is `nodes.length`-derived rather than hardcoded 3, so this reduces to
 * byte-identical behavior for a 3-node element (CST/DKT, MITC3) — verified
 * by `lafea.4-shell-transformation-generalization-check.mjs`, which compares
 * this function's N=3 output against a frozen reference captured from the
 * pre-generalization implementation.
 */
export function fiveDofTransformation(nodes, frame, profile) {
  const nodeCount = nodes.length;
  const tangentSampling = buildTangentSampling(nodes);
  const desiredRigid = buildDesiredRigid(frame, nodeCount);
  const pseudo = samplingPseudoInverse(tangentSampling, profile);
  const rigidProjection = multiply(tangentSampling, pseudo.pseudoInverse);
  const direct = buildDirectMapping(nodes, frame);
  const residualProjection = addMatrices(identity(2 * nodeCount), scaleMatrix(rigidProjection, -1));
  const rotationMapping = addMatrices(
    multiply(desiredRigid, pseudo.pseudoInverse),
    multiply(direct, residualProjection),
  );
  const reproductionResidual = maxAbs(addMatrices(multiply(rotationMapping, tangentSampling), scaleMatrix(desiredRigid, -1)));
  const reproductionQualification = qualification(reproductionResidual, 1, profile.rigidRotation);
  if (!reproductionQualification.accepted) throw new ShellModelError('Nodal tangent-basis mapping failed rigid-rotation reproduction');
  return {
    matrix: assembleTransformation(frame, rotationMapping, nodeCount),
    rotationMapping,
    tangentSampling,
    desiredRigid,
    eigenvalues: pseudo.eigenvalues,
    rank: pseudo.rank,
    rankTolerance: pseudo.rankTolerance,
    rigidReproduction: reproductionQualification,
  };
}

function buildTangentSampling(nodes) {
  const matrix = zeros(2 * nodes.length, 3);
  for (let node = 0; node < nodes.length; node += 1) {
    matrix[2 * node] = [...nodes[node].rotationBasis1];
    matrix[2 * node + 1] = [...nodes[node].rotationBasis2];
  }
  return matrix;
}

function buildDesiredRigid(frame, nodeCount) {
  const matrix = zeros(2 * nodeCount, 3);
  for (let node = 0; node < nodeCount; node += 1) {
    matrix[2 * node] = [...frame.ex];
    matrix[2 * node + 1] = [...frame.ey];
  }
  return matrix;
}

function buildDirectMapping(nodes, frame) {
  const matrix = zeros(2 * nodes.length, 2 * nodes.length);
  for (let node = 0; node < nodes.length; node += 1) {
    matrix[2 * node][2 * node] = dot(nodes[node].rotationBasis1, frame.ex);
    matrix[2 * node][2 * node + 1] = dot(nodes[node].rotationBasis2, frame.ex);
    matrix[2 * node + 1][2 * node] = dot(nodes[node].rotationBasis1, frame.ey);
    matrix[2 * node + 1][2 * node + 1] = dot(nodes[node].rotationBasis2, frame.ey);
  }
  return matrix;
}

function samplingPseudoInverse(sampling, profile) {
  const gram = multiply(transpose(sampling), sampling);
  const eigen = symmetricEigen3(gram);
  const scale = Math.max(1, ...eigen.values.map(Math.abs));
  const rankTolerance = tolerance(profile.rotationMappingRank, scale);
  const rank = eigen.values.filter((value) => value > rankTolerance).length;
  if (rank < 2) throw new ShellModelError('Nodal tangent bases do not span the element tangent rotations');
  let inverseGram = zeros(3, 3);
  for (let index = 0; index < 3; index += 1) {
    if (eigen.values[index] <= rankTolerance) continue;
    const vector = eigen.vectors[index];
    const contribution = vector.map((value) => vector.map((other) => value * other / eigen.values[index]));
    inverseGram = addMatrices(inverseGram, contribution);
  }
  return {
    pseudoInverse: multiply(inverseGram, transpose(sampling)),
    eigenvalues: eigen.values,
    rank,
    rankTolerance,
  };
}

function assembleTransformation(frame, rotationMapping, nodeCount) {
  const matrix = zeros(5 * nodeCount, 5 * nodeCount);
  for (let node = 0; node < nodeCount; node += 1) {
    const row = 5 * node;
    const column = 5 * node;
    matrix[row].splice(column, 3, ...frame.ex);
    matrix[row + 1].splice(column, 3, ...frame.ey);
    matrix[row + 2].splice(column, 3, ...frame.ez);
  }
  for (let localNode = 0; localNode < nodeCount; localNode += 1) {
    for (let globalNode = 0; globalNode < nodeCount; globalNode += 1) {
      matrix[5 * localNode + 3][5 * globalNode + 3] = rotationMapping[2 * localNode][2 * globalNode];
      matrix[5 * localNode + 3][5 * globalNode + 4] = rotationMapping[2 * localNode][2 * globalNode + 1];
      matrix[5 * localNode + 4][5 * globalNode + 3] = rotationMapping[2 * localNode + 1][2 * globalNode];
      matrix[5 * localNode + 4][5 * globalNode + 4] = rotationMapping[2 * localNode + 1][2 * globalNode + 1];
    }
  }
  return matrix;
}
