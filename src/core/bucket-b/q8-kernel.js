export const Q8_BUCKET_B_FORMULA_IDS = Object.freeze({
  SHAPE_FUNCTIONS: 'Q8_SERENDIPITY_SHAPE_FUNCTIONS_V1',
  GAUSS_QUADRATURE: 'Q8_FULL_3X3_GAUSS_QUADRATURE_V1',
  ENGINEERING_STRAIN_RECOVERY: 'Q8_GAUSS_POINT_ENGINEERING_STRAIN_RECOVERY_V1',
  IN_PLANE_STRESS_RECOVERY: 'Q8_GAUSS_POINT_IN_PLANE_STRESS_RECOVERY_V1',
});

const A = Math.sqrt(3 / 5);
export const GAUSS_1D = Object.freeze([
  Object.freeze({ point: -A, weight: 5 / 9, id: 'G1' }),
  Object.freeze({ point: 0, weight: 8 / 9, id: 'G2' }),
  Object.freeze({ point: A, weight: 5 / 9, id: 'G3' }),
]);
export const Q8_GAUSS_POINTS = Object.freeze(GAUSS_1D.flatMap((gx, i) => GAUSS_1D.map((gy, j) => Object.freeze({
  pointId: `GP${i * 3 + j + 1}`,
  xi: gx.point,
  eta: gy.point,
  weight: gx.weight * gy.weight,
}))));

export const Q8_CONTROL_POINTS = Object.freeze([
  [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [0, 0],
].map(([xi, eta], index) => Object.freeze({ pointId: `CP${index + 1}`, xi, eta })));

export function q8Shape(xi, eta) {
  const N = [
    -(1 - xi) * (1 - eta) * (1 + xi + eta) / 4,
    -(1 + xi) * (1 - eta) * (1 - xi + eta) / 4,
    -(1 + xi) * (1 + eta) * (1 - xi - eta) / 4,
    -(1 - xi) * (1 + eta) * (1 + xi - eta) / 4,
    (1 - xi * xi) * (1 - eta) / 2,
    (1 + xi) * (1 - eta * eta) / 2,
    (1 - xi * xi) * (1 + eta) / 2,
    (1 - xi) * (1 - eta * eta) / 2,
  ];
  const dNdXi = [
    (1 - eta) * (2 * xi + eta) / 4,
    (1 - eta) * (2 * xi - eta) / 4,
    (1 + eta) * (2 * xi + eta) / 4,
    (1 + eta) * (2 * xi - eta) / 4,
    -xi * (1 - eta),
    (1 - eta * eta) / 2,
    -xi * (1 + eta),
    -(1 - eta * eta) / 2,
  ];
  const dNdEta = [
    (1 - xi) * (xi + 2 * eta) / 4,
    -(1 + xi) * (xi - 2 * eta) / 4,
    (1 + xi) * (xi + 2 * eta) / 4,
    -(1 - xi) * (xi - 2 * eta) / 4,
    -(1 - xi * xi) / 2,
    -eta * (1 + xi),
    (1 - xi * xi) / 2,
    -eta * (1 - xi),
  ];
  return { N, dNdXi, dNdEta };
}

export function q8Map(nodes, xi, eta) {
  requireNodes(nodes);
  const { N, dNdXi, dNdEta } = q8Shape(xi, eta);
  let x = 0; let y = 0; let dxDxi = 0; let dyDxi = 0; let dxDeta = 0; let dyDeta = 0;
  for (let i = 0; i < 8; i += 1) {
    x += N[i] * nodes[i].x; y += N[i] * nodes[i].y;
    dxDxi += dNdXi[i] * nodes[i].x; dyDxi += dNdXi[i] * nodes[i].y;
    dxDeta += dNdEta[i] * nodes[i].x; dyDeta += dNdEta[i] * nodes[i].y;
  }
  const determinant = dxDxi * dyDeta - dxDeta * dyDxi;
  return { x, y, N, dNdXi, dNdEta, dxDxi, dyDxi, dxDeta, dyDeta, determinant };
}

export function q8BMatrix(nodes, xi, eta) {
  const mapped = q8Map(nodes, xi, eta);
  if (!(mapped.determinant > 0)) throw new RangeError(`Q8 Jacobian must be positive at (${xi}, ${eta}).`);
  const inv = 1 / mapped.determinant;
  const B = [new Array(16).fill(0), new Array(16).fill(0), new Array(16).fill(0)];
  for (let i = 0; i < 8; i += 1) {
    const dNdx = inv * (mapped.dyDeta * mapped.dNdXi[i] - mapped.dyDxi * mapped.dNdEta[i]);
    const dNdy = inv * (-mapped.dxDeta * mapped.dNdXi[i] + mapped.dxDxi * mapped.dNdEta[i]);
    B[0][2 * i] = dNdx;
    B[1][2 * i + 1] = dNdy;
    B[2][2 * i] = dNdy;
    B[2][2 * i + 1] = dNdx;
  }
  return { B, determinant: mapped.determinant };
}

export function constitutiveMatrix({ youngsModulus, poissonRatio, formulationProfile }) {
  const E = finitePositive(youngsModulus, 'youngsModulus');
  const nu = Number(poissonRatio);
  if (!Number.isFinite(nu) || nu <= -1 || nu >= 0.5) throw new RangeError('poissonRatio must be in (-1, 0.5).');
  if (formulationProfile === 'PLANE_STRESS') {
    const f = E / (1 - nu * nu);
    return [[f, f * nu, 0], [f * nu, f, 0], [0, 0, f * (1 - nu) / 2]];
  }
  if (formulationProfile === 'PLANE_STRAIN') {
    const f = E / ((1 + nu) * (1 - 2 * nu));
    return [[f * (1 - nu), f * nu, 0], [f * nu, f * (1 - nu), 0], [0, 0, f * (1 - 2 * nu) / 2]];
  }
  throw new TypeError(`Unsupported planar formulation profile: ${formulationProfile}`);
}

export function matrixVector(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

function requireNodes(nodes) {
  if (!Array.isArray(nodes) || nodes.length !== 8) throw new TypeError('Q8 requires exactly eight physical nodes.');
  nodes.forEach((node, index) => {
    if (!Number.isFinite(node?.x) || !Number.isFinite(node?.y)) throw new TypeError(`Invalid Q8 node ${index + 1}.`);
  });
}
function finitePositive(value, name) {
  const number = Number(value);
  if (!(number > 0) || !Number.isFinite(number)) throw new RangeError(`${name} must be finite and positive.`);
  return number;
}
