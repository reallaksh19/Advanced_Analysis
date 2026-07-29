/**
 * Nodal stress projection — DISPLAY AID ONLY (spec §12.1: "Stress is
 * recovered at Gauss points, retained before extrapolation and projected to
 * nodes only for display", and the repo's standing invariant that raw and
 * averaged/projected stress never share authority).
 *
 * Every value this module produces carries `authority:
 * 'NON_AUTHORITATIVE_DISPLAY_PROJECTION'` and the layer tag
 * `NODAL_PROJECTED_DISPLAY_ONLY`. Nothing downstream that makes an
 * engineering decision — code assessment, SCL sampling, acceptance — may
 * read these values; they exist so a contour plot has smooth nodal data,
 * and `averaging-boundaries.js` governs where averaging is even permitted.
 */
import { ELEMENT_TYPES } from './constants.js';
import { canonicalNumber } from './numeric.js';
import { q8ShapeFunctionsAndDerivatives, Q8_GAUSS_POINTS } from './q8-element.js';
import { t6ShapeFunctionsAndDerivatives, T6_GAUSS_POINTS } from './t6-element.js';

export const RECOVERY_LAYERS = Object.freeze({
  INTEGRATION_POINT: 'INTEGRATION_POINT',
  ELEMENT_CONSTANT: 'ELEMENT_CONSTANT',
  NODAL_PROJECTED_DISPLAY_ONLY: 'NODAL_PROJECTED_DISPLAY_ONLY',
});

export const DISPLAY_AUTHORITY = 'NON_AUTHORITATIVE_DISPLAY_PROJECTION';
export const NODAL_PROJECTION_FORMULA_ID = 'LEAST_SQUARES_GAUSS_TO_NODE_PROJECTION_DISPLAY_ONLY_V1';

const STRESS_COMPONENTS = Object.freeze(['sigmaX', 'sigmaY', 'sigmaZ', 'tauXY']);

/**
 * Projects one element's Gauss-point stresses to its own nodes by least
 * squares against the element's shape functions — the standard
 * extrapolation, solved as the normal equations `(N^T N) c = N^T s`.
 * Per-element only: nothing here crosses an element boundary, so no
 * averaging decision is made at this stage (that is
 * `averaging-boundaries.js`'s job, applied afterward).
 */
export function projectElementGaussStressToNodes(elementResult, elementType) {
  const gaussPoints = elementType === ELEMENT_TYPES.T6 ? T6_GAUSS_POINTS : Q8_GAUSS_POINTS;
  const shapeFn = elementType === ELEMENT_TYPES.T6 ? t6ShapeFunctionsAndDerivatives : q8ShapeFunctionsAndDerivatives;
  const shapeRows = gaussPoints.map((gp) => shapeFn(gp.xi, gp.eta).N);
  const nodeCount = shapeRows[0].length;
  const normal = buildNormalMatrix(shapeRows, nodeCount);
  const nodalValues = STRESS_COMPONENTS.map((component) => {
    const rightHandSide = Array(nodeCount).fill(0);
    shapeRows.forEach((row, g) => {
      const value = elementResult.gaussPointResults[g].stress[component];
      row.forEach((shape, i) => { rightHandSide[i] += shape * value; });
    });
    return solveSymmetric(normal.map((row) => [...row]), rightHandSide);
  });
  return Object.freeze(Array.from({ length: nodeCount }, (_, i) => Object.freeze({
    localNodeIndex: i,
    stress: Object.freeze(Object.fromEntries(
      STRESS_COMPONENTS.map((component, c) => [component, canonicalNumber(nodalValues[c][i], `projected ${component}`)]),
    )),
    recoveryLayer: RECOVERY_LAYERS.NODAL_PROJECTED_DISPLAY_ONLY,
    authority: DISPLAY_AUTHORITY,
    formulaId: NODAL_PROJECTION_FORMULA_ID,
  })));
}

function buildNormalMatrix(shapeRows, nodeCount) {
  const normal = Array.from({ length: nodeCount }, () => Array(nodeCount).fill(0));
  shapeRows.forEach((row) => {
    for (let i = 0; i < nodeCount; i += 1) {
      for (let j = 0; j < nodeCount; j += 1) normal[i][j] += row[i] * row[j];
    }
  });
  // A quadratic element has more nodes than Gauss points, so the normal
  // matrix is rank-deficient; a small Tikhonov term makes the projection
  // well-posed and unique. It biases a display-only value, never an
  // authoritative one - which is exactly why this layer is display-only.
  const scale = Math.max(...normal.map((row, i) => Math.abs(row[i])));
  for (let i = 0; i < nodeCount; i += 1) normal[i][i] += 1e-8 * scale;
  return normal;
}

function solveSymmetric(matrix, rightHandSide) {
  const size = rightHandSide.length;
  const augmented = matrix.map((row, i) => [...row, rightHandSide[i]]);
  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) pivotRow = row;
    }
    [augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]];
    const pivot = augmented[column][column];
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column] / pivot;
      for (let k = column; k <= size; k += 1) augmented[row][k] -= factor * augmented[column][k];
    }
  }
  return augmented.map((row, i) => row[size] / augmented[i][i]);
}
