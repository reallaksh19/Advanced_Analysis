import { DKT_INTEGRATION } from './constants.js';
import { addMatrices, multiply, scaleMatrix, transpose, zeros } from './matrix.js';
import { cleanNumber } from './numeric.js';
import { dot } from './vector.js';
import { triangleDerivatives } from './cst.js';

export function dktBendingEvidence(coordinates, bendingConstitutive, area) {
  const interpolation = rotationInterpolationMap(coordinates);
  const derivatives = triangleDerivatives(coordinates).derivatives;
  let stiffness = zeros(9, 9);
  const integrationPoints = DKT_INTEGRATION.map((point) => {
    const bb = dktBMatrix(point.barycentric, derivatives, interpolation);
    const contribution = scaleMatrix(multiply(transpose(bb), multiply(bendingConstitutive, bb)), area * point.weight);
    stiffness = addMatrices(stiffness, contribution);
    return {
      integrationPointId: point.integrationPointId,
      barycentric: [...point.barycentric],
      weight: point.weight,
      areaWeight: cleanNumber(area * point.weight),
      bendingBMatrix: bb,
    };
  });
  return { interpolation, integrationPoints, stiffness };
}

export function rotationInterpolationMap(coordinates) {
  const map = zeros(12, 9);
  for (let node = 0; node < 3; node += 1) {
    map[2 * node][3 * node + 1] = 1;
    map[2 * node + 1][3 * node + 2] = 1;
  }
  const edges = [[0, 1], [1, 2], [2, 0]];
  for (let edge = 0; edge < edges.length; edge += 1) {
    for (let dof = 0; dof < 9; dof += 1) {
      const unit = Array(9).fill(0);
      unit[dof] = 1;
      const rotation = edgeMidpointRotation(coordinates, edges[edge], unit);
      map[2 * (edge + 3)][dof] = rotation[0];
      map[2 * (edge + 3) + 1][dof] = rotation[1];
    }
  }
  return map;
}

export function dktBMatrix(barycentric, derivatives, interpolation) {
  const shapeDerivatives = quadraticShapeDerivatives(barycentric, derivatives);
  const thetaXx = derivativeRow(shapeDerivatives, interpolation, 0, 0);
  const thetaXy = derivativeRow(shapeDerivatives, interpolation, 0, 1);
  const thetaYx = derivativeRow(shapeDerivatives, interpolation, 1, 0);
  const thetaYy = derivativeRow(shapeDerivatives, interpolation, 1, 1);
  return [
    thetaYx.map(cleanNumber),
    thetaXy.map((value) => cleanNumber(-value)),
    thetaYy.map((value, index) => cleanNumber(value - thetaXx[index])),
  ];
}

function edgeMidpointRotation(coordinates, edge, dofs) {
  const [first, second] = edge;
  const dx = coordinates[second][0] - coordinates[first][0];
  const dy = coordinates[second][1] - coordinates[first][1];
  const length = Math.hypot(dx, dy);
  const tangent = [dx / length, dy / length];
  const normal = [-tangent[1], tangent[0]];
  const firstRotation = [dofs[3 * first + 1], dofs[3 * first + 2]];
  const secondRotation = [dofs[3 * second + 1], dofs[3 * second + 2]];
  const normalRotation = midpointNormalRotation(dofs, first, second, normal, length, firstRotation, secondRotation);
  const tangentRotation = 0.5 * (dot(firstRotation, tangent) + dot(secondRotation, tangent));
  return [
    cleanNumber(tangentRotation * tangent[0] + normalRotation * normal[0]),
    cleanNumber(tangentRotation * tangent[1] + normalRotation * normal[1]),
  ];
}

function midpointNormalRotation(dofs, first, second, normal, length, firstRotation, secondRotation) {
  const deltaW = dofs[3 * second] - dofs[3 * first];
  const endpointSum = dot(firstRotation, normal) + dot(secondRotation, normal);
  return cleanNumber(-1.5 * deltaW / length - 0.25 * endpointSum);
}

function quadraticShapeDerivatives(barycentric, derivatives) {
  const [l1, l2, l3] = barycentric;
  const [d1, d2, d3] = derivatives;
  return [
    scaledDerivative(d1, 4 * l1 - 1),
    scaledDerivative(d2, 4 * l2 - 1),
    scaledDerivative(d3, 4 * l3 - 1),
    combinedDerivative(d1, d2, l2, l1),
    combinedDerivative(d2, d3, l3, l2),
    combinedDerivative(d3, d1, l1, l3),
  ];
}

function scaledDerivative(derivative, factor) {
  return derivative.map((value) => cleanNumber(factor * value));
}

function combinedDerivative(first, second, firstFactor, secondFactor) {
  return [
    cleanNumber(4 * (firstFactor * first[0] + secondFactor * second[0])),
    cleanNumber(4 * (firstFactor * first[1] + secondFactor * second[1])),
  ];
}

function derivativeRow(shapeDerivatives, interpolation, component, derivative) {
  const result = Array(9).fill(0);
  for (let shape = 0; shape < 6; shape += 1) {
    const factor = shapeDerivatives[shape][derivative];
    const row = interpolation[2 * shape + component];
    for (let dof = 0; dof < 9; dof += 1) result[dof] += factor * row[dof];
  }
  return result;
}
