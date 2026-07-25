import { cross, dot, subtract } from './vector.js';
import { matrixVector, matrixScale } from './matrix.js';
import { maxAbs, qualification } from './numeric.js';

export function rigidTranslationEvidence(stiffness, profile) {
  let residual = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const vector = Array(15).fill(0);
    for (let node = 0; node < 3; node += 1) vector[5 * node + axis] = 1;
    residual = Math.max(residual, maxAbs(matrixVector(stiffness, vector)));
  }
  return qualification(residual, matrixScale(stiffness), profile.rigidTranslation);
}

export function rigidRotationEvidence(context, profile) {
  let strainResidual = 0;
  let curvatureResidual = 0;
  const origin = context.nodes[0].position;
  for (let axis = 0; axis < 3; axis += 1) {
    const omega = [0, 0, 0];
    omega[axis] = 1;
    const global = rigidRotationVector(context.nodes, origin, omega);
    const local = matrixVector(context.transformation, global);
    const membrane = context.membraneB.map((row) => dot(row, membraneDofs(local)));
    strainResidual = Math.max(strainResidual, maxAbs(membrane));
    for (const point of context.integrationPoints) {
      const curvature = point.bendingBMatrix.map((row) => dot(row, bendingDofs(local)));
      curvatureResidual = Math.max(curvatureResidual, maxAbs(curvature));
    }
  }
  const scaled = Math.max(strainResidual, curvatureResidual * context.geometryScale);
  return {
    strainResidual,
    curvatureResidual,
    scaledQualification: qualification(scaled, 1, profile.rigidRotation),
  };
}

export function membranePatchEvidence(coordinates, membraneB, profile) {
  const fields = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  let residual = 0;
  for (const expected of fields) {
    const dofs = coordinates.flatMap(([x, y]) => [
      expected[0] * x + 0.5 * expected[2] * y,
      expected[1] * y + 0.5 * expected[2] * x,
    ]);
    const actual = membraneB.map((row) => dot(row, dofs));
    residual = Math.max(residual, maxAbs(actual.map((value, index) => value - expected[index])));
  }
  return qualification(residual, 1, profile.membranePatchResponse);
}

export function bendingPatchEvidence(coordinates, points, geometryScale, profile) {
  const target = [1 / geometryScale, -0.5 / geometryScale, 0.25 / geometryScale];
  const dofs = coordinates.flatMap(([x, y]) => bendingField(x, y, target));
  let residual = 0;
  for (const point of points) {
    const actual = point.bendingBMatrix.map((row) => dot(row, dofs));
    residual = Math.max(residual, maxAbs(actual.map((value, index) => (value - target[index]) * geometryScale)));
  }
  return qualification(residual, 1, profile.bendingPatchResponse);
}

function rigidRotationVector(nodes, origin, omega) {
  return nodes.flatMap((node) => {
    const translation = cross(omega, subtract(node.position, origin));
    return [
      ...translation,
      dot(omega, node.rotationBasis1),
      dot(omega, node.rotationBasis2),
    ];
  });
}

function bendingField(x, y, curvature) {
  const [kx, ky, kxy] = curvature;
  const w = -0.5 * kx * x ** 2 - 0.5 * ky * y ** 2 - 0.5 * kxy * x * y;
  const thetaX = -ky * y - 0.5 * kxy * x;
  const thetaY = kx * x + 0.5 * kxy * y;
  return [w, thetaX, thetaY];
}

function membraneDofs(local) {
  return [local[0], local[1], local[5], local[6], local[10], local[11]];
}

function bendingDofs(local) {
  return [local[2], local[3], local[4], local[7], local[8], local[9], local[12], local[13], local[14]];
}
