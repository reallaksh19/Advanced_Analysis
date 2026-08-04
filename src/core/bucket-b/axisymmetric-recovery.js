import { deepFreeze } from '../shared-piping-model/index.js';
import { GAUSS_1D, q8Shape } from './q8-kernel.js';
import { axisymmetricQ8Map } from './axisymmetric-q8-kernel.js';

export const AXISYMMETRIC_RECOVERY_PROFILE_ID =
  'AXI_Q8_GAUSS_POINT_STRESS_RECOVERY_V1';
const COMPONENTS = Object.freeze(['sigmaR', 'sigmaZ', 'sigmaTheta', 'tauRZ']);

export function invertAxisymmetricQ8Mapping(
  nodes,
  point,
  { tolerance = 1e-11, maximumIterations = 40, radiusTolerance = 1e-9 } = {},
) {
  const target = requirePoint(point);
  let xi = 0;
  let eta = 0;
  let residual = Number.POSITIVE_INFINITY;
  for (let iteration = 0; iteration < maximumIterations; iteration += 1) {
    const mapped = axisymmetricQ8Map(nodes, xi, eta, { radiusTolerance });
    const radialResidual = mapped.r - target.r;
    const axialResidual = mapped.z - target.z;
    residual = Math.hypot(radialResidual, axialResidual);
    if (residual <= tolerance) {
      return deepFreeze({ xi, eta, mappingResidual: residual, iterations: iteration, converged: true });
    }
    const dXi = (
      mapped.dzDeta * radialResidual - mapped.drDeta * axialResidual
    ) / mapped.determinant;
    const dEta = (
      -mapped.dzDxi * radialResidual + mapped.drDxi * axialResidual
    ) / mapped.determinant;
    xi -= dXi;
    eta -= dEta;
    if (!Number.isFinite(xi) || !Number.isFinite(eta)) break;
  }
  return deepFreeze({ xi, eta, mappingResidual: residual, iterations: maximumIterations, converged: false });
}

export function recoverAxisymmetricAtPhysicalCoordinate({
  elementId,
  nodes,
  point,
  gaussPointResults,
  nodalDisplacements,
  mappingTolerance = 1e-9,
  radiusTolerance = 1e-9,
} = {}) {
  const inverse = invertAxisymmetricQ8Mapping(nodes, point, {
    tolerance: mappingTolerance,
    radiusTolerance,
  });
  if (!inverse.converged || Math.abs(inverse.xi) > 1 + 1e-9 || Math.abs(inverse.eta) > 1 + 1e-9) {
    throw new RangeError(`AXI_Q8_POINT_NOT_CONTAINED:${elementId}`);
  }
  const ordered = orderGaussResults(gaussPointResults);
  const weights = tensorLagrangeWeights(inverse.xi, inverse.eta);
  const recoveredTensor = Object.fromEntries(COMPONENTS.map((component) => [
    component,
    ordered.reduce((sum, row, index) => sum + weights[index] * requireComponent(row, component), 0),
  ]));
  const displacement = interpolateDisplacement(nodes, nodalDisplacements, inverse.xi, inverse.eta);
  return deepFreeze({
    recoveryProfileId: AXISYMMETRIC_RECOVERY_PROFILE_ID,
    containingElementId: requiredText(elementId, 'elementId'),
    physicalCoordinate: requirePoint(point),
    naturalCoordinates: { xi: inverse.xi, eta: inverse.eta },
    mappingResidual: inverse.mappingResidual,
    minimumNaturalCoordinateMargin: Math.min(1 - Math.abs(inverse.xi), 1 - Math.abs(inverse.eta)),
    sourceGaussPointIds: ordered.map((row) => row.pointId),
    sourceGaussPoints: ordered.map((row) => ({
      pointId: row.pointId,
      mappedCoordinates: row.mappedCoordinates ?? null,
      tensor: tensorOf(row),
    })),
    interpolationWeights: weights,
    displacement,
    recoveredTensor,
  });
}

export function tensorLagrangeWeights(xi, eta) {
  const radial = lagrange3(xi);
  const axial = lagrange3(eta);
  return radial.flatMap((radialWeight) => axial.map((axialWeight) => radialWeight * axialWeight));
}

function interpolateDisplacement(nodes, nodalDisplacements, xi, eta) {
  if (!Array.isArray(nodes) || nodes.length !== 8) throw new TypeError('AXI_RECOVERY_REQUIRES_EIGHT_NODES');
  if (!Array.isArray(nodalDisplacements) || nodalDisplacements.length !== 8) {
    throw new TypeError('AXI_RECOVERY_REQUIRES_EIGHT_NODAL_DISPLACEMENTS');
  }
  const displacementByNode = new Map(nodalDisplacements.map((row) => [row.nodeId, row]));
  const { N } = q8Shape(xi, eta);
  let radial = 0;
  let axial = 0;
  nodes.forEach((node, index) => {
    const value = displacementByNode.get(node.nodeId);
    if (!value || !Number.isFinite(value.radial) || !Number.isFinite(value.axial)) {
      throw new TypeError(`AXI_RECOVERY_INVALID_NODAL_DISPLACEMENT:${node.nodeId}`);
    }
    radial += N[index] * value.radial;
    axial += N[index] * value.axial;
  });
  return { radial, axial };
}
function lagrange3(value) {
  if (!Number.isFinite(value)) throw new TypeError('AXI_RECOVERY_INVALID_NATURAL_COORDINATE');
  return GAUSS_1D.map((row, index) => GAUSS_1D.reduce((product, other, otherIndex) => (
    index === otherIndex ? product : product * (value - other.point) / (row.point - other.point)
  ), 1));
}
function orderGaussResults(rows) {
  if (!Array.isArray(rows) || rows.length !== 9) throw new TypeError('AXI_RECOVERY_REQUIRES_NINE_GAUSS_RESULTS');
  const byId = new Map();
  rows.forEach((row) => {
    if (byId.has(row?.pointId)) throw new TypeError(`AXI_RECOVERY_DUPLICATE_GAUSS_POINT:${row?.pointId}`);
    byId.set(row?.pointId, row);
  });
  return Array.from({ length: 9 }, (_, index) => {
    const pointId = `GP${index + 1}`;
    const row = byId.get(pointId);
    if (!row) throw new TypeError(`AXI_RECOVERY_MISSING_GAUSS_POINT:${pointId}`);
    COMPONENTS.forEach((component) => requireComponent(row, component));
    return row;
  });
}
function requireComponent(row, component) {
  const tensor = tensorOf(row);
  const value = Number(tensor?.[component]);
  if (!Number.isFinite(value)) throw new TypeError(`AXI_RECOVERY_INVALID_${component.toUpperCase()}:${row?.pointId}`);
  return value;
}
function tensorOf(row) { return row?.stress ?? row?.tensor; }
function requirePoint(point) {
  const r = Number(point?.r); const z = Number(point?.z);
  if (!Number.isFinite(r) || !Number.isFinite(z)) throw new TypeError('AXI_RECOVERY_INVALID_PHYSICAL_POINT');
  return { r, z };
}
function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`AXI_RECOVERY_INVALID_${label.toUpperCase()}`);
  return value;
}
