import { DIAGONAL_ENERGY_SCALING_ID } from './solver-contract.js';

/**
 * Section 8 "Scaling": versioned diagonal/energy scaling, factors retained
 * (`DIAGONAL_ENERGY_SCALING_V1`).
 *
 * For free-free stiffness `Kff` and diagonal scale matrix `D = diag(1/sqrt(Kii))`,
 * this substitutes `x = D z` and solves the symmetric system `(D Kff D) z = D f`
 * for `z`, then recovers `x = D z`. The scaling is a genuine numerical
 * preconditioner (it equalizes the diagonal to unity before factorization), not
 * a no-op: two DOFs whose raw stiffnesses differ by orders of magnitude — a
 * stiff spring next to a slender beam rotation, for instance — reach the
 * factorization on comparable footing, and the retained factors are exported
 * as evidence rather than discarded once applied.
 *
 * @param {Array<number>} Kff Flat row-major m*m free-free stiffness.
 * @param {number} m Order.
 * @returns {{scalingId:string, factors:Array<number>}}
 */
export function computeDiagonalEnergyScaling(Kff, m) {
  const factors = new Array(m).fill(1);
  for (let index = 0; index < m; index += 1) {
    const diagonal = Kff[index * m + index];
    factors[index] = diagonal > 0 ? 1 / Math.sqrt(diagonal) : 1;
  }
  return { scalingId: DIAGONAL_ENERGY_SCALING_ID, factors };
}

export function applyDiagonalScalingToMatrix(A, m, factors) {
  const scaled = new Array(m * m).fill(0);
  for (let row = 0; row < m; row += 1) {
    for (let column = 0; column < m; column += 1) {
      scaled[row * m + column] = factors[row] * A[row * m + column] * factors[column];
    }
  }
  return scaled;
}

export function applyDiagonalScalingToVector(vector, factors) {
  return vector.map((value, index) => value * factors[index]);
}
