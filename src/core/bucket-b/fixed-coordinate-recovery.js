import { GAUSS_1D, q8Map } from './q8-kernel.js';

export const RECOVERY_PROFILE_ID = 'Q8_FIXED_COORDINATE_GAUSS_INTERPOLATION_RECOVERY_V1';

export function invertQ8Mapping(nodes, point, { tolerance = 1e-11, maximumIterations = 30 } = {}) {
  let xi = 0; let eta = 0; let residual = Infinity;
  for (let iteration = 0; iteration < maximumIterations; iteration += 1) {
    const mapped = q8Map(nodes, xi, eta);
    const rx = mapped.x - point.x; const ry = mapped.y - point.y;
    residual = Math.hypot(rx, ry);
    if (residual <= tolerance) return freezeResult(xi, eta, residual, iteration, true);
    const det = mapped.determinant;
    if (Math.abs(det) <= 1e-18) break;
    const dXi = (mapped.dyDeta * rx - mapped.dxDeta * ry) / det;
    const dEta = (-mapped.dyDxi * rx + mapped.dxDxi * ry) / det;
    xi -= dXi; eta -= dEta;
  }
  return freezeResult(xi, eta, residual, maximumIterations, false);
}

export function recoverAtPhysicalCoordinate({ elementId, nodes, point, gaussPointResults, mappingTolerance = 1e-9 } = {}) {
  if (!Array.isArray(gaussPointResults) || gaussPointResults.length !== 9) throw new TypeError('Q8 fixed-coordinate recovery requires nine Gauss-point results.');
  const inverse = invertQ8Mapping(nodes, point, { tolerance: mappingTolerance });
  if (!inverse.converged || Math.abs(inverse.xi) > 1 + 1e-9 || Math.abs(inverse.eta) > 1 + 1e-9) {
    throw new RangeError(`Point is not contained by Q8 element ${elementId}.`);
  }
  const weights = tensorLagrangeWeights(inverse.xi, inverse.eta);
  const ordered = orderGaussResults(gaussPointResults);
  const recoveredTensor = interpolateObject(ordered.map((row) => row.stress ?? row.tensor ?? row), weights);
  return Object.freeze({
    recoveryProfileId: RECOVERY_PROFILE_ID,
    containingElementId: elementId,
    naturalCoordinates: Object.freeze({ xi: inverse.xi, eta: inverse.eta }),
    mappingResidual: inverse.mappingResidual,
    distanceFromElementBoundary: Math.min(1 - Math.abs(inverse.xi), 1 - Math.abs(inverse.eta)),
    sourceGaussPointIds: Object.freeze(ordered.map((row) => row.pointId)),
    interpolationWeights: Object.freeze(weights),
    recoveredTensor: Object.freeze(recoveredTensor),
  });
}

export function tensorLagrangeWeights(xi, eta) {
  const lx = lagrange3(xi); const ly = lagrange3(eta);
  return lx.flatMap((wx) => ly.map((wy) => wx * wy));
}
function lagrange3(value) {
  return GAUSS_1D.map((row, i) => GAUSS_1D.reduce((product, other, j) => i === j ? product : product * (value - other.point) / (row.point - other.point), 1));
}
function orderGaussResults(rows) {
  const map = new Map(rows.map((row) => [row.pointId, row]));
  return Array.from({ length: 9 }, (_, i) => map.get(`GP${i + 1}`)).map((row, i) => {
    if (!row) throw new TypeError(`Missing GP${i + 1}.`); return row;
  });
}
function interpolateObject(rows, weights) {
  const keys = Object.keys(rows[0]).filter((key) => key !== 'pointId' && typeof rows[0][key] === 'number');
  return Object.fromEntries(keys.map((key) => [key, rows.reduce((sum, row, i) => sum + weights[i] * row[key], 0)]));
}
function freezeResult(xi, eta, mappingResidual, iterations, converged) {
  return Object.freeze({ xi, eta, mappingResidual, iterations, converged });
}
