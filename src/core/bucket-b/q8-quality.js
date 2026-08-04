import { Q8_CONTROL_POINTS, Q8_GAUSS_POINTS, q8Map } from './q8-kernel.js';

export const Q8_QUALITY_PROFILE_ID = 'BKT_B_Q8_DETERMINANT_RATIO_QUALITY_V1';
export const DEFAULT_Q8_QUALITY_LIMITS = Object.freeze({
  minimumDeterminant: 0,
  minimumQJDeterminantRatio: 0.20,
  minimumScaledJacobian: 0.20,
  maximumAspectRatio: 10,
  maximumHotspotAspectRatio: 5,
  maximumMidsidePlacementResidual: 1e-9,
});

export function evaluateQ8Quality({ elementId, nodes, hotspot = false, boundaryMidsideTargets = {}, limits = DEFAULT_Q8_QUALITY_LIMITS } = {}) {
  const gauss = sample(nodes, Q8_GAUSS_POINTS);
  const control = sample(nodes, Q8_CONTROL_POINTS);
  const all = [...gauss, ...control];
  const determinants = all.map((row) => row.determinant);
  const minimumDetJAtGaussPoints = Math.min(...gauss.map((row) => row.determinant));
  const minimumDetJAtControlPoints = Math.min(...control.map((row) => row.determinant));
  const minimum = Math.min(...determinants);
  const maximum = Math.max(...determinants);
  const qJDeterminantRatio = maximum > 0 ? minimum / maximum : Number.NEGATIVE_INFINITY;
  const minimumScaledJacobian = Math.min(...all.map((row) => row.scaledJacobian));
  const aspectRatio = cornerAspectRatio(nodes);
  const midside = midsideResiduals(nodes, boundaryMidsideTargets);
  const maximumMidsidePlacementResidual = Math.max(0, ...midside.map((row) => row.residual));
  const effectiveAspectLimit = hotspot ? limits.maximumHotspotAspectRatio : limits.maximumAspectRatio;
  const failures = [];
  if (!(minimumDetJAtGaussPoints > limits.minimumDeterminant)) failures.push('NONPOSITIVE_GAUSS_POINT_JACOBIAN');
  if (!(minimumDetJAtControlPoints > limits.minimumDeterminant)) failures.push('NONPOSITIVE_CONTROL_POINT_JACOBIAN');
  if (qJDeterminantRatio < limits.minimumQJDeterminantRatio) failures.push('QJ_DETERMINANT_RATIO_BELOW_LIMIT');
  if (minimumScaledJacobian < limits.minimumScaledJacobian) failures.push('SCALED_JACOBIAN_BELOW_LIMIT');
  if (aspectRatio > effectiveAspectLimit) failures.push('ASPECT_RATIO_ABOVE_LIMIT');
  if (maximumMidsidePlacementResidual > limits.maximumMidsidePlacementResidual) failures.push('MIDSIDE_PLACEMENT_RESIDUAL_ABOVE_LIMIT');
  return Object.freeze({
    qualityProfileId: Q8_QUALITY_PROFILE_ID,
    elementId,
    minimumDetJAtGaussPoints,
    minimumDetJAtControlPoints,
    qJDeterminantRatio,
    minimumScaledJacobian,
    aspectRatio,
    midsidePlacementResidual: maximumMidsidePlacementResidual,
    samples: Object.freeze(all),
    midsideEvidence: Object.freeze(midside),
    limits: Object.freeze({ ...limits, maximumAspectRatio: effectiveAspectLimit }),
    failures: Object.freeze(failures),
    accepted: failures.length === 0,
  });
}

export function detectDuplicateInterfaceNodes(nodeRows, tolerance = 1e-12) {
  const duplicates = [];
  for (let i = 0; i < nodeRows.length; i += 1) {
    for (let j = i + 1; j < nodeRows.length; j += 1) {
      if (Math.hypot(nodeRows[i].x - nodeRows[j].x, nodeRows[i].y - nodeRows[j].y) <= tolerance
        && nodeRows[i].nodeId !== nodeRows[j].nodeId) {
        duplicates.push(Object.freeze({ leftNodeId: nodeRows[i].nodeId, rightNodeId: nodeRows[j].nodeId }));
      }
    }
  }
  return Object.freeze(duplicates);
}

function sample(nodes, points) {
  return points.map((point) => {
    const mapped = q8Map(nodes, point.xi, point.eta);
    const a = Math.hypot(mapped.dxDxi, mapped.dyDxi);
    const b = Math.hypot(mapped.dxDeta, mapped.dyDeta);
    const denominator = a * b;
    return Object.freeze({
      pointId: point.pointId,
      xi: point.xi,
      eta: point.eta,
      determinant: mapped.determinant,
      scaledJacobian: denominator > 0 ? mapped.determinant / denominator : Number.NEGATIVE_INFINITY,
    });
  });
}
function cornerAspectRatio(nodes) {
  const corners = nodes.slice(0, 4);
  const lengths = corners.map((node, i) => Math.hypot(node.x - corners[(i + 1) % 4].x, node.y - corners[(i + 1) % 4].y));
  return Math.max(...lengths) / Math.min(...lengths);
}
function midsideResiduals(nodes, targets) {
  const pairs = [[0, 1, 4], [1, 2, 5], [2, 3, 6], [3, 0, 7]];
  return pairs.map(([a, b, m], edgeIndex) => {
    const targetFn = targets[edgeIndex];
    const target = typeof targetFn === 'function'
      ? targetFn(nodes[a], nodes[b])
      : { x: (nodes[a].x + nodes[b].x) / 2, y: (nodes[a].y + nodes[b].y) / 2 };
    return Object.freeze({ edgeIndex, nodeIndex: m, target, residual: Math.hypot(nodes[m].x - target.x, nodes[m].y - target.y) });
  });
}
