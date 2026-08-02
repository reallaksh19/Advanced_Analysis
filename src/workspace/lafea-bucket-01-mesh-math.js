export const BOUNDARY_SAMPLES_PER_EDGE = 16;
export const JACOBIAN_SAMPLE_DIVISIONS = 8;

const EDGE_GAUSS = Object.freeze([
  Object.freeze({ point: -0.906179845938664, weight: 0.236926885056189 }),
  Object.freeze({ point: -0.538469310105683, weight: 0.478628670499366 }),
  Object.freeze({ point: 0, weight: 0.568888888888889 }),
  Object.freeze({ point: 0.538469310105683, weight: 0.478628670499366 }),
  Object.freeze({ point: 0.906179845938664, weight: 0.236926885056189 }),
]);

export const AREA_POINTS = Object.freeze([
  Object.freeze({ xi: 1 / 6, eta: 1 / 6, weight: 1 / 6 }),
  Object.freeze({ xi: 2 / 3, eta: 1 / 6, weight: 1 / 6 }),
  Object.freeze({ xi: 1 / 6, eta: 2 / 3, weight: 1 / 6 }),
]);

export function t6Jacobian(nodes, xi, eta) {
  const { dNdXi, dNdEta } = t6Shape(xi, eta);
  let dxDxi = 0; let dyDxi = 0; let dxDeta = 0; let dyDeta = 0;
  for (let index = 0; index < 6; index += 1) {
    dxDxi += dNdXi[index] * nodes[index].x;
    dyDxi += dNdXi[index] * nodes[index].y;
    dxDeta += dNdEta[index] * nodes[index].x;
    dyDeta += dNdEta[index] * nodes[index].y;
  }
  return dxDxi * dyDeta - dxDeta * dyDxi;
}

export function edgePoint(nodes, t) {
  const weights = [
    (1 - t) * (1 - 2 * t),
    4 * t * (1 - t),
    t * (2 * t - 1),
  ];
  return {
    x: weights.reduce((sum, value, index) => sum + value * nodes[index].x, 0),
    y: weights.reduce((sum, value, index) => sum + value * nodes[index].y, 0),
  };
}

export function edgeLength(nodes) {
  return EDGE_GAUSS.reduce((sum, point) => {
    const t = (point.point + 1) / 2;
    const derivative = edgeDerivative(nodes, t);
    return sum + point.weight * Math.hypot(derivative.x, derivative.y) / 2;
  }, 0);
}

export function edgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function pointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function edgeDerivative(nodes, t) {
  const weights = [4 * t - 3, 4 - 8 * t, 4 * t - 1];
  return {
    x: weights.reduce((sum, value, index) => sum + value * nodes[index].x, 0),
    y: weights.reduce((sum, value, index) => sum + value * nodes[index].y, 0),
  };
}

function t6Shape(xi, eta) {
  return {
    dNdXi: [
      4 * xi + 4 * eta - 3, 4 * xi - 1, 0,
      4 * (1 - 2 * xi - eta), 4 * eta, -4 * eta,
    ],
    dNdEta: [
      4 * xi + 4 * eta - 3, 0, 4 * eta - 1,
      -4 * xi, 4 * xi, 4 * (1 - xi - 2 * eta),
    ],
  };
}
