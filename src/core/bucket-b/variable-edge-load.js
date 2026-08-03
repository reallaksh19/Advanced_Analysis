export const LOAD_INTEGRATION_PROFILE_ID = 'Q8_QUADRATIC_EDGE_GAUSS_3_LOAD_INTEGRATION_V1';
export const VARIABLE_EDGE_LOAD_FORMULA_IDS = Object.freeze({
  TRACTION: 'Q8_VARIABLE_EDGE_TRACTION_CONSISTENT_LOAD_V1',
  PRESSURE: 'Q8_VARIABLE_EDGE_PRESSURE_CONSISTENT_LOAD_V1',
  RESULTANT: 'Q8_EDGE_LOAD_RESULTANT_AND_MOMENT_NORMALIZATION_V1',
});
const A = Math.sqrt(3 / 5);
const GAUSS = Object.freeze([[-A, 5 / 9], [0, 8 / 9], [A, 5 / 9]].map(([s, weight], i) => Object.freeze({ id: `EGP${i + 1}`, s, weight })));

export function integrateVariableEdgeLoad({ nodes, thickness = 1, tractionAt, pressureAt, momentOrigin = { x: 0, y: 0 } } = {}) {
  if (!Array.isArray(nodes) || ![2, 3].includes(nodes.length)) throw new TypeError('Boundary edge requires two or three nodes.');
  if ((typeof tractionAt === 'function') === (typeof pressureAt === 'function')) throw new TypeError('Provide exactly one of tractionAt or pressureAt.');
  const t = finitePositive(thickness, 'thickness');
  const forces = nodes.map(() => [0, 0]);
  const resultant = [0, 0];
  let moment = 0;
  let arcLength = 0;
  const gaussEvidence = [];
  for (const gp of GAUSS) {
    const { N, dNds } = edgeShape(gp.s, nodes.length);
    const geometry = edgeGeometry(nodes, N, dNds, gp.s);
    if (!(geometry.jacobian > 0)) throw new RangeError(`Degenerate edge Jacobian at s=${gp.s}.`);
    const traction = typeof tractionAt === 'function'
      ? requireVector(tractionAt(gp.s, geometry.x, geometry.y, geometry.outwardNormal, geometry.tangent), 'tractionAt')
      : (() => {
        const pressure = Number(pressureAt(gp.s, geometry.x, geometry.y));
        if (!Number.isFinite(pressure)) throw new TypeError('pressureAt must return a finite number.');
        return [-pressure * geometry.outwardNormal[0], -pressure * geometry.outwardNormal[1]];
      })();
    const scale = gp.weight * geometry.jacobian * t;
    arcLength += gp.weight * geometry.jacobian;
    resultant[0] += traction[0] * scale; resultant[1] += traction[1] * scale;
    moment += ((geometry.x - momentOrigin.x) * traction[1] - (geometry.y - momentOrigin.y) * traction[0]) * scale;
    N.forEach((shape, i) => {
      forces[i][0] += shape * traction[0] * scale;
      forces[i][1] += shape * traction[1] * scale;
    });
    gaussEvidence.push(Object.freeze({ ...geometry, pointId: gp.id, weight: gp.weight, traction: Object.freeze(traction), scale }));
  }
  const nodalResultant = forces.reduce((sum, row) => [sum[0] + row[0], sum[1] + row[1]], [0, 0]);
  return Object.freeze({
    loadIntegrationProfileId: LOAD_INTEGRATION_PROFILE_ID,
    arcLength,
    forces: Object.freeze(forces.map((row) => Object.freeze(row))),
    resultant: Object.freeze(resultant),
    moment,
    normalizationResidual: Object.freeze([nodalResultant[0] - resultant[0], nodalResultant[1] - resultant[1]]),
    gaussEvidence: Object.freeze(gaussEvidence),
  });
}

export function cosinePressureLaw({ amplitude, direction = [1, 0], center = { x: 0, y: 0 }, compressiveOnly = false } = {}) {
  const p0 = Number(amplitude); const unit = normalize(direction);
  if (!Number.isFinite(p0)) throw new TypeError('Cosine pressure amplitude must be finite.');
  return (_s, x, y) => {
    const radial = normalize([x - center.x, y - center.y]);
    const cosine = radial[0] * unit[0] + radial[1] * unit[1];
    return p0 * (compressiveOnly ? Math.max(0, cosine) : cosine);
  };
}

export function kirschTractionLaw({ sigma0, holeRadius, center = { x: 0, y: 0 } } = {}) {
  const s0 = Number(sigma0); const a = Number(holeRadius);
  if (!Number.isFinite(s0) || !(a > 0)) throw new TypeError('Kirsch traction requires finite sigma0 and positive holeRadius.');
  return (_s, x, y, normal) => {
    const dx = x - center.x; const dy = y - center.y; const r = Math.hypot(dx, dy);
    if (!(r >= a)) throw new RangeError('Kirsch traction is only defined at or outside the hole radius.');
    const theta = Math.atan2(dy, dx); const c2 = Math.cos(2 * theta); const s2 = Math.sin(2 * theta);
    const ar2 = (a * a) / (r * r); const ar4 = ar2 * ar2;
    const sigmaR = 0.5 * s0 * (1 - ar2) + 0.5 * s0 * (1 - 4 * ar2 + 3 * ar4) * c2;
    const sigmaTheta = 0.5 * s0 * (1 + ar2) - 0.5 * s0 * (1 + 3 * ar4) * c2;
    const tauRTheta = -0.5 * s0 * (1 + 2 * ar2 - 3 * ar4) * s2;
    const c = Math.cos(theta); const sn = Math.sin(theta);
    const sigmaX = sigmaR * c * c + sigmaTheta * sn * sn - 2 * tauRTheta * sn * c;
    const sigmaY = sigmaR * sn * sn + sigmaTheta * c * c + 2 * tauRTheta * sn * c;
    const tauXY = (sigmaR - sigmaTheta) * sn * c + tauRTheta * (c * c - sn * sn);
    return [sigmaX * normal[0] + tauXY * normal[1], tauXY * normal[0] + sigmaY * normal[1]];
  };
}

export function runCurvedEdgeLoadBenchmarks() {
  const r = 2; const arc = [{ x: r, y: 0 }, { x: r / Math.sqrt(2), y: r / Math.sqrt(2) }, { x: 0, y: r }];
  const constant = integrateVariableEdgeLoad({ nodes: [{ x: 0, y: 0 }, { x: 2, y: 0 }], thickness: 3, tractionAt: () => [5, -2] });
  const uniformPressure = integrateVariableEdgeLoad({ nodes: arc, pressureAt: () => 4 });
  const cosinePressure = integrateVariableEdgeLoad({ nodes: arc, pressureAt: cosinePressureLaw({ amplitude: 4, direction: [1, 0] }) });
  const kirsch = integrateVariableEdgeLoad({ nodes: arc, tractionAt: kirschTractionLaw({ sigma0: 100, holeRadius: 1 }) });
  return Object.freeze({
    benchmarkId: 'BKT-B-SH-Q8-CURVED-LOAD-001',
    cases: Object.freeze({ constant, uniformPressure, cosinePressure, kirsch }),
    accepted: [constant, uniformPressure, cosinePressure, kirsch].every((row) => Math.hypot(...row.normalizationResidual) <= 1e-10),
  });
}

function edgeShape(s, count) {
  if (count === 2) return { N: [(1 - s) / 2, (1 + s) / 2], dNds: [-0.5, 0.5] };
  return { N: [s * (s - 1) / 2, 1 - s * s, s * (s + 1) / 2], dNds: [s - 0.5, -2 * s, s + 0.5] };
}
function edgeGeometry(nodes, N, dNds, s) {
  let x = 0; let y = 0; let dxds = 0; let dyds = 0;
  nodes.forEach((node, i) => { x += N[i] * node.x; y += N[i] * node.y; dxds += dNds[i] * node.x; dyds += dNds[i] * node.y; });
  const jacobian = Math.hypot(dxds, dyds);
  const tangent = [dxds / jacobian, dyds / jacobian];
  return { s, x, y, jacobian, tangent: Object.freeze(tangent), outwardNormal: Object.freeze([tangent[1], -tangent[0]]) };
}
function normalize(v) { const x = Number(v?.[0]); const y = Number(v?.[1]); const n = Math.hypot(x, y); if (!(n > 0)) throw new TypeError('Direction must be nonzero.'); return [x / n, y / n]; }
function requireVector(v, name) { if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite)) throw new TypeError(`${name} must return [tx, ty].`); return [v[0], v[1]]; }
function finitePositive(value, name) { const n = Number(value); if (!(n > 0) || !Number.isFinite(n)) throw new TypeError(`${name} must be finite and positive.`); return n; }
