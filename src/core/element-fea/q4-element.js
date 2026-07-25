import { deepFreeze } from '../shared-piping-model/immutable.js';
import { constitutiveMatrix, principalStress, recoverSigmaZ, vonMisesStress } from './constitutive.js';
import { EDGE_LOAD_TYPES, FORMULATIONS, Q4_INTEGRATION_RULE, Q4_STRESS_LOCATION } from './constants.js';
import { EDGE_GAUSS_POINTS, Q4_EDGE_DESCRIPTORS } from './integration-points.js';
import { dot, multiplyMatrices, multiplyMatrixVector, transpose, zeros } from './matrix.js';
import { createQ4IntegrationGeometry, createQ4PointGeometry } from './q4-geometry.js';

export function createQ4Operator(element, nodeMap, material, profile) {
  const nodes = element.nodeIds.map((id) => nodeMap.get(id));
  const D = constitutiveMatrix(material, profile.formulation);
  const outOfPlaneScale = elementScale(element, profile);
  const integrationPoints = createQ4IntegrationGeometry(nodes);
  const stiffness = zeros(8);
  integrationPoints.forEach((point) => accumulateStiffness(stiffness, point, D, outOfPlaneScale));
  return deepFreeze({ elementType: 'Q4', integrationRule: Q4_INTEGRATION_RULE, nodes, D, outOfPlaneScale, integrationPoints, stiffness, qualityEvidence: element.qualityEvidence });
}

export function equivalentQ4EdgeLoad(element, load, nodeMap, profile) {
  const nodes = element.nodeIds.map((id) => nodeMap.get(id));
  const descriptor = edgeDescriptor(element.nodeIds, load.edgeNodeIds);
  const vector = Array(8).fill(0); const integratedForce = [0, 0]; const pointEvidence = [];
  const outOfPlaneScale = elementScale(element, profile);
  EDGE_GAUSS_POINTS.forEach((edgePoint) => integrateEdgePoint({ nodes, descriptor, edgePoint, load, outOfPlaneScale, vector, integratedForce, pointEvidence }));
  const orderedNodeIds = descriptor.nodeIndices.map((index) => element.nodeIds[index]);
  return deepFreeze({ vector, integratedForce, orderedNodeIds, edgeId: descriptor.edgeId, integrationRule: 'Q4_EDGE_GAUSS_2_POINT_V1', integrationPoints: pointEvidence });
}

export function recoverQ4Result(operator, displacement, material, formulation) {
  const integrationPointResults = operator.integrationPoints.map((point) => recoverPoint(point, displacement, operator.D, material, formulation, operator.outOfPlaneScale));
  const internalForce = multiplyMatrixVector(operator.stiffness, displacement);
  const strainEnergy = 0.5 * dot(displacement, internalForce);
  const integratedPointEnergy = integrationPointResults.reduce((sum, row) => sum + row.strainEnergyContribution, 0);
  return deepFreeze({ integrationPointResults, internalForce, strainEnergy, integratedPointEnergy });
}

function accumulateStiffness(target, point, D, outOfPlaneScale) {
  const contribution = multiplyMatrices(transpose(point.B), multiplyMatrices(D, point.B));
  const factor = point.determinant * outOfPlaneScale * point.weight;
  for (let row = 0; row < 8; row += 1) for (let column = 0; column < 8; column += 1) target[row][column] += contribution[row][column] * factor;
}

function integrateEdgePoint(context) {
  const { nodes, descriptor, edgePoint, load, outOfPlaneScale, vector, integratedForce, pointEvidence } = context;
  const natural = descriptor.natural(edgePoint.s); const point = createQ4PointGeometry(nodes, { ...natural, integrationPointId: edgePoint.integrationPointId, weight: edgePoint.weight });
  const tangent = edgeTangent(point.jacobian, descriptor.naturalTangent); const edgeJacobian = Math.hypot(tangent[0], tangent[1]);
  if (!(edgeJacobian > 0) || !Number.isFinite(edgeJacobian)) throw new TypeError('Q4 edge Jacobian must be positive and finite.');
  const outwardNormal = [tangent[1] / edgeJacobian, -tangent[0] / edgeJacobian];
  const traction = load.type === EDGE_LOAD_TYPES.TRACTION ? [load.tx, load.ty] : [-load.pressure * outwardNormal[0], -load.pressure * outwardNormal[1]];
  const factor = edgeJacobian * outOfPlaneScale * edgePoint.weight;
  const contribution = Array(8).fill(0);
  point.shapeFunctions.forEach((shape, index) => { contribution[2 * index] = shape * traction[0] * factor; contribution[2 * index + 1] = shape * traction[1] * factor; });
  contribution.forEach((value, index) => { vector[index] += value; }); integratedForce[0] += traction[0] * factor; integratedForce[1] += traction[1] * factor;
  pointEvidence.push({ integrationPointId: edgePoint.integrationPointId, s: edgePoint.s, naturalCoordinates: natural, globalCoordinates: point.globalCoordinates, edgeJacobian, outwardNormal, traction, shapeFunctions: point.shapeFunctions, weight: edgePoint.weight, contribution });
}

function recoverPoint(point, displacement, D, material, formulation, outOfPlaneScale) {
  const strain = multiplyMatrixVector(point.B, displacement); const stress = multiplyMatrixVector(D, strain); const sigmaZ = recoverSigmaZ(stress, material, formulation);
  const principal = principalStress(stress, sigmaZ, formulation); const vonMises = vonMisesStress(stress, sigmaZ);
  const strainEnergyContribution = 0.5 * dot(strain, stress) * point.determinant * outOfPlaneScale * point.weight;
  return { integrationPointId: point.integrationPointId, naturalCoordinates: { xi: point.xi, eta: point.eta }, globalCoordinates: point.globalCoordinates, strain, stress, sigmaZ, principal, vonMises, recoveryLocation: Q4_STRESS_LOCATION, strainEnergyContribution };
}

function edgeDescriptor(nodeIds, edgeNodeIds) {
  const descriptor = Q4_EDGE_DESCRIPTORS.find((row) => { const pair = row.nodeIndices.map((index) => nodeIds[index]); return pair.includes(edgeNodeIds[0]) && pair.includes(edgeNodeIds[1]); });
  if (!descriptor) throw new TypeError('Edge does not belong to Q4 element.');
  return descriptor;
}
function edgeTangent(jacobian, naturalTangent) {
  const [dxi, deta] = naturalTangent;
  return [jacobian[0][0] * dxi + jacobian[1][0] * deta, jacobian[0][1] * dxi + jacobian[1][1] * deta];
}
function elementScale(element, profile) { return profile.formulation === FORMULATIONS.PLANE_STRESS ? element.thickness : profile.outOfPlaneScale; }
