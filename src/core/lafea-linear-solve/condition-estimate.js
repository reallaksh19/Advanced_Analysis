import { sparseMultiply } from './sparse-matrix.js';

/**
 * Condition-number estimate, always reported (spec §11: "Condition estimate:
 * Reported always; warning and block thresholds profile-controlled.").
 *
 * Method: power iteration for the largest-magnitude eigenvalue (matrix-
 * vector products only) and inverse power iteration for the smallest
 * -magnitude eigenvalue (reusing the caller's already-factorized `solve`
 * function, so no second factorization is performed). This is a cheap
 * estimate, not an exact singular-value decomposition — disclosed, not
 * hidden: `iterations` and `converged` are reported alongside the estimate
 * so a caller can see how much to trust it.
 */
export function estimateConditionNumber(matrix, solve, options = {}) {
  const maxIterations = options.maxIterations ?? 50;
  const tolerance = options.tolerance ?? 1e-6;
  const largest = powerIteration(matrix.size, (vector) => sparseMultiply(matrix, vector), maxIterations, tolerance);
  const smallestInverse = powerIteration(matrix.size, solve, maxIterations, tolerance);
  const smallest = smallestInverse.eigenvalue !== 0 ? 1 / smallestInverse.eigenvalue : Infinity;
  return Object.freeze({
    largestEigenvalueEstimate: largest.eigenvalue,
    smallestEigenvalueEstimate: smallest,
    conditionEstimate: smallest !== 0 ? Math.abs(largest.eigenvalue / smallest) : Infinity,
    largestConverged: largest.converged,
    smallestConverged: smallestInverse.converged,
    iterations: Math.max(largest.iterations, smallestInverse.iterations),
  });
}

export function qualifyCondition(conditionEstimate, { warnAt, blockAt } = {}) {
  const status = blockAt !== undefined && conditionEstimate >= blockAt
    ? 'BLOCK'
    : warnAt !== undefined && conditionEstimate >= warnAt ? 'WARNING' : 'OK';
  return Object.freeze({ metric: 'CONDITION_ESTIMATE', value: conditionEstimate, warnAt: warnAt ?? null, blockAt: blockAt ?? null, status });
}

function powerIteration(size, apply, maxIterations, tolerance) {
  let vector = normalize(deterministicSeedVector(size));
  let eigenvalue = 0;
  let converged = false;
  let iterations = 0;
  for (let i = 0; i < maxIterations; i += 1) {
    iterations = i + 1;
    const next = apply(vector);
    const nextNorm = norm(next);
    if (nextNorm === 0) { eigenvalue = 0; converged = true; break; }
    const nextEigenvalue = dot(vector, next);
    const nextVector = next.map((value) => value / nextNorm);
    if (Math.abs(nextEigenvalue - eigenvalue) <= tolerance * Math.max(1, Math.abs(eigenvalue))) {
      eigenvalue = nextEigenvalue; vector = nextVector; converged = true; break;
    }
    eigenvalue = nextEigenvalue;
    vector = nextVector;
  }
  return { eigenvalue, converged, iterations };
}

/** A fixed, deterministic (never random) seed vector for power iteration — no `Math.random()`. */
function deterministicSeedVector(size) {
  return Array.from({ length: size }, (_, index) => 1 + (index % 7) * 0.137);
}

function normalize(vector) { const n = norm(vector); return vector.map((value) => value / n); }
function norm(vector) { return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)); }
function dot(a, b) { return a.reduce((sum, value, index) => sum + value * b[index], 0); }
